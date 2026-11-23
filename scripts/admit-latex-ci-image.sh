#!/usr/bin/env bash
set -euo pipefail

unavailable() { printf '%s\n' 'Approved compiler artifact configuration is unavailable.' >&2; exit 2; }
failed() { printf '%s\n' 'Compiler artifact transfer or identity check failed.' >&2; exit 1; }

repository=${GITHUB_REPOSITORY:-}
[[ "$repository" =~ ^[a-zA-Z0-9_.-]+/[a-zA-Z0-9_.-]+$ ]] || unavailable
repository=$(printf '%s' "$repository" | tr '[:upper:]' '[:lower:]')
expected_repository="ghcr.io/${repository}-latex-worker"
ref=${LATEX_CI_IMAGE_REF:-}
image_id=${LATEX_CI_IMAGE_ID:-}
manifest_digest=${ref#"$expected_repository"@}

[[ ${LATEX_CI_ARTIFACT_AUTHORIZATION:-} == 'reviewed-compiler-runtime' ]] || unavailable
[[ "$ref" == "$expected_repository@$manifest_digest" && "$manifest_digest" =~ ^sha256:[a-f0-9]{64}$ ]] || unavailable
[[ "$image_id" =~ ^sha256:[a-f0-9]{64}$ ]] || unavailable
[[ -n ${LATEX_CI_READ_TOKEN:-} && -n ${GITHUB_ACTOR:-} && -d ${RUNNER_TEMP:-} && -f ${GITHUB_ENV:-} ]] || unavailable

umask 077
registry_config=$(mktemp -d "$RUNNER_TEMP/resumide-latex-registry.XXXXXXXX")
# Docker needs its credential file only while pulling the immutable artifact.
trap 'docker --config "$registry_config" logout ghcr.io >/dev/null 2>&1 || true' EXIT
printf '%s\n' "$LATEX_CI_READ_TOKEN" |
  docker --config "$registry_config" login ghcr.io --username "$GITHUB_ACTOR" --password-stdin >/dev/null 2>&1 || failed
unset LATEX_CI_READ_TOKEN
docker --config "$registry_config" image pull --quiet --platform linux/arm64 "$ref" >/dev/null 2>&1 || failed

observed=$(docker --config "$registry_config" image inspect --format '{{.Id}} {{.Os}}/{{.Architecture}}' "$ref" 2>/dev/null) || failed
[[ "$observed" == "$image_id linux/arm64" ]] || failed
printf 'LATEX_TEST_IMAGE=%s\n' "$image_id" >> "$GITHUB_ENV"

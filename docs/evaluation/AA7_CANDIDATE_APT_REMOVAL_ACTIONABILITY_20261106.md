# Exact APT component removal preflight

Status: read-only preflight, 2026-11-06. No package, source, image, snapshot or configuration was changed. This is a proposal for coordinator review, not approval to bypass package-manager checks.

[The machine preflight](AA7_CANDIDATE_APT_REMOVAL_PREFLIGHT_20261106.json) independently binds candidate `sha256:19d2a00a2a830173bf1fae07dddfcac7d54be3047e58b276af031d3cbd1018ac`. A bounded trusted metadata audit ran as non-root in the read-only, networkless worker image with no host mounts, forwarded secrets or candidate data. Its exact container was verified absent.

## Dependency and ownership evidence

The candidate has 190 installed Debian packages. The installed targets are `apt` and `libapt-pkg6.0`, both version `2.6.1`, architecture arm64. Neither target has an `Essential` or `Protected` field in the captured dpkg status. APT has priority `required`; the library has priority `optional`. Absence of those two fields does not override other package-manager safety rules.

Across all installed `Depends` and `Pre-Depends` metadata, the only reference to either target is APT's dependency on `libapt-pkg6.0`. No other installed package requires them through those fields. The audit checked package-owned paths, resolved aliases and the exact compiler read-closure manifest. Neither target owns any file in that closure. The matching closure hash is `abf9544cad5aa54ab023c4bb597c01b44f7a4bdb9435eab867d17b711065e0c8`.

The normal reviewed worker entrypoint compiles with confined XeTeX/conversion and inspects PDFs using Python and Poppler; it does not invoke APT. These ownership/dependency observations support evaluating removal from an immutable final runtime, but do not replace revalidation of that new image.

## Native solver result and safety warning

The audit ran only:

```text
apt-get --simulate -o Debug::NoLocking=true --no-auto-remove purge apt libapt-pkg6.0
```

The simulation exited 0 and planned exactly two purges: `apt` and `libapt-pkg6.0`. It proposed no upgrade, installation or additional removal. It listed other now-unneeded packages as informational suggestions; no autoremove was requested or performed.

However, the same native simulation explicitly warned that essential packages would be removed, naming APT and its library dependency. That warning is retained verbatim in the machine preflight. The audit did not capture all additional policy fields, so it does not assert why APT applies this guard despite absent dpkg `Essential`/`Protected` fields. A successful simulation is therefore not proof that a noninteractive real `apt-get -y purge` would succeed or that the warning can be ignored. No `--allow-remove-essential`, `--force-depends` or other force flag is proposed.

## Optional future composition decision

If this optional composition change is revisited, first inspect APT's additional installed policy fields and perform a native `dpkg --no-act --purge apt libapt-pkg6.0` check in the same read-only audit tier. A direct, explicitly targeted dpkg purge is a possible package-managed final-runtime composition change if native dependency, essential and protected checks permit it; it must not be used to conceal an unresolved dependency or silently override the observed APT warning. No such check or purge was performed in this preflight.

If the coordinator accepts that evidence and legitimate removal, the narrow Dockerfile candidate would perform only a package-managed purge of these two named components after all dependency installation, before generating the final package lock. It must preserve dpkg and all remaining package/copyright metadata, avoid autoremove, keep the pinned snapshot/base and retain historical image/scan receipts. Do not manually unlink binaries, libraries, status records or license files to change scanner results.

The separate candidate must then demonstrate exactly the intended package delta, unchanged compiler closure/capabilities, parser import/version, successful runtime/PDF/example/rollback checks and a new same-database scan. Removing APT components would remove those installed matches; it would not establish that version `2.6.1` was patched or clear the other critical/high findings. Until that review and verification, current candidate `19d2…` remains unchanged.

The coordinator's completion audit subsequently determined that AA070-AA075 private functional requirements are complete and this optional APT removal is not a missing feature. No further audit, source change, build or purge is authorized by this report. The observed package-manager guard must not be bypassed merely to reduce scanner counts. Formal security/CVE, legal, assistive-technology and release decisions remain open and separate.

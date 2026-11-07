# Poppler-local dependency transport review

2026-11-06. Independent reviewer aa7_validation. Status: frozen v2 source/neutral review PASS. Recommend one bounded retry after the coordinator records the explicit exception below. No source build, archive transfer, APT installation, container, database or provider action has been performed by this review. The80-HIGH matrix remains frozen.

## Established diagnostic basis

The retained native APT diagnostic identifies511 unique selected archives,285,565,892 total bytes and23,285,344 bytes for the largest file. Both original guards correctly reject this legitimate cohort: the generic helper admits at most256 records and268,435,456 total bytes. There are no duplicate filenames or archives above the unchanged33,554,432-byte per-file limit.

The diagnostic dependency-plan JSON is retained in the backend worktree at `tasks/agent-handoffs/2026-11-06-aa7-poppler-plan-diagnostic/dependency-plan.json`, SHA256 `67de6f08c980cba97ee52d514568cee5a8733f1f9fa84d9e0d315a6a6432c007`. The raw plan SHA256 is `11c262fe918847f523c19ae57c5fdf69e9483246a5eec2a963b974d53b2134fd`. The unchanged shared helper SHA256 is `8b831a59cd8f2f89925b755973c1ef764daa2722207bfd24742114c67d31ded8`.

## Required explicit exception

CONSTRAINTS section6 permits reviewed exceptions with a named owner, rationale, evidence and expiry; it does not permit silent widening. Recommended engineering owner: Primary coordinator. The exception should cover only this Poppler build's exact frozen arm64/November6 snapshot/base/target/semantic-plan lock and one approved retry after independent review.

The rationale is the measured dependency requirement of unchanged original packaging, including both documentation build dependencies. Supersede only the Poppler-local count/aggregate envelope using exact511 membership and285,565,892 bytes. Preserve the shared helper, per-file32MiB limit, four transfer workers,300-second transfer deadline, official HTTPS mapping, signed APT selection, byte/hash verification and normal APT revalidation. Do not split the dependency request to evade a guard. Preserve native tests, resource floors, product/runtime limits, security rules and formal acceptance gates.

Expire after that approved attempt or any change to the plan lock, base, snapshot, targets, wrapper or shared helper, whichever comes first. Before further use/adoption, review actual transfer/resource/APT receipts and failure evidence. This supplies engineering ownership only; it does not represent workspace-owner, security-owner or release approval and authorizes no execution by itself.

## Concrete wrapper and neutral checks

Reviewed `apt_transport_poppler.py`, SHA256 `f9b8b632348510d34a04f5ef305bb3ce4d0275ef88cb3dda1569bb80aa78275c`, and `dependency-plan.lock.json`, SHA256 `44bddc307273b684a4830b10bd5ff2d94dada706d3972dbb5b0f12597217af01`. The validator binds both exact lock-file bytes and the canonical lock object. It checks the39 fixed targets,511 records, exact aggregate size, record fields/types and unique filenames. Decoded filenames supply package/version/architecture identities; every normalized member must equal the fixed sorted lock. Record order is irrelevant; target order is fixed.

Before native plan selection, the main path checks shared-helper, sources-list, keyring and both signed-InRelease hashes. It then uses the unchanged helper's parser/fetch functions; validation precedes cache creation and transfer. Four workers, the300-second deadline and32MiB per-file bound remain. A drift cannot simply replace both plan and lock: the immutable canonical lock hash rejects that change. No generic larger-plan allowance was added to the shared helper.

Independent neutral tests pass24 cases, actual exit0. They accept the original diagnostic records and reversed record order; reject empty/missing/extra/duplicate members, package/version/architecture/URI/date/URL/hash/size drift, compensating per-record sizes with unchanged total, invalid types/fields/targets and a forged lock plus plan. The tests invoke only `validate_plan`; capture/main/fetch/APT and native sources are never called. All four input hashes remain stable.

## Frozen integration review

The complete lock was independently rederived from the diagnostic records, including decoded package/version/architecture identities, and matches all511 selected records and285,565,892 bytes. Signed metadata/keyring and changed context files are bound. Record order may differ only because the complete semantic set remains identical; all other drift is rejected.

All51 v2 review files and22 context files match their size/hash manifests. All41 original v1 files and the shared helper remain unchanged. `Dockerfile.plan-lock` invokes the wrapper exactly once in build-dependencies. The subsequent normal APT install command is byte-identical to v1, as are every later native build, installation, probe and artifact stage. The installation-stage helper therefore keeps its original256-file/256MiB guard. The new Dockerfile-specific ignore file admits only the explicit public build context; actual BuildKit transfer remains execution evidence to collect.

The backend's separate26-case neutral receipt also records no APT/network/compiler activity. Its positive/negative cases were reviewed; the independent24-case result remains separate. No concrete defect remains in this v2 source proposal. Root owns the exception, exact host command and further execution decision. Keep the previous final-host export acceptance gates:256MiB total output and64MiB selected DEBs, plus the9GiB preflight/3GiB disk floor. All native tests, ABI/consumer/parity checks and eventual complete worker acceptance remain unchanged and unexecuted.

## Evidence binding

| Artifact | SHA256 |
| --- | --- |
| Frozen v2 review manifest | `ef124759f7e4e69ea139a8d314e7a5ad84024cde250979ce31b99f60077a2f57` |
| Frozen v2 context manifest | `03c89f229006ba898bf58e2b1e1c6a43f735f56ab77c8f95e389a0ec41b16581` |
| Alternate Dockerfile | `33c0b4e66d10e1606a3a9c6ecb6d096b9bf309afd0642c5440967af6083f3947` |
| Own24-case script | `1b86074847300099a0e796c65531f2f35e12d466168cd50ba58d6449a81bb228` |
| Own24-case receipt | `1271c636d1e11c38f9916b00e5eb5fa15d0067ef0607d0e94d799890c932de65` |
| Own static comparison receipt | `2607f1c5583cfc12dc84084e950d839b6ca589ca3131586656494a6a32649d78` |
| Backend26-case receipt | `487fd81f0d90a7e6979b2a6f6e1a75f7b2ef11aa05836901e3ae7ffa9c1a6a24` |

Own static receipt `2026-11-06-aa7-poppler-transport-static.json` records the complete manifest/diagnostic/Dockerfile comparisons. No existing failed build or diagnostic receipt was changed. The transport envelope is explicitly larger; only the generic helper and production/runtime limits are unchanged. This review supplies engineering concurrence, not native execution proof or owner/security/release acceptance.

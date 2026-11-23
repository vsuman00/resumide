import {
  createBackupManifest,
  verifyRestoredSnapshot,
} from "../app/lib/server/backup-restore";

const backup = createBackupManifest({
  createdAt: "2026-09-11T00:00:00.000Z",
  records: [
    {
      table: "resumes",
      id: "restore-resume-1",
      ownerId: "restore-user-1",
      checksum: "resume",
    },
    {
      table: "analyses",
      id: "restore-analysis-1",
      ownerId: "restore-user-1",
      checksum: "analysis",
    },
  ],
  objects: [
    {
      storageKey: "organizations/restore-org/resumes/restore-resume-1/v1.pdf",
      checksum: "pdf",
    },
  ],
});
const result = verifyRestoredSnapshot(backup, structuredClone(backup));
process.stdout.write(
  JSON.stringify({ mode: "synthetic-fixture", ...result }) + "\n",
);
if (!result.ok) process.exitCode = 1;

// These are real temporary-journal scenarios with synthetic control-plane/checkpoint
// evidence. They do not inspect a provider backup or activate production adoption.
const { mkdtemp, realpath, chmod, rm } = await import("node:fs/promises");
const { join } = await import("node:path");
const { tmpdir } = await import("node:os");
const { RestoreFloorStore } = await import("../app/lib/server/restore-floor");
const { RestoreAdmissionController } =
  await import("../app/lib/server/restore-admission");
const directory = await realpath(
  await mkdtemp(join(tmpdir(), "resumide-restore-synthetic-")),
);
try {
  await chmod(directory, 0o700);
  const floor = new RestoreFloorStore(directory);
  await floor.bootstrap();
  let committedGeneration = "0",
    activeFence = "0",
    nativeTransitions = 0;
  const instanceId = "synthetic-restore-instance";
  const authority: import("../app/lib/server/restore-admission").TrustedRestoreAuthority =
    {
      async quarantine(call) {
        if (
          call.signal.aborted ||
          (await floor.read()).fence !== call.state.fence
        )
          throw Error("Synthetic fence refused");
        activeFence = call.state.fence;
        return {
          schemaVersion: "restore-fence/1.0.0",
          generation: call.generation,
          revision: call.state.revision,
          fence: activeFence,
          instanceId,
        };
      },
      async transition(call) {
        if (
          call.signal.aborted ||
          activeFence !== call.state.fence ||
          (await floor.read()).generation !== call.generation
        )
          throw Error("Synthetic transition refused");
        nativeTransitions++;
        committedGeneration = call.generation;
      },
      async inspect(call) {
        return {
          schemaVersion: "restore-outcome/1.0.0",
          generation: committedGeneration,
          revision: call.state.revision,
          fence: activeFence,
          instanceId,
          outcome: "committed",
          guardVersion: "restore-admission-guards/1.0.0",
        };
      },
      async inspectCandidate(call) {
        if (call.candidate !== "synthetic-pre-clock-backup")
          throw Error("Unknown synthetic backup");
        return {
          schemaVersion: "restore-candidate/1.0.0",
          generation: "0",
          revision: call.state.revision,
          fence: activeFence,
          instanceId,
          guardVersion: "restore-admission-guards/1.0.0",
        };
      },
      async reopen(call) {
        if (
          call.signal.aborted ||
          (await floor.read()).revision !== call.state.revision ||
          activeFence !== call.state.fence ||
          committedGeneration !== call.generation
        )
          throw Error("Synthetic open refused");
        return {
          schemaVersion: "restore-open/1.0.0",
          generation: committedGeneration,
          revision: call.state.revision,
          fence: activeFence,
          instanceId,
        };
      },
    };
  const controller = new RestoreAdmissionController(floor, authority);
  const ready = await controller.transition();
  let oldBackupDenied = false;
  try {
    await controller.admitRestoredCandidate("synthetic-pre-clock-backup");
  } catch {
    oldBackupDenied = true;
  }
  const quarantined = await floor.read();
  const floorOk =
    ready.generation === "1" &&
    oldBackupDenied &&
    quarantined.phase === "quarantined" &&
    nativeTransitions === 1;
  process.stdout.write(
    JSON.stringify({
      mode: "synthetic-floor-fixture",
      ok: floorOk,
      oldBackupDenied,
      nativeTransitions,
    }) + "\n",
  );
  if (!floorOk) process.exitCode = 1;
} finally {
  await rm(directory, { recursive: true, force: true });
}

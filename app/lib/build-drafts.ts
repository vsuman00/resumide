// Browser-only draft storage for /build. Every storage access can throw (private mode, quota).
export const BUILD_DRAFT_KEY = "resumide.build.draft.v1";
const MAX_BYTES = 49_152;
const MAX_SNAPSHOTS = 5;
const SNAPSHOT_GAP_MS = 60_000;

export type BuildDraft = { source: string; savedAt: number };
type Stored = BuildDraft & { snapshots: BuildDraft[] };

const fits = (source: string) =>
  new TextEncoder().encode(source).byteLength <= MAX_BYTES;

const isDraft = (v: unknown): v is BuildDraft =>
  !!v &&
  typeof (v as BuildDraft).source === "string" &&
  Number.isFinite((v as BuildDraft).savedAt) &&
  fits((v as BuildDraft).source);

function read(storage: Storage | null): Stored | null {
  try {
    const raw = storage?.getItem(BUILD_DRAFT_KEY);
    if (!raw) return null;
    const data: unknown = JSON.parse(raw);
    if (!isDraft(data)) return null;
    const raws = (data as { snapshots?: unknown }).snapshots;
    const snapshots = Array.isArray(raws)
      ? raws.filter(isDraft).slice(0, MAX_SNAPSHOTS)
      : [];
    return { source: data.source, savedAt: data.savedAt, snapshots };
  } catch {
    return null;
  }
}

export function loadBuildDraft(storage: Storage | null): BuildDraft | null {
  const d = read(storage);
  return d && { source: d.source, savedAt: d.savedAt };
}

export function listBuildSnapshots(storage: Storage | null): BuildDraft[] {
  return read(storage)?.snapshots ?? [];
}

export function saveBuildDraft(
  storage: Storage | null,
  source: string,
  now: number,
): void {
  if (!fits(source)) return;
  const snapshots = read(storage)?.snapshots ?? [];
  const newest = snapshots[0];
  const next =
    newest && now - newest.savedAt < SNAPSHOT_GAP_MS
      ? snapshots
      : [{ source, savedAt: now }, ...snapshots].slice(0, MAX_SNAPSHOTS);
  try {
    storage?.setItem(
      BUILD_DRAFT_KEY,
      JSON.stringify({ source, savedAt: now, snapshots: next }),
    );
  } catch {
    /* quota or blocked storage: the draft is simply not saved */
  }
}

export const BUILD_ONBOARDED_KEY = "resumide.build.onboarded.v1";
export function isBuildOnboarded(storage: Storage | null): boolean {
  try {
    return storage?.getItem(BUILD_ONBOARDED_KEY) === "1";
  } catch {
    return true; // Blocked storage: never trap the user in a repeating dialog.
  }
}
export function setBuildOnboarded(
  storage: Storage | null,
  done: boolean,
): void {
  try {
    if (done) storage?.setItem(BUILD_ONBOARDED_KEY, "1");
    else storage?.removeItem(BUILD_ONBOARDED_KEY);
  } catch {
    /* blocked storage: onboarding simply shows again next visit */
  }
}

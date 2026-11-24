// One-shot, in-memory handoff from Build to the upload form. Nothing is sent until
// the user submits the normal upload form with its own consent.
let pending: File | null = null;
export function setPendingUpload(file: File): void {
  pending = file;
}
export function takePendingUpload(): File | null {
  const file = pending;
  pending = null;
  return file;
}

export const INACTIVE_DELETION_STATUSES = ["failed", "cancelled"] as const;

export function isBlockingDeletionRequest(request: {
  kind: unknown;
  status: unknown;
}): boolean {
  return (
    request.kind === "deletion" &&
    !INACTIVE_DELETION_STATUSES.some((status) => status === request.status)
  );
}

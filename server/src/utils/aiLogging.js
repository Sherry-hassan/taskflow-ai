// FR-125: logs only artifact IDs, requester, timestamp, and a non-sensitive
// category — rawOutput and prompt content are never passed to this function,
// let alone logged by it. This is an explicit allow-list, not a filter applied
// to an arbitrary error object, so there's nothing for a caller to accidentally
// pass through.
export function logAiFailure({ category, artifactId = null, requestedBy = null }) {
  console.error(
    'AI failure:',
    JSON.stringify({
      category,
      artifactId,
      requestedBy,
      timestamp: new Date().toISOString(),
    }),
  );
}

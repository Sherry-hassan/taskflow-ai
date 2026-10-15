// Mirrors aiLogging.js's/errorLogging.js's pattern: an explicit allow-list,
// never a free-form error object. `category`/`kind` are both closed,
// non-sensitive enums — there is no parameter here for a caller to
// accidentally pass a recipient address, token, link, or raw provider error
// through. (FR-125's sanitized-logging discipline, extended to email
// delivery, same as it already was to AI failures and general app errors.)
export function logEmailDeliveryFailure({ category, kind }) {
  console.error(
    'Email delivery failed:',
    JSON.stringify({
      category,
      kind,
      timestamp: new Date().toISOString(),
    }),
  );
}

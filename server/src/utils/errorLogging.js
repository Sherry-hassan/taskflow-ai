// FR-125's sanitized-logging discipline, extended from AI failures (see
// aiLogging.js) to general application error logging (implementation-plan.md
// v0.2 §9 — "mandatory, before any production deployment"). Logs only an
// error's name/class, the request's method and path, and a status code — an
// explicit allow-list, never the error's own message or stack, which could
// echo request content (a thrown validation error, a wrapped provider error,
// etc.) into the logs.
export function logAppError({ name, method, path, statusCode }) {
  console.error(
    'Unhandled application error:',
    JSON.stringify({
      name,
      method,
      path,
      statusCode,
      timestamp: new Date().toISOString(),
    }),
  );
}

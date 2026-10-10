// Express 4 does not automatically forward a rejected promise from an async route
// handler to the error-handling middleware — without this wrapper, an unexpected
// error inside an async controller would hang the request instead of producing a
// 500 response.
export function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

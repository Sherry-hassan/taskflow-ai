import mongoose from 'mongoose';

// Fails fast (default driver timeout is 30s+) and, on failure, reports only an
// allow-listed set of connection facts (host, port, db name, replicaSet option)
// instead of the driver's own error message/stack — same sanitized-logging
// discipline as errorLogging.js, since a connection string can carry credentials.
export async function connectDb(uri, { serverSelectionTimeoutMS = 10_000 } = {}) {
  let parsed;
  try {
    parsed = new URL(uri);
  } catch {
    parsed = null;
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS });
  } catch (cause) {
    const diagnostics = parsed
      ? {
          host: parsed.hostname,
          port: parsed.port || '(default)',
          dbName: parsed.pathname.replace(/^\//, '') || '(none)',
          replicaSet: parsed.searchParams.get('replicaSet') || '(none)',
        }
      : { host: '(unparseable MONGODB_URI)' };
    const message = `Could not reach MongoDB: ${JSON.stringify(diagnostics)}. Is mongod running as a replica set at this host/port?`;
    const err = new Error(message);
    err.name = 'MongoConnectionError';
    err.cause = cause;
    throw err;
  }
}

export async function disconnectDb() {
  await mongoose.disconnect();
}

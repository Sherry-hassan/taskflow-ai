import { createServer } from './createServer.js';
import { connectDb } from './db/connection.js';
import { startSummaryScheduler } from './services/summaryScheduler.js';

const port = process.env.PORT || 3001;

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }
  await connectDb(mongoUri);
  // FR-071/104: the real process also runs the weekly scheduled-summary job.
  // Never started by createApp()/createServer() (used by every test) — only
  // here, for the real server process.
  await startSummaryScheduler();

  const { httpServer } = createServer();
  httpServer.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

main().catch((err) => {
  // err.message is safe to log only for our own MongoConnectionError (connection.js
  // builds it from an explicit field allow-list) — any other error's message/stack
  // could echo request content or the raw connection string, so stays unlogged,
  // matching logAppError's sanitized-logging discipline.
  if (err.name === 'MongoConnectionError') {
    console.error('Failed to start server:', err.message);
  } else {
    console.error('Failed to start server:', err.name || 'Error');
  }
  process.exitCode = 1;
});

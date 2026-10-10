import { createApp } from './app.js';
import { connectDb } from './db/connection.js';

const port = process.env.PORT || 3001;

async function main() {
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }
  await connectDb(mongoUri);

  const app = createApp();
  app.listen(port, () => {
    console.log(`Server listening on port ${port}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exitCode = 1;
});

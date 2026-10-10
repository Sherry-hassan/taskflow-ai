import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';

// system-design.md §1 / test-strategy.md §2: multi-document transactions require a
// replica set — a standalone mongod does not support them. API/Integration tests
// use a real, replica-set-enabled MongoDB instance, not a mock.
//
// Locally, set MONGOMS_SYSTEM_BINARY to an existing mongod binary to avoid a
// network download (mongodb-memory-server supports this env var natively); in CI,
// leaving it unset falls back to mongodb-memory-server's own download.
let replSet;

export async function startTestDb() {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  const uri = replSet.getUri();
  await mongoose.connect(uri);
}

export async function stopTestDb() {
  await mongoose.disconnect();
  if (replSet) {
    await replSet.stop();
    replSet = undefined;
  }
}

export async function clearTestDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

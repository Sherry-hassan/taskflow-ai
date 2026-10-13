import { Agenda } from 'agenda';
import { MongoBackend } from '@agendajs/mongo-backend';
import mongoose from 'mongoose';
import { processScheduledSummaryJob } from './summaryService.js';

// Design decision D2 (system-design.md §10): Agenda, a MongoDB-backed job
// scheduler, reusing the existing Mongoose connection rather than introducing
// a new infrastructure dependency (Redis/BullMQ) for v1.
//
// Deliberately NOT started by createApp()/createServer() — those are used by
// every Supertest-based test, which must never have a real weekly scheduler
// ticking in the background. Only index.js (the real process) starts this.
export const SCHEDULED_SUMMARY_JOB_NAME = 'generate-weekly-project-summaries';

// FR-104: every Monday 00:00 UTC — the PRD's stated default cadence.
const WEEKLY_CRON = '0 0 * * 1';

let agendaInstance;

export function createSummaryAgenda() {
  const agenda = new Agenda({
    backend: new MongoBackend({ mongo: mongoose.connection.db, collection: 'agendaJobs' }),
  });
  agenda.define(SCHEDULED_SUMMARY_JOB_NAME, async () => {
    await processScheduledSummaryJob();
  });
  return agenda;
}

export async function startSummaryScheduler() {
  agendaInstance = createSummaryAgenda();
  await agendaInstance.start();
  await agendaInstance.every(WEEKLY_CRON, SCHEDULED_SUMMARY_JOB_NAME, undefined, { timezone: 'UTC' });
  return agendaInstance;
}

export async function stopSummaryScheduler() {
  if (agendaInstance) {
    await agendaInstance.stop();
    agendaInstance = undefined;
  }
}

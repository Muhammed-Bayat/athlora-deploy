import 'dotenv/config';
import { createServer } from 'node:http';
import { createApp } from './app.js';
import { attachRealtimeServer, notifySessionInvalidated } from './realtime/index.js';
import { reconcileAccountDeletions } from './services/accounts.js';
import { reconcileEventReminders } from './services/reminders.js';
import { processSessionFinalizationJobs } from './services/sessionFinalizationJobs.js';

const port = Number(process.env.PORT ?? 4000);

function reconcile(): void {
  void reconcileAccountDeletions().catch((error: unknown) => {
    console.error('Account deletion reconciliation failed', error);
  });
  void reconcileEventReminders().catch((error: unknown) => {
    console.error('Event reminder reconciliation failed', error);
  });
  void processSessionFinalizationJobs()
    .then((job) => {
      if (job?.status === 'completed') notifySessionInvalidated(job.eventId, job.sessionId);
    })
    .catch((error: unknown) => {
      console.error('Session finalization failed', error);
    });
}

const server = createServer(createApp());
await attachRealtimeServer(server);
server.listen(port, () => {
  console.log(`Athlora API listening on port ${port}`);
  reconcile();
});

const reconciliationTimer = setInterval(() => {
  reconcile();
}, Number(process.env.FINALIZATION_POLL_INTERVAL_MS ?? 5_000));
reconciliationTimer.unref();

server.on('close', () => clearInterval(reconciliationTimer));

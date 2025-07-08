import { getProcessingService } from '@/lib/ocr/processing-service';
import { getDefaultSettings } from '@/lib/default-settings';
import { db } from '@/lib/database';
import type { QueueManager } from '@/lib/ocr/queue-manager';

async function syncQueue(manager: QueueManager) {
  const queue = await db.getQueue();
  for (const item of queue) {
    await manager.updateItemStatus(item);
  }
}

async function start() {
  console.log('[Worker] Starting server-side queue worker');
  const service = await getProcessingService(getDefaultSettings());
  const manager = service.getQueueManager();
  await syncQueue(manager);
  manager.processQueue();

  setInterval(async () => {
    await syncQueue(manager);
    manager.processQueue();
  }, 30000); // poll every 30 seconds
}

start().catch(err => {
  console.error('Worker failed:', err);
  process.exit(1);
});

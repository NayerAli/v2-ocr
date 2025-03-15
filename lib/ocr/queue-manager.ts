import { ProcessingStatus } from '@/types';

interface QueueItem {
  id: string;
  priority: number;
  status: ProcessingStatus;
  retryCount: number;
}

export class QueueManager {
  private queue: QueueItem[] = [];
  private isProcessing = false;
  private maxRetries = 3;

  public enqueue(item: Omit<QueueItem, 'retryCount'>): void {
    this.queue.push({ ...item, retryCount: 0 });
    this.queue.sort((a, b) => b.priority - a.priority);
  }

  public dequeue(): QueueItem | undefined {
    return this.queue.shift();
  }

  public getQueueLength(): number {
    return this.queue.length;
  }

  public clear(): void {
    this.queue = [];
    this.isProcessing = false;
  }
}

export const documentQueue = new QueueManager(); 
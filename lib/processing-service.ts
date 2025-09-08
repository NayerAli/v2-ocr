import type { ProcessingStatus } from '@/types';
import type { OCRSettings, ProcessingSettings, UploadSettings } from '@/types/settings';

interface ServiceSettings {
  ocr: OCRSettings;
  processing: ProcessingSettings;
  upload: UploadSettings;
}

export async function getProcessingService(settings: ServiceSettings) {
  void settings;
  return {
    addToQueue: async (files: File[]): Promise<string[]> => {
      const ids: string[] = [];
      for (const file of files) {
        const form = new FormData();
        form.append('file', file);
        console.log('[ProcessingService] Uploading file', file.name);
        const res = await fetch('/api/ocr/queue/enqueue', {
          method: 'POST',
          body: form,
        });
        const json = await res.json();
        console.log('[ProcessingService] File queued with ID', json.jobId);
        ids.push(json.jobId);
      }
      return ids;
    },

    pauseQueue: async () => {
      await fetch('/api/ocr/queue/pause', { method: 'POST' });
    },
    resumeQueue: async () => {
      await fetch('/api/ocr/queue/resume', { method: 'POST' });
    },

    cancelProcessing: async (id: string) => {
      await fetch('/api/ocr/queue/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id }),
      });
    },

    getStatus: async (id: string): Promise<ProcessingStatus | undefined> => {
      const res = await fetch(`/api/ocr/queue/status?jobId=${id}`);
      const json = await res.json();
      console.log('[ProcessingService] Status for', id, json.job?.status);
      if (json.job?.status === 'completed') {
        console.log('[ProcessingService] Job', id, 'completed');
      }
      return json.job as ProcessingStatus | undefined;
    },

    getAllStatus: async (): Promise<ProcessingStatus[]> => {
      const res = await fetch('/api/ocr/queue/status');
      const json = await res.json();
      console.log('[ProcessingService] Retrieved', json.jobs?.length ?? 0, 'jobs');
      return json.jobs as ProcessingStatus[];
    },

    retryDocument: async (id: string): Promise<ProcessingStatus | null> => {
      const res = await fetch('/api/ocr/queue/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id }),
      });
      const json = await res.json();
      return json.job as ProcessingStatus | null;
    },

    updateSettings: async (newSettings: ServiceSettings) => {
      await fetch('/api/ocr/queue/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
      });
    },
    };
  }

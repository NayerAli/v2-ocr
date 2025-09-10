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
        const res = await fetch('/api/ocr/queue/enqueue', {
          method: 'POST',
          body: form,
          credentials: 'include',
        });
        const json = await res.json();
        ids.push(json.jobId);

        // Fire-and-forget: trigger server-side processing for this job
        try {
          void fetch('/api/ocr/queue/process', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ jobId: json.jobId }),
            credentials: 'include',
          });
        } catch {
          // Ignore; UI polls status
        }
      }
      return ids;
    },

    pauseQueue: async () => {
      await fetch('/api/ocr/queue/pause', { method: 'POST', credentials: 'include' });
    },
    resumeQueue: async () => {
      await fetch('/api/ocr/queue/resume', { method: 'POST', credentials: 'include' });
    },

    cancelProcessing: async (id: string) => {
      await fetch('/api/ocr/queue/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id }),
        credentials: 'include',
      });
    },

    getStatus: async (id: string): Promise<ProcessingStatus | undefined> => {
      const res = await fetch(`/api/ocr/queue/status?jobId=${id}`, { credentials: 'include' });
      const json = await res.json();
      return json.job as ProcessingStatus | undefined;
    },

    getAllStatus: async (): Promise<ProcessingStatus[]> => {
      const res = await fetch('/api/ocr/queue/status', { credentials: 'include' });
      const json = await res.json();
      return json.jobs as ProcessingStatus[];
    },

    retryDocument: async (id: string): Promise<ProcessingStatus | null> => {
      const res = await fetch('/api/ocr/queue/retry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: id }),
        credentials: 'include',
      });
      const json = await res.json();
      return json.job as ProcessingStatus | null;
    },

    updateSettings: async (newSettings: ServiceSettings) => {
      await fetch('/api/ocr/queue/update-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSettings),
        credentials: 'include',
      });
    },
    };
  }

import { systemSettingsService } from '@/lib/system-settings-service';
import { createOCRProvider } from '@/lib/ocr/providers';
import { AzureRateLimiter } from '@/lib/ocr/rate-limiter';
import type { OCRSettings } from '@/types';

// Ensure this module is only imported on the server
if (typeof window !== 'undefined') {
  throw new Error('ocr-executor is server-only');
}

function maskKey(key: string | undefined): string {
  if (!key) return '';
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export async function executeOCR(base64Data: string, overrides: Partial<OCRSettings> = {}) {
  const defaults = await systemSettingsService.getOCRDefaults();
  const settings: OCRSettings = {
    provider: defaults.provider as OCRSettings['provider'],
    apiKey: defaults.apiKey,
    region: defaults.region || '',
    language: defaults.language,
    useSystemKey: true,
    ...overrides,
  };

  console.log('[ocr-executor] provider:', settings.provider, 'key:', maskKey(settings.apiKey));

    const provider = await createOCRProvider(settings, new AzureRateLimiter());
    const start = Date.now();
    const result = await provider.processImage(base64Data, new AbortController().signal);
  const duration = Date.now() - start;
  return { result, metadata: { duration, pages: Array.isArray(result) ? result.length : 1 } };
}

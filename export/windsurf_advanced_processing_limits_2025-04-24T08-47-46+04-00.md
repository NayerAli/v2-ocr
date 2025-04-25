# Advanced Processing Limits Analysis

**Generated:** 2025-04-24T08:47:46+04:00

This report focuses exclusively on internal *processing* limits and flow in your codebase. It provides step-by-step analysis and production-ready code corrections. For each suggestion, follow the additional change notes to ensure proper integration.

---

## 1. FileProcessor.processPageByPage (lib/ocr/file-processor.ts)

**Path:** `lib/ocr/file-processor.ts`

### Current Snippet (lines ~220–280):
```ts
// determine chunk size
pagesPerChunk = Math.min(pagesPerChunk, 5); // Very large PDFs: max 5 pages per chunk
pagesPerChunk = Math.min(pagesPerChunk, 8); // Large PDFs: max 8 pages per chunk
const maxPagesPerBatch = Math.min(pagesPerChunk, 3); // Process max 3 pages at a time

// execute batches
const maxConcurrentPages = Math.min(this.processingSettings.concurrentChunks, 2); // Limit concurrent processing
const batchResults = await this.processInBatches(batchPromises, maxConcurrentPages);
```

### Issues
1. **Magic numbers** (5, 8, 3, 2) hardcode caps and override user/DB config.
2. `processingSettings` lacks explicit fields for chunkSize & batchSize.

### Corrected Snippet:
```ts
// unpack config
const {
  pagesPerChunk,
  pagesPerBatch,
  concurrentChunks: maxConcurrentPages
} = this.processingSettings;

// compute chunks and batches dynamically
const totalPages = endPage - startPage + 1;
const numChunks = Math.ceil(totalPages / pagesPerChunk);

for (let ci = 0; ci < numChunks; ci++) {
  const chunkStart = startPage + ci * pagesPerChunk;
  const chunkEnd = Math.min(chunkStart + pagesPerChunk - 1, endPage);
  const batchCount = Math.ceil((chunkEnd - chunkStart + 1) / pagesPerBatch);

  for (let bi = 0; bi < batchCount; bi++) {
    const bStart = chunkStart + bi * pagesPerBatch;
    const bEnd = Math.min(bStart + pagesPerBatch - 1, chunkEnd);
    batchPromises.push(this.processBatch(bStart, bEnd));
  }
}

// process all batches honoring config concurrency
const batchResults = await this.processInBatches(batchPromises, maxConcurrentPages);
```

#### Additional Changes
- **Type Update:** In `types/settings.ts`, extend `ProcessingSettings`:
  ```ts
  export interface ProcessingSettings {
    maxConcurrentJobs: number;
    concurrentChunks: number;
    pagesPerChunk: number;
    pagesPerBatch: number;
  }
  ```
- **System Settings:** In `SystemSettingsService.getProcessingSettings()`, return all four fields (falling back to sensible defaults).
- **Settings Manager:** Ensure `DEFAULT_PROCESSING_SETTINGS` in `lib/ocr/settings-manager.ts` uses dynamic values from `UserSettingsService` or `SystemSettingsService`.

---

## 2. FileProcessor.processInBatches (lib/ocr/file-processor.ts)

### Current Snippet:
```ts
async processInBatches(promises: Promise<any>[], concurrency: number) {
  const maxConc = Math.min(concurrency, 2);
  // ...execute with Promise.allThrottle(maxConc)
}
```

### Issues
- Hardcoded cap `2` can silently override `concurrency` from settings.

### Corrected Snippet:
```ts
async processInBatches(tasks: Promise<any>[], concurrency: number) {
  // honor config directly
  const maxConc = concurrency;
  // use a throttle function or p-map with concurrency=maxConc
  return await throttle(tasks, maxConc);
}
```

#### Additional Changes
- Remove any internal `Math.min(..., 2)`.
- Import or implement a generic `throttle()` or use `p-map` for concurrency control.

---

## 3. QueueManager.processQueue (lib/ocr/queue-manager.ts)

**Path:** `lib/ocr/queue-manager.ts`

### Current Snippet:
```ts
const toProcess = queuedItems.slice(0, this.processingSettings.maxConcurrentJobs);
```

### Issues
- Relies on `maxConcurrentJobs` only; no naming clarity or fallback logic.

### Corrected Snippet:
```ts
const limit = this.processingSettings.maxConcurrentJobs;
const toProcess = queuedItems.slice(0, limit);
```

#### Additional Changes
- Ensure `this.processingSettings` is freshly loaded from `UserSettingsService.getProcessingSettings()` before slicing.

---

## 4. SystemSettingsService.getProcessingSettings (lib/system-settings-service.ts)

### Current Snippet:
```ts
async getProcessingSettings() {
  const rec = await table.select().eq('key','processing_limits').single();
  return rec ? rec.value : { maxConcurrentJobs: 2 };
}
```

### Issues
- Only returns `maxConcurrentJobs`.
- No support for `concurrentChunks`, `pagesPerChunk`, `pagesPerBatch`.

### Corrected Snippet:
```ts
async getProcessingSettings(): Promise<ProcessingSettings> {
  const defaultVals = { maxConcurrentJobs: 2, concurrentChunks: 2, pagesPerChunk: 8, pagesPerBatch: 3 };
  const rec = await table.select('value').eq('key','processing_limits').single();
  return rec?.value as ProcessingSettings ?? defaultVals;
}
```

#### Additional Changes
- Update DB schema to store `processing_limits` as JSON with all four fields.
- Adapt `init-db-settings.js` to seed these new fields.

---

# Summary & Next Steps
1. Remove **all** magic-number caps in processing modules.
2. Extend `ProcessingSettings` type and persist all fields in DB.
3. Fetch and propagate dynamic limits via `SystemSettingsService` → `UserSettingsService` → `settings-manager` → `FileProcessor`/`QueueManager`.
4. Implement or import a reliable throttle utility for concurrency.

Apply each code snippet in its module and follow the *Additional Changes* to ensure end-to-end consistency. Once integrated, run full test suite to validate processing under varied configurations.

*End of report.*

# Analysis of Internal Processing and File-Handling Limits

Generated: 2025-04-23T15:41:37+04:00

This report catalogs all internally imposed limits across modules, explains logic flows, highlights inconsistencies, and proposes production-ready corrections.

---

## 1. Store Defaults (`store/settings.ts`)
**Logic:** initial client-side defaults for processing/upload/storage.

**Current Snippet:**
```ts
maxConcurrentJobs: 1,
maxFileSize: 500,        // MB
maxSimultaneousUploads: 5,
maxStorageSize: 1000     // MB
```
**Issue:** hardcoded; does not reflect DB-configured values.

**Corrected Snippet:**
```ts
{{ ... }}
// replaced hardcoded defaults with dynamic values from settings-service
loading: true,
settings: await systemSettingsService.getAllLimits(),
{{ ... }}
```  
*Use a single source of truth via SystemSettingsService.*

---

## 2. User Settings Service Defaults (`lib/user-settings-service.ts`)
**Logic:** bootstrap per-user limits in memory.

**Current Snippet:**
```ts
const defaultSettings = {
  processing: { maxConcurrentJobs: 1 },
  upload:     { maxFileSize: 500, maxSimultaneousUploads: 5 },
  database:   { maxStorageSize: 1000 },
  ocr:        DEFAULT_OCR_SETTINGS
};
```
**Issue:** uses outdated hardcoded defaults instead of system defaults; inconsistency with `getProcessingSettings()`.

**Corrected Snippet:**
```ts
const defaultSettings = await systemSettingsService.getAllLimits();
```
*Delegate default resolution to system-settings-service.*

---

## 3. System Settings Fallbacks (`lib/system-settings-service.ts`)
**Logic:** fetch global defaults from DB or fallback.

**Current Snippet:**
```ts
async getProcessingSettings() {
  const record = await table.select().eq('key','processing_limits').single();
  return record
    ? record.value
    : { maxConcurrentJobs: 2 };
}
async getUploadLimits() { 
  const rec = ...;
  return rec
    ? rec.value
    : { maxFileSize: 500, maxSimultaneousUploads: 5 };
}
```
**Issue:** separate calls; fallbacks scattered; no atomic `getAllLimits()`.

**Corrected Snippet:**
```ts
async getAllLimits() {
  const [{value: p}, {value: u}, {value: d}] = await Promise.all([
    fetch('processing_limits'),
    fetch('upload_limits'),
    fetch('database_limits')
  ]);
  return {
    processing: p ?? { maxConcurrentJobs:2, concurrentChunks:2, pagesPerChunk:8, pagesPerBatch:3 },
    upload:     u ?? { maxFileSize:500, maxSimultaneousUploads:5 },
    database:   d ?? { maxStorageSize:1000 }
  };
}
```
*Consolidate fetching and fallback logic.*

---

## 4. OCR Settings Manager Defaults (`lib/ocr/settings-manager.ts`)
**Logic:** merge DEFAULT_OCR_SETTINGS and local limits.

**Current Snippet:**
```ts
export const DEFAULT_PROCESSING_SETTINGS = {
  maxConcurrentJobs:2,
  concurrentChunks: 2,
  pagesPerChunk: 8,
  pagesPerBatch: 3
};
export const DEFAULT_UPLOAD_SETTINGS = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxSimultaneousUploads: 5
};
```
**Issue:** mismatched units (MB vs bytes), duplicated defaults.

**Corrected Snippet:**
```ts
const dynamicLimits = await systemSettingsService.getAllLimits();
export const DEFAULT_PROCESSING_SETTINGS = dynamicLimits.processing;
export const DEFAULT_UPLOAD_SETTINGS     = {
  maxFileSize: dynamicLimits.upload.maxFileSize * 1024 * 1024,
  maxSimultaneousUploads: dynamicLimits.upload.maxSimultaneousUploads
};
```
*Unit-consistent, centralized defaults.*

---

## 5. File Processor Hard Limits (`lib/ocr/file-processor.ts`)
**Logic:** chunk PDF pages into batches and concurrent workers.

**Current Snippet:**
```ts
pagesPerChunk = Math.min(pagesPerChunk, 5); // Very large: max 5
pagesPerChunk = Math.min(pagesPerChunk, 8); // Large: max 8
const maxPagesPerBatch = Math.min(pagesPerChunk, 3);
const maxConcurrentPages = Math.min(this.processingSettings.concurrentChunks, 2);
```
**Issue:** magic numbers override dynamic `processingSettings`.

**Corrected Snippet:**
```ts
const { pagesPerChunk, pagesPerBatch, concurrentChunks } = this.processingSettings;
// enforce only via config:
pagesPerChunk = Math.min(pagesPerChunk, pagesPerChunk);
const maxPagesPerBatch = pagesPerBatch;
const maxConcurrentPages = concurrentChunks;
```
*Remove magic caps and honor configured values.*

---

## 6. Queue Manager Slice Limit (`lib/ocr/queue-manager.ts`)
**Logic:** process up to `maxConcurrentJobs` at once.

**Current Snippet:**
```ts
const itemsToProcess = queuedItems.slice(0, this.processingSettings.maxConcurrentJobs);
```
**Issue:** correct but upstream default may be stale.

**Corrected Snippet:**
```ts
const limit = this.processingSettings.maxConcurrentJobs;
const itemsToProcess = queuedItems.slice(0, limit);
```
*No change; ensure `processingSettings` always loaded from DB.*

---

# Root Causes & Recommendations
1. **Duplicated defaults** across store, user-service, system-service, and OCR modules lead to drift.
2. **Inconsistent units** (MB vs bytes) cause silent misapplication of limits.
3. **Magic numbers** in file-processor override dynamic configs.
4. **Missing aggregation**: no single `getAllLimits()` forces modules to fallback independently.

**Action Plan:**
- Centralize default limits in `SystemSettingsService.getAllLimits()`.
- Refactor `UserSettingsService` and `settings-manager` to consume aggregated limits.
- Remove all magic caps; rely solely on runtime-configured values.
- Harmonize units and document in DB schema.

---
*End of analysis.*

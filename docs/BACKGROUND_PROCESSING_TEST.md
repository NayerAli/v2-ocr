# Background Processing Test Guide

## Problem Solved
OCR processing was stopping when users switched to another browser tab or minimized the browser window. This was caused by browser throttling of the main thread when the tab became inactive.

## Solution Implemented
1. **Web Worker PDF Rendering**: PDF page rendering moved to a dedicated Web Worker using OffscreenCanvas
2. **Page Lifecycle Management**: Added proper handling of visibility changes and page lifecycle events
3. **Robust Fallback**: Graceful fallback to main thread rendering if worker fails

## End-to-End Testing Instructions

### 1. Automated Worker Testing (Development Mode)

When running in development mode, the app automatically loads test utilities. Open browser console and use:

```javascript
// Test worker once
await testPdfWorkerInBackground()

// Start continuous background testing (every 5 seconds)
const stopTest = startContinuousBackgroundTest()
// Call stopTest() to stop continuous testing
```

### 2. Manual End-to-End Test

#### Prerequisites
- Development server running (`npm run dev`)
- Browser with OffscreenCanvas support (Chrome 69+, Firefox 79+, Safari 16.4+)
- Large PDF file (5+ pages) for testing

#### Test Steps

1. **Setup**
   - Open the application in browser
   - Login and configure OCR API key in settings
   - Open browser DevTools (F12) and go to Console tab

2. **Upload Test**
   - Upload a large PDF file (5+ pages)
   - Immediately switch to another tab or minimize browser
   - Monitor console logs for processing continuation

3. **Visibility Test**
   ```javascript
   // In console, monitor document visibility
   setInterval(() => {
     console.log('Tab visible:', !document.hidden, 'Time:', new Date().toLocaleTimeString())
   }, 2000)
   ```

4. **Network Monitoring**
   - Open DevTools Network tab
   - Filter by "Fetch/XHR" to see OCR API calls
   - Verify API calls continue even when tab is hidden

5. **Background Processing Verification**
   - Switch to another tab for 30+ seconds
   - Return to OCR app tab
   - Verify processing has continued and progress has advanced

#### Expected Results

✅ **Success Indicators:**
- Console shows "[Process] Worker failed for page X, falling back..." (worker attempted)
- OCR API calls continue in Network tab when tab is hidden
- Progress bar advances even when tab is inactive
- Document status changes from "processing" to "completed" without user interaction
- No "Processing stopped" or timeout errors

❌ **Failure Indicators:**
- Processing stops when tab becomes hidden
- No API calls in Network tab when tab is inactive
- Progress bar freezes at same percentage
- Error messages about processing timeouts

### 3. Browser Compatibility Testing

Test on different browsers to verify fallback behavior:

#### Chrome/Edge (Full Support)
- OffscreenCanvas available
- Worker should handle all PDF rendering
- Best performance in background

#### Firefox (Full Support)
- OffscreenCanvas available since v79
- Worker should handle all PDF rendering

#### Safari (Partial Support)
- OffscreenCanvas available since v16.4
- May fall back to main thread on older versions
- Should still work but with potential throttling

#### Testing Commands
```javascript
// Check OffscreenCanvas support
console.log('OffscreenCanvas supported:', typeof OffscreenCanvas !== 'undefined')

// Check worker availability
import('@/lib/workers/pdf-renderer-client').then(module => {
  console.log('PDF Worker available:', !!module.pdfRenderer)
})
```

### 4. Performance Monitoring

Monitor key metrics during background processing:

```javascript
// Monitor memory usage
setInterval(() => {
  if (performance.memory) {
    console.log('Memory:', {
      used: Math.round(performance.memory.usedJSHeapSize / 1024 / 1024) + 'MB',
      total: Math.round(performance.memory.totalJSHeapSize / 1024 / 1024) + 'MB'
    })
  }
}, 5000)

// Monitor processing queue
setInterval(() => {
  const processing = document.querySelectorAll('[data-status="processing"]').length
  const completed = document.querySelectorAll('[data-status="completed"]').length
  console.log('Queue status:', { processing, completed })
}, 3000)
```

### 5. Error Scenarios Testing

Test error handling and recovery:

1. **Network Interruption**
   - Start processing, then disconnect internet
   - Reconnect and verify processing resumes

2. **Worker Failure Simulation**
   - Modify worker code to throw error
   - Verify fallback to main thread works

3. **Large File Stress Test**
   - Upload very large PDF (50+ pages)
   - Switch tabs multiple times during processing
   - Verify consistent progress

### 6. Success Criteria

The fix is successful if:

- [ ] OCR processing continues when browser tab is inactive
- [ ] Processing continues when browser is minimized
- [ ] Worker successfully handles PDF rendering in background
- [ ] Graceful fallback works when worker fails
- [ ] No memory leaks during extended background processing
- [ ] UI updates correctly when returning to active tab
- [ ] All TypeScript and ESLint checks pass

### 7. Troubleshooting

**If processing still stops in background:**
1. Check console for worker errors
2. Verify OffscreenCanvas support: `typeof OffscreenCanvas !== 'undefined'`
3. Check if CSP headers block worker creation
4. Verify PDF.js loads correctly in worker context

**If worker fails to initialize:**
1. Check network requests for PDF.js CDN
2. Verify no CORS issues with external resources
3. Check for JavaScript errors in worker context

### 8. Monitoring in Production

For production monitoring, add these checks:

```javascript
// Monitor background processing success rate
window.backgroundProcessingStats = {
  total: 0,
  backgroundSuccess: 0,
  workerSuccess: 0
}

// Track in your analytics
function trackBackgroundProcessing(success, wasBackground, usedWorker) {
  window.backgroundProcessingStats.total++
  if (success && wasBackground) window.backgroundProcessingStats.backgroundSuccess++
  if (success && usedWorker) window.backgroundProcessingStats.workerSuccess++
}
```

This comprehensive testing ensures the background processing fix works reliably across different browsers and scenarios.
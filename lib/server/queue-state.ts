// Simple in-memory queue state management
// Ensure this module is server-only
if (typeof window !== 'undefined') {
  throw new Error('queue-state is server-only');
}

let paused = false;

export function pauseQueue() {
  paused = true;
}

export function resumeQueue() {
  paused = false;
}

export function isQueuePaused() {
  return paused;
}

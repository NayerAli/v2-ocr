export {}; // Ensure this file is treated as a module

declare global {
  interface Window {
    /**
     * Some browsers expose a non-standard `window.gc` hook (Chrome with the
     * `--js-flags="--expose_gc"` flag). Our code checks its presence to force a
     * garbage-collection cycle after processing heavy PDF chunks. We declare
     * it here to silence TypeScript errors.
     */
    gc?: () => void;
  }
}
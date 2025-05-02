/**
 * A canvas factory for Node.js environment
 * This is used for server-side PDF rendering
 */
export class NodeCanvasFactory {
  /**
   * Creates a new canvas and its rendering context.
   * @param {number} width - The width of the canvas.
   * @param {number} height - The height of the canvas.
   * @returns {Object} An object with the canvas and its rendering context.
   */
  create(width: number, height: number) {
    // Check if we're in a Node.js environment
    if (typeof window !== 'undefined') {
      // If we're in a browser, use the browser's canvas
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d', {
        alpha: true,
        willReadFrequently: true
      });
      return {
        canvas,
        context
      };
    }

    // In a Node.js environment, we would use node-canvas
    // But since we can't import it directly (it's a native module),
    // we'll throw an error if this is actually called in Node.js
    throw new Error('NodeCanvasFactory is not supported in this environment');
  }

  /**
   * Resets the canvas and its rendering context.
   * @param canvasAndContext - The canvas and its rendering context.
   * @param width - The new width of the canvas.
   * @param height - The new height of the canvas.
   * @returns An object with the canvas and its rendering context.
   */
  reset(canvasAndContext: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }, width: number, height: number) {
    if (!canvasAndContext.canvas) {
      throw new Error('Canvas is not specified');
    }

    canvasAndContext.canvas.width = width;
    canvasAndContext.canvas.height = height;
    return canvasAndContext;
  }

  /**
   * Destroys the canvas and its rendering context.
   * @param canvasAndContext - The canvas and its rendering context.
   */
  destroy(canvasAndContext: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }) {
    if (!canvasAndContext.canvas) {
      throw new Error('Canvas is not specified');
    }

    // Just clear the canvas
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;

    // TypeScript doesn't like setting these to null directly
    // So we'll use a more specific type
    (canvasAndContext as { canvas: HTMLCanvasElement | null; context: CanvasRenderingContext2D | null }).canvas = null;
    (canvasAndContext as { canvas: HTMLCanvasElement | null; context: CanvasRenderingContext2D | null }).context = null;
  }
}

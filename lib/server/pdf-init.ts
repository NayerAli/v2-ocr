import { GlobalWorkerOptions } from 'pdfjs-dist';

/**
 * Initialize PDF.js for server-side usage
 */
export async function initializePDFJS() {
  try {
    console.log('[PDF.js] Starting initialization...');
    
    // Disable worker in Node.js environment by setting empty string
    GlobalWorkerOptions.workerSrc = '';
    
    // Set up a proper worker handler that can respond to PDF.js messages
    (global as any).pdfjsWorker = {
      WorkerMessageHandler: {
        setup: (handler: any) => {
          console.log('[PDF.js] Setting up fake worker handler');
          
          // We need to track doc info for response
          const docInfo = new Map();
          
          // Replace handler's send method to use our messageHandler
          if (handler.comObj) {
            const originalPostMessage = handler.comObj.postMessage;
            handler.comObj.postMessage = function(data: any) {
              console.log(`[PDF.js] Worker received message: ${data.action}`);
              
              // Handle GetDocRequest to track numPages
              if (data.action === 'GetDocRequest') {
                // Store numPages for this docId if provided
                if (data.numPages) {
                  docInfo.set(data.docId || '1', { numPages: data.numPages });
                }
              }
              
              // Actually handle the message by sending a fake reply
              if (data.action === 'configure') {
                setTimeout(() => {
                  if (handler.comObj && typeof handler.comObj.onmessage === 'function') {
                    handler.comObj.onmessage({
                      data: {
                        action: 'configure_reply',
                        success: true
                      }
                    });
                  }
                }, 0);
              } 
              else if (data.action === 'GetDocRequest') {
                // Get document info or use defaults
                const info = docInfo.get(data.docId || '1') || { numPages: 10 }; // Default to 10 pages
                
                setTimeout(() => {
                  if (handler.comObj && typeof handler.comObj.onmessage === 'function') {
                    console.log(`[PDF.js] Sending GetDocRequest_reply with numPages: ${info.numPages}`);
                    handler.comObj.onmessage({
                      data: {
                        action: 'GetDocRequest_reply',
                        success: true,
                        docId: data.docId || '1',
                        numPages: info.numPages
                      }
                    });
                  } else {
                    console.log(`[PDF.js] No onmessage handler for document reply`);
                  }
                }, 0);
              }
              else if (data.action === 'GetPage') {
                setTimeout(() => {
                  if (handler.comObj && typeof handler.comObj.onmessage === 'function') {
                    console.log(`[PDF.js] Sending GetPage_reply for page ${data.pageIndex + 1}`);
                    handler.comObj.onmessage({
                      data: {
                        action: 'GetPage_reply',
                        success: true,
                        pageIndex: data.pageIndex,
                        pageInfo: {
                          rotate: 0,
                          width: 612,
                          height: 792
                        }
                      }
                    });
                  }
                }, 0);
              }
              else if (data.action === 'RenderPageRequest') {
                setTimeout(() => {
                  if (handler.comObj && typeof handler.comObj.onmessage === 'function') {
                    console.log(`[PDF.js] Sending RenderPageRequest_reply for page ${data.pageIndex + 1}`);
                    handler.comObj.onmessage({
                      data: {
                        action: 'RenderPageRequest_reply',
                        success: true,
                        renderContext: data.renderContext,
                        pageIndex: data.pageIndex,
                        operatorList: {
                          fnArray: new Uint8Array([]),
                          argsArray: [],
                          lastChunk: true
                        }
                      }
                    });
                  }
                }, 0);
              }
              else if (data.action === 'commonobj') {
                setTimeout(() => {
                  if (handler.comObj && typeof handler.comObj.onmessage === 'function') {
                    handler.comObj.onmessage({
                      data: {
                        action: data.action + '_reply',
                        success: true,
                        id: data.id
                      }
                    });
                  }
                }, 0);
              }
              else if (data.action === 'obj') {
                setTimeout(() => {
                  if (handler.comObj && typeof handler.comObj.onmessage === 'function') {
                    handler.comObj.onmessage({
                      data: {
                        action: data.action + '_reply',
                        success: true,
                        id: data.id
                      }
                    });
                  }
                }, 0);
              }
              else if (data.action === 'GetOperatorList') {
                setTimeout(() => {
                  if (handler.comObj && typeof handler.comObj.onmessage === 'function') {
                    handler.comObj.onmessage({
                      data: {
                        action: 'GetOperatorList_reply',
                        success: true,
                        pageIndex: data.pageIndex,
                        operatorList: {
                          fnArray: new Uint8Array([]),
                          argsArray: [],
                          lastChunk: true
                        }
                      }
                    });
                  }
                }, 0);
              }
              else {
                // For other messages, pass through to original handler but respond with success
                console.log(`[PDF.js] Handling unrecognized message: ${data.action}`);
                if (originalPostMessage) {
                  try {
                    originalPostMessage.call(handler.comObj, data);
                    
                    // Provide a generic success response
                    if (data.action && handler.comObj && typeof handler.comObj.onmessage === 'function') {
                      setTimeout(() => {
                        handler.comObj.onmessage({
                          data: {
                            action: `${data.action}_reply`,
                            success: true
                          }
                        });
                      }, 0);
                    }
                  } catch (error) {
                    console.error(`[PDF.js] Error handling message: ${data.action}`, error);
                  }
                }
              }
            };
            
            // Make sure onmessage exists and is a function
            if (!handler.comObj.onmessage) {
              handler.comObj.onmessage = function() {
                console.log('[PDF.js] Default onmessage handler called');
              };
            }
          }
          
          return handler;
        }
      }
    };

    // Return configuration for PDF.js
    const pdfJsConfig = {
      isOffscreenCanvasSupported: false,
      isWebGLEnabled: false,
      disableFontFace: true,
      useSystemFonts: false,
      disableWorker: true,
      standardFontDataUrl: 'standard_fonts/',
      cMapUrl: 'cmaps/',
      cMapPacked: true,
      fontExtraProperties: false,
      maxImageSize: -1,
      verbosity: 0
    };
    
    console.log('[PDF.js] Configuration complete:', pdfJsConfig);
    return pdfJsConfig;
  } catch (error) {
    console.error('[PDF.js] Initialization error:', error);
    if (error instanceof Error) {
      console.error('[PDF.js] Error stack:', error.stack);
    }
    throw error;
  }
}


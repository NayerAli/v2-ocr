import type { OCRResult, OCRSettings } from "@/types";
import { getUUID } from "@/lib/uuid";
import type { MistralOCRResponse, OCRProvider } from "./types";
import { MistralRateLimiter } from "../rate-limiter";

export class MistralOCRProvider implements OCRProvider {
  private settings: OCRSettings;
  private rateLimiter: MistralRateLimiter;
  private maxRetries = 3;
  private baseRetryDelay = 2000; // Start with 2 seconds
  private readonly MAX_PDF_SIZE_MB = 50; // 50MB limit for Mistral OCR API
  private readonly MAX_PDF_PAGES = 1000; // 1000 pages limit for Mistral OCR API
  private readonly MAX_REQUEST_SIZE_MB = 10; // Maximum safe request size to avoid buffer issues
  // Flag to control whether to use Mistral's PDF processing or not
  private readonly USE_MISTRAL_PDF_PROCESSING = false; // Set to false to disable Mistral PDF processing

  constructor(settings: OCRSettings, rateLimiter: MistralRateLimiter) {
    this.settings = settings;
    this.rateLimiter = rateLimiter;
  }

  async processImage(base64Data: string, signal: AbortSignal, fileType?: string, pageNumber: number = 1, totalPages: number = 1): Promise<OCRResult> {
    const startTime = Date.now();
    let retries = 0;

    // Wait if we're currently rate limited
    if (this.rateLimiter.isLimited()) {
      console.log(`[Mistral] Rate limited. Waiting before processing...`);
      await this.rateLimiter.waitIfLimited();
      console.log(`[Mistral] Resuming after rate limit wait`);
    }

    // If this is a PDF and Mistral PDF processing is enabled, use the PDF processing method
    if (fileType === "application/pdf" && this.USE_MISTRAL_PDF_PROCESSING) {
      return this.processPdfDirectly(base64Data, signal);
    }

    // Otherwise, process all files (including PDFs) as images
    // Note: For PDFs, the caller should convert PDF pages to images before calling this method

    while (retries <= this.maxRetries) {
      try {
        // Check if the operation was aborted
        if (signal.aborted) {
          throw new Error("Operation aborted by user");
        }

        // Validate base64 data
        if (!base64Data || base64Data.length === 0) {
          throw new Error("Empty base64 data provided");
        }

        // For images, use image_url with data URI
        const documentType = "image_url";
        const dataPrefix = "data:image/jpeg;base64,";

        // Log request details for debugging
        console.log(`[Mistral] Processing image with Mistral OCR API (page ${pageNumber}/${totalPages})`);

        // Check base64 data size
        const dataSizeMB = Math.round((base64Data.length * 0.75) / (1024 * 1024) * 100) / 100; // Approximate size in MB
        console.log(`[Mistral] Base64 data size: ~${dataSizeMB}MB`);

        // Construct the request body exactly as shown in Mistral documentation
        const requestBody = {
          model: "mistral-ocr-latest",
          document: {
            type: documentType,
            [documentType]: `${dataPrefix}${base64Data}`
          }
        };

        console.log(`[Mistral] Sending request with document type: ${documentType}`);

        const response = await fetch("https://api.mistral.ai/v1/ocr", {
          method: "POST",
          signal,
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${this.settings.apiKey}`,
          },
          body: JSON.stringify(requestBody),
          // Don't include credentials for cross-origin requests
          credentials: "omit"
        });

        // Handle rate limiting (429 Too Many Requests)
        if (response.status === 429) {
          // Get retry delay from header or use default
          const retryAfter = response.headers.get('Retry-After');
          const retryDelaySeconds = retryAfter ? parseInt(retryAfter, 10) : 60; // Default to 60 seconds if not specified
          const retryDelayMs = retryDelaySeconds * 1000;

          // Set rate limit with the delay
          this.rateLimiter.setRateLimit(retryDelaySeconds);

          console.log(`[Mistral] Rate limited (429). Will retry after ${retryDelaySeconds}s`);

          // If we have retries left, wait and try again
          if (retries < this.maxRetries) {
            retries++;
            // Use the Retry-After header value directly instead of exponential backoff
            console.log(`[Mistral] Waiting for ${retryDelaySeconds}s before retry ${retries}/${this.maxRetries}`);

            // Wait for the specified time
            await new Promise(resolve => setTimeout(resolve, retryDelayMs));

            console.log(`[Mistral] Resuming after rate limit wait`);
            continue;
          } else {
            // Return a special result indicating rate limiting
            return {
              id: getUUID(),
              documentId: "",
              text: "Rate limit exceeded. Please try again later.",
              confidence: 0,
              language: this.settings.language || "unknown",
              processingTime: Date.now() - startTime,
              pageNumber: pageNumber,
              totalPages: totalPages,
              error: "Rate limit exceeded (429)",
              rateLimitInfo: this.rateLimiter.getRateLimitInfo()
            };
          }
        }

        // Handle other errors
        if (!response.ok) {
          let errorMessage = `Mistral OCR API error: ${response.status}`;

          try {
            const errorData = await response.json();

            // Enhanced error logging for debugging
            console.error("[Mistral] API Error Response:", JSON.stringify(errorData, null, 2));

            if (errorData.error) {
              if (typeof errorData.error === 'string') {
                errorMessage = errorData.error;
              } else if (errorData.error.message) {
                errorMessage = errorData.error.message;
              } else if (errorData.error.type) {
                errorMessage = `${errorData.error.type}: ${errorData.error.message || 'Unknown error'}`;
              }
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }

            // Special handling for common 400 errors
            if (response.status === 400) {
              if (errorMessage.includes("file size")) {
                errorMessage = `File size exceeds Mistral's limit (50MB). Please reduce the file size.`;
              } else if (errorMessage.includes("format")) {
                errorMessage = `Invalid file format. Mistral OCR only supports PDF, PNG, JPEG, and WEBP formats.`;
              } else if (errorMessage.includes("corrupt") || errorMessage.includes("invalid")) {
                errorMessage = `The file appears to be corrupt or invalid. Please check the file.`;
              }

              // Add more specific error handling based on the error message
              console.error(`[Mistral] 400 Bad Request: ${errorMessage}`);
            }
          } catch (parseError) {
            console.error("[Mistral] Failed to parse error response:", parseError);
          }

          // For server errors (5xx), retry if we have retries left
          if (response.status >= 500 && retries < this.maxRetries) {
            retries++;
            const backoffDelay = this.baseRetryDelay * Math.pow(2, retries - 1);
            console.log(`[Mistral] Server error (${response.status}). Retry ${retries}/${this.maxRetries} after ${backoffDelay}ms`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            continue;
          }

          // For 400 errors, retry once in case it was a temporary issue
          if (response.status === 400 && retries < 1) {
            retries++;
            const backoffDelay = this.baseRetryDelay;
            console.log(`[Mistral] Bad request (400). Retry ${retries}/${this.maxRetries} after ${backoffDelay}ms`);
            await new Promise(resolve => setTimeout(resolve, backoffDelay));
            continue;
          }

          throw new Error(errorMessage);
        }

        const data = await response.json() as MistralOCRResponse;

        // Log the response structure for debugging
        console.log(`[Mistral] Response structure:`,
          Object.keys(data).join(', '),
          data.pages ? `Pages: ${data.pages.length}` : 'No pages',
          data.text ? 'Has text' : 'No text'
        );

        // Extract text from Mistral OCR response
        let extractedText = "";
        // We don't need to track response pages
        // let responsePages = 1;

        if (data && data.text) {
          extractedText = data.text;
        } else if (data && data.pages && data.pages.length > 0) {
          // Number of pages in response - not used but kept for documentation
          // const responsePages = data.pages.length;

          // Process each page in the response
          extractedText = data.pages.map(page => {
            if (page.markdown) {
              // Remove image references like ![img-0.jpeg](img-0.jpeg)
              const cleanedText = page.markdown
                .replace(/!\[.*?\]\(.*?\)/g, "") // Remove image references
                .replace(/\$\$([\s\S]*?)\$\$/g, "$1") // Keep math content but remove $$ delimiters
                .replace(/\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}/g, "$1") // Keep aligned content but remove delimiters
                .trim();
              return cleanedText;
            }
            return page.text || "";
          }).join("\n\n");
        }

        // Log success
        console.log(`[Mistral] Successfully processed image page ${pageNumber}/${totalPages}`);

        return {
          id: getUUID(),
          documentId: "",
          text: extractedText,
          confidence: 1, // Mistral doesn't provide confidence scores, so we use 1
          language: this.settings.language || "unknown",
          processingTime: Date.now() - startTime,
          pageNumber: pageNumber,
          totalPages: totalPages,
          rateLimitInfo: this.rateLimiter.isLimited() ? this.rateLimiter.getRateLimitInfo() : undefined
        };
      } catch (error) {
        console.error(`[Mistral] Error during processing:`, error);

        // If we've exhausted retries or it's not a retryable error, throw
        if (retries >= this.maxRetries ||
            (error instanceof Error && error.message.includes("aborted"))
        ) {
          throw new Error(`Mistral OCR API error: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Otherwise, retry with exponential backoff
        retries++;
        const backoffDelay = this.baseRetryDelay * Math.pow(2, retries - 1);
        console.log(`[Mistral] Error: ${error instanceof Error ? error.message : String(error)}. Retry ${retries}/${this.maxRetries} after ${backoffDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }

    // This should never be reached due to the return or throw in the loop
    throw new Error("Maximum retries exceeded");
  }

  // Check if a PDF file can be processed directly by Mistral OCR API
  canProcessPdfDirectly(fileSize: number, pageCount?: number): boolean {
    // If Mistral PDF processing is disabled, always return false
    if (!this.USE_MISTRAL_PDF_PROCESSING) {
      console.log(`[Mistral] PDF processing with Mistral is currently disabled`);
      return false;
    }

    // Check file size limit (50MB)
    const fileSizeMB = fileSize / (1024 * 1024);
    console.log(`[Mistral] Checking if PDF can be processed directly: ${Math.round(fileSizeMB * 100) / 100}MB, ${pageCount || 'unknown'} pages`);

    // Check against Mistral's limits
    if (fileSizeMB > this.MAX_PDF_SIZE_MB) {
      console.log(`[Mistral] PDF exceeds size limit (${Math.round(fileSizeMB * 100) / 100}MB > ${this.MAX_PDF_SIZE_MB}MB)`);
      return false;
    }

    // Check page count limit if known (1000 pages)
    if (pageCount !== undefined && pageCount > this.MAX_PDF_PAGES) {
      console.log(`[Mistral] PDF exceeds page limit (${pageCount} > ${this.MAX_PDF_PAGES})`);
      return false;
    }

    return true;
  }

  // Process a PDF file directly with Mistral OCR API
  async processPdfDirectly(pdfBase64: string, signal: AbortSignal): Promise<OCRResult> {
    const startTime = Date.now();
    let retries = 0;

    console.log(`[Mistral] Processing PDF directly with Mistral OCR API`);

    // Check if the base64 data is valid
    if (!pdfBase64 || pdfBase64.length === 0) {
      throw new Error("Empty PDF data provided");
    }

    // Wait if we're currently rate limited
    if (this.rateLimiter.isLimited()) {
      console.log(`[Mistral] Rate limited. Waiting before processing PDF...`);
      await this.rateLimiter.waitIfLimited();
      console.log(`[Mistral] Resuming PDF processing after rate limit wait`);
    }

    while (retries <= this.maxRetries) {
      try {
        // Check if the operation was aborted
        if (signal.aborted) {
          throw new Error("Operation aborted by user");
        }

        // First, upload the PDF file to Mistral's file API
        const fileId = await this.uploadPdfToMistral(pdfBase64, signal);

        // Then, get a signed URL for the uploaded file
        const signedUrl = await this.getSignedUrl(fileId, signal);

        // Now, process the PDF using the signed URL
        return await this.processPdfWithSignedUrl(signedUrl, signal, startTime);
      } catch (error) {
        console.error(`[Mistral] Error during PDF processing:`, error);

        // If we've exhausted retries or it's not a retryable error, throw
        if (retries >= this.maxRetries ||
            (error instanceof Error && (
              error.message.includes("aborted") ||
              error.message.includes("too large") ||
              error.message.includes("process page by page")
            ))
        ) {
          throw new Error(`Mistral OCR API error: ${error instanceof Error ? error.message : String(error)}`);
        }

        // Otherwise, retry with exponential backoff
        retries++;
        const backoffDelay = this.baseRetryDelay * Math.pow(2, retries - 1);
        console.log(`[Mistral] Error: ${error instanceof Error ? error.message : String(error)}. Retry ${retries}/${this.maxRetries} after ${backoffDelay}ms`);
        await new Promise(resolve => setTimeout(resolve, backoffDelay));
      }
    }

    throw new Error("Maximum retries exceeded");
  }

  // Upload PDF to Mistral's file API
  private async uploadPdfToMistral(pdfBase64: string, signal: AbortSignal): Promise<string> {
    console.log(`[Mistral] Uploading PDF to Mistral's file API`);

    // Convert base64 to binary data
    const binaryData = Buffer.from(pdfBase64, 'base64');

    // Create a Blob from the binary data
    const blob = new Blob([binaryData], { type: 'application/pdf' });

    // Create a FormData object and append the file
    const formData = new FormData();
    formData.append('file', blob, 'document.pdf');
    formData.append('purpose', 'ocr');

    // Upload the file to Mistral's file API
    const response = await fetch('https://api.mistral.ai/v1/files', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.settings.apiKey}`,
      },
      body: formData,
      signal,
      credentials: 'omit',
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryDelaySeconds = retryAfter ? parseInt(retryAfter, 10) : 60;

      this.rateLimiter.setRateLimit(retryDelaySeconds);
      throw new Error(`Rate limited during file upload. Retry after ${retryDelaySeconds}s`);
    }

    if (!response.ok) {
      let errorMessage = `Failed to upload PDF: ${response.status}`;

      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = typeof errorData.error === 'string'
            ? errorData.error
            : errorData.error.message || errorMessage;
        }
      } catch {
        // Ignore JSON parsing errors
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.id) {
      throw new Error('Failed to get file ID from Mistral API');
    }

    console.log(`[Mistral] Successfully uploaded PDF, file ID: ${data.id}`);

    return data.id;
  }

  // Get a signed URL for the uploaded file
  private async getSignedUrl(fileId: string, signal: AbortSignal): Promise<string> {
    console.log(`[Mistral] Getting signed URL for file ID: ${fileId}`);

    const response = await fetch(`https://api.mistral.ai/v1/files/${fileId}/url?expiry=24`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${this.settings.apiKey}`,
        'Accept': 'application/json',
      },
      signal,
      credentials: 'omit',
    });

    // Handle rate limiting
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryDelaySeconds = retryAfter ? parseInt(retryAfter, 10) : 60;

      this.rateLimiter.setRateLimit(retryDelaySeconds);
      throw new Error(`Rate limited during signed URL request. Retry after ${retryDelaySeconds}s`);
    }

    if (!response.ok) {
      let errorMessage = `Failed to get signed URL: ${response.status}`;

      try {
        const errorData = await response.json();
        if (errorData.error) {
          errorMessage = typeof errorData.error === 'string'
            ? errorData.error
            : errorData.error.message || errorMessage;
        }
      } catch {
        // Ignore JSON parsing errors
      }

      throw new Error(errorMessage);
    }

    const data = await response.json();

    if (!data.url) {
      throw new Error('Failed to get signed URL from Mistral API');
    }

    console.log(`[Mistral] Successfully got signed URL for file ID: ${fileId}`);

    return data.url;
  }

  // Process PDF with signed URL
  private async processPdfWithSignedUrl(signedUrl: string, signal: AbortSignal, startTime: number): Promise<OCRResult> {
    console.log(`[Mistral] Processing PDF with signed URL`);

    // Construct the request body according to Mistral documentation
    const requestBody = {
      model: "mistral-ocr-latest",
      document: {
        type: "document_url",
        document_url: signedUrl
      }
    };

    const response = await fetch("https://api.mistral.ai/v1/ocr", {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${this.settings.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      credentials: "omit"
    });

    // Handle rate limiting (429 Too Many Requests)
    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After');
      const retryDelaySeconds = retryAfter ? parseInt(retryAfter, 10) : 60;

      this.rateLimiter.setRateLimit(retryDelaySeconds);

      return {
        id: getUUID(),
        documentId: "",
        text: `Rate limited. Will retry after ${retryDelaySeconds}s.`,
        confidence: 0,
        language: this.settings.language || "unknown",
        processingTime: Date.now() - startTime,
        pageNumber: 1,
        totalPages: 1,
        error: `Rate limit exceeded (429). Retry after ${retryDelaySeconds}s`,
        rateLimitInfo: this.rateLimiter.getRateLimitInfo()
      };
    }

    // Handle other errors
    if (!response.ok) {
      let errorMessage = `Mistral OCR API error: ${response.status}`;

      try {
        const errorData = await response.json();

        console.error("[Mistral] API Error Response:", JSON.stringify(errorData, null, 2));

        if (errorData.error) {
          if (typeof errorData.error === 'string') {
            errorMessage = errorData.error;
          } else if (errorData.error.message) {
            errorMessage = errorData.error.message;
          } else if (errorData.error.type) {
            errorMessage = `${errorData.error.type}: ${errorData.error.message || 'Unknown error'}`;
          }
        } else if (errorData.message) {
          errorMessage = errorData.message;
        }
      } catch (parseError) {
        console.error("[Mistral] Failed to parse error response:", parseError);
      }

      throw new Error(errorMessage);
    }

    const data = await response.json() as MistralOCRResponse;

    // Log the response structure for debugging
    console.log(`[Mistral] Response structure:`,
      Object.keys(data).join(', '),
      data.pages ? `Pages: ${data.pages.length}` : 'No pages',
      data.text ? 'Has text' : 'No text'
    );

    // Extract text from Mistral OCR response
    let extractedText = "";
    let totalPages = 1;

    if (data && data.text) {
      extractedText = data.text;
    } else if (data && data.pages && data.pages.length > 0) {
      totalPages = data.pages.length;

      // Process each page in the response
      extractedText = data.pages.map(page => {
        if (page.markdown) {
          // Remove image references like ![img-0.jpeg](img-0.jpeg)
          const cleanedText = page.markdown
            .replace(/!\[.*?\]\(.*?\)/g, "") // Remove image references
            .replace(/\$\$([\s\S]*?)\$\$/g, "$1") // Keep math content but remove $$ delimiters
            .replace(/\\begin\{aligned\}([\s\S]*?)\\end\{aligned\}/g, "$1") // Keep aligned content but remove delimiters
            .trim();
          return cleanedText;
        }
        return page.text || "";
      }).join("\n\n");
    }

    // Log success
    console.log(`[Mistral] Successfully processed PDF with ${totalPages} page(s)`);

    return {
      id: getUUID(),
      documentId: "",
      text: extractedText,
      confidence: 1, // Mistral doesn't provide confidence scores, so we use 1
      language: this.settings.language || "unknown",
      processingTime: Date.now() - startTime,
      pageNumber: 1,
      totalPages: totalPages,
      rateLimitInfo: this.rateLimiter.isLimited() ? this.rateLimiter.getRateLimitInfo() : undefined
    };
  }
}

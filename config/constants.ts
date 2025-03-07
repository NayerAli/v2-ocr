export const CONFIG = {
  MAX_FILE_SIZE: 1024 * 1024 * 1024, // 1GB in bytes
  MAX_BATCH_SIZE: 50, // Maximum files in a batch
  MAX_QUEUE_DISPLAY: 5, // Number of items to show in queue
  MAX_CONCURRENT_PROCESSING: 3, // Maximum number of files to process at once
  CHUNK_SIZE: 10, // Number of pages to process at once for large PDFs
  SUPPORTED_TYPES: {
    "application/pdf": [".pdf"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/png": [".png"],
    "image/tiff": [".tif", ".tiff"],
    "image/webp": [".webp"],
  },
  SUPPORTED_APIS: ["google", "microsoft", "mistral"] as const,
  SUPPORTED_LANGUAGES: [
    { code: "ar", name: "العربية", direction: "rtl" },
    { code: "fa", name: "فارسی", direction: "rtl" },
    { code: "en", name: "English", direction: "ltr" },
  ] as const,
  DEFAULT_LANGUAGE: "ar",
  POLLING_INTERVAL: 1000, // How often to check for updates (ms)
  PREVIEW_MAX_SIZE: 500 * 1024, // Maximum size for preview generation (500KB)
} as const

export const API_CONFIGS = {
  google: {
    url: "https://vision.googleapis.com/v1/images:annotate",
    features: ["TEXT_DETECTION", "DOCUMENT_TEXT_DETECTION"],
    testEndpoint: "https://vision.googleapis.com/v1/locations",
  },
  microsoft: {
    url: "https://api.cognitive.microsoft.com/vision/v3.2/read/analyze",
    features: ["printed", "handwritten"],
    testEndpoint: "https://api.cognitive.microsoft.com/vision/v3.2/operations",
  },
  mistral: {
    url: "https://api.mistral.ai/v1/ocr",
    features: ["ocr"],
    testEndpoint: "https://api.mistral.ai/v1/ocr",
  },
} as const


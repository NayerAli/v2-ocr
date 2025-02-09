import type { OCRResult } from "../types"

const MOCK_TEXTS = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse.",
]

const MOCK_LANGUAGES = ["en", "es", "fr", "de"]

export async function mockOCRProcess(file: File): Promise<OCRResult[]> {
  // Simulate processing time based on file size
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  //const processingTime = Math.min(file.size / 1024 / 1024 * 1000, 5000) // 1 second per MB, max 5 seconds

  // Generate random number of pages based on file size (1 page per MB, min 1, max 10)
  const pageCount = Math.min(Math.max(Math.floor(file.size / 1024 / 1024) + 1, 1), 10)

  const results: OCRResult[] = []

  for (let i = 0; i < pageCount; i++) {
    await delay(1000) // Simulate processing time per page

    results.push({
      text: MOCK_TEXTS[Math.floor(Math.random() * MOCK_TEXTS.length)],
      confidence: Math.random() * 0.4 + 0.6, // Random confidence between 0.6 and 1.0
      language: MOCK_LANGUAGES[Math.floor(Math.random() * MOCK_LANGUAGES.length)],
      processingTime: Math.random() * 1000 + 500, // Random processing time between 500-1500ms
      pageNumber: i + 1,
      id: "",
      documentId: ""
    })
  }

  return results
}


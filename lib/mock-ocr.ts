import type { OCRResult } from "../types"

const MOCK_TEXTS = [
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
  "Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.",
  "Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.",
  "Duis aute irure dolor in reprehenderit in voluptate velit esse.",
]

const MOCK_LANGUAGES = ["en", "es", "fr", "de"]

export async function mockOCRProcess(file: File): Promise<OCRResult[]> {
  // Simulate processing time
  const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

  // Generate random number of pages (1-10)
  const pageCount = Math.floor(Math.random() * 10) + 1

  const results: OCRResult[] = []

  for (let i = 0; i < pageCount; i++) {
    await delay(1000) // Simulate processing time per page

    results.push({
      text: MOCK_TEXTS[Math.floor(Math.random() * MOCK_TEXTS.length)],
      confidence: Math.random() * 0.4 + 0.6, // Random confidence between 0.6 and 1.0
      language: MOCK_LANGUAGES[Math.floor(Math.random() * MOCK_LANGUAGES.length)],
      processingTime: Math.random() * 1000 + 500, // Random processing time between 500-1500ms
      pageNumber: i + 1,
    })
  }

  return results
}


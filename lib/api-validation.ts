export interface ValidationResult {
  isValid: boolean
  error?: string
}

export async function validateGoogleApiKey(apiKey: string): Promise<ValidationResult> {
  if (!apiKey) {
    return {
      isValid: false,
      error: "API key is required",
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        requests: [
          {
            image: {
              content: "",
            },
            features: [{ type: "TEXT_DETECTION" }],
          },
        ],
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.status === 400) {
      // This is actually a good sign - it means the key is valid but the request is invalid (empty image)
      return { isValid: true }
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: { message: `HTTP error! status: ${response.status}` } }))
      const errorMessage = data.error?.message || `Failed to validate API key: ${response.status}`
      
      if (errorMessage.includes("API key not valid") || response.status === 401) {
        return {
          isValid: false,
          error: "Invalid API key. Please check your credentials.",
        }
      }

      if (errorMessage.includes("API has not been used")) {
        return {
          isValid: false,
          error: "The Cloud Vision API is not enabled. Please enable it in your Google Cloud Console.",
        }
      }

      return {
        isValid: false,
        error: errorMessage,
      }
    }

    return { isValid: true }
  } catch (error) {
    console.error("API validation error:", error)
    if (error instanceof Error && error.name === "AbortError") {
      return {
        isValid: false,
        error: "Request timed out. Please check your internet connection.",
      }
    }
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "Failed to validate API key. Please check your internet connection.",
    }
  }
}

export async function validateMicrosoftApiKey(apiKey: string, region: string): Promise<ValidationResult> {
  if (!apiKey) {
    return {
      isValid: false,
      error: "API key is required",
    }
  }

  if (!region) {
    return {
      isValid: false,
      error: "Azure region is required",
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    const endpoint = `https://${region}.api.cognitive.microsoft.com/vision/v3.2/read/analyze`
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Ocp-Apim-Subscription-Key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: "https://example.com/dummy.jpg" }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (response.status === 400) {
      // This is actually a good sign - it means the key is valid but the URL is invalid
      return { isValid: true }
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({ error: { message: `HTTP error! status: ${response.status}` } }))
      const errorMessage = data.error?.message || `Failed to validate API key: ${response.status}`

      if (response.status === 401) {
        return {
          isValid: false,
          error: "Invalid API key. Please check your credentials.",
        }
      }

      if (response.status === 404) {
        return {
          isValid: false,
          error: "Invalid Azure region. Please check your region setting.",
        }
      }

      return {
        isValid: false,
        error: errorMessage,
      }
    }

    return { isValid: true }
  } catch (error) {
    console.error("API validation error:", error)
    if (error instanceof Error && error.name === "AbortError") {
      return {
        isValid: false,
        error: "Request timed out. Please check your internet connection.",
      }
    }
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "Failed to validate API key. Please check your internet connection.",
    }
  }
}

export async function validateMistralApiKey(apiKey: string): Promise<ValidationResult> {
  if (!apiKey) {
    return {
      isValid: false,
      error: "API key is required",
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    // Use a simpler validation approach - just check if the API key is valid
    // by making a request to the models endpoint which is lightweight
    const response = await fetch("https://api.mistral.ai/v1/models", {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
      // Don't include credentials for cross-origin requests
      credentials: "omit"
    })

    clearTimeout(timeoutId)

    if (response.ok) {
      return { isValid: true }
    }

    // Handle error cases
    if (response.status === 401) {
      return {
        isValid: false,
        error: "Invalid API key. Please check your credentials.",
      }
    }

    const data = await response.json().catch(() => ({ error: { message: `HTTP error! status: ${response.status}` } }))
    const errorMessage = data.error?.message || `Failed to validate API key: ${response.status}`

    return {
      isValid: false,
      error: errorMessage,
    }
  } catch (error) {
    return {
      isValid: false,
      error: error instanceof Error ? error.message : "An unknown error occurred",
    }
  }
}


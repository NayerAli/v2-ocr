export class APIError extends Error {
  constructor(
    message: string,
    public code: string,
    public provider: "google" | "microsoft",
    public status?: number,
  ) {
    super(message)
    this.name = "APIError"
  }
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof APIError) {
    switch (error.code) {
      case "AUTH_FAILED":
        return `Authentication failed for ${error.provider}. Please check your API key.`
      case "API_DISABLED":
        return `The ${error.provider} API is not enabled. Please enable it in your dashboard.`
      case "QUOTA_EXCEEDED":
        return `API quota exceeded for ${error.provider}. Please check your usage limits.`
      case "INVALID_REGION":
        return "Invalid Azure region specified. Please check your configuration."
      default:
        return error.message
    }
  }

  if (error instanceof Error) {
    return error.message
  }

  return "An unexpected error occurred"
}


import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { logApiRequestToConsole } from "@/lib/log";
import { validateGoogleApiKey, validateMicrosoftApiKey, validateMistralApiKey } from "@/lib/api-validation";

/**
 * POST /api/settings/validate-api
 * Validate OCR API key on the server
 */
export async function POST(req: NextRequest) {
  logApiRequestToConsole(req, 'POST', req.url);

  try {
    // Get the current user
    const user = await getServerUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Get the request body
    const body = await req.json();
    const { provider, apiKey, region, useSystemKey } = body;

    // Determine which API key to use
    let apiKeyToValidate = apiKey;

    // If using system key, use the server-side environment variable
    if (useSystemKey !== false && (!apiKey || apiKey.length === 0)) {
      apiKeyToValidate = process.env.OCR_API_KEY || "";
      console.log('[SERVER] Using system API key for validation');
    }

    // Validate the API key based on the provider
    let result;

    if (provider === "google") {
      result = await validateGoogleApiKey(apiKeyToValidate);
    } else if (provider === "microsoft") {
      result = await validateMicrosoftApiKey(apiKeyToValidate, region || "");
    } else if (provider === "mistral") {
      result = await validateMistralApiKey(apiKeyToValidate);
    } else {
      return NextResponse.json(
        { error: "Unsupported provider" },
        { status: 400 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error validating API key:", error);

    return NextResponse.json(
      { error: "Failed to validate API key", details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

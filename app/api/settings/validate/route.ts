import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { validateServerOCRSettings, validateServerOCRProvider } from "@/lib/ocr/server-settings";
import { logApiRequestToConsole } from "@/lib/log";

/**
 * GET /api/settings/validate
 * Validate OCR settings on the server
 */
export async function GET(req: NextRequest) {
  logApiRequestToConsole(req, 'GET', req.url);

  try {
    // Get the current user
    const user = await getServerUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Validate OCR settings
    const settingsValidation = await validateServerOCRSettings();

    // Validate OCR provider
    const providerValidation = await validateServerOCRProvider();

    return NextResponse.json({
      settings: settingsValidation,
      provider: providerValidation
    });
  } catch (error) {
    console.error("Error validating settings:", error);

    return NextResponse.json(
      { error: "Failed to validate settings" },
      { status: 500 }
    );
  }
}

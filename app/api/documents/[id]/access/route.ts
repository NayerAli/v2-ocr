import { NextRequest, NextResponse } from "next/server";
import { getServerUser } from "@/lib/server-auth";
import { canAccessDocument } from "@/lib/document-visibility";
import { logApiRequestToConsole } from "@/lib/log";

/**
 * GET /api/documents/[id]/access
 * Check if the current user can access a document
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  logApiRequestToConsole(req, 'GET', req.url, { id: params.id });

  try {
    // Get the current user from the server
    const user = await getServerUser();

    if (!user) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }

    // Check if the user can access the document
    const result = await canAccessDocument(params.id, user.id);

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error checking document access:", error);

    return NextResponse.json(
      { error: "Failed to check document access" },
      { status: 500 }
    );
  }
}

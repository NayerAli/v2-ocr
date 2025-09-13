import { NextRequest, NextResponse } from "next/server"
import { logApiRequestToConsole } from "@/lib/server-console-logger"
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/server-auth"
import { middlewareLog, prodError } from "@/lib/log"
import { normalizeStoragePath } from "@/lib/storage/path"
import type { Database } from "@/types/supabase"

type DocumentRow = Database["public"]["Tables"]["documents"]["Row"]
interface DocumentUpdatePayload {
  filename?: string
  originalFilename?: string | null
  status?: DocumentRow["status"]
  progress?: number | null
  currentPage?: number | null
  totalPages?: number | null
  fileSize?: number | null
  fileType?: string | null
  storagePath?: string | null
  thumbnailPath?: string | null
  error?: string | null
  processingStartedAt?: string | null
  processingCompletedAt?: string | null
}

/**
 * GET /api/documents/[id]
 * Get a document by ID
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  logApiRequestToConsole(req, "GET", req.url, { id: params.id })

  try {
    // Get the current user using server-side auth
    const supabase = await createServerSupabaseClient()
    const user = await getAuthenticatedUser(supabase)

    if (!user) {
      prodError('[SERVER] GET /api/documents/[id] - Unauthorized, no user found')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the document directly from Supabase instead of using db.getDocument
    const { data: documentData, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    const document = documentData as DocumentRow | null

    if (documentError || !document) {
      prodError('[SERVER] Error fetching document:', documentError?.message || 'Document not found')
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Map the document to the expected format
    const mappedDocument = {
      id: document.id,
      filename: document.filename,
      originalFilename: document.original_filename,
      status: document.status,
      progress: document.progress,
      currentPage: document.current_page,
      totalPages: document.total_pages,
      fileSize: document.file_size,
      fileType: document.file_type,
      storagePath: document.storage_path,
      thumbnailPath: document.thumbnail_path,
      error: document.error,
      createdAt: document.created_at,
      updatedAt: document.updated_at,
      processingStartedAt: document.processing_started_at,
      processingCompletedAt: document.processing_completed_at,
      user_id: document.user_id
    }

    return NextResponse.json(mappedDocument)
  } catch (error) {
    prodError('[SERVER] Error getting document:', error as Error)
    return NextResponse.json(
      { error: "Failed to get document" },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/documents/[id]
 * Update a document by ID
 */
export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  logApiRequestToConsole(req, "PUT", req.url, { id: params.id })

  try {
    // Get the current user using server-side auth
    const supabase = await createServerSupabaseClient()
    const user = await getAuthenticatedUser(supabase)

    if (!user) {
      prodError('[SERVER] PUT /api/documents/[id] - Unauthorized, no user found')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the document directly from Supabase instead of using db.getDocument
    const { data: existingData, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    const existingDocument = existingData as DocumentRow | null

    if (documentError || !existingDocument) {
      prodError('[SERVER] Error fetching document:', documentError?.message || 'Document not found')
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Document exists and belongs to the user

    // Get the updated document data from the request
    const updatedData = (await req.json()) as DocumentUpdatePayload
    middlewareLog('debug', '[SERVER] Updating document with data:', updatedData)
    middlewareLog('debug', '[SERVER] Original document from database:', {
      id: existingDocument.id,
      filename: existingDocument.filename,
      status: existingDocument.status,
      error: existingDocument.error
    })

    // Merge the existing document with the updated data
    const documentToUpdate: DocumentRow & DocumentUpdatePayload = {
      ...(existingDocument as DocumentRow),
      ...updatedData,
      id: params.id,
      user_id: user.id,
    }

    // Ensure error field is cleared when status is not 'error'
    if (documentToUpdate.status !== 'error') {
      documentToUpdate.error = null
      middlewareLog('debug', '[SERVER] Status is not error, clearing error field')
    }

    // Convert to snake_case for Supabase
    const snakeCaseDocument: DocumentRow = {
      id: documentToUpdate.id,
      filename: documentToUpdate.filename ?? existingDocument!.filename,
      original_filename: documentToUpdate.originalFilename ?? existingDocument!.original_filename,
      status: documentToUpdate.status ?? existingDocument!.status,
      progress: documentToUpdate.progress ?? existingDocument!.progress,
      current_page: documentToUpdate.currentPage ?? existingDocument!.current_page,
      total_pages: documentToUpdate.totalPages ?? existingDocument!.total_pages,
      file_size: documentToUpdate.fileSize ?? existingDocument!.file_size,
      file_type: documentToUpdate.fileType ?? existingDocument!.file_type,
      storage_path: documentToUpdate.storagePath ?? existingDocument!.storage_path,
      thumbnail_path: documentToUpdate.thumbnailPath ?? existingDocument!.thumbnail_path,
      error: documentToUpdate.error ?? existingDocument!.error,
      created_at: existingDocument!.created_at,
      updated_at: new Date().toISOString(),
      processing_started_at: documentToUpdate.processingStartedAt ?? existingDocument!.processing_started_at,
      processing_completed_at: documentToUpdate.processingCompletedAt ?? existingDocument!.processing_completed_at,
      user_id: documentToUpdate.user_id
    }

    middlewareLog('debug', '[SERVER] Prepared document for update:', {
      id: snakeCaseDocument.id,
      filename: snakeCaseDocument.filename,
      status: snakeCaseDocument.status,
      error: snakeCaseDocument.error,
      storage_path: snakeCaseDocument.storage_path
    })

    // Save the updated document directly to Supabase
    const { data: updatedDataRow, error: updateError } = await supabase
      .from('documents')
      .upsert(snakeCaseDocument)
      .select('*')
      .single()

    const updatedDocument = updatedDataRow as DocumentRow | null

    if (updateError || !updatedDocument) {
      prodError('[SERVER] Error updating document:', updateError?.message || 'Update failed')
      return NextResponse.json(
        { error: "Failed to update document" },
        { status: 500 }
      )
    }

    middlewareLog('important', '[SERVER] Document updated successfully:', {
      id: updatedDocument.id,
      filename: updatedDocument.filename,
      status: updatedDocument.status,
      error: updatedDocument.error
    })

    return NextResponse.json(updatedDocument)
  } catch (error) {
    prodError('[SERVER] Error updating document:', error as Error)
    return NextResponse.json(
      { error: "Failed to update document" },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/documents/[id]
 * Delete a document by ID
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  logApiRequestToConsole(req, "DELETE", req.url, { id: params.id })

  try {
    // Get the current user using server-side auth
    const supabase = await createServerSupabaseClient()
    const user = await getAuthenticatedUser(supabase)

    if (!user) {
      prodError('[SERVER] DELETE /api/documents/[id] - Unauthorized, no user found')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the document directly from Supabase instead of using db.getDocument
    const { data: documentData, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    const document = documentData as DocumentRow | null

    if (documentError || !document) {
      prodError('[SERVER] Error fetching document:', documentError?.message || 'Document not found')
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Delete the document from storage if it exists
    if (document.storage_path) {
      const fullPath = normalizeStoragePath(user.id, document.storage_path);
      console.log('[DEBUG] Deleting document from storage:', fullPath);
      const { error: storageError } = await supabase
        .storage
        .from('ocr-documents')
        .remove([fullPath])

      if (storageError) {
        console.error('[DEBUG] Error deleting document from storage:', storageError)
        // Continue with deletion even if storage removal fails
      }
    }

    // Delete the thumbnail from storage if it exists
    if (document.thumbnail_path) {
      const fullThumbnailPath = normalizeStoragePath(user.id, document.thumbnail_path);
      console.log('[DEBUG] Deleting thumbnail from storage:', fullThumbnailPath);
      const { error: thumbnailError } = await supabase
        .storage
        .from('thumbnails')
        .remove([fullThumbnailPath])

      if (thumbnailError) {
        console.error('[DEBUG] Error deleting thumbnail from storage:', thumbnailError)
        // Continue with deletion even if thumbnail removal fails
      }
    }

    // Delete any OCR results first
    const { error: resultsError } = await supabase
      .from('ocr_results')
      .delete()
      .eq('document_id', params.id)
      .eq('user_id', user.id)

    if (resultsError) {
      prodError('[SERVER] Error deleting OCR results:', resultsError.message)
      // Continue even if results deletion fails
    }

    // Finally, delete the document from the database
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (deleteError) {
      prodError('[SERVER] Error deleting document:', deleteError.message)
      return NextResponse.json({ error: "Failed to delete document" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    prodError('[SERVER] Error deleting document:', error as Error)
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    )
  }
}

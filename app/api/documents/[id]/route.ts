import { NextRequest, NextResponse } from "next/server"
import { logApiRequestToConsole } from "@/lib/server-console-logger"
import { createServerSupabaseClient } from "@/lib/server-auth"

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

    // First try to get the user directly (more secure than using session user)
    const { data: userData, error: userError } = await supabase.auth.getUser()

    let user = null;

    if (userData?.user) {
      console.log('[SERVER] User authenticated from getUser:', userData.user.email)
      user = userData.user
    } else if (userError) {
      console.error('[SERVER] GET /api/documents/[id] - Error getting user:', userError.message)
      
      // Fallback to session if getUser fails
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.error('[SERVER] GET /api/documents/[id] - Session error:', sessionError.message)
      }

      if (sessionData?.session?.user) {
        console.warn('[SERVER] GET /api/documents/[id] - Using session user as fallback (less secure)')
        user = sessionData.session.user
      }
    }
    
    // If still no user, try to extract from cookies as last resort
    if (!user) {
      try {
        // Get the cookies from the request
        const cookieHeader = req.headers.get('cookie') || ''
        const cookies = cookieHeader.split(';').map(c => c.trim())

        // Find auth cookies
        const authCookie = cookies.find(c =>
          c.startsWith('sb-auth-token=') ||
          c.startsWith('sb-localhost:8000-auth-token=') ||
          c.includes('-auth-token=')
        )

        if (authCookie) {
          // Extract the token value
          const tokenValue = authCookie.split('=')[1]
          if (tokenValue) {
            // Parse the token
            try {
              const tokenData = JSON.parse(decodeURIComponent(tokenValue))
              if (tokenData.access_token) {
                // Set the session manually
                const { data: manualSessionData, error: manualSessionError } =
                  await supabase.auth.setSession({
                    access_token: tokenData.access_token,
                    refresh_token: tokenData.refresh_token || ''
                  })

                if (manualSessionData?.user) {
                  console.log('[SERVER] User authenticated from manual token:', manualSessionData.user.email)
                  user = manualSessionData.user
                } else if (manualSessionError) {
                  console.error('[SERVER] Error setting manual session:', manualSessionError.message)
                }
              }
            } catch (parseError) {
              console.error('[SERVER] Error parsing auth token:', parseError)
            }
          }
        }
      } catch (cookieError) {
        console.error('[SERVER] Error extracting user from cookies:', cookieError)
      }
    }
    
    // If still no user, return unauthorized
    if (!user) {
      console.error('[SERVER] GET /api/documents/[id] - Unauthorized, no user found. Auth session missing!')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the document directly from Supabase instead of using db.getDocument
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (documentError || !document) {
      console.error('[SERVER] Error fetching document:', documentError?.message || 'Document not found')
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
    console.error("Error getting document:", error)
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

    // First try to get the user directly (more secure than using session user)
    const { data: userData, error: userError } = await supabase.auth.getUser()

    let user = null;

    if (userData?.user) {
      console.log('[SERVER] User authenticated from getUser:', userData.user.email)
      user = userData.user
    } else if (userError) {
      console.error('[SERVER] PUT /api/documents/[id] - Error getting user:', userError.message)
      
      // Fallback to session if getUser fails
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.error('[SERVER] PUT /api/documents/[id] - Session error:', sessionError.message)
      }

      if (sessionData?.session?.user) {
        console.warn('[SERVER] PUT /api/documents/[id] - Using session user as fallback (less secure)')
        user = sessionData.session.user
      }
    }
    
    // If still no user, try to extract from cookies as last resort
    if (!user) {
      try {
        // Get the cookies from the request
        const cookieHeader = req.headers.get('cookie') || ''
        const cookies = cookieHeader.split(';').map(c => c.trim())

        // Find auth cookies
        const authCookie = cookies.find(c =>
          c.startsWith('sb-auth-token=') ||
          c.startsWith('sb-localhost:8000-auth-token=') ||
          c.includes('-auth-token=')
        )

        if (authCookie) {
          // Extract the token value
          const tokenValue = authCookie.split('=')[1]
          if (tokenValue) {
            // Parse the token
            try {
              const tokenData = JSON.parse(decodeURIComponent(tokenValue))
              if (tokenData.access_token) {
                // Set the session manually
                const { data: manualSessionData, error: manualSessionError } =
                  await supabase.auth.setSession({
                    access_token: tokenData.access_token,
                    refresh_token: tokenData.refresh_token || ''
                  })

                if (manualSessionData?.user) {
                  console.log('[SERVER] User authenticated from manual token:', manualSessionData.user.email)
                  user = manualSessionData.user
                } else if (manualSessionError) {
                  console.error('[SERVER] Error setting manual session:', manualSessionError.message)
                }
              }
            } catch (parseError) {
              console.error('[SERVER] Error parsing auth token:', parseError)
            }
          }
        }
      } catch (cookieError) {
        console.error('[SERVER] Error extracting user from cookies:', cookieError)
      }
    }
    
    // If still no user, return unauthorized
    if (!user) {
      console.error('[SERVER] PUT /api/documents/[id] - Unauthorized, no user found. Auth session missing!')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the document directly from Supabase instead of using db.getDocument
    const { data: existingDocument, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (documentError || !existingDocument) {
      console.error('[SERVER] Error fetching document:', documentError?.message || 'Document not found')
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Document exists and belongs to the user

    // Get the updated document data from the request
    const updatedData = await req.json()
    console.log("[SERVER] Updating document with data:", updatedData)
    console.log("[SERVER] Original document from database:", {
      id: existingDocument.id,
      filename: existingDocument.filename,
      status: existingDocument.status,
      error: existingDocument.error
    })

    // Merge the existing document with the updated data
    const documentToUpdate = {
      ...existingDocument,
      ...updatedData,
      id: params.id, // Ensure ID doesn't change
      user_id: user.id, // Ensure user_id doesn't change
    }

    // Ensure error field is cleared when status is not 'error'
    if (documentToUpdate.status !== 'error') {
      documentToUpdate.error = undefined;
      console.log('[SERVER] Status is not error, clearing error field');
    }

    // Convert to snake_case for Supabase
    const snakeCaseDocument = {
      id: documentToUpdate.id,
      filename: documentToUpdate.filename,
      original_filename: documentToUpdate.originalFilename,
      status: documentToUpdate.status,
      progress: documentToUpdate.progress,
      current_page: documentToUpdate.currentPage,
      total_pages: documentToUpdate.totalPages,
      file_size: documentToUpdate.fileSize,
      file_type: documentToUpdate.fileType,
      storage_path: documentToUpdate.storagePath,
      thumbnail_path: documentToUpdate.thumbnailPath,
      error: documentToUpdate.error,
      created_at: documentToUpdate.createdAt,
      updated_at: new Date().toISOString(),
      processing_started_at: documentToUpdate.processingStartedAt,
      processing_completed_at: documentToUpdate.processingCompletedAt,
      user_id: documentToUpdate.user_id
    }

    console.log("[SERVER] Prepared document for update:", {
      id: snakeCaseDocument.id,
      filename: snakeCaseDocument.filename,
      status: snakeCaseDocument.status,
      error: snakeCaseDocument.error,
      storage_path: snakeCaseDocument.storage_path
    })

    // Save the updated document directly to Supabase
    const { data: updatedDocument, error: updateError } = await supabase
      .from('documents')
      .upsert(snakeCaseDocument)
      .select()
      .single()

    if (updateError || !updatedDocument) {
      console.error('[SERVER] Error updating document:', updateError?.message || 'Update failed')
      return NextResponse.json(
        { error: "Failed to update document" },
        { status: 500 }
      )
    }

    console.log('[SERVER] Document updated successfully:', {
      id: updatedDocument.id,
      filename: updatedDocument.filename,
      status: updatedDocument.status,
      error: updatedDocument.error
    })

    return NextResponse.json(updatedDocument)
  } catch (error) {
    console.error("Error updating document:", error)
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

    // First try to get the user directly (more secure than using session user)
    const { data: userData, error: userError } = await supabase.auth.getUser()

    let user = null;

    if (userData?.user) {
      console.log('[SERVER] User authenticated from getUser:', userData.user.email)
      user = userData.user
    } else if (userError) {
      console.error('[SERVER] DELETE /api/documents/[id] - Error getting user:', userError.message)
      
      // Fallback to session if getUser fails
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
      
      if (sessionError) {
        console.error('[SERVER] DELETE /api/documents/[id] - Session error:', sessionError.message)
      }

      if (sessionData?.session?.user) {
        console.warn('[SERVER] DELETE /api/documents/[id] - Using session user as fallback (less secure)')
        user = sessionData.session.user
      }
    }
    
    // If still no user, try to extract from cookies as last resort
    if (!user) {
      try {
        // Get the cookies from the request
        const cookieHeader = req.headers.get('cookie') || ''
        const cookies = cookieHeader.split(';').map(c => c.trim())

        // Find auth cookies
        const authCookie = cookies.find(c =>
          c.startsWith('sb-auth-token=') ||
          c.startsWith('sb-localhost:8000-auth-token=') ||
          c.includes('-auth-token=')
        )

        if (authCookie) {
          // Extract the token value
          const tokenValue = authCookie.split('=')[1]
          if (tokenValue) {
            // Parse the token
            try {
              const tokenData = JSON.parse(decodeURIComponent(tokenValue))
              if (tokenData.access_token) {
                // Set the session manually
                const { data: manualSessionData, error: manualSessionError } =
                  await supabase.auth.setSession({
                    access_token: tokenData.access_token,
                    refresh_token: tokenData.refresh_token || ''
                  })

                if (manualSessionData?.user) {
                  console.log('[SERVER] User authenticated from manual token:', manualSessionData.user.email)
                  user = manualSessionData.user
                } else if (manualSessionError) {
                  console.error('[SERVER] Error setting manual session:', manualSessionError.message)
                }
              }
            } catch (parseError) {
              console.error('[SERVER] Error parsing auth token:', parseError)
            }
          }
        }
      } catch (cookieError) {
        console.error('[SERVER] Error extracting user from cookies:', cookieError)
      }
    }
    
    // If still no user, return unauthorized
    if (!user) {
      console.error('[SERVER] DELETE /api/documents/[id] - Unauthorized, no user found. Auth session missing!')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get the document directly from Supabase instead of using db.getDocument
    const { data: document, error: documentError } = await supabase
      .from('documents')
      .select('*')
      .eq('id', params.id)
      .eq('user_id', user.id)
      .single()

    if (documentError || !document) {
      console.error('[SERVER] Error fetching document:', documentError?.message || 'Document not found')
      return NextResponse.json({ error: "Document not found" }, { status: 404 })
    }

    // Delete the document directly using Supabase
    const { error: deleteError } = await supabase
      .from('documents')
      .delete()
      .eq('id', params.id)
      .eq('user_id', user.id)

    if (deleteError) {
      console.error('[SERVER] Error deleting document:', deleteError.message)
      return NextResponse.json({ error: "Failed to delete document" }, { status: 500 })
    }

    // Also delete any OCR results
    const { error: resultsError } = await supabase
      .from('ocr_results')
      .delete()
      .eq('document_id', params.id)
      .eq('user_id', user.id)

    if (resultsError) {
      console.error('[SERVER] Error deleting OCR results:', resultsError.message)
      // Continue even if results deletion fails
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error deleting document:", error)
    return NextResponse.json(
      { error: "Failed to delete document" },
      { status: 500 }
    )
  }
}

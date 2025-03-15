import { NextRequest, NextResponse } from 'next/server';
import { processFile } from '@/lib/server/processing-service';
import { getSettings } from '@/lib/server/settings';
import { db } from '@/lib/server/database';
import { isAllowedFileType } from '@/lib/utils';
import { SettingsProvider } from '@/lib/server/settings-provider';

const settingsProvider = SettingsProvider.getInstance();

/**
 * POST /api/process
 * Process a file for OCR
 */
export async function POST(request: NextRequest) {
  try {
    // Initialize settings provider if needed
    await settingsProvider.initialize();

    // Get current settings
    const settings = settingsProvider.getSettings();
    if (!settings) {
      console.error('[Process] Settings not initialized');
      return NextResponse.json(
        { error: 'Settings not initialized' },
        { status: 500 }
      );
    }

    console.log('[Process] Using settings:', {
      ocrProvider: settings.ocr.provider,
      apiKey: settings.ocr.apiKey ? '***' : 'not set',
      maxFileSize: settings.upload.maxFileSize,
      allowedTypes: settings.upload.allowedFileTypes
    });
    
    // Get the uploaded file
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      console.error('[Process] No file provided');
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    console.log('[Process] Received file:', {
      name: file.name,
      type: file.type,
      size: file.size
    });
    
    // Check file size
    if (file.size > settings.upload.maxFileSize * 1024 * 1024) {
      console.error('[Process] File too large:', {
        size: file.size,
        maxSize: settings.upload.maxFileSize * 1024 * 1024
      });
      return NextResponse.json(
        { error: `File size exceeds maximum allowed size of ${settings.upload.maxFileSize}MB` },
        { status: 400 }
      );
    }
    
    // Check file type
    if (!isAllowedFileType(file.type, settings.upload.allowedFileTypes)) {
      console.error('[Process] File type not allowed:', {
        type: file.type,
        allowedTypes: settings.upload.allowedFileTypes
      });
      return NextResponse.json(
        { error: `File type ${file.type} not allowed` },
        { status: 400 }
      );
    }
    
    // Process the file
    const buffer = await file.arrayBuffer();
    const result = await processFile(
      Buffer.from(buffer),
      file.name,
      file.type
    );
    return NextResponse.json(result);
  } catch (error) {
    console.error('[Process] Error processing file:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to process file' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'No document ID provided' },
        { status: 400 }
      );
    }
    
    const status = await db.getQueueItem(id);
    if (!status) {
      return NextResponse.json(
        { error: 'Document not found' },
        { status: 404 }
      );
    }
    
    return NextResponse.json(status);
  } catch (error) {
    console.error('Error getting document status:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to get document status' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json(
        { error: 'No document ID provided' },
        { status: 400 }
      );
    }
    
    await db.removeFromQueue(id);
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing document:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to remove document' },
      { status: 500 }
    );
  }
}

// Increase the body size limit for file uploads
export const config = {
  api: {
    bodyParser: false, // Disable the built-in parser
    responseLimit: '50mb',
  },
}; 
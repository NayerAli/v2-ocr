import { NextRequest, NextResponse } from 'next/server';
import { processFile } from '@/lib/server/processing-service';
import { getSettings } from '@/lib/server/settings';

/**
 * POST /api/process
 * Process a file for OCR
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json(
        { error: 'No file provided' },
        { status: 400 }
      );
    }
    
    // Get settings
    const settings = await getSettings();
    
    // Validate file size
    const fileSizeMB = file.size / (1024 * 1024);
    if (fileSizeMB > settings.upload.maxFileSize) {
      return NextResponse.json(
        { error: `File size exceeds the maximum allowed size of ${settings.upload.maxFileSize}MB` },
        { status: 400 }
      );
    }
    
    // Validate file type
    const fileExtension = `.${file.name.split('.').pop()?.toLowerCase()}`;
    if (!settings.upload.allowedFileTypes.includes(fileExtension)) {
      return NextResponse.json(
        { error: `File type ${fileExtension} is not allowed` },
        { status: 400 }
      );
    }
    
    // Convert file to buffer
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // Process the file
    const { id, status } = await processFile(
      buffer,
      file.name,
      file.type,
      settings
    );
    
    return NextResponse.json({ id, status });
  } catch (error: any) {
    console.error('Error processing file:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to process file' },
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
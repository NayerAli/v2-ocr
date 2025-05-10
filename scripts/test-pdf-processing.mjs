// Test script for PDF processing
import fs from 'fs';
import path from 'path';
import fetch from 'node-fetch';
import FormData from 'form-data';

// Configuration
const API_URL = 'http://localhost:3000/api/documents/process';
const PDF_PATH = path.join(process.cwd(), 'scripts', '145.jpg'); // Use the test image provided by the user

// Function to upload a file
async function uploadFile() {
  try {
    console.log(`Uploading file: ${PDF_PATH}`);

    // Check if file exists
    if (!fs.existsSync(PDF_PATH)) {
      console.error(`File not found: ${PDF_PATH}`);
      return;
    }

    // Create form data
    const formData = new FormData();
    formData.append('file', fs.createReadStream(PDF_PATH));

    // Upload file
    const response = await fetch(API_URL, {
      method: 'POST',
      body: formData,
    });

    // Check response
    if (response.ok) {
      const data = await response.json();
      console.log('Upload successful!');
      console.log('Response:', JSON.stringify(data, null, 2));
    } else {
      console.error(`Upload failed with status: ${response.status}`);
      const errorText = await response.text();
      console.error('Error:', errorText);
    }
  } catch (error) {
    console.error('Error uploading file:', error);
  }
}

// Run the upload
uploadFile();

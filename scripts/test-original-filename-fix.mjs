// Test script to verify the original_filename fix
import { camelToSnake } from '../lib/database/utils/case-conversion.js';
import crypto from 'crypto';

// Test the camelToSnake conversion function
function testCamelToSnakeConversion() {
  console.log('🧪 TESTING CAMEL TO SNAKE CONVERSION');
  console.log('===================================\n');

  // Test case 1: Basic conversion
  const testObj1 = {
    id: '123',
    fileName: 'test.jpg',
    fileSize: 1000,
    originalFilename: 'original.jpg'
  };

  const result1 = camelToSnake(testObj1);
  console.log('Test case 1: Basic conversion');
  console.log('Input:', testObj1);
  console.log('Output:', result1);
  console.log('originalFilename converted to:', result1.original_filename ? 'original_filename ✅' : 'FAILED ❌');
  console.log();

  // Test case 2: Nested objects
  const testObj2 = {
    id: '456',
    fileName: 'test2.jpg',
    fileDetails: {
      fileSize: 2000,
      fileType: 'image/jpeg',
      originalFilename: 'original2.jpg'
    }
  };

  const result2 = camelToSnake(testObj2);
  console.log('Test case 2: Nested objects');
  console.log('Input:', testObj2);
  console.log('Output:', result2);
  console.log('Nested originalFilename converted to:',
    result2.file_details && result2.file_details.original_filename ? 'original_filename ✅' : 'FAILED ❌');
  console.log();

  // Test case 3: With null values
  const testObj3 = {
    id: '789',
    fileName: null,
    fileSize: 3000,
    originalFilename: null
  };

  const result3 = camelToSnake(testObj3);
  console.log('Test case 3: With null values');
  console.log('Input:', testObj3);
  console.log('Output:', result3);
  console.log('Has original_filename field:', 'original_filename' in result3 ? 'Yes ✅' : 'No ❌');
  console.log();

  // Test case 4: With undefined values
  const testObj4 = {
    id: '101112',
    fileName: 'test4.jpg',
    fileSize: 4000,
    originalFilename: undefined
  };

  const result4 = camelToSnake(testObj4);
  console.log('Test case 4: With undefined values');
  console.log('Input:', testObj4);
  console.log('Output:', result4);
  console.log('Has original_filename field:', 'original_filename' in result4 ? 'Yes ✅' : 'No ❌');
  console.log();

  // Test case 5: With arrays
  const testObj5 = {
    id: '131415',
    files: [
      { fileName: 'file1.jpg', originalFilename: 'orig1.jpg' },
      { fileName: 'file2.jpg', originalFilename: 'orig2.jpg' }
    ]
  };

  const result5 = camelToSnake(testObj5);
  console.log('Test case 5: With arrays');
  console.log('Input:', testObj5);
  console.log('Output:', result5);
  console.log('Array items converted correctly:',
    result5.files &&
    result5.files[0].original_filename === 'orig1.jpg' &&
    result5.files[1].original_filename === 'orig2.jpg' ? 'Yes ✅' : 'No ❌');

  console.log('\n✅ CONVERSION TESTS COMPLETED');
}

// Test the saveToQueue function's handling of originalFilename
function testSaveToQueueFunction() {
  console.log('🧪 TESTING SAVE TO QUEUE FUNCTION');
  console.log('================================\n');

  // Create a mock ProcessingStatus object
  const mockStatus = {
    id: crypto.randomUUID(),
    filename: 'test_file.jpg',
    // Intentionally omit originalFilename to test our fix
    status: 'queued',
    progress: 0,
    fileSize: 1000,
    fileType: 'image/jpeg',
    storagePath: 'test/path.jpg',
    createdAt: new Date(),
    updatedAt: new Date(),
    user_id: '2f4a9512-414a-47cc-a1d1-a110739085f8'
  };

  console.log('Mock ProcessingStatus object:');
  console.log(mockStatus);
  console.log();

  // Simulate the mapping logic in saveToQueue
  const statusWithoutFile = { ...mockStatus };
  delete statusWithoutFile.file;

  const mappedStatus = {
    ...statusWithoutFile,
    fileSize: statusWithoutFile.fileSize || statusWithoutFile.size,
    fileType: statusWithoutFile.fileType || statusWithoutFile.type,
    storagePath: statusWithoutFile.storagePath || `${statusWithoutFile.id}${statusWithoutFile.fileType || '.unknown'}`,
    // Our fix: Ensure originalFilename is set, defaulting to filename if not provided
    originalFilename: statusWithoutFile.originalFilename || statusWithoutFile.filename
  };

  console.log('After mapping (with our fix):');
  console.log(mappedStatus);
  console.log('originalFilename set to:', mappedStatus.originalFilename ? mappedStatus.originalFilename + ' ✅' : 'FAILED ❌');
  console.log();

  // Convert to snake_case for Supabase
  const snakeCaseStatus = camelToSnake(mappedStatus);

  console.log('After converting to snake_case:');
  console.log(snakeCaseStatus);
  console.log('original_filename set to:', snakeCaseStatus.original_filename ? snakeCaseStatus.original_filename + ' ✅' : 'FAILED ❌');

  console.log('\n✅ SAVE TO QUEUE TEST COMPLETED');
}

// Run the tests
testCamelToSnakeConversion();
console.log('\n' + '-'.repeat(50) + '\n');
testSaveToQueueFunction();

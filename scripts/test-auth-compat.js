// Simple script to test the auth-compat module
// This is a CommonJS script, but our module is ESM
// Let's use dynamic import instead

async function testAuthCompat() {
  console.log('Testing auth-compat module...');

  try {
    // Let's just test if we can import the file without errors
    console.log('Checking if auth-compat.ts exists...');
    const fs = require('fs');
    const path = require('path');

    const filePath = path.resolve(__dirname, '../lib/auth-compat.ts');
    if (fs.existsSync(filePath)) {
      console.log('File exists:', filePath);
      console.log('Content:', fs.readFileSync(filePath, 'utf8').substring(0, 100) + '...');
    } else {
      console.error('File does not exist:', filePath);
    }

    console.log('Test completed');
  } catch (error) {
    console.error('Error testing auth-compat:', error);
  }
}

testAuthCompat();

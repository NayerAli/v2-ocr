// Simple script to check if we can run the Next.js application
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function checkNextApp() {
  console.log('Checking Next.js application...');

  try {
    // Check if the auth-compat.ts file exists
    const authCompatPath = path.resolve(__dirname, '../lib/auth-compat.ts');
    if (fs.existsSync(authCompatPath)) {
      console.log('auth-compat.ts exists');
    } else {
      console.error('auth-compat.ts does not exist');
      return;
    }

    // Check if the file-processor.ts file exists
    const fileProcessorPath = path.resolve(__dirname, '../lib/ocr/file-processor.ts');
    if (fs.existsSync(fileProcessorPath)) {
      console.log('file-processor.ts exists');

      // Check if it imports auth-compat
      const fileProcessorContent = fs.readFileSync(fileProcessorPath, 'utf8');
      if (fileProcessorContent.includes('import { authCompat } from "@/lib/auth-compat"')) {
        console.log('file-processor.ts imports auth-compat correctly');
      } else {
        console.error('file-processor.ts does not import auth-compat correctly');
      }
    } else {
      console.error('file-processor.ts does not exist');
    }

    // Check if the user-settings-service.ts file exists
    const userSettingsPath = path.resolve(__dirname, '../lib/user-settings-service.ts');
    if (fs.existsSync(userSettingsPath)) {
      console.log('user-settings-service.ts exists');

      // Check if it imports auth-compat
      const userSettingsContent = fs.readFileSync(userSettingsPath, 'utf8');
      const importMatch = userSettingsContent.match(/import\s+{\s*authCompat\s*}\s+from\s+['"]([^'"]+)['"]/);
      if (importMatch) {
        console.log('user-settings-service.ts imports auth-compat from:', importMatch[1]);
      } else {
        console.error('user-settings-service.ts does not import auth-compat');
        // Show the first 10 lines
        console.log('First 10 lines of user-settings-service.ts:');
        console.log(userSettingsContent.split('\n').slice(0, 10).join('\n'));
      }
    } else {
      console.error('user-settings-service.ts does not exist');
    }

    console.log('Check completed');
  } catch (error) {
    console.error('Error checking Next.js application:', error);
  }
}

checkNextApp();

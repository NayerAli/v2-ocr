import { validateServerOCRSettings } from "@/lib/ocr/server-settings";
import { getServerUser } from "@/lib/server-auth";
import DashboardClient from "./page.client";

/**
 * Server component for dashboard page
 * This component validates OCR settings on the server before rendering the client component
 */
export default async function DashboardPage() {
  // Default to 'configured' for unauthenticated users
  let configStatus: 'api-key-missing' | 'configuration-required' | 'configured' = 'configured';

  try {
    // Get the current user from the server
    const user = await getServerUser();
    
    console.log('[SERVER] User authentication check:', !!user);
    
    // Only validate OCR settings if user is authenticated
    if (user) {
      // Validate OCR settings on the server
      const { apiKeyMissing, isConfigured } = await validateServerOCRSettings();
      
      console.log('[SERVER] OCR settings validation:', { apiKeyMissing, isConfigured });

      // Calculate configuration status only for authenticated users
      configStatus = apiKeyMissing
        ? 'api-key-missing'
        : !isConfigured
          ? 'configuration-required'
          : 'configured';
          
      console.log('[SERVER] Final configStatus for authenticated user:', configStatus);
    } else {
      console.log('[SERVER] Skipping OCR validation - user not authenticated');
    }
  } catch (error) {
    // If there's an error getting the user or validating settings,
    // just continue with default 'configured' status for unauthenticated users
    console.error('[SERVER] Error in DashboardPage:', error);
  }

  console.log('[SERVER] Returning configStatus:', configStatus);
  
  // Return the client component with server-validated data
  return <DashboardClient configStatus={configStatus} />;
}

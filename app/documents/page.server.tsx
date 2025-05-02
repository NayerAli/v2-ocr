import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-auth';

/**
 * Server component for documents page
 * This component validates user authentication on the server before rendering the client component
 */
export default async function DocumentsPageServer() {
  // Get the current user from the server
  const user = await getServerUser();

  // If user is not authenticated, redirect to login
  if (!user) {
    redirect('/auth/login?redirect=/documents');
  }

  // We'll fetch documents client-side instead
  // No need to prefetch

  // Import the client component
  const DocumentsPage = (await import('./page')).default;

  // Create a wrapper component to pass the documents data
  const DocumentsPageWrapper = () => {
    // Use client-side data fetching instead of passing the documents directly
    return <DocumentsPage />;
  };

  // Return the wrapper component
  return <DocumentsPageWrapper />;
}

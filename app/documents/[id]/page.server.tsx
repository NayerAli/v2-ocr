import { redirect } from 'next/navigation';
import { getServerUser } from '@/lib/server-auth';
import { canAccessDocument } from '@/lib/document-visibility';

interface DocumentPageProps {
  params: {
    id: string;
  };
}

/**
 * Server component for document page
 * This component validates document access on the server before rendering the client component
 */
export default async function DocumentPageServer({ params }: DocumentPageProps) {
  // Get the current user from the server
  const user = await getServerUser();

  // If user is not authenticated, redirect to login
  if (!user) {
    redirect('/auth/login?redirect=/documents/' + params.id);
  }

  // Check if the user can access the document
  const { canAccess, canView, reason } = await canAccessDocument(params.id, user.id);

  // If the user can't access the document, redirect to the documents page
  if (!canAccess) {
    redirect('/documents?error=access_denied&reason=' + encodeURIComponent(reason || 'Access denied'));
  }

  // If the document can't be viewed, redirect to the documents page
  if (!canView) {
    redirect('/documents?error=not_viewable&reason=' + encodeURIComponent(reason || 'Document not viewable'));
  }

  // If we get here, the user can access and view the document
  // We can now render the client component with the document data

  // Import the client component
  const DocumentPage = (await import('./page')).default;

  // Create a wrapper component to pass the document data
  const DocumentPageWrapper = () => {
    // Use client-side data fetching instead of passing the document directly
    return <DocumentPage params={params} />;
  };

  // Return the wrapper component
  return <DocumentPageWrapper />;
}

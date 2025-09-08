import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server-client';
import { mapToProcessingStatus } from '@/lib/database/utils/mappers';

export async function POST(req: Request) {
  const { jobId } = await req.json();
  const supabase = getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data } = await supabase
    .from('documents')
    .update({ status: 'queued', error: null, updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('user_id', user.id)
    .select()
    .single();
  return NextResponse.json({ job: data ? mapToProcessingStatus(data) : null });
}

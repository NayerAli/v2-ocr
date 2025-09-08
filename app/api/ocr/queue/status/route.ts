import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server-client';
import { mapToProcessingStatus } from '@/lib/database/utils/mappers';

export async function GET(req: Request) {
  const supabase = getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');
  if (jobId) {
    const { data } = await supabase
      .from('documents')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single();
    return NextResponse.json({ job: data ? mapToProcessingStatus(data) : null });
  }

  const { data } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  const jobs = data?.map(mapToProcessingStatus) ?? [];
  return NextResponse.json({ jobs });
}

import { NextResponse } from 'next/server';
import { getServerClient } from '@/lib/supabase/server-client';

export async function POST(req: Request) {
  const { jobId } = await req.json();
  const supabase = getServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  await supabase
    .from('documents')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('user_id', user.id);
  return NextResponse.json({ status: 'cancelled', jobId });
}

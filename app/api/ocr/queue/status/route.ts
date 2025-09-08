import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getServiceClient } from '@/lib/supabase/service-client';
import { mapToProcessingStatus } from '@/lib/database/utils/mappers';
import type { Database } from '@/types/supabase';

export async function GET(req: Request) {
  const cookieStore = cookies();
  const supabaseAuth = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookies) {
          cookies.forEach((cookie) =>
            cookieStore.set(cookie.name, cookie.value, cookie.options)
          );
        },
      },
    }
  );
  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getServiceClient();
  if (!supabase) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
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

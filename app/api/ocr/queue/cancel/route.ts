import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { getServiceClient } from '@/lib/supabase/service-client';
import type { Database } from '@/types/supabase';

export async function POST(req: Request) {
  const { jobId } = await req.json();
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

  await supabase
    .from('documents')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('user_id', user.id);
  return NextResponse.json({ status: 'cancelled', jobId });
}

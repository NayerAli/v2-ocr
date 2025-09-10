import { NextResponse } from 'next/server';
import { createServerSupabaseClient, getAuthenticatedUser } from '@/lib/server-auth'
import { mapToProcessingStatus } from '@/lib/database/utils'

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const jobId = searchParams.get('jobId');
  const supabase = createServerSupabaseClient()
  const user = await getAuthenticatedUser(supabase)
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (jobId) {
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', user.id)
      .single()
    if (error || !data) return NextResponse.json({ job: null })
    return NextResponse.json({ job: mapToProcessingStatus(data) })
  }
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
  if (error || !data) return NextResponse.json({ jobs: [] })
  return NextResponse.json({ jobs: data.map(mapToProcessingStatus) })
}

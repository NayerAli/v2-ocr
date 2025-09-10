import { NextResponse } from 'next/server'
import { createServerSupabaseClient, getAuthenticatedUser } from '@/lib/server-auth'

export async function POST(req: Request) {
  const { jobId } = await req.json()
  const supabase = createServerSupabaseClient()
  const user = await getAuthenticatedUser(supabase)
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase
    .from('documents')
    .update({ status: 'cancelled', updated_at: new Date().toISOString() })
    .eq('id', jobId)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: 'Failed to cancel' }, { status: 500 })
  return NextResponse.json({ status: 'cancelled', jobId })
}

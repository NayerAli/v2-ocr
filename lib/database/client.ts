import { createClient } from '@/utils/supabase/client'
import { useAuth } from '@/components/auth/auth-provider'
import { mapToProcessingStatus, camelToSnake } from './utils/mappers'
import type { ProcessingStatus } from '@/types'

const supabase = createClient()

export function useCurrentUser() {
  const { user } = useAuth()
  return user
}

export async function getQueue(userId: string): Promise<ProcessingStatus[]> {
  if (!userId) return []
  const { data, error } = await supabase
    .from('documents')
    .select('*')
    .eq('user_id', userId)
    .in('status', ['pending', 'processing', 'queued', 'completed', 'failed', 'cancelled', 'error'])
    .order('created_at', { ascending: false })
  if (error) return []
  return (data || []).map(mapToProcessingStatus)
}

// Add other client-safe exports as needed 
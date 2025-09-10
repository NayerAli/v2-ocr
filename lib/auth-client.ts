import type { User, Session } from '@supabase/supabase-js'
import { getSupabaseClient } from './supabase/singleton-client'
import { middlewareLog, prodError } from './log'

export async function getSession(): Promise<Session | null> {
  try {
    const supabase = getSupabaseClient()
    if (!supabase) return null
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      prodError('[Auth-Client] Error getting session:', error.message)
      return null
    }
    if (data.session) {
      middlewareLog('debug', '[Auth-Client] Session found')
      return data.session
    }
    middlewareLog('debug', '[Auth-Client] No session found')
    return null
  } catch (error) {
    prodError('[Auth-Client] Exception getting session:', error)
    return null
  }
}

export async function getUser(): Promise<User | null> {
  try {
    const supabase = getSupabaseClient()
    if (!supabase) return null
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      prodError('[Auth-Client] Error getting user:', error.message)
      return null
    }
    if (data.user) {
      middlewareLog('debug', '[Auth-Client] User found:', data.user.email)
      return data.user
    }
    middlewareLog('debug', '[Auth-Client] No user found')
    return null
  } catch (error) {
    prodError('[Auth-Client] Exception getting user:', error)
    return null
  }
}

export async function isAuthenticated(): Promise<boolean> {
  const session = await getSession()
  return !!session
}


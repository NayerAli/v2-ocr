import type { User } from '@supabase/supabase-js'
import { createClient } from '@/utils/supabase/server'
import { cookies } from 'next/headers'

// Interface for authenticated user
export interface AuthUser {
  id: string
  email?: string
  role?: string
}

// Server-side only auth utilities
export const auth = {
  /**
   * Get the currently authenticated user
   * This only works on the server
   */
  getUser: async (): Promise<AuthUser | null> => {
    try {
      const supabase = createClient()
      const { data, error } = await supabase.auth.getUser()
      
      if (error || !data?.user) {
        return null
      }
      
      return {
        id: data.user.id,
        email: data.user.email,
        role: data.user.role
      }
    } catch (error) {
      console.error('Error getting authenticated user:', error)
      return null
    }
  },
  
  /**
   * Check if a user is authenticated
   * This only works on the server
   */
  isAuthenticated: async (): Promise<boolean> => {
    const user = await auth.getUser()
    return !!user
  },
  
  /**
   * Get the Supabase cookies for client authentication
   * This only works on the server
   */
  getCookies: () => {
    return cookies()
  }
} 
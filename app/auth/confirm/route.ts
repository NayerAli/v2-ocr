import { type EmailOtpType } from '@supabase/supabase-js'
import { type NextRequest } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { debugLog, debugError } from '@/lib/log'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const token_hash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? '/'

  debugLog('Auth Confirm: Processing confirmation with token hash:', token_hash?.substring(0, 8) + '...')
  
  if (token_hash && type) {
    const supabase = await createClient()
    
    debugLog('Auth Confirm: Verifying OTP with type:', type)
    
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash,
    })
    
    if (!error) {
      debugLog('Auth Confirm: OTP verification successful, redirecting to:', next)
      // redirect user to specified redirect URL or root of app
      redirect(next)
    } else {
      debugError('Auth Confirm: Error verifying OTP:', error.message)
    }
  } else {
    debugError('Auth Confirm: Missing token_hash or type parameters')
  }
  
  // redirect the user to an error page with some instructions
  debugLog('Auth Confirm: Redirecting to error page')
  redirect('/auth/error')
}

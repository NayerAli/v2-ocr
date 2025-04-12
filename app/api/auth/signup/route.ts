import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/auth/signup
 * Custom signup endpoint that creates a user without email confirmation
 */
export async function POST(request: Request) {
  try {
    // Get request body
    const { email, password } = await request.json()

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      )
    }

    console.log('[API] Signup: Creating user without email confirmation:', email)

    // Create a Supabase admin client with the service role key
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // Create the user directly with admin API
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // This is the key - automatically confirm the email
      user_metadata: { source: 'direct_signup' }
    })

    if (error) {
      // Check for duplicate user error
      if (error.message.includes('already exists') || error.message.includes('already registered')) {
        console.log('[API] Signup: User already exists:', email)
        return NextResponse.json(
          { error: 'User already exists' },
          { status: 409 }
        )
      }

      console.error('[API] Signup: Error creating user:', error.message)
      return NextResponse.json(
        { error: error.message },
        { status: 500 }
      )
    }

    if (!data.user) {
      console.error('[API] Signup: No user returned after creation')
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      )
    }

    console.log('[API] Signup: User created and confirmed successfully:', data.user.id)

    // Return success with the user data
    return NextResponse.json({
      success: true,
      user: {
        id: data.user.id,
        email: data.user.email
      }
    })
  } catch (error) {
    console.error('[API] Signup: Unexpected error:', error)
    return NextResponse.json(
      { error: 'An unexpected error occurred' },
      { status: 500 }
    )
  }
}

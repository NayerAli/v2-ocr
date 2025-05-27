'use client'

import Link from 'next/link'
import { ForgotPasswordForm } from '@/components/auth/forgot-password-form'

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-[80vh] items-center justify-center">
      <div className="mx-auto w-full max-w-md space-y-6 px-4">
        <div className="space-y-2 text-center">
          <Link 
            href="/" 
            className="inline-block"
          >
            <div className="bg-primary px-3 py-1.5 rounded-md text-primary-foreground font-semibold text-sm">
              OCR
            </div>
          </Link>
          <h1 className="text-3xl font-bold">Forgot password?</h1>
          <p className="text-muted-foreground">
            Enter your email to receive a password reset link
          </p>
        </div>
        <div className="border rounded-lg p-6 shadow-sm">
          <ForgotPasswordForm />
        </div>
      </div>
    </div>
  )
}

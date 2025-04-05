'use client'

import Link from 'next/link'
import { SignupForm } from '@/components/auth/signup-form'

export default function SignupPage() {
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
          <h1 className="text-3xl font-bold">Create an account</h1>
          <p className="text-muted-foreground">
            Enter your details to create a new account
          </p>
        </div>
        <div className="border rounded-lg p-6 shadow-sm">
          <SignupForm />
        </div>
      </div>
    </div>
  )
}

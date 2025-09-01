"use client"

// Ensure client runtime polyfills are applied early.
import "@/lib/polyfills"

export default function ClientInit() {
  // No UI — just side effects (polyfills)
  return null
}


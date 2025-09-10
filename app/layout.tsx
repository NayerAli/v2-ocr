import { ThemeProvider } from "@/components/theme-provider"
import { AuthProvider } from "@/components/auth/auth-provider"
import { Toaster } from "@/components/ui/toaster"
import { Header } from "./components/header"
import ClientInit from "./client-init"
import "./globals.css"
import type React from "react"

// Removed next/font/google to avoid build-time font downloads in CI/build

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`min-h-screen bg-background antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <ClientInit />
          <AuthProvider>
            <div className="relative flex min-h-screen flex-col">
              <Header />
              <div className="flex-1 pt-14">
                <main className="relative py-8">
                  <div className="container max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    {children}
                  </div>
                </main>
              </div>
            </div>
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}

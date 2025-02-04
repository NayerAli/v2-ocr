import { Inter } from "next/font/google"
import { IBM_Plex_Sans_Arabic } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
import { Toaster } from "@/components/ui/toaster"
import { Header } from "./components/header"
import { Sidebar } from "./components/sidebar"
import "./globals.css"
import type React from "react"

const inter = Inter({ subsets: ["latin"] })
const ibmPlexSansArabic = IBM_Plex_Sans_Arabic({
  weight: ["400", "500", "600", "700"],
  subsets: ["arabic"],
  variable: "--font-ibm-plex-sans-arabic",
})

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.className} ${ibmPlexSansArabic.variable}`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <div className="min-h-screen lg:pl-[240px] relative">
            <Sidebar className="w-[240px] fixed left-0 top-0 bottom-0 z-40 hidden lg:block" />
            <div className="flex min-h-screen flex-col">
              <Header />
              <main className="flex-1 px-4 py-6 md:px-6 lg:px-8">{children}</main>
            </div>
          </div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}


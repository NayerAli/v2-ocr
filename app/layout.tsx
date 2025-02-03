import { Inter } from "next/font/google"
import { IBM_Plex_Sans_Arabic } from "next/font/google"
import { ThemeProvider } from "@/components/theme-provider"
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
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${inter.className} ${ibmPlexSansArabic.variable} font-ibm-plex-sans-arabic`}>
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
          <div className="min-h-screen lg:pr-[240px]">
            <Sidebar className="w-[240px] fixed right-0" />
            <div className="flex min-h-screen flex-col">
              <Header />
              <main className="flex-1 px-4">{children}</main>
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  )
}


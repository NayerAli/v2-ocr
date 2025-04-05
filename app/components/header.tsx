"use client"

import { Moon, Sun, Settings, LayoutDashboard, FileText, Languages } from "lucide-react"
import { UserButton } from "@/components/auth/user-button"
import { useTheme } from "next-themes"
import { usePathname } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { SettingsDialog } from "./settings-dialog"
import { useState } from "react"
import { cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { useLanguage } from "@/hooks/use-language"
import { t, type TranslationKey } from "@/lib/i18n/translations"

const navigation = [
  {
    key: 'dashboard' as TranslationKey,
    href: "/",
    icon: LayoutDashboard,
  },
  {
    key: 'documents' as TranslationKey,
    href: "/documents",
    icon: FileText,
  },
] as const

export function Header() {
  const { theme, setTheme } = useTheme()
  const pathname = usePathname()
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const { language, setLanguage } = useLanguage()

  const languages = [
    {
      code: 'en' as const,
      name: 'English',
      flag: '🇺🇸',
      label: 'English'
    },
    {
      code: 'fr' as const,
      name: 'Français',
      flag: '🇫🇷',
      label: 'Français'
    },
    {
      code: 'ar' as const,
      name: 'العربية',
      flag: '🇦🇪',
      label: 'العربية'
    },
    {
      code: 'fa' as const,
      name: 'فارسی',
      flag: '🇮🇷',
      label: 'فارسی'
    },
  ] as const

  return (
    <header className="fixed top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      {/* Main Header */}
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center">
          {/* Left Section: Logo */}
          <div className="flex shrink-0 items-center">
            <Link
              href="/"
              className="flex items-center gap-2.5 rounded-lg hover:opacity-80 transition-opacity"
            >
              <div className="bg-primary px-3 py-1.5 rounded-md text-primary-foreground font-semibold text-sm">
                OCR
              </div>
              <span className="font-semibold text-lg hidden sm:inline-block">{t('dashboard', language)}</span>
            </Link>
          </div>

          {/* Center Section: Navigation - Absolute positioning for true center */}
          <div className="absolute left-1/2 -translate-x-1/2">
            <nav className="hidden md:flex items-center justify-center gap-2">
              {navigation.map((item) => (
                <Link
                  key={item.key}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
                    pathname === item.href
                      ? "bg-secondary text-secondary-foreground shadow-sm"
                      : "text-muted-foreground hover:bg-secondary/70 hover:text-secondary-foreground"
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {t(item.key, language)}
                </Link>
              ))}
            </nav>
          </div>

          {/* Right Section: Actions */}
          <div className="flex items-center gap-3 ml-auto">
            <UserButton />
            <div className="h-6 w-px bg-border/80 hidden sm:block" />
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsSettingsOpen(true)}
              className="gap-2 h-9"
            >
              <Settings className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline-block">{t('settings', language)}</span>
            </Button>
            <div className="h-6 w-px bg-border/80 hidden sm:block" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 hover:bg-secondary/80"
                >
                  <Languages className="h-4 w-4 mr-2 text-muted-foreground" />
                  <span className="inline-flex items-center gap-1.5 text-sm">
                    <span>{languages.find(lang => lang.code === language)?.name}</span>
                    <span className="text-xs text-muted-foreground">({language})</span>
                  </span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-[150px]">
                {languages.map((lang) => (
                  <DropdownMenuItem
                    key={lang.code}
                    onClick={() => setLanguage(lang.code)}
                    className={cn(
                      "flex items-center justify-between py-1.5 cursor-pointer text-sm",
                      language === lang.code && "bg-secondary",
                      lang.code === 'ar' || lang.code === 'fa' ? "font-arabic" : ""
                    )}
                  >
                    <span>{lang.name}</span>
                    <span className="text-xs text-muted-foreground">({lang.code})</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
              className="h-9 w-9"
            >
              <Sun className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">{t('toggleTheme', language)}</span>
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile Navigation */}
      <div className="border-t md:hidden">
        <nav className="mx-auto max-w-7xl">
          <div className="grid grid-cols-2 divide-x divide-border">
            {navigation.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className={cn(
                  "flex items-center justify-center gap-2 py-3 text-sm font-medium transition-colors",
                  pathname === item.href
                    ? "bg-secondary/50 text-secondary-foreground"
                    : "text-muted-foreground hover:bg-secondary/20 hover:text-foreground"
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" />
                <span>{t(item.key, language)}</span>
              </Link>
            ))}
          </div>
        </nav>
      </div>

      <SettingsDialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </header>
  )
}


"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { FileText, Settings, LayoutDashboard, Menu } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { TooltipProvider } from "@/components/ui/tooltip"

const navigation = [
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    name: "Documents",
    href: "/documents",
    icon: FileText,
  },
  {
    name: "Settings",
    href: "/settings",
    icon: Settings,
  },
]

interface SidebarProps {
  className?: string
}

export function Sidebar({ className }: SidebarProps) {
  const pathname = usePathname()
  const [isOpen, setIsOpen] = React.useState(false)

  const NavItems = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
    ({ className, ...props }, ref) => (
      <div ref={ref} className={cn("flex flex-col space-y-1", className)} {...props}>
        {navigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className={cn(
              "flex items-center gap-x-2 rounded-lg px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
              pathname === item.href ? "bg-accent text-accent-foreground" : "text-muted-foreground",
            )}
            onClick={() => setIsOpen(false)}
          >
            <item.icon className="h-5 w-5" />
            {item.name}
          </Link>
        ))}
      </div>
    ),
  )
  NavItems.displayName = "NavItems"

  return (
    <>
      {/* Mobile Navigation */}
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <Button variant="ghost" size="icon" className="lg:hidden fixed left-4 top-3 z-40">
            <Menu className="h-6 w-6" />
            <span className="sr-only">Toggle navigation menu</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="left" className="w-[240px] sm:w-[300px]">
          <SheetHeader>
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <div className="mt-6">
            <NavItems />
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop Navigation */}
      <TooltipProvider delayDuration={0}>
        <div className={cn("hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:z-30", className)}>
          <div className="flex grow flex-col gap-y-5 overflow-y-auto border-r bg-background px-6 pb-4">
            <div className="flex h-16 shrink-0 items-center">
              <h1 className="text-xl font-semibold">OCR Dashboard</h1>
            </div>
            <nav className="flex flex-1 flex-col">
              <NavItems />
            </nav>
          </div>
        </div>
      </TooltipProvider>
    </>
  )
}


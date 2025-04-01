'use client'

import React from 'react'
import type { LucideIcon } from 'lucide-react'

/**
 * Renders a network toast with an icon and title
 * This is in a separate file so we can use JSX while keeping the network-notifications.ts file as pure TypeScript
 */
export function renderNetworkToast(title: string, Icon: LucideIcon): React.ReactNode {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-5 w-5 text-green-500" />
      <span>{title}</span>
    </div>
  )
} 
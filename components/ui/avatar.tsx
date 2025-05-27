"use client"

import * as React from "react"
import Image from "next/image"
import { cn } from "@/lib/utils"

type AvatarProps = React.HTMLAttributes<HTMLDivElement> & {
  src?: string
  alt?: string
}

const Avatar = React.forwardRef<HTMLDivElement, AvatarProps>(
  ({ className, src, alt, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full",
        className
      )}
      {...props}
    >
      {src ? (
        <Image
          src={src}
          alt={alt || "Avatar"}
          className="aspect-square h-full w-full object-cover"
          width={40}
          height={40}
        />
      ) : (
        children
      )}
    </div>
  )
)
Avatar.displayName = "Avatar"

// Define a custom type that extends the HTML image attributes but with specific width and height
type AvatarImageProps = Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'width' | 'height'> & {
  width?: number
  height?: number
}

const AvatarImage = React.forwardRef<HTMLImageElement, AvatarImageProps>(
  ({ className, alt, src, width, height, ...props }, ref) => (
    <Image
      ref={ref as React.Ref<HTMLImageElement>}
      src={src as string}
      alt={alt || "Avatar"}
      className={cn("aspect-square h-full w-full object-cover", className)}
      width={width || 40}
      height={height || 40}
      {...props}
    />
  )
)
AvatarImage.displayName = "AvatarImage"

type AvatarFallbackProps = React.HTMLAttributes<HTMLDivElement>

const AvatarFallback = React.forwardRef<HTMLDivElement, AvatarFallbackProps>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      className={cn(
        "flex h-full w-full items-center justify-center rounded-full bg-muted text-muted-foreground",
        className
      )}
      {...props}
    />
  )
)
AvatarFallback.displayName = "AvatarFallback"

export { Avatar, AvatarImage, AvatarFallback }

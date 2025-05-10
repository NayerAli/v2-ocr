import * as React from "react"

import { cn } from "@/lib/utils"

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    // Use a client-side only effect to handle hydration mismatch
    const [mounted, setMounted] = React.useState(false);

    React.useEffect(() => {
      setMounted(true);
    }, []);

    // Create a new props object without any browser-specific attributes
    // This approach is more thorough than trying to list all possible attributes
    const safeProps: Record<string, any> = {};

    // Only copy known safe props to avoid hydration issues
    const safeKeys = [
      'id', 'name', 'value', 'defaultValue', 'placeholder', 'disabled',
      'readOnly', 'required', 'autoComplete', 'autoFocus', 'min', 'max',
      'minLength', 'maxLength', 'pattern', 'step', 'list', 'multiple',
      'accept', 'capture', 'checked', 'size', 'src', 'alt', 'onChange',
      'onBlur', 'onFocus', 'onKeyDown', 'onKeyUp', 'onKeyPress', 'onClick',
      'aria-label', 'aria-labelledby', 'aria-describedby', 'role'
    ];

    // Only copy safe props
    Object.keys(props).forEach(key => {
      if (safeKeys.includes(key) || key.startsWith('data-') || key.startsWith('aria-')) {
        safeProps[key] = (props as any)[key];
      }
    });

    return (
      <input
        type={type}
        className={cn(
          "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className
        )}
        ref={ref}
        suppressHydrationWarning={true}
        {...safeProps}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }

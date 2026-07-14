import * as React from 'react'
import { cn } from '#/lib/utils.ts'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-9 w-full min-w-0 border border-[var(--line)] bg-[var(--paper)] px-3 py-1 text-sm text-[var(--ink)] shadow-sm outline-none transition-colors placeholder:text-[var(--muted)] focus-visible:border-[var(--teal)] focus-visible:ring-2 focus-visible:ring-[color-mix(in_srgb,var(--teal)_22%,transparent)] disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  )
}

export { Input }

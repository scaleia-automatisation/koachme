import { cn } from '@/lib/utils'

export const APP_NAME = 'Economiz'
export const APP_TAGLINE = 'Votre argent, en clair.'

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" aria-hidden className={cn('size-8', className)}>
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <path d="M9 21.5 14 16l3.5 3L23 12" fill="none" stroke="white" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="23" cy="12" r="2" fill="white" />
    </svg>
  )
}

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-2 text-lg font-semibold tracking-tight', className)}>
      <LogoMark className="size-7" />
      {APP_NAME}
    </span>
  )
}

import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-primary-foreground shadow-card hover:bg-primary-hover',
        secondary: 'bg-muted text-foreground hover:bg-border',
        outline: 'border border-border bg-surface text-foreground hover:bg-muted',
        ghost: 'text-foreground hover:bg-muted',
        danger: 'bg-danger text-primary-foreground hover:bg-danger-hover',
        link: 'h-auto px-0 text-primary underline-offset-4 hover:underline',
      },
      size: {
        sm: 'h-9 px-3 text-sm',
        md: 'h-11 px-5 text-[0.9375rem]',
        lg: 'h-12 px-6 text-base',
        icon: 'size-10',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

/** État d'une action déclenchée par le bouton. */
export type ButtonState = 'idle' | 'loading' | 'success' | 'error'

const STATE_CLASSES: Partial<Record<ButtonState, string>> = {
  success: 'bg-success text-primary-foreground hover:bg-success border-transparent',
  error: 'bg-danger text-primary-foreground hover:bg-danger-hover border-transparent',
}

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
  state?: ButtonState
  /** Libellés optionnels affichés selon l'état. */
  loadingText?: ReactNode
  successText?: ReactNode
  errorText?: ReactNode
}

export function Button({
  className,
  variant,
  size,
  asChild = false,
  state = 'idle',
  loadingText,
  successText,
  errorText,
  disabled,
  children,
  ...props
}: ButtonProps) {
  if (asChild) {
    return <Slot className={cn(buttonVariants({ variant, size }), className)} {...props}>{children}</Slot>
  }

  const content =
    state === 'loading' ? (
      <>
        <Loader2 className="animate-spin-fast" aria-hidden />
        {loadingText ?? children}
      </>
    ) : state === 'success' ? (
      <>
        <Check aria-hidden />
        {successText ?? children}
      </>
    ) : state === 'error' ? (
      <>
        <AlertCircle aria-hidden />
        {errorText ?? children}
      </>
    ) : (
      children
    )

  return (
    <button
      data-state={state}
      aria-busy={state === 'loading' || undefined}
      disabled={disabled || state === 'loading'}
      className={cn(buttonVariants({ variant, size }), STATE_CLASSES[state], className)}
      {...props}
    >
      {content}
    </button>
  )
}

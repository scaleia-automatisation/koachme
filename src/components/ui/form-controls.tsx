import { Eye, EyeOff } from 'lucide-react'
import { useState, type ComponentProps } from 'react'
import { cn } from '@/lib/utils'
import { Input } from './field'

const controlBase =
  'w-full rounded-md border border-border bg-surface text-[0.9375rem] transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/20 aria-invalid:border-danger disabled:cursor-not-allowed disabled:opacity-50'

export function Select({ className, children, ...props }: ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        controlBase,
        'h-11 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns%3D%27http%3A//www.w3.org/2000/svg%27%20viewBox%3D%270%200%2016%2016%27%20fill%3D%27none%27%20stroke%3D%27%236b7280%27%20stroke-width%3D%271.5%27%3E%3Cpath%20d%3D%27M4%206l4%204%204-4%27/%3E%3C/svg%3E")] bg-[length:16px] bg-[right_0.75rem_center] bg-no-repeat pr-9 pl-3',
        className,
      )}
      {...props}
    >
      {children}
    </select>
  )
}

export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return <textarea className={cn(controlBase, 'min-h-32 px-3 py-2.5', className)} {...props} />
}

export function Checkbox({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  return <input type="checkbox" className={cn('mt-0.5 size-4.5 shrink-0 cursor-pointer rounded accent-primary', className)} {...props} />
}

/** Champ mot de passe avec bouton afficher / masquer. */
export function PasswordInput({ className, ...props }: Omit<ComponentProps<'input'>, 'type'>) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <Input type={visible ? 'text' : 'password'} className={cn('pr-11', className)} {...props} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground"
        aria-label={visible ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
      >
        {visible ? <EyeOff className="size-4" aria-hidden /> : <Eye className="size-4" aria-hidden />}
      </button>
    </div>
  )
}

/** Barre de progression accessible (valeur entre 0 et 100). */
export function Progress({ value, label, className, tone = 'primary' }: { value: number; label: string; className?: string; tone?: 'primary' | 'success' | 'danger' }) {
  const color = { primary: 'bg-primary', success: 'bg-success', danger: 'bg-danger' }[tone]
  return (
    <div role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value)} className={cn('h-2 overflow-hidden rounded-full bg-muted', className)}>
      <div className={cn('h-full rounded-full transition-[width] duration-500', color)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  )
}

// Cloche de notifications : résultats d'analyse, paiements, rappels mensuels.
import { Bell, Trash2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useDeleteNotifications, useMarkNotificationsRead, useNotifications } from '@/features/finance/billing'
import { cn } from '@/lib/utils'

const timeAgo = (iso: string) => {
  const minutes = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (minutes < 1) return 'à l’instant'
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })
}

export function NotificationsMenu() {
  const notifications = useNotifications()
  const markRead = useMarkNotificationsRead()
  const remove = useDeleteNotifications()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const list = notifications.data ?? []
  const unread = list.filter((n) => !n.read_at)

  useEffect(() => {
    if (!open) return
    const onClick = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && unread.length) markRead.mutate(unread.map((n) => n.id))
  }

  return (
    <div ref={ref} className="relative">
      <Button variant="ghost" size="icon" onClick={toggle} aria-expanded={open} aria-haspopup="dialog" aria-label={unread.length ? `Notifications, ${unread.length} non lue${unread.length > 1 ? 's' : ''}` : 'Notifications'}>
        <Bell aria-hidden />
        {unread.length > 0 && (
          <span className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.625rem] font-semibold leading-4 text-primary-foreground">
            {unread.length > 9 ? '9+' : unread.length}
          </span>
        )}
      </Button>
      {open && (
        <div role="dialog" aria-label="Notifications" className="fixed inset-x-3 top-16 z-50 max-h-[70dvh] overflow-y-auto rounded-xl border border-border bg-surface shadow-card sm:absolute sm:inset-x-auto sm:right-0 sm:top-12 sm:w-96">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold">Notifications</p>
            {list.length > 0 && (
              <button className="text-xs font-medium text-muted-foreground hover:text-foreground" onClick={() => remove.mutate(list.map((n) => n.id))}>
                Tout effacer
              </button>
            )}
          </div>
          {list.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-muted-foreground">Aucune notification.</p>
          ) : (
            <ul className="divide-y divide-border">
              {list.map((n) => (
                <li key={n.id} className={cn('group flex gap-2 px-4 py-3', !n.read_at && 'bg-primary-soft/40')}>
                  <div className="min-w-0 flex-1">
                    {n.link ? (
                      <Link to={n.link} onClick={() => setOpen(false)} className="text-sm font-medium hover:text-primary">
                        {n.title}
                      </Link>
                    ) : (
                      <p className="text-sm font-medium">{n.title}</p>
                    )}
                    {n.body && <p className="mt-0.5 truncate text-xs text-muted-foreground">{n.body}</p>}
                    <p className="mt-1 text-xs text-muted-foreground">{timeAgo(n.created_at)}</p>
                  </div>
                  <button aria-label={`Supprimer la notification « ${n.title} »`} className="shrink-0 self-start rounded p-1 text-muted-foreground opacity-60 hover:bg-muted hover:opacity-100" onClick={() => remove.mutate([n.id])}>
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

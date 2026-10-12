import { AlertTriangle, CheckCircle2, OctagonAlert } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { STATUS_META, type FinancialStatus } from '@/domain/status'

const STATUS_STYLE = {
  favorable: { tone: 'success', Icon: CheckCircle2 },
  vigilance: { tone: 'warning', Icon: AlertTriangle },
  prioritaire: { tone: 'danger', Icon: OctagonAlert },
} as const

export function StatusBadge({ status, className }: { status: FinancialStatus; className?: string }) {
  const { tone, Icon } = STATUS_STYLE[status]
  return (
    <Badge tone={tone} className={className}>
      <Icon className="size-3.5" aria-hidden />
      {STATUS_META[status].label}
    </Badge>
  )
}

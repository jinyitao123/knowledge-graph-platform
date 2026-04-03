import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

export default function EmptyState({ icon, title, description, action }: {
  icon?: ReactNode
  title: string
  description?: string
  action?: ReactNode
}) {
  return (
    <div className="kg-empty">
      <div className="kg-empty__icon">{icon || <Inbox size={48} />}</div>
      <div className="kg-empty__title">{title}</div>
      {description && <div className="kg-empty__desc">{description}</div>}
      {action && <div className="kg-empty__action">{action}</div>}
    </div>
  )
}

import { Loader2 } from 'lucide-react'

export default function LoadingSpinner({ text = 'Loading...' }: { text?: string }) {
  return (
    <div className="kg-empty">
      <Loader2 size={28} className="animate-spin" style={{ color: 'var(--terracotta)' }} />
      <div className="kg-empty__desc" style={{ marginTop: 'var(--sp-md)' }}>{text}</div>
    </div>
  )
}

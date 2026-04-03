export default function StatusBadge({ status }: { status: string }) {
  const cls = `kg-badge kg-badge--${status in variants ? status : 'default'}`
  return <span className={cls}>{status}</span>
}

const variants = { pending: 1, processing: 1, completed: 1, failed: 1, partial: 1 }

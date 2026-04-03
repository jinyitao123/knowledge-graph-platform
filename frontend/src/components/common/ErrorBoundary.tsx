import { Component, type ReactNode } from 'react'
import { AlertTriangle } from 'lucide-react'

interface Props { children: ReactNode; fallback?: ReactNode }
interface State { hasError: boolean; error?: Error }

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div className="kg-empty">
          <AlertTriangle size={40} style={{ color: 'var(--madder-tone)' }} />
          <div className="kg-empty__title" style={{ marginTop: 'var(--sp-lg)' }}>Something went wrong</div>
          <div className="kg-empty__desc">{this.state.error?.message}</div>
          <div className="kg-empty__action">
            <button className="kg-btn" onClick={() => this.setState({ hasError: false })}>Try again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

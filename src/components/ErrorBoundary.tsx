import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback
      return (
        <div className="flex min-h-[400px] items-center justify-center p-8">
          <div className="max-w-md text-center">
            <div className="mb-4 text-4xl text-zinc-300">!</div>
            <h2 className="mb-2 text-lg font-semibold text-zinc-800">Something went wrong</h2>
            <p className="mb-4 text-sm text-zinc-500">{this.state.error?.message || 'An unexpected error occurred'}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="rounded-lg bg-yanne px-4 py-2 text-sm font-medium text-white hover:bg-yanne/90"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

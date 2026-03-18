import { useState, useCallback } from 'react'

const REPORTING_URL = 'https://yanne-capital-gsheets-reporting-production.up.railway.app'
const LOAD_TIMEOUT_MS = 30_000

export function ReportingPage() {
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

  const handleLoad = useCallback(() => {
    setIsLoading(false)
    setHasError(false)
  }, [])

  const handleError = useCallback(() => {
    setIsLoading(false)
    setHasError(true)
  }, [])

  const handleRetry = useCallback(() => {
    setIsLoading(true)
    setHasError(false)
    // Force re-mount by toggling key via state
    setRetryCount((c) => c + 1)
  }, [])

  const [retryCount, setRetryCount] = useState(0)

  // Timeout: if iframe hasn't loaded after LOAD_TIMEOUT_MS, show error
  const handleRef = useCallback(
    (iframe: HTMLIFrameElement | null) => {
      if (!iframe) return
      const timer = setTimeout(() => {
        setIsLoading((loading) => {
          if (loading) {
            setHasError(true)
            return false
          }
          return loading
        })
      }, LOAD_TIMEOUT_MS)
      iframe.addEventListener('load', () => clearTimeout(timer), { once: true })
    },
    [retryCount],
  )

  return (
    <div className="-m-6 relative h-[calc(100vh)] w-[calc(100%+3rem)]">
      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0f1a]">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-gray-600 border-t-blue-500" />
          <p className="mt-4 text-sm text-gray-400">Loading Client Reporting...</p>
        </div>
      )}

      {/* Error overlay */}
      {hasError && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-[#0a0f1a]">
          <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-8 py-6 text-center">
            <p className="text-lg font-semibold text-red-400">Failed to load reporting</p>
            <p className="mt-2 text-sm text-gray-400">
              The reporting service may be temporarily unavailable.
            </p>
            <button
              onClick={handleRetry}
              className="mt-4 rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      <iframe
        key={retryCount}
        ref={handleRef}
        src={REPORTING_URL}
        title="Client Reporting"
        className="h-full w-full border-0"
        allow="clipboard-write"
        onLoad={handleLoad}
        onError={handleError}
      />
    </div>
  )
}

interface PlaceholderPageProps {
  title: string
  source: string
  previews?: string[]
}

const lockIcon = (
  <svg className="w-12 h-12 text-zinc-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
  </svg>
)

export function PlaceholderPage({ title, source, previews }: PlaceholderPageProps) {
  return (
    <div>
      <h2 className="mb-6 text-2xl font-bold text-zinc-900">{title}</h2>
      <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-zinc-200 bg-white py-20">
        {lockIcon}
        <p className="mt-4 text-sm font-medium text-zinc-500">Connect {source} to populate</p>
        <p className="mt-1 text-xs text-zinc-400">This page will show live data once integrated</p>

        {previews && previews.length > 0 && (
          <div className="mt-8 w-full max-w-md">
            <p className="mb-3 text-center text-[10px] font-semibold uppercase tracking-wider text-zinc-400">
              What you'll see
            </p>
            <div className="space-y-2">
              {previews.map(p => (
                <div key={p} className="flex items-center gap-2 rounded-lg bg-zinc-50 px-4 py-2.5">
                  <div className="h-2 w-2 rounded-full bg-zinc-300" />
                  <span className="text-xs text-zinc-500">{p}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

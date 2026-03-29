import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { NotificationBell } from './NotificationBell'

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden bg-surface-sunken">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 items-center justify-between border-b border-border bg-surface px-6">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-1.5 rounded-full bg-positive pulse-live" />
              <span className="text-[10px] font-medium text-text-muted tracking-[0.12em] uppercase font-data">Live</span>
            </div>
            <div className="h-3 w-px bg-border" />
            <span className="text-[10px] text-text-faint font-data">
              {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>
          <div className="flex items-center gap-4">
            <kbd className="hidden md:inline-flex items-center gap-1 rounded-md border border-border px-2 py-0.5 text-[10px] text-text-faint font-data">
              <span className="text-[9px]">⌘</span>K
            </kbd>
            <NotificationBell />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

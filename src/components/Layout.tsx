import { Outlet } from 'react-router-dom'
import { Sidebar } from './Sidebar'
import { NotificationBell } from './NotificationBell'

export function Layout() {
  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-12 items-center justify-end border-b border-zinc-200 bg-white px-6">
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto bg-yanne-bg p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

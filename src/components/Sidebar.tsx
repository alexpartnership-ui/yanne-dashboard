import { NavLink } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

const links = [
  { to: '/calls', label: 'Calls' },
  { to: '/reps', label: 'Reps' },
  { to: '/deals', label: 'Deals' },
]

export function Sidebar() {
  const { logout } = useAuth()

  return (
    <aside className="flex h-screen w-60 flex-col bg-slate-900 text-slate-300">
      <div className="px-5 py-6">
        <h1 className="text-lg font-semibold text-white">Yanne Capital</h1>
        <p className="text-xs text-slate-500">Sales Intelligence</p>
      </div>

      <nav className="flex-1 space-y-1 px-3">
        {links.map(link => (
          <NavLink
            key={link.to}
            to={link.to}
            className={({ isActive }) =>
              `block rounded-md px-3 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-slate-800 text-white'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-white'
              }`
            }
          >
            {link.label}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-800 px-3 py-4">
        <button
          onClick={logout}
          className="w-full rounded-md px-3 py-2 text-left text-sm text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}

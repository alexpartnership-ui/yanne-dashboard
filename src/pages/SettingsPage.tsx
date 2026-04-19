import { useState, useEffect, type FormEvent } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'

interface ManagedUser {
  id: string
  email: string | null
  name: string
  role: 'admin' | 'manager' | 'member'
  pillar_access: string[]
  created_at: string
}

const PILLARS = ['sales', 'campaigns', 'fulfillment', 'operations', 'investor-relations', 'goals', 'finance']

export function SettingsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState<ManagedUser[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState<'admin' | 'manager' | 'member'>('member')
  const [pillars, setPillars] = useState<string[]>([])

  async function fetchUsers() {
    try {
      const res = await apiFetch('/api/users')
      if (res.ok) setUsers(await res.json())
    } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  if (user?.role !== 'admin') {
    return <div className="text-center text-text-muted py-16">Admin access required</div>
  }

  function togglePillar(p: string) {
    if (p === '*') {
      setPillars(pillars.includes('*') ? [] : ['*'])
      return
    }
    setPillars(pillars.includes(p) ? pillars.filter(x => x !== p) : [...pillars.filter(x => x !== '*'), p])
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify({ email, name, role, pillar_access: pillars }),
      })
      if (res.ok) {
        toast('Invite sent — user will receive password-setup email', 'success')
        setShowForm(false)
        setEmail(''); setName(''); setRole('member'); setPillars([])
        fetchUsers()
      } else {
        const err = await res.json()
        toast(err.error || 'Failed to create user', 'error')
      }
    } catch {
      toast('Failed to create user', 'error')
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this user?')) return
    try {
      const res = await apiFetch(`/api/users/${id}`, { method: 'DELETE' })
      if (res.ok) {
        toast('User deleted', 'success')
        fetchUsers()
      } else {
        const err = await res.json()
        toast(err.error || 'Failed to delete user', 'error')
      }
    } catch {
      toast('Failed to delete user', 'error')
    }
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-text-primary">User Management</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-yanne-500 px-4 py-2 text-sm font-medium text-white hover:bg-yanne-400"
        >
          {showForm ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-lg border border-border bg-surface-raised p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-text-secondary">Name</label>
              <input type="text" required value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-yanne-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary">Email</label>
              <input type="email" required value={email} onChange={e => setEmail(e.target.value)} className="mt-1 block w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-yanne-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-text-secondary">Role</label>
              <select value={role} onChange={e => setRole(e.target.value as 'admin' | 'manager' | 'member')} className="mt-1 block w-full rounded-lg border border-border-strong px-3 py-2 text-sm focus:border-yanne-500 focus:outline-none">
                <option value="member">Member</option>
                <option value="manager">Manager</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-text-secondary">Pillar access</label>
            <div className="flex flex-wrap gap-2">
              {PILLARS.map(p => (
                <label key={p} className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border-strong rounded-lg cursor-pointer hover:bg-surface-sunken">
                  <input type="checkbox" checked={pillars.includes(p)} onChange={() => togglePillar(p)} />
                  <span className="text-sm">{p}</span>
                </label>
              ))}
              <label className="flex items-center gap-1.5 px-3 py-1.5 bg-surface border border-border-strong rounded-lg cursor-pointer hover:bg-surface-sunken">
                <input type="checkbox" checked={pillars.includes('*')} onChange={() => togglePillar('*')} />
                <span className="text-sm font-semibold">All (*)</span>
              </label>
            </div>
          </div>
          <button type="submit" className="rounded-lg bg-yanne-500 px-4 py-2 text-sm font-medium text-white hover:bg-yanne-400">Create User</button>
        </form>
      )}

      {loading ? (
        <div className="text-sm text-text-faint">Loading...</div>
      ) : (
        <div className="rounded-lg border border-border bg-surface-raised overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border-muted bg-surface-raised">
                <th className="px-4 py-3 text-left font-medium text-text-muted">Name</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Email</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Role</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Pillars</th>
                <th className="px-4 py-3 text-left font-medium text-text-muted">Created</th>
                <th className="px-4 py-3 text-right font-medium text-text-muted">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-border-muted last:border-0">
                  <td className="px-4 py-3 font-medium text-text-primary">{u.name}</td>
                  <td className="px-4 py-3 text-text-muted">{u.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-surface-overlay px-2 py-0.5 text-xs font-medium capitalize text-text-secondary">{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-text-muted text-xs">{u.pillar_access.join(', ') || '—'}</td>
                  <td className="px-4 py-3 text-text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-4 py-3 text-right">
                    {u.id !== user?.id && (
                      <button onClick={() => handleDelete(u.id)} className="text-xs text-red-500 hover:text-red-700">Delete</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

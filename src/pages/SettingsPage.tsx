import { useState, useEffect, type FormEvent } from 'react'
import { apiFetch } from '../hooks/useAuth'
import { useAuth } from '../hooks/useAuth'
import { useToast } from '../components/Toast'

interface User {
  id: string
  email: string
  name: string
  role: string
  created_at: string
}

export function SettingsPage() {
  const { user } = useAuth()
  const { toast } = useToast()
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ email: '', name: '', role: 'rep', password: '' })

  async function fetchUsers() {
    try {
      const res = await apiFetch('/api/users')
      if (res.ok) setUsers(await res.json())
    } catch { /* silent */ }
    setLoading(false)
  }

  useEffect(() => { fetchUsers() }, [])

  if (user?.role !== 'admin') {
    return <div className="text-center text-zinc-500 py-16">Admin access required</div>
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault()
    try {
      const res = await apiFetch('/api/users', {
        method: 'POST',
        body: JSON.stringify(form),
      })
      if (res.ok) {
        toast('User created', 'success')
        setShowForm(false)
        setForm({ email: '', name: '', role: 'rep', password: '' })
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
    <div className="max-w-3xl">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-bold text-zinc-900">User Management</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="rounded-lg bg-yanne px-4 py-2 text-sm font-medium text-white hover:bg-yanne/90"
        >
          {showForm ? 'Cancel' : 'Add User'}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="mb-6 rounded-lg border border-zinc-200 bg-white p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700">Name</label>
              <input type="text" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-yanne focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Email</label>
              <input type="email" required value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-yanne focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Role</label>
              <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-yanne focus:outline-none">
                <option value="admin">Admin</option>
                <option value="manager">Manager</option>
                <option value="rep">Rep</option>
                <option value="finance">Finance</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700">Password</label>
              <input type="password" required value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} className="mt-1 block w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-yanne focus:outline-none" />
            </div>
          </div>
          <button type="submit" className="rounded-lg bg-yanne px-4 py-2 text-sm font-medium text-white hover:bg-yanne/90">Create User</button>
        </form>
      )}

      {loading ? (
        <div className="text-sm text-zinc-400">Loading...</div>
      ) : (
        <div className="rounded-lg border border-zinc-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-100 bg-zinc-50">
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Name</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Role</th>
                <th className="px-4 py-3 text-left font-medium text-zinc-600">Created</th>
                <th className="px-4 py-3 text-right font-medium text-zinc-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} className="border-b border-zinc-50 last:border-0">
                  <td className="px-4 py-3 font-medium text-zinc-800">{u.name}</td>
                  <td className="px-4 py-3 text-zinc-600">{u.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium capitalize text-zinc-700">{u.role}</span>
                  </td>
                  <td className="px-4 py-3 text-zinc-500">{new Date(u.created_at).toLocaleDateString()}</td>
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

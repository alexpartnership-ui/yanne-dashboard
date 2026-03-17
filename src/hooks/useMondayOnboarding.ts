import { useEffect, useState } from 'react'
import { apiFetch } from './useAuth'

export interface OnboardingTask {
  id: string
  name: string
  group: string
  status: string
  owner: string
  projectName: string
}

export interface OnboardingProject {
  boardId: string
  name: string
  groups: { title: string; total: number; done: number }[]
  tasks: OnboardingTask[]
  completionRate: number
}

export function useMondayOnboarding() {
  const [data, setData] = useState<OnboardingProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        const res = await apiFetch('/api/monday/onboarding')
        if (!res.ok) {
          const err = await res.json()
          setError(err.error || 'Failed to fetch onboarding data')
          setLoading(false)
          return
        }
        const json = await res.json()
        const boards = json.boards || []

        const projects: OnboardingProject[] = boards.map((b: {
          id: string
          name: string
          groups: Array<{ id: string; title: string }>
          items_page?: { items: Array<{ id: string; name: string; group: { id: string; title: string }; column_values: Array<{ id: string; title: string; text: string }> }> }
        }) => {
          const items = b.items_page?.items || []
          const projectName = b.name.replace('Project ', '')

          const tasks: OnboardingTask[] = items.map(item => {
            const cols: Record<string, string> = {}
            for (const cv of item.column_values || []) {
              cols[cv.id] = cv.text || ''
              cols[cv.title] = cv.text || ''
            }
            return {
              id: item.id,
              name: item.name,
              group: item.group?.title || '',
              status: cols['status'] || cols['Status'] || '',
              owner: cols['person'] || cols['Owner'] || '',
              projectName,
            }
          })

          // Group stats
          const groupMap: Record<string, { total: number; done: number }> = {}
          for (const g of b.groups || []) {
            groupMap[g.title] = { total: 0, done: 0 }
          }
          for (const t of tasks) {
            if (groupMap[t.group]) {
              groupMap[t.group].total++
              if (t.status === 'Done' || t.status === 'Completed') groupMap[t.group].done++
            }
          }

          const totalTasks = tasks.length
          const doneTasks = tasks.filter(t => t.status === 'Done' || t.status === 'Completed').length
          const completionRate = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0

          return {
            boardId: b.id,
            name: projectName,
            groups: Object.entries(groupMap).map(([title, s]) => ({ title, ...s })),
            tasks,
            completionRate,
          }
        })

        setData(projects)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error')
      }
      setLoading(false)
    }
    fetch()
  }, [])

  return { data, loading, error }
}

import { useEffect, useState } from 'react'

export interface MondayProject {
  boardId: string
  name: string
  health: string
  stage: string
  priority: string
  owner: string
}

export function useMondayProjects() {
  const [data, setData] = useState<MondayProject[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetch() {
      try {
        const res = await globalThis.fetch('/api/monday/projects')
        if (!res.ok) {
          const err = await res.json()
          setError(err.error || 'Failed to fetch projects')
          setLoading(false)
          return
        }
        const json = await res.json()
        const boards = json.boards || []

        const projects: MondayProject[] = boards.map((b: { id: string; name: string; items_page?: { items: Array<{ column_values: Array<{ id: string; title: string; text: string }> }> } }) => {
          const item = b.items_page?.items?.[0]
          const cols: Record<string, string> = {}
          if (item) {
            for (const cv of item.column_values || []) {
              cols[cv.id] = cv.text || ''
              cols[cv.title] = cv.text || ''
            }
          }
          return {
            boardId: b.id,
            name: b.name.replace('Project ', ''),
            health: cols['Project Health (RAG)'] || cols['portfolio_project_rag'] || 'Unknown',
            stage: cols['Stage'] || cols['portfolio_project_step'] || 'Unknown',
            priority: cols['Priority'] || '',
            owner: cols['Owner'] || '',
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

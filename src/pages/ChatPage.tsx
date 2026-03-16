import { useState, useRef, useEffect } from 'react'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

function parseMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, '<ul class="list-disc pl-4 space-y-0.5">$&</ul>')
    .replace(/\n/g, '<br/>')
}

export function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [streaming, setStreaming] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, streaming])

  async function send() {
    const text = input.trim()
    if (!text || streaming) return

    const userMsg: ChatMessage = { role: 'user', content: text }
    const newMessages = [...messages, userMsg]
    setMessages(newMessages)
    setInput('')
    setStreaming(true)

    try {
      const apiMessages = newMessages.map(m => ({ role: m.role, content: m.content }))

      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: apiMessages }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Request failed' }))
        setMessages(prev => [...prev, { role: 'assistant', content: `Error: ${err.error || res.statusText}` }])
        setStreaming(false)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      let assistantText = ''

      setMessages(prev => [...prev, { role: 'assistant', content: '' }])

      while (reader) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const payload = line.slice(6)
          if (payload === '[DONE]') break

          try {
            const parsed = JSON.parse(payload)
            if (parsed.text) {
              assistantText += parsed.text
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: assistantText }
                return updated
              })
            }
            if (parsed.error) {
              assistantText += `\n\nError: ${parsed.error}`
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: assistantText }
                return updated
              })
            }
          } catch {
            // skip malformed
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `Connection error: ${err instanceof Error ? err.message : 'unknown'}` }])
    } finally {
      setStreaming(false)
      inputRef.current?.focus()
    }
  }

  return (
    <div className="flex h-full flex-col">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <div className="flex h-12 w-12 mx-auto mb-3 items-center justify-center rounded-full bg-yanne/10">
                <svg className="w-6 h-6 text-yanne" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.087.16 2.185.283 3.293.369V21l4.076-4.076a1.526 1.526 0 0 1 1.037-.443 48.282 48.282 0 0 0 5.68-.494c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                </svg>
              </div>
              <p className="text-sm text-zinc-500">What would you like to know about your team's performance?</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                {[
                  'How did the team do today?',
                  'Which rep is improving fastest?',
                  'Show me all F calls this week',
                  'How many deals are stuck?',
                ].map(q => (
                  <button
                    key={q}
                    onClick={() => { setInput(q); setTimeout(() => inputRef.current?.focus(), 50) }}
                    className="rounded-full border border-zinc-200 bg-white px-3 py-1.5 text-xs text-zinc-600 hover:border-yanne-light hover:bg-yanne-light/10 transition-colors"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div
              className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                msg.role === 'user'
                  ? 'bg-yanne text-white rounded-br-md'
                  : 'bg-zinc-100 text-zinc-800 rounded-bl-md'
              }`}
            >
              {msg.role === 'assistant' ? (
                <div
                  className="prose prose-sm prose-zinc max-w-none [&_ul]:my-1 [&_li]:my-0"
                  dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.content || (streaming && i === messages.length - 1 ? '<span class="animate-pulse text-zinc-400">Thinking...</span>' : '')) }}
                />
              ) : (
                msg.content
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-zinc-200 bg-white p-4">
        <form
          onSubmit={e => { e.preventDefault(); send() }}
          className="flex gap-2"
        >
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask about your team's performance..."
            className="flex-1 rounded-lg border border-zinc-200 px-4 py-2.5 text-sm focus:border-yanne focus:outline-none"
            disabled={streaming}
            autoFocus
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="rounded-lg bg-yanne px-4 py-2.5 text-sm font-medium text-white hover:bg-yanne/90 disabled:opacity-40 transition-colors"
          >
            {streaming ? (
              <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            ) : (
              <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5" />
              </svg>
            )}
          </button>
        </form>
      </div>
    </div>
  )
}

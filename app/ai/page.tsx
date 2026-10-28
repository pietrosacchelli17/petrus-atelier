'use client'
import { useState, useRef, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { Bot, Send, User, Loader2, Sparkles } from 'lucide-react'

interface Message { role: 'user' | 'assistant'; content: string }

const QUICK_PROMPTS = [
  "What do I need to do today?",
  "Which projects are overdue?",
  "What is waiting for client approval?",
  "Summarise all active projects",
  "Generate a weekly report",
  "Which installations are coming up?",
  "Draft a client follow-up email",
  "Which projects have no update in 7 days?",
]

export default function AIPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm your Stoneline project assistant. I can help you understand your projects, find overdue tasks, draft emails, or generate reports. What would you like to know?" }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  async function sendMessage(text?: string) {
    const msg = text || input.trim()
    if (!msg || loading) return
    setInput('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)

    const projectsRes = await supabase.from('projects').select(`
      name, client, current_stage, status, next_action, notes, completion_date,
      project_manager:users!project_manager_id(full_name),
      milestones:project_milestones(stage, status, planned_date)
    `).order('updated_at', { ascending: false }).limit(30)

    const tasksRes = await supabase.from('tasks').select(`
      title, status, priority, due_date,
      assigned_to:users!assigned_to_id(full_name),
      project:projects(name)
    `).neq('status', 'completed').order('due_date').limit(50)

    const projects = (projectsRes.data ?? []) as any[]
    const tasks = (tasksRes.data ?? []) as any[]

    const getPmName = (pm: any): string => {
      if (!pm) return 'unassigned'
      if (Array.isArray(pm)) return pm[0]?.full_name ?? 'unassigned'
      return pm.full_name ?? 'unassigned'
    }

    const getAssignedName = (a: any): string => {
      if (!a) return 'unassigned'
      if (Array.isArray(a)) return a[0]?.full_name ?? 'unassigned'
      return a.full_name ?? 'unassigned'
    }

    const getProjName = (p: any): string => {
      if (!p) return 'none'
      if (Array.isArray(p)) return p[0]?.name ?? 'none'
      return p.name ?? 'none'
    }

    const today = new Date().toISOString().slice(0, 10)
    const context = `Today's date: ${today}

ACTIVE PROJECTS (${projects.length}):
${projects.map(p => `- ${p.name} | Client: ${p.client} | Stage: ${p.current_stage} | Status: ${p.status} | PM: ${getPmName(p.project_manager)} | Next action: ${p.next_action ?? 'none'} | Completion: ${p.completion_date ?? 'TBD'}`).join('\n')}

OPEN TASKS (${tasks.length}):
${tasks.map(t => `- ${t.title} | Project: ${getProjName(t.project)} | Assigned to: ${getAssignedName(t.assigned_to)} | Due: ${t.due_date ?? 'no date'} | Priority: ${t.priority} | Status: ${t.status}`).join('\n')}`

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 1000,
          system: `You are a project management assistant for Stoneline UK, a premium stone installation company in London. You help the team track projects, tasks, deadlines, and client communications.

You have access to live project and task data shown below. Answer questions concisely and helpfully. When asked to draft an email, write a professional, concise email. When asked for a report, format it clearly. Always be specific — use real project names and dates from the data.

${context}`,
          messages: [
            ...messages.slice(1).map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: msg }
          ]
        })
      })
      const data = await response.json()
      const reply = data.content?.[0]?.text || 'Sorry, I could not generate a response.'
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Error connecting to AI. Please try again.' }])
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col h-full max-w-4xl mx-auto p-6">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-10 h-10 bg-gradient-to-br from-brand-500 to-blue-500 rounded-xl flex items-center justify-center">
          <Sparkles size={18} className="text-white"/>
        </div>
        <div>
          <h1 className="text-xl font-semibold text-stone-900">AI Assistant</h1>
          <p className="text-sm text-stone-500">Powered by live project data</p>
        </div>
      </div>

      {messages.length <= 1 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
          {QUICK_PROMPTS.map(p => (
            <button key={p} onClick={() => sendMessage(p)}
              className="text-left text-xs p-3 bg-white border border-stone-200 rounded-xl hover:border-brand-300 hover:bg-brand-50 transition-all text-stone-600 hover:text-brand-700">
              {p}
            </button>
          ))}
        </div>
      )}

      <div className="flex-1 overflow-y-auto space-y-4 mb-4 min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0
              ${msg.role === 'assistant' ? 'bg-gradient-to-br from-brand-500 to-blue-500' : 'bg-stone-900'}`}>
              {msg.role === 'assistant'
                ? <Bot size={15} className="text-white"/>
                : <User size={15} className="text-white"/>}
            </div>
            <div className={`max-w-2xl rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap
              ${msg.role === 'assistant' ? 'bg-white border border-stone-200 text-stone-800' : 'bg-stone-900 text-white'}`}>
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-brand-500 to-blue-500 flex items-center justify-center">
              <Bot size={15} className="text-white"/>
            </div>
            <div className="bg-white border border-stone-200 rounded-2xl px-4 py-3 flex items-center gap-2">
              <Loader2 size={14} className="animate-spin text-brand-500"/>
              <span className="text-sm text-stone-400">Thinking…</span>
            </div>
          </div>
        )}
        <div ref={bottomRef}/>
      </div>

      <div className="flex gap-2">
        <input className="input flex-1" placeholder="Ask anything about your projects…"
          value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && sendMessage()}/>
        <button onClick={() => sendMessage()} disabled={!input.trim() || loading}
          className="btn-primary px-4 flex items-center gap-2 disabled:opacity-50">
          <Send size={15}/>
        </button>
      </div>
    </div>
  )
}

'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Mail, Send } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TestReminderPage() {
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function sendTest() {
    setSending(true)
    setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error('Not logged in'); return }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 20000)
      const res = await fetch('/api/admin/test-reminder', {
        method: 'POST',
        headers: { 'x-supabase-auth': session.access_token },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)
      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) } catch { data = { success: false, errors: [`Non-JSON response (status ${res.status}): ${text.slice(0, 500)}`] } }
      setResult(data)

      if (data.success && data.sent > 0) toast.success(`Sent to ${data.sent.join(', ')}`)
      else if (data.success && data.note) toast(data.note)
      else toast.error('Failed — see details below')
    } catch (err: any) {
      const message = err?.name === 'AbortError' ? 'Timed out after 20 seconds — the request never got a response' : (err?.message || String(err))
      setResult({ success: false, errors: [`Request failed: ${message}`] })
      toast.error('Request failed — see details below')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <Mail size={20} className="text-brand-500"/>
        <h1 className="text-xl font-semibold text-stone-900">Test To-Do Reminder</h1>
      </div>
      <p className="text-sm text-stone-500 mb-6">
        Sends the reminder email right now, using today's actual incomplete to-do items — same as the 8:30am and 1:30pm scheduled runs.
      </p>

      <button onClick={sendTest} disabled={sending} className="btn-primary flex items-center gap-2">
        <Send size={14}/> {sending ? 'Sending…' : 'Send Test Now'}
      </button>

      {result && (
        <div className="mt-5 card p-4">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Result</p>
          <pre className="text-xs text-stone-700 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      <p className="text-xs text-stone-400 mt-4">
        This only works if you have at least one incomplete to-do item dated today — otherwise it correctly sends nothing, matching production behaviour.
      </p>
    </div>
  )
}

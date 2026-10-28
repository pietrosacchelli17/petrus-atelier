'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { FileText, Send } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TestWeeklyReportPage() {
  const [sending, setSending] = useState(false)
  const [result, setResult] = useState<any>(null)

  async function sendTest() {
    setSending(true)
    setResult(null)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { toast.error('Not logged in'); return }

      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), 50000)
      const res = await fetch('/api/admin/test-weekly-report', {
        method: 'POST',
        headers: { 'x-supabase-auth': session.access_token },
        signal: controller.signal,
      })
      clearTimeout(timeoutId)

      const text = await res.text()
      let data: any
      try { data = JSON.parse(text) } catch { data = { success: false, errors: [`Non-JSON response (status ${res.status}): ${text.slice(0, 500)}`] } }
      setResult(data)

      if (data.success) toast.success(`Saved: ${(data.savedFiles || []).join(', ')}`)
      else toast.error('Failed — see details below')
    } catch (err: any) {
      const message = err?.name === 'AbortError' ? 'Timed out after 50 seconds' : (err?.message || String(err))
      setResult({ success: false, errors: [`Request failed: ${message}`] })
      toast.error('Request failed — see details below')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="p-6 max-w-lg mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <FileText size={20} className="text-brand-500"/>
        <h1 className="text-xl font-semibold text-stone-900">Test Weekly Report</h1>
      </div>
      <p className="text-sm text-stone-500 mb-6">
        Generates and saves this week's Project Report and Sales Report right now — the same thing that runs automatically every Friday at 4:30pm.
      </p>

      <button onClick={sendTest} disabled={sending} className="btn-primary flex items-center gap-2">
        <Send size={14}/> {sending ? 'Generating…' : 'Generate Now'}
      </button>

      {result && (
        <div className="mt-5 card p-4">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Result</p>
          <pre className="text-xs text-stone-700 whitespace-pre-wrap">{JSON.stringify(result, null, 2)}</pre>
        </div>
      )}

      <p className="text-xs text-stone-400 mt-4">
        If this succeeds, check Reports → Archive — both PDFs should appear there immediately.
      </p>
    </div>
  )
}

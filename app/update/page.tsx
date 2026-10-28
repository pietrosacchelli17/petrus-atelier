'use client'
import { useEffect, useState, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { STAGE_CONFIG, ProjectStage } from '@/types'
import { format, parseISO, differenceInDays } from 'date-fns'
import { CheckCircle, Loader2, AlertTriangle } from 'lucide-react'

function UpdateForm() {
  const searchParams = useSearchParams()
  const pmEmail = searchParams.get('pm')
  const [pm, setPm] = useState<any>(null)
  const [projects, setProjects] = useState<any[]>([])
  const [updates, setUpdates] = useState<Record<string, { note: string; stage: string }>>({})
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadData() }, [pmEmail])

  async function loadData() {
    const { data: { user: authUser } } = await supabase.auth.getUser()

    let userId: string | null = null

    if (pmEmail) {
      const { data: found } = await supabase.from('users').select('*').eq('email', pmEmail).single()
      if (found) { setPm(found); userId = found.id }
      else { setError('PM not found. Check the link.'); setLoading(false); return }
    } else if (authUser) {
      const { data: profile } = await supabase.from('users').select('*').eq('id', authUser.id).single()
      if (profile) { setPm(profile); userId = profile.id }
    }

    if (!userId) { 
      if (typeof window !== 'undefined') window.location.href = '/auth'
      return 
    }

    const { data: proj } = await supabase.from('projects')
      .select('*, milestones:project_milestones(*)')
      .eq('project_manager_id', userId)
      .neq('status', 'complete')
      .order('name')

    setProjects(proj || [])
    const init: Record<string, any> = {}
    proj?.forEach(p => { init[p.id] = { note: p.next_action || '', stage: p.current_stage } })
    setUpdates(init)
    setLoading(false)
  }

  async function submit() {
    const filled = projects.filter(p => updates[p.id]?.note?.trim())
    if (!filled.length) return
    setSubmitting(true)
    for (const p of filled) {
      const u = updates[p.id]
      await supabase.from('projects').update({
        current_stage: u.stage as ProjectStage,
        next_action: u.note,
        updated_at: new Date().toISOString(),
      }).eq('id', p.id)
      await supabase.from('activity_log').insert({
        project_id: p.id, user_id: pm?.id,
        action: 'submitted weekly update', details: u.note,
      })
    }
    setSubmitting(false)
    setDone(true)
  }

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen">
      <Loader2 size={24} className="animate-spin" style={{ color: '#8C7F58' }}/>
    </div>
  )

  if (error) return (
    <div className="flex items-center justify-center min-h-screen p-6" style={{ background: '#F4F3F0' }}>
      <div className="card p-8 text-center max-w-sm">
        <p className="text-stone-600 text-sm mb-4">{error}</p>
        <a href="/auth" className="btn-primary text-sm">Log in</a>
      </div>
    </div>
  )

  if (done) return (
    <div className="flex items-center justify-center min-h-screen" style={{ background: '#F4F3F0' }}>
      <div className="card p-10 text-center max-w-sm w-full">
        <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#ECFDF5' }}>
          <CheckCircle size={32} style={{ color: '#10B981' }}/>
        </div>
        <h2 className="text-xl font-semibold text-stone-900 mb-2">Done!</h2>
        <p className="text-stone-400 text-sm mb-6">
          Thanks {pm?.full_name?.split(' ')[0]}. Pietro has been notified.
        </p>
        <a href="/dashboard" className="btn-primary inline-flex items-center gap-2 text-sm">
          Go to dashboard →
        </a>
      </div>
    </div>
  )

  const filled = projects.filter(p => updates[p.id]?.note?.trim()).length

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: '#F4F3F0' }}>
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#1A1914' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#BFB493" strokeWidth="2.5">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest" style={{ color: '#8C7F58' }}>Petrus Atelier</p>
            <h1 className="text-lg font-semibold text-stone-900 leading-tight">
              Weekly update — {pm?.full_name?.split(' ')[0]}
            </h1>
          </div>
        </div>

        <p className="text-sm text-stone-500 mb-4">
          Add a quick note for each project. What happened? What's next? Any issues?
        </p>

        <div className="space-y-3 mb-5">
          {projects.map(p => {
            const sc = STAGE_CONFIG[p.current_stage as ProjectStage]
            const u = updates[p.id] || { note: '', stage: p.current_stage }
            const nextMs = p.milestones
              ?.filter((m: any) => m.planned_date && m.status !== 'complete')
              ?.sort((a: any, b: any) => a.planned_date.localeCompare(b.planned_date))[0]
            const daysUntil = nextMs?.planned_date
              ? differenceInDays(parseISO(nextMs.planned_date), new Date())
              : null

            return (
              <div key={p.id} className="card p-4">
                <div className="flex items-start gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-stone-900 text-sm">{p.name}</p>
                    <p className="text-xs text-stone-400">{p.client}</p>
                  </div>
                  <span className="badge text-xs flex-shrink-0" style={{ background: sc?.bg, color: sc?.color }}>
                    {sc?.label}
                  </span>
                </div>

                {nextMs && daysUntil !== null && daysUntil <= 14 && (
                  <div className={'text-xs px-3 py-1.5 rounded-lg mb-2 flex items-center gap-1.5 ' + (daysUntil < 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600')}>
                    <AlertTriangle size={11}/>
                    <span className="font-medium">{STAGE_CONFIG[nextMs.stage as ProjectStage]?.label}</span>
                    <span>{daysUntil < 0 ? '— ' + Math.abs(daysUntil) + 'd overdue' : daysUntil === 0 ? '— due today' : '— due in ' + daysUntil + 'd'}</span>
                  </div>
                )}

                <select
                  className="input text-sm mb-2"
                  value={u.stage}
                  onChange={e => setUpdates(prev => ({ ...prev, [p.id]: { ...prev[p.id], stage: e.target.value } }))}>
                  {Object.entries(STAGE_CONFIG).map(([key, cfg]) => (
                    <option key={key} value={key}>{cfg.label}</option>
                  ))}
                </select>

                <textarea
                  className="input text-sm"
                  rows={2}
                  placeholder="What happened this week? What's the next step?"
                  value={u.note}
                  onChange={e => setUpdates(prev => ({ ...prev, [p.id]: { ...prev[p.id], note: e.target.value } }))}
                />
              </div>
            )
          })}
        </div>

        <button
          onClick={submit}
          disabled={submitting || filled === 0}
          className="btn-primary w-full py-3.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50">
          {submitting
            ? <><Loader2 size={15} className="animate-spin"/> Saving…</>
            : <>Submit {filled} update{filled !== 1 ? 's' : ''} →</>}
        </button>

        {filled === 0 && (
          <p className="text-xs text-center text-stone-400 mt-2">Add a note to at least one project to submit</p>
        )}
      </div>
    </div>
  )
}

export default function UpdatePage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 size={24} className="animate-spin" style={{ color: '#8C7F58' }}/></div>}>
      <UpdateForm/>
    </Suspense>
  )
}

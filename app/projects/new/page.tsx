'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { STAGE_CONFIG } from '@/types'
import { ArrowLeft, Save } from 'lucide-react'
import toast from 'react-hot-toast'

const STAGES = Object.keys(STAGE_CONFIG) as (keyof typeof STAGE_CONFIG)[]

export default function NewProjectPage() {
  const router = useRouter()
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [form, setForm] = useState({
    name: '', client: '', architect: '', contractor: '',
    project_manager_id: '', value: '', start_date: '',
    completion_date: '', current_stage: 'quotation', status: 'active',
    next_action: '', notes: '', address: '', reference: '',
  })

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        supabase.from('users').select('*').order('full_name').then(({ data: u }) => {
          setUsers(u || [])
          const me = u?.find((x: any) => x.id === data.user!.id)
          setCurrentUser(me)
          setForm(f => ({ ...f, project_manager_id: data.user!.id }))
        })
      }
    })
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name || !form.client) { toast.error('Project name and client are required'); return }
    setLoading(true)
    const { data: project, error } = await supabase.from('projects').insert({
      ...form,
      value: form.value ? parseFloat(form.value) : null,
      start_date: form.start_date || null,
      completion_date: form.completion_date || null,
      project_manager_id: form.project_manager_id || currentUser?.id,
    }).select().single()

    if (error) { toast.error(error.message); setLoading(false); return }

    // Create default milestones
    await supabase.from('project_milestones').insert(
      STAGES.map(stage => ({ project_id: project.id, stage, status: 'planned' }))
    )

    // Log activity
    await supabase.from('activity_log').insert({
      project_id: project.id, user_id: currentUser?.id,
      action: `created project "${form.name}"`
    })

    toast.success('Project created!')
    router.push(`/projects/${project.id}`)
  }

  const f = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => router.back()} className="p-1.5 hover:bg-stone-100 rounded-lg">
          <ArrowLeft size={18} className="text-stone-600"/>
        </button>
        <div>
          <h1 className="text-xl font-semibold text-stone-900">New project</h1>
          <p className="text-sm text-stone-500 mt-0.5">Fill in the details below to create a new project</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Basic info */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-stone-700 mb-4">Project details</h2>
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="label">Project name *</label>
              <input className="input" placeholder="e.g. Meyrick — Hawthorn Hill"
                value={form.name} onChange={e => f('name', e.target.value)} required/>
            </div>
            <div>
              <label className="label">Client *</label>
              <input className="input" placeholder="Client name"
                value={form.client} onChange={e => f('client', e.target.value)} required/>
            </div>
            <div>
              <label className="label">Reference</label>
              <input className="input" placeholder="Project reference / code"
                value={form.reference} onChange={e => f('reference', e.target.value)}/>
            </div>
            <div>
              <label className="label">Architect</label>
              <input className="input" placeholder="Architect name"
                value={form.architect} onChange={e => f('architect', e.target.value)}/>
            </div>
            <div>
              <label className="label">Contractor</label>
              <input className="input" placeholder="Contractor name"
                value={form.contractor} onChange={e => f('contractor', e.target.value)}/>
            </div>
            <div className="col-span-2">
              <label className="label">Site address</label>
              <input className="input" placeholder="Full site address"
                value={form.address} onChange={e => f('address', e.target.value)}/>
            </div>
          </div>
        </div>

        {/* Team & value */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-stone-700 mb-4">Team & financials</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Project manager</label>
              <select className="input" value={form.project_manager_id} onChange={e => f('project_manager_id', e.target.value)}>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Project value (£)</label>
              <input type="number" className="input" placeholder="0.00"
                value={form.value} onChange={e => f('value', e.target.value)}/>
            </div>
          </div>
        </div>

        {/* Dates & stage */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-stone-700 mb-4">Dates & stage</h2>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start date</label>
              <input type="date" className="input" value={form.start_date} onChange={e => f('start_date', e.target.value)}/>
            </div>
            <div>
              <label className="label">Target completion</label>
              <input type="date" className="input" value={form.completion_date} onChange={e => f('completion_date', e.target.value)}/>
            </div>
            <div>
              <label className="label">Current stage</label>
              <select className="input" value={form.current_stage} onChange={e => f('current_stage', e.target.value)}>
                {STAGES.map(s => <option key={s} value={s}>{STAGE_CONFIG[s].label}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Status</label>
              <select className="input" value={form.status} onChange={e => f('status', e.target.value)}>
                <option value="active">Active</option>
                <option value="on_hold">On hold</option>
                <option value="complete">Complete</option>
              </select>
            </div>
          </div>
        </div>

        {/* Notes */}
        <div className="card p-5">
          <h2 className="text-sm font-semibold text-stone-700 mb-4">Notes & actions</h2>
          <div className="space-y-4">
            <div>
              <label className="label">Next action</label>
              <input className="input" placeholder="What needs to happen next?"
                value={form.next_action} onChange={e => f('next_action', e.target.value)}/>
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea className="input min-h-28" placeholder="Any additional notes, special requirements, or context…"
                value={form.notes} onChange={e => f('notes', e.target.value)}/>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button type="submit" disabled={loading} className="btn-primary flex items-center gap-2 py-2.5 px-6">
            <Save size={15}/>
            {loading ? 'Creating…' : 'Create project'}
          </button>
          <button type="button" onClick={() => router.back()} className="btn-secondary py-2.5">
            Cancel
          </button>
        </div>
      </form>
    </div>
  )
}

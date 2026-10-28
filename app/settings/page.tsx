'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Save, Bell, User, Lock, Palette } from 'lucide-react'
import toast from 'react-hot-toast'

const COLORS = ['#10B981','#6366F1','#F59E0B','#EF4444','#8B5CF6','#F97316','#3B82F6','#EC4899','#059669','#1D4ED8','#374151','#DC2626']

export default function SettingsPage() {
  const [user, setUser] = useState<any>(null)
  const [form, setForm] = useState({ full_name:'', phone:'', department:'', color:'#10B981' })
  const [pwForm, setPwForm] = useState({ current:'', next:'', confirm:'' })
  const [loading, setLoading] = useState(false)
  const [tab, setTab] = useState<'profile'|'security'|'notifications'>('profile')

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return
      supabase.from('users').select('*').eq('id', data.user.id).single().then(({ data: u }) => {
        setUser(u)
        if (u) setForm({ full_name: u.full_name||'', phone: u.phone||'', department: u.department||'', color: u.color||'#10B981' })
      })
    })
  }, [])

  async function saveProfile() {
    setLoading(true)
    const { error } = await supabase.from('users').update({
      full_name: form.full_name, phone: form.phone,
      department: form.department, color: form.color,
    }).eq('id', user.id)
    if (error) toast.error(error.message)
    else toast.success('Profile saved')
    setLoading(false)
  }

  async function changePassword() {
    if (pwForm.next !== pwForm.confirm) { toast.error('Passwords do not match'); return }
    if (pwForm.next.length < 8) { toast.error('Password must be at least 8 characters'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: pwForm.next })
    if (error) toast.error(error.message)
    else { toast.success('Password changed'); setPwForm({ current:'', next:'', confirm:'' }) }
    setLoading(false)
  }

  const initials = form.full_name?.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?'

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-900">Settings</h1>
        <p className="text-sm text-stone-500 mt-0.5">Manage your account and preferences</p>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-stone-200 mb-6">
        {([['profile','Profile',User],['security','Security',Lock],['notifications','Notifications',Bell]] as const).map(([id,label,Icon]) => (
          <button key={id} onClick={() => setTab(id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors
              ${tab === id ? 'border-brand-500 text-brand-600' : 'border-transparent text-stone-500 hover:text-stone-700'}`}>
            <Icon size={14}/>{label}
          </button>
        ))}
      </div>

      {tab === 'profile' && (
        <div className="space-y-5">
          {/* Avatar */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-stone-700 mb-4">Avatar & colour</h3>
            <div className="flex items-center gap-5">
              <div className="w-16 h-16 rounded-full flex items-center justify-center text-2xl font-bold text-white flex-shrink-0"
                style={{ background: form.color }}>
                {initials}
              </div>
              <div>
                <p className="text-xs text-stone-500 mb-2">Choose your colour</p>
                <div className="flex gap-2 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setForm({...form, color: c})}
                      className={`w-7 h-7 rounded-full border-2 transition-all hover:scale-110
                        ${form.color === c ? 'border-stone-900 scale-110' : 'border-transparent'}`}
                      style={{ background: c }}/>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Profile fields */}
          <div className="card p-5">
            <h3 className="text-sm font-semibold text-stone-700 mb-4">Personal details</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Full name</label>
                <input className="input" value={form.full_name} onChange={e => setForm({...form, full_name: e.target.value})}/>
              </div>
              <div>
                <label className="label">Email</label>
                <input className="input bg-stone-50 text-stone-400 cursor-not-allowed" value={user?.email || ''} disabled/>
              </div>
              <div>
                <label className="label">Phone</label>
                <input className="input" placeholder="+44 7700 000000" value={form.phone} onChange={e => setForm({...form, phone: e.target.value})}/>
              </div>
              <div>
                <label className="label">Department</label>
                <input className="input" placeholder="e.g. Installations" value={form.department} onChange={e => setForm({...form, department: e.target.value})}/>
              </div>
            </div>
            <button onClick={saveProfile} disabled={loading}
              className="btn-primary flex items-center gap-2 mt-5">
              <Save size={14}/>{loading ? 'Saving…' : 'Save profile'}
            </button>
          </div>
        </div>
      )}

      {tab === 'security' && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-stone-700 mb-4">Change password</h3>
          <div className="space-y-4">
            <div>
              <label className="label">New password</label>
              <input type="password" className="input" placeholder="Min. 8 characters"
                value={pwForm.next} onChange={e => setPwForm({...pwForm, next: e.target.value})}/>
            </div>
            <div>
              <label className="label">Confirm new password</label>
              <input type="password" className="input" placeholder="Repeat new password"
                value={pwForm.confirm} onChange={e => setPwForm({...pwForm, confirm: e.target.value})}/>
            </div>
          </div>
          <button onClick={changePassword} disabled={loading}
            className="btn-primary flex items-center gap-2 mt-5">
            <Lock size={14}/>{loading ? 'Updating…' : 'Change password'}
          </button>
        </div>
      )}

      {tab === 'notifications' && (
        <div className="card p-5">
          <h3 className="text-sm font-semibold text-stone-700 mb-4">Notification preferences</h3>
          <div className="space-y-4">
            {[
              { label: 'Task assigned to me', desc: 'When someone assigns a task to you' },
              { label: 'Task due tomorrow', desc: 'Reminder the day before a task is due' },
              { label: 'Task overdue', desc: 'When a task passes its due date' },
              { label: 'No project update in 7 days', desc: 'Reminder to update stale projects' },
              { label: 'Project stage changed', desc: 'When a project moves to a new stage' },
            ].map(n => (
              <div key={n.label} className="flex items-center justify-between py-1">
                <div>
                  <p className="text-sm font-medium text-stone-900">{n.label}</p>
                  <p className="text-xs text-stone-400 mt-0.5">{n.desc}</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input type="checkbox" defaultChecked className="sr-only peer"/>
                  <div className="w-10 h-5 bg-stone-200 rounded-full peer peer-checked:bg-brand-500 transition-colors"/>
                  <div className="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full shadow peer-checked:translate-x-5 transition-transform"/>
                </label>
              </div>
            ))}
          </div>
          <button className="btn-primary flex items-center gap-2 mt-5">
            <Save size={14}/>Save preferences
          </button>
        </div>
      )}
    </div>
  )
}

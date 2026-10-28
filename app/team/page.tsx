'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { format, parseISO } from 'date-fns'
import { STAGE_CONFIG, TASK_STATUS_CONFIG } from '@/types'
import { Users, FolderOpen, CheckSquare, Mail, Phone, Edit, Plus, X, Save } from 'lucide-react'
import toast from 'react-hot-toast'

export default function TeamPage() {
  const { t } = useLanguage()
  const [users, setUsers] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [tasks, setTasks] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [editing, setEditing] = useState<string | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [showInvite, setShowInvite] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteName, setInviteName] = useState('')
  const [invitePassword, setInvitePassword] = useState('')
  const [inviteRole, setInviteRole] = useState('member')
  const [inviteColor, setInviteColor] = useState('#10B981')
  const [inviting, setInviting] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    const [usersRes, projRes, tasksRes, meRes] = await Promise.all([
      supabase.from('users').select('*').order('full_name'),
      supabase.from('projects').select('id, name, status, current_stage, project_manager_id').neq('status', 'complete'),
      supabase.from('tasks').select('id, title, status, priority, due_date, assigned_to_id').neq('status', 'completed'),
      supabase.from('users').select('*').eq('id', user?.id || '').single(),
    ])
    setUsers(usersRes.data || [])
    setProjects(projRes.data || [])
    setTasks(tasksRes.data || [])
    setCurrentUser(meRes.data)
    setLoading(false)
  }

  async function saveUser() {
    const { error } = await supabase.from('users').update({
      full_name: editForm.full_name,
      role: editForm.role,
      color: editForm.color,
      phone: editForm.phone,
      department: editForm.department,
    }).eq('id', editing)
    if (error) { toast.error(error.message); return }
    toast.success('Profile updated')
    setEditing(null)
    loadAll()
  }

  function generatePassword() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
    let pwd = ''
    for (let i = 0; i < 12; i++) pwd += chars[Math.floor(Math.random() * chars.length)]
    setInvitePassword(pwd)
  }

  async function createUser() {
    if (!inviteName.trim() || !inviteEmail.trim() || !invitePassword) {
      toast.error('Please fill in name, email and password')
      return
    }
    if (invitePassword.length < 8) {
      toast.error('Password must be at least 8 characters')
      return
    }
    setInviting(true)

    const { data, error } = await supabase.auth.signUp({
      email: inviteEmail.trim(),
      password: invitePassword,
      options: { data: { full_name: inviteName.trim() } },
    })

    if (error) {
      toast.error(error.message)
      setInviting(false)
      return
    }

    if (data.user) {
      const { error: profileError } = await supabase.from('users').insert({
        id: data.user.id,
        email: inviteEmail.trim(),
        full_name: inviteName.trim(),
        role: inviteRole,
        color: inviteColor,
      })
      if (profileError) {
        toast.error(profileError.message)
        setInviting(false)
        return
      }
    }

    toast.success(`${inviteName} added — share their login details directly`)
    setShowInvite(false)
    setInviteEmail(''); setInviteName(''); setInvitePassword(''); setInviteRole('member'); setInviteColor('#10B981')
    loadAll()
    setInviting(false)
  }

  const COLORS = ['#10B981','#6366F1','#F59E0B','#EF4444','#8B5CF6','#F97316','#3B82F6','#EC4899','#059669','#1D4ED8']

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="p-5 w-full">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Team</h1>
          <p className="text-sm text-stone-500 mt-0.5">{users.length} member{users.length !== 1 ? 's' : ''}</p>
        </div>
        {currentUser?.role === 'admin' && (
          <button onClick={() => setShowInvite(true)} className="btn-primary flex items-center gap-2">
            <Plus size={14}/> Add member
          </button>
        )}
      </div>

      {/* Add member modal */}
      {showInvite && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-modal p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold">Add team member</h2>
              <button onClick={() => setShowInvite(false)}><X size={18} className="text-stone-400"/></button>
            </div>
            <div className="space-y-4">
              <div><label className="label">Full name</label>
                <input className="input" placeholder="Thomas Harwood" value={inviteName} onChange={e => setInviteName(e.target.value)}/></div>
              <div><label className="label">Email</label>
                <input type="email" className="input" placeholder="name@stoneline.co.uk" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}/></div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Password</label>
                  <button onClick={generatePassword} className="text-xs text-brand-600 hover:underline">Generate</button>
                </div>
                <input type="text" className="input font-mono" placeholder="Min. 8 characters" value={invitePassword} onChange={e => setInvitePassword(e.target.value)}/>
                <p className="text-xs text-stone-400 mt-1">Share this password with them directly. If Supabase email confirmation is on, they'll need to confirm via email before logging in.</p>
              </div>
              <div><label className="label">Role</label>
                <select className="input" value={inviteRole} onChange={e => setInviteRole(e.target.value)}>
                  <option value="member">Member</option>
                  <option value="manager">Manager</option>
                  <option value="admin">Admin</option>
                </select></div>
              <div>
                <label className="label">Colour</label>
                <div className="flex gap-1.5 flex-wrap">
                  {COLORS.map(c => (
                    <button key={c} onClick={() => setInviteColor(c)}
                      className={`w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 ${inviteColor === c ? 'border-stone-900 scale-110' : 'border-transparent'}`}
                      style={{ background: c }}/>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={createUser} disabled={inviting} className="btn-primary flex-1 disabled:opacity-60">
                {inviting ? 'Creating…' : 'Create account'}
              </button>
              <button onClick={() => setShowInvite(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Team cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
        {users.map(user => {
          const myProjects = projects.filter(p => p.project_manager_id === user.id)
          const myTasks = tasks.filter(t => t.assigned_to_id === user.id)
          const initials = user.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
          const isMe = user.id === currentUser?.id
          const canEdit = currentUser?.role === 'admin' || isMe

          return (
            <div key={user.id} className="card p-5">
              {editing === user.id ? (
                <div className="space-y-3">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white"
                      style={{ background: editForm.color || user.color }}>
                      {initials}
                    </div>
                    <div className="flex gap-1.5 flex-wrap">
                      {COLORS.map(c => (
                        <button key={c} onClick={() => setEditForm({...editForm, color: c})}
                          className={`w-5 h-5 rounded-full border-2 transition-transform hover:scale-110 ${editForm.color === c ? 'border-stone-900 scale-110' : 'border-transparent'}`}
                          style={{ background: c }}/>
                      ))}
                    </div>
                  </div>
                  <div><label className="label">Name</label>
                    <input className="input" value={editForm.full_name} onChange={e => setEditForm({...editForm, full_name: e.target.value})}/></div>
                  <div><label className="label">Department</label>
                    <input className="input" placeholder="e.g. Installations" value={editForm.department || ''} onChange={e => setEditForm({...editForm, department: e.target.value})}/></div>
                  <div><label className="label">Phone</label>
                    <input className="input" placeholder="+44 7700 000000" value={editForm.phone || ''} onChange={e => setEditForm({...editForm, phone: e.target.value})}/></div>
                  {currentUser?.role === 'admin' && (
                    <div><label className="label">Role</label>
                      <select className="input" value={editForm.role} onChange={e => setEditForm({...editForm, role: e.target.value})}>
                        <option value="member">Member</option>
                        <option value="manager">Manager</option>
                        <option value="admin">Admin</option>
                      </select></div>
                  )}
                  <div className="flex gap-2 pt-1">
                    <button onClick={saveUser} className="btn-primary flex items-center gap-1.5 text-xs py-1.5"><Save size={12}/>Save</button>
                    <button onClick={() => setEditing(null)} className="btn-secondary text-xs py-1.5">Cancel</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full flex items-center justify-center text-lg font-bold text-white flex-shrink-0"
                        style={{ background: user.color || '#10B981' }}>
                        {initials}
                      </div>
                      <div>
                        <div className="font-semibold text-stone-900 flex items-center gap-1.5">
                          {user.full_name}
                          {isMe && <span className="text-xs bg-brand-100 text-brand-700 px-1.5 py-0.5 rounded-full">You</span>}
                        </div>
                        <div className="text-xs text-stone-400 mt-0.5 capitalize">{user.role}{user.department ? ` · ${user.department}` : ''}</div>
                      </div>
                    </div>
                    {canEdit && (
                      <button onClick={() => { setEditing(user.id); setEditForm({...user}) }}
                        className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 hover:text-stone-600">
                        <Edit size={14}/>
                      </button>
                    )}
                  </div>

                  <div className="space-y-1.5 mb-4">
                    {user.email && (
                      <a href={`mailto:${user.email}`} className="flex items-center gap-2 text-xs text-stone-500 hover:text-brand-600">
                        <Mail size={12}/> {user.email}
                      </a>
                    )}
                    {user.phone && (
                      <a href={`tel:${user.phone}`} className="flex items-center gap-2 text-xs text-stone-500 hover:text-brand-600">
                        <Phone size={12}/> {user.phone}
                      </a>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-stone-50 rounded-lg p-2.5 text-center">
                      <div className="text-lg font-bold text-stone-900">{myProjects.length}</div>
                      <div className="text-xs text-stone-400">Projects</div>
                    </div>
                    <div className="bg-stone-50 rounded-lg p-2.5 text-center">
                      <div className="text-lg font-bold text-stone-900">{myTasks.length}</div>
                      <div className="text-xs text-stone-400">Open tasks</div>
                    </div>
                  </div>

                  {myProjects.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">{t('dash_active_projects')}</p>
                      <div className="space-y-1.5">
                        {myProjects.slice(0, 3).map(p => {
                          const sc = STAGE_CONFIG[p.current_stage as keyof typeof STAGE_CONFIG]
                          return (
                            <div key={p.id} className="flex items-center gap-2">
                              <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: sc?.color }}/>
                              <span className="text-xs text-stone-600 truncate flex-1">{p.name}</span>
                              <span className="text-xs" style={{ color: sc?.color }}>{sc?.label}</span>
                            </div>
                          )
                        })}
                        {myProjects.length > 3 && (
                          <p className="text-xs text-stone-400">+{myProjects.length - 3} more</p>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

'use client'
import { useEffect, useState, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { Task, TASK_STATUS_CONFIG, PRIORITY_CONFIG } from '@/types'
import { format, parseISO, isPast, isToday, isTomorrow } from 'date-fns'
import { Plus, CheckSquare, AlertTriangle, Trash2, ChevronDown, ChevronRight, FolderOpen } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS_OPTS = Object.keys(TASK_STATUS_CONFIG) as (keyof typeof TASK_STATUS_CONFIG)[]
const PRIORITY_OPTS = Object.keys(PRIORITY_CONFIG) as (keyof typeof PRIORITY_CONFIG)[]

function TasksInner() {
  const searchParams = useSearchParams()
  const [tasks, setTasks] = useState<Task[]>([])
  const [filtered, setFiltered] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState<string>()
  const [users, setUsers] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [filter, setFilter] = useState(searchParams.get('filter') || 'all')
  const [personFilter, setPersonFilter] = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', project_id: '', assigned_to_id: '', due_date: '', priority: 'medium', description: '' })
  const [editTask, setEditTask] = useState<Task | null>(null)
  const [editForm, setEditForm] = useState({ title: '', project_id: '', assigned_to_id: '', due_date: '', priority: 'medium', description: '', status: 'not_started' })
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const [autoExpanded, setAutoExpanded] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id)
      loadAll(data.user?.id)
    })
  }, [])

  useEffect(() => { applyFilter() }, [tasks, filter, statusFilter, priorityFilter, personFilter, userId])

  async function loadAll(uid?: string) {
    const [tasksRes, usersRes, projRes] = await Promise.all([
      supabase.from('tasks').select('*, project:projects(id,name), assigned_to:users!assigned_to_id(*), created_by:users!created_by_id(*)').order('due_date'),
      supabase.from('users').select('*').order('full_name'),
      supabase.from('projects').select('id,name').order('name'),
    ])
    setTasks(tasksRes.data || [])
    setUsers(usersRes.data || [])
    setProjects(projRes.data || [])
    setLoading(false)
  }

  function applyFilter() {
    let list = [...tasks]
    if (personFilter) list = list.filter(t => t.assigned_to_id === personFilter)
    else if (filter === 'mine') list = list.filter(t => t.assigned_to_id === userId)
    else if (filter === 'today') list = list.filter(t => t.due_date && isToday(parseISO(t.due_date)))
    else if (filter === 'overdue') list = list.filter(t => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)) && t.status !== 'completed')
    if (statusFilter !== 'all') list = list.filter(t => t.status === statusFilter)
    if (priorityFilter !== 'all') list = list.filter(t => t.priority === priorityFilter)
    setFiltered(list)
  }

  async function addTask() {
    if (!newTask.title || !userId) return
    const { error } = await supabase.from('tasks').insert({
      ...newTask, created_by_id: userId,
      due_date: newTask.due_date || null,
      assigned_to_id: newTask.assigned_to_id || null,
      project_id: newTask.project_id || null,
    })
    if (error) { toast.error(error.message); return }
    toast.success('Task added')
    setShowAdd(false)
    setNewTask({ title: '', project_id: '', assigned_to_id: '', due_date: '', priority: 'medium', description: '' })
    loadAll(userId)
  }

  async function updateStatus(taskId: string, status: string) {
    await supabase.from('tasks').update({ status }).eq('id', taskId)
    loadAll(userId)
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return
    await supabase.from('tasks').delete().eq('id', taskId)
    toast.success('Task deleted')
    loadAll(userId)
  }

  function openEditTask(task: Task) {
    setEditTask(task)
    setEditForm({
      title: task.title,
      project_id: (task as any).project_id || (task as any).project?.id || '',
      assigned_to_id: task.assigned_to_id || '',
      due_date: task.due_date || '',
      priority: task.priority,
      description: task.description || '',
      status: task.status,
    })
  }

  async function saveEditTask() {
    if (!editTask) return
    if (!editForm.title.trim()) { toast.error('Title is required'); return }
    const { error } = await supabase.from('tasks').update({
      title: editForm.title.trim(),
      description: editForm.description.trim() || null,
      project_id: editForm.project_id || null,
      assigned_to_id: editForm.assigned_to_id || null,
      due_date: editForm.due_date || null,
      priority: editForm.priority,
      status: editForm.status,
    }).eq('id', editTask.id)
    if (error) { toast.error(error.message); return }
    toast.success('Task updated')
    setEditTask(null)
    loadAll(userId)
  }

  function toggleProject(key: string) {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  const quickFilters = [
    { id: 'all', label: 'All tasks', count: tasks.length },
    { id: 'mine', label: 'Assigned to me', count: tasks.filter(t => t.assigned_to_id === userId).length },
    { id: 'today', label: 'Due today', count: tasks.filter(t => t.due_date && isToday(parseISO(t.due_date))).length },
    { id: 'overdue', label: 'Overdue', count: tasks.filter(t => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)) && t.status !== 'completed').length },
  ]

  // Group tasks by project so the list isn't one long undifferentiated
  // wall — each project becomes its own collapsible section, with the
  // people responsible for it shown right in the header.
  const groupsMap: Record<string, { key: string; name: string; tasks: Task[] }> = {}
  filtered.forEach(t => {
    const proj = (t as any).project
    const key = proj?.id || 'no-project'
    const name = proj?.name || 'No Project'
    if (!groupsMap[key]) groupsMap[key] = { key, name, tasks: [] }
    groupsMap[key].tasks.push(t)
  })
  const groups = Object.values(groupsMap).sort((a, b) => {
    if (a.key === 'no-project') return 1
    if (b.key === 'no-project') return -1
    return a.name.localeCompare(b.name)
  })

  // A distinct accent colour per project, cycling through a fixed
  // palette, so scanning down a long list of projects is easier — not
  // random, so the same project keeps the same colour across visits.
  const PROJECT_COLORS = ['#10B981', '#3B82F6', '#F59E0B', '#8B5CF6', '#EC4899', '#0EA5E9', '#F97316', '#14B8A6']
  const projectColor = (key: string) => {
    if (key === 'no-project') return '#A8A29E'
    let hash = 0
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0
    return PROJECT_COLORS[hash % PROJECT_COLORS.length]
  }

  // Who has the most open work right now, across every project — a
  // quick-glance workload strip so it's obvious who's stretched thin
  // without opening every project card.
  const workloadMap: Record<string, { person: any; count: number }> = {}
  filtered.forEach(t => {
    const a = (t as any).assigned_to
    if (!a || t.status === 'completed') return
    if (!workloadMap[a.id]) workloadMap[a.id] = { person: a, count: 0 }
    workloadMap[a.id].count++
  })
  const workload = Object.values(workloadMap).sort((a, b) => b.count - a.count)
  const maxWorkload = Math.max(1, ...workload.map(w => w.count))

  // Auto-expand only the groups that actually have overdue or due-today
  // tasks the first time data loads, so urgent work surfaces immediately
  // without forcing every project open at once.
  useEffect(() => {
    if (autoExpanded || loading || groups.length === 0) return
    setExpandedProjects(new Set())
    setAutoExpanded(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, filtered.length])

  return (
    <div className="p-4 md:p-5 w-full overflow-x-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold text-stone-900">Tasks</h1>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary flex items-center gap-2 text-sm py-1.5">
          <Plus size={14}/> Add task
        </button>
      </div>

      {/* Add task form */}
      {showAdd && (
        <div className="card p-4 mb-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="md:col-span-2">
              <label className="label">Title</label>
              <input className="input" placeholder="Task title…" value={newTask.title}
                onChange={e => setNewTask({ ...newTask, title: e.target.value })}
                onKeyDown={e => e.key === 'Enter' && addTask()}/>
            </div>
            <div>
              <label className="label">Project</label>
              <select className="input" value={newTask.project_id} onChange={e => setNewTask({ ...newTask, project_id: e.target.value })}>
                <option value="">No project</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Assign to</label>
              <select className="input" value={newTask.assigned_to_id} onChange={e => setNewTask({ ...newTask, assigned_to_id: e.target.value })}>
                <option value="">Unassigned</option>
                {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Due date</label>
              <input type="date" className="input" value={newTask.due_date}
                onChange={e => setNewTask({ ...newTask, due_date: e.target.value })}/>
            </div>
            <div>
              <label className="label">Priority</label>
              <select className="input" value={newTask.priority} onChange={e => setNewTask({ ...newTask, priority: e.target.value })}>
                {PRIORITY_OPTS.map(p => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="label">Description</label>
              <textarea className="input min-h-16" placeholder="Additional details…" value={newTask.description}
                onChange={e => setNewTask({ ...newTask, description: e.target.value })}/>
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button onClick={addTask} className="btn-primary text-sm py-1.5">Add task</button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary text-sm py-1.5">Cancel</button>
          </div>
        </div>
      )}

      {/* Quick filters */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        {quickFilters.map(qf => (
          <button key={qf.id} onClick={() => { setFilter(qf.id); setPersonFilter(null) }}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all
              ${filter === qf.id ? 'bg-stone-900 text-white border-stone-900' : 'bg-white text-stone-600 border-stone-200 hover:border-stone-300'}`}>
            {qf.label}
            <span className={`px-1.5 py-0.5 rounded-full text-xs ${filter === qf.id ? 'bg-white/20' : 'bg-stone-100'}`}>
              {qf.count}
            </span>
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <select className="input py-1 text-xs w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">All statuses</option>
            {STATUS_OPTS.map(s => <option key={s} value={s}>{TASK_STATUS_CONFIG[s].label}</option>)}
          </select>
          <select className="input py-1 text-xs w-auto" value={priorityFilter} onChange={e => setPriorityFilter(e.target.value)}>
            <option value="all">All priorities</option>
            {PRIORITY_OPTS.map(p => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
          </select>
        </div>
      </div>

      {/* Who's carrying what, at a glance — click a person to see just their tasks */}
      {!loading && workload.length > 0 && (
        <div className="mb-5 flex items-center gap-2 flex-wrap">
          {workload.map(w => {
            const isActive = personFilter === w.person.id
            return (
              <button key={w.person.id}
                onClick={() => setPersonFilter(isActive ? null : w.person.id)}
                className={`flex items-center gap-2 rounded-full pl-1.5 pr-3 py-1.5 border transition-all ${isActive ? 'bg-stone-900 border-stone-900' : 'bg-white border-stone-200 hover:border-stone-300'}`}>
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0"
                  style={{ background: w.person.color || '#10B981', fontSize: '10px' }}>
                  {w.person.full_name?.slice(0, 1)}
                </div>
                <span className={`text-xs font-medium ${isActive ? 'text-white' : 'text-stone-700'}`}>{w.person.full_name?.split(' ')[0]}</span>
                <div className="w-10 h-1.5 rounded-full bg-stone-100 overflow-hidden">
                  <div className="h-full rounded-full" style={{ width: `${(w.count / maxWorkload) * 100}%`, background: w.person.color || '#10B981' }}/>
                </div>
                <span className={`text-xs ${isActive ? 'text-stone-300' : 'text-stone-400'}`}>{w.count}</span>
              </button>
            )
          })}
          {personFilter && (
            <button onClick={() => setPersonFilter(null)} className="text-xs text-stone-400 hover:text-stone-600 underline">
              Clear
            </button>
          )}
        </div>
      )}

      {/* Tasks grouped by project */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <CheckSquare size={32} className="text-stone-300 mx-auto mb-3"/>
          <p className="text-stone-400 text-sm">No tasks found.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {groups.map(group => {
            const isOpen = expandedProjects.has(group.key)
            const overdueCount = group.tasks.filter(t => t.due_date && isPast(parseISO(t.due_date)) && !isToday(parseISO(t.due_date)) && t.status !== 'completed').length
            // Unique people assigned across this project's tasks — the
            // ones who actually need to follow up on it.
            const people = Array.from(
              new Map(
                group.tasks
                  .filter(t => (t as any).assigned_to)
                  .map(t => [(t as any).assigned_to.id, (t as any).assigned_to])
              ).values()
            )

            return (
              <div key={group.key} className="card overflow-hidden" style={{ borderLeft: `3px solid ${projectColor(group.key)}` }}>
                <button onClick={() => toggleProject(group.key)}
                  className="w-full flex items-center justify-between gap-3 px-4 py-3 hover:bg-stone-50 transition-colors text-left">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <FolderOpen size={15} className="flex-shrink-0" style={{ color: projectColor(group.key) }}/>
                    {group.key === 'no-project' ? (
                      <span className="text-sm font-semibold text-stone-600 truncate">{group.name}</span>
                    ) : (
                      <Link href={`/projects/${group.key}`} onClick={e => e.stopPropagation()}
                        className="text-sm font-semibold text-stone-900 hover:text-brand-600 truncate">
                        {group.name}
                      </Link>
                    )}
                    <span className="text-xs text-stone-400 flex-shrink-0">{group.tasks.length} task{group.tasks.length !== 1 ? 's' : ''}</span>
                    {overdueCount > 0 && (
                      <span className="text-xs px-1.5 py-0.5 rounded-full bg-red-100 text-red-600 font-semibold flex-shrink-0">{overdueCount} overdue</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Who needs to follow these tasks */}
                    <div className="flex items-center -space-x-1.5">
                      {people.slice(0, 5).map((p: any) => (
                        <div key={p.id} title={p.full_name}
                          className="w-6 h-6 rounded-full flex items-center justify-center text-white font-bold border-2 border-white flex-shrink-0"
                          style={{ background: p.color || '#10B981', fontSize: '9px' }}>
                          {p.full_name?.slice(0, 1)}
                        </div>
                      ))}
                      {people.length > 5 && (
                        <div className="w-6 h-6 rounded-full flex items-center justify-center text-stone-500 bg-stone-100 border-2 border-white font-bold flex-shrink-0" style={{ fontSize: '8px' }}>
                          +{people.length - 5}
                        </div>
                      )}
                      {people.length === 0 && <span className="text-xs text-stone-300">Unassigned</span>}
                    </div>
                    {isOpen ? <ChevronDown size={16} className="text-stone-400"/> : <ChevronRight size={16} className="text-stone-400"/>}
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-stone-100 divide-y divide-stone-50">
                    {group.tasks.map(task => {
                      const sc = TASK_STATUS_CONFIG[task.status]
                      const pc = PRIORITY_CONFIG[task.priority]
                      const overdue = task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date)) && task.status !== 'completed'
                      const dueToday = task.due_date && isToday(parseISO(task.due_date))
                      const dueTomorrow = task.due_date && isTomorrow(parseISO(task.due_date))
                      return (
                        <div key={task.id} className={`px-4 py-3 group hover:bg-stone-50 transition-colors
                          ${overdue ? 'border-l-2 border-l-red-400' : dueToday ? 'border-l-2 border-l-amber-400' : 'border-l-2 border-l-transparent'}`}>
                          <div className="flex items-start gap-3">
                            <input type="checkbox" checked={task.status === 'completed'}
                              onChange={() => updateStatus(task.id, task.status === 'completed' ? 'not_started' : 'completed')}
                              className="w-4 h-4 rounded accent-brand-500 flex-shrink-0 mt-1"/>
                            <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openEditTask(task)}>
                              <div className="flex items-start gap-1.5">
                                <span className={`text-sm font-medium leading-snug ${task.status === 'completed' ? 'line-through text-stone-400' : 'text-stone-900'}`}>
                                  {task.title}
                                </span>
                                {overdue && <AlertTriangle size={12} className="text-red-500 flex-shrink-0 mt-1"/>}
                              </div>
                              {task.description && (
                                <p className="text-xs text-stone-400 mt-0.5 line-clamp-1">{task.description}</p>
                              )}
                              {/* Meta row below title */}
                              <div className="flex items-center gap-2 mt-2 flex-wrap">
                                {(task as any).assigned_to ? (
                                  <button onClick={e => { e.stopPropagation(); setPersonFilter((task as any).assigned_to.id) }}
                                    className="flex items-center gap-1.5 bg-stone-50 hover:bg-stone-100 rounded-full pl-0.5 pr-2 py-0.5 transition-colors">
                                    <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 ring-2 ring-white"
                                      style={{ background: (task as any).assigned_to.color || '#10B981', fontSize: '10px' }}>
                                      {(task as any).assigned_to.full_name?.slice(0, 1)}
                                    </div>
                                    <span className="text-xs font-medium text-stone-600">{(task as any).assigned_to.full_name?.split(' ')[0]}</span>
                                  </button>
                                ) : (
                                  <span className="text-xs text-stone-400 italic bg-stone-50 rounded-full px-2 py-0.5">Unassigned</span>
                                )}
                                {task.due_date && (
                                  <span className={`text-xs font-medium ${overdue ? 'text-red-500' : dueToday ? 'text-amber-500' : dueTomorrow ? 'text-orange-400' : 'text-stone-400'}`}>
                                    {overdue ? `Overdue ${format(parseISO(task.due_date), 'd MMM')}` : dueToday ? 'Today' : dueTomorrow ? 'Tomorrow' : format(parseISO(task.due_date), 'd MMM')}
                                  </span>
                                )}
                                <select value={task.status}
                                  onChange={e => { e.stopPropagation(); updateStatus(task.id, e.target.value) }}
                                  onClick={e => e.stopPropagation()}
                                  className="text-xs border border-stone-200 rounded-lg px-2 py-0.5 bg-white cursor-pointer"
                                  style={{ color: sc.color }}>
                                  {STATUS_OPTS.map(s => <option key={s} value={s}>{TASK_STATUS_CONFIG[s].label}</option>)}
                                </select>
                                <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: pc.color + '18', color: pc.color }}>
                                  {PRIORITY_CONFIG[task.priority].label}
                                </span>
                                <button onClick={e => { e.stopPropagation(); deleteTask(task.id) }}
                                  className="opacity-0 group-hover:opacity-100 ml-auto p-1 text-stone-300 hover:text-red-500 transition-all">
                                  <Trash2 size={12}/>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Edit Task Modal */}
      {editTask && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => setEditTask(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6 overflow-x-hidden" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-900 mb-4">Edit task</h3>
            <div className="space-y-3">
              <div>
                <label className="label">Title</label>
                <input className="input" value={editForm.title}
                  onChange={e => setEditForm({ ...editForm, title: e.target.value })}
                  autoFocus onKeyDown={e => e.key === 'Enter' && saveEditTask()}/>
              </div>
              <div>
                <label className="label">Description</label>
                <textarea className="input min-h-16" value={editForm.description}
                  onChange={e => setEditForm({ ...editForm, description: e.target.value })}/>
              </div>
              <div>
                <label className="label">Project</label>
                <select className="input" value={editForm.project_id}
                  onChange={e => setEditForm({ ...editForm, project_id: e.target.value })}>
                  <option value="">No project</option>
                  {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="label">Assign to</label>
                  <select className="input" value={editForm.assigned_to_id}
                    onChange={e => setEditForm({ ...editForm, assigned_to_id: e.target.value })}>
                    <option value="">Unassigned</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
                <div className="min-w-0">
                  <label className="label">Priority</label>
                  <select className="input" value={editForm.priority}
                    onChange={e => setEditForm({ ...editForm, priority: e.target.value })}>
                    {PRIORITY_OPTS.map(p => <option key={p} value={p}>{PRIORITY_CONFIG[p].label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="label">Due date</label>
                  <input type="date" className="input" value={editForm.due_date}
                    onChange={e => setEditForm({ ...editForm, due_date: e.target.value })}/>
                </div>
                <div className="min-w-0">
                  <label className="label">Status</label>
                  <select className="input" value={editForm.status}
                    onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                    {STATUS_OPTS.map(s => <option key={s} value={s}>{TASK_STATUS_CONFIG[s].label}</option>)}
                  </select>
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between mt-5">
              <button onClick={() => { deleteTask(editTask.id); setEditTask(null) }}
                className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1.5">
                <Trash2 size={13}/> Delete
              </button>
              <div className="flex items-center gap-2">
                <button onClick={() => setEditTask(null)} className="btn-secondary text-sm py-1.5">Cancel</button>
                <button onClick={saveEditTask} className="btn-primary text-sm py-1.5">Save changes</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TasksPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
      </div>
    }>
      <TasksInner />
    </Suspense>
  )
}

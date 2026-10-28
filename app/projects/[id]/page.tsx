'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { Project, Task, STAGE_CONFIG, TASK_STATUS_CONFIG, PRIORITY_CONFIG } from '@/types'
import { format, parseISO, isPast, isToday } from 'date-fns'
import {
  ArrowLeft, Edit, Plus, CheckSquare, FileText, Activity,
  ChevronRight, ChevronDown, Calendar, User, Users, Briefcase, PoundSterling,
  Check, Circle, Clock, AlertTriangle, Trash2, Upload, Download, RefreshCw,
  Image as ImageIcon, Receipt, ClipboardList, Package, MessageSquare, File as FileIcon,
  Mail, Phone, X
} from 'lucide-react'
import toast from 'react-hot-toast'

const STAGES = Object.keys(STAGE_CONFIG) as (keyof typeof STAGE_CONFIG)[]

const SUPPLY_ONLY_STAGES = ['quotation','material_approval','templating','drawings_submission','drawings_approval','fabrication','shipping','delivery']

const DOC_CATEGORIES: { value: string; label: string; icon: any }[] = [
  { value: 'drawing',         label: 'Drawings',        icon: FileText },
  { value: 'photo',           label: 'Images',          icon: ImageIcon },
  { value: 'invoice',         label: 'Invoices',        icon: Receipt },
  { value: 'quotation',       label: 'Quotations',      icon: ClipboardList },
  { value: 'purchase_order',  label: 'Purchase Orders', icon: Package },
  { value: 'meeting_minutes', label: 'Meeting Minutes', icon: MessageSquare },
  { value: 'other',           label: 'Other',           icon: FileIcon },
]
const DOC_CATEGORY_MAP = Object.fromEntries(DOC_CATEGORIES.map(c => [c.value, c]))

const CHECKLIST_ITEMS = [
  { key: 'pm_intro',           label: 'PM Intro' },
  { key: 'pm_intro_email',     label: 'PM Intro Email' },
  { key: 'kickoff_meeting',    label: 'Kick Off Meeting' },
  { key: 'schedule',           label: 'Schedule' },
  { key: 'rams',               label: 'RAMS' },
  { key: 'material_reserved',  label: 'Material Reserved' },
  { key: 'templating',         label: 'Templating' },
  { key: 'drawings_requested', label: 'Drawings Requested from Istanbul' },
  { key: 'drawings_signed_off',label: 'Drawings Signed Off' },
  { key: 'fabrication',        label: 'Fabrication' },
  { key: 'shipping',           label: 'Shipping' },
  { key: 'active_install',     label: 'Active Install' },
  { key: 'snagging',           label: 'Snagging' },
  { key: 'certificate',        label: 'Stoneline Certificate' },
]

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>()
  const router = useRouter()
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [documents, setDocuments] = useState<any[]>([])
  const [snags, setSnags] = useState<any[]>([])
  const [projectContacts, setProjectContacts] = useState<any[]>([])
  const [checklist, setChecklist] = useState<Record<string, boolean>>({})
  const [showSnagModal, setShowSnagModal] = useState(false)
  const [editingSnagId, setEditingSnagId] = useState<string | null>(null)
  const [snagForm, setSnagForm] = useState({ description: '', location: '', priority: 'medium', assigned_to_id: '', photo_url: '' })
  const [uploadingSnagPhoto, setUploadingSnagPhoto] = useState(false)
  const [snagStatusFilter, setSnagStatusFilter] = useState<'all' | 'open' | 'resolved'>('open')
  const [activity, setActivity] = useState<any[]>([])
  const [reservedSlabs, setReservedSlabs] = useState<any[]>([])
  const [linkedEstimate, setLinkedEstimate] = useState<any>(null)
  const [estimatePayments, setEstimatePayments] = useState<any[]>([])
  const [allEstimates, setAllEstimates] = useState<any[]>([])
  const [linkingEstimate, setLinkingEstimate] = useState(false)
  const [expenses, setExpenses] = useState<any[]>([])
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [editingExpenseId, setEditingExpenseId] = useState<string | null>(null)
  const [expenseForm, setExpenseForm] = useState({ category: 'material', description: '', amount: '', currency: 'GBP', expense_date: '', notes: '' })
  const [tab, setTab] = useState<'overview' | 'tasks' | 'materials' | 'contacts' | 'documents' | 'site_photos' | 'snagging' | 'activity' | 'complete_images'>('overview')
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<Partial<Project>>({})
  const [users, setUsers] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [taskModalOpen, setTaskModalOpen] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [taskDetailStatus, setTaskDetailStatus] = useState<string>('not_started')
  const [taskForm, setTaskForm] = useState({ title: '', description: '', assigned_to_id: '', due_date: '', priority: 'medium' as 'low' | 'medium' | 'high' | 'urgent' })
  const [uploadCategory, setUploadCategory] = useState('other')
  const [collapsedCategories, setCollapsedCategories] = useState<Record<string, boolean>>({})
  const [expandedKeyDates, setExpandedKeyDates] = useState<Set<string>>(new Set())

  useEffect(() => { loadAll() }, [id])

  async function loadAll() {
    const [projRes, tasksRes, docsRes, actRes, usersRes, userRes, slabsRes, estimateRes, allEstRes, expensesRes, snagsRes, contactsRes] = await Promise.all([
      supabase.from('projects').select('*, project_manager:users!project_manager_id(*), milestones:project_milestones(*), team_members:project_members(user:users(*))').eq('id', id).single(),
      supabase.from('tasks').select('*, assigned_to:users!assigned_to_id(*)').eq('project_id', id).order('due_date'),
      supabase.from('documents').select('*, uploaded_by:users!uploaded_by_id(*)').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('activity_log').select('*, user:users(*)').eq('project_id', id).order('created_at', { ascending: false }).limit(20),
      supabase.from('users').select('*').order('full_name'),
      supabase.auth.getUser().then(({ data }) => supabase.from('users').select('*, full_access').eq('id', data.user?.id || '').single()),
      supabase.from('stock_slabs').select('*').eq('reserved_project_id', id).order('material_name'),
      supabase.from('quotes').select('*').eq('project_id', id).maybeSingle(),
      supabase.from('quotes').select('id, offer_name, client, grand_total, currency').order('created_at', { ascending: false }).limit(200),
      supabase.from('project_expenses').select('*').eq('project_id', id).order('expense_date', { ascending: false }),
      supabase.from('project_snags').select('*, assigned_to:users!assigned_to_id(*), created_by_user:users!created_by(*)').eq('project_id', id).order('created_at', { ascending: false }),
      supabase.from('contacts').select('*').eq('project_id', id).order('name'),
    ])
    if (projRes.data) {
      const isOwner = projRes.data.project_manager_id === userRes.data?.id
      const isAdmin = userRes.data?.role === 'admin'
      const hasFullAccess = userRes.data?.full_access === true
      if (!isOwner && !isAdmin && !hasFullAccess) {
        toast.error("You don't have access to this project")
        router.push('/projects')
        return
      }
      setProject(projRes.data)
      setForm(projRes.data)
    }
    setTasks(tasksRes.data || [])
    setDocuments(docsRes.data || [])
    setActivity(actRes.data || [])
    setUsers(usersRes.data || [])
    setCurrentUser(userRes.data)
    setReservedSlabs(slabsRes.data || [])
    setLinkedEstimate(estimateRes.data || null)
    setAllEstimates(allEstRes.data || [])
    setExpenses(expensesRes.data || [])
    setSnags(snagsRes.data || [])
    setProjectContacts(contactsRes.data || [])

    const { data: checklistData } = await supabase
      .from('project_checklists')
      .select('item_key, completed')
      .eq('project_id', id)
    const checklistMap: Record<string, boolean> = {}
    for (const item of (checklistData || [])) {
      checklistMap[item.item_key] = item.completed
    }
    setChecklist(checklistMap)
    if (estimateRes.data) {
      const { data: payments } = await supabase.from('quote_payments').select('*').eq('quote_id', estimateRes.data.id).order('sort_order')
      setEstimatePayments(payments || [])
    } else {
      setEstimatePayments([])
    }
    setLoading(false)
  }

  async function saveProject() {
    const { error } = await supabase.from('projects').update({
      name: form.name, client: form.client, architect: form.architect,
      contractor: form.contractor, project_manager_id: form.project_manager_id,
      value: form.value, start_date: form.start_date, completion_date: form.completion_date,
      current_stage: form.current_stage, status: form.status, next_action: form.next_action, notes: form.notes,
      contact_person: (form as any).contact_person, contact_email: (form as any).contact_email, contact_phone: (form as any).contact_phone,
    }).eq('id', id)
    if (error) { toast.error(error.message); return }

    const changes: string[] = []
    if (project) {
      if (form.current_stage !== project.current_stage) {
        const oldLabel = (STAGE_CONFIG as any)[project.current_stage as string]?.label || project.current_stage
        const newLabel = (STAGE_CONFIG as any)[(form.current_stage as string) || '']?.label || form.current_stage
        changes.push(`stage: ${oldLabel} → ${newLabel}`)
      }
      if (form.name !== project.name) changes.push(`name: "${project.name}" → "${form.name}"`)
      if (form.client !== project.client) changes.push(`client: ${project.client} → ${form.client}`)
      if (form.value !== project.value) changes.push(`value: £${project.value} → £${form.value}`)
      if (form.status !== project.status) changes.push(`status: ${project.status} → ${form.status}`)
      if (form.completion_date !== project.completion_date) changes.push(`completion date changed`)
      if (form.next_action !== project.next_action && form.next_action) changes.push(`next action: ${form.next_action}`)
    }
    const details = changes.length > 0 ? changes.join(' · ') : 'project details updated'
    const action = changes.some(c => c.startsWith('stage:')) ? 'moved to stage' : 'updated project'
    await supabase.from('activity_log').insert({ project_id: id, user_id: currentUser?.id, action, details })
    toast.success('Project saved')
    setEditing(false)
    loadAll()
  }

  async function toggleChecklist(key: string) {
    const newVal = !checklist[key]
    setChecklist(prev => ({ ...prev, [key]: newVal }))
    await supabase.from('project_checklists').upsert(
      { project_id: id, item_key: key, completed: newVal, completed_at: newVal ? new Date().toISOString() : null },
      { onConflict: 'project_id,item_key' }
    )
  }

  async function deleteProject() {
    if (!confirm('Are you sure you want to permanently delete "' + project?.name + '"? This cannot be undone.')) return
    await supabase.from('sales_projects').update({ converted_project_id: null }).eq('converted_project_id', id)
    await supabase.from('project_milestones').delete().eq('project_id', id)
    await supabase.from('tasks').delete().eq('project_id', id)
    await supabase.from('documents').delete().eq('project_id', id)
    await supabase.from('activity_log').delete().eq('project_id', id)
    const { error } = await supabase.from('projects').delete().eq('id', id)
    if (error) { toast.error(error.message); return }
    toast.success('Project deleted')
    router.push('/projects')
  }

  async function markProjectComplete() {
    if (!confirm('Mark this project as fully complete?')) return
    const today = new Date().toISOString().split('T')[0]
    await supabase.from('projects').update({ status: 'complete', current_stage: 'handover', completion_date: project?.completion_date || today }).eq('id', id)
    await supabase.from('project_milestones').upsert({ project_id: id, stage: 'handover', status: 'complete', planned_date: today }, { onConflict: 'project_id,stage' })
    await supabase.from('activity_log').insert({ project_id: id, user_id: currentUser?.id, action: 'marked project as complete' })
    toast.success('Project marked complete!')
    loadAll()
  }

  async function reopenProject() {
    await supabase.from('projects').update({ status: 'active' }).eq('id', id)
    await supabase.from('activity_log').insert({ project_id: id, user_id: currentUser?.id, action: 'reopened project' })
    toast.success('Project reopened')
    loadAll()
  }

  async function updateMilestone(stage: string, status: string, date?: string) {
    await supabase.from('project_milestones').upsert(
      { project_id: id, stage, status, planned_date: date || null },
      { onConflict: 'project_id,stage' }
    )
    const stageLabel = (STAGE_CONFIG as any)[stage]?.label || stage
    if (date) {
      await supabase.from('activity_log').insert({
        project_id: id, user_id: currentUser?.id,
        action: `set ${stageLabel} date`,
        details: format(parseISO(date), 'd MMM yyyy')
      })
    } else if (status === 'complete') {
      await supabase.from('activity_log').insert({
        project_id: id, user_id: currentUser?.id,
        action: `marked ${stageLabel} as complete`
      })
    }
    loadAll()
  }

  async function updateMilestoneLabel(stage: string, ms: any, label: string) {
    await supabase.from('project_milestones').upsert(
      { project_id: id, stage, status: ms?.status || 'planned', planned_date: ms?.planned_date || null, end_date: ms?.end_date || null, milestone_label: label || null },
      { onConflict: 'project_id,stage' }
    )
    loadAll()
  }

  function openAddTask() {
    setEditingTaskId(null)
    setTaskForm({ title: '', description: '', assigned_to_id: '', due_date: '', priority: 'medium' })
    setTaskModalOpen(true)
  }

  function openTaskDetail(task: Task) {
    setEditingTaskId(task.id)
    setTaskForm({ title: task.title, description: task.description || '', assigned_to_id: task.assigned_to_id || '', due_date: task.due_date || '', priority: task.priority })
    setTaskDetailStatus(task.status)
    setTaskModalOpen(true)
  }

  async function saveTask() {
    if (!taskForm.title.trim()) { toast.error('Task title is required'); return }
    if (editingTaskId) {
      await supabase.from('tasks').update({ title: taskForm.title.trim(), description: taskForm.description.trim() || null, assigned_to_id: taskForm.assigned_to_id || null, due_date: taskForm.due_date || null, priority: taskForm.priority, status: taskDetailStatus }).eq('id', editingTaskId)
      await supabase.from('activity_log').insert({ project_id: id, user_id: currentUser?.id, action: 'updated task: ' + taskForm.title.trim() })
      toast.success('Task updated')
    } else {
      await supabase.from('tasks').insert({ project_id: id, title: taskForm.title.trim(), description: taskForm.description.trim() || null, assigned_to_id: taskForm.assigned_to_id || null, due_date: taskForm.due_date || null, priority: taskForm.priority, created_by_id: currentUser?.id, status: 'not_started' })
      await supabase.from('activity_log').insert({ project_id: id, user_id: currentUser?.id, action: 'added task: ' + taskForm.title.trim() })
      toast.success('Task added')
    }
    setTaskModalOpen(false)
    setEditingTaskId(null)
    loadAll()
  }

  async function deleteTask(taskId: string) {
    if (!confirm('Delete this task?')) return
    await supabase.from('tasks').delete().eq('id', taskId)
    toast.success('Task deleted')
    loadAll()
  }

  async function uploadDocument(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !currentUser) return
    const path = id + '/' + Date.now() + '-' + file.name.replace(/\s/g, '_')
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
    if (uploadError) { toast.error(uploadError.message); return }
    const urlResult = supabase.storage.from('documents').getPublicUrl(path)
    const publicUrl = urlResult.data.publicUrl
    await supabase.from('documents').insert({ project_id: id, name: file.name, file_url: publicUrl, file_type: file.type, file_size: file.size, uploaded_by_id: currentUser.id, category: uploadCategory })
    toast.success('Document uploaded to ' + (DOC_CATEGORY_MAP[uploadCategory]?.label || 'Other'))
    loadAll()
    e.target.value = ''
  }

  async function uploadPhotos(e: React.ChangeEvent<HTMLInputElement>, category: 'site_photo' | 'completion_photo') {
    const files = Array.from(e.target.files || [])
    if (!files.length || !currentUser) return
    for (const file of files) {
      const path = id + '/' + Date.now() + '-' + file.name.replace(/\s/g, '_')
      const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
      if (uploadError) { toast.error(uploadError.message); continue }
      const urlResult = supabase.storage.from('documents').getPublicUrl(path)
      await supabase.from('documents').insert({
        project_id: id, name: file.name, file_url: urlResult.data.publicUrl,
        file_type: file.type, file_size: file.size, uploaded_by_id: currentUser.id, category,
      })
    }
    toast.success(`${files.length} photo${files.length > 1 ? 's' : ''} uploaded`)
    loadAll()
    e.target.value = ''
  }

  async function linkEstimate(quoteId: string) {
    if (!quoteId) return
    const { error } = await supabase.from('quotes').update({ project_id: id }).eq('id', quoteId)
    if (error) { toast.error(error.message); return }
    toast.success('Estimate linked')
    setLinkingEstimate(false)
    loadAll()
  }

  async function unlinkEstimate() {
    if (!linkedEstimate) return
    if (!confirm('Unlink this estimate from the project?')) return
    await supabase.from('quotes').update({ project_id: null }).eq('id', linkedEstimate.id)
    toast.success('Estimate unlinked')
    loadAll()
  }

  function openAddSnag() {
    setEditingSnagId(null)
    setSnagForm({ description: '', location: '', priority: 'medium', assigned_to_id: '', photo_url: '' })
    setShowSnagModal(true)
  }

  function openEditSnag(s: any) {
    setEditingSnagId(s.id)
    setSnagForm({
      description: s.description, location: s.location || '', priority: s.priority || 'medium',
      assigned_to_id: s.assigned_to_id || '', photo_url: s.photo_url || '',
    })
    setShowSnagModal(true)
  }

  async function uploadSnagPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingSnagPhoto(true)
    const path = id + '/snags/' + Date.now() + '-' + file.name.replace(/\s/g, '_')
    const { error: uploadError } = await supabase.storage.from('documents').upload(path, file)
    if (uploadError) { toast.error(uploadError.message); setUploadingSnagPhoto(false); return }
    const urlResult = supabase.storage.from('documents').getPublicUrl(path)
    setSnagForm(prev => ({ ...prev, photo_url: urlResult.data.publicUrl }))
    setUploadingSnagPhoto(false)
    e.target.value = ''
  }

  async function saveSnag() {
    if (!snagForm.description.trim()) { toast.error('Description is required'); return }
    const payload = {
      description: snagForm.description.trim(), location: snagForm.location.trim() || null,
      priority: snagForm.priority, assigned_to_id: snagForm.assigned_to_id || null,
      photo_url: snagForm.photo_url || null,
    }
    const { error } = editingSnagId
      ? await supabase.from('project_snags').update(payload).eq('id', editingSnagId)
      : await supabase.from('project_snags').insert({ ...payload, project_id: id, status: 'open', created_by: currentUser?.id })
    if (error) { toast.error(error.message); return }
    await supabase.from('activity_log').insert({ project_id: id, user_id: currentUser?.id, action: editingSnagId ? 'updated a snag item' : 'added a snag item', details: snagForm.description.trim() })
    toast.success(editingSnagId ? 'Updated' : 'Snag added')
    setShowSnagModal(false)
    loadAll()
  }

  async function toggleSnagResolved(s: any) {
    const resolving = s.status !== 'resolved'
    const { error } = await supabase.from('project_snags').update({
      status: resolving ? 'resolved' : 'open',
      resolved_at: resolving ? new Date().toISOString() : null,
      resolved_by: resolving ? currentUser?.id : null,
    }).eq('id', s.id)
    if (error) { toast.error(error.message); return }
    if (resolving) await supabase.from('activity_log').insert({ project_id: id, user_id: currentUser?.id, action: 'resolved a snag item', details: s.description })
    loadAll()
  }

  async function deleteSnag(snagId: string) {
    if (!confirm('Delete this snag item?')) return
    const { error } = await supabase.from('project_snags').delete().eq('id', snagId)
    if (error) { toast.error(error.message); return }
    toast.success('Deleted')
    loadAll()
  }

  function openAddExpense() {
    setEditingExpenseId(null)
    setExpenseForm({ category: 'material', description: '', amount: '', currency: 'GBP', expense_date: new Date().toISOString().split('T')[0], notes: '' })
    setShowExpenseModal(true)
  }

  function openEditExpense(exp: any) {
    setEditingExpenseId(exp.id)
    setExpenseForm({
      category: exp.category, description: exp.description, amount: String(exp.amount),
      currency: exp.currency, expense_date: exp.expense_date || '', notes: exp.notes || '',
    })
    setShowExpenseModal(true)
  }

  async function saveExpense() {
    if (!expenseForm.description.trim() || !expenseForm.amount) { toast.error('Description and amount are required'); return }
    const payload = {
      project_id: id, category: expenseForm.category, description: expenseForm.description.trim(),
      amount: Number(expenseForm.amount), currency: expenseForm.currency,
      expense_date: expenseForm.expense_date || null, notes: expenseForm.notes || null,
    }
    if (editingExpenseId) {
      const { error } = await supabase.from('project_expenses').update(payload).eq('id', editingExpenseId)
      if (error) { toast.error(error.message); return }
      toast.success('Expense updated')
    } else {
      const { error } = await supabase.from('project_expenses').insert({ ...payload, created_by: currentUser?.id })
      if (error) { toast.error(error.message); return }
      toast.success('Expense added')
      await supabase.from('activity_log').insert({ project_id: id, user_id: currentUser?.id, action: `logged an expense: ${expenseForm.description.trim()}` })
    }
    setShowExpenseModal(false)
    loadAll()
  }

  async function deleteExpense(expId: string) {
    if (!confirm('Delete this expense?')) return
    await supabase.from('project_expenses').delete().eq('id', expId)
    toast.success('Expense deleted')
    loadAll()
  }

  async function openDocument(doc: any) {
    if (!doc.file_url) return
    const match = doc.file_url.match(/\/storage\/v1\/object\/public\/documents\/(.+)/)
    if (match) {
      const { data } = await supabase.storage.from('documents').createSignedUrl(match[1], 3600)
      if (data?.signedUrl) { window.open(data.signedUrl, '_blank'); return }
    }
    window.open(doc.file_url, '_blank')
  }

  async function changeDocumentCategory(docId: string, category: string) {
    await supabase.from('documents').update({ category }).eq('id', docId)
    loadAll()
  }

  async function deleteDocument(docId: string) {
    if (!confirm('Delete this document?')) return
    await supabase.from('documents').delete().eq('id', docId)
    toast.success('Document deleted')
    loadAll()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )
  if (!project) return <div className="p-6 text-stone-500">Project not found.</div>

  const msMap: Record<string, any> = {}
  project.milestones?.forEach((m: any) => { msMap[m.stage] = m })

  const isSupplyOnly = (project as any).project_type === 'cut_to_size'
  const visibleStages = STAGES.filter(stage => isSupplyOnly ? SUPPLY_ONLY_STAGES.includes(stage) : true)

  const documentsByCategory = DOC_CATEGORIES
    .map(cat => ({ ...cat, items: documents.filter(d => (d.category || 'other') === cat.value) }))
    .filter(cat => cat.items.length > 0)

  return (
    <div className="p-3 md:p-6 max-w-6xl mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between gap-2 mb-2">
          <button onClick={() => router.back()} className="p-1.5 hover:bg-stone-100 rounded-lg flex-shrink-0">
            <ArrowLeft size={18} className="text-stone-600"/>
          </button>
          <div className="flex items-center gap-2 flex-shrink-0">
            {editing ? (
              <>
                <button onClick={deleteProject} className="text-sm text-red-400 hover:text-red-600 py-1.5 px-2">Delete</button>
                <button onClick={() => setEditing(false)} className="btn-secondary text-sm py-1.5">Cancel</button>
                <button onClick={saveProject} className="btn-primary text-sm py-1.5">Save</button>
              </>
            ) : (
              <>
                {project.status === 'complete' ? (
                  <button onClick={reopenProject} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5">
                    <RefreshCw size={14}/> Reopen
                  </button>
                ) : (
                  <button onClick={markProjectComplete} className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
                    <Check size={14} strokeWidth={3}/> Mark complete
                  </button>
                )}
                <button onClick={() => setEditing(true)} className="btn-secondary flex items-center gap-1.5 text-sm py-1.5">
                  <Edit size={14}/> Edit
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex items-start gap-2 flex-wrap">
          <h1 className="text-lg font-semibold text-stone-900 leading-snug">{project.name}</h1>
          <span className="badge text-xs mt-0.5 flex-shrink-0" style={{ background: STAGE_CONFIG[project.current_stage]?.bg, color: STAGE_CONFIG[project.current_stage]?.color }}>
            {STAGE_CONFIG[project.current_stage]?.label}
          </span>
          {isSupplyOnly && (
            <span className="badge text-xs mt-0.5 flex-shrink-0" style={{ background: '#F5F3FF', color: '#7C3AED' }}>
              Cut to Size
            </span>
          )}
          {project.status === 'complete' && (
            <span className="badge text-xs mt-0.5 flex-shrink-0 flex items-center gap-1" style={{ background: '#ECEFEB', color: '#6B7C63' }}>
              <Check size={11}/> Complete
            </span>
          )}
        </div>
        <p className="text-sm text-stone-500 mt-0.5">{project.client}{(project as any).reference ? ' · ' + (project as any).reference : ''}</p>
      </div>

      {/* Stage pipeline */}
      <div className="card p-3 mb-4">
        {/* Mobile progress bar */}
        <div className="md:hidden">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold" style={{ color: STAGE_CONFIG[project.current_stage]?.color }}>{STAGE_CONFIG[project.current_stage]?.label}</span>
            <span className="text-xs text-stone-400">{visibleStages.indexOf(project.current_stage) + 1} / {visibleStages.length}</span>
          </div>
          <div className="flex gap-0.5">
            {visibleStages.map((stage) => {
              const ms = msMap[stage]
              const isDone = ms?.status === 'complete'
              const isActive = project.current_stage === stage
              return <div key={stage} className="flex-1 h-2 rounded-full" style={{ background: isDone ? '#7D8C74' : isActive ? STAGE_CONFIG[stage].color : '#E7E5E4' }}/>
            })}
          </div>
        </div>
        {/* Desktop stage grid */}
        <div className="hidden md:flex items-center w-full">
          {visibleStages.map((stage, idx) => {
            const ms = msMap[stage]
            const sc = STAGE_CONFIG[stage]
            const isDone = ms?.status === 'complete'
            const isActive = ms?.status === 'active' || project.current_stage === stage
            const isOverdue = ms?.status === 'overdue'
            return (
              <div key={stage} className="flex items-center flex-1 min-w-0">
                <button
                  onClick={() => {
                    const newStatus = isDone ? 'planned' : isActive ? 'complete' : 'active'
                    updateMilestone(stage, newStatus, ms?.planned_date)
                  }}
                  className={'flex flex-col items-center gap-1 py-2 px-1 rounded-lg border-2 transition-all text-center w-full ' + (isDone ? 'border-brand-500 bg-brand-50' : isActive ? 'border-blue-500 bg-blue-50' : isOverdue ? 'border-red-400 bg-red-50' : 'border-stone-200 bg-white hover:border-stone-300')}>
                  <div className={'w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ' + (isDone ? 'bg-brand-500' : isActive ? 'bg-blue-500' : isOverdue ? 'bg-red-400' : 'bg-stone-200')}>
                    {isDone ? <Check size={10} className="text-white"/> : <Circle size={10} className="text-white"/>}
                  </div>
                  <span className={'text-xs font-medium leading-tight text-center w-full truncate px-0.5 ' + (isDone ? 'text-brand-700' : isActive ? 'text-blue-700' : isOverdue ? 'text-red-600' : 'text-stone-500')}>
                    {sc.label}
                  </span>
                  {ms?.planned_date && (
                    <span className="text-stone-400 leading-none" style={{ fontSize: '10px' }}>{format(parseISO(ms.planned_date), 'd MMM')}</span>
                  )}
                </button>
                {idx < visibleStages.length - 1 && <div className={'h-0.5 w-3 flex-shrink-0 ' + (isDone ? 'bg-brand-300' : 'bg-stone-200')}/>}
              </div>
            )
          })}
        </div>
      </div>

      {/* Two-column: checklist left, content right */}
      <div className="flex gap-4 items-start">

        {/* LEFT: Project Checklist */}
        <div className="w-52 flex-shrink-0 hidden lg:block">
          <div className="card overflow-hidden sticky top-4">
            <div className="px-3 py-2.5 border-b border-stone-100">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">Checklist</p>
              <p className="text-xs text-stone-400 mt-0.5">
                {Object.values(checklist).filter(Boolean).length}/{CHECKLIST_ITEMS.length} complete
              </p>
            </div>
            <div className="px-3 pt-2">
              <div className="w-full h-1 bg-stone-100 rounded-full overflow-hidden">
                <div className="h-full rounded-full bg-brand-500 transition-all"
                  style={{ width: `${(Object.values(checklist).filter(Boolean).length / CHECKLIST_ITEMS.length) * 100}%` }}/>
              </div>
            </div>
            <div className="divide-y divide-stone-50 max-h-[calc(100vh-220px)] overflow-y-auto">
              {CHECKLIST_ITEMS.map(item => {
                const done = checklist[item.key] || false
                return (
                  <button key={item.key} onClick={() => toggleChecklist(item.key)}
                    className="w-full flex items-center gap-2 px-3 py-2 hover:bg-stone-50 transition-colors text-left">
                    <div className={`w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors ${done ? 'bg-brand-500 border-brand-500' : 'border-stone-300'}`}>
                      {done && <Check size={10} className="text-white"/>}
                    </div>
                    <span className={`text-xs leading-snug ${done ? 'line-through text-stone-400' : 'text-stone-700'}`}>
                      {item.label}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        {/* RIGHT: Tabs + content */}
        <div className="flex-1 min-w-0">

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-stone-200 mb-4 overflow-x-auto overflow-y-hidden flex-nowrap" style={{ WebkitOverflowScrolling: 'touch', overscrollBehaviorY: 'none' }}>
        {(['overview', 'tasks', 'materials', 'contacts', 'documents', 'site_photos', 'snagging', 'activity', 'complete_images'] as const).map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={'px-4 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px whitespace-nowrap flex-shrink-0 ' + (tab === t ? 'border-brand-500 text-brand-600' : 'border-transparent text-stone-500 hover:text-stone-700')}>
            {t === 'materials' ? 'Materials & Payments' : t === 'site_photos' ? 'Site Photos' : t === 'complete_images' ? 'Complete Project Images' : t === 'snagging' ? 'Snagging' : t.charAt(0).toUpperCase() + t.slice(1)}
            {t === 'tasks' && <span className="ml-1.5 text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">{tasks.length}</span>}
            {t === 'materials' && reservedSlabs.length > 0 && <span className="ml-1.5 text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">{reservedSlabs.length}</span>}
            {t === 'contacts' && projectContacts.length > 0 && <span className="ml-1.5 text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">{projectContacts.length}</span>}
            {t === 'documents' && <span className="ml-1.5 text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">{documents.length}</span>}
            {t === 'site_photos' && <span className="ml-1.5 text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">{documents.filter((d: any) => d.category === 'site_photo').length}</span>}
            {t === 'snagging' && snags.filter((s: any) => s.status === 'open').length > 0 && <span className="ml-1.5 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">{snags.filter((s: any) => s.status === 'open').length}</span>}
            {t === 'complete_images' && <span className="ml-1.5 text-xs bg-stone-100 text-stone-500 px-1.5 py-0.5 rounded-full">{documents.filter((d: any) => d.category === 'completion_photo').length}</span>}
          </button>
        ))}
      </div>

      {/* TAB: Overview */}
      {tab === 'overview' && (
        <div className="space-y-4 w-full">
          {editing ? (
            <div className="card p-5 grid grid-cols-2 gap-4">
              <div className="col-span-2"><label className="label">Project name</label>
                <input className="input" value={form.name||''} onChange={e=>setForm({...form,name:e.target.value})}/></div>
              <div><label className="label">Client</label>
                <input className="input" value={form.client||''} onChange={e=>setForm({...form,client:e.target.value})}/></div>
              <div><label className="label">Contact Person</label>
                <input className="input" value={(form as any).contact_person||''} onChange={e=>setForm({...form,contact_person:e.target.value} as any)}/></div>
              <div><label className="label">Contact Email</label>
                <input className="input" value={(form as any).contact_email||''} onChange={e=>setForm({...form,contact_email:e.target.value} as any)}/></div>
              <div><label className="label">Contact Phone</label>
                <input className="input" value={(form as any).contact_phone||''} onChange={e=>setForm({...form,contact_phone:e.target.value} as any)}/></div>
              <div><label className="label">Architect</label>
                <input className="input" value={form.architect||''} onChange={e=>setForm({...form,architect:e.target.value})}/></div>
              <div><label className="label">Contractor</label>
                <input className="input" value={form.contractor||''} onChange={e=>setForm({...form,contractor:e.target.value})}/></div>
              <div><label className="label">Lead PM</label>
                <select className="input" value={form.project_manager_id||''} onChange={e=>setForm({...form,project_manager_id:e.target.value})}>
                  {users.map(u=><option key={u.id} value={u.id}>{u.full_name}</option>)}
                </select>
              </div>
              <div><label className="label">Additional team members</label>
                <div className="flex flex-wrap gap-2 p-2 border border-stone-200 rounded-lg min-h-10 bg-white">
                  {users.filter(u => u.id !== form.project_manager_id).map(u => {
                    const isSelected = project.team_members?.some((m: any) => m.user.id === u.id)
                    return (
                      <button key={u.id} type="button"
                        onClick={async () => {
                          if (isSelected) {
                            await supabase.from('project_members').delete().eq('project_id', id).eq('user_id', u.id)
                          } else {
                            await supabase.from('project_members').insert({ project_id: id, user_id: u.id })
                          }
                          loadAll()
                        }}
                        className={'flex items-center gap-1.5 px-2 py-1 rounded-full text-xs font-medium transition-colors ' + (isSelected ? 'bg-brand-500 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200')}>
                        <div className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: u.color || '#7D8C74', fontSize: '8px' }}>{u.full_name?.slice(0,1)}</div>
                        {u.full_name?.split(' ')[0]}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div><label className="label">Value (£)</label>
                <input type="number" className="input" value={form.value||''} onChange={e=>setForm({...form,value:parseFloat(e.target.value)})}/></div>
              <div><label className="label">Status</label>
                <select className="input" value={form.status||'active'} onChange={e=>setForm({...form,status:e.target.value as any})}>
                  <option value="active">Active</option>
                  <option value="complete">Complete</option>
                  <option value="on_hold">On hold</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
              <div><label className="label">Start date</label>
                <input type="date" className="input" value={form.start_date||''} onChange={e=>setForm({...form,start_date:e.target.value})}/></div>
              <div><label className="label">Completion date</label>
                <input type="date" className="input" value={form.completion_date||''} onChange={e=>setForm({...form,completion_date:e.target.value})}/></div>
              <div><label className="label">Current stage</label>
                <select className="input" value={form.current_stage||'quotation'} onChange={e=>setForm({...form,current_stage:e.target.value as any})}>
                  {STAGES.map(s=><option key={s} value={s}>{STAGE_CONFIG[s].label}</option>)}
                </select>
              </div>
              <div className="col-span-2"><label className="label">Next action</label>
                <input className="input" value={form.next_action||''} onChange={e=>setForm({...form,next_action:e.target.value})}/></div>
              <div className="col-span-2"><label className="label">Notes</label>
                <textarea className="input min-h-24" value={form.notes||''} onChange={e=>setForm({...form,notes:e.target.value})}/></div>
              <div className="col-span-2 pt-4 border-t border-stone-100">
                <button onClick={deleteProject} className="text-sm text-red-400 hover:text-red-600 flex items-center gap-1.5 transition-colors">
                  <Trash2 size={13}/> Delete this project permanently
                </button>
              </div>
            </div>
          ) : (
            <>
              {project.next_action && (
                <div className="card p-4 border-l-4 border-brand-500">
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-1">Next action</p>
                  <p className="text-sm text-stone-800">{project.next_action}</p>
                </div>
              )}
              {project.notes && (
                <div className="card p-4">
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Notes</p>
                  <p className="text-sm text-stone-700 leading-relaxed whitespace-pre-wrap">{project.notes}</p>
                </div>
              )}
              {/* Key dates */}
              <div className="card overflow-hidden">
                <div className="px-4 py-3 border-b border-stone-100">
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Key Dates & Follow-up</p>
                </div>
                <div className="divide-y divide-stone-50">
                  {[
                    { stage: 'quotation',           label: 'Quotation',              icon: '📋' },
                    { stage: 'material_approval',   label: 'Material Approval',      icon: '✅' },
                    { stage: 'templating',          label: 'Templating',             icon: '📐' },
                    { stage: 'drawings_submission', label: 'Shop Drawings Sub.',     icon: '📝' },
                    { stage: 'drawings_approval',   label: 'Shop Drawings Approval', icon: '✔️' },
                    { stage: 'fabrication',         label: 'Fabrication 1',          icon: '🏭' },
                    { stage: 'fabrication_2',       label: 'Fabrication 2',          icon: '🏭' },
                    { stage: 'delivery',            label: 'Delivery on site',       icon: '🚚' },
                    { stage: 'installation',        label: 'Installation 1',         icon: '🏗️' },
                    { stage: 'installation_2',      label: 'Installation 2',         icon: '🏗️' },
                    { stage: 'installation_3',      label: 'Installation 3',         icon: '🏗️' },
                    { stage: 'snagging',            label: 'Snagging',               icon: '🔍' },
                    { stage: 'handover',            label: 'Handover',               icon: '✅' },
                  ].filter(({ stage }) => isSupplyOnly ? SUPPLY_ONLY_STAGES.includes(stage) : true).map(({ stage, label, icon }) => {
                    const ms = msMap[stage]
                    const today = new Date(); today.setHours(0,0,0,0)
                    const daysUntil = ms?.planned_date ? Math.round((new Date(ms.planned_date).setHours(0,0,0,0) - today.getTime()) / 86400000) : null
                    const isOverdue = daysUntil !== null && daysUntil < 0 && ms?.status !== 'complete'
                    const isDueSoon = daysUntil !== null && daysUntil >= 0 && daysUntil <= 14
                    const isDone = ms?.status === 'complete'
                    const isExpanded = expandedKeyDates.has(stage)
                    const toggleExpanded = () => setExpandedKeyDates(prev => {
                      const next = new Set(prev)
                      if (next.has(stage)) next.delete(stage); else next.add(stage)
                      return next
                    })
                    return (
                      <div key={stage} className={'px-4 py-2 ' + (isOverdue ? 'bg-red-50' : isDueSoon ? 'bg-amber-50' : '')}>
                        <div className="flex flex-col gap-1">
                          <button onClick={toggleExpanded} className="flex items-center gap-2 flex-wrap text-left w-full md:cursor-default">
                            <span className="text-base">{icon}</span>
                            <span className="text-sm font-medium text-stone-800">{label}</span>
                            {ms?.milestone_label && <span className="text-xs text-stone-400">— {ms.milestone_label}</span>}
                            {isDone && <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: '#ECEFEB', color: '#6B7C63' }}>Done ✓</span>}
                            {isOverdue && <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-red-100 text-red-600">{Math.abs(daysUntil!)}d overdue</span>}
                            {isDueSoon && !isDone && <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-600">{daysUntil === 0 ? 'Today' : 'in ' + daysUntil + 'd'}</span>}
                            <ChevronDown size={13} className={`text-stone-300 ml-auto md:hidden transition-transform flex-shrink-0 ${isExpanded ? 'rotate-180' : ''}`}/>
                          </button>
                          {ms?.planned_date && !isExpanded && (
                            <p className={'text-xs md:hidden ' + (isOverdue ? 'text-red-400' : isDueSoon ? 'text-amber-500' : 'text-stone-400')}>{format(parseISO(ms.planned_date), 'd MMMM yyyy')}</p>
                          )}
                          <div className={(isExpanded ? 'flex' : 'hidden') + ' md:flex flex-col gap-1'}>
                          {(stage === 'installation' || stage === 'installation_2' || stage === 'installation_3') && (
                            <input
                              className="input py-1 text-xs w-full sm:w-48"
                              placeholder="Name this installation, e.g. Bathroom"
                              defaultValue={ms?.milestone_label || ''}
                              onBlur={e => { if (e.target.value !== (ms?.milestone_label || '')) updateMilestoneLabel(stage, ms, e.target.value) }}
                            />
                          )}
                          {ms?.planned_date && (
                            <p className={'text-xs ' + (isOverdue ? 'text-red-400' : isDueSoon ? 'text-amber-500' : 'text-stone-400')}>{format(parseISO(ms.planned_date), 'd MMMM yyyy')}</p>
                          )}
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input type="date" className="input py-1.5 text-sm flex-1" placeholder="Start date" value={ms?.planned_date || ''} onChange={e => updateMilestone(stage, ms?.status || 'planned', e.target.value)}/>
                            <input type="date" className="input py-1.5 text-sm flex-1" placeholder="End date" value={ms?.end_date || ''}
                              onChange={async e => {
                                await supabase.from('project_milestones').upsert({ project_id: id, stage, status: ms?.status || 'planned', planned_date: ms?.planned_date || null, end_date: e.target.value || null }, { onConflict: 'project_id,stage' })
                                loadAll()
                              }}/>
                            <select className="input py-1.5 text-sm w-full sm:w-32" value={ms?.status || 'planned'} onChange={e => updateMilestone(stage, e.target.value, ms?.planned_date)}>
                              <option value="planned">Planned</option>
                              <option value="active">Active</option>
                              <option value="complete">Done ✓</option>
                              <option value="overdue">Overdue</option>
                            </select>
                          </div>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* Project info bar */}
              <div className="card p-4">
                <div className="flex flex-wrap gap-6">
                  {[
                    { icon: Briefcase, label: 'Client', value: project.client },
                    { icon: User, label: 'Contact', value: (project as any).contact_person },
                    { icon: Mail, label: 'Email', value: (project as any).contact_email },
                    { icon: Phone, label: 'Phone', value: (project as any).contact_phone },
                    { icon: User, label: 'Architect', value: project.architect },
                    { icon: Briefcase, label: 'Contractor', value: project.contractor },
                    { icon: User, label: 'Lead PM', value: project.project_manager?.full_name },
                    { icon: Calendar, label: 'Start', value: project.start_date ? format(parseISO(project.start_date), 'd MMM yyyy') : null },
                    { icon: Calendar, label: 'Completion', value: project.completion_date ? format(parseISO(project.completion_date), 'd MMM yyyy') : null },
                    { icon: PoundSterling, label: 'Value', value: project.value ? '£' + project.value.toLocaleString() : null },
                  ].filter(i => i.value).map(({ icon: Icon, label, value }) => (
                    <div key={label} className="flex items-center gap-2">
                      <Icon size={13} className="text-stone-400 flex-shrink-0"/>
                      <span className="text-xs text-stone-400">{label}:</span>
                      <span className="text-sm text-stone-700 font-medium">{value}</span>
                    </div>
                  ))}
                  {project.team_members && project.team_members.length > 0 && (
                    <div className="flex items-center gap-2">
                      <Users size={13} className="text-stone-400 flex-shrink-0"/>
                      <span className="text-xs text-stone-400">Team:</span>
                      <div className="flex gap-1.5">
                        {project.team_members.filter((m: any) => m.user.id !== project.project_manager_id).map((m: any) => (
                          <div key={m.user.id} className="flex items-center gap-1">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold" style={{ background: m.user.color || '#7D8C74', fontSize: '9px' }}>{m.user.full_name?.slice(0,1)}</div>
                            <span className="text-xs text-stone-600">{m.user.full_name?.split(' ')[0]}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

            </>
          )}
        </div>
      )}

      {/* TAB: Tasks */}
      {tab === 'tasks' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-stone-500">{tasks.length} task{tasks.length !== 1 ? 's' : ''}</p>
            <button onClick={openAddTask} className="btn-primary flex items-center gap-2 text-sm py-1.5">
              <Plus size={14}/> Add task
            </button>
          </div>
          <div className="space-y-2">
            {tasks.map(task => {
              const sc = TASK_STATUS_CONFIG[task.status]
              const pc = PRIORITY_CONFIG[task.priority]
              const overdue = task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date)) && task.status !== 'completed'
              return (
                <div key={task.id} className="card p-4 flex items-center gap-4 group">
                  <input type="checkbox" checked={task.status === 'completed'}
                    onChange={async (e) => {
                      e.stopPropagation()
                      const ns = task.status === 'completed' ? 'not_started' : 'completed'
                      await supabase.from('tasks').update({ status: ns }).eq('id', task.id)
                      loadAll()
                    }}
                    className="w-4 h-4 rounded accent-brand-500"/>
                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => openTaskDetail(task)}>
                    <p className={'text-sm font-medium hover:text-brand-600 transition-colors ' + (task.status === 'completed' ? 'line-through text-stone-400' : 'text-stone-900')}>{task.title}</p>
                    {task.description && <p className="text-xs text-stone-400 mt-0.5 truncate">{task.description}</p>}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {(task as any).assigned_to && (
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: (task as any).assigned_to.color || '#7D8C74' }}>
                        {(task as any).assigned_to.full_name?.slice(0,1)}
                      </div>
                    )}
                    {task.due_date && (
                      <span className={'text-xs font-medium ' + (overdue ? 'text-red-500' : isToday(parseISO(task.due_date)) ? 'text-amber-500' : 'text-stone-400')}>
                        {format(parseISO(task.due_date), 'd MMM')}
                      </span>
                    )}
                    <span className="badge text-xs" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                    <span className="w-2 h-2 rounded-full" style={{ background: pc.color }}/>
                    <button onClick={() => deleteTask(task.id)} className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-500 transition-all">
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </div>
              )
            })}
            {tasks.length === 0 && (
              <div className="card py-12 text-center">
                <CheckSquare size={28} className="text-stone-300 mx-auto mb-3"/>
                <p className="text-stone-400 text-sm mb-3">No tasks yet</p>
                <button onClick={openAddTask} className="btn-primary inline-flex items-center gap-2 text-sm">
                  <Plus size={14}/> Add first task
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: Materials & Payments */}
      {tab === 'materials' && (
        <div className="space-y-4">
          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Materials & Slabs Selected</p>
            </div>
            {reservedSlabs.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-stone-400">
                No slabs reserved for this project yet.{' '}
                <Link href="/inventory" className="text-brand-600 hover:underline">Reserve stock in Inventory →</Link>
              </div>
            ) : (
              <div className="divide-y divide-stone-50">
                {reservedSlabs.map(slab => {
                  const SLAB_STATUS: Record<string, { label: string; color: string; bg: string }> = { in_stock: { label: 'In Stock', color: '#7D8C74', bg: '#ECFDF5' }, reserved: { label: 'Reserved', color: '#F59E0B', bg: '#FFFBEB' }, used: { label: 'Used', color: '#78716C', bg: '#F5F5F4' }, remnant: { label: 'Remnant', color: '#8B5CF6', bg: '#F5F3FF' } }
                  const sc = SLAB_STATUS[slab.status] || { label: slab.status, color: '#78716C', bg: '#F5F5F4' }
                  return (
                    <div key={slab.id} className="px-4 py-3 flex items-center gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-900">{slab.material_name}</p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {slab.finish ? `${slab.finish} · ` : ''}
                          {slab.length_mm && slab.width_mm ? `${slab.length_mm}×${slab.width_mm}mm` : slab.area_m2 ? `${Number(slab.area_m2).toFixed(2)} m²` : ''}
                          {slab.lot_number ? ` · Lot ${slab.lot_number}` : ''}
                        </p>
                      </div>
                      <span className="badge text-xs" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Estimate & Payment Status</p>
              {linkedEstimate ? (
                <button onClick={unlinkEstimate} className="text-xs text-red-400 hover:text-red-600">Unlink</button>
              ) : (
                <button onClick={() => setLinkingEstimate(!linkingEstimate)} className="text-xs text-brand-600 hover:underline">Link an estimate</button>
              )}
            </div>
            {linkingEstimate && !linkedEstimate && (
              <div className="px-4 py-3 border-b border-stone-100 bg-stone-50">
                <select className="input text-sm" defaultValue="" onChange={e => e.target.value && linkEstimate(e.target.value)}>
                  <option value="">Select an estimate to link...</option>
                  {allEstimates.map((e: any) => (
                    <option key={e.id} value={e.id}>{e.offer_name || e.client} — {e.currency} {Number(e.grand_total || 0).toLocaleString()}</option>
                  ))}
                </select>
              </div>
            )}
            {!linkedEstimate ? (
              <p className="px-4 py-6 text-center text-sm text-stone-400">No estimate linked to this project yet.</p>
            ) : (
              <>
                <div className="px-4 py-3 border-b border-stone-100">
                  <p className="text-sm font-medium text-stone-900">{linkedEstimate.offer_name || linkedEstimate.client}</p>
                  <p className="text-xs text-stone-400 mt-0.5">{linkedEstimate.client}{linkedEstimate.country ? ` · ${linkedEstimate.country}` : ''}</p>
                  <div className="flex items-center gap-4 mt-2 text-sm">
                    {linkedEstimate.subtotal_material != null && <span className="text-stone-500">Material: <b className="text-stone-800">{linkedEstimate.currency} {Number(linkedEstimate.subtotal_material).toLocaleString()}</b></span>}
                    {linkedEstimate.shipping_handling != null && <span className="text-stone-500">Shipping: <b className="text-stone-800">{linkedEstimate.currency} {Number(linkedEstimate.shipping_handling).toLocaleString()}</b></span>}
                    {linkedEstimate.subtotal_installation != null && <span className="text-stone-500">Installation: <b className="text-stone-800">{linkedEstimate.currency} {Number(linkedEstimate.subtotal_installation).toLocaleString()}</b></span>}
                  </div>
                  <p className="text-sm font-semibold text-stone-900 mt-2">Grand Total: {linkedEstimate.currency} {Number(linkedEstimate.grand_total || 0).toLocaleString()}</p>
                </div>
                <div className="px-4 py-2">
                  <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Payment Stages</p>
                  {estimatePayments.length === 0 ? (
                    <p className="text-sm text-stone-400 pb-2">No payment stages set up yet — add them from the Estimates page.</p>
                  ) : (
                    <div className="divide-y divide-stone-50">
                      {estimatePayments.map((p: any) => (
                        <div key={p.id} className="flex items-center justify-between py-2">
                          <div>
                            <p className="text-sm text-stone-800">{p.label}</p>
                            {p.paid_date && <p className="text-xs text-stone-400">Paid {format(parseISO(p.paid_date), 'd MMM yyyy')}</p>}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="text-sm text-stone-700">{linkedEstimate.currency} {Number(p.amount || 0).toLocaleString()}</span>
                            <span className="badge text-xs" style={{ background: p.status === 'paid' ? '#ECFDF5' : '#FFFBEB', color: p.status === 'paid' ? '#059669' : '#D97706' }}>
                              {p.status === 'paid' ? 'Paid' : 'Needs to be paid'}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="px-4 py-3 border-t border-stone-100">
                  <Link href="/salestracking?tab=estimates" className="text-xs text-brand-600 hover:underline">Open full estimate in Sales →</Link>
                </div>
              </>
            )}
          </div>

          <div className="card overflow-hidden">
            <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Expenses</p>
              <button onClick={openAddExpense} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Plus size={12}/> Add expense</button>
            </div>
            {expenses.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-stone-400">No expenses logged for this project yet.</p>
            ) : (
              <div className="divide-y divide-stone-50">
                {expenses.map((exp: any) => {
                  const EXPENSE_CATEGORY_LABEL: Record<string, string> = { material: 'Material', labour: 'Labour', subcontractor: 'Subcontractor', delivery: 'Delivery', other: 'Other' }
                  return (
                    <div key={exp.id} className="px-4 py-2.5 flex items-center gap-3 group">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-stone-800">{exp.description}</p>
                        <p className="text-xs text-stone-400 mt-0.5">
                          {EXPENSE_CATEGORY_LABEL[exp.category] || exp.category}
                          {exp.expense_date ? ` · ${format(parseISO(exp.expense_date), 'd MMM yyyy')}` : ''}
                        </p>
                      </div>
                      <span className="text-sm font-medium text-stone-700 flex-shrink-0">{exp.currency} {Number(exp.amount).toLocaleString()}</span>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                        <button onClick={() => openEditExpense(exp)} className="p-1 hover:bg-stone-100 rounded text-stone-400"><Edit size={13}/></button>
                        <button onClick={() => deleteExpense(exp.id)} className="p-1 hover:bg-red-50 rounded text-stone-400 hover:text-red-500"><Trash2 size={13}/></button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {linkedEstimate && expenses.length > 0 && (
            <div className="card p-4">
              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-3">Margin</p>
              {(() => {
                const revenue = Number(linkedEstimate.grand_total || 0)
                const totalExpenses = expenses.reduce((sum: number, e: any) => sum + Number(e.amount || 0), 0)
                const margin = revenue - totalExpenses
                const marginPct = revenue > 0 ? ((margin / revenue) * 100).toFixed(1) : '—'
                return (
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div>
                      <p className="text-lg font-bold text-stone-900">{linkedEstimate.currency} {revenue.toLocaleString()}</p>
                      <p className="text-xs text-stone-400 mt-0.5">Revenue</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-red-500">{linkedEstimate.currency} {totalExpenses.toLocaleString()}</p>
                      <p className="text-xs text-stone-400 mt-0.5">Expenses</p>
                    </div>
                    <div>
                      <p className={`text-lg font-bold ${margin >= 0 ? 'text-brand-600' : 'text-red-500'}`}>{linkedEstimate.currency} {margin.toLocaleString()}</p>
                      <p className="text-xs text-stone-400 mt-0.5">Margin {typeof marginPct === 'string' && marginPct !== '—' ? `(${marginPct}%)` : ''}</p>
                    </div>
                  </div>
                )
              })()}
            </div>
          )}
        </div>
      )}

      {/* TAB: Contacts */}
      {tab === 'contacts' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-stone-500">{projectContacts.length} contact{projectContacts.length !== 1 ? 's' : ''}</p>
            <Link href={`/admin?tab=contacts&action=addProjectContact&projectId=${id}`} className="btn-primary flex items-center gap-2 text-sm py-1.5">
              <Plus size={14}/> Add contact
            </Link>
          </div>
          {projectContacts.length === 0 ? (
            <div className="card py-16 text-center">
              <User size={28} className="text-stone-300 mx-auto mb-3"/>
              <p className="text-stone-400 text-sm mb-4">No contacts linked to this project yet.</p>
              <Link href={`/admin?tab=contacts&action=addProjectContact&projectId=${id}`} className="btn-primary inline-flex items-center gap-2">
                <Plus size={14}/> Add first contact
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {projectContacts.map(c => (
                <div key={c.id} className="card p-4 flex items-start gap-3">
                  <div className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center flex-shrink-0">
                    <User size={15} className="text-stone-400"/>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-stone-900 truncate">{c.name}</p>
                    {c.company && <p className="text-xs text-stone-400 truncate">{c.company}</p>}
                    {c.contact_type && <span className="badge text-xs mt-1.5 inline-block bg-stone-100 text-stone-500 capitalize">{c.contact_type.replace(/_/g, ' ')}</span>}
                    <div className="flex items-center gap-3 mt-2 flex-wrap">
                      {c.phone && <a href={`tel:${c.phone}`} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Phone size={11}/> {c.phone}</a>}
                      {c.email && <a href={`mailto:${c.email}`} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Mail size={11}/> {c.email}</a>}
                    </div>
                    {c.notes && <p className="text-xs text-stone-400 mt-2">{c.notes}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: Documents */}
      {tab === 'documents' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
            <p className="text-sm text-stone-500">{documents.length} document{documents.length !== 1 ? 's' : ''}</p>
            <div className="flex items-center gap-2">
              <select className="input py-1.5 text-sm w-auto" value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}>
                {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
              <label className="btn-primary flex items-center gap-2 text-sm py-1.5 cursor-pointer flex-shrink-0">
                <Upload size={14}/> Upload
                <input type="file" className="hidden" multiple onChange={uploadDocument}/>
              </label>
            </div>
          </div>
          {documentsByCategory.length === 0 ? (
            <div className="card py-12 text-center">
              <FileText size={28} className="text-stone-300 mx-auto mb-3"/>
              <p className="text-stone-400 text-sm">No documents yet</p>
            </div>
          ) : (
            <div className="space-y-4">
              {documentsByCategory.map(cat => {
                const Icon = cat.icon
                const isCollapsed = collapsedCategories[cat.value]
                return (
                  <div key={cat.value} className="card overflow-hidden">
                    <button
                      onClick={() => setCollapsedCategories(prev => ({ ...prev, [cat.value]: !prev[cat.value] }))}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-stone-50 hover:bg-stone-100 transition-colors border-b border-stone-100">
                      <div className="flex items-center gap-2">
                        <Icon size={15} className="text-stone-500"/>
                        <span className="text-sm font-semibold text-stone-700">{cat.label}</span>
                        <span className="text-xs bg-white border border-stone-200 text-stone-500 px-1.5 py-0.5 rounded-full">{cat.items.length}</span>
                      </div>
                      <ChevronDown size={16} className={'text-stone-400 transition-transform ' + (isCollapsed ? '' : 'rotate-180')}/>
                    </button>
                    {!isCollapsed && (
                      <div className="divide-y divide-stone-50">
                        {cat.items.map((doc: any) => (
                          <div key={doc.id} className="p-4 flex items-center gap-3 group">
                            <Icon size={16} className="text-stone-400 flex-shrink-0"/>
                            <div className="flex-1 min-w-0">
                              <button onClick={() => openDocument(doc)} className="text-sm font-medium text-stone-900 hover:text-brand-600 truncate text-left block">{doc.name}</button>
                              <p className="text-xs text-stone-400 mt-0.5">{doc.uploaded_by?.full_name} · {format(parseISO(doc.created_at), 'd MMM yyyy')}</p>
                            </div>
                            <select className="input py-1 text-xs w-auto opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex-shrink-0"
                              value={doc.category || 'other'} onChange={e => changeDocumentCategory(doc.id, e.target.value)}>
                              {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                            </select>
                            <button onClick={() => openDocument(doc)} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400 flex-shrink-0"><Download size={14}/></button>
                            <button onClick={() => deleteDocument(doc.id)} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0"><Trash2 size={14}/></button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB: Site Photos */}
      {tab === 'site_photos' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-stone-500">{documents.filter((d: any) => d.category === 'site_photo').length} photo{documents.filter((d: any) => d.category === 'site_photo').length !== 1 ? 's' : ''}</p>
            <label className="btn-primary flex items-center gap-2 text-sm py-1.5 cursor-pointer">
              <Upload size={14}/> Upload Photo
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => uploadPhotos(e, 'site_photo')}/>
            </label>
          </div>
          {documents.filter((d: any) => d.category === 'site_photo').length === 0 ? (
            <div className="card py-12 text-center">
              <ImageIcon size={28} className="text-stone-300 mx-auto mb-3"/>
              <p className="text-stone-400 text-sm">No site photos yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {documents.filter((d: any) => d.category === 'site_photo').map((doc: any) => (
                <button key={doc.id} onClick={() => openDocument(doc)} className="card overflow-hidden group text-left">
                  <div className="aspect-square bg-stone-100 overflow-hidden">
                    <img src={doc.file_url} alt={doc.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform"/>
                  </div>
                  <div className="p-2">
                    <p className="text-xs text-stone-500 truncate">{doc.uploaded_by?.full_name}</p>
                    <p className="text-xs text-stone-400">{format(parseISO(doc.created_at), 'd MMM yyyy')}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB: Snagging */}
      {tab === 'snagging' && (
        <div>
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              {(['open', 'resolved', 'all'] as const).map(f => (
                <button key={f} onClick={() => setSnagStatusFilter(f)}
                  className={'text-xs px-3 py-1.5 rounded-full border transition-colors capitalize ' + (snagStatusFilter === f ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 text-stone-500')}>
                  {f} {f === 'open' && `(${snags.filter((s: any) => s.status === 'open').length})`}
                </button>
              ))}
            </div>
            <button onClick={openAddSnag} className="btn-primary flex items-center gap-2 text-sm py-1.5">
              <Plus size={14}/> Add Snag
            </button>
          </div>
          {snags.filter((s: any) => snagStatusFilter === 'all' || s.status === snagStatusFilter).length === 0 ? (
            <div className="card py-12 text-center">
              <Check size={28} className="text-stone-300 mx-auto mb-3"/>
              <p className="text-stone-400 text-sm">{snagStatusFilter === 'open' ? 'No open snags' : 'No snag items'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {snags.filter((s: any) => snagStatusFilter === 'all' || s.status === snagStatusFilter).map((s: any) => {
                const priorityColor = { low: '#6B7280', medium: '#3B82F6', high: '#F59E0B', urgent: '#EF4444' }[s.priority as string] || '#6B7280'
                return (
                  <div key={s.id} className={'card p-3 flex items-start gap-3 ' + (s.status === 'resolved' ? 'opacity-60' : '')}>
                    <button onClick={() => toggleSnagResolved(s)} className="flex-shrink-0 mt-0.5">
                      <div className={'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ' + (s.status === 'resolved' ? 'bg-brand-500 border-brand-500' : 'border-stone-300 hover:border-brand-400')}>
                        {s.status === 'resolved' && <Check size={12} className="text-white"/>}
                      </div>
                    </button>
                    {s.photo_url && (
                      <img src={s.photo_url} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0 cursor-pointer" onClick={() => window.open(s.photo_url, '_blank')}/>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className={'text-sm font-medium text-stone-900 ' + (s.status === 'resolved' ? 'line-through' : '')}>{s.description}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        {s.location && <span className="text-xs text-stone-400">{s.location}</span>}
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ background: priorityColor + '18', color: priorityColor }}>{s.priority}</span>
                        {s.assigned_to && (
                          <span className="text-xs text-stone-500 flex items-center gap-1">
                            <div className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold" style={{ background: s.assigned_to.color || '#7D8C74', fontSize: '8px' }}>{s.assigned_to.full_name?.slice(0,1)}</div>
                            {s.assigned_to.full_name?.split(' ')[0]}
                          </span>
                        )}
                        <span className="text-xs text-stone-300">{format(parseISO(s.created_at), 'd MMM')}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEditSnag(s)} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400"><Edit size={13}/></button>
                      <button onClick={() => deleteSnag(s.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-stone-400 hover:text-red-500"><Trash2 size={13}/></button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
          {showSnagModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowSnagModal(false)}>
              <div className="bg-white rounded-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-semibold text-stone-900">{editingSnagId ? 'Edit Snag' : 'Add Snag'}</h3>
                  <button onClick={() => setShowSnagModal(false)}><X size={18} className="text-stone-400"/></button>
                </div>
                <div className="space-y-3">
                  <div><label className="label">Description</label><textarea className="input min-h-16" value={snagForm.description} onChange={e => setSnagForm({ ...snagForm, description: e.target.value })} autoFocus/></div>
                  <div><label className="label">Location</label><input className="input" placeholder="e.g. Master ensuite" value={snagForm.location} onChange={e => setSnagForm({ ...snagForm, location: e.target.value })}/></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><label className="label">Priority</label>
                      <select className="input" value={snagForm.priority} onChange={e => setSnagForm({ ...snagForm, priority: e.target.value })}>
                        <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div><label className="label">Assign To</label>
                      <select className="input" value={snagForm.assigned_to_id} onChange={e => setSnagForm({ ...snagForm, assigned_to_id: e.target.value })}>
                        <option value="">Unassigned</option>
                        {users.map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="label">Photo</label>
                    {snagForm.photo_url ? (
                      <div className="relative w-24 h-24">
                        <img src={snagForm.photo_url} alt="" className="w-24 h-24 rounded-lg object-cover"/>
                        <button onClick={() => setSnagForm({ ...snagForm, photo_url: '' })} className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full p-0.5"><X size={11}/></button>
                      </div>
                    ) : (
                      <label className="btn-secondary flex items-center gap-2 text-sm py-1.5 cursor-pointer w-fit">
                        <Upload size={13}/> {uploadingSnagPhoto ? 'Uploading...' : 'Add Photo'}
                        <input type="file" accept="image/*" className="hidden" onChange={uploadSnagPhoto} disabled={uploadingSnagPhoto}/>
                      </label>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 mt-5">
                  <button onClick={saveSnag} className="btn-primary flex-1">{editingSnagId ? 'Save Changes' : 'Add Snag'}</button>
                  <button onClick={() => setShowSnagModal(false)} className="btn-secondary">Cancel</button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB: Activity */}
      {tab === 'activity' && (
        <div className="space-y-1">
          <p className="text-xs text-stone-400 mb-3">All changes to this project — by who and when</p>
          {activity.map((item, i) => (
            <div key={item.id} className="flex items-start gap-3 group">
              <div className="flex flex-col items-center flex-shrink-0">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0" style={{ background: item.user?.color || '#7D8C74' }}>
                  {item.user?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase() || '?'}
                </div>
                {i < activity.length - 1 && <div className="w-px h-4 bg-stone-100 mt-1"/>}
              </div>
              <div className="flex-1 pb-3">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm text-stone-700">
                    <span className="font-medium text-stone-900">{item.user?.full_name || 'Someone'}</span>
                    {' '}{item.action}
                  </p>
                  <span className="text-xs text-stone-400 flex-shrink-0 mt-0.5">{format(parseISO(item.created_at), 'd MMM · HH:mm')}</span>
                </div>
                {item.details && (
                  <p className="text-xs text-stone-500 mt-0.5 bg-stone-50 rounded px-2 py-1 border-l-2 border-stone-200">{item.details}</p>
                )}
              </div>
            </div>
          ))}
          {activity.length === 0 && <div className="py-12 text-center text-sm text-stone-400">No activity recorded yet.</div>}
        </div>
      )}

      {/* TAB: Complete Images */}
      {tab === 'complete_images' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-stone-500">{documents.filter((d: any) => d.category === 'completion_photo').length} photo{documents.filter((d: any) => d.category === 'completion_photo').length !== 1 ? 's' : ''}</p>
            <label className="btn-primary flex items-center gap-2 text-sm py-1.5 cursor-pointer">
              <Upload size={14}/> Upload Photo
              <input type="file" accept="image/*" multiple className="hidden" onChange={e => uploadPhotos(e, 'completion_photo')}/>
            </label>
          </div>
          {documents.filter((d: any) => d.category === 'completion_photo').length === 0 ? (
            <div className="card py-12 text-center">
              <ImageIcon size={28} className="text-stone-300 mx-auto mb-3"/>
              <p className="text-stone-400 text-sm">No completion photos yet</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {documents.filter((d: any) => d.category === 'completion_photo').map((doc: any) => (
                <button key={doc.id} onClick={() => openDocument(doc)} className="card overflow-hidden group text-left">
                  <div className="aspect-square bg-stone-100 overflow-hidden">
                    <img src={doc.file_url} alt={doc.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform"/>
                  </div>
                  <div className="p-2">
                    <p className="text-xs text-stone-500 truncate">{doc.uploaded_by?.full_name}</p>
                    <p className="text-xs text-stone-400">{format(parseISO(doc.created_at), 'd MMM yyyy')}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Task Modal */}
      {taskModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}
          onClick={() => { setTaskModalOpen(false); setEditingTaskId(null) }}>
          <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-900 mb-4">{editingTaskId ? 'Edit task' : 'Add task'}</h3>
            <div className="space-y-3">
              <div><label className="label">Title</label><input className="input" placeholder="Task title" value={taskForm.title} onChange={e => setTaskForm({ ...taskForm, title: e.target.value })} autoFocus onKeyDown={e => e.key === 'Enter' && saveTask()}/></div>
              <div><label className="label">Description</label><textarea className="input min-h-16" value={taskForm.description} onChange={e => setTaskForm({ ...taskForm, description: e.target.value })}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Assign to</label>
                  <select className="input" value={taskForm.assigned_to_id} onChange={e => setTaskForm({ ...taskForm, assigned_to_id: e.target.value })}>
                    <option value="">Unassigned</option>
                    {users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}
                  </select>
                </div>
                <div><label className="label">Priority</label>
                  <select className="input" value={taskForm.priority} onChange={e => setTaskForm({ ...taskForm, priority: e.target.value as any })}>
                    <option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="urgent">Urgent</option>
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Due date</label><input type="date" className="input" value={taskForm.due_date} onChange={e => setTaskForm({ ...taskForm, due_date: e.target.value })}/></div>
                {editingTaskId && (
                  <div><label className="label">Status</label>
                    <select className="input" value={taskDetailStatus} onChange={e => setTaskDetailStatus(e.target.value)}>
                      <option value="not_started">Not Started</option><option value="in_progress">In Progress</option><option value="waiting">Waiting</option><option value="completed">Completed</option><option value="delayed">Delayed</option>
                    </select>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between mt-5">
              {editingTaskId ? (
                <button onClick={() => { deleteTask(editingTaskId); setTaskModalOpen(false) }} className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1.5"><Trash2 size={14}/> Delete</button>
              ) : <span/>}
              <div className="flex items-center gap-2">
                <button onClick={() => { setTaskModalOpen(false); setEditingTaskId(null) }} className="btn-secondary text-sm py-1.5">Cancel</button>
                <button onClick={saveTask} className="btn-primary text-sm py-1.5">{editingTaskId ? 'Save changes' : 'Add task'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Expense Modal */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowExpenseModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-900 mb-4">{editingExpenseId ? 'Edit expense' : 'Add expense'}</h3>
            <div className="space-y-3">
              <div><label className="label">Description</label><input className="input" value={expenseForm.description} onChange={e => setExpenseForm({ ...expenseForm, description: e.target.value })} placeholder="e.g. Slab delivery — supplier invoice"/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Category</label>
                  <select className="input" value={expenseForm.category} onChange={e => setExpenseForm({ ...expenseForm, category: e.target.value })}>
                    <option value="material">Material</option><option value="labour">Labour</option><option value="subcontractor">Subcontractor</option><option value="delivery">Delivery</option><option value="other">Other</option>
                  </select>
                </div>
                <div><label className="label">Date</label><input type="date" className="input" value={expenseForm.expense_date} onChange={e => setExpenseForm({ ...expenseForm, expense_date: e.target.value })}/></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Amount</label><input type="number" className="input" value={expenseForm.amount} onChange={e => setExpenseForm({ ...expenseForm, amount: e.target.value })}/></div>
                <div><label className="label">Currency</label><input className="input" value={expenseForm.currency} onChange={e => setExpenseForm({ ...expenseForm, currency: e.target.value })}/></div>
              </div>
              <div><label className="label">Notes</label><textarea className="input min-h-16" value={expenseForm.notes} onChange={e => setExpenseForm({ ...expenseForm, notes: e.target.value })}/></div>
            </div>
            <div className="flex items-center justify-between mt-5">
              {editingExpenseId ? (
                <button onClick={() => { deleteExpense(editingExpenseId); setShowExpenseModal(false) }} className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1.5"><Trash2 size={14}/> Delete</button>
              ) : <span/>}
              <div className="flex items-center gap-2">
                <button onClick={() => setShowExpenseModal(false)} className="btn-secondary text-sm py-1.5">Cancel</button>
                <button onClick={saveExpense} className="btn-primary text-sm py-1.5">{editingExpenseId ? 'Save changes' : 'Add expense'}</button>
              </div>
            </div>
          </div>
        </div>
      )}
        </div>
      </div>
    </div>
  )
}

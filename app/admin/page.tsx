'use client'
import { useState, useEffect, Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { format, parseISO, isPast, isToday, startOfWeek, addDays } from 'date-fns'
import * as XLSX from 'xlsx'
import {
  FolderOpen, Phone, Mail, Plus, Pencil, Trash2, X,
  AlertTriangle, Clock, CheckCircle2, Search,
  User, Check, ChevronDown, ChevronUp, Users, MapPin,
  Bell, PhoneCall, Video, FileText, DoorOpen, Building2,
  Monitor, ClipboardList, Package, CheckSquare, Download
} from 'lucide-react'
import toast from 'react-hot-toast'

const PIPELINE_STAGES: Record<string, { label: string; color: string }> = {
  quotation:            { label: 'Quotation',          color: '#8B5CF6' },
  material_approval:    { label: 'Material Approval',  color: '#F59E0B' },
  templating:           { label: 'Templating',         color: '#0EA5E9' },
  drawings_submission:  { label: 'Drawings Sub.',      color: '#3B82F6' },
  drawings_approval:    { label: 'Drawings App.',      color: '#6366F1' },
  fabrication:          { label: 'Fabrication',        color: '#EC4899' },
  shipping:             { label: 'Shipping',           color: '#F97316' },
  delivery:             { label: 'Delivery',           color: '#8B5CF6' },
  installation:         { label: 'Installation',       color: '#7D8C74' },
  snagging:             { label: 'Snagging',           color: '#EF4444' },
  handover:             { label: 'Handover',           color: '#059669' },
}

const CONTACT_TYPES = [
  { value: 'client',            label: 'Client' },
  { value: 'architect',         label: 'Architect' },
  { value: 'interior_designer', label: 'Interior Designer' },
  { value: 'contractor',        label: 'Contractor' },
  { value: 'developer',         label: 'Developer' },
  { value: 'supplier',          label: 'Supplier' },
  { value: 'subcontractor',     label: 'Subcontractor' },
  { value: 'other',             label: 'Other' },
]

const CONTACT_TYPE_COLORS: Record<string, string> = {
  client: '#7D8C74', architect: '#3B82F6', interior_designer: '#14B8A6', contractor: '#F59E0B',
  developer: '#8B5CF6', supplier: '#EC4899', subcontractor: '#F97316', other: '#6B7280',
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: any }> = {
  active:   { label: 'Active',   color: '#7D8C74', bg: '#ECFDF5', icon: CheckCircle2 },
  on_hold:  { label: 'On Hold',  color: '#F59E0B', bg: '#FFFBEB', icon: Clock },
  overdue:  { label: 'Overdue',  color: '#EF4444', bg: '#FEF2F2', icon: AlertTriangle },
  complete: { label: 'Complete', color: '#6B7280', bg: '#F3F4F6', icon: CheckCircle2 },
}

// ── Sales Contacts (personal CRM, separate from active project tracking) ──
const ROLE_TYPES = [
  { value: 'end_user_client', label: 'End User Client', color: '#7D8C74' },
  { value: 'architect',       label: 'Architect',        color: '#3B82F6' },
  { value: 'interior_designer', label: 'Interior Designer', color: '#EAB308' },
  { value: 'contractor',      label: 'Contractor',       color: '#F59E0B' },
  { value: 'developer',       label: 'Developer',        color: '#8B5CF6' },
  { value: 'fabricator',      label: 'Fabricator',       color: '#DC7633' },
  { value: 'installer',       label: 'Installer',        color: '#0EA5E9' },
  { value: 'supplier',        label: 'Supplier',         color: '#EC4899' },
  { value: 'other',           label: 'Other',            color: '#6B7280' },
]

const TOUCHPOINT_TYPES = [
  // Communication
  { value: 'email',              label: 'Email',              color: '#3B82F6', icon: Mail,          physical: false, category: 'Communication' },
  { value: 'call',                label: 'Call',               color: '#7D8C74', icon: PhoneCall,     physical: false, category: 'Communication' },
  // Meeting
  { value: 'sr_walk_in',         label: 'SR Walk In',         color: '#F97316', icon: DoorOpen,      physical: true,  category: 'Meeting' },
  { value: 'sr_meeting',         label: 'SR Meeting',         color: '#EC4899', icon: Building2,     physical: true,  category: 'Meeting' },
  { value: 'visit',              label: 'Visit',              color: '#F59E0B', icon: MapPin,        physical: true,  category: 'Meeting' },
  { value: 'online_meeting',     label: 'Online Meeting',     color: '#0EA5E9', icon: Monitor,       physical: false, category: 'Meeting' },
  { value: 'l_and_l_mtb',        label: 'L&L/MtB',            color: '#8B5CF6', icon: Users,         physical: true,  category: 'Meeting' },
  { value: 'physical_touchpoint', label: 'Physical Touchpoint', color: '#DC7633', icon: MapPin,       physical: true,  category: 'Meeting' },
  // Quotation Request
  { value: 'quotation_request',  label: 'Quotation Request',  color: '#6366F1', icon: ClipboardList, physical: false, category: 'Quotation Request' },
  // Sample Request
  { value: 'sample_request',     label: 'Sample Request',     color: '#14B8A6', icon: Package,       physical: true,  category: 'Sample Request' },
  // Other
  { value: 'other',              label: 'Other',              color: '#6B7280', icon: Clock,         physical: false, category: 'Other' },
  // Legacy values — hidden from the dropdown, kept so any existing entries still render correctly
  { value: 'letter',             label: 'Physical Letter',    color: '#78716C', icon: FileText,      physical: true,  category: 'Communication', legacy: true },
  { value: 'meeting',            label: 'Meeting',            color: '#8B5CF6', icon: Video,         physical: false, category: 'Meeting', legacy: true },
  { value: 'sample_marketing',   label: 'Sample Marketing',   color: '#14B8A6', icon: Package,       physical: true,  category: 'Sample Request', legacy: true },
]

// Groups the current (non-legacy) TOUCHPOINT_TYPES by category, preserving
// first-seen order, for rendering as <optgroup> sections in the action
// type dropdown. Legacy values are excluded here but still resolvable via
// getTouchpointType() for any older logged entries.
const TOUCHPOINT_CATEGORIES = TOUCHPOINT_TYPES
  .filter(t => !t.legacy)
  .reduce((groups: { category: string; items: typeof TOUCHPOINT_TYPES }[], t) => {
    let group = groups.find(g => g.category === t.category)
    if (!group) { group = { category: t.category, items: [] }; groups.push(group) }
    group.items.push(t)
    return groups
  }, [])

const STATUS_TYPES = [
  { value: 'outreach',             label: 'Outreach',              color: '#6B7280' },
  { value: 'new_project',          label: 'New Project',           color: '#3B82F6' },
  { value: 'project_in_progress',  label: 'Project In Progress',   color: '#F59E0B' },
  { value: 'won',                  label: 'Won',                   color: '#7D8C74' },
  { value: 'closed',               label: 'Closed',                color: '#EF4444' },
  { value: 'other',                label: 'Other',                 color: '#8B5CF6' },
]

export default function AdminPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <AdminPageInner />
    </Suspense>
  )
}

function AdminPageInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as 'todo' | 'sales_contacts' | 'projects' | 'contacts') || 'sales_contacts'
  const [user, setUser] = useState<any>(null)
  const isAdmin = user?.role === 'admin'
  const [projects, setProjects] = useState<any[]>([])
  const [contacts, setContacts] = useState<any[]>([])
  const [salesContacts, setSalesContacts] = useState<any[]>([])
  const [todos, setTodos] = useState<any[]>([])
  const [todoWeekStart, setTodoWeekStart] = useState(startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [selectedTodoDate, setSelectedTodoDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [newTodoText, setNewTodoText] = useState('')
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'todo' | 'sales_contacts' | 'projects' | 'contacts'>(initialTab)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState('all')
  const [expandedRoleGroups, setExpandedRoleGroups] = useState<Set<string>>(new Set())
  const [salesStatusFilter, setSalesStatusFilter] = useState('all')
  const [expandedContactId, setExpandedContactId] = useState<string | null>(null)
  const [showPhysicalLog, setShowPhysicalLog] = useState(false)
  const [actionLogSearch, setActionLogSearch] = useState('')
  const [actionLogTypeFilter, setActionLogTypeFilter] = useState('all')

  // Contact modal (project-linked, existing "Contacts" tab)
  const [showContactModal, setShowContactModal] = useState(false)
  const [editingContact, setEditingContact] = useState<any>(null)
  const [contactForm, setContactForm] = useState({
    name: '', company: '', email: '', phone: '',
    contact_type: 'client', project_id: '', notes: ''
  })

  // Sales contact modal (personal CRM)
  const [showSalesContactModal, setShowSalesContactModal] = useState(false)
  const [editingSalesContact, setEditingSalesContact] = useState<any>(null)
  const [salesContactForm, setSalesContactForm] = useState({
    name: '', role_type: 'end_user_client', status: 'outreach', company: '', phone: '', email: '', notes: ''
  })

  // Touchpoint / Action modal
  const [showTouchpointModal, setShowTouchpointModal] = useState(false)
  const [touchpointContactId, setTouchpointContactId] = useState<string | null>(null)
  const [editingTouchpoint, setEditingTouchpoint] = useState<any>(null)
  const [touchpointForm, setTouchpointForm] = useState({
    touchpoint_type: 'call', touch_date: format(new Date(), 'yyyy-MM-dd'),
    notes: '', next_reminder_date: ''
  })

  const [saving, setSaving] = useState(false)

  // Keep the visible tab in sync with the URL — sidebar links change the
  // ?tab= query param on the same /admin route, which doesn't remount this
  // component, so the initial useState value alone won't react to it.
  useEffect(() => {
    const urlTab = (searchParams.get('tab') as 'todo' | 'sales_contacts' | 'projects' | 'contacts' | null) || (isAdmin ? 'sales_contacts' : 'projects')
    // To Do List stays admin-only — non-admins get redirected to Project
    // Tracker instead of being able to reach it via the URL directly.
    if (urlTab === 'todo' && !isAdmin) {
      setTab('projects')
      return
    }
    setTab(urlTab)
  }, [searchParams, isAdmin])

  useEffect(() => { checkAuth() }, [])

  // Quick-action shortcut (e.g. from the Reports page) — open the Add
  // Contact modal directly instead of landing on the plain tab.
  useEffect(() => {
    if (searchParams.get('action') === 'addContact') openAddSalesContact()
    if (searchParams.get('action') === 'addProjectContact') {
      openAddContact()
      const projectId = searchParams.get('projectId')
      if (projectId) setContactForm(f => ({ ...f, project_id: projectId }))
    }
  }, [])

  async function checkAuth() {
    const { data: authData } = await supabase.auth.getUser()
    if (!authData.user) { router.push('/auth'); return }
    const { data: profile } = await supabase
      .from('users').select('*').eq('id', authData.user.id).single()
    if (!profile) { router.push('/dashboard'); return }
    // Project Tracker, Project Contacts, and Sales Contacts are open to
    // everyone — To Do List stays admin-only, and is scoped per-user via
    // RLS regardless (each person's own todos only).
    setUser(profile)
    const [, , salesData] = await Promise.all([loadProjects(), loadContacts(), loadSalesContacts(), loadTodos(profile.id)])
    if (salesData) await generateSalesReminderNotifications(salesData, profile.id)
    setLoading(false)
  }

  async function loadProjects() {
    const { data } = await supabase
      .from('projects')
      .select('*, milestones:project_milestones(*), project_manager:users!project_manager_id(full_name, color)')
      .order('name')
    setProjects(data || [])
  }

  async function loadContacts() {
    const { data } = await supabase
      .from('contacts')
      .select('*, project:projects(id, name)')
      .order('name')
    setContacts(data || [])
  }

  async function loadSalesContacts() {
    const { data } = await supabase
      .from('sales_contacts')
      .select('*, touchpoints:sales_touchpoints(*)')
      .order('name')
    setSalesContacts(data || [])
    return data || []
  }

  async function loadTodos(userId?: string) {
    const uid = userId || user?.id
    if (!uid) return []
    const { data } = await supabase
      .from('admin_todos')
      .select('*')
      .eq('user_id', uid)
      .order('todo_date', { ascending: true })
      .order('created_at', { ascending: true })
    setTodos(data || [])
    return data || []
  }

  async function addTodo() {
    if (!newTodoText.trim() || !user) return
    const { error } = await supabase.from('admin_todos').insert({
      user_id: user.id, todo_date: selectedTodoDate, text: newTodoText.trim(), completed: false,
    })
    if (error) { toast.error('Failed to add'); return }
    setNewTodoText('')
    loadTodos()
  }

  async function toggleTodoComplete(todo: any) {
    await supabase.from('admin_todos').update({ completed: !todo.completed }).eq('id', todo.id)
    loadTodos()
  }

  async function deleteTodo(id: string) {
    await supabase.from('admin_todos').delete().eq('id', id)
    loadTodos()
  }

  // Auto-creates app notifications (bell icon + /notifications) for sales
  // follow-up reminders that are due today or overdue. Reuses the existing
  // task_due/task_overdue notification types so it renders the same way
  // milestone alerts already do. Deduped so it won't spam on every page load.
  async function generateSalesReminderNotifications(contactsData: any[], userId: string) {
    const todayStr = new Date().toISOString().slice(0, 10)
    for (const c of contactsData) {
      const pending = (c.touchpoints || []).filter((t: any) => t.next_reminder_date && !t.reminder_done)
      for (const t of pending) {
        const due = parseISO(t.next_reminder_date)
        const overdue = isPast(due) && !isToday(due)
        const dueToday = isToday(due)
        if (!overdue && !dueToday) continue

        const who = c.company ? `${c.name} (${c.company})` : c.name
        const title = overdue ? `Overdue follow-up: ${c.name}` : `Follow-up due today: ${c.name}`
        const body = overdue
          ? `${who} — follow-up was due ${format(due, 'd MMM yyyy')}.`
          : `${who} — follow-up is due today.`

        const { data: existing } = await supabase.from('notifications')
          .select('id').eq('user_id', userId)
          .eq('title', title)
          .gte('created_at', todayStr)
          .limit(1)

        if (!existing?.length) {
          await supabase.from('notifications').insert({
            user_id: userId,
            title, body,
            type: overdue ? 'task_overdue' : 'task_due',
            read: false,
            link: '/admin?tab=sales_contacts',
          })
        }
      }
    }
  }

  function getNextMilestone(project: any) {
    if (!project.milestones || project.milestones.length === 0) return null
    const now = new Date()
    const upcoming = project.milestones
      .filter((m: any) => m.planned_date && new Date(m.planned_date) >= now)
      .sort((a: any, b: any) => new Date(a.planned_date).getTime() - new Date(b.planned_date).getTime())
    return upcoming[0] || null
  }

  function getOverdueMilestones(project: any) {
    if (!project.milestones) return []
    return project.milestones.filter((m: any) =>
      m.planned_date && isPast(parseISO(m.planned_date)) && m.status !== 'complete'
    )
  }

  // ── SALES CONTACT + TOUCHPOINT HELPERS ──
  function getNextReminder(contact: any) {
    if (!contact.touchpoints) return null
    const pending = contact.touchpoints
      .filter((t: any) => t.next_reminder_date && !t.reminder_done)
      .sort((a: any, b: any) => a.next_reminder_date.localeCompare(b.next_reminder_date))
    return pending[0] || null
  }

  function getSortedTouchpoints(contact: any) {
    if (!contact.touchpoints) return []
    return [...contact.touchpoints].sort((a, b) => b.touch_date.localeCompare(a.touch_date))
  }

  function getTouchpointType(value: string) {
    const normalized = value === 'site_visit' ? 'visit' : value
    return TOUCHPOINT_TYPES.find(t => t.value === normalized) || TOUCHPOINT_TYPES.find(t => t.value === 'other')!
  }

  // ── SALES CONTACT CRUD ──
  function openAddSalesContact() {
    setEditingSalesContact(null)
    setSalesContactForm({ name: '', role_type: 'end_user_client', status: 'outreach', company: '', phone: '', email: '', notes: '' })
    setShowSalesContactModal(true)
  }

  function openEditSalesContact(c: any) {
    setEditingSalesContact(c)
    setSalesContactForm({
      name: c.name || '', role_type: c.role_type || 'other', status: c.status || 'outreach',
      company: c.company || '', phone: c.phone || '', email: c.email || '', notes: c.notes || '',
    })
    setShowSalesContactModal(true)
  }

  async function saveSalesContact() {
    if (!salesContactForm.name.trim() && !salesContactForm.company.trim()) { toast.error('Company or name is required'); return }
    setSaving(true)
    const payload = {
      name: salesContactForm.name.trim() || salesContactForm.company.trim(),
      role_type: salesContactForm.role_type,
      status: salesContactForm.status,
      company: salesContactForm.company.trim() || null,
      phone: salesContactForm.phone.trim() || null,
      email: salesContactForm.email.trim() || null,
      notes: salesContactForm.notes.trim() || null,
    }
    if (editingSalesContact) {
      const statusChanged = (editingSalesContact.status || 'outreach') !== payload.status
      const { error } = await supabase.from('sales_contacts').update(payload).eq('id', editingSalesContact.id)
      if (error) { toast.error('Failed to update'); setSaving(false); return }
      toast.success('Contact updated')
      if (statusChanged && user) {
        const newStatusLabel = STATUS_TYPES.find(s => s.value === payload.status)?.label || payload.status
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: `Status updated: ${payload.name}`,
          body: `${payload.name}${payload.company ? ` (${payload.company})` : ''} moved to ${newStatusLabel}.`,
          type: 'project_update',
          read: false,
          link: '/admin?tab=sales_contacts',
        })
      }
    } else {
      const { error } = await supabase.from('sales_contacts').insert({ ...payload, created_by: user.id })
      if (error) { toast.error('Failed to add'); setSaving(false); return }
      toast.success('Contact added')
    }
    setSaving(false)
    setShowSalesContactModal(false)
    loadSalesContacts()
  }

  async function deleteSalesContact(id: string) {
    if (!confirm('Delete this contact and all their touchpoint history?')) return
    await supabase.from('sales_contacts').delete().eq('id', id)
    toast.success('Contact deleted')
    loadSalesContacts()
  }

  // ── ACTION (touchpoint) CRUD ──
  function openLogTouchpoint(contactId: string) {
    setEditingTouchpoint(null)
    setTouchpointContactId(contactId)
    setTouchpointForm({ touchpoint_type: 'call', touch_date: format(new Date(), 'yyyy-MM-dd'), notes: '', next_reminder_date: '' })
    setShowTouchpointModal(true)
  }

  function openEditTouchpoint(t: any) {
    setEditingTouchpoint(t)
    setTouchpointContactId(t.contact_id)
    setTouchpointForm({
      touchpoint_type: t.touchpoint_type || 'call',
      touch_date: t.touch_date || format(new Date(), 'yyyy-MM-dd'),
      notes: t.notes || '',
      next_reminder_date: t.next_reminder_date || '',
    })
    setShowTouchpointModal(true)
  }

  async function saveTouchpoint() {
    if (!touchpointContactId) return
    setSaving(true)
    const payload = {
      touchpoint_type: touchpointForm.touchpoint_type,
      touch_date: touchpointForm.touch_date || format(new Date(), 'yyyy-MM-dd'),
      notes: touchpointForm.notes.trim() || null,
      next_reminder_date: touchpointForm.next_reminder_date || null,
    }
    if (editingTouchpoint) {
      const { error } = await supabase.from('sales_touchpoints').update(payload).eq('id', editingTouchpoint.id)
      if (error) { toast.error('Failed to update action'); setSaving(false); return }
      toast.success('Action updated')
    } else {
      const { error } = await supabase.from('sales_touchpoints').insert({ ...payload, contact_id: touchpointContactId, created_by: user.id })
      if (error) { toast.error('Failed to log action'); setSaving(false); return }
      toast.success('Action logged')
    }
    setSaving(false)
    setShowTouchpointModal(false)
    setExpandedContactId(touchpointContactId)
    loadSalesContacts()
  }

  async function toggleReminderDone(touchpoint: any) {
    await supabase.from('sales_touchpoints').update({ reminder_done: !touchpoint.reminder_done }).eq('id', touchpoint.id)
    loadSalesContacts()
  }

  async function deleteTouchpoint(id: string) {
    if (!confirm('Delete this touchpoint?')) return
    await supabase.from('sales_touchpoints').delete().eq('id', id)
    toast.success('Touchpoint deleted')
    loadSalesContacts()
  }

  // ── PROJECT CONTACT CRUD (existing "Contacts" tab) ──
  function openAddContact() {
    setEditingContact(null)
    setContactForm({ name: '', company: '', email: '', phone: '', contact_type: 'client', project_id: '', notes: '' })
    setShowContactModal(true)
  }

  function openEditContact(contact: any) {
    setEditingContact(contact)
    setContactForm({
      name: contact.name || '', company: contact.company || '',
      email: contact.email || '', phone: contact.phone || '',
      contact_type: contact.contact_type || 'other',
      project_id: contact.project_id || '', notes: contact.notes || '',
    })
    setShowContactModal(true)
  }

  async function saveContact() {
    if (!contactForm.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const payload = {
      name: contactForm.name.trim(),
      company: contactForm.company.trim() || null,
      email: contactForm.email.trim() || null,
      phone: contactForm.phone.trim() || null,
      contact_type: contactForm.contact_type,
      project_id: contactForm.project_id || null,
      notes: contactForm.notes.trim() || null,
    }
    if (editingContact) {
      const { error } = await supabase.from('contacts').update(payload).eq('id', editingContact.id)
      if (error) { toast.error('Failed to update'); setSaving(false); return }
      toast.success('Contact updated')
    } else {
      const { error } = await supabase.from('contacts').insert(payload)
      if (error) { toast.error('Failed to add'); setSaving(false); return }
      toast.success('Contact added')
    }
    setSaving(false)
    setShowContactModal(false)
    loadContacts()
  }

  async function deleteContact(id: string) {
    if (!confirm('Delete this contact?')) return
    await supabase.from('contacts').delete().eq('id', id)
    toast.success('Contact deleted')
    loadContacts()
  }

  // ── FILTERED DATA ──
  const filteredProjects = projects.filter(p => {
    const matchSearch = !search ||
      p.name?.toLowerCase().includes(search.toLowerCase()) ||
      p.client?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' || p.status === statusFilter
    return matchSearch && matchStatus
  })

  const filteredContacts = contacts.filter(c => {
    const matchSearch = !search ||
      c.name?.toLowerCase().includes(search.toLowerCase()) ||
      c.company?.toLowerCase().includes(search.toLowerCase()) ||
      c.email?.toLowerCase().includes(search.toLowerCase())
    const matchType = typeFilter === 'all' || c.contact_type === typeFilter
    return matchSearch && matchType
  })

  const filteredSalesContacts = salesContacts
    .filter(c => {
      const matchSearch = !search ||
        c.name?.toLowerCase().includes(search.toLowerCase()) ||
        c.company?.toLowerCase().includes(search.toLowerCase()) ||
        c.email?.toLowerCase().includes(search.toLowerCase())
      const matchRole = roleFilter === 'all' || c.role_type === roleFilter
      const matchStatus = salesStatusFilter === 'all' || (c.status || 'outreach') === salesStatusFilter
      return matchSearch && matchRole && matchStatus
    })
    .sort((a, b) => {
      const ra = getNextReminder(a)
      const rb = getNextReminder(b)
      if (ra && rb) return ra.next_reminder_date.localeCompare(rb.next_reminder_date)
      if (ra) return -1
      if (rb) return 1
      return (a.name || '').localeCompare(b.name || '')
    })

  const dueRemindersCount = salesContacts.reduce((acc, c) => {
    const r = getNextReminder(c)
    if (r && (isPast(parseISO(r.next_reminder_date)) || isToday(parseISO(r.next_reminder_date)))) return acc + 1
    return acc
  }, 0)

  const todayStr = format(new Date(), 'yyyy-MM-dd')
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(todoWeekStart, i))
  const itemsForSelectedDate = todos
    .filter(t => t.todo_date === selectedTodoDate)
    .sort((a, b) => Number(a.completed) - Number(b.completed) || a.created_at.localeCompare(b.created_at))
  const todayIncompleteCount = todos.filter(t => t.todo_date === todayStr && !t.completed).length

  const allActionsLog = salesContacts
    .flatMap((c: any) =>
      (c.touchpoints || [])
        .map((t: any) => ({ ...t, contactName: c.name, contactCompany: c.company, contactId: c.id, contactStatus: c.status }))
    )
    .sort((a: any, b: any) => b.touch_date.localeCompare(a.touch_date))

  const searchedActionsLog = allActionsLog
    .filter((t: any) => actionLogTypeFilter === 'all' || t.touchpoint_type === actionLogTypeFilter)
    .filter((t: any) => {
      if (!actionLogSearch.trim()) return true
      const q = actionLogSearch.toLowerCase()
      const tt = getTouchpointType(t.touchpoint_type)
      return (
        t.contactName?.toLowerCase().includes(q) ||
        t.contactCompany?.toLowerCase().includes(q) ||
        tt.label.toLowerCase().includes(q) ||
        tt.category.toLowerCase().includes(q) ||
        t.notes?.toLowerCase().includes(q)
      )
    })

  function exportSalesWeeklyReport() {
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    const weekFriday = addDays(weekStart, 4)
    const weekStartStr = format(weekStart, 'yyyy-MM-dd')
    const weekFridayStr = format(weekFriday, 'yyyy-MM-dd')

    const wb = XLSX.utils.book_new()

    // Sheet 1: contacts with current status
    const contactRows = salesContacts.map((c: any) => {
      const role = ROLE_TYPES.find(r => r.value === c.role_type)
      const status = STATUS_TYPES.find(s => s.value === (c.status || 'outreach'))
      const nextReminder = getNextReminder(c)
      return {
        'Contact': c.name,
        'Company': c.company || '',
        'Role': role?.label || c.role_type,
        'Status': status?.label || c.status || 'Outreach',
        'Next Follow-up': nextReminder ? nextReminder.next_reminder_date : '',
        'Phone': c.phone || '',
        'Email': c.email || '',
      }
    })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contactRows), 'Contacts Status')

    // Sheet 2: actions logged this week (Mon-Fri)
    const weekActionRows = allActionsLog
      .filter((t: any) => t.touch_date >= weekStartStr && t.touch_date <= weekFridayStr)
      .map((t: any) => {
        const tt = getTouchpointType(t.touchpoint_type)
        const status = STATUS_TYPES.find(s => s.value === (t.contactStatus || 'outreach'))
        return {
          'Contact': t.contactName,
          'Company': t.contactCompany || '',
          'Action Type': tt.label,
          'Category': tt.category,
          'Date': t.touch_date,
          'Contact Status': status?.label || 'Outreach',
          'Notes': t.notes || '',
          'Next Reminder': t.next_reminder_date || '',
        }
      })
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weekActionRows), 'Actions This Week')

    XLSX.writeFile(wb, `stoneline-sales-weekly-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
    toast.success('Sales weekly report exported')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  const TAB_TITLES: Record<string, string> = {
    todo: 'To Do List',
    sales_contacts: 'Contacts',
    projects: 'Project Tracker',
    contacts: 'Project Contacts',
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto overflow-x-hidden">
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-xl font-semibold text-stone-900">{TAB_TITLES[tab]}</h1>
        <p className="text-sm text-stone-500 mt-0.5">
          {tab === 'todo' && `${todayIncompleteCount} to do today`}
          {tab === 'sales_contacts' && (
            <>{dueRemindersCount > 0 ? `${dueRemindersCount} reminders due · ` : ''}{salesContacts.length} sales contacts</>
          )}
          {tab === 'projects' && `${projects.length} projects`}
          {tab === 'contacts' && `${contacts.length} project contacts`}
        </p>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        {/* Contacts, Project Tracker, and To Do List are three fully separate
            sections, each reached from its own distinct sidebar link. Only
            Contacts has a sibling tab to switch to (Project Contacts) — the
            other two just show their own content with no tab-switcher. */}
        {(tab === 'sales_contacts' || tab === 'contacts') && (
          <div className="flex border border-stone-200 rounded-lg bg-white overflow-x-auto flex-shrink-0" style={{ WebkitOverflowScrolling: 'touch' }}>
            <button
              onClick={() => { setTab('sales_contacts'); setSearch(''); }}
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap flex-shrink-0
                ${tab === 'sales_contacts' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-50'}`}
            >
              <PhoneCall size={14} /> Contacts
              {dueRemindersCount > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${tab === 'sales_contacts' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'}`}>
                  {dueRemindersCount}
                </span>
              )}
            </button>
            <button
              onClick={() => { setTab('contacts'); setSearch(''); }}
              className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 whitespace-nowrap flex-shrink-0
                ${tab === 'contacts' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-50'}`}
            >
              <User size={14} /> Project Contacts
            </button>
          </div>
        )}

        {tab !== 'todo' && (
          <div className="flex items-center gap-2 flex-1 flex-wrap">
            <div className="relative flex-1 min-w-[180px] max-w-sm">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                className="input pl-9"
                placeholder={tab === 'sales_contacts' ? 'Search contacts...' : tab === 'projects' ? 'Search projects...' : 'Search contacts...'}
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>

            {tab === 'sales_contacts' && (
              <>
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value)} className="input w-auto">
                  <option value="all">All roles</option>
                  {ROLE_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
                <select value={salesStatusFilter} onChange={e => setSalesStatusFilter(e.target.value)} className="input w-auto">
                  <option value="all">All statuses</option>
                  {STATUS_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
                <button onClick={() => setShowPhysicalLog(true)} className="btn-secondary flex items-center gap-1.5 whitespace-nowrap">
                  <ClipboardList size={14} /> Action Log
                  {allActionsLog.length > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded-full bg-stone-200 text-stone-600">{allActionsLog.length}</span>
                  )}
                </button>
                <button onClick={exportSalesWeeklyReport} className="btn-secondary flex items-center gap-1.5 whitespace-nowrap">
                  <Download size={14} /> Export Weekly Report
                </button>
                <button onClick={openAddSalesContact} className="btn-primary flex items-center gap-1.5 whitespace-nowrap">
                  <Plus size={14} /> Add Contact
                </button>
              </>
            )}

            {tab === 'projects' && (
              <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className="input w-auto">
                <option value="all">All status</option>
                <option value="active">Active</option>
                <option value="on_hold">On Hold</option>
                <option value="overdue">Overdue</option>
                <option value="complete">Complete</option>
              </select>
            )}

            {tab === 'contacts' && (
              <>
                <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="input w-auto">
                  <option value="all">All types</option>
                  {CONTACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
                <button onClick={openAddContact} className="btn-primary flex items-center gap-1.5 whitespace-nowrap">
                  <Plus size={14} /> Add
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {/* ══════════════════════════════════════ */}
      {/* ── TO DO LIST TAB (manual, day-by-day) ── */}
      {/* ══════════════════════════════════════ */}
      {tab === 'todo' && (
        <div className="card overflow-hidden">
          {/* Week nav */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-stone-100">
            <button
              onClick={() => setTodoWeekStart(addDays(todoWeekStart, -7))}
              className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600"
            >
              <ChevronDown size={15} className="rotate-90" />
            </button>
            <button
              onClick={() => {
                setTodoWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))
                setSelectedTodoDate(todayStr)
              }}
              className="text-xs font-medium text-stone-500 hover:text-stone-700"
            >
              {format(todoWeekStart, 'MMM yyyy')} · Today
            </button>
            <button
              onClick={() => setTodoWeekStart(addDays(todoWeekStart, 7))}
              className="p-1.5 rounded-lg hover:bg-stone-100 text-stone-400 hover:text-stone-600"
            >
              <ChevronDown size={15} className="-rotate-90" />
            </button>
          </div>

          {/* Day strip */}
          <div className="grid grid-cols-7 gap-1 px-3 py-3 border-b border-stone-100">
            {weekDays.map(d => {
              const dStr = format(d, 'yyyy-MM-dd')
              const selected = dStr === selectedTodoDate
              const today = dStr === todayStr
              const hasIncomplete = todos.some(t => t.todo_date === dStr && !t.completed)
              return (
                <button key={dStr} onClick={() => setSelectedTodoDate(dStr)}
                  className={`flex flex-col items-center gap-1 py-2 rounded-lg transition-colors
                    ${selected ? 'bg-stone-900 text-white' : today ? 'bg-brand-50 text-brand-700' : 'text-stone-500 hover:bg-stone-50'}`}>
                  <span className="text-[10px] font-medium uppercase tracking-wide">{format(d, 'EEE')}</span>
                  <span className="text-sm font-semibold">{format(d, 'd')}</span>
                  {hasIncomplete && (
                    <span className={`w-1 h-1 rounded-full ${selected ? 'bg-white' : 'bg-brand-500'}`} />
                  )}
                </button>
              )
            })}
          </div>

          {/* Add item */}
          <div className="flex items-center gap-2 px-5 py-3 border-b border-stone-100">
            <input
              className="input flex-1"
              placeholder={`Add something to do on ${format(parseISO(selectedTodoDate), 'EEEE d MMM')}...`}
              value={newTodoText}
              onChange={e => setNewTodoText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') addTodo() }}
            />
            <button onClick={addTodo} className="btn-primary flex items-center gap-1.5 whitespace-nowrap">
              <Plus size={14} /> Add
            </button>
          </div>

          {/* Items for selected day */}
          <div className="divide-y divide-stone-100">
            {itemsForSelectedDate.length === 0 && (
              <p className="px-5 py-10 text-sm text-stone-400 text-center">
                Nothing on the list for {format(parseISO(selectedTodoDate), 'EEEE d MMM')} yet
              </p>
            )}
            {itemsForSelectedDate.map(item => (
              <div key={item.id} className="flex items-center gap-3 px-5 py-3 hover:bg-stone-50 group">
                <button onClick={() => toggleTodoComplete(item)}
                  className={`w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors
                    ${item.completed ? 'bg-brand-500 border-brand-500 text-white' : 'border-stone-300 hover:border-brand-400'}`}>
                  {item.completed && <Check size={12} />}
                </button>
                <p className={`flex-1 text-sm ${item.completed ? 'line-through text-stone-400' : 'text-stone-900'}`}>
                  {item.text}
                </p>
                <button onClick={() => deleteTodo(item.id)}
                  className="p-1 rounded hover:bg-red-50 text-stone-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* ── SALES CONTACTS TAB ── */}
      {/* ══════════════════════════════════════ */}
      {tab === 'sales_contacts' && (() => {
        const groups = ROLE_TYPES
          .map(role => ({ ...role, contacts: filteredSalesContacts.filter((c: any) => (c.role_type || 'other') === role.value) }))
          .filter(g => g.contacts.length > 0)

        return (
          <div className="space-y-6">
            {groups.length === 0 && (
              <div className="py-12 text-center text-sm text-stone-400">
                {salesContacts.length === 0 ? 'No contacts yet. Add your first one.' : 'No contacts match your filters'}
              </div>
            )}
            {groups.map(group => {
              const isOpen = expandedRoleGroups.has(group.value)
              return (
              <div key={group.value}>
                <button
                  onClick={() => setExpandedRoleGroups(prev => {
                    const next = new Set(prev)
                    if (next.has(group.value)) next.delete(group.value)
                    else next.add(group.value)
                    return next
                  })}
                  className="w-full flex items-center gap-2 mb-3 hover:opacity-70 transition-opacity text-left">
                  <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: group.color }}/>
                  <h3 className="text-sm font-semibold text-stone-700">{group.label}s</h3>
                  <span className="text-xs text-stone-400">({group.contacts.length})</span>
                  {isOpen ? <ChevronUp size={14} className="text-stone-400 ml-auto"/> : <ChevronDown size={14} className="text-stone-400 ml-auto"/>}
                </button>
                {isOpen && (
                <div className="space-y-3">
                  {group.contacts.map((contact: any) => {
                    const statusConf = STATUS_TYPES.find(s => s.value === (contact.status || 'outreach')) || STATUS_TYPES[0]
                    const nextReminder = getNextReminder(contact)
                    const reminderOverdue = nextReminder && isPast(parseISO(nextReminder.next_reminder_date)) && !isToday(parseISO(nextReminder.next_reminder_date))
                    const reminderToday = nextReminder && isToday(parseISO(nextReminder.next_reminder_date))
                    const initials = contact.name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?'

                    return (
                      <div key={contact.id} className="card p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-start gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
                              style={{ background: group.color }}>
                              {initials}
                            </div>
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-stone-900">{contact.company || contact.name}</p>
                              <p className="text-xs text-stone-400 mt-0.5">{contact.company ? contact.name : ''}</p>
                              <span className="badge text-xs mt-1.5 inline-block" style={{ color: statusConf.color, background: statusConf.color + '15' }}>
                                {statusConf.label}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button onClick={() => openEditSalesContact(contact)} className="p-1.5 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-600">
                              <Pencil size={13} />
                            </button>
                            <button onClick={() => deleteSalesContact(contact.id)} className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 mt-3 flex-wrap">
                          {contact.phone && (
                            <a href={`tel:${contact.phone}`} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                              <Phone size={11} /> {contact.phone}
                            </a>
                          )}
                          {contact.email && (
                            <a href={`mailto:${contact.email}`} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                              <Mail size={11} /> {contact.email}
                            </a>
                          )}
                        </div>

                        {contact.notes && <p className="text-xs text-stone-500 mt-2">{contact.notes}</p>}

                        {nextReminder && (
                          <div className={`mt-3 flex items-center gap-2 text-xs px-2.5 py-1.5 rounded-lg ${
                            reminderOverdue ? 'bg-red-50 text-red-600' : reminderToday ? 'bg-amber-50 text-amber-600' : 'bg-stone-50 text-stone-500'
                          }`}>
                            <Bell size={12} className="flex-shrink-0" />
                            <span className="flex-1">
                              Follow up {reminderOverdue ? 'overdue' : reminderToday ? 'today' : 'on'}: {format(parseISO(nextReminder.next_reminder_date), 'd MMM yyyy')}
                            </span>
                            <button onClick={() => openEditTouchpoint(nextReminder)}
                              className="flex items-center gap-1 font-medium hover:underline flex-shrink-0">
                              <Pencil size={11} /> Edit
                            </button>
                            <button onClick={() => toggleReminderDone(nextReminder)}
                              className="flex items-center gap-1 font-medium hover:underline flex-shrink-0">
                              <Check size={12} /> Done
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
                )}
              </div>
              )
            })}
          </div>
        )
      })()}

      {/* ══════════════════════════════════════ */}
      {/* ── ALL PROJECTS TAB ── */}
      {/* ══════════════════════════════════════ */}
      {tab === 'projects' && (
        <>
          {/* Desktop */}
          <div className="hidden md:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Project</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Stage</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Status</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Next Milestone</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Next Action</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">PM</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map(project => {
                    const nextMs = getNextMilestone(project)
                    const overdue = getOverdueMilestones(project)
                    const stageConf = PIPELINE_STAGES[project.current_stage]
                    const statusConf = STATUS_CONFIG[project.status] || STATUS_CONFIG.active
                    const StatusIcon = statusConf.icon

                    return (
                      <tr key={project.id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                        <td className="px-4 py-3">
                          <Link href={`/projects/${project.id}`} className="group">
                            <p className="text-sm font-medium text-stone-900 group-hover:text-brand-600 transition-colors">{project.name}</p>
                            <p className="text-xs text-stone-400 mt-0.5">{project.client}</p>
                          </Link>
                        </td>
                        <td className="px-4 py-3">
                          {stageConf ? (
                            <span className="badge" style={{ color: stageConf.color, background: stageConf.color + '15' }}>
                              <span className="w-1.5 h-1.5 rounded-full" style={{ background: stageConf.color }} />
                              {stageConf.label}
                            </span>
                          ) : (
                            <span className="text-xs text-stone-400">{project.current_stage}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="badge" style={{ color: statusConf.color, background: statusConf.bg }}>
                            <StatusIcon size={12} />
                            {statusConf.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          {nextMs ? (
                            <div>
                              <p className="text-xs font-medium text-stone-700">{PIPELINE_STAGES[nextMs.stage]?.label || nextMs.stage}</p>
                              <p className="text-xs text-stone-400">{format(parseISO(nextMs.planned_date), 'd MMM yyyy')}</p>
                            </div>
                          ) : overdue.length > 0 ? (
                            <span className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={12} /> {overdue.length} overdue</span>
                          ) : (
                            <span className="text-xs text-stone-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-stone-600 max-w-[200px] truncate">
                            {project.next_action || <span className="text-stone-300">—</span>}
                          </p>
                        </td>
                        <td className="px-4 py-3">
                          {project.project_manager ? (
                            <div className="flex items-center gap-2">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                                style={{ background: project.project_manager.color || '#7D8C74' }}>
                                {project.project_manager.full_name?.charAt(0) || '?'}
                              </div>
                              <span className="text-xs text-stone-600 truncate">{project.project_manager.full_name?.split(' ')[0]}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-stone-300">—</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {filteredProjects.length === 0 && (
                <div className="py-12 text-center text-sm text-stone-400">No projects match your filters</div>
              )}
            </div>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {filteredProjects.map(project => {
              const nextMs = getNextMilestone(project)
              const overdue = getOverdueMilestones(project)
              const stageConf = PIPELINE_STAGES[project.current_stage]
              const statusConf = STATUS_CONFIG[project.status] || STATUS_CONFIG.active

              return (
                <Link key={project.id} href={`/projects/${project.id}`} className="card block p-4 hover:shadow-card-hover transition-shadow">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">{project.name}</p>
                      <p className="text-xs text-stone-400">{project.client}</p>
                    </div>
                    <span className="badge flex-shrink-0" style={{ color: statusConf.color, background: statusConf.bg }}>{statusConf.label}</span>
                  </div>
                  <div className="flex items-center gap-3 mt-3">
                    {stageConf && (
                      <span className="badge text-xs" style={{ color: stageConf.color, background: stageConf.color + '15' }}>
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: stageConf.color }} />
                        {stageConf.label}
                      </span>
                    )}
                    {nextMs && <span className="text-xs text-stone-500">Next: {format(parseISO(nextMs.planned_date), 'd MMM')}</span>}
                    {overdue.length > 0 && (
                      <span className="text-xs text-red-500 flex items-center gap-1"><AlertTriangle size={10} /> {overdue.length} overdue</span>
                    )}
                  </div>
                  {project.next_action && <p className="text-xs text-stone-500 mt-2 truncate">→ {project.next_action}</p>}
                </Link>
              )
            })}
            {filteredProjects.length === 0 && (
              <div className="py-12 text-center text-sm text-stone-400">No projects match your filters</div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════ */}
      {/* ── PROJECT CONTACTS TAB ── */}
      {/* ══════════════════════════════════════ */}
      {tab === 'contacts' && (
        <>
          {/* Desktop */}
          <div className="hidden md:block card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50">
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Name</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Company</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Type</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Phone</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Email</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Project</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Notes</th>
                    <th className="px-4 py-3 w-20" />
                  </tr>
                </thead>
                <tbody>
                  {filteredContacts.map(contact => (
                    <tr key={contact.id} className="border-b border-stone-100 hover:bg-stone-50 transition-colors">
                      <td className="px-4 py-3"><p className="text-sm font-medium text-stone-900">{contact.company || contact.name}</p></td>
                      <td className="px-4 py-3"><p className="text-xs text-stone-600">{contact.company ? contact.name : '—'}</p></td>
                      <td className="px-4 py-3">
                        <span className="badge"
                          style={{ color: CONTACT_TYPE_COLORS[contact.contact_type] || '#6B7280', background: (CONTACT_TYPE_COLORS[contact.contact_type] || '#6B7280') + '15' }}>
                          {CONTACT_TYPES.find(t => t.value === contact.contact_type)?.label || contact.contact_type}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {contact.phone ? (
                          <a href={`tel:${contact.phone}`} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Phone size={11} /> {contact.phone}</a>
                        ) : <span className="text-xs text-stone-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {contact.email ? (
                          <a href={`mailto:${contact.email}`} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Mail size={11} /> {contact.email}</a>
                        ) : <span className="text-xs text-stone-300">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {contact.project ? (
                          <Link href={`/projects/${contact.project.id}`} className="text-xs text-brand-600 hover:underline">{contact.project.name}</Link>
                        ) : <span className="text-xs text-stone-300">—</span>}
                      </td>
                      <td className="px-4 py-3"><p className="text-xs text-stone-500 max-w-[180px] truncate">{contact.notes || '—'}</p></td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button onClick={() => openEditContact(contact)} className="p-1.5 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-600"><Pencil size={13} /></button>
                          <button onClick={() => deleteContact(contact.id)} className="p-1.5 rounded hover:bg-red-50 text-stone-400 hover:text-red-500"><Trash2 size={13} /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredContacts.length === 0 && (
                <div className="py-12 text-center text-sm text-stone-400">
                  {contacts.length === 0 ? 'No contacts yet. Add your first one.' : 'No contacts match your filters'}
                </div>
              )}
            </div>
          </div>

          {/* Mobile */}
          <div className="md:hidden space-y-3">
            {filteredContacts.map(contact => (
              <div key={contact.id} className="card p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-stone-900">{contact.company || contact.name}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{contact.company ? contact.name : ''}</p>
                  </div>
                  <span className="badge text-xs flex-shrink-0"
                    style={{ color: CONTACT_TYPE_COLORS[contact.contact_type] || '#6B7280', background: (CONTACT_TYPE_COLORS[contact.contact_type] || '#6B7280') + '15' }}>
                    {CONTACT_TYPES.find(t => t.value === contact.contact_type)?.label || contact.contact_type}
                  </span>
                </div>
                <div className="flex items-center gap-4 mt-3">
                  {contact.phone && <a href={`tel:${contact.phone}`} className="text-xs text-brand-600 flex items-center gap-1"><Phone size={11} /> {contact.phone}</a>}
                  {contact.email && <a href={`mailto:${contact.email}`} className="text-xs text-brand-600 flex items-center gap-1"><Mail size={11} /> {contact.email}</a>}
                </div>
                {contact.project && (
                  <p className="text-xs text-stone-400 mt-2">Project: <Link href={`/projects/${contact.project.id}`} className="text-brand-600">{contact.project.name}</Link></p>
                )}
                {contact.notes && <p className="text-xs text-stone-500 mt-1">{contact.notes}</p>}
                <div className="flex items-center gap-1 mt-3 pt-2 border-t border-stone-100">
                  <button onClick={() => openEditContact(contact)} className="text-xs text-stone-500 hover:text-stone-700 flex items-center gap-1"><Pencil size={11} /> Edit</button>
                  <span className="text-stone-200 mx-1">|</span>
                  <button onClick={() => deleteContact(contact.id)} className="text-xs text-red-400 hover:text-red-600 flex items-center gap-1"><Trash2 size={11} /> Delete</button>
                </div>
              </div>
            ))}
            {filteredContacts.length === 0 && (
              <div className="py-12 text-center text-sm text-stone-400">
                {contacts.length === 0 ? 'No contacts yet. Add your first one.' : 'No contacts match your filters'}
              </div>
            )}
          </div>
        </>
      )}

      {/* ══════════════════════════════════════ */}
      {/* ── ACTION LOG MODAL (all categories) ── */}
      {/* ══════════════════════════════════════ */}
      {showPhysicalLog && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => { setShowPhysicalLog(false); setActionLogSearch(''); setActionLogTypeFilter('all') }}>
          <div className="bg-white rounded-xl shadow-modal w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200 flex-shrink-0">
              <div>
                <h2 className="text-base font-semibold text-stone-900">Action Log</h2>
                <p className="text-xs text-stone-400 mt-0.5">Every action logged across your sales contacts</p>
              </div>
              <button onClick={() => { setShowPhysicalLog(false); setActionLogSearch(''); setActionLogTypeFilter('all') }} className="p-1 rounded hover:bg-stone-100 text-stone-400"><X size={18} /></button>
            </div>

            <div className="px-5 py-3 border-b border-stone-100 flex-shrink-0 flex items-center gap-2">
              <div className="relative flex-1">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  className="input pl-9"
                  placeholder="Search e.g. 'physical touchpoint', 'SR meeting', a contact name..."
                  value={actionLogSearch}
                  onChange={e => setActionLogSearch(e.target.value)}
                />
              </div>
              <select
                className="input w-auto flex-shrink-0"
                value={actionLogTypeFilter}
                onChange={e => setActionLogTypeFilter(e.target.value)}
              >
                <option value="all">All types</option>
                {TOUCHPOINT_CATEGORIES.map(g => (
                  <optgroup key={g.category} label={g.category}>
                    {g.items.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="overflow-y-auto divide-y divide-stone-100">
              {searchedActionsLog.length === 0 && (
                <p className="px-5 py-10 text-sm text-stone-400 text-center">
                  {allActionsLog.length === 0 ? 'No actions logged yet' : 'No actions match your search'}
                </p>
              )}
              {searchedActionsLog.map((t: any) => {
                const tt = getTouchpointType(t.touchpoint_type)
                const TtIcon = tt.icon
                return (
                  <div key={t.id} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                      style={{ background: tt.color + '20', color: tt.color }}>
                      <TtIcon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-medium text-stone-900">
                          {t.contactCompany || t.contactName}
                        </p>
                        {t.contactCompany && t.contactName && (
                          <p className="text-xs text-stone-400">{t.contactName}</p>
                        )}
                        <span className="badge text-xs" style={{ color: tt.color, background: tt.color + '15' }}>{tt.label}</span>
                      </div>
                      <p className="text-xs text-stone-400 mt-0.5">{format(parseISO(t.touch_date), 'd MMM yyyy')}</p>
                      {t.notes && <p className="text-xs text-stone-500 mt-1">{t.notes}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* ── SALES CONTACT MODAL ── */}
      {/* ══════════════════════════════════════ */}
      {showSalesContactModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowSalesContactModal(false)}>
          <div className="bg-white rounded-xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
              <h2 className="text-base font-semibold text-stone-900">{editingSalesContact ? 'Edit Contact' : 'Add Contact'}</h2>
              <button onClick={() => setShowSalesContactModal(false)} className="p-1 rounded hover:bg-stone-100 text-stone-400"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Company *</label>
                <input className="input" value={salesContactForm.company} onChange={e => setSalesContactForm({ ...salesContactForm, company: e.target.value })} placeholder="Smith Architecture" autoFocus />
              </div>
              <div>
                <label className="label">Name <span className="text-stone-300 normal-case font-normal">(optional)</span></label>
                <input className="input" value={salesContactForm.name} onChange={e => setSalesContactForm({ ...salesContactForm, name: e.target.value })} placeholder="John Smith" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Role</label>
                  <select className="input" value={salesContactForm.role_type} onChange={e => setSalesContactForm({ ...salesContactForm, role_type: e.target.value })}>
                    {ROLE_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={salesContactForm.status} onChange={e => setSalesContactForm({ ...salesContactForm, status: e.target.value })}>
                    {STATUS_TYPES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={salesContactForm.phone} onChange={e => setSalesContactForm({ ...salesContactForm, phone: e.target.value })} placeholder="+44 7700 900000" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={salesContactForm.email} onChange={e => setSalesContactForm({ ...salesContactForm, email: e.target.value })} placeholder="john@company.com" />
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input min-h-[80px]" value={salesContactForm.notes} onChange={e => setSalesContactForm({ ...salesContactForm, notes: e.target.value })} placeholder="Any notes about this contact..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-stone-200">
              <button onClick={() => setShowSalesContactModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={saveSalesContact} disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : editingSalesContact ? 'Update' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* ── LOG TOUCHPOINT MODAL ── */}
      {/* ══════════════════════════════════════ */}
      {showTouchpointModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowTouchpointModal(false)}>
          <div className="bg-white rounded-xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
              <h2 className="text-base font-semibold text-stone-900">{editingTouchpoint ? 'Edit Action' : 'Log Action'}</h2>
              <button onClick={() => setShowTouchpointModal(false)} className="p-1 rounded hover:bg-stone-100 text-stone-400"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={touchpointForm.touchpoint_type} onChange={e => setTouchpointForm({ ...touchpointForm, touchpoint_type: e.target.value })}>
                    {TOUCHPOINT_CATEGORIES.map(g => (
                      <optgroup key={g.category} label={g.category}>
                        {g.items.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label">Date</label>
                  <input type="date" className="input" value={touchpointForm.touch_date} onChange={e => setTouchpointForm({ ...touchpointForm, touch_date: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input min-h-[80px]" value={touchpointForm.notes} onChange={e => setTouchpointForm({ ...touchpointForm, notes: e.target.value })}
                  placeholder="What was discussed..." />
              </div>
              <div>
                <label className="label">Next Reminder (optional)</label>
                <input type="date" className="input" value={touchpointForm.next_reminder_date} onChange={e => setTouchpointForm({ ...touchpointForm, next_reminder_date: e.target.value })} />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-stone-200">
              <button onClick={() => setShowTouchpointModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={saveTouchpoint} disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : editingTouchpoint ? 'Update Action' : 'Log Action'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════ */}
      {/* ── PROJECT CONTACT MODAL ── */}
      {/* ══════════════════════════════════════ */}
      {showContactModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowContactModal(false)}>
          <div className="bg-white rounded-xl shadow-modal w-full max-w-lg max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-200">
              <h2 className="text-base font-semibold text-stone-900">{editingContact ? 'Edit Contact' : 'Add Contact'}</h2>
              <button onClick={() => setShowContactModal(false)} className="p-1 rounded hover:bg-stone-100 text-stone-400"><X size={18} /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="label">Name *</label>
                <input className="input" value={contactForm.name} onChange={e => setContactForm({ ...contactForm, name: e.target.value })} placeholder="John Smith" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Company</label>
                  <input className="input" value={contactForm.company} onChange={e => setContactForm({ ...contactForm, company: e.target.value })} placeholder="Smith Architecture" />
                </div>
                <div>
                  <label className="label">Type</label>
                  <select className="input" value={contactForm.contact_type} onChange={e => setContactForm({ ...contactForm, contact_type: e.target.value })}>
                    {CONTACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Phone</label>
                  <input className="input" value={contactForm.phone} onChange={e => setContactForm({ ...contactForm, phone: e.target.value })} placeholder="+44 7700 900000" />
                </div>
                <div>
                  <label className="label">Email</label>
                  <input className="input" type="email" value={contactForm.email} onChange={e => setContactForm({ ...contactForm, email: e.target.value })} placeholder="john@company.com" />
                </div>
              </div>
              <div>
                <label className="label">Linked Project</label>
                <select className="input" value={contactForm.project_id} onChange={e => setContactForm({ ...contactForm, project_id: e.target.value })}>
                  <option value="">— None —</option>
                  {projects.filter(p => p.status === 'active').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Notes</label>
                <textarea className="input min-h-[80px]" value={contactForm.notes} onChange={e => setContactForm({ ...contactForm, notes: e.target.value })} placeholder="Any notes..." />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-stone-200">
              <button onClick={() => setShowContactModal(false)} className="btn-secondary">Cancel</button>
              <button onClick={saveContact} disabled={saving} className="btn-primary">
                {saving ? 'Saving...' : editingContact ? 'Update' : 'Add Contact'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

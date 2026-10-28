'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO, startOfWeek, addDays } from 'date-fns'
import {
  Target, PhoneCall, Mail, MapPin, Building2, DoorOpen, Monitor, Users,
  Clock, Plus, X, Trash2, Beaker, ClipboardList, CheckSquare, Edit2, Download, FileText, ChevronLeft, ChevronRight
} from 'lucide-react'
import toast from 'react-hot-toast'

const TOUCHPOINT_TYPES = [
  { value: 'email',               label: 'Email',               color: '#3B82F6', icon: Mail },
  { value: 'call',                label: 'Call',                color: '#7D8C74', icon: PhoneCall },
  { value: 'sr_walk_in',          label: 'SR Walk In',          color: '#F97316', icon: DoorOpen },
  { value: 'sr_meeting',          label: 'SR Meeting',          color: '#EC4899', icon: Building2 },
  { value: 'visit',               label: 'Visit',               color: '#F59E0B', icon: MapPin },
  { value: 'online_meeting',      label: 'Online Meeting',      color: '#0EA5E9', icon: Monitor },
  { value: 'l_and_l_mtb',         label: 'L&L / MtB',           color: '#8B5CF6', icon: Users },
  { value: 'physical_touchpoint', label: 'Physical Touchpoint', color: '#DC7633', icon: MapPin },
  { value: 'quotation_request',   label: 'Quotation Request',   color: '#6366F1', icon: ClipboardList },
  { value: 'sample_request',      label: 'Sample Request',      color: '#14B8A6', icon: Beaker },
  { value: 'other',               label: 'Other',               color: '#6B7280', icon: Clock },
]

const ROLE_TYPES = [
  { value: 'end_user_client',   label: 'End User Client' },
  { value: 'architect',         label: 'Architect' },
  { value: 'interior_designer', label: 'Interior Designer' },
  { value: 'contractor',        label: 'Contractor' },
  { value: 'developer',         label: 'Developer' },
  { value: 'supplier',          label: 'Supplier' },
  { value: 'fabricator',        label: 'Fabricator' },
  { value: 'installer',         label: 'Installer' },
  { value: 'other',             label: 'Other' },
]

function getTT(value: string) {
  const v = value === 'site_visit' ? 'visit' : value
  return TOUCHPOINT_TYPES.find(t => t.value === v) || TOUCHPOINT_TYPES[TOUCHPOINT_TYPES.length - 1]
}

function TypePill({ type, count }: { type: string; count?: number }) {
  const tt = getTT(type)
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: tt.color + '18', color: tt.color }}>
      {tt.label}{count !== undefined ? ` · ${count}` : ''}
    </span>
  )
}

function Modal({ open, onClose, title, children, wide = false }: any) {
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4"
      style={{ background: 'rgba(0,0,0,0.45)' }} onClick={onClose}>
      <div className={`bg-white w-full ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'} rounded-t-2xl sm:rounded-xl max-h-[92vh] overflow-y-auto`}
        onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100 sticky top-0 bg-white z-10">
          <h3 className="text-base font-semibold text-stone-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400"><X size={16}/></button>
        </div>
        <div className="px-5 py-4 space-y-3">{children}</div>
      </div>
    </div>
  )
}

export default function MySalesPipelinePage() {
  const userIdRef = useRef<string | null>(null)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [teamUsers, setTeamUsers] = useState<any[]>([])
  const [salesContacts, setSalesContacts] = useState<any[]>([])
  const [myTasks, setMyTasks] = useState<any[]>([])
  const [newTaskText, setNewTaskText] = useState('')
  const [newTaskDate, setNewTaskDate] = useState('')
  const [addingTask, setAddingTask] = useState(false)
  const [showContactModal, setShowContactModal] = useState(false)
  const [contactForm, setContactForm] = useState({ name: '', role_type: 'end_user_client', company: '', phone: '', email: '', notes: '' })
  const [showActionModal, setShowActionModal] = useState(false)
  const [editingActionId, setEditingActionId] = useState<string | null>(null)
  const [actionForm, setActionForm] = useState({ contact_id: '', touchpoint_type: 'call', touch_date: format(new Date(), 'yyyy-MM-dd'), notes: '', next_reminder_date: '', project: '', lead_source: 'Direct Outreach', activity_status: 'Outreach' })
  const [contactSearch, setContactSearch] = useState('')
  const [contactSearchResults, setContactSearchResults] = useState<any[]>([])
  const [showSampleModal, setShowSampleModal] = useState(false)
  const [sampleForm, setSampleForm] = useState({ name: '', client: '', attention_contact: '', email: '', phone: '', address: '', requested_by: '', ready_code: '', tracking_number: '', delivery_destination: 'office' as 'office' | 'client', request_date: format(new Date(), 'yyyy-MM-dd'), expected_date: '', notes: '' })
  const [sampleLineItems, setSampleLineItems] = useState<any[]>([{ stone_type: '', dimensions: '', surface_finish: '', quantity: 1, unit: 'pc' }])
  const [showQuoteModal, setShowQuoteModal] = useState(false)
  const [quoteForm, setQuoteForm] = useState({ name: '', client: '', value: '', closing_date: '', notes: '' })
  const [expandedTypes, setExpandedTypes] = useState<Set<string>>(new Set())
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [activeTab, setActiveTab] = useState<'report' | 'export'>('report')
  const [exporting, setExporting] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [weekOffset, setWeekOffset] = useState(0)
  const [taskFilter, setTaskFilter] = useState<'week' | 'all'>('week')

  function toggleType(t: string) { setExpandedTypes(p => { const n = new Set(p); n.has(t) ? n.delete(t) : n.add(t); return n }) }
  function toggleRow(id: string) { setExpandedRows(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n }) }

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    const uid = user?.id || null
    userIdRef.current = uid
    setCurrentUserId(uid)
    const [usersRes, contactsRes, tasksRes, profileRes] = await Promise.all([
      supabase.from('users').select('id, full_name, color, role').in('role', ['admin', 'manager']),
      supabase.from('sales_contacts').select('*, touchpoints:sales_touchpoints(*)').order('name'),
      uid ? supabase.from('todo_items').select('*').eq('user_id', uid).eq('completed', false).order('created_at', { ascending: false }) : Promise.resolve({ data: [] }),
      uid ? supabase.from('users').select('role, full_access').eq('id', uid).single() : Promise.resolve({ data: null }),
    ])
    setTeamUsers(usersRes.data || [])
    setSalesContacts(contactsRes.data || [])
    setMyTasks(((tasksRes as any).data || []).map((t: any) => ({ id: t.id, title: t.text, assigned_date: t.assigned_date || null })))
    const p = (profileRes as any).data
    setIsAdmin(p?.role === 'admin' || p?.full_access === true)
    setLoading(false)
  }

  async function addTask() {
    const text = newTaskText.trim()
    const uid = userIdRef.current
    if (!text) { toast.error('Enter a task first'); return }
    if (!uid) { toast.error('Not logged in'); return }
    setAddingTask(true)
    setNewTaskText('')
    const { data, error } = await supabase.from('todo_items').insert({ text, user_id: uid, completed: false, assigned_date: newTaskDate || null }).select().single()
    setAddingTask(false)
    if (error) { toast.error('Failed: ' + error.message); setNewTaskText(text); return }
    if (data) setMyTasks(p => [{ id: data.id, title: data.text, assigned_date: data.assigned_date || null }, ...p])
    toast.success('Task added')
  }

  async function completeTask(id: string) {
    setMyTasks(p => p.filter(t => t.id !== id))
    await supabase.from('todo_items').update({ completed: true }).eq('id', id)
  }

  async function saveContact() {
    if (!contactForm.name.trim() && !contactForm.company.trim()) { toast.error('Company or name required'); return }
    const { error } = await supabase.from('sales_contacts').insert({ ...contactForm, name: contactForm.name.trim() || contactForm.company.trim(), created_by: userIdRef.current })
    if (error) { toast.error(error.message); return }
    toast.success('Contact added'); setShowContactModal(false); loadAll()
  }

  async function ensureContact(name: string): Promise<string | null> {
    const n = name.trim(); if (!n) return null
    const ex = salesContacts.find(c => (c.company || '').toLowerCase() === n.toLowerCase() || (c.name || '').toLowerCase() === n.toLowerCase())
    if (ex) return ex.id
    const { data } = await supabase.from('sales_contacts').insert({ name: n, company: n, role_type: 'other', status: 'outreach', created_by: userIdRef.current }).select().single()
    return data?.id || null
  }

  function openAddAction(contactId?: string) {
    setEditingActionId(null)
    const c = contactId ? salesContacts.find(x => x.id === contactId) : null
    setContactSearch(c?.company || c?.name || '')
    setContactSearchResults([])
    setActionForm({ contact_id: contactId || '', touchpoint_type: 'call', touch_date: format(new Date(), 'yyyy-MM-dd'), notes: '', next_reminder_date: '', project: '', lead_source: 'Direct Outreach', activity_status: 'Outreach' })
    setShowActionModal(true)
  }

  function openEditAction(t: any) {
    setEditingActionId(t.id)
    const c = salesContacts.find(x => x.id === t.contact_id)
    setContactSearch(c?.company || c?.name || '')
    setContactSearchResults([])
    setActionForm({ contact_id: t.contact_id, touchpoint_type: t.touchpoint_type, touch_date: t.touch_date || format(new Date(), 'yyyy-MM-dd'), notes: t.notes || '', next_reminder_date: t.next_reminder_date || '', project: t.project || '', lead_source: t.lead_source || 'Direct Outreach', activity_status: t.activity_status || 'Outreach' })
    setShowActionModal(true)
  }

  async function saveAction() {
    if (!contactSearch.trim()) { toast.error('Contact required'); return }
    let cid = actionForm.contact_id
    if (!cid) {
      const ex = salesContacts.find(c => (c.company || '').toLowerCase() === contactSearch.trim().toLowerCase() || (c.name || '').toLowerCase() === contactSearch.trim().toLowerCase())
      if (ex) { cid = ex.id } else {
        const { data } = await supabase.from('sales_contacts').insert({ name: contactSearch.trim(), company: contactSearch.trim(), role_type: 'other', status: 'outreach', created_by: userIdRef.current }).select().single()
        cid = data?.id
        if (cid) toast.success(`New contact "${contactSearch.trim()}" added`)
      }
    }
    const payload = { contact_id: cid, touchpoint_type: actionForm.touchpoint_type, touch_date: actionForm.touch_date, notes: actionForm.notes || null, next_reminder_date: actionForm.next_reminder_date || null, project: actionForm.project.trim() || null, lead_source: actionForm.lead_source || null, activity_status: actionForm.activity_status || null }
    const { error } = editingActionId
      ? await supabase.from('sales_touchpoints').update(payload).eq('id', editingActionId)
      : await supabase.from('sales_touchpoints').insert({ ...payload, created_by: userIdRef.current })
    if (error) { toast.error(error.message); return }
    toast.success(editingActionId ? 'Updated' : 'Action logged')
    setShowActionModal(false); setEditingActionId(null); loadAll()
  }

  async function deleteAction(id: string) {
    if (!confirm('Delete this action?')) return
    await supabase.from('sales_touchpoints').delete().eq('id', id)
    toast.success('Deleted'); loadAll()
  }

  async function saveSample() {
    if (!sampleForm.name.trim()) { toast.error('Description required'); return }
    const cid = sampleForm.client.trim() ? await ensureContact(sampleForm.client) : null
    const { data, error } = await supabase.from('sales_samples').insert({
      name: sampleForm.name.trim(), client: sampleForm.client.trim() || null, attention_contact: sampleForm.attention_contact.trim() || null,
      email: sampleForm.email.trim() || null, phone: sampleForm.phone.trim() || null, address: sampleForm.address.trim() || null,
      requested_by: sampleForm.requested_by.trim() || null, ready_code: sampleForm.ready_code.trim() || null,
      tracking_number: sampleForm.tracking_number.trim() || null, delivery_destination: sampleForm.delivery_destination,
      request_date: sampleForm.request_date || null, expected_date: sampleForm.expected_date || null, notes: sampleForm.notes || null,
      stage: 'client_requested', account_manager_id: userIdRef.current, created_by: userIdRef.current,
    }).select().single()
    if (error) { toast.error(error.message); return }
    if (cid) await supabase.from('sales_touchpoints').insert({ contact_id: cid, touchpoint_type: 'sample_request', touch_date: sampleForm.request_date || format(new Date(), 'yyyy-MM-dd'), notes: `Sample: ${sampleForm.name.trim()}`, project: sampleForm.name.trim(), created_by: userIdRef.current })
    const valid = sampleLineItems.filter(li => li.stone_type.trim())
    if (valid.length > 0 && data) await supabase.from('sample_request_items').insert(valid.map((li, i) => ({ sample_id: data.id, stone_type: li.stone_type.trim(), dimensions: li.dimensions.trim() || null, surface_finish: li.surface_finish.trim() || null, quantity: li.quantity, unit: li.unit, sort_order: i })))
    toast.success('Sample request added'); setShowSampleModal(false); loadAll()
  }

  async function saveQuote() {
    if (!quoteForm.name.trim() || !quoteForm.client.trim()) { toast.error('Name and client required'); return }
    const cid = await ensureContact(quoteForm.client)
    const { error } = await supabase.from('sales_deals').insert({ name: quoteForm.name.trim(), client: quoteForm.client.trim(), value: quoteForm.value ? Number(quoteForm.value) : null, closing_date: quoteForm.closing_date || null, notes: quoteForm.notes || null, stage: 'designer_requested', account_manager_id: userIdRef.current, created_by: userIdRef.current })
    if (error) { toast.error(error.message); return }
    if (cid) await supabase.from('sales_touchpoints').insert({ contact_id: cid, touchpoint_type: 'quotation_request', touch_date: format(new Date(), 'yyyy-MM-dd'), notes: `Quote: ${quoteForm.name.trim()}`, project: quoteForm.name.trim(), created_by: userIdRef.current })
    toast.success('Quotation request added'); setShowQuoteModal(false); loadAll()
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-[#7D8C74] border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const today2 = new Date()
  const weekStart = addDays(startOfWeek(today2, { weekStartsOn: 1 }), weekOffset * 7)
  const weekEnd = addDays(weekStart, 4)
  const isCurrentWeek = weekOffset === 0
  const myUser = teamUsers.find(u => u.id === currentUserId)
  const initials = myUser?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase() || '?'
  const myTouchpoints = salesContacts.flatMap(c =>
    (c.touchpoints || [])
      .filter((t: any) => t.created_by === currentUserId && t.touch_date && new Date(t.touch_date) >= weekStart && new Date(t.touch_date) <= addDays(weekEnd, 2))
      .map((t: any) => ({ ...t, contactName: c.name, contactCompany: c.company }))
  ).sort((a: any, b: any) => b.touch_date.localeCompare(a.touch_date))
  const byType: Record<string, any[]> = {}
  myTouchpoints.forEach(t => { const k = t.touchpoint_type || 'other'; if (!byType[k]) byType[k] = []; byType[k].push(t) })

  const doExport = async () => {
    setExporting(true)
    const allTp = salesContacts.flatMap(c => (c.touchpoints || []).map((t: any) => ({ ...t, contactData: c })))
    const inWeek = (t: any) => t.touch_date && new Date(t.touch_date) >= weekStart && new Date(t.touch_date) <= addDays(weekEnd, 2)
    const people = isAdmin ? teamUsers : teamUsers.filter(u => u.id === currentUserId)
    const scoreOf = (tps: any[]) => {
      const ct = new Set(tps.map((t: any) => t.contact_id)).size
      const qt = tps.filter((t: any) => t.touchpoint_type === 'quotation_request').length
      return Math.min(tps.length*5,40) + Math.min(ct*10,30) + Math.min(qt*10,20) + (tps.filter((t: any) => t.next_reminder_date).length > 0 ? 10 : 0)
    }
    const stats = people.map(u => {
      const tps = allTp.filter((t: any) => t.created_by === u.id && inWeek(t))
      return { user: u, tps, contacts: new Set(tps.map((t: any) => t.contact_id)).size, quotes: tps.filter((t: any) => t.touchpoint_type === 'quotation_request').length, score: scoreOf(tps) }
    }).sort((a,b) => b.score - a.score)
    const teamTps = stats.flatMap(s => s.tps)
    const active = stats.filter(s => s.tps.length > 0)
    const score = active.length > 0 ? Math.round(active.reduce((sum,s) => sum + s.score, 0) / active.length) : 0
    const sc = score >= 80 ? '#7D8C74' : score >= 50 ? '#F59E0B' : '#EF4444'
    const sl = score >= 80 ? 'Strong' : score >= 50 ? 'Moderate' : 'Needs attention'
    const prevStart = addDays(weekStart, -7), prevEnd = addDays(weekEnd, -7)
    const prevTeam = allTp.filter((t: any) => people.some(u => u.id === t.created_by) && t.touch_date && new Date(t.touch_date) >= prevStart && new Date(t.touch_date) <= prevEnd)
    const nContacts = new Set(teamTps.map((t: any) => t.contact_id)).size
    const nQuotes = teamTps.filter((t: any) => t.touchpoint_type === 'quotation_request').length

    const d30 = addDays(new Date(), -30)
    const cold = salesContacts.filter(c => {
      const tp = (c.touchpoints || []).filter((t: any) => t.created_by === currentUserId)
      if (!tp.length) return false
      const last = tp.sort((a: any, b: any) => b.touch_date?.localeCompare(a.touch_date))[0]
      return last?.touch_date && new Date(last.touch_date) < d30
    }).map(c => {
      const tp = (c.touchpoints || []).filter((t: any) => t.created_by === currentUserId)
      const last = tp.sort((a: any, b: any) => b.touch_date?.localeCompare(a.touch_date))[0]
      const days = Math.round((new Date().getTime() - new Date(last.touch_date).getTime()) / 86400000)
      return { name: c.company || c.name, type: last?.touchpoint_type?.replace(/_/g,' ') || '', date: last?.touch_date ? format(parseISO(last.touch_date), 'd MMM yyyy') : '', days }
    }).sort((a, b) => b.days - a.days).slice(0, 10)

    const personSections = stats.filter(s => s.tps.length > 0).map(s => {
      const rows = s.tps.sort((a: any,b: any) => (a.touch_date||'').localeCompare(b.touch_date||'')).map((t: any) => {
        const tt = getTT(t.touchpoint_type)
        const c = salesContacts.find(x => x.id === t.contact_id)
        return `<tr><td>${t.touch_date ? format(parseISO(t.touch_date),'EEE d MMM') : ''}</td><td style="color:${tt.color};font-weight:600">${tt.label}</td><td style="font-weight:600">${c?.company || c?.name || ''}</td><td>${t.project || ''}</td><td>${t.notes || ''}</td><td>${t.activity_status || ''}</td><td style="color:${t.next_reminder_date ? '#d97706' : 'inherit'}">${t.next_reminder_date ? format(parseISO(t.next_reminder_date),'d MMM') : ''}</td></tr>`
      }).join('')
      return `<div class="sec"><div class="st">${s.user.full_name} — ${s.tps.length} actions · ${s.contacts} contacts · ${s.quotes} quotes · ${s.score}pts</div><table><thead><tr><th>Date</th><th>Type</th><th>Contact</th><th>Project</th><th>Notes</th><th>Status</th><th>Reminder</th></tr></thead><tbody>${rows}</tbody></table></div>`
    }).join('')

    const lbRows = stats.map((s,i) => `<tr><td>${i+1}</td><td style="font-weight:600">${s.user.full_name}</td><td>${s.tps.length}</td><td>${s.contacts}</td><td>${s.quotes}</td><td style="font-weight:700">${s.score}</td></tr>`).join('')
    const cRows = cold.map(c => `<tr><td style="font-weight:600">${c.name}</td><td>${c.type}</td><td>${c.date}</td><td style="color:${c.days >= 60 ? '#dc2626' : '#d97706'};font-weight:600">${c.days}d ago</td></tr>`).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Weekly Sales Report</title><style>*{box-sizing:border-box}body{font-family:-apple-system,sans-serif;margin:0;padding:40px;color:#1c1917;font-size:13px}h1{font-size:24px;font-weight:700;margin:0 0 4px}.meta{color:#78716c;margin-bottom:28px}.sec{margin-bottom:28px}.st{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#78716c;margin-bottom:10px;padding-bottom:6px;border-bottom:2px solid #e7e5e4}.sbox{display:flex;align-items:center;gap:20px;padding:16px;background:#f5f5f4;border-radius:8px;margin-bottom:12px}.snum{font-size:44px;font-weight:800;line-height:1;color:${sc}}.slabel{font-size:15px;font-weight:700;color:${sc}}.metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px}.m{background:#f5f5f4;border-radius:6px;padding:10px}.mv{font-size:22px;font-weight:700}.ml{font-size:11px;color:#78716c;margin-top:2px}table{width:100%;border-collapse:collapse}th{padding:7px 10px;font-size:10px;font-weight:700;text-transform:uppercase;color:#78716c;text-align:left;background:#f5f5f4;border-bottom:2px solid #e7e5e4}td{padding:7px 10px;font-size:12px;border-bottom:1px solid #f5f5f4;vertical-align:top}.ft{margin-top:36px;padding-top:14px;border-top:1px solid #e7e5e4;font-size:11px;color:#a8a29e}@media print{body{padding:20px}@page{margin:20mm}}</style></head><body>
<h1>${isAdmin ? 'Team Weekly Sales Report' : 'Weekly Sales Report'}</h1><div class="meta">${format(weekStart,'d MMM')} – ${format(weekEnd,'d MMM yyyy')} &nbsp;·&nbsp; Generated ${format(new Date(),'d MMM yyyy HH:mm')}</div>
<div class="sec"><div class="st">${isAdmin ? 'Team Pipeline Health' : 'Pipeline Health'}</div><div class="sbox"><div><div class="snum">${score}</div><div style="font-size:11px;color:#78716c">out of 100</div></div><div><div class="slabel">${sl}</div><div style="font-size:12px;color:#78716c;margin-top:4px">${isAdmin ? `Average across ${active.length} active member(s)` : 'Actions · contacts · quotes · reminders'}</div></div></div><div class="metrics"><div class="m"><div class="mv">${teamTps.length}</div><div class="ml">Total actions &nbsp;(was ${prevTeam.length} last wk)</div></div><div class="m"><div class="mv">${nContacts}</div><div class="ml">Contacts reached</div></div><div class="m"><div class="mv">${nQuotes}</div><div class="ml">Quotes</div></div><div class="m"><div class="mv">${(teamTps.length/5).toFixed(1)}</div><div class="ml">Actions/day</div></div></div></div>
${isAdmin ? `<div class="sec"><div class="st">By team member</div><table><thead><tr><th>#</th><th>Name</th><th>Actions</th><th>Contacts</th><th>Quotes</th><th>Score</th></tr></thead><tbody>${lbRows}</tbody></table></div>` : ''}
${personSections || '<div class="sec"><div class="st">Actions</div><p style="color:#a8a29e">No actions logged this week.</p></div>'}
${cold.length > 0 ? `<div class="sec"><div class="st">⚠ At Risk — Going Cold (30+ days) — ${myUser?.full_name || 'yours'}</div><table><thead><tr><th>Contact</th><th>Last action</th><th>Date</th><th>Days since</th></tr></thead><tbody>${cRows}</tbody></table></div>` : ''}
<div class="ft">Keystone · Stoneline UK &nbsp;·&nbsp; ${format(new Date(),'d MMM yyyy HH:mm')}</div></body></html>`
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${isAdmin ? 'Team' : 'Sales'}-Report-${format(weekStart,'d-MMM-yyyy')}.html`; a.click()
    URL.revokeObjectURL(url)
    toast.success('Downloaded — open in browser and print to PDF')
    setExporting(false)
  }

  return (
    <div className="flex flex-col h-full bg-stone-50">

      {/* TOP BAR */}
      <div className="px-4 sm:px-6 py-3 border-b border-stone-200 bg-white flex-shrink-0">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0"
              style={{ background: myUser?.color || '#7D8C74' }}>{initials}</div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-stone-900">Weekly Report</h1>
              <div className="flex items-center gap-1 mt-0.5">
                <button onClick={() => setWeekOffset(w => w - 1)} className="p-1 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors" title="Previous week"><ChevronLeft size={14}/></button>
                <p className="text-xs text-stone-500 font-medium min-w-[120px] text-center">{format(weekStart,'d MMM')} – {format(weekEnd,'d MMM yyyy')}</p>
                <button onClick={() => setWeekOffset(w => w + 1)} className="p-1 rounded hover:bg-stone-100 text-stone-400 hover:text-stone-700 transition-colors" title="Next week"><ChevronRight size={14}/></button>
                {!isCurrentWeek && (
                  <button onClick={() => setWeekOffset(0)} className="text-[10px] font-semibold px-2 py-0.5 rounded-full ml-1 transition-colors" style={{background:'#7D8C74'+'18',color:'#7D8C74'}}>Today</button>
                )}
                <span className="mx-1 text-stone-300">·</span>
                <span className="text-xs font-medium" style={{color:'#7D8C74'}}>{myTouchpoints.length} action{myTouchpoints.length!==1?'s':''}</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={() => setShowContactModal(true)} className="flex items-center gap-1.5 text-xs font-medium text-stone-600 border border-stone-200 rounded-lg px-3 py-2 hover:bg-stone-50 bg-white transition-colors"><Users size={13}/><span className="hidden sm:inline">Contact</span></button>
            <button onClick={() => { setSampleForm(p => ({ ...p, requested_by: myUser?.full_name || '' })); setSampleLineItems([{ stone_type:'', dimensions:'', surface_finish:'', quantity:1, unit:'pc' }]); setShowSampleModal(true) }} className="flex items-center gap-1.5 text-xs font-medium text-stone-600 border border-stone-200 rounded-lg px-3 py-2 hover:bg-stone-50 bg-white transition-colors"><Beaker size={13}/><span className="hidden sm:inline">Sample</span></button>
            <button onClick={() => { setQuoteForm({ name:'', client:'', value:'', closing_date:'', notes:'' }); setShowQuoteModal(true) }} className="flex items-center gap-1.5 text-xs font-medium text-stone-600 border border-stone-200 rounded-lg px-3 py-2 hover:bg-stone-50 bg-white transition-colors"><ClipboardList size={13}/><span className="hidden sm:inline">Quote</span></button>
            <button onClick={() => openAddAction()} className="flex items-center gap-1.5 text-sm font-semibold text-white rounded-lg px-4 py-2 hover:opacity-90" style={{background:'#7D8C74'}}><Plus size={15}/>Log Action</button>
          </div>
        </div>
        {Object.keys(byType).length > 0 && (
          <div className="flex items-center gap-1.5 mt-2.5 flex-wrap">
            {Object.entries(byType).map(([type, items]) => <TypePill key={type} type={type} count={items.length}/>)}
          </div>
        )}
      </div>

      {/* TABS */}
      <div className="flex border-b border-stone-200 bg-white flex-shrink-0 px-4 sm:px-6">
        <button onClick={() => setActiveTab('report')} className={`flex items-center gap-1.5 text-sm font-medium px-1 py-2.5 border-b-2 mr-6 transition-colors ${activeTab==='report'?'border-[#7D8C74] text-[#7D8C74]':'border-transparent text-stone-400 hover:text-stone-600'}`}><FileText size={14}/>My Report</button>
        <button onClick={() => setActiveTab('export')} className={`flex items-center gap-1.5 text-sm font-medium px-1 py-2.5 border-b-2 transition-colors ${activeTab==='export'?'border-[#7D8C74] text-[#7D8C74]':'border-transparent text-stone-400 hover:text-stone-600'}`}><Download size={14}/>{isAdmin ? 'Team & Export' : 'Export'}</button>
      </div>

      {/* BODY */}
      <div className="flex-1 overflow-y-auto">

        {/* EXPORT TAB — team-wide */}
        {activeTab === 'export' && (
          <div className="px-4 sm:px-6 py-6 space-y-5 max-w-4xl mx-auto">
            <div>
              <h2 className="text-lg font-semibold text-stone-900">{isAdmin ? 'Team Weekly Report' : 'Weekly Report'}</h2>
              <p className="text-sm text-stone-400 mt-0.5">{format(weekStart,'d MMM')} – {format(weekEnd,'d MMM yyyy')}</p>
            </div>

            {(() => {
              const allTp = salesContacts.flatMap(c => (c.touchpoints || []).map((t: any) => ({ ...t, contactData: c })))
              const inWeek = (t: any) => t.touch_date && new Date(t.touch_date) >= weekStart && new Date(t.touch_date) <= addDays(weekEnd, 2)
              const scoreOf = (tps: any[]) => {
                const contacts = new Set(tps.map((t: any) => t.contact_id)).size
                const quotes = tps.filter((t: any) => t.touchpoint_type === 'quotation_request').length
                return Math.min(tps.length*5,40) + Math.min(contacts*10,30) + Math.min(quotes*10,20) + (tps.filter((t: any) => t.next_reminder_date).length > 0 ? 10 : 0)
              }
              const people = isAdmin ? teamUsers : teamUsers.filter(u => u.id === currentUserId)
              const stats = people.map(u => {
                const tps = allTp.filter((t: any) => t.created_by === u.id && inWeek(t))
                const contacts = new Set(tps.map((t: any) => t.contact_id)).size
                const quotes = tps.filter((t: any) => t.touchpoint_type === 'quotation_request').length
                return { user: u, tps, contacts, quotes, score: scoreOf(tps) }
              }).sort((a,b) => b.score - a.score)

              const teamTps = stats.flatMap(s => s.tps)
              const teamContacts = new Set(teamTps.map((t: any) => t.contact_id)).size
              const teamQuotes = teamTps.filter((t: any) => t.touchpoint_type === 'quotation_request').length
              const active = stats.filter(s => s.tps.length > 0)
              const teamScore = active.length > 0 ? Math.round(active.reduce((sum,s) => sum + s.score, 0) / active.length) : 0
              const tsc = teamScore >= 80 ? '#7D8C74' : teamScore >= 50 ? '#F59E0B' : '#EF4444'
              const tsl = teamScore >= 80 ? 'Strong' : teamScore >= 50 ? 'Moderate' : 'Needs attention'
              const prevStart = addDays(weekStart, -7), prevEnd = addDays(weekEnd, -7)
              const prevTeam = allTp.filter((t: any) => people.some(u => u.id === t.created_by) && t.touch_date && new Date(t.touch_date) >= prevStart && new Date(t.touch_date) <= prevEnd)
              const maxScore = Math.max(...stats.map(s => s.score), 1)

              return (
                <>
                  {/* Team health score */}
                  <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                    <div className="px-5 py-3.5 border-b border-stone-100 bg-stone-50 flex items-center justify-between">
                      <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{isAdmin ? 'Team Pipeline Health' : 'Pipeline Health'}</p>
                      <span className="text-xs text-stone-400">vs last week</span>
                    </div>
                    <div className="px-5 py-4 flex items-center gap-5 border-b border-stone-100">
                      <div className="relative w-20 h-20 flex-shrink-0">
                        <svg viewBox="0 0 36 36" className="w-20 h-20 -rotate-90">
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke="#f5f5f4" strokeWidth="3"/>
                          <circle cx="18" cy="18" r="15.9" fill="none" stroke={tsc} strokeWidth="3" strokeDasharray={`${teamScore} 100`} strokeLinecap="round"/>
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-xl font-bold text-stone-900">{teamScore}</span>
                          <span className="text-[9px] text-stone-400 uppercase font-semibold">/100</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-lg font-bold" style={{color:tsc}}>{tsl}</p>
                        <p className="text-xs text-stone-400 mt-1 leading-relaxed">{isAdmin ? `Average across ${active.length} active member${active.length!==1?'s':''}` : 'Actions · contacts · quotes · reminders'}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-stone-100">
                      {[
                        { label:'Total actions', value:teamTps.length, delta:`was ${prevTeam.length}` },
                        { label:'Contacts reached', value:teamContacts, delta:null },
                        { label:'Quotes', value:teamQuotes, delta:null },
                        { label:'Actions/day', value:(teamTps.length/5).toFixed(1), delta:null },
                      ].map((m,i) => (
                        <div key={i} className="px-4 py-3">
                          <p className="text-[11px] text-stone-400 font-medium">{m.label}</p>
                          <p className="text-2xl font-bold text-stone-900 mt-0.5">{m.value}</p>
                          {m.delta && <p className="text-xs text-stone-400 mt-0.5">{m.delta} last week</p>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Leaderboard */}
                  {isAdmin && (
                    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                      <div className="px-5 py-3 border-b border-stone-100 bg-stone-50">
                        <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">By team member</p>
                      </div>
                      <div className="divide-y divide-stone-50">
                        {stats.map((s, i) => {
                          const ini = s.user.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase() || '?'
                          const sc2 = s.score >= 80 ? '#7D8C74' : s.score >= 50 ? '#F59E0B' : '#9CA3AF'
                          return (
                            <div key={s.user.id} className="flex items-center gap-3 px-5 py-3">
                              <span className="text-xs font-bold text-stone-400 w-4">{i+1}</span>
                              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0" style={{background:s.user.color||'#7D8C74'}}>{ini}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-1 gap-2 flex-wrap">
                                  <p className="text-sm font-semibold text-stone-900">{s.user.full_name?.split(' ')[0]}</p>
                                  <div className="flex items-center gap-3 text-xs text-stone-500">
                                    <span>{s.tps.length} actions</span>
                                    <span>{s.contacts} contacts</span>
                                    <span className="font-bold" style={{color:sc2}}>{s.score}pts</span>
                                  </div>
                                </div>
                                <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{width:`${Math.round((s.score/maxScore)*100)}%`,background:sc2}}/>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}

                  {/* Per-person action detail */}
                  {stats.filter(s => s.tps.length > 0).map(s => {
                    const ini = s.user.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase() || '?'
                    const byT2: Record<string,any[]> = {}
                    s.tps.forEach((t: any) => { const k = t.touchpoint_type||'other'; if (!byT2[k]) byT2[k]=[]; byT2[k].push(t) })
                    return (
                      <div key={s.user.id} className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-stone-100 flex-wrap">
                          <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white flex-shrink-0" style={{background:s.user.color||'#7D8C74'}}>{ini}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-stone-900">{s.user.full_name}</p>
                            <p className="text-xs text-stone-400">{s.tps.length} actions · {s.contacts} contacts · {s.quotes} quotes</p>
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {Object.entries(byT2).map(([type, items]: [string,any]) => <TypePill key={type} type={type} count={items.length}/>)}
                          </div>
                        </div>
                        <div className="divide-y divide-stone-50">
                          {s.tps.sort((a: any, b: any) => b.touch_date?.localeCompare(a.touch_date)).map((t: any) => {
                            const tt = getTT(t.touchpoint_type)
                            const Icon = tt.icon
                            const c = salesContacts.find(x => x.id === t.contact_id)
                            return (
                              <div key={t.id} className="flex items-start gap-3 px-5 py-2.5">
                                <div className="w-8 text-center flex-shrink-0">
                                  <p className="text-[10px] font-bold text-stone-400 uppercase">{t.touch_date ? format(parseISO(t.touch_date),'EEE') : ''}</p>
                                  <p className="text-sm font-bold text-stone-600">{t.touch_date ? format(parseISO(t.touch_date),'d') : ''}</p>
                                </div>
                                <div className="w-px self-stretch bg-stone-100 flex-shrink-0"/>
                                <div className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5" style={{background:tt.color+'18'}}><Icon size={11} style={{color:tt.color}}/></div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-stone-900">{c?.company || c?.name || '—'}</p>
                                  {t.project && <p className="text-xs font-medium mt-0.5" style={{color:'#7D8C74'}}>{t.project}</p>}
                                  {t.notes && <p className="text-xs text-stone-500 mt-0.5">{t.notes}</p>}
                                </div>
                                {t.next_reminder_date && <span className="text-[10px] font-semibold bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded-full flex-shrink-0">⏰ {format(parseISO(t.next_reminder_date),'d MMM')}</span>}
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}

                  {/* Nobody logged anything */}
                  {isAdmin && stats.filter(s => s.tps.length === 0).length > 0 && (
                    <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                      <div className="px-5 py-3 border-b border-stone-100 bg-stone-50">
                        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">No activity this week</p>
                      </div>
                      <div className="flex flex-wrap gap-2 px-5 py-3">
                        {stats.filter(s => s.tps.length === 0).map(s => {
                          const ini = s.user.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase() || '?'
                          return (
                            <div key={s.user.id} className="flex items-center gap-2 bg-stone-50 border border-stone-200 rounded-lg px-3 py-1.5">
                              <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white" style={{background:s.user.color||'#9CA3AF'}}>{ini}</div>
                              <span className="text-xs text-stone-500">{s.user.full_name?.split(' ')[0]}</span>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </>
              )
            })()}

            {/* At Risk — personal only */}
            {(() => {
              const d30 = addDays(new Date(),-30)
              const cold2 = salesContacts.filter(c => {
                const tp = (c.touchpoints||[]).filter((t: any) => t.created_by === currentUserId)
                if (!tp.length) return false
                const last = tp.sort((a: any,b: any) => b.touch_date?.localeCompare(a.touch_date))[0]
                return last?.touch_date && new Date(last.touch_date) < d30
              }).map(c => {
                const tp = (c.touchpoints||[]).filter((t: any) => t.created_by === currentUserId)
                const last = tp.sort((a: any,b: any) => b.touch_date?.localeCompare(a.touch_date))[0]
                const days = Math.round((new Date().getTime() - new Date(last.touch_date).getTime()) / 86400000)
                return { ...c, last, days }
              }).sort((a,b) => b.days - a.days).slice(0,8)
              if (cold2.length === 0) return null
              return (
                <div className="bg-white border border-stone-200 rounded-xl overflow-hidden">
                  <div className="px-5 py-3.5 border-b border-amber-100 bg-amber-50 flex items-center gap-2 flex-wrap">
                    <div className="w-2 h-2 rounded-full bg-amber-400"/>
                    <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">At Risk — Going Cold</p>
                    <span className="text-[10px] text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded-full font-semibold">Yours only</span>
                    <span className="ml-auto text-xs text-amber-600">{cold2.length} contact{cold2.length!==1?'s':''} not touched in 30+ days</span>
                  </div>
                  <div className="divide-y divide-stone-50">
                    {cold2.map((c: any) => {
                      const lastDate = c.last?.touch_date ? format(parseISO(c.last.touch_date),'d MMM yyyy') : ''
                      const lastType = c.last?.touchpoint_type?.replace(/_/g,' ') || ''
                      return (
                        <div key={c.id} className="flex items-center gap-3 px-5 py-3">
                          <div className="w-8 h-8 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-xs font-bold text-amber-600 flex-shrink-0">{(c.company||c.name||'?').slice(0,2).toUpperCase()}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-stone-900 truncate">{c.company||c.name}</p>
                            <p className="text-xs text-stone-400">Last: {lastType} — {lastDate}</p>
                          </div>
                          <span className={`text-xs font-bold px-2 py-1 rounded-full ${c.days>=60?'bg-red-50 text-red-600':'bg-amber-50 text-amber-600'}`}>{c.days}d ago</span>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })()}

            <button onClick={doExport} disabled={exporting} className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white py-3.5 rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50" style={{background:'#7D8C74'}}>
              <Download size={16}/>{exporting ? 'Generating…' : isAdmin ? 'Download Team Report' : 'Download Report'}
            </button>
            <p className="text-xs text-stone-400 text-center -mt-3">Downloads as HTML — open in browser and print to PDF</p>
            <div className="h-4"/>
          </div>
        )}

        {/* MY REPORT TAB */}
        {activeTab === 'report' && (
          <div>
            {/* ACTIVITY FEED */}
            <div className="mt-3 bg-white border-y border-stone-200">
              <div className="px-4 sm:px-6 py-2.5 border-b border-stone-100 bg-stone-50">
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">This week's actions</p>
              </div>
              {myTouchpoints.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center mb-3" style={{background:'#7D8C74'+'15'}}><Target size={22} style={{color:'#7D8C74'}}/></div>
                  <p className="text-base font-medium text-stone-700 mb-1">No actions logged this week</p>
                  <p className="text-sm text-stone-400 mb-5">Log your first call, email, or visit</p>
                  <button onClick={() => openAddAction()} className="text-sm font-semibold text-white rounded-lg px-5 py-2.5 hover:opacity-90" style={{background:'#7D8C74'}}>+ Log First Action</button>
                </div>
              ) : (
                Object.entries(byType).map(([type, items]) => {
                  const tt = getTT(type); const Icon = tt.icon; const isOpen = expandedTypes.has(type)
                  return (
                    <div key={type} className="border-b border-stone-100 last:border-b-0">
                      <button onClick={() => toggleType(type)} className="w-full flex items-center gap-3 px-4 sm:px-6 py-3.5 hover:bg-stone-50 transition-colors text-left">
                        <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0" style={{background:tt.color+'15'}}><Icon size={15} style={{color:tt.color}}/></div>
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-semibold" style={{color:tt.color}}>{tt.label}</span>
                          <span className="text-xs text-stone-400 ml-2">{items.length} action{items.length!==1?'s':''}</span>
                        </div>
                        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 transition-transform" style={{transform:isOpen?'rotate(180deg)':'rotate(0deg)',color:'#d6d3d1'}}>
                          <path d="M3 6l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                      {isOpen && (
                        <div className="divide-y divide-stone-50">
                          {items.map((t: any) => {
                            const isRowOpen = expandedRows.has(t.id)
                            const hasD = t.notes || t.project || t.next_reminder_date || t.activity_status || (t.lead_source && t.lead_source !== 'Direct Outreach')
                            return (
                              <div key={t.id} className="group bg-stone-50/40">
                                <div className="flex items-center gap-3 px-4 sm:px-6 py-3 hover:bg-stone-50 transition-colors cursor-pointer" onClick={() => hasD && toggleRow(t.id)}>
                                  <div className="flex-shrink-0 w-10 text-center">
                                    <p className="text-[10px] font-bold text-stone-400 uppercase leading-none tracking-wide">{t.touch_date ? format(parseISO(t.touch_date),'EEE') : ''}</p>
                                    <p className="text-lg font-bold text-stone-600 leading-tight">{t.touch_date ? format(parseISO(t.touch_date),'d') : ''}</p>
                                  </div>
                                  <div className="w-px h-8 bg-stone-200 flex-shrink-0"/>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-stone-900 leading-tight">{t.contactCompany || t.contactName}</p>
                                    {t.contactCompany && t.contactName && t.contactCompany !== t.contactName && <p className="text-xs text-stone-400 mt-0.5">{t.contactName}</p>}
                                    {!isRowOpen && t.notes && <p className="text-xs text-stone-400 truncate mt-0.5">{t.notes}</p>}
                                  </div>
                                  <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={e => { e.stopPropagation(); openAddAction(t.contact_id) }} className="p-2 hover:bg-[#7D8C74]/10 rounded-lg" title="Log another action"><Plus size={13} style={{color:'#7D8C74'}}/></button>
                                    <button onClick={e => { e.stopPropagation(); openEditAction(t) }} className="p-2 hover:bg-stone-100 rounded-lg text-stone-400"><Edit2 size={13}/></button>
                                    <button onClick={e => { e.stopPropagation(); deleteAction(t.id) }} className="p-2 hover:bg-red-50 rounded-lg text-stone-300 hover:text-red-500"><Trash2 size={13}/></button>
                                  </div>
                                  {hasD && (
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" className="flex-shrink-0 transition-transform ml-1" style={{transform:isRowOpen?'rotate(180deg)':'rotate(0deg)',color:'#d6d3d1'}}>
                                      <path d="M2 5l5 5 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                  )}
                                </div>
                                {isRowOpen && hasD && (
                                  <div className="px-4 sm:px-6 pb-3 ml-14 space-y-2 border-t border-stone-100 pt-2.5">
                                    {t.project && <p className="text-xs font-semibold" style={{color:'#7D8C74'}}>📁 {t.project}</p>}
                                    {t.notes && <p className="text-sm text-stone-600 leading-relaxed">{t.notes}</p>}
                                    {t.next_reminder_date && <p className="text-xs text-amber-600 font-medium bg-amber-50 px-2 py-1 rounded-lg w-fit">⏰ Reminder {format(parseISO(t.next_reminder_date),'d MMM yyyy')}</p>}
                                    {(t.activity_status || (t.lead_source && t.lead_source !== 'Direct Outreach')) && (
                                      <div className="flex items-center gap-1.5 flex-wrap">
                                        {t.activity_status && <span className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-stone-600 font-medium">{t.activity_status}</span>}
                                        {t.lead_source && t.lead_source !== 'Direct Outreach' && <span className="text-xs px-2.5 py-1 rounded-full bg-stone-100 text-stone-500">{t.lead_source}</span>}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>

            {/* WEEK CALENDAR */}
            <div className="bg-white border-b border-stone-200">
              <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 border-b border-stone-100">
                <CheckSquare size={13} className="text-[#7D8C74]"/>
                <span className="text-xs font-semibold text-stone-600 uppercase tracking-wide">My Tasks</span>
                {myTasks.length > 0 && <span className="text-[10px] font-semibold bg-[#7D8C74]/15 text-[#7D8C74] rounded-full px-2 py-0.5">{myTasks.length}</span>}
              </div>
              <div className="grid grid-cols-5">
                {[0,1,2,3,4].map(i => {
                  const day = addDays(weekStart, i)
                  const ds = format(day,'yyyy-MM-dd')
                  const dt = myTasks.filter(t => t.assigned_date === ds)
                  const isTd = format(new Date(),'yyyy-MM-dd') === ds
                  return (
                    <div key={i} className={`border-r border-stone-100 last:border-r-0 ${isTd?'bg-[#7D8C74]/5':''}`}>
                      <div className={`px-2 sm:px-3 py-2 border-b border-stone-100 flex items-center justify-between ${isTd?'bg-[#7D8C74]/10':'bg-stone-50'}`}>
                        <div>
                          <p className={`text-[10px] sm:text-xs font-bold uppercase tracking-wide ${isTd?'text-[#7D8C74]':'text-stone-400'}`}>{format(day,'EEE')}</p>
                          <p className={`text-base sm:text-lg font-bold leading-tight ${isTd?'text-[#7D8C74]':'text-stone-500'}`}>{format(day,'d')}</p>
                        </div>
                        <button onClick={() => setNewTaskDate(ds)} className="w-6 h-6 rounded-full flex items-center justify-center hover:bg-[#7D8C74]/20 text-stone-300 hover:text-[#7D8C74] transition-colors"><Plus size={13}/></button>
                      </div>
                      <div className="p-1.5 sm:p-2 space-y-1 min-h-[72px]">
                        {dt.map(t => (
                          <div key={t.id} onClick={() => completeTask(t.id)} className="flex items-start gap-1.5 rounded-md hover:bg-white p-1 transition-colors cursor-pointer">
                            <div className="w-3 h-3 rounded border border-stone-300 flex-shrink-0 mt-0.5"/>
                            <p className="text-[11px] sm:text-xs text-stone-700 leading-snug flex-1 line-clamp-3">{t.title}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
              {myTasks.length === 0 && <div className="px-4 sm:px-6 py-3 border-t border-stone-100"><p className="text-sm text-stone-400">No tasks yet</p></div>}
              <div className="flex items-center gap-2 px-4 sm:px-6 py-3 border-t border-stone-200 bg-stone-50">
                <select className="text-xs border border-stone-200 rounded-lg px-2.5 py-2 text-stone-600 focus:outline-none focus:ring-1 focus:ring-[#7D8C74] bg-white flex-shrink-0" value={newTaskDate} onChange={e => setNewTaskDate(e.target.value)}>
                  <option value="">No day</option>
                  {[0,1,2,3,4].map(i => { const d = addDays(weekStart,i); return <option key={i} value={format(d,'yyyy-MM-dd')}>{format(d,'EEE d')}</option> })}
                </select>
                <input className="flex-1 text-sm border border-stone-200 rounded-lg px-3 py-2 text-stone-800 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-[#7D8C74]/30 bg-white min-w-0" placeholder="Add a task…" value={newTaskText} onChange={e => setNewTaskText(e.target.value)} onKeyDown={e => { if (e.key==='Enter') { e.preventDefault(); addTask() } }}/>
                <button onClick={addTask} disabled={addingTask} className="text-sm font-semibold text-white px-4 py-2 rounded-lg flex-shrink-0 disabled:opacity-50" style={{background:'#7D8C74'}}>{addingTask?'…':'Add'}</button>
              </div>
            </div>

            {/* ALL MY TASKS */}
            <div className="mt-3 bg-white border-y border-stone-200">
              <div className="flex items-center gap-2 px-4 sm:px-6 py-2.5 border-b border-stone-100 bg-stone-50 flex-wrap">
                <CheckSquare size={13} className="text-[#7D8C74]"/>
                <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">My Tasks</p>
                {myTasks.length > 0 && <span className="text-[10px] font-semibold bg-[#7D8C74]/15 text-[#7D8C74] rounded-full px-2 py-0.5">{myTasks.length}</span>}
                <div className="ml-auto flex items-center gap-1 bg-white border border-stone-200 rounded-lg p-0.5">
                  <button onClick={() => setTaskFilter('week')} className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${taskFilter==='week'?'text-white':'text-stone-500 hover:text-stone-700'}`} style={taskFilter==='week'?{background:'#7D8C74'}:{}}>This week</button>
                  <button onClick={() => setTaskFilter('all')} className={`text-[11px] font-medium px-2.5 py-1 rounded-md transition-colors ${taskFilter==='all'?'text-white':'text-stone-500 hover:text-stone-700'}`} style={taskFilter==='all'?{background:'#7D8C74'}:{}}>All</button>
                </div>
              </div>
              {(() => {
                const weekStartStr = format(weekStart,'yyyy-MM-dd')
                const weekEndStr = format(weekEnd,'yyyy-MM-dd')
                const visible = taskFilter === 'week'
                  ? myTasks.filter(t => !t.assigned_date || (t.assigned_date >= weekStartStr && t.assigned_date <= weekEndStr))
                  : myTasks
                if (visible.length === 0) {
                  return <p className="px-4 sm:px-6 py-4 text-sm text-stone-400">{taskFilter==='week' ? 'No tasks this week' : 'No open tasks'}</p>
                }
                const todayStr = format(new Date(),'yyyy-MM-dd')
                const overdue = visible.filter(t => t.assigned_date && t.assigned_date < todayStr)
                const scheduled = visible.filter(t => t.assigned_date && t.assigned_date >= todayStr).sort((a,b) => a.assigned_date.localeCompare(b.assigned_date))
                const unscheduled = visible.filter(t => !t.assigned_date)
                const groups = [
                  { label: 'Overdue', items: overdue, tone: 'red' },
                  { label: 'Scheduled', items: scheduled, tone: 'normal' },
                  { label: 'Unscheduled', items: unscheduled, tone: 'muted' },
                ].filter(g => g.items.length > 0)
                return (
                  <div>
                    {groups.map(g => (
                      <div key={g.label}>
                        <div className="px-4 sm:px-6 py-1.5 bg-stone-50/60 border-b border-stone-100 flex items-center gap-2">
                          {g.tone === 'red' && <div className="w-1.5 h-1.5 rounded-full bg-red-400"/>}
                          <p className={`text-[10px] font-bold uppercase tracking-wide ${g.tone==='red'?'text-red-500':'text-stone-400'}`}>{g.label}</p>
                          <span className="text-[10px] text-stone-400">{g.items.length}</span>
                        </div>
                        <div className="divide-y divide-stone-50">
                          {g.items.map(t => {
                            const isOverdue = g.tone === 'red'
                            return (
                              <div key={t.id} className={`flex items-center gap-3 px-4 sm:px-6 py-3 hover:bg-stone-50 transition-colors group ${isOverdue?'bg-red-50/30':''}`}>
                                <button onClick={() => completeTask(t.id)} className="w-4 h-4 rounded border-2 border-stone-300 flex-shrink-0 hover:border-[#7D8C74] hover:bg-[#7D8C74]/10 transition-colors"/>
                                <p className="text-sm text-stone-800 flex-1">{t.title}</p>
                                {t.assigned_date ? (
                                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${isOverdue?'bg-red-100 text-red-600':'bg-stone-100 text-stone-500'}`}>{format(parseISO(t.assigned_date),'EEE d MMM')}</span>
                                ) : (
                                  <select className="text-xs text-stone-500 bg-white border border-stone-200 rounded-lg px-2 py-1 focus:outline-none flex-shrink-0" defaultValue="" onChange={async e => { if (!e.target.value) return; await supabase.from('todo_items').update({ assigned_date: e.target.value }).eq('id', t.id); setMyTasks(p => p.map(x => x.id === t.id ? { ...x, assigned_date: e.target.value } : x)) }}>
                                    <option value="">Set day…</option>
                                    {[0,1,2,3,4].map(i => { const d = addDays(weekStart,i); return <option key={i} value={format(d,'yyyy-MM-dd')}>{format(d,'EEE d MMM')}</option> })}
                                  </select>
                                )}
                                <button onClick={() => completeTask(t.id)} className="text-xs text-stone-400 hover:text-[#7D8C74] opacity-0 group-hover:opacity-100 font-medium flex-shrink-0 transition-all">Done ✓</button>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>

            <div className="h-8"/>
          </div>
        )}
      </div>

      {/* MODALS */}
      <Modal open={showContactModal} onClose={() => setShowContactModal(false)} title="New Contact">
        <div><label className="label">Company *</label><input className="input" value={contactForm.company} onChange={e => setContactForm(p => ({ ...p, company: e.target.value }))} autoFocus placeholder="Smith Architecture"/></div>
        <div><label className="label">Name <span className="text-stone-300 text-xs font-normal normal-case">optional</span></label><input className="input" value={contactForm.name} onChange={e => setContactForm(p => ({ ...p, name: e.target.value }))} placeholder="John Smith"/></div>
        <div><label className="label">Role</label><select className="input" value={contactForm.role_type} onChange={e => setContactForm(p => ({ ...p, role_type: e.target.value }))}>{ROLE_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}</select></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Phone</label><input className="input" value={contactForm.phone} onChange={e => setContactForm(p => ({ ...p, phone: e.target.value }))}/></div>
          <div><label className="label">Email</label><input className="input" value={contactForm.email} onChange={e => setContactForm(p => ({ ...p, email: e.target.value }))}/></div>
        </div>
        <div><label className="label">Notes</label><textarea className="input min-h-16 resize-none" value={contactForm.notes} onChange={e => setContactForm(p => ({ ...p, notes: e.target.value }))}/></div>
        <div className="flex gap-2 pt-2"><button onClick={saveContact} className="btn-primary flex-1">Add Contact</button><button onClick={() => setShowContactModal(false)} className="btn-secondary">Cancel</button></div>
      </Modal>

      <Modal open={showActionModal} onClose={() => { setShowActionModal(false); setEditingActionId(null) }} title={editingActionId ? 'Edit Action' : 'Log Action'}>
        <div>
          <label className="label">Company / Contact</label>
          <div className="relative">
            <input className="input" placeholder="Type company name…" value={contactSearch} onChange={e => { setContactSearch(e.target.value); setActionForm(p => ({ ...p, contact_id: '' })); const q = e.target.value.toLowerCase(); if (q.length < 1) { setContactSearchResults([]); return }; setContactSearchResults(salesContacts.filter(c => (c.company||'').toLowerCase().includes(q)||(c.name||'').toLowerCase().includes(q)).slice(0,6)) }}/>
            {contactSearchResults.length > 0 && (
              <div className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg max-h-44 overflow-y-auto">
                {contactSearchResults.map(c => (
                  <button key={c.id} type="button" className="w-full text-left px-3 py-2.5 hover:bg-stone-50 border-b border-stone-50 last:border-0" onClick={() => { setActionForm(p => ({ ...p, contact_id: c.id })); setContactSearch(c.company||c.name); setContactSearchResults([]) }}>
                    <p className="text-sm font-medium text-stone-900">{c.company||c.name}</p>
                    {c.company && c.name && <p className="text-xs text-stone-400">{c.name}</p>}
                  </button>
                ))}
              </div>
            )}
            {contactSearch && contactSearchResults.length === 0 && !actionForm.contact_id && <p className="text-xs text-[#7D8C74] mt-1">✦ New contact will be created</p>}
            {actionForm.contact_id && <p className="text-xs text-stone-400 mt-1">✓ Linked to existing contact</p>}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Action Type</label><select className="input" value={actionForm.touchpoint_type} onChange={e => setActionForm(p => ({ ...p, touchpoint_type: e.target.value }))}>{TOUCHPOINT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}</select></div>
          <div><label className="label">Date</label><input type="date" className="input" value={actionForm.touch_date} onChange={e => setActionForm(p => ({ ...p, touch_date: e.target.value }))}/></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Project</label><input className="input" placeholder="Project name" value={actionForm.project} onChange={e => setActionForm(p => ({ ...p, project: e.target.value }))}/></div>
          <div><label className="label">Lead Source</label><select className="input" value={actionForm.lead_source} onChange={e => setActionForm(p => ({ ...p, lead_source: e.target.value }))}>{['Direct Outreach','Existing Contact','SR Walk In','SR Meeting','Referral','Inbound'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        </div>
        <div><label className="label">Status</label><select className="input" value={actionForm.activity_status} onChange={e => setActionForm(p => ({ ...p, activity_status: e.target.value }))}>{['New Project','Outreach','In Progress Project Update','Other'].map(s => <option key={s} value={s}>{s}</option>)}</select></div>
        <div><label className="label">Notes</label><textarea className="input min-h-20 resize-none" value={actionForm.notes} onChange={e => setActionForm(p => ({ ...p, notes: e.target.value }))}/></div>
        <div><label className="label">Next Reminder <span className="text-stone-300 text-xs font-normal normal-case">optional</span></label><input type="date" className="input" value={actionForm.next_reminder_date} onChange={e => setActionForm(p => ({ ...p, next_reminder_date: e.target.value }))}/></div>
        <div className="flex gap-2 pt-2"><button onClick={saveAction} className="btn-primary flex-1">{editingActionId?'Save Changes':'Log Action'}</button><button onClick={() => { setShowActionModal(false); setEditingActionId(null) }} className="btn-secondary">Cancel</button></div>
      </Modal>

      <Modal open={showSampleModal} onClose={() => setShowSampleModal(false)} title="New Sample Request" wide>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Description *</label><input className="input" value={sampleForm.name} onChange={e => setSampleForm(p => ({ ...p, name: e.target.value }))}/></div>
          <div><label className="label">Request Date</label><input type="date" className="input" value={sampleForm.request_date} onChange={e => setSampleForm(p => ({ ...p, request_date: e.target.value }))}/></div>
        </div>
        <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide pt-1">Client Details</p>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Client</label><input className="input" value={sampleForm.client} onChange={e => setSampleForm(p => ({ ...p, client: e.target.value }))}/></div>
          <div><label className="label">Attention</label><input className="input" value={sampleForm.attention_contact} onChange={e => setSampleForm(p => ({ ...p, attention_contact: e.target.value }))}/></div>
          <div><label className="label">Email</label><input className="input" value={sampleForm.email} onChange={e => setSampleForm(p => ({ ...p, email: e.target.value }))}/></div>
          <div><label className="label">Phone</label><input className="input" value={sampleForm.phone} onChange={e => setSampleForm(p => ({ ...p, phone: e.target.value }))}/></div>
          <div className="col-span-2"><label className="label">Address</label><input className="input" value={sampleForm.address} onChange={e => setSampleForm(p => ({ ...p, address: e.target.value }))}/></div>
          <div><label className="label">Requested By</label><select className="input" value={sampleForm.requested_by} onChange={e => setSampleForm(p => ({ ...p, requested_by: e.target.value }))}><option value="">Select…</option>{teamUsers.map(u => <option key={u.id} value={u.full_name}>{u.full_name}</option>)}</select></div>
          <div><label className="label">Expected Date</label><input type="date" className="input" value={sampleForm.expected_date} onChange={e => setSampleForm(p => ({ ...p, expected_date: e.target.value }))}/></div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Stones</p>
          <button onClick={() => setSampleLineItems(p => [...p, { stone_type:'', dimensions:'', surface_finish:'', quantity:1, unit:'pc' }])} className="text-xs text-[#7D8C74] hover:underline flex items-center gap-1"><Plus size={11}/>Add line</button>
        </div>
        {sampleLineItems.map((li, i) => (
          <div key={i} className="grid grid-cols-12 gap-1.5 items-center">
            <input className="input text-xs col-span-4" placeholder="Stone type" value={li.stone_type} onChange={e => setSampleLineItems(p => p.map((x,j) => j===i?{...x,stone_type:e.target.value}:x))}/>
            <input className="input text-xs col-span-3" placeholder="Dimensions" value={li.dimensions} onChange={e => setSampleLineItems(p => p.map((x,j) => j===i?{...x,dimensions:e.target.value}:x))}/>
            <input className="input text-xs col-span-2" placeholder="Finish" value={li.surface_finish} onChange={e => setSampleLineItems(p => p.map((x,j) => j===i?{...x,surface_finish:e.target.value}:x))}/>
            <input type="number" className="input text-xs col-span-1" value={li.quantity} onChange={e => setSampleLineItems(p => p.map((x,j) => j===i?{...x,quantity:Number(e.target.value)}:x))}/>
            <select className="input text-xs col-span-1" value={li.unit} onChange={e => setSampleLineItems(p => p.map((x,j) => j===i?{...x,unit:e.target.value}:x))}><option value="pc">pc</option><option value="box">box</option><option value="set">set</option></select>
            <button onClick={() => setSampleLineItems(p => p.filter((_,j) => j!==i))} className="col-span-1 text-stone-300 hover:text-red-500 flex justify-center"><Trash2 size={13}/></button>
          </div>
        ))}
        <div><label className="label">Notes</label><textarea className="input min-h-12 resize-none" value={sampleForm.notes} onChange={e => setSampleForm(p => ({ ...p, notes: e.target.value }))}/></div>
        <div className="flex gap-2 pt-2"><button onClick={saveSample} className="btn-primary flex-1">Add Sample Request</button><button onClick={() => setShowSampleModal(false)} className="btn-secondary">Cancel</button></div>
      </Modal>

      <Modal open={showQuoteModal} onClose={() => setShowQuoteModal(false)} title="New Quotation Request">
        <div><label className="label">Deal name *</label><input className="input" value={quoteForm.name} onChange={e => setQuoteForm(p => ({ ...p, name: e.target.value }))} autoFocus/></div>
        <div><label className="label">Client *</label><input className="input" value={quoteForm.client} onChange={e => setQuoteForm(p => ({ ...p, client: e.target.value }))}/></div>
        <div className="grid grid-cols-2 gap-3">
          <div><label className="label">Value (£)</label><input type="number" className="input" value={quoteForm.value} onChange={e => setQuoteForm(p => ({ ...p, value: e.target.value }))}/></div>
          <div><label className="label">Closing date</label><input type="date" className="input" value={quoteForm.closing_date} onChange={e => setQuoteForm(p => ({ ...p, closing_date: e.target.value }))}/></div>
        </div>
        <div><label className="label">Notes</label><textarea className="input min-h-14 resize-none" value={quoteForm.notes} onChange={e => setQuoteForm(p => ({ ...p, notes: e.target.value }))}/></div>
        <p className="text-xs text-stone-400">Starts at "Designer Requested" — move it in Sales → Quotes.</p>
        <div className="flex gap-2 pt-2"><button onClick={saveQuote} className="btn-primary flex-1">Add Quotation Request</button><button onClick={() => setShowQuoteModal(false)} className="btn-secondary">Cancel</button></div>
      </Modal>

    </div>
  )
}

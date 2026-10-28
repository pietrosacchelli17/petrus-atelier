'use client'
import { useEffect, useState, useMemo, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import {
  format, startOfMonth, endOfMonth, startOfWeek, endOfWeek,
  addDays, addMonths, subMonths, isSameMonth, isToday, parseISO, isSameDay
} from 'date-fns'
import {
  ChevronLeft, ChevronRight, Plus, X, Repeat, Bell,
  Users, Tag, FileText, CheckSquare, Paperclip, Trash2, Upload, Check
} from 'lucide-react'
import toast from 'react-hot-toast'
import { useLanguage } from '@/lib/LanguageContext'
import { TranslationKey } from '@/lib/translations'

const STAGE_COLOURS: Record<string, string> = {
  quotation: '#9A7B4F',
  material_approval: '#D97706',
  templating: '#3B82F6',
  drawings_submission: '#6366F1',
  drawings_approval: '#8B5CF6',
  fabrication: '#F97316',
  shipping: '#14B8A6',
  delivery: '#06B6D4',
  installation: '#7D8C74',
  snagging: '#EF4444',
  handover: '#463E36',
}

const LABEL_CONFIG: Record<string, { labelKey: TranslationKey; color: string; bg: string }> = {
  none:        { labelKey: 'cal_label_none',        color: '#78716C', bg: '#F5F5F4' },
  urgent:      { labelKey: 'cal_label_urgent',      color: '#EF4444', bg: '#FEF2F2' },
  internal:    { labelKey: 'cal_label_internal',    color: '#3B82F6', bg: '#EFF6FF' },
  client:      { labelKey: 'cal_label_client',      color: '#8B5CF6', bg: '#F5F3FF' },
  site:        { labelKey: 'cal_label_site',        color: '#F59E0B', bg: '#FFFBEB' },
  fabrication: { labelKey: 'cal_label_fabrication', color: '#7D8C74', bg: '#F0F2EE' },
}

const REPEAT_OPTIONS: { value: string; labelKey: TranslationKey }[] = [
  { value: 'none',    labelKey: 'cal_repeat_none' },
  { value: 'daily',   labelKey: 'cal_repeat_daily' },
  { value: 'weekly',  labelKey: 'cal_repeat_weekly' },
  { value: 'monthly', labelKey: 'cal_repeat_monthly' },
]

const REMIND_OPTIONS: { value: string; labelKey: TranslationKey }[] = [
  { value: 'none',  labelKey: 'cal_remind_none' },
  { value: '15min', labelKey: 'cal_remind_15min' },
  { value: '1hour', labelKey: 'cal_remind_1hour' },
  { value: '1day',  labelKey: 'cal_remind_1day' },
  { value: '2days', labelKey: 'cal_remind_2days' },
]

const TYPE_OPTIONS: { value: string; labelKey: TranslationKey }[] = [
  { value: 'event',   labelKey: 'cal_type_event' },
  { value: 'memo',    labelKey: 'cal_type_memo' },
  { value: 'all_day', labelKey: 'cal_type_all_day' },
]

interface TodoItem { id: string; text: string; done: boolean }
interface CalendarEvent {
  id: string; title: string; type: string; start_date: string; end_date?: string
  all_day: boolean; repeat: string; remind: string; label: string; note?: string
  todo_list: TodoItem[]; file_urls: { name: string; url: string }[]
  project_id?: string; member_ids: string[]; created_by_id: string
}
interface MilestoneEvent {
  id: string; date: string; label: string; sublabel: string
  color: string; projectId: string; pm?: string; pmId?: string
}

const DEFAULT_FORM = (dateStr: string) => ({
  title: '',
  type: 'event',
  start_date: `${dateStr}T09:00`,
  end_date: `${dateStr}T10:00`,
  all_day: false,
  repeat: 'none',
  remind: 'none',
  label: 'none',
  note: '',
  project_id: '',
  member_ids: [] as string[],
  todo_list: [] as TodoItem[],
  file_urls: [] as { name: string; url: string }[],
})

export default function CalendarPage() {
  const { t } = useLanguage()
  const [currentDate, setCurrentDate] = useState(new Date())
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('month')
  const [milestoneEvents, setMilestoneEvents] = useState<MilestoneEvent[]>([])
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [filterPM, setFilterPM] = useState('all')
  const [loading, setLoading] = useState(true)

  // Modal state
  const [showModal, setShowModal] = useState(false)
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null)
  const [form, setForm] = useState(DEFAULT_FORM(format(new Date(), 'yyyy-MM-dd')))
  const [newTodo, setNewTodo] = useState('')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { loadData() }, [])

  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()

    const [projectsRes, usersRes, calEventsRes, profileRes] = await Promise.all([
      supabase.from('projects')
        .select('id, name, client, project_manager_id, project_manager:users!project_manager_id(id, full_name, color), milestones:project_milestones(*)')
        .neq('status', 'complete'),
      supabase.from('users').select('id, full_name, color, role').in('role', ['admin', 'manager']).order('full_name'),
      supabase.from('calendar_events').select('*').order('start_date'),
      user ? supabase.from('users').select('*').eq('id', user.id).single() : Promise.resolve({ data: null }),
    ])

    setUsers(usersRes.data || [])
    setProjects(projectsRes.data?.map(p => ({ id: p.id, name: p.name })) || [])
    setCurrentUser((profileRes as any).data)
    setCalendarEvents(calEventsRes.data || [])

    const allMilestones: MilestoneEvent[] = []
    for (const project of (projectsRes.data || [])) {
      for (const ms of (project.milestones || [])) {
        if (!ms.planned_date) continue
        const color = STAGE_COLOURS[ms.stage] || '#9A8E7F'
        const stageLabel = ms.stage.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        allMilestones.push({
          id: `${project.id}-${ms.stage}`,
          date: ms.planned_date,
          label: project.name,
          sublabel: stageLabel,
          color,
          projectId: project.id,
          pm: (project.project_manager as any)?.full_name,
          pmId: project.project_manager_id,
        })
        if (ms.end_date && ms.end_date !== ms.planned_date) {
          allMilestones.push({
            id: `${project.id}-${ms.stage}-end`,
            date: ms.end_date,
            label: project.name,
            sublabel: `${stageLabel} (end)`,
            color,
            projectId: project.id,
            pm: (project.project_manager as any)?.full_name,
            pmId: project.project_manager_id,
          })
        }
      }
    }
    setMilestoneEvents(allMilestones.sort((a, b) => a.date.localeCompare(b.date)))
    setLoading(false)
  }

  const filteredMilestones = useMemo(() =>
    filterPM === 'all' ? milestoneEvents : milestoneEvents.filter(e => e.pmId === filterPM),
    [milestoneEvents, filterPM]
  )

  // Month grid
  const monthStart = startOfMonth(currentDate)
  const monthEnd = endOfMonth(currentDate)
  const calStart = startOfWeek(monthStart, { weekStartsOn: 1 })
  const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 })
  const days: Date[] = []
  let d = calStart
  while (d <= calEnd) { days.push(d); d = addDays(d, 1) }

  // Week view range — Monday to Sunday containing currentDate
  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 })
  const weekDays: Date[] = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))

  function navigate(dir: 1 | -1) {
    if (viewMode === 'month') setCurrentDate(dir === 1 ? addMonths(currentDate, 1) : subMonths(currentDate, 1))
    else if (viewMode === 'week') setCurrentDate(addDays(currentDate, dir * 7))
    else setCurrentDate(addDays(currentDate, dir))
  }

  function milestonesOnDay(day: Date) {
    return filteredMilestones.filter(e => isSameDay(parseISO(e.date), day))
  }

  function calEventsOnDay(day: Date) {
    return calendarEvents.filter(e => isSameDay(parseISO(e.start_date), day))
  }

  // Modal helpers
  function openCreate(date?: Date) {
    const dateStr = format(date || new Date(), 'yyyy-MM-dd')
    setEditingEvent(null)
    setForm(DEFAULT_FORM(dateStr))
    setNewTodo('')
    setShowModal(true)
  }

  function openEdit(ev: CalendarEvent) {
    setEditingEvent(ev)
    setForm({
      title: ev.title,
      type: ev.type,
      start_date: ev.start_date?.slice(0, 16) || '',
      end_date: ev.end_date?.slice(0, 16) || '',
      all_day: ev.all_day,
      repeat: ev.repeat,
      remind: ev.remind,
      label: ev.label,
      note: ev.note || '',
      project_id: ev.project_id || '',
      member_ids: ev.member_ids || [],
      todo_list: ev.todo_list || [],
      file_urls: ev.file_urls || [],
    })
    setShowModal(true)
  }

  async function saveEvent() {
    if (!form.title.trim()) { toast.error(t('cal_toast_title_required')); return }
    if (!currentUser) { toast.error(t('cal_toast_not_authenticated')); return }

    const isAllDay = form.all_day || form.type === 'all_day'
    const payload = {
      title: form.title.trim(),
      type: form.type,
      start_date: isAllDay ? form.start_date.slice(0, 10) + 'T00:00:00' : form.start_date,
      end_date: isAllDay ? form.start_date.slice(0, 10) + 'T23:59:00' : form.end_date,
      all_day: isAllDay,
      repeat: form.repeat,
      remind: form.remind,
      label: form.label,
      note: form.note || null,
      project_id: form.project_id || null,
      member_ids: form.member_ids,
      todo_list: form.todo_list,
      file_urls: form.file_urls,
      created_by_id: currentUser.id,
    }

    if (editingEvent) {
      const { error } = await supabase.from('calendar_events').update(payload).eq('id', editingEvent.id)
      if (error) { toast.error(t('cal_toast_update_failed')); return }
      toast.success(t('cal_toast_updated'))
    } else {
      const { error } = await supabase.from('calendar_events').insert(payload)
      if (error) { toast.error(t('cal_toast_create_failed')); return }
      toast.success(t('cal_toast_created'))
    }
    setShowModal(false)
    loadData()
  }

  async function deleteEvent(id: string) {
    await supabase.from('calendar_events').delete().eq('id', id)
    toast.success(t('cal_toast_deleted'))
    setShowModal(false)
    loadData()
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const path = `${Date.now()}-${file.name}`
    const { error } = await supabase.storage.from('calendar-files').upload(path, file)
    if (error) { toast.error(t('cal_toast_upload_failed')); setUploading(false); return }
    const { data } = supabase.storage.from('calendar-files').getPublicUrl(path)
    setForm(f => ({ ...f, file_urls: [...f.file_urls, { name: file.name, url: data.publicUrl }] }))
    setUploading(false)
    toast.success(t('cal_toast_file_attached'))
  }

  function addTodo() {
    if (!newTodo.trim()) return
    setForm(f => ({ ...f, todo_list: [...f.todo_list, { id: crypto.randomUUID(), text: newTodo.trim(), done: false }] }))
    setNewTodo('')
  }

  function toggleTodo(id: string) {
    setForm(f => ({ ...f, todo_list: f.todo_list.map(t => t.id === id ? { ...t, done: !t.done } : t) }))
  }

  function removeTodo(id: string) {
    setForm(f => ({ ...f, todo_list: f.todo_list.filter(t => t.id !== id) }))
  }

  function toggleMember(id: string) {
    setForm(f => ({
      ...f,
      member_ids: f.member_ids.includes(id) ? f.member_ids.filter(m => m !== id) : [...f.member_ids, id]
    }))
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="p-3 md:p-5 h-full flex flex-col">

      {/* Header — a simple stack of rows on mobile (nav, then view switcher,
          then filters), collapsing into one row on desktop. Kept deliberately
          plain: no more than one control competing for attention per row. */}
      <div className="mb-3 md:mb-4 space-y-2 md:space-y-0">
        <div className="flex items-center justify-between md:justify-start gap-2 md:gap-3 flex-wrap">
          <div className="flex items-center gap-1">
            <button onClick={() => navigate(-1)} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors">
              <ChevronLeft size={18} className="text-stone-500"/>
            </button>
            <h1 className="text-base md:text-xl font-semibold text-stone-900 min-w-[110px] md:min-w-[190px] text-center">
              {viewMode === 'month' ? format(currentDate, 'MMMM yyyy')
                : viewMode === 'week' ? (isSameMonth(weekStart, weekDays[6]) ? `${format(weekStart, 'd')} – ${format(weekDays[6], 'd MMM yyyy')}` : `${format(weekStart, 'd MMM')} – ${format(weekDays[6], 'd MMM yyyy')}`)
                : format(currentDate, 'EEE d MMM yyyy')}
            </h1>
            <button onClick={() => navigate(1)} className="p-1.5 hover:bg-stone-100 rounded-lg transition-colors">
              <ChevronRight size={18} className="text-stone-500"/>
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setCurrentDate(new Date())} className="text-xs text-stone-500 hover:text-stone-700 border border-stone-200 rounded-lg px-2.5 py-1.5 transition-colors">
              {t('cal_today')}
            </button>
            <button onClick={() => openCreate()} className="btn-primary flex items-center gap-1.5 text-xs md:text-sm py-1.5 px-2.5 md:px-4">
              <Plus size={14}/> <span className="hidden sm:inline">{t('cal_create_event')}</span>
            </button>
          </div>
        </div>

        {/* Day / Week / Month switcher — full width and evenly split on
            mobile so it reads like a single clear control, like Google
            Calendar's own view toggle. */}
        <div className="flex items-stretch border border-stone-200 rounded-lg bg-white overflow-hidden md:inline-flex md:w-auto">
          {([['day', 'cal_view_day'], ['week', 'cal_view_week'], ['month', 'cal_view_month']] as const).map(([v, key]) => (
            <button key={v} onClick={() => setViewMode(v)}
              className={`flex-1 md:flex-none px-3 py-1.5 text-xs font-medium transition-colors ${viewMode === v ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-50'}`}>
              {t(key)}
            </button>
          ))}
        </div>

        {/* PM filter — its own scrollable row so it never competes with the
            controls above for space */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1" style={{ WebkitOverflowScrolling: 'touch' }}>
          <button
            onClick={() => setFilterPM('all')}
            className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex-shrink-0 ${filterPM === 'all' ? 'bg-stone-800 text-white border-stone-800' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}>
            {t('cal_filter_all')}
          </button>
          {users.map(u => (
            <button key={u.id} onClick={() => setFilterPM(filterPM === u.id ? 'all' : u.id)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1.5 flex-shrink-0 ${filterPM === u.id ? 'text-white border-transparent' : 'bg-white border-stone-200 text-stone-500 hover:border-stone-300'}`}
              style={filterPM === u.id ? { background: u.color || '#7D8C74' } : {}}>
              <div className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ background: u.color || '#7D8C74' }}/>
              {u.full_name?.split(' ')[0]}
            </button>
          ))}
        </div>
      </div>

      {/* Mobile: a real grid showing every day of the month, like Google
          Calendar's mobile view — tap any day to see its full details. */}
      {viewMode === 'month' && (
      <div className="md:hidden flex-1 flex flex-col overflow-hidden">
        <div className="grid grid-cols-7 mb-1 flex-shrink-0">
          {(['cal_day_mon_short', 'cal_day_tue_short', 'cal_day_wed_short', 'cal_day_thu_short', 'cal_day_fri_short', 'cal_day_sat_short', 'cal_day_sun_short'] as const).map((key, i) => (
            <div key={i} className="text-[11px] font-medium text-stone-400 text-center py-1">{t(key)}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 flex-1 border-l border-t border-stone-100 overflow-y-auto">
          {days.map((day, i) => {
            const dayMilestones = milestonesOnDay(day)
            const dayCalEvents = calEventsOnDay(day)
            const inMonth = isSameMonth(day, currentDate)
            const today = isToday(day)
            const dots = [
              ...dayCalEvents.map(ev => (LABEL_CONFIG[ev.label] || LABEL_CONFIG.none).color),
              ...dayMilestones.map(ev => ev.color),
            ].slice(0, 4)
            return (
              <button key={i}
                onClick={() => { setCurrentDate(day); setViewMode('day') }}
                className={`flex flex-col items-center justify-start gap-1 border-r border-b border-stone-100 py-1.5 min-h-[52px] ${!inMonth ? 'bg-stone-50/50' : 'bg-white active:bg-stone-50'}`}>
                <span className={`w-6 h-6 flex items-center justify-center text-xs font-medium rounded-full flex-shrink-0
                  ${today ? 'bg-brand-600 text-white' : !inMonth ? 'text-stone-300' : 'text-stone-700'}`}>
                  {format(day, 'd')}
                </span>
                {dots.length > 0 && (
                  <div className="flex items-center gap-0.5 flex-wrap justify-center px-0.5">
                    {dots.map((c, di) => <span key={di} className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: c }}/>)}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
      )}

      {/* Day headers — desktop month grid only */}
      {viewMode === 'month' && (
      <div className="hidden md:grid grid-cols-7 mb-1">
        {(['cal_day_mon', 'cal_day_tue', 'cal_day_wed', 'cal_day_thu', 'cal_day_fri', 'cal_day_sat', 'cal_day_sun'] as const).map(key => (
          <div key={key} className="text-xs font-medium text-stone-400 text-center py-1">{t(key)}</div>
        ))}
      </div>
      )}

      {/* Calendar grid — desktop month view only */}
      {viewMode === 'month' && (
      <div className="hidden md:grid grid-cols-7 flex-1 border-l border-t border-stone-100 overflow-auto">
        {days.map((day, i) => {
          const dayMilestones = milestonesOnDay(day)
          const dayCalEvents = calEventsOnDay(day)
          const inMonth = isSameMonth(day, currentDate)
          const today = isToday(day)
          const totalCount = dayMilestones.length + dayCalEvents.length
          const shownMilestones = dayMilestones.slice(0, Math.max(0, 5 - dayCalEvents.length))
          const shownCalEvents = dayCalEvents.slice(0, 5)
          const shown = shownCalEvents.length + shownMilestones.length
          const overflow = totalCount - shown

          return (
            <div key={i}
              className={`group relative border-r border-b border-stone-100 min-h-[85px] p-1 ${!inMonth ? 'bg-stone-50/50' : 'bg-white'}`}>
              {/* Day number — click to see the full day's details */}
              <div className="flex items-center justify-between mb-1">
                <button
                  onClick={() => { setCurrentDate(day); setViewMode('day') }}
                  title={t('cal_tooltip_view_day')}
                  className={`w-7 h-7 flex items-center justify-center text-xs font-medium rounded-full cursor-pointer transition-colors
                    ${today ? 'bg-[#7D8C74] text-white' : !inMonth ? 'text-stone-300 hover:bg-stone-100' : 'text-stone-700 hover:bg-stone-100'}`}>
                  {format(day, 'd')}
                </button>
                <button
                  onClick={() => openCreate(day)}
                  title={t('cal_tooltip_add_event')}
                  className="w-5 h-5 rounded flex items-center justify-center text-stone-300 hover:text-stone-600 hover:bg-stone-100 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  <Plus size={12}/>
                </button>
              </div>
              <div className="space-y-px">
                {/* Custom calendar events — shown first. Google Calendar
                    style: a small dot + plain text, no filled box. */}
                {shownCalEvents.map(ev => {
                  const lc = LABEL_CONFIG[ev.label] || LABEL_CONFIG.none
                  return (
                    <div key={ev.id}
                      onClick={() => openEdit(ev)}
                      className="flex items-center gap-1 text-[11px] px-1 py-px rounded truncate leading-tight cursor-pointer hover:bg-stone-100 transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: lc.color }}/>
                      {!ev.all_day && <span className="text-stone-400 flex-shrink-0">{format(parseISO(ev.start_date), 'HH:mm')}</span>}
                      <span className="text-stone-700 truncate">{ev.title}</span>
                    </div>
                  )
                })}
                {/* Milestone events */}
                {shownMilestones.map(ev => (
                  <Link key={ev.id} href={`/projects/${ev.projectId}`}
                    className="flex items-center gap-1 text-[11px] px-1 py-px rounded truncate leading-tight cursor-pointer hover:bg-stone-100 transition-colors">
                    <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ev.color }}/>
                    <span className="text-stone-700 truncate">{ev.label}</span>
                  </Link>
                ))}
                {overflow > 0 && (
                  <button onClick={() => { setCurrentDate(day); setViewMode('day') }}
                    className="text-xs text-stone-400 hover:text-stone-600 px-1 hover:underline">+{overflow} {t('cal_more')}</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
      )}

      {/* Week view — one card per day, stacked on mobile, side by side on desktop */}
      {viewMode === 'week' && (
        <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-7 gap-2 items-start">
          {weekDays.map((day, i) => {
            const dayMilestones = milestonesOnDay(day)
            const dayCalEvents = calEventsOnDay(day)
            const today = isToday(day)
            return (
              <div key={i} className="card overflow-hidden">
                <button onClick={() => { setCurrentDate(day); setViewMode('day') }}
                  className={`w-full flex items-center gap-2 px-3 py-2 border-b border-stone-100 hover:opacity-80 transition-opacity ${today ? 'bg-brand-50' : 'bg-stone-50'}`}>
                  <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0 ${today ? 'bg-brand-600 text-white' : 'text-stone-700'}`}>
                    {format(day, 'd')}
                  </span>
                  <span className="text-xs font-medium text-stone-600">{format(day, 'EEE')}</span>
                </button>
                <div className="p-1.5 space-y-px min-h-[60px]">
                  {dayCalEvents.length === 0 && dayMilestones.length === 0 && (
                    <p className="text-[11px] text-stone-300 text-center py-2">—</p>
                  )}
                  {dayCalEvents.map(ev => {
                    const lc = LABEL_CONFIG[ev.label] || LABEL_CONFIG.none
                    return (
                      <button key={ev.id} onClick={() => openEdit(ev)}
                        className="w-full flex items-center gap-1 text-left text-[11px] px-1 py-px rounded truncate hover:bg-stone-100 transition-colors">
                        <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: lc.color }}/>
                        {!ev.all_day && <span className="text-stone-400 flex-shrink-0">{format(parseISO(ev.start_date), 'HH:mm')}</span>}
                        <span className="text-stone-700 truncate">{ev.title}</span>
                      </button>
                    )
                  })}
                  {dayMilestones.map(ev => (
                    <Link key={ev.id} href={`/projects/${ev.projectId}`}
                      className="flex items-center gap-1 text-[11px] px-1 py-px rounded truncate hover:bg-stone-100 transition-colors">
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: ev.color }}/>
                      <span className="text-stone-700 truncate">{ev.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Day view — everything on one day, sorted by time */}
      {viewMode === 'day' && (() => {
        const dayMilestones = milestonesOnDay(currentDate)
        const dayCalEvents = calEventsOnDay(currentDate)
        const combined = [
          ...dayCalEvents.map(ev => ({ kind: 'event' as const, time: ev.all_day ? '' : format(parseISO(ev.start_date), 'HH:mm'), ev })),
          ...dayMilestones.map(ev => ({ kind: 'milestone' as const, time: '', ev })),
        ].sort((a, b) => a.time.localeCompare(b.time))
        return (
          <div className="flex-1 overflow-y-auto">
            <div className="card overflow-hidden max-w-xl mx-auto">
              {combined.length === 0 ? (
                <p className="text-center text-sm text-stone-400 py-10">{t('cal_no_events_today')}</p>
              ) : (
                <div className="divide-y divide-stone-100">
                  {combined.map((item, i) => item.kind === 'event' ? (
                    <button key={i} onClick={() => openEdit(item.ev as CalendarEvent)}
                      className="w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-stone-50">
                      <span className="w-14 flex-shrink-0 text-xs font-medium text-stone-400">{item.time || t('cal_all_day')}</span>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: (LABEL_CONFIG[(item.ev as CalendarEvent).label] || LABEL_CONFIG.none).color }}/>
                      <span className="text-sm font-medium text-stone-900 flex-1 truncate">{(item.ev as CalendarEvent).title}</span>
                    </button>
                  ) : (
                    <Link key={i} href={`/projects/${(item.ev as MilestoneEvent).projectId}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-stone-50">
                      <span className="w-14 flex-shrink-0 text-xs font-medium text-stone-300">—</span>
                      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: (item.ev as MilestoneEvent).color }}/>
                      <span className="text-sm font-medium text-stone-900 flex-1 truncate">{(item.ev as MilestoneEvent).label}</span>
                      <span className="text-xs text-stone-400 flex-shrink-0">{(item.ev as MilestoneEvent).sublabel}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })()}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-stone-100">
        {/* Custom event labels */}
        {Object.entries(LABEL_CONFIG).filter(([k]) => k !== 'none').map(([key, lc]) => (
          <div key={key} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm border-l-2 flex-shrink-0" style={{ background: lc.bg, borderLeftColor: lc.color }}/>
            <span className="text-xs text-stone-500">{t(lc.labelKey)}</span>
          </div>
        ))}
        <div className="w-px bg-stone-200 mx-1"/>
        {/* Milestone stages */}
        {Object.entries(STAGE_COLOURS).map(([stage, color]) => (
          <div key={stage} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }}/>
            <span className="text-xs text-stone-500">{t(`proj_stage_${stage}` as TranslationKey)}</span>
          </div>
        ))}
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-modal">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-stone-100">
              <h2 className="text-base font-semibold text-stone-900">
                {editingEvent ? t('cal_edit_event') : t('cal_create_event')}
              </h2>
              <div className="flex items-center gap-2">
                {editingEvent && (
                  <button onClick={() => deleteEvent(editingEvent.id)}
                    className="p-2 rounded-lg text-red-400 hover:bg-red-50 hover:text-red-500 transition-colors">
                    <Trash2 size={15}/>
                  </button>
                )}
                <button onClick={() => setShowModal(false)}
                  className="p-2 rounded-lg hover:bg-stone-100 text-stone-500 transition-colors">
                  <X size={16}/>
                </button>
              </div>
            </div>

            {/* Modal body */}
            <div className="overflow-y-auto flex-1 px-6 py-4 space-y-4">

              {/* Title */}
              <input
                className="input text-base font-medium placeholder:font-normal"
                placeholder={t('cal_event_title_placeholder')}
                value={form.title}
                onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                autoFocus
              />

              {/* Type tabs */}
              <div className="flex gap-1 bg-stone-100 rounded-lg p-1 w-fit">
                {TYPE_OPTIONS.map(opt => (
                  <button key={opt.value}
                    onClick={() => setForm(f => ({ ...f, type: opt.value, all_day: opt.value === 'all_day' }))}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors
                      ${form.type === opt.value ? 'bg-white text-stone-900 shadow-sm' : 'text-stone-500 hover:text-stone-700'}`}>
                    {t(opt.labelKey)}
                  </button>
                ))}
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('cal_starts')}</label>
                  <input
                    type={form.all_day || form.type === 'all_day' ? 'date' : 'datetime-local'}
                    className="input text-sm"
                    value={form.start_date.slice(0, form.all_day || form.type === 'all_day' ? 10 : 16)}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="label">{t('cal_ends')}</label>
                  <input
                    type={form.all_day || form.type === 'all_day' ? 'date' : 'datetime-local'}
                    className="input text-sm"
                    value={form.end_date.slice(0, form.all_day || form.type === 'all_day' ? 10 : 16)}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              </div>

              {/* Repeat + Remind */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label flex items-center gap-1.5"><Repeat size={11}/> {t('cal_repeat')}</label>
                  <select className="input text-sm" value={form.repeat}
                    onChange={e => setForm(f => ({ ...f, repeat: e.target.value }))}>
                    {REPEAT_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label flex items-center gap-1.5"><Bell size={11}/> {t('cal_remind')}</label>
                  <select className="input text-sm" value={form.remind}
                    onChange={e => setForm(f => ({ ...f, remind: e.target.value }))}>
                    {REMIND_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
                  </select>
                </div>
              </div>

              {/* Label + Project */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label flex items-center gap-1.5"><Tag size={11}/> {t('cal_label')}</label>
                  <div className="flex flex-wrap gap-1.5">
                    {Object.entries(LABEL_CONFIG).map(([key, lc]) => (
                      <button key={key}
                        onClick={() => setForm(f => ({ ...f, label: key }))}
                        className={`text-xs px-2.5 py-1 rounded-full font-medium border transition-all
                          ${form.label === key ? 'ring-2 ring-offset-1 opacity-100' : 'opacity-60 hover:opacity-100'}`}
                        style={{ background: lc.bg, color: lc.color, borderColor: lc.color }}>
                        {t(lc.labelKey)}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label">{t('cal_link_project')}</label>
                  <select className="input text-sm" value={form.project_id}
                    onChange={e => setForm(f => ({ ...f, project_id: e.target.value }))}>
                    <option value="">{t('cal_none_option')}</option>
                    {projects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                </div>
              </div>

              {/* Members */}
              <div>
                <label className="label flex items-center gap-1.5"><Users size={11}/> {t('cal_members')}</label>
                <div className="flex flex-wrap gap-2">
                  {users.map(u => {
                    const selected = form.member_ids.includes(u.id)
                    const initials = u.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?'
                    return (
                      <button key={u.id} onClick={() => toggleMember(u.id)} title={u.full_name}
                        className="relative w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white transition-all"
                        style={{ background: u.color || '#78716C', opacity: selected ? 1 : 0.45 }}>
                        {initials}
                        {selected && (
                          <span className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-[#7D8C74] rounded-full flex items-center justify-center">
                            <Check size={8} className="text-white"/>
                          </span>
                        )}
                      </button>
                    )
                  })}
                </div>
                {form.member_ids.length > 0 && (
                  <p className="mt-1.5 text-xs text-stone-500">
                    {form.member_ids.map(id => users.find(u => u.id === id)?.full_name).filter(Boolean).join(', ')}
                  </p>
                )}
              </div>

              {/* Note */}
              <div>
                <label className="label flex items-center gap-1.5"><FileText size={11}/> {t('cal_note')}</label>
                <textarea className="input text-sm resize-none" rows={3}
                  placeholder={t('cal_note_placeholder')}
                  value={form.note}
                  onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                />
              </div>

              {/* To-Do */}
              <div>
                <label className="label flex items-center gap-1.5"><CheckSquare size={11}/> {t('cal_todo_list')}</label>
                <div className="space-y-1.5 mb-2">
                  {form.todo_list.map(td => (
                    <div key={td.id} className="flex items-center gap-2">
                      <button onClick={() => toggleTodo(td.id)}
                        className={`w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors
                          ${td.done ? 'bg-[#7D8C74] border-[#7D8C74]' : 'border-stone-300 hover:border-[#7D8C74]'}`}>
                        {td.done && <Check size={10} className="text-white"/>}
                      </button>
                      <span className={`text-sm flex-1 ${td.done ? 'line-through text-stone-400' : 'text-stone-700'}`}>
                        {td.text}
                      </span>
                      <button onClick={() => removeTodo(td.id)} className="text-stone-300 hover:text-red-400 p-0.5">
                        <X size={12}/>
                      </button>
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input className="input text-sm flex-1" placeholder={t('cal_add_task_placeholder')}
                    value={newTodo}
                    onChange={e => setNewTodo(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addTodo()}
                  />
                  <button onClick={addTodo} className="btn-secondary px-3 text-sm">{t('action_add')}</button>
                </div>
              </div>

              {/* Files */}
              <div>
                <label className="label flex items-center gap-1.5"><Paperclip size={11}/> {t('cal_files')}</label>
                {form.file_urls.length > 0 && (
                  <div className="space-y-1.5 mb-2">
                    {form.file_urls.map((f, i) => (
                      <div key={i} className="flex items-center gap-2 text-sm">
                        <Paperclip size={12} className="text-stone-400 flex-shrink-0"/>
                        <a href={f.url} target="_blank" className="text-[#7D8C74] hover:underline flex-1 truncate">{f.name}</a>
                        <button onClick={() => setForm(fm => ({ ...fm, file_urls: fm.file_urls.filter((_, j) => j !== i) }))}
                          className="text-stone-300 hover:text-red-400">
                          <X size={12}/>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileUpload}/>
                <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
                  className="btn-secondary text-sm flex items-center gap-2">
                  <Upload size={14}/>
                  {uploading ? t('cal_uploading') : t('cal_upload_file')}
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-4 border-t border-stone-100 flex justify-end gap-3">
              <button onClick={() => setShowModal(false)} className="btn-secondary">{t('action_cancel')}</button>
              <button onClick={saveEvent} className="btn-primary">
                {editingEvent ? t('cal_save_changes') : t('cal_create_event')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

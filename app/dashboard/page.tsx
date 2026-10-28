'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { STAGE_CONFIG } from '@/types'
import { format, isToday, isPast, parseISO, differenceInDays } from 'date-fns'
import {
  Plus, ChevronRight, AlertTriangle, Truck, CheckSquare,
  TrendingUp, FolderOpen, Bell, FileSpreadsheet, Activity,
  Zap, BarChart2, Calendar, Users
} from 'lucide-react'

// ── helpers ──────────────────────────────────────────────────────────────────
const tag = (label: string, variant: 'red' | 'amber' | 'green' | 'blue' | 'purple' | 'gray') => {
  const map = {
    red:    'bg-red-50 text-red-700',
    amber:  'bg-amber-50 text-amber-700',
    green:  'bg-emerald-50 text-emerald-700',
    blue:   'bg-blue-50 text-blue-700',
    purple: 'bg-violet-50 text-violet-700',
    gray:   'bg-stone-100 text-stone-500',
  }
  return <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${map[variant]}`}>{label}</span>
}

const avatar = (name: string, color?: string) => {
  const initials = name?.split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase() || '?'
  return (
    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
      style={{ background: color || '#7D8C74' }}>
      {initials}
    </div>
  )
}

function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <div className={`bg-white rounded-xl border border-stone-200 overflow-hidden ${className}`}>{children}</div>
}

function CardHead({ title, badge, action }: { title: string; badge?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 border-b border-stone-100">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{title}</span>
        {badge}
      </div>
      {action}
    </div>
  )
}

function EmptyRow({ text }: { text: string }) {
  return <div className="px-4 py-5 text-xs text-stone-400 text-center">{text}</div>
}

// ── main component ────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { t } = useLanguage()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)

  useEffect(() => { load() }, [])

  async function load() {
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser) return
    const { data: profile } = await supabase.from('users').select('*, full_access').eq('id', authUser.id).single()
    setUser(profile)

    const isAdmin = profile?.role === 'admin' || profile?.full_access === true
    const isManager = profile?.role === 'manager'

    // Projects query — admins/full_access see all, others see own
    let projQ = supabase.from('projects')
      .select('*, project_manager:users!project_manager_id(id,full_name,color), milestones:project_milestones(*)')
      .order('updated_at', { ascending: false })
    if (!isAdmin) projQ = projQ.eq('project_manager_id', authUser.id)

    const [projRes, tasksRes, actRes, dealsRes, salesContactsRes, estimatesRes] = await Promise.all([
      projQ,
      supabase.from('tasks').select('*, project:projects(id,name), assigned_to:users!assigned_to_id(full_name,color)')
        .neq('status', 'completed').order('due_date', { ascending: true }),
      supabase.from('activity_log').select('*, user:users(full_name,color), project:projects(id,name)')
        .order('created_at', { ascending: false }).limit(12),
      isAdmin ? supabase.from('sales_deals')
        .select('id,name,client,value,stage,closing_date,account_manager:users!account_manager_id(full_name,color)')
        .not('stage', 'in', '("closed_won","closed_lost")')
        .not('closing_date', 'is', null)
        .order('closing_date', { ascending: true }).limit(8)
        : Promise.resolve({ data: [] }),
      isAdmin ? supabase.from('sales_contacts')
        .select('id,name,company,touchpoints:sales_touchpoints(id,notes,touch_date,next_reminder_date,reminder_done)')
        : Promise.resolve({ data: [] }),
      isAdmin ? supabase.from('quotes')
        .select('id,offer_name,client,currency,grand_total,created_at,status')
        .order('created_at', { ascending: false }).limit(6)
        : Promise.resolve({ data: [] }),
    ])

    const projects = projRes.data || []
    const tasks = tasksRes.data || []
    const activity = actRes.data || []
    const deals = dealsRes.data || []
    const salesContacts = salesContactsRes.data || []
    const estimates = estimatesRes.data || []

    const today = new Date(); today.setHours(0,0,0,0)
    const in14 = new Date(today); in14.setDate(in14.getDate() + 14)
    const in30 = new Date(today); in30.setDate(in30.getDate() + 30)
    const sc = STAGE_CONFIG as any

    // Milestone alerts
    const overdueMs: any[] = []
    const upcomingMs: any[] = []
    projects.forEach((p: any) => {
      if (p.status === 'complete') return;
      (p.milestones || []).forEach((m: any) => {
        if (!m.planned_date || m.status === 'complete') return
        const d = parseISO(m.planned_date)
        const days = differenceInDays(d, today)
        const conf = sc[m.stage] || { label: m.stage, color: '#6B7280', bg: '#F3F4F6' }
        const item = { projectId: p.id, projectName: p.name, stage: m.stage, stageLabel: conf.label, stageColor: conf.color, date: m.planned_date, days, pm: p.project_manager }
        if (days < 0) overdueMs.push(item)
        else if (days <= 14) upcomingMs.push(item)
      })
    })
    overdueMs.sort((a,b) => a.days - b.days)
    upcomingMs.sort((a,b) => a.days - b.days)

    // Deliveries this week
    const deliveries = projects
      .filter((p: any) => {
        const ms = p.milestones?.find((m: any) => m.stage === 'delivery')
        if (!ms?.planned_date) return false
        const d = parseISO(ms.planned_date)
        return d <= in30
      })
      .map((p: any) => {
        const ms = p.milestones?.find((m: any) => m.stage === 'delivery')
        const d = parseISO(ms.planned_date)
        const days = differenceInDays(d, today)
        return { ...p, deliveryDate: ms.planned_date, deliveryDays: days, deliveryStatus: ms.status }
      })
      .sort((a: any, b: any) => a.deliveryDays - b.deliveryDays)
      .slice(0, 6)

    // Active installations
    const installations = projects
      .filter((p: any) => {
        const ms = p.milestones?.find((m: any) => ['installation','installation_2','installation_3'].includes(m.stage) && m.status === 'active')
        return !!ms
      })
      .map((p: any) => {
        const ms = p.milestones?.find((m: any) => ['installation','installation_2','installation_3'].includes(m.stage) && m.status === 'active')
        const totalStages = (p.milestones || []).length
        const doneStages = (p.milestones || []).filter((m: any) => m.status === 'complete').length
        const pct = totalStages > 0 ? Math.round((doneStages / totalStages) * 100) : 0
        return { ...p, installMs: ms, pct }
      })
      .slice(0, 5)

    // Sales follow-ups (overdue reminders)
    const followUps = salesContacts
      .flatMap((c: any) =>
        (c.touchpoints || [])
          .filter((t: any) => t.next_reminder_date && !t.reminder_done && (isPast(parseISO(t.next_reminder_date)) || isToday(parseISO(t.next_reminder_date))))
          .map((t: any) => ({ ...t, contactName: c.name, contactCompany: c.company, contactId: c.id }))
      )
      .sort((a: any, b: any) => a.next_reminder_date.localeCompare(b.next_reminder_date))
      .slice(0, 6)

    // Recent activity
    const recentActivity = activity.slice(0, 8)

    // Stale projects
    const stale = projects
      .filter((p: any) => p.status !== 'complete' && differenceInDays(today, parseISO(p.updated_at)) >= 7)
      .map((p: any) => ({ ...p, daysSince: differenceInDays(today, parseISO(p.updated_at)) }))
      .sort((a: any, b: any) => b.daysSince - a.daysSince)
      .slice(0, 5)

    // Pipeline stages totals
    const pipelineTotals: Record<string, { count: number; value: number }> = {}
    deals.forEach((d: any) => {
      if (!pipelineTotals[d.stage]) pipelineTotals[d.stage] = { count: 0, value: 0 }
      pipelineTotals[d.stage].count++
      pipelineTotals[d.stage].value += Number(d.value || 0)
    })
    const totalPipeline = deals.reduce((s: number, d: any) => s + Number(d.value || 0), 0)

    // Handover projects (won, not yet activated)
    const handover = await supabase.from('sales_projects')
      .select('id,name,client,value,project_type,pm:users!pm_id(full_name,color)')
      .is('converted_project_id', null)
      .order('created_at', { ascending: false })
      .limit(5)

    setData({
      isAdmin, isManager,
      activeProjects: projects.filter((p: any) => p.status === 'active').length,
      myProjects: projects.filter((p: any) => p.project_manager_id === authUser.id).length,
      overdueCount: overdueMs.length,
      deliveriesCount: deliveries.length,
      overdueMs: overdueMs.slice(0, 8),
      upcomingMs: upcomingMs.slice(0, 8),
      deliveries,
      installations,
      followUps,
      recentActivity,
      stale,
      deals: deals.slice(0, 6),
      pipelineTotals,
      totalPipeline,
      estimates,
      handover: handover.data || [],
      tasks: tasks.slice(0, 6),
      tasksDueToday: tasks.filter((t: any) => t.due_date && isToday(parseISO(t.due_date))).length,
    })
    setLoading(false)
  }

  const hour = new Date().getHours()
  const greeting = hour < 12 ? t('dash_good_morning') : hour < 18 ? t('dash_good_afternoon') : t('dash_good_evening')

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-[#7D8C74] border-t-transparent rounded-full animate-spin"/>
    </div>
  )
  if (!data) return null

  const STAGE_COLORS: Record<string,string> = {
    designer_requested: '#8B5CF6', general_pricing: '#3B82F6', contractor_tender: '#F59E0B',
    end_user_price: '#7D8C74', value_engineering: '#0D9488', expected_to_close: '#F97316',
  }
  const STAGE_LABELS: Record<string,string> = {
    designer_requested: 'Designer req.', general_pricing: 'General pricing',
    contractor_tender: 'Contractor tender', end_user_price: 'End user price',
    value_engineering: 'Value engineering', expected_to_close: 'Expected to close',
  }
  const maxPipelineVal = Math.max(...Object.values(data.pipelineTotals).map((v: any) => v.value), 1)

  const TYPE_LABELS: Record<string,string> = { slab_only: 'Slab Only', cut_to_size: 'Cut to Size', supply_install: 'Supply & Install' }

  return (
    <div className="p-3 md:p-5 space-y-3 pb-10">

      {/* ── HEADER ── */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">{greeting}, {user?.full_name?.split(' ')[0]}</h1>
          <p className="text-xs text-stone-400 mt-0.5">{format(new Date(), 'EEEE d MMMM yyyy')}</p>
        </div>
        <Link href="/projects/new" className="btn-primary flex items-center gap-2 text-sm">
          <Plus size={14}/> {t('action_new_project')}
        </Link>
      </div>

      {/* ── KPI ROW ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3">
        {[
          { label: t('dash_active_projects'), value: data.activeProjects, sub: t('dash_across_all_pms'), icon: FolderOpen, href: '/projects', color: '#7D8C74' },
          { label: t('dash_pipeline_value'), value: data.isAdmin ? `£${(data.totalPipeline/1000).toFixed(0)}k` : data.myProjects, sub: data.isAdmin ? `${data.deals.length} ${t('dash_live_deals')}` : t('dash_my_projects'), icon: TrendingUp, href: data.isAdmin ? '/salestracking' : '/projects', color: '#3B82F6' },
          { label: t('dash_deliveries_due'), value: data.deliveriesCount, sub: t('dash_next_30_days'), icon: Truck, href: '/timeline', color: '#F59E0B' },
          { label: t('dash_overdue_milestones'), value: data.overdueCount, sub: t('dash_need_attention'), icon: AlertTriangle, href: '/projects', color: data.overdueCount > 0 ? '#EF4444' : '#7D8C74' },
        ].map(k => (
          <Link key={k.label} href={k.href}
            className="bg-white rounded-xl border border-stone-200 p-3 hover:border-stone-300 hover:shadow-sm transition-all group">
            <div className="flex items-start justify-between mb-1.5">
              <p className="text-[11px] text-stone-400 font-medium leading-tight">{k.label}</p>
              <div className="w-6 h-6 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: k.color + '12' }}>
                <k.icon size={12} style={{ color: k.color }}/>
              </div>
            </div>
            <p className="text-xl md:text-2xl font-semibold text-stone-900 leading-none mb-1">{k.value}</p>
            <p className="text-[11px] text-stone-400">{k.sub}</p>
          </Link>
        ))}
      </div>

      {/* ── ROW 2: Urgent + Deliveries + Follow-ups ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Urgent alerts */}
        <Card>
          <CardHead
            title={t('dash_urgent')}
            badge={data.overdueMs.length > 0 ? tag(`${data.overdueMs.length} overdue`, 'red') : tag(t('dash_all_clear'), 'green')}
          />
          {[...data.overdueMs, ...data.upcomingMs].length === 0 ? (
            <EmptyRow text={t('dash_no_urgent')}/>
          ) : (
            <div className="divide-y divide-stone-50">
              {[...data.overdueMs.slice(0,4), ...data.upcomingMs.slice(0,3)].map((a: any, i: number) => {
                const overdue = a.days < 0
                return (
                  <Link key={i} href={`/projects/${a.projectId}`}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-stone-50 transition-colors">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.stageColor }}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-900 truncate">{a.projectName}</p>
                      <p className="text-[11px] text-stone-400 truncate">{a.stageLabel}</p>
                    </div>
                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0
                      ${overdue ? 'bg-red-50 text-red-600' : a.days === 0 ? 'bg-amber-50 text-amber-600' : 'bg-stone-100 text-stone-500'}`}>
                      {overdue ? `${Math.abs(a.days)}d late` : a.days === 0 ? 'Today' : `${a.days}d`}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </Card>

        {/* Deliveries on site */}
        <Card>
          <CardHead title={t('dash_deliveries_on_site')} badge={tag(`${data.deliveries.length}`, 'amber')}
            action={<Link href="/timeline" className="text-[11px] text-[#7D8C74] hover:underline">{t('nav_timeline')} →</Link>}
          />
          {data.deliveries.length === 0 ? (
            <EmptyRow text={t('dash_no_deliveries')}/>
          ) : (
            <div className="divide-y divide-stone-50">
              {data.deliveries.map((p: any) => {
                const overdue = p.deliveryDays < 0
                const isToday2 = p.deliveryDays === 0
                const dayLabel = overdue ? `${Math.abs(p.deliveryDays)}d overdue` : isToday2 ? 'Today' : p.deliveryDays === 1 ? 'Tomorrow' : `${p.deliveryDays}d`
                const variant = overdue ? 'red' : isToday2 ? 'amber' : p.deliveryDays <= 3 ? 'amber' : 'gray'
                return (
                  <Link key={p.id} href={`/projects/${p.id}`}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-stone-50 transition-colors">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: overdue ? '#EF4444' : isToday2 ? '#F59E0B' : '#7D8C74' }}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-900 truncate">{p.name}</p>
                      <p className="text-[11px] text-stone-400 truncate">{p.client}</p>
                    </div>
                    {tag(dayLabel, variant)}
                    <p className="text-[11px] text-stone-400 flex-shrink-0">{format(parseISO(p.deliveryDate), 'd MMM')}</p>
                  </Link>
                )
              })}
            </div>
          )}
        </Card>

        {/* Sales follow-ups */}
        <Card>
          <CardHead
            title={t('dash_sales_followups')}
            badge={data.followUps.length > 0 ? tag(`${data.followUps.length} due`, 'purple') : undefined}
            action={data.isAdmin ? <Link href="/salestracking" className="text-[11px] text-[#7D8C74] hover:underline">{t('nav_sales')} →</Link> : undefined}
          />
          {data.followUps.length === 0 ? (
            <EmptyRow text={t('dash_no_followups')}/>
          ) : (
            <div className="divide-y divide-stone-50">
              {data.followUps.map((r: any, i: number) => (
                <div key={i} className="flex items-start gap-2.5 px-4 py-2.5">
                  <div className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-[9px] font-bold text-violet-700 flex-shrink-0 mt-0.5">
                    {(r.contactCompany || r.contactName)?.slice(0,2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-900 truncate">{r.contactCompany || r.contactName}</p>
                    {r.notes && <p className="text-[11px] text-stone-400 truncate">{r.notes}</p>}
                  </div>
                  {tag('Overdue', 'red')}
                </div>
              ))}
            </div>
          )}
          {data.followUps.length === 0 && data.isAdmin && (
            <div className="px-4 pb-3">
              <Link href="/salestracking" className="text-[11px] text-[#7D8C74] hover:underline">View sales pipeline →</Link>
            </div>
          )}
        </Card>
      </div>

      {/* ── ROW 3: Installations + Pipeline + Handover ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Active installations */}
        <Card>
          <CardHead title={t('dash_active_installations')} badge={tag(`${data.installations.length} live`, 'green')}/>
          {data.installations.length === 0 ? (
            <EmptyRow text={t('dash_no_installations')}/>
          ) : (
            <div className="divide-y divide-stone-50">
              {data.installations.map((p: any, i: number) => (
                <Link key={i} href={`/projects/${p.id}`}
                  className="flex items-center gap-3 px-4 py-2.5 hover:bg-stone-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-900 truncate">{p.name}</p>
                    <p className="text-[11px] text-stone-400 truncate">{p.installMs?.milestone_label || p.client}</p>
                    <div className="mt-1.5 w-full h-1.5 bg-stone-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#7D8C74] transition-all" style={{ width: `${p.pct}%` }}/>
                    </div>
                  </div>
                  <span className="text-[11px] font-medium text-stone-500 flex-shrink-0">{p.pct}%</span>
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Quotes pipeline */}
        {data.isAdmin ? (
          <Card>
            <CardHead
              title={t('dash_quotes_pipeline')}
              badge={<span className="text-xs font-semibold text-blue-700">£{(data.totalPipeline/1000).toFixed(0)}k</span>}
              action={<Link href="/salestracking?tab=quotes" className="text-[11px] text-[#7D8C74] hover:underline">{t('dash_full_pipeline')} →</Link>}
            />
            <div className="p-4 space-y-3">
              {Object.entries(data.pipelineTotals).slice(0,6).map(([stage, val]: [string, any]) => (
                <div key={stage}>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[11px] text-stone-500">{STAGE_LABELS[stage] || stage}</span>
                    <span className="text-[11px] font-medium text-stone-700">£{(val.value/1000).toFixed(0)}k · {val.count}</span>
                  </div>
                  <div className="h-1.5 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width: `${Math.round((val.value / maxPipelineVal) * 100)}%`,
                      background: STAGE_COLORS[stage] || '#7D8C74'
                    }}/>
                  </div>
                </div>
              ))}
              {Object.keys(data.pipelineTotals).length === 0 && (
                <p className="text-xs text-stone-400 text-center py-3">{t('dash_no_deals')}</p>
              )}
            </div>
          </Card>
        ) : (
          // Non-admin: show tasks instead
          <Card>
            <CardHead title={t('dash_my_tasks')} badge={tag(`${data.tasks.length}`, 'blue')}
              action={<Link href="/tasks" className="text-[11px] text-[#7D8C74] hover:underline">{t('dash_all_tasks')} →</Link>}
            />
            <div className="divide-y divide-stone-50">
              {data.tasks.slice(0,6).map((task: any, i: number) => {
                const overdue = task.due_date && isPast(parseISO(task.due_date)) && !isToday(parseISO(task.due_date))
                return (
                  <Link key={i} href={`/projects/${task.project?.id}`}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-stone-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-900 truncate">{task.title}</p>
                      <p className="text-[11px] text-stone-400 truncate">{task.project?.name}</p>
                    </div>
                    {task.due_date && tag(
                      overdue ? `${Math.abs(differenceInDays(parseISO(task.due_date), new Date()))}d late` : isToday(parseISO(task.due_date)) ? 'Today' : format(parseISO(task.due_date), 'd MMM'),
                      overdue ? 'red' : isToday(parseISO(task.due_date)) ? 'amber' : 'gray'
                    )}
                  </Link>
                )
              })}
              {data.tasks.length === 0 && <EmptyRow text={t('dash_no_open_tasks')}/>}
            </div>
          </Card>
        )}

        {/* Project handover */}
        <Card>
          <CardHead
            title={t('dash_project_handover')}
            badge={data.handover.length > 0 ? tag(`${data.handover.length} ready`, 'green') : undefined}
            action={<Link href="/salestracking?tab=won" className="text-[11px] text-[#7D8C74] hover:underline">{t('action_view_all')} →</Link>}
          />
          {data.handover.length === 0 ? (
            <EmptyRow text={t('dash_no_handover')}/>
          ) : (
            <div className="divide-y divide-stone-50">
              {data.handover.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2.5 px-4 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-900 truncate">{p.name}</p>
                    <p className="text-[11px] text-stone-400 truncate">{TYPE_LABELS[p.project_type] || 'Project'}{p.value ? ` · £${Number(p.value).toLocaleString()}` : ''}</p>
                  </div>
                  <Link href="/salestracking?tab=won"
                    className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors flex-shrink-0">
                    {t('dash_activate')}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* ── ROW 4: Quote deadlines + Upcoming milestones ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Quote deadlines */}
        {data.isAdmin && (
          <Card>
            <CardHead title={t('dash_quote_deadlines')} badge={tag(`${data.deals.length}`, 'amber')}
              action={<Link href="/salestracking?tab=quotes" className="text-[11px] text-[#7D8C74] hover:underline">{t('dash_quotes_pipeline')} →</Link>}
            />
            {data.deals.length === 0 ? (
              <EmptyRow text={t('dash_no_deals_deadlines')}/>
            ) : (
              <div className="divide-y divide-stone-50">
                {data.deals.map((d: any, i: number) => {
                  const date = d.closing_date ? parseISO(d.closing_date) : null
                  const days = date ? differenceInDays(date, new Date()) : null
                  const overdue = days !== null && days < 0
                  const todayQ = days === 0
                  return (
                    <Link key={i} href="/salestracking?tab=quotes"
                      className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-stone-50 transition-colors">
                      {d.account_manager ? avatar(d.account_manager.full_name, d.account_manager.color) : <div className="w-6 h-6 rounded-full bg-stone-200 flex-shrink-0"/>}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-stone-900 truncate">{d.name}</p>
                        <p className="text-[11px] text-stone-400 truncate">{d.client}</p>
                      </div>
                      {date && tag(
                        overdue ? `${Math.abs(days!)}d` : todayQ ? 'Today' : `${days}d`,
                        overdue ? 'red' : todayQ || (days !== null && days <= 3) ? 'amber' : 'gray'
                      )}
                    </Link>
                  )
                })}
              </div>
            )}
          </Card>
        )}

        {/* Upcoming milestones — 2 col span */}
        <Card className={data.isAdmin ? 'lg:col-span-2' : 'lg:col-span-3'}>
          <CardHead
            title={t('dash_upcoming_milestones')}
            badge={tag(`${data.upcomingMs.length}`, 'blue')}
            action={<Link href="/timeline" className="text-[11px] text-[#7D8C74] hover:underline">{t('nav_timeline')} →</Link>}
          />
          {data.upcomingMs.length === 0 ? (
            <EmptyRow text={t('dash_no_upcoming')}/>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-stone-100">
              {/* Left half */}
              <div className="divide-y divide-stone-50">
                {data.upcomingMs.filter((_: any, i: number) => i % 2 === 0).map((a: any, i: number) => (
                  <Link key={i} href={`/projects/${a.projectId}`}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-stone-50 transition-colors">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.stageColor }}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-900 truncate">{a.projectName}</p>
                      <p className="text-[11px] text-stone-400">{a.stageLabel}</p>
                    </div>
                    {tag(a.days === 0 ? 'Today' : `${a.days}d`, a.days === 0 ? 'red' : a.days <= 3 ? 'amber' : 'blue')}
                  </Link>
                ))}
              </div>
              {/* Right half */}
              <div className="divide-y divide-stone-50">
                {data.upcomingMs.filter((_: any, i: number) => i % 2 === 1).map((a: any, i: number) => (
                  <Link key={i} href={`/projects/${a.projectId}`}
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-stone-50 transition-colors">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.stageColor }}/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-900 truncate">{a.projectName}</p>
                      <p className="text-[11px] text-stone-400">{a.stageLabel}</p>
                    </div>
                    {tag(a.days === 0 ? 'Today' : `${a.days}d`, a.days === 0 ? 'red' : a.days <= 3 ? 'amber' : 'blue')}
                  </Link>
                ))}
              </div>
            </div>
          )}
        </Card>
      </div>

      {/* ── ROW 5: Recent estimates + Stale projects + Activity ── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">

        {/* Recent estimates */}
        {data.isAdmin && (
          <Card>
            <CardHead title={t('dash_recent_estimates')}
              action={<Link href="/salestracking?tab=estimates" className="text-[11px] text-[#7D8C74] hover:underline">{t('action_view_all')} →</Link>}
            />
            {data.estimates.length === 0 ? (
              <EmptyRow text={t('dash_no_estimates')}/>
            ) : (
              <div className="divide-y divide-stone-50">
                {data.estimates.map((e: any, i: number) => (
                  <Link key={i} href="/salestracking?tab=estimates"
                    className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-stone-50 transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-stone-900 truncate">{e.offer_name || e.client}</p>
                      <p className="text-[11px] text-stone-400 truncate">{e.client}</p>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-xs font-semibold text-stone-700">{e.currency} {Number(e.grand_total || 0).toLocaleString()}</p>
                      <p className="text-[11px] text-stone-400">{format(parseISO(e.created_at), 'd MMM')}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* Stale projects */}
        <Card className={data.isAdmin ? '' : 'lg:col-span-1'}>
          <CardHead title={t('dash_not_updated')} badge={data.stale.length > 0 ? tag(`${data.stale.length}`, 'amber') : undefined}/>
          {data.stale.length === 0 ? (
            <EmptyRow text={t('dash_all_updated')}/>
          ) : (
            <div className="divide-y divide-stone-50">
              {data.stale.map((p: any, i: number) => (
                <Link key={i} href={`/projects/${p.id}`}
                  className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-stone-50 transition-colors">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-stone-900 truncate">{p.name}</p>
                    <p className="text-[11px] text-stone-400 truncate">{p.project_manager?.full_name?.split(' ')[0]} · {p.client}</p>
                  </div>
                  {tag(`${p.daysSince}d`, p.daysSince >= 14 ? 'red' : 'amber')}
                </Link>
              ))}
            </div>
          )}
        </Card>

        {/* Recent activity */}
        <Card className={data.isAdmin ? '' : 'lg:col-span-2'}>
          <CardHead title={t('dash_recent_activity')}
            action={<span className="text-[11px] text-stone-400">{data.recentActivity.length} {t('dash_entries')}</span>}
          />
          {data.recentActivity.length === 0 ? (
            <EmptyRow text={t('dash_no_activity')}/>
          ) : (
            <div className="divide-y divide-stone-50">
              {data.recentActivity.map((a: any, i: number) => (
                <Link key={i} href={`/projects/${a.project_id}`}
                  className="flex items-start gap-2.5 px-4 py-2.5 hover:bg-stone-50 transition-colors">
                  {avatar(a.user?.full_name || '', a.user?.color)}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-stone-700 leading-snug">
                      <span className="font-medium text-stone-900">{a.user?.full_name?.split(' ')[0]}</span>
                      {' '}<span className="text-stone-500">{a.action}</span>
                    </p>
                    {a.project?.name && <p className="text-[11px] text-stone-400 truncate mt-0.5">{a.project.name}</p>}
                  </div>
                  <span className="text-[11px] text-stone-400 flex-shrink-0">{format(parseISO(a.created_at), 'HH:mm')}</span>
                </Link>
              ))}
            </div>
          )}
        </Card>
      </div>

    </div>
  )
}

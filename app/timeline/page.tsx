'use client'
import { Fragment, useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { STAGE_CONFIG } from '@/types'
import { format, addDays, startOfMonth, isSameDay, parseISO, isToday } from 'date-fns'
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react'

type ZoomLevel = 'week' | 'month' | 'quarter'

// Distinct colours for projects
const PROJECT_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6',
  '#F97316', '#06B6D4', '#EC4899', '#84CC16', '#6366F1',
  '#0D9488', '#DC2626', '#7C3AED', '#059669', '#D97706',
  '#2563EB', '#16A34A', '#EA580C', '#9333EA', '#0891B2',
]

// Installation milestone stages, in order — a project can have up to
// three running on different schedules (e.g. a fast bathroom, a slower
// master bedroom).
const INSTALL_STAGES = ['installation', 'installation_2', 'installation_3']
const INSTALL_FALLBACK_LABEL: Record<string, string> = {
  installation: 'Installation',
  installation_2: 'Installation 2',
  installation_3: 'Installation 3',
}

interface InstallRow {
  stage: string
  start: Date
  end: Date
  label: string
}

export default function TimelinePage() {
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState<ZoomLevel>('month')
  const [viewStart, setViewStart] = useState(() => startOfMonth(new Date()))
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set())
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadProjects() }, [])

  async function loadProjects() {
    const { data: { user } } = await supabase.auth.getUser()
    let role = 'member', fullAccess = false
    if (user) {
      const { data: profile } = await supabase.from('users').select('role, full_access').eq('id', user.id).single()
      role = profile?.role || 'member'
      fullAccess = profile?.full_access || false
    }
    let query = supabase.from('projects')
      .select('*, milestones:project_milestones(*), project_manager:users!project_manager_id(*)')
      .neq('status', 'complete')
      .order('name', { ascending: true })
    if (role !== 'admin' && !fullAccess && user) {
      query = query.eq('project_manager_id', user.id)
    }
    const { data } = await query
    setProjects(data || [])
    setLoading(false)
  }

  function getDays(): Date[] {
    const count = zoom === 'week' ? 28 : zoom === 'month' ? 90 : 180
    return Array.from({ length: count }, (_, i) => addDays(viewStart, i))
  }

  function navigate(dir: 1 | -1) {
    const delta = zoom === 'week' ? 14 : zoom === 'month' ? 30 : 60
    setViewStart(addDays(viewStart, dir * delta))
  }

  function getCellW() {
    return zoom === 'week' ? 48 : zoom === 'month' ? 30 : 17
  }

  function jumpToMonth(offset: number) {
    const d = new Date()
    d.setMonth(d.getMonth() + offset)
    setViewStart(startOfMonth(d))
  }

  function toggleProject(id: string) {
    setExpandedProjects(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const days = getDays()
  const cellW = getCellW()

  // Month groups for header
  const monthGroups: { label: string; count: number }[] = []
  let curMonth = ''
  days.forEach(d => {
    const m = format(d, 'MMM yyyy')
    if (m !== curMonth) { monthGroups.push({ label: m, count: 1 }); curMonth = m }
    else monthGroups[monthGroups.length - 1].count++
  })

  // Every installation on a project, each with its own name and date
  // range — shown when a project is expanded.
  function getInstallRows(p: any): InstallRow[] {
    const milestones = p.milestones || []
    return INSTALL_STAGES
      .map(stage => {
        const m = milestones.find((ms: any) => ms.stage === stage)
        if (!m || !m.planned_date) return null
        return {
          stage,
          start: parseISO(m.planned_date),
          end: m.end_date ? parseISO(m.end_date) : parseISO(m.planned_date),
          label: m.milestone_label?.trim() || INSTALL_FALLBACK_LABEL[stage],
        }
      })
      .filter((r): r is InstallRow => r !== null)
  }

  // The collapsed overview bar for a project — earliest start to latest
  // end across every installation, so there's always something useful
  // to see before expanding.
  function getOverviewRange(installs: InstallRow[]): { start: Date; end: Date } | null {
    if (installs.length === 0) return null
    const start = installs.reduce((min, r) => r.start < min ? r.start : min, installs[0].start)
    const end = installs.reduce((max, r) => r.end > max ? r.end : max, installs[0].end)
    return { start, end }
  }

  // When a project has no scheduled installation yet, fall back to its
  // start/completion dates so every active project still shows something,
  // colored and labeled by its current stage instead of installation.
  function getStageFallbackRange(p: any): { start: Date; end: Date } | null {
    if (p.start_date && p.completion_date) return { start: parseISO(p.start_date), end: parseISO(p.completion_date) }
    if (p.start_date) return { start: parseISO(p.start_date), end: parseISO(p.start_date) }
    if (p.completion_date) return { start: parseISO(p.completion_date), end: parseISO(p.completion_date) }
    return null
  }

  const projectRows = projects.map((p, idx) => {
    const installs = getInstallRows(p)
    const installOverview = getOverviewRange(installs)
    const stage = STAGE_CONFIG[p.current_stage as keyof typeof STAGE_CONFIG]
    const usingStageFallback = !installOverview
    const overview = installOverview || getStageFallbackRange(p)
    const overviewLabel = installs.length > 1 ? `${installs.length} installations` : installs.length === 1 ? installs[0].label : (stage?.label || 'In progress')
    return {
      project: p,
      color: usingStageFallback ? (stage?.color || PROJECT_COLORS[idx % PROJECT_COLORS.length]) : PROJECT_COLORS[idx % PROJECT_COLORS.length],
      installs,
      overview,
      overviewLabel,
    }
  })

  return (
    <div className="p-2 md:p-3 h-full flex flex-col">
      {/* Controls */}
      <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <h1 className="text-base md:text-lg font-semibold text-stone-900">Timeline</h1>
          <span className="text-xs text-stone-400">{projects.length} projects</span>
        </div>
        <div className="flex items-center gap-1 flex-wrap">
          {[0, 1, 2, 3, 4, 5].map(offset => {
            const d = new Date(); d.setMonth(d.getMonth() + offset)
            const isCurrentView = format(viewStart, 'MMM yyyy') === format(startOfMonth(d), 'MMM yyyy')
            return (
              <button key={offset} onClick={() => jumpToMonth(offset)}
                className={'text-xs px-2 py-1 rounded-full border transition-colors ' + (isCurrentView ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 text-stone-500')}>
                {format(d, 'MMM')}
              </button>
            )
          })}
          <div className="w-px h-4 bg-stone-200 mx-0.5"/>
          <div className="flex items-center border border-stone-200 rounded-lg bg-white overflow-hidden">
            {(['week', 'month', 'quarter'] as ZoomLevel[]).map(z => (
              <button key={z} onClick={() => setZoom(z)}
                className={'px-2 py-1 text-xs font-medium capitalize transition-colors ' + (zoom === z ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-50')}>
                {z}
              </button>
            ))}
          </div>
          <button onClick={() => navigate(-1)} className="p-1 rounded-lg border border-stone-200 hover:bg-stone-50 bg-white">
            <ChevronLeft size={13} className="text-stone-600"/>
          </button>
          <button onClick={() => setViewStart(startOfMonth(new Date()))} className="text-xs px-2 py-1 border border-stone-200 rounded-lg bg-white hover:bg-stone-50 text-stone-600">Today</button>
          <button onClick={() => navigate(1)} className="p-1 rounded-lg border border-stone-200 hover:bg-stone-50 bg-white">
            <ChevronRight size={13} className="text-stone-600"/>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center flex-1">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
        </div>
      ) : (
        <>
          {/* Mobile: simple list, tap a project to see its installations */}
          <div className="md:hidden flex-1 overflow-y-auto space-y-2">
            {projectRows.map(row => {
              const overview = row.overview
              const isOpen = expandedProjects.has(row.project.id)
              return (
                <div key={row.project.id} className="card p-3">
                  <div className="flex items-center gap-3">
                    <Link href={`/projects/${row.project.id}`} className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-3 h-10 rounded flex-shrink-0" style={{ background: row.color }}/>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-stone-900 truncate">{row.project.name}</p>
                        <p className="text-xs text-stone-400">{row.project.project_manager?.full_name?.split(' ')[0]}</p>
                        {overview ? (
                          <p className="text-xs font-medium mt-0.5" style={{ color: row.color }}>
                            {format(overview.start, 'd MMM')} – {format(overview.end, 'd MMM yyyy')}
                          </p>
                        ) : (
                          <p className="text-xs text-stone-300">No dates set</p>
                        )}
                      </div>
                    </Link>
                    {row.installs.length > 0 && (
                      <button onClick={() => toggleProject(row.project.id)} className="p-1.5 hover:bg-stone-100 rounded-lg flex-shrink-0">
                        {isOpen ? <ChevronUp size={16} className="text-stone-400"/> : <ChevronDown size={16} className="text-stone-400"/>}
                      </button>
                    )}
                  </div>
                  {isOpen && (
                    <div className="mt-2 pt-2 border-t border-stone-100 space-y-1.5 pl-6">
                      {row.installs.map(install => (
                        <div key={install.stage} className="flex items-center justify-between text-xs">
                          <span className="font-medium text-stone-700">{install.label}</span>
                          <span className="text-stone-400">{format(install.start, 'd MMM')} – {format(install.end, 'd MMM yyyy')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
            {projects.length === 0 && <div className="text-center py-12 text-stone-400 text-sm">No active projects.</div>}
          </div>

          {/* Desktop: Gantt table — one row per project, expandable to show installations */}
          <div className="hidden md:flex card flex-1 overflow-hidden flex-col">
          <div ref={scrollRef} className="overflow-auto flex-1">
            <table className="border-collapse" style={{ minWidth: `${190 + days.length * cellW}px` }}>
              <thead>
                {/* Month row */}
                <tr>
                  <th className="sticky left-0 bg-stone-100 z-20 border-b-2 border-r border-stone-300" style={{ width: '190px', minWidth: '190px' }}/>
                  {monthGroups.map((mg, i) => (
                    <th key={i} colSpan={mg.count}
                      className="text-sm font-bold text-stone-700 bg-stone-100 border-b-2 border-stone-300 px-2 py-2 text-left border-l border-stone-200">
                      {mg.label}
                    </th>
                  ))}
                </tr>
                {/* Day row */}
                <tr className="bg-white">
              <th className="sticky left-0 bg-stone-50 z-20 border-b-2 border-r border-stone-300 text-left px-2 text-xs font-semibold text-stone-500 uppercase tracking-wide py-2"
                style={{ minWidth: '190px', width: '190px' }}>
                Project
              </th>
                  {days.map((d, i) => {
                    const isWk = d.getDay() === 0 || d.getDay() === 6
                    const isTd = isToday(d)
                    return (
                      <th key={i}
                        className={'text-center border-b-2 border-stone-300 border-l border-stone-100 ' + (isTd ? 'bg-brand-100' : isWk ? 'bg-stone-100' : 'bg-white')}
                        style={{ width: `${cellW}px`, minWidth: `${cellW}px`, padding: '4px 0' }}>
                        {cellW >= 26 && (
                          <span className={'block leading-none ' + (isTd ? 'text-brand-700 font-bold' : 'text-stone-400')} style={{ fontSize: '8px' }}>
                            {format(d, 'EEEEE')}
                          </span>
                        )}
                        <span className={'block font-semibold ' + (isTd ? 'text-brand-700' : 'text-stone-600')}
                          style={{ fontSize: cellW >= 26 ? '11px' : '9px', display: cellW < 20 && d.getDate() % 5 !== 1 ? 'none' : 'block' }}>
                          {d.getDate()}
                        </span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {projectRows.map((row, rowIdx) => {
                  const { project: p, color, installs, overview, overviewLabel } = row
                  const isOpen = expandedProjects.has(p.id)
                  const bg = rowIdx % 2 === 0 ? '#FFFFFF' : '#FAFAF9'

                  const renderBar = (range: { start: Date; end: Date }, label: string, d: Date) => {
                    const inRange = d >= range.start && d <= range.end
                    if (!inRange) return null
                    const isStart = isSameDay(d, range.start)
                    const isEnd = isSameDay(d, range.end)
                    const isSingleDay = isSameDay(range.start, range.end)
                    return (
                      <div
                        className="absolute cursor-pointer hover:brightness-110 transition-all"
                        style={{
                          background: color,
                          top: '6px', bottom: '6px',
                          left: isStart ? '1px' : '0', right: isEnd ? '1px' : '0',
                          borderRadius: isSingleDay ? '5px' : isStart ? '5px 0 0 5px' : isEnd ? '0 5px 5px 0' : '0',
                          boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
                        }}
                        title={p.name + ' · ' + label + ' · ' + format(range.start, 'd MMM') + (isSameDay(range.start, range.end) ? '' : ' – ' + format(range.end, 'd MMM'))}>
                        {isStart && cellW >= 30 && (
                          <span className="absolute inset-0 flex items-center px-1.5 overflow-hidden">
                            <span className="text-white font-semibold whitespace-nowrap" style={{ fontSize: '9px' }}>{label}</span>
                          </span>
                        )}
                      </div>
                    )
                  }

                  return (
                    <Fragment key={p.id}>
                      {/* Parent project row — always visible, shows overview bar */}
                      <tr className="group" style={{ background: bg }}>
                        <td className="sticky left-0 z-10 border-r border-stone-300 px-2 py-2" style={{ minWidth: '190px', width: '190px', background: bg }}>
                          <div className="flex items-center gap-1.5">
                            {installs.length > 0 ? (
                              <button onClick={() => toggleProject(p.id)} className="p-0.5 hover:bg-stone-200 rounded flex-shrink-0">
                                {isOpen ? <ChevronUp size={13} className="text-stone-500"/> : <ChevronDown size={13} className="text-stone-500"/>}
                              </button>
                            ) : <span className="w-4 flex-shrink-0"/>}
                            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: color }}/>
                            <Link href={`/projects/${p.id}`} className="min-w-0 flex-1">
                              <p className="text-xs font-semibold truncate hover:text-brand-600 transition-colors text-stone-900">{p.name}</p>
                            </Link>
                          </div>
                          <p className="text-stone-400 truncate pl-6" style={{ fontSize: '10px' }}>
                            {installs.length > 1 ? `${installs.length} installations` : p.project_manager?.full_name?.split(' ')[0] || ''}
                          </p>
                        </td>
                        {days.map((d, i) => {
                          const isWk = d.getDay() === 0 || d.getDay() === 6
                          const isTd = isToday(d)
                          return (
                            <td key={i} className={'relative border-l border-stone-100 p-0 ' + (isWk ? 'bg-stone-50/60' : '')} style={{ width: `${cellW}px`, height: '38px' }}>
                              {isTd && <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-brand-500 -translate-x-1/2 pointer-events-none z-10"/>}
                              {overview && renderBar(overview, overviewLabel, d)}
                            </td>
                          )
                        })}
                      </tr>

                      {/* Sub-rows — one per installation, only when expanded */}
                      {isOpen && installs.map(install => (
                        <tr key={p.id + install.stage} style={{ background: bg }}>
                          <td className="sticky left-0 z-10 border-r border-stone-300 pl-8 pr-2 py-1.5" style={{ minWidth: '190px', width: '190px', background: bg }}>
                            <p className="font-semibold truncate" style={{ fontSize: '10.5px', color }}>{install.label}</p>
                            <p className="text-stone-400 truncate" style={{ fontSize: '9.5px' }}>
                              {isSameDay(install.start, install.end) ? format(install.start, 'd MMM yyyy') : `${format(install.start, 'd MMM')} \u2013 ${format(install.end, 'd MMM yyyy')}`}
                            </p>
                          </td>
                          {days.map((d, i) => {
                            const isWk = d.getDay() === 0 || d.getDay() === 6
                            const isTd = isToday(d)
                            return (
                              <td key={i} className={'relative border-l border-stone-100 p-0 ' + (isWk ? 'bg-stone-50/60' : '')} style={{ width: `${cellW}px`, height: '32px' }}>
                                {isTd && <div className="absolute top-0 bottom-0 left-1/2 w-0.5 bg-brand-500 -translate-x-1/2 pointer-events-none z-10"/>}
                                {renderBar(install, install.label, d)}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </Fragment>
                  )
                })}
                {projects.length === 0 && (
                  <tr>
                    <td colSpan={days.length + 1} className="py-16 text-center text-sm text-stone-400">
                      No active projects.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        </>
      )}
      <p className="text-xs text-stone-400 mt-2 text-center">
        Click the arrow next to a project to see each installation's own name and dates. Click a project to open it.
      </p>
    </div>
  )
}

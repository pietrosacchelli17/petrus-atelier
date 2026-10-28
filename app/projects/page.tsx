'use client'
import { useEffect, useState, useRef, Suspense } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { Project, STAGE_CONFIG } from '@/types'
import { format, parseISO } from 'date-fns'
import { Plus, Search, Filter, Download, Upload, Grid, List, MoreHorizontal, ChevronRight } from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

const STAGES = Object.keys(STAGE_CONFIG) as (keyof typeof STAGE_CONFIG)[]

function ProjectsInner() {
  const { t } = useLanguage()
  const searchParams = useSearchParams()
  const [projects, setProjects] = useState<Project[]>([])
  const [filtered, setFiltered] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState(searchParams.get('filter') || 'all')
  const [view, setView] = useState<'list' | 'grid'>('list')
  const [userId, setUserId] = useState<string>()
  const importRef = useRef<HTMLInputElement>(null)

  const [currentUserRole, setCurrentUserRole] = useState<string>('member')

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUserId(data.user?.id)
      const { data: profile } = await supabase.from('users').select('role, full_access').eq('id', data.user?.id || '').single()
      setCurrentUserRole(profile?.role || 'member')
      loadProjects(data.user?.id, profile?.role, profile?.full_access)
    })
  }, [])

  useEffect(() => {
    applyFilters()
  }, [projects, search, stageFilter, statusFilter, userId])

  async function loadProjects(uid?: string, role?: string, fullAccess?: boolean) {
    let query = supabase
      .from('projects')
      .select(`*, project_manager:users!project_manager_id(*), milestones:project_milestones(*), team_members:project_members(user:users(*))`)
      .order('name', { ascending: true })

    // Only restrict if not admin and not flagged full_access
    if (role !== 'admin' && !fullAccess && uid) {
      query = query.eq('project_manager_id', uid)
    }

    const { data, error } = await query
    if (!error) setProjects(data || [])
    setLoading(false)
  }

  function applyFilters() {
    let list = [...projects]
    if (search) list = list.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.client.toLowerCase().includes(search.toLowerCase()) ||
      p.reference?.toLowerCase().includes(search.toLowerCase())
    )
    if (stageFilter !== 'all') list = list.filter(p => p.current_stage === stageFilter)
    if (statusFilter === 'mine') list = list.filter(p => p.project_manager_id === userId)
    else if (statusFilter !== 'all') list = list.filter(p => p.status === statusFilter)
    setFiltered(list)
  }

  function exportToExcel() {
    const rows = filtered.map(p => ({
      'Project Name': p.name,
      'Client': p.client,
      'Architect': p.architect || '',
      'Contractor': p.contractor || '',
      'Project Manager': p.project_manager?.full_name || '',
      'Value': p.value || '',
      'Stage': STAGE_CONFIG[p.current_stage]?.label || p.current_stage,
      'Status': p.status,
      'Start Date': p.start_date || '',
      'Completion Date': p.completion_date || '',
      'Next Action': p.next_action || '',
      'Notes': p.notes || '',
    }))
    const wb = XLSX.utils.book_new()
    const ws = XLSX.utils.json_to_sheet(rows)
    XLSX.utils.book_append_sheet(wb, ws, 'Projects')
    XLSX.writeFile(wb, `stoneline-projects-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
    toast.success(t('proj_toast_exported'))
  }

  async function importFromExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      const wb = XLSX.read(ev.target?.result, { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const rows: any[] = XLSX.utils.sheet_to_json(ws)
      const stageMap: Record<string, string> = {}
      STAGES.forEach(s => { stageMap[STAGE_CONFIG[s].label.toLowerCase()] = s })
      const { data: { user } } = await supabase.auth.getUser()
      let imported = 0
      for (const row of rows) {
        const stage = stageMap[String(row['Stage'] || '').toLowerCase()] || 'quotation'
        const { error } = await supabase.from('projects').insert({
          name: row['Project Name'] || row['name'] || 'Untitled',
          client: row['Client'] || row['client'] || '',
          architect: row['Architect'] || '',
          contractor: row['Contractor'] || '',
          value: parseFloat(row['Value']) || null,
          current_stage: stage,
          status: 'active',
          start_date: row['Start Date'] || null,
          completion_date: row['Completion Date'] || null,
          next_action: row['Next Action'] || '',
          notes: row['Notes'] || '',
          project_manager_id: user?.id,
        })
        if (!error) imported++
      }
      toast.success(t('proj_toast_imported').replace('{n}', String(imported)))
      loadProjects()
    }
    reader.readAsArrayBuffer(file)
    e.target.value = ''
  }

  return (
    <div className="p-3 md:p-5 max-w-7xl mx-auto">
      {/* Header — compact on mobile */}
      <div className="flex items-center justify-between mb-3">
        <div>
          <h1 className="text-lg font-semibold text-stone-900">{t('proj_title')}</h1>
          <p className="text-xs text-stone-400">{filtered.length} / {projects.length}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportToExcel} className="btn-secondary text-xs py-1.5 px-2.5 hidden md:flex items-center gap-1">
            <Download size={12}/> {t('proj_export')}
          </button>
          <button onClick={() => importRef.current?.click()} className="btn-secondary text-xs py-1.5 px-2.5 hidden md:flex items-center gap-1">
            <Upload size={12}/> {t('proj_import')}
          </button>
          <input ref={importRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={importFromExcel}/>
          <Link href="/projects/new" className="btn-primary flex items-center gap-1.5 text-sm py-1.5 px-3">
            <Plus size={13}/> {t('proj_new')}
          </Link>
        </div>
      </div>

      {/* Filters — compact */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <div className="relative flex-1 min-w-0">
          <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400"/>
          <input className="input pl-8 py-1.5 text-sm" placeholder={t('proj_search')}
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <select className="input py-1.5 text-sm w-auto" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
          <option value="all">{t('proj_all')}</option>
          <option value="active">{t('proj_active')}</option>
          <option value="complete">{t('proj_complete')}</option>
          <option value="on_hold">{t('proj_on_hold')}</option>
        </select>
        <select className="input py-1.5 text-sm w-auto" value={stageFilter} onChange={e => setStageFilter(e.target.value)}>
          <option value="all">{t('proj_all_stages')}</option>
          {STAGES.map(s => <option key={s} value={s}>{t(STAGE_CONFIG[s].labelKey)}</option>)}
        </select>
        <div className="hidden md:flex items-center gap-1 border border-stone-200 rounded-lg p-0.5">
          <button onClick={() => setView('list')} className={`p-1.5 rounded ${view === 'list' ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
            <List size={14} className="text-stone-600"/>
          </button>
          <button onClick={() => setView('grid')} className={`p-1.5 rounded ${view === 'grid' ? 'bg-stone-100' : 'hover:bg-stone-50'}`}>
            <Grid size={14} className="text-stone-600"/>
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-20 text-center">
          <p className="text-stone-400 text-sm">{t('proj_none_found')}</p>
          <Link href="/projects/new" className="btn-primary inline-flex items-center gap-2 mt-4">
            <Plus size={14}/> {t('proj_create_first')}
          </Link>
        </div>
      ) : view === 'list' ? (
        <>
        {/* Mobile card view */}
        <div className="md:hidden space-y-2">
          {filtered.map(p => {
            const sc = STAGE_CONFIG[p.current_stage]
            const isComplete = p.status === 'complete'
            return (
              <Link key={p.id} href={`/projects/${p.id}`}
                className="card p-4 block"
                style={isComplete ? { borderLeft: '3px solid #6B7C63' } : {}}>
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className={`font-semibold text-sm leading-snug ${isComplete ? 'text-stone-400' : 'text-stone-900'}`}>{p.name}</p>
                    <p className="text-xs text-stone-400 mt-0.5">{p.client}</p>
                  </div>
                  <span className="badge text-xs flex-shrink-0 mt-0.5" style={{ background: sc.bg, color: sc.color }}>{t(sc.labelKey)}</span>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="flex items-center gap-1">
                    {p.project_manager && (
                      <div className="flex items-center gap-1">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: p.project_manager.color || '#10B981', fontSize: '9px' }}>
                          {p.project_manager.full_name?.slice(0, 1)}
                        </div>
                        <span className="text-xs text-stone-500">{p.project_manager.full_name?.split(' ')[0]}</span>
                      </div>
                    )}
                    {p.team_members?.filter((m: any) => m.user.id !== p.project_manager_id).map((m: any) => (
                      <div key={m.user.id} className="flex items-center gap-1">
                        <div className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: m.user.color || '#10B981', fontSize: '9px' }}>
                          {m.user.full_name?.slice(0, 1)}
                        </div>
                        <span className="text-xs text-stone-500">{m.user.full_name?.split(' ')[0]}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-stone-400">
                    {p.value && <span>£{Number(p.value).toLocaleString()}</span>}
                    {p.completion_date && <span>{format(parseISO(p.completion_date), 'd MMM yy')}</span>}
                    {isComplete && <span className="text-green-600 font-medium">✓ {t('proj_done')}</span>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>

        {/* Desktop table view */}
        <div className="hidden md:block card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-stone-100 bg-stone-50">
                <th className="text-left px-5 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wide">{t('proj_col_project')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wide">{t('proj_col_client')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wide">{t('proj_col_stage')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wide">{t('proj_col_team')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wide">{t('proj_col_value')}</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wide">{t('proj_col_completion')}</th>
                <th className="px-4 py-3"/>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-50">
              {filtered.map(p => {
                const sc = STAGE_CONFIG[p.current_stage]
                const isComplete = p.status === 'complete'
                return (
                  <tr key={p.id} className="hover:bg-stone-50 group transition-colors"
                    style={isComplete ? { borderLeft: '3px solid #6B7C63' } : { borderLeft: '3px solid transparent' }}>
                    <td className="px-5 py-3.5">
                      <Link href={`/projects/${p.id}`} className="block">
                        <div className="flex items-center gap-2">
                          <div className={`font-medium text-sm transition-colors ${isComplete ? 'text-stone-500' : 'text-stone-900 group-hover:text-brand-600'}`}>
                            {p.name}
                          </div>
                          {isComplete && (
                            <span className="text-xs font-medium px-1.5 py-0.5 rounded-full flex-shrink-0"
                              style={{ background: '#ECEFEB', color: '#6B7C63' }}>✓ {t('proj_complete')}</span>
                          )}
                        </div>
                        {p.reference && <div className="text-xs text-stone-400 mt-0.5">{p.reference}</div>}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-stone-600">{p.client}</td>
                    <td className="px-4 py-3.5">
                      <span className="badge text-xs" style={{ background: sc.bg, color: sc.color }}>{t(sc.labelKey)}</span>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 flex-wrap">
                        {p.project_manager && (
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                              style={{ background: p.project_manager.color || '#10B981' }}>
                              {p.project_manager.full_name?.slice(0, 1)}
                            </div>
                            <span className="text-xs text-stone-600">{p.project_manager.full_name?.split(' ')[0]}</span>
                          </div>
                        )}
                        {p.team_members?.filter((m: any) => m.user.id !== p.project_manager_id).map((m: any) => (
                          <div key={m.user.id} className="flex items-center gap-1">
                            <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                              style={{ background: m.user.color || '#10B981' }}>
                              {m.user.full_name?.slice(0, 1)}
                            </div>
                            <span className="text-xs text-stone-600">{m.user.full_name?.split(' ')[0]}</span>
                          </div>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-sm text-stone-600">
                      {p.value ? `£${Number(p.value).toLocaleString()}` : '—'}
                    </td>
                    <td className="px-4 py-3.5 text-sm text-stone-400">
                      {p.completion_date ? format(parseISO(p.completion_date), 'd MMM yyyy') : '—'}
                    </td>
                    <td className="px-4 py-3.5">
                      <Link href={`/projects/${p.id}`} className="text-stone-300 group-hover:text-brand-500 transition-colors">
                        <ChevronRight size={16}/>
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        </>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(p => {
            const sc = STAGE_CONFIG[p.current_stage]
            const isComplete = p.status === 'complete'
            return (
              <Link key={p.id} href={`/projects/${p.id}`}
                className="card p-5 hover:shadow-card-hover transition-shadow group"
                style={isComplete ? { borderTop: '3px solid #6B7C63' } : undefined}>
                <div className="flex items-start justify-between mb-3">
                  <span className="badge text-xs" style={{ background: sc.bg, color: sc.color }}>{t(sc.labelKey)}</span>
                  {isComplete ? (
                    <span className="flex items-center gap-0.5 text-xs font-medium px-1.5 py-0.5 rounded-full"
                      style={{ background: '#ECEFEB', color: '#6B7C63' }}>
                      ✓ {t('proj_complete')}
                    </span>
                  ) : p.value ? (
                    <span className="text-xs text-stone-400">£{p.value.toLocaleString()}</span>
                  ) : null}
                </div>
                <h3 className={`font-semibold transition-colors mb-1 ${isComplete ? 'text-stone-600' : 'text-stone-900 group-hover:text-brand-600'}`}>{p.name}</h3>
                <p className="text-sm text-stone-500 mb-4">{p.client}</p>
                {p.next_action && (
                  <div className="text-xs text-stone-400 bg-stone-50 rounded-lg px-3 py-2 mb-3">
                    {t('proj_next')} {p.next_action}
                  </div>
                )}
                <div className="flex items-center justify-between">
                  {p.project_manager && (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                        style={{ background: p.project_manager.color || '#10B981' }}>
                        {p.project_manager.full_name?.slice(0, 1)}
                      </div>
                      <span className="text-xs text-stone-400">{p.project_manager.full_name?.split(' ')[0]}</span>
                    </div>
                  )}
                  {p.completion_date && (
                    <span className="text-xs text-stone-400">{format(parseISO(p.completion_date), 'd MMM yyyy')}</span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ProjectsPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/></div>}>
      <ProjectsInner />
    </Suspense>
  )
}

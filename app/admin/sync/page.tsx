'use client'
import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { STAGE_CONFIG, ProjectStage } from '@/types'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'
import {
  Upload, ArrowLeft, FileSpreadsheet, RefreshCw,
  CheckCircle, AlertTriangle, ArrowRight, Loader2,
  ChevronDown, ChevronUp, Calendar, FileText, Info
} from 'lucide-react'
import { format, parseISO } from 'date-fns'

const STAGE_KEYS = Object.keys(STAGE_CONFIG) as ProjectStage[]

// Maps Excel column headers (row 12 in each sheet) → our stage keys
const SCOPE_COL_TO_STAGE: Record<string, ProjectStage> = {
  'material approval': 'material_approval',
  'templating': 'templating',
  'shop drawings submission': 'drawings_submission',
  'shop drawings approval': 'drawings_approval',
  'fabrication': 'fabrication',
  'shipping': 'shipping',
  'delivery onsite': 'delivery',
  'installation': 'installation',
  'snagging': 'snagging',
  'handover': 'handover',
}

const STATUS_NORMALISE: Record<string, string> = {
  'approved': 'approved', 'done': 'done', 'submitted': 'submitted',
  'finished': 'done', 'completed': 'done', 'delivered': 'delivered',
  'started': 'started', 'planned': 'planned', 'awaiting submission': 'awaiting',
  'omitted from scope': 'omitted', 'omitted': 'omitted',
}

function excelSerialToDate(val: any): string | null {
  if (!val) return null
  if (val instanceof Date) return format(val, 'yyyy-MM-dd')
  const s = String(val).trim()
  // Already ISO-ish e.g. "2026-05-02 00:00:00"
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  return null
}

// ── Types ──────────────────────────────────────────────────────────────────
interface ParsedScopeItem {
  description: string
  statuses: Record<string, string>   // stage -> status
  dates: Record<string, string>      // stage -> date
}

interface ParsedProject {
  sheetName: string
  pm: string
  name: string
  architect: string
  client: string
  contact: string
  email: string
  phone: string
  address: string
  scopeItems: ParsedScopeItem[]
  remarks: string[]
  // Computed
  matchedProjectId?: string
  matchedProjectName?: string
  currentStage?: ProjectStage
  changes: { field: string; label: string; old: string; new: string }[]
  action: 'update' | 'create' | 'skip'
  expanded?: boolean
  status: 'pending' | 'syncing' | 'done' | 'failed'
  error?: string
}

interface ParsedInstallRow {
  projectLabel: string
  dates: string[] // ISO dates this project's installer is on site
  matchedProjectId?: string
  matchedProjectName?: string
  action: 'update' | 'skip'
  status: 'pending' | 'syncing' | 'done' | 'failed'
}

// ── Parser: Progress Report Excel (one sheet per project) ──────────────────
function parseProgressReportWorkbook(wb: XLSX.WorkBook): ParsedProject[] {
  const results: ParsedProject[] = []

  wb.SheetNames.forEach(sheetName => {
    const ws = wb.Sheets[sheetName]
    const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })
    if (rows.length < 5) return

    const get = (label: string): string => {
      const row = rows.find(r => String(r[0] || '').trim().toLowerCase() === label.toLowerCase())
      return row ? String(row[1] || '').trim() : ''
    }

    const pm = get('Sales Team Member')
    const name = get('Name of the Project')
    if (!name) return // not a valid project sheet

    const architect = get('Architect / ID')
    const client = get('Client')
    const contact = get('Contact Person')
    const email = get('Contact Person E-mail')
    const phone = get('Contact Person Phone')
    const address = get('Address')

    // Find the scope table header row (contains "Description" in col 0)
    const headerIdx = rows.findIndex(r => String(r[0] || '').trim().toLowerCase() === 'description')
    const remarksIdx = rows.findIndex(r => String(r[0] || '').trim().toLowerCase() === 'remarks')

    const scopeItems: ParsedScopeItem[] = []
    if (headerIdx >= 0) {
      const headerRow = rows[headerIdx].map(c => String(c || '').trim().toLowerCase())
      const colToStage: Record<number, ProjectStage> = {}
      headerRow.forEach((h, i) => {
        if (SCOPE_COL_TO_STAGE[h]) colToStage[i] = SCOPE_COL_TO_STAGE[h]
      })

      const endIdx = remarksIdx >= 0 ? remarksIdx : rows.length
      for (let i = headerIdx + 1; i < endIdx; i++) {
        const row = rows[i]
        const desc = String(row[0] || '').trim()
        if (!desc) continue
        // This is a description row; status is on same row, dates may be on next row
        const statuses: Record<string, string> = {}
        Object.entries(colToStage).forEach(([colIdx, stage]) => {
          const raw = String(row[parseInt(colIdx)] || '').trim().toLowerCase()
          if (raw && STATUS_NORMALISE[raw]) statuses[stage] = STATUS_NORMALISE[raw]
        })
        // Check next row for dates (numeric-only row aligned to same columns)
        const dates: Record<string, string> = {}
        const nextRow = rows[i + 1]
        if (nextRow) {
          const nextDesc = String(nextRow[0] || '').trim()
          // date row has no description text, just dates shifted into present columns
          if (!nextDesc || /^\d{4}-\d{2}-\d{2}/.test(nextDesc)) {
            // dates can be packed without empty cells - map sequentially to stages that have a status set
            const dateVals = nextRow.map((c: any) => excelSerialToDate(c)).filter(Boolean) as string[]
            const stagesWithStatus = Object.keys(statuses)
            dateVals.forEach((d, idx) => {
              if (stagesWithStatus[idx]) dates[stagesWithStatus[idx]] = d
            })
          }
        }
        scopeItems.push({ description: desc, statuses, dates })
      }
    }

    // Remarks
    const remarks: string[] = []
    if (remarksIdx >= 0) {
      for (let i = remarksIdx + 1; i < rows.length; i++) {
        const text = rows[i].filter(c => c).join(' ').trim()
        if (text) remarks.push(text)
      }
    }

    results.push({
      sheetName, pm, name, architect, client, contact, email, phone, address,
      scopeItems, remarks, changes: [], action: 'create', status: 'pending'
    })
  })

  return results
}

// ── Parser: Installation Programme Excel (calendar style) ──────────────────
function parseInstallProgrammeWorkbook(wb: XLSX.WorkBook): ParsedInstallRow[] {
  const ws = wb.Sheets[wb.SheetNames[0]]
  const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })

  const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December']
  const results: ParsedInstallRow[] = []

  let currentMonth: number | null = null
  let colToDay: Record<number, number> = {}

  rows.forEach((row, i) => {
    // Detect month header row
    row.forEach((cell, j) => {
      const cellStr = String(cell || '').trim()
      const monthIdx = monthNames.findIndex(m => m === cellStr)
      if (monthIdx >= 0) {
        currentMonth = monthIdx + 1
        colToDay = {}
        row.forEach((c, jj) => {
          const n = parseInt(String(c))
          if (!isNaN(n) && n >= 1 && n <= 31) colToDay[jj] = n
        })
      }
    })

    // Detect project row (has text in col 2, not a header keyword)
    const label = String(row[2] || '').trim()
    if (label && !['Teams', 'Cemal', ''].includes(label) && currentMonth) {
      const days: number[] = []
      row.forEach((c, j) => {
        if (j === 2) return
        const n = parseInt(String(c))
        if (!isNaN(n) && n >= 1 && n <= 31) days.push(n)
      })
      if (days.length) {
        const dates = days.sort((a, b) => a - b).map(d => `2026-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`)
        results.push({ projectLabel: label, dates, action: 'update', status: 'pending' })
      }
    }
  })

  return results
}

// ── Component ──────────────────────────────────────────────────────────────
type FileKind = 'progress' | 'installation'

export default function SyncPage() {
  const router = useRouter()
  const progressFileRef = useRef<HTMLInputElement>(null)
  const installFileRef = useRef<HTMLInputElement>(null)

  const [authUser, setAuthUser] = useState<any>(null)
  const [existingProjects, setExistingProjects] = useState<any[]>([])
  const [teamUsers, setTeamUsers] = useState<any[]>([])

  const [activeTab, setActiveTab] = useState<FileKind>('progress')

  // Progress report state
  const [progressRows, setProgressRows] = useState<ParsedProject[]>([])
  const [progressFileName, setProgressFileName] = useState('')
  const [progressStep, setProgressStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [progressSyncing, setProgressSyncing] = useState(false)
  const [progressDragging, setProgressDragging] = useState(false)

  // Installation programme state
  const [installRows, setInstallRows] = useState<ParsedInstallRow[]>([])
  const [installFileName, setInstallFileName] = useState('')
  const [installStep, setInstallStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [installSyncing, setInstallSyncing] = useState(false)
  const [installDragging, setInstallDragging] = useState(false)

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      supabase.from('users').select('*').eq('id', data.user.id).single()
        .then(({ data: profile }) => setAuthUser(profile))
    })
    supabase.from('projects').select(`*, milestones:project_milestones(*)`).then(({ data }) => setExistingProjects(data || []))
    supabase.from('users').select('*').then(({ data }) => setTeamUsers(data || []))
  }, [])

  function findMatchingProject(parsedName: string, sheetName: string): any {
    const lower = parsedName.toLowerCase()
    const lowerSheet = sheetName.toLowerCase()
    return existingProjects.find(p => {
      const pName = p.name.toLowerCase()
      return pName.includes(lowerSheet) || pName.includes(lower) || lower.includes(pName.split(' — ')[0]?.toLowerCase() || '___')
    })
  }

  function findUserId(name: string): string | null {
    if (!name) return null
    const match = teamUsers.find(u => u.full_name?.toLowerCase().includes(name.toLowerCase().split(' ')[0]))
    return match?.id || null
  }

  // ── PROGRESS REPORT HANDLERS ──
  function processProgressFile(file: File) {
    setProgressFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array', cellDates: true })
      const parsed = parseProgressReportWorkbook(wb)

      const enriched = parsed.map(p => {
        const existing = findMatchingProject(p.name, p.sheetName)
        const changes: { field: string; label: string; old: string; new: string }[] = []

        if (existing) {
          const checks: [string, string, string][] = [
            ['client', 'Client', p.client],
            ['architect', 'Architect', p.architect],
            ['address', 'Address', p.address],
          ]
          checks.forEach(([field, label, newVal]) => {
            const oldVal = existing[field] || ''
            if (newVal && newVal !== oldVal) changes.push({ field, label, old: oldVal, new: newVal })
          })
          const latestRemark = p.remarks[p.remarks.length - 1] || ''
          if (latestRemark && latestRemark !== existing.notes) {
            changes.push({ field: 'notes', label: 'Latest remark', old: (existing.notes || '').slice(0, 40), new: latestRemark.slice(0, 40) })
          }
        }

        return {
          ...p,
          matchedProjectId: existing?.id,
          matchedProjectName: existing?.name,
          action: existing ? (changes.length ? 'update' as const : 'skip' as const) : 'create' as const,
          changes,
        }
      })

      setProgressRows(enriched)
      setProgressStep('preview')
    }
    reader.readAsArrayBuffer(file)
  }

  async function runProgressSync() {
    if (!authUser) return
    setProgressSyncing(true)
    let updated = 0, created = 0, skipped = 0, failed = 0

    for (let i = 0; i < progressRows.length; i++) {
      const row = progressRows[i]
      if (row.action === 'skip') { skipped++; continue }

      setProgressRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'syncing' } : r))

      try {
        const pmId = findUserId(row.pm)
        const latestRemark = row.remarks[row.remarks.length - 1] || ''

        const payload: any = {
          name: row.matchedProjectName || row.name,
          client: row.client,
          architect: row.architect || null,
          address: row.address || null,
          project_manager_id: pmId,
          notes: latestRemark || null,
          updated_at: new Date().toISOString(),
        }

        let projectId = row.matchedProjectId

        if (row.action === 'update' && projectId) {
          await supabase.from('projects').update(payload).eq('id', projectId)
          updated++
        } else if (row.action === 'create') {
          const { data } = await supabase.from('projects').insert({ ...payload, current_stage: 'quotation', status: 'active' }).select().single()
          projectId = data?.id
          created++
        }

        if (projectId) {
          // Sync scope items
          await supabase.from('project_scope_items').delete().eq('project_id', projectId)
          for (let si = 0; si < row.scopeItems.length; si++) {
            const item = row.scopeItems[si]
            const insertData: any = { project_id: projectId, description: item.description, sort_order: si }
            Object.entries(item.statuses).forEach(([stage, status]) => { insertData[stage] = status })
            Object.entries(item.dates).forEach(([stage, date]) => { insertData[`${stage}_date`] = date })
            await supabase.from('project_scope_items').insert(insertData)
          }

          await supabase.from('activity_log').insert({
            project_id: projectId, user_id: authUser.id,
            action: `synced from progress report Excel (${row.scopeItems.length} scope items)`,
          })
        }

        setProgressRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'done' } : r))
      } catch (err: any) {
        failed++
        setProgressRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'failed', error: err.message } : r))
      }
    }

    setProgressSyncing(false)
    setProgressStep('done')
    toast.success(`Synced: ${updated} updated, ${created} created, ${skipped} skipped`)
    supabase.from('projects').select(`*, milestones:project_milestones(*)`).then(({ data }) => setExistingProjects(data || []))
  }

  // ── INSTALLATION PROGRAMME HANDLERS ──
  function processInstallFile(file: File) {
    setInstallFileName(file.name)
    const reader = new FileReader()
    reader.onload = (e) => {
      const wb = XLSX.read(new Uint8Array(e.target?.result as ArrayBuffer), { type: 'array', cellDates: true })
      const parsed = parseInstallProgrammeWorkbook(wb)

      const enriched = parsed.map(row => {
        const existing = existingProjects.find(p =>
          p.name.toLowerCase().includes(row.projectLabel.toLowerCase()) ||
          row.projectLabel.toLowerCase().includes(p.name.toLowerCase().split(' — ')[0]?.toLowerCase() || '___') ||
          row.projectLabel.toLowerCase().includes(p.name.toLowerCase().split(' ')[0]?.toLowerCase() || '___')
        )
        return { ...row, matchedProjectId: existing?.id, matchedProjectName: existing?.name, action: existing ? 'update' as const : 'skip' as const }
      })

      setInstallRows(enriched)
      setInstallStep('preview')
    }
    reader.readAsArrayBuffer(file)
  }

  async function runInstallSync() {
    if (!authUser) return
    setInstallSyncing(true)
    let updated = 0, skipped = 0

    for (let i = 0; i < installRows.length; i++) {
      const row = installRows[i]
      if (row.action === 'skip' || !row.matchedProjectId) { skipped++; continue }

      setInstallRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'syncing' } : r))

      const firstDate = row.dates[0]
      const lastDate = row.dates[row.dates.length - 1]

      await supabase.from('project_milestones').upsert({
        project_id: row.matchedProjectId, stage: 'installation', status: 'planned', planned_date: firstDate,
      }, { onConflict: 'project_id,stage' })

      await supabase.from('activity_log').insert({
        project_id: row.matchedProjectId, user_id: authUser.id,
        action: `synced installation programme — ${row.dates.length} day(s) scheduled`,
        details: `${firstDate} to ${lastDate}`,
      })

      updated++
      setInstallRows(prev => prev.map((r, idx) => idx === i ? { ...r, status: 'done' } : r))
    }

    setInstallSyncing(false)
    setInstallStep('done')
    toast.success(`Installation dates synced: ${updated} updated`)
  }

  if (!authUser) return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={20} className="animate-spin" style={{ color: '#8C7F58' }}/>
    </div>
  )

  const progressCounts = {
    update: progressRows.filter(r => r.action === 'update').length,
    create: progressRows.filter(r => r.action === 'create').length,
    skip: progressRows.filter(r => r.action === 'skip').length,
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => router.back()} className="p-1.5 hover:bg-stone-100 rounded-md text-stone-500">
          <ArrowLeft size={17}/>
        </button>
        <div>
          <h1 className="text-xl font-medium text-stone-900 tracking-tight">Sync from Excel</h1>
          <p className="text-sm text-stone-400 mt-0.5">
            Upload your two Stoneline Excel files to keep the app in sync.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 mb-6 border-b border-stone-200">
        <button onClick={() => setActiveTab('progress')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2
            ${activeTab === 'progress' ? 'border-brand-500 text-brand-600' : 'border-transparent text-stone-400 hover:text-stone-600'}`}>
          <FileText size={14}/> Project Progress Reports
        </button>
        <button onClick={() => setActiveTab('installation')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-2
            ${activeTab === 'installation' ? 'border-brand-500 text-brand-600' : 'border-transparent text-stone-400 hover:text-stone-600'}`}>
          <Calendar size={14}/> Installation Programme
        </button>
      </div>

      {/* ════════════ PROGRESS REPORTS TAB ════════════ */}
      {activeTab === 'progress' && (
        <div>
          {progressStep === 'upload' && (
            <div className="max-w-xl mx-auto">
              <div
                onDragOver={e => { e.preventDefault(); setProgressDragging(true) }}
                onDragLeave={() => setProgressDragging(false)}
                onDrop={e => { e.preventDefault(); setProgressDragging(false); const f = e.dataTransfer.files[0]; if (f) processProgressFile(f) }}
                onClick={() => progressFileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-14 text-center cursor-pointer transition-all
                  ${progressDragging ? 'border-brand-500 bg-brand-50' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'}`}>
                <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: '#F5F3EE' }}>
                  <FileSpreadsheet size={26} style={{ color: '#8C7F58' }}/>
                </div>
                <p className="text-sm font-medium text-stone-700 mb-1">Drop the Progress Reports Excel here</p>
                <p className="text-xs text-stone-400">One sheet per project — Stoneline UK Ongoing Project Progress Reports.xlsx</p>
                <input ref={progressFileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) processProgressFile(f); e.target.value = '' }}/>
              </div>
              <div className="mt-5 card p-4 flex items-start gap-2">
                <Info size={13} className="text-stone-400 mt-0.5 flex-shrink-0"/>
                <p className="text-xs text-stone-500">
                  This file should have one sheet per project (Meyrick, Lowndes, Luxembourg...) with PM, client, contact details,
                  scope items table, and remarks at the bottom — matching the format your PMs already use.
                </p>
              </div>
            </div>
          )}

          {progressStep === 'preview' && (
            <div>
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <div className="card px-5 py-3 flex items-center gap-5">
                  <div className="text-center"><div className="text-xl font-semibold" style={{ color: '#8C7F58' }}>{progressCounts.update}</div><div className="text-xs text-stone-400 uppercase tracking-wide">Updates</div></div>
                  <div className="w-px h-8 bg-stone-100"/>
                  <div className="text-center"><div className="text-xl font-semibold text-green-600">{progressCounts.create}</div><div className="text-xs text-stone-400 uppercase tracking-wide">New</div></div>
                  <div className="w-px h-8 bg-stone-100"/>
                  <div className="text-center"><div className="text-xl font-semibold text-stone-400">{progressCounts.skip}</div><div className="text-xs text-stone-400 uppercase tracking-wide">No change</div></div>
                </div>
                <div className="text-xs text-stone-400 flex items-center gap-1.5"><FileSpreadsheet size={12}/>{progressFileName}</div>
                <div className="ml-auto flex gap-2">
                  <button onClick={() => { setProgressStep('upload'); setProgressRows([]) }} className="btn-secondary text-sm py-2">← Re-upload</button>
                  <button onClick={runProgressSync} disabled={progressSyncing} className="btn-primary text-sm py-2 flex items-center gap-2 disabled:opacity-50">
                    {progressSyncing ? <><Loader2 size={14} className="animate-spin"/> Syncing…</> : <><RefreshCw size={14}/> Sync {progressCounts.update + progressCounts.create} project{(progressCounts.update + progressCounts.create) !== 1 ? 's' : ''}</>}
                  </button>
                </div>
              </div>

              <div className="card overflow-hidden">
                <table className="w-full border-collapse">
                  <thead><tr style={{ background: '#FAFAF8' }}>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wider w-5">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wider">Sheet / Project</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wider">PM</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wider">Scope items</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wider">Action</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wider">Changes</th>
                    <th className="px-4 py-3 w-8"/>
                  </tr></thead>
                  <tbody>
                    {progressRows.map((row, i) => {
                      const ac = { update: { label: 'Update', color: '#8C7F58', bg: '#F5F3EE' }, create: { label: 'New', color: '#10B981', bg: '#ECFDF5' }, skip: { label: 'No change', color: '#A8A29E', bg: '#F4F3F0' } }[row.action]
                      const st = { pending: { icon: '○', color: 'text-stone-300' }, syncing: { icon: '…', color: 'text-brand-500 animate-pulse' }, done: { icon: '✓', color: 'text-green-600' }, failed: { icon: '✗', color: 'text-red-500' } }[row.status]
                      return (
                        <>
                          <tr key={i} className={`border-t border-stone-50 transition-colors ${row.action === 'skip' ? 'opacity-50' : 'hover:bg-stone-50'} ${row.status === 'syncing' ? 'bg-brand-50' : ''}`}>
                            <td className={`px-4 py-3 text-sm font-bold ${st.color}`}>{st.icon}</td>
                            <td className="px-4 py-3">
                              <div className="text-sm font-medium text-stone-900">{row.matchedProjectName || row.name}</div>
                              <div className="text-xs text-stone-400 mt-0.5">Sheet: {row.sheetName} · {row.client}</div>
                            </td>
                            <td className="px-4 py-3 text-xs text-stone-500">{row.pm || '—'}</td>
                            <td className="px-4 py-3 text-xs text-stone-500">{row.scopeItems.length} items</td>
                            <td className="px-4 py-3"><span className="badge text-xs" style={{ background: ac.bg, color: ac.color }}>{ac.label}</span></td>
                            <td className="px-4 py-3 text-xs">
                              {row.action === 'update' && row.changes.length > 0 && (
                                <button onClick={() => setProgressRows(prev => prev.map((r, idx) => idx === i ? { ...r, expanded: !r.expanded } : r))}
                                  className="flex items-center gap-1 font-semibold hover:underline" style={{ color: '#8C7F58' }}>
                                  {row.changes.length} change{row.changes.length !== 1 ? 's' : ''}
                                  {row.expanded ? <ChevronUp size={11}/> : <ChevronDown size={11}/>}
                                </button>
                              )}
                              {row.action === 'create' && <span className="text-green-600 font-medium">New project</span>}
                              {row.error && <span className="text-red-500">{row.error}</span>}
                            </td>
                            <td className="px-4 py-3"/>
                          </tr>
                          {row.expanded && row.changes.length > 0 && (
                            <tr className="border-t border-stone-50"><td colSpan={7} className="px-6 py-4" style={{ background: '#FAFAF8' }}>
                              <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Changes</p>
                              <div className="space-y-2">
                                {row.changes.map((ch, ci) => (
                                  <div key={ci} className="flex items-start gap-3 text-xs bg-white rounded-lg p-2.5 border border-stone-100">
                                    <span className="font-semibold text-stone-500 w-32 flex-shrink-0 mt-0.5">{ch.label}</span>
                                    <div className="flex items-center gap-2 flex-1 min-w-0 flex-wrap">
                                      <span className="bg-red-50 text-red-500 line-through px-2 py-0.5 rounded max-w-xs truncate">{ch.old || '(empty)'}</span>
                                      <ArrowRight size={12} className="text-stone-300 flex-shrink-0"/>
                                      <span className="bg-green-50 text-green-700 font-semibold px-2 py-0.5 rounded max-w-xs truncate">{ch.new}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </td></tr>
                          )}
                        </>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {progressStep === 'done' && (
            <div className="max-w-xl mx-auto text-center">
              <div className="card p-8 mb-5">
                <CheckCircle size={36} className="text-green-500 mx-auto mb-3"/>
                <h2 className="text-lg font-medium text-stone-900 mb-1">Sync complete</h2>
                <p className="text-sm text-stone-400">{progressFileName}</p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => { setProgressStep('upload'); setProgressRows([]) }} className="btn-secondary flex items-center gap-2"><Upload size={14}/> Upload another</button>
                <button onClick={() => router.push('/projects')} className="btn-primary flex items-center gap-2">View projects →</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════ INSTALLATION PROGRAMME TAB ════════════ */}
      {activeTab === 'installation' && (
        <div>
          {installStep === 'upload' && (
            <div className="max-w-xl mx-auto">
              <div
                onDragOver={e => { e.preventDefault(); setInstallDragging(true) }}
                onDragLeave={() => setInstallDragging(false)}
                onDrop={e => { e.preventDefault(); setInstallDragging(false); const f = e.dataTransfer.files[0]; if (f) processInstallFile(f) }}
                onClick={() => installFileRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-14 text-center cursor-pointer transition-all
                  ${installDragging ? 'border-brand-500 bg-brand-50' : 'border-stone-200 hover:border-stone-300 hover:bg-stone-50'}`}>
                <div className="w-14 h-14 rounded-xl flex items-center justify-center mx-auto mb-4" style={{ background: '#F5F3EE' }}>
                  <Calendar size={26} style={{ color: '#8C7F58' }}/>
                </div>
                <p className="text-sm font-medium text-stone-700 mb-1">Drop the Installation Programme Excel here</p>
                <p className="text-xs text-stone-400">Calendar-style programme with installer schedule by day</p>
                <input ref={installFileRef} type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) processInstallFile(f); e.target.value = '' }}/>
              </div>
              <div className="mt-5 card p-4 flex items-start gap-2">
                <Info size={13} className="text-stone-400 mt-0.5 flex-shrink-0"/>
                <p className="text-xs text-stone-500">
                  This file shows which projects the installer is on site for, by month and day number.
                  The earliest day found is set as the Installation milestone date for that project.
                </p>
              </div>
            </div>
          )}

          {installStep === 'preview' && (
            <div>
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <div className="card px-5 py-3 flex items-center gap-5">
                  <div className="text-center"><div className="text-xl font-semibold" style={{ color: '#8C7F58' }}>{installRows.filter(r => r.action === 'update').length}</div><div className="text-xs text-stone-400 uppercase tracking-wide">Matched</div></div>
                  <div className="w-px h-8 bg-stone-100"/>
                  <div className="text-center"><div className="text-xl font-semibold text-stone-400">{installRows.filter(r => r.action === 'skip').length}</div><div className="text-xs text-stone-400 uppercase tracking-wide">Unmatched</div></div>
                </div>
                <div className="text-xs text-stone-400 flex items-center gap-1.5"><FileSpreadsheet size={12}/>{installFileName}</div>
                <div className="ml-auto flex gap-2">
                  <button onClick={() => { setInstallStep('upload'); setInstallRows([]) }} className="btn-secondary text-sm py-2">← Re-upload</button>
                  <button onClick={runInstallSync} disabled={installSyncing} className="btn-primary text-sm py-2 flex items-center gap-2 disabled:opacity-50">
                    {installSyncing ? <><Loader2 size={14} className="animate-spin"/> Syncing…</> : <><RefreshCw size={14}/> Sync dates</>}
                  </button>
                </div>
              </div>

              <div className="card overflow-hidden">
                <table className="w-full border-collapse">
                  <thead><tr style={{ background: '#FAFAF8' }}>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wider w-5">#</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wider">Excel label</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wider">Matched project</th>
                    <th className="text-left px-4 py-3 text-xs font-semibold text-stone-400 uppercase tracking-wider">Installation days</th>
                  </tr></thead>
                  <tbody>
                    {installRows.map((row, i) => {
                      const st = { pending: { icon: '○', color: 'text-stone-300' }, syncing: { icon: '…', color: 'text-brand-500 animate-pulse' }, done: { icon: '✓', color: 'text-green-600' }, failed: { icon: '✗', color: 'text-red-500' } }[row.status]
                      return (
                        <tr key={i} className={`border-t border-stone-50 ${row.action === 'skip' ? 'opacity-50' : 'hover:bg-stone-50'}`}>
                          <td className={`px-4 py-3 text-sm font-bold ${st.color}`}>{st.icon}</td>
                          <td className="px-4 py-3 text-sm font-medium text-stone-900">{row.projectLabel}</td>
                          <td className="px-4 py-3 text-sm text-stone-600">{row.matchedProjectName || <span className="text-amber-500">Not found</span>}</td>
                          <td className="px-4 py-3 text-xs text-stone-500">{row.dates[0]} → {row.dates[row.dates.length - 1]} ({row.dates.length} days)</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {installStep === 'done' && (
            <div className="max-w-xl mx-auto text-center">
              <div className="card p-8 mb-5">
                <CheckCircle size={36} className="text-green-500 mx-auto mb-3"/>
                <h2 className="text-lg font-medium text-stone-900 mb-1">Installation dates synced</h2>
                <p className="text-sm text-stone-400">{installFileName}</p>
              </div>
              <div className="flex items-center justify-center gap-3">
                <button onClick={() => { setInstallStep('upload'); setInstallRows([]) }} className="btn-secondary flex items-center gap-2"><Upload size={14}/> Upload another</button>
                <button onClick={() => router.push('/timeline')} className="btn-primary flex items-center gap-2">View timeline →</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

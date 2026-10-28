'use client'
import { useEffect, useState, useRef } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { STAGE_CONFIG, TASK_STATUS_CONFIG } from '@/types'
import { format, parseISO, isPast, isToday, isThisWeek, startOfWeek, endOfWeek, addDays } from 'date-fns'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts'
import { Download, FileText, TrendingUp, AlertTriangle, Truck, Wrench, Bell, Phone, Mail, FileDown, Folder, ChevronDown, ChevronUp, X, Upload } from 'lucide-react'
import * as XLSX from 'xlsx'
import toast from 'react-hot-toast'

const SALES_STATUS_TYPES = [
  { value: 'outreach',             label: 'Outreach',             color: '#6B7280' },
  { value: 'new_project',          label: 'New Project',          color: '#3B82F6' },
  { value: 'project_in_progress',  label: 'Project In Progress',  color: '#F59E0B' },
  { value: 'won',                  label: 'Won',                  color: '#10B981' },
  { value: 'closed',               label: 'Closed',                color: '#EF4444' },
  { value: 'other',                label: 'Other',                color: '#8B5CF6' },
]

const SALES_ROLE_TYPES: Record<string, string> = {
  end_user_client: 'End User Client',
  architect: 'Architect',
  contractor: 'Contractor',
  developer: 'Developer',
  supplier: 'Supplier',
  other: 'Other',
}

const TOUCHPOINT_TYPE_LABELS: Record<string, string> = {
  email: 'Email', call: 'Call', letter: 'Physical Letter', meeting: 'Meeting',
  sr_walk_in: 'SR Walk In', sr_meeting: 'SR Meeting', visit: 'Visit', site_visit: 'Visit',
  online_meeting: 'Online Meeting', l_and_l_mtb: 'L&L/MtB', physical_touchpoint: 'Physical Touchpoint',
  quotation_request: 'Quotation Request', sample_request: 'Sample Request', sample_marketing: 'Sample Request',
  other: 'Other',
}

const TOUCHPOINT_TYPE_COLORS: Record<string, string> = {
  email: '#3B82F6', call: '#10B981', letter: '#78716C', meeting: '#8B5CF6',
  sr_walk_in: '#F97316', sr_meeting: '#EC4899', visit: '#F59E0B', site_visit: '#F59E0B',
  online_meeting: '#0EA5E9', l_and_l_mtb: '#8B5CF6', physical_touchpoint: '#DC7633',
  quotation_request: '#6366F1', sample_request: '#14B8A6', sample_marketing: '#14B8A6',
  other: '#6B7280',
}

// The complete, current action type list grouped by category — same set and
// order as the Log Action dropdown. Used so the chart always shows every
// type (even ones with zero logged actions yet), not just ones with data.
const TOUCHPOINT_TYPES_FULL = [
  { value: 'email',               label: 'Email',               color: '#3B82F6', category: 'Communication' },
  { value: 'call',                label: 'Call',                color: '#10B981', category: 'Communication' },
  { value: 'sr_walk_in',          label: 'SR Walk In',          color: '#F97316', category: 'Meeting' },
  { value: 'sr_meeting',          label: 'SR Meeting',          color: '#EC4899', category: 'Meeting' },
  { value: 'visit',               label: 'Visit',               color: '#F59E0B', category: 'Meeting' },
  { value: 'online_meeting',      label: 'Online Meeting',      color: '#0EA5E9', category: 'Meeting' },
  { value: 'l_and_l_mtb',         label: 'L&L/MtB',             color: '#8B5CF6', category: 'Meeting' },
  { value: 'physical_touchpoint', label: 'Physical Touchpoint', color: '#DC7633', category: 'Meeting' },
  { value: 'quotation_request',   label: 'Quotation Request',   color: '#6366F1', category: 'Quotation Request' },
  { value: 'sample_request',      label: 'Sample Request',      color: '#14B8A6', category: 'Sample Request' },
  { value: 'other',               label: 'Other',               color: '#6B7280', category: 'Other' },
]

function normalizeActionType(value: string) {
  if (value === 'site_visit') return 'visit'
  if (value === 'sample_marketing') return 'sample_request'
  return value
}

// Mirrors salestracking/page.tsx's own definitions, so colors/labels stay
// consistent between the Sales page and this weekly report.
const DEAL_STAGES = [
  { id: 'designer_requested',  label: 'Designer Requested',  color: '#8B5CF6' },
  { id: 'general_pricing',     label: 'General Pricing',     color: '#3B82F6' },
  { id: 'contractor_tender',   label: 'Contractor Tender',   color: '#F59E0B' },
  { id: 'end_user_price',      label: 'End User Price',      color: '#10B981' },
  { id: 'value_engineering',   label: 'Value Engineering',   color: '#0D9488' },
  { id: 'expected_to_close',   label: 'Expected to Close',   color: '#F97316' },
  { id: 'closed_won',          label: 'Closed Won',          color: '#059669' },
]

const LEAD_STAGES = [
  { id: 'needs_analysis',       label: 'Needs Analysis',       color: '#8B5CF6' },
  { id: 'early_stage_design',   label: 'Early Stage Design',   color: '#3B82F6' },
  { id: 'developed_design',     label: 'Developed Design',     color: '#0EA5E9' },
  { id: 'technical_drawings',   label: 'Technical Drawings',   color: '#F59E0B' },
  { id: 'need_to_quote',        label: 'Need to Quote',        color: '#10B981' },
  { id: 'closed_lost',          label: 'Closed Lost',          color: '#EF4444' },
]

const SAMPLE_STAGES = [
  { id: 'client_requested',      label: 'Client Requested',      color: '#8B5CF6' },
  { id: 'requested_from_tr',     label: 'Requested from TR',     color: '#3B82F6' },
  { id: 'sent_from_uk',          label: 'Sent from UK',          color: '#0EA5E9' },
  { id: 'in_transit_from_tr',    label: 'In Transit from TR',    color: '#F97316' },
  { id: 'delivered_from_uk',     label: 'Delivered from UK',     color: '#10B981' },
  { id: 'delivered_from_tr',     label: 'Delivered from TR',     color: '#059669' },
  { id: 'check_in_with_client',  label: 'Check in with Client',  color: '#EC4899' },
]

const PROJECT_TYPES: Record<string, { label: string; color: string }> = {
  slab_only:      { label: 'Slab Only',       color: '#8C7F58' },
  cut_to_size:    { label: 'Cut to Size',      color: '#7C3AED' },
  supply_install: { label: 'Supply & Install', color: '#0D9488' },
}

export default function ReportsPage() {
  const { t } = useLanguage()
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeReport, setActiveReport] = useState<string | null>(null)
  const [exportingPdf, setExportingPdf] = useState(false)
  const [exportingProject, setExportingProject] = useState(false)
  const [exportingSales, setExportingSales] = useState(false)
  const [exportingMonthly, setExportingMonthly] = useState(false)
  const [archivedReports, setArchivedReports] = useState<any[]>([])
  const [showArchive, setShowArchive] = useState(false)
  const [showMoreExports, setShowMoreExports] = useState(false)
  const [currentUserName, setCurrentUserName] = useState('')
  const [currentUserId, setCurrentUserId] = useState('')
  const [showWeeklyBreakdown, setShowWeeklyBreakdown] = useState(false)
  const [reportView, setReportView] = useState<'all' | 'projects' | 'sales'>('all')
  const [projectsOpen, setProjectsOpen] = useState(true)
  const [salesOpen, setSalesOpen] = useState(true)
  const [myAllTouchpoints, setMyAllTouchpoints] = useState<any[]>([])
  const [loadingBreakdown, setLoadingBreakdown] = useState(false)
  const [expandedWeek, setExpandedWeek] = useState<string | null>(null)
  const reportRef = useRef<HTMLDivElement>(null)

  useEffect(() => { loadData() }, [])
  useEffect(() => { loadArchivedReports() }, [currentUserName, data?.isAdmin])

  async function loadArchivedReports() {
    const { data: files } = await supabase.storage.from('weekly-reports').list('', { sortBy: { column: 'name', order: 'desc' } })
    const all = files || []
    const filtered = all.filter(f => {
      if (f.name.startsWith('project-report-')) return true // shared, everyone sees it
      if (f.name.startsWith('pipeline-archive-')) return true // shared, everyone sees it
      if (f.name.startsWith('sales-report-')) return true // shared combined report, everyone sees it
      return true // anything manually exported earlier, keep visible
    })
    setArchivedReports(filtered)
  }

  function pdfHeader(pdf: any, title: string, subtitle: string) {
    // Clean white page — just a thin brown rule and quiet type
    pdf.setFillColor(255, 255, 255)
    pdf.rect(0, 0, 210, 297, 'F')
    // thin top rule
    pdf.setFillColor(154, 122, 79)
    pdf.rect(16, 14, 178, 0.4, 'F')
    // KEYSTONE kicker
    pdf.setFontSize(7); pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(154, 122, 79)
    pdf.text('KEYSTONE  ·  STONELINE UK', 16, 11, { charSpace: 1.2 })
    // Title
    pdf.setFontSize(20); pdf.setFont('helvetica', 'bold')
    pdf.setTextColor(30, 25, 20)
    pdf.text(title, 16, 24)
    pdf.setFont('helvetica', 'normal')
    // Date
    pdf.setFontSize(9); pdf.setTextColor(140, 130, 115)
    pdf.text(subtitle, 16, 31)
    // bottom rule of header zone
    pdf.setFillColor(220, 210, 190)
    pdf.rect(16, 34, 178, 0.3, 'F')
  }

  function pdfSectionTitle(pdf: any, text: string, y: number): number {
    pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal')
    pdf.setTextColor(154, 122, 79)
    pdf.text(text.toUpperCase(), 16, y, { charSpace: 1.5 })
    pdf.setFillColor(220, 210, 190)
    pdf.rect(16, y + 2, 178, 0.25, 'F')
    pdf.setFont('helvetica', 'normal')
    return y + 8
  }

  function pdfDataTable(pdf: any, dist: { name: string; value: number }[], x: number, y: number): number {
    const filtered = dist.filter(d => d.value > 0)
    if (filtered.length === 0) {
      pdf.setFontSize(9); pdf.setTextColor(160, 150, 135)
      pdf.text('No data', x, y)
      return y + 6
    }
    const total = filtered.reduce((sum, d) => sum + d.value, 0)
    pdf.setFontSize(9)
    filtered.forEach(d => {
      pdf.setTextColor(50, 45, 38)
      pdf.text(d.name, x, y)
      pdf.setFont('helvetica', 'bold')
      pdf.text(String(d.value), x + 165, y, { align: 'right' })
      pdf.setFont('helvetica', 'normal')
      y += 6.5
      pdf.setFillColor(235, 228, 215)
      pdf.rect(x, y - 2.8, 165, 0.2, 'F')
    })
    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(50, 44, 38)
    pdf.text('Total', x, y)
    pdf.text(String(total), x + 165, y, { align: 'right' })
    return y + 8
  }

  async function exportProjectReportPDF() {
    if (!data) return
    setExportingProject(true)
    try {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF('p', 'mm', 'a4')
      let y = 46
      pdfHeader(pdf, 'Weekly Project Report', format(new Date(), 'EEEE d MMMM yyyy'))

      // ---- Summary: four plain numbers, no filled cards ----
      const cards = [
        { label: 'ACTIVE PROJECTS', value: data.active },
        { label: 'COMPLETE', value: data.complete },
        { label: 'OVERDUE TASKS', value: data.overdue.length },
        { label: 'ESTIMATES', value: data.estimatesTotal || 0 },
      ]
      const cardW = 43, cardX0 = 16
      cards.forEach((c, i) => {
        const x = cardX0 + i * (cardW + 3.5)
        // thin top rule per column
        pdf.setFillColor(220, 210, 190); pdf.rect(x, y, cardW, 0.3, 'F')
        pdf.setFontSize(22); pdf.setFont('helvetica', 'normal')
        pdf.setTextColor(30, 25, 20)
        pdf.text(String(c.value), x, y + 11)
        pdf.setFont('helvetica', 'normal')
        pdf.setFontSize(6.5); pdf.setTextColor(154, 122, 79)
        pdf.text(c.label, x, y + 17, { charSpace: 0.5 })
      })
      y += 28

      // ---- Project Status: one roomy card-row per project ----
      // Where each project is, its next dated milestone, and the concrete
      // next action. Actionable, unlike a bare count.
      y = pdfSectionTitle(pdf, 'Project Status · What Each Needs Next', y)
      const ps = data.projectStatus || []
      if (ps.length === 0) {
        pdf.setFontSize(9); pdf.setTextColor(120, 113, 108); pdf.text('No active projects', 16, y); y += 6
      } else {
        ps.forEach((p: any) => {
          if (y > 270) { pdf.addPage(); y = 22 }
          const overdue = p.nextActionDate ? (isPast(parseISO(p.nextActionDate)) && !isToday(parseISO(p.nextActionDate))) : false
          // top hairline rule
          pdf.setFillColor(235, 228, 215); pdf.rect(16, y, 178, 0.2, 'F')
          y += 3.5
          // project name
          pdf.setFontSize(9.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(30, 25, 20)
          pdf.text((p.name || '').slice(0, 42), 16, y)
          // stage — right aligned at centre
          pdf.setFontSize(8.5); pdf.setTextColor(100, 90, 75)
          pdf.text((p.stageLabel || '').slice(0, 22), 110, y)
          // date — right edge
          if (p.nextActionDate) {
            pdf.setFontSize(8.5)
            pdf.setTextColor(overdue ? 170 : 154, overdue ? 55 : 122, overdue ? 45 : 79)
            pdf.text(format(parseISO(p.nextActionDate), 'd MMM'), 194, y, { align: 'right' })
          }
          y += 4.5
          // sub line: client · pm · next action
          const sub = [p.client, p.pm, p.nextAction].filter(Boolean).join('  ·  ')
          pdf.setFontSize(7); pdf.setTextColor(154, 122, 79)
          pdf.text(sub.slice(0, 90), 16, y)
          y += 5
        })
      }
      y += 3

      // Compact stage summary — counts kept, but secondary
      if (y > 258) { pdf.addPage(); y = 22 }
      pdf.setFontSize(6.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(154, 122, 79)
      pdf.text('BY STAGE', 16, y, { charSpace: 1 }); y += 5
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(120, 113, 108)
      const stageSummary = (data.stageDist || []).map((s: any) => `${s.name} ${s.value}`).join('      ')
      const ssLines = pdf.splitTextToSize(stageSummary, 178)
      pdf.text(ssLines, 16, y)
      y += ssLines.length * 4.5 + 6

      // ---- Page 2: team, overdue, upcoming ----
      pdf.addPage(); y = 22

      y = pdfSectionTitle(pdf, 'Projects & Tasks by Team Member', y)
      const workload = data.workload || []
      if (workload.length === 0) {
        pdf.setFontSize(9); pdf.setTextColor(120, 113, 108)
        pdf.text('No data', 16, y); y += 6
      } else {
        pdf.setFontSize(7); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(150, 143, 138)
        pdf.text('NAME', 16, y); pdf.text('PROJECTS', 150, y, { align: 'right' }); pdf.text('OPEN TASKS', 194, y, { align: 'right' })
        pdf.setFont('helvetica', 'normal')
        y += 3; pdf.setFillColor(220, 210, 190); pdf.rect(16, y, 178, 0.3, 'F'); y += 6
        let totalProjects = 0, totalTasks = 0
        workload.forEach((w: any) => {
          pdf.setFontSize(10); pdf.setTextColor(44, 40, 38)
          pdf.text(w.name || '', 16, y)
          pdf.text(String(w.projects), 150, y, { align: 'right' })
          // highlight anyone carrying open tasks
          pdf.text(String(w.tasks), 194, y, { align: 'right' })
          pdf.setFont('helvetica', 'normal')
          totalProjects += w.projects; totalTasks += w.tasks
          y += 7
          pdf.setFillColor(235, 228, 215); pdf.rect(16, y - 3, 178, 0.2, 'F')
        })
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(28, 25, 23); pdf.setFontSize(10)
        pdf.text('Total', 16, y)
        pdf.text(String(totalProjects), 150, y, { align: 'right' })
        pdf.text(String(totalTasks), 194, y, { align: 'right' })
        pdf.setFont('helvetica', 'normal')
        y += 12
      }

      if (y > 235) { pdf.addPage(); y = 22 }
      y = pdfSectionTitle(pdf, `Overdue Tasks · ${data.overdue.length}`, y)
      data.overdue.slice(0, 20).forEach((t: any) => {
        const titleLines = pdf.splitTextToSize(t.title || '', 150)
        const rowHeight = 6 + titleLines.length * 4.5
        if (y + rowHeight > 280) { pdf.addPage(); y = 22 }
        pdf.setFontSize(9.5); pdf.setTextColor(28, 25, 23)
        pdf.text(titleLines, 16, y)
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(184, 80, 66); pdf.setFontSize(9)
        pdf.text(t.due_date ? format(parseISO(t.due_date), 'd MMM') : '', 194, y, { align: 'right' })
        pdf.setFont('helvetica', 'normal')
        y += titleLines.length * 4.5 + 0.5
        pdf.setFontSize(7.5); pdf.setTextColor(150, 143, 138)
        pdf.text(t.project?.name || '', 16, y)
        y += 6.5
        pdf.setDrawColor(240, 238, 234); pdf.line(16, y - 3, 194, y - 3)
      })
      if (data.overdue.length === 0) { pdf.setTextColor(120, 113, 108); pdf.setFontSize(9); pdf.text('No overdue tasks', 16, y); y += 6 }
      y += 6

      if (y > 240) { pdf.addPage(); y = 22 }
      y = pdfSectionTitle(pdf, 'Upcoming · Deliveries & Installations', y)
      const upcoming = data.upcoming || []
      upcoming.slice(0, 15).forEach((p: any) => {
        if (y > 278) { pdf.addPage(); y = 22 }
        const ms = p.milestones?.find((m: any) => ['delivery', 'installation'].includes(m.stage))
        const stageLabel = ms?.stage === 'delivery' ? 'Delivery' : ms?.stage === 'installation' ? 'Installation' : ''
        pdf.setFontSize(10); pdf.setTextColor(28, 25, 23); pdf.text((p.name || '').slice(0, 46), 16, y)
        pdf.setFontSize(8); pdf.setTextColor(120, 113, 108); pdf.text(stageLabel, 140, y)
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(154, 122, 79); pdf.setFontSize(9)
        pdf.text(ms?.planned_date ? format(parseISO(ms.planned_date), 'd MMM') : '', 194, y, { align: 'right' })
        pdf.setFont('helvetica', 'normal')
        y += 7
        pdf.setDrawColor(240, 238, 234); pdf.line(16, y - 3, 194, y - 3)
      })
      if (upcoming.length === 0) { pdf.setTextColor(120, 113, 108); pdf.text('Nothing scheduled', 16, y) }

      const isMob1 = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      if (isMob1) {
        const blob1 = pdf.output('blob')
        const url1 = URL.createObjectURL(blob1)
        const a1 = document.createElement('a'); a1.href=url1; a1.download=`Project_Report_${format(new Date(),'yyyy-MM-dd')}.pdf`; a1.click()
        setTimeout(()=>URL.revokeObjectURL(url1),5000)
      } else { pdf.save(`Project_Report_${format(new Date(),'yyyy-MM-dd')}.pdf`) }
      toast.success('Project Report downloaded')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate PDF')
    }
    setExportingProject(false)
  }

  async function exportSalesReportPDF() {
    if (!data) return
    setExportingSales(true)
    try {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF('p', 'mm', 'a4')
      let y = 40
      pdfHeader(pdf, 'Weekly Sales Report', format(new Date(), 'EEEE d MMMM yyyy'))

      // Sales Actions by Type — now includes the actual follow-up entries
      // Sales Actions by Type — entries come from weeklySalesActions
      // (this week's actual logged touchpoints), not salesReminders.
      // salesReminders only has contacts with pending follow-ups, which is
      // why Physical Touchpoint, Quotation Request etc. showed a count but
      // no names underneath — they had actions but no outstanding reminders.
      y = pdfSectionTitle(pdf, 'Sales Actions by Type — This Week', y)
      const actionsByType: Record<string, any[]> = {}
      // Only this week's actions
      const weekStartDate = startOfWeek(new Date(), { weekStartsOn: 1 })
      ;(data.weeklySalesActions || []).forEach((t: any) => {
        if (t.touch_date && parseISO(t.touch_date) < weekStartDate) return
        const key = normalizeActionType(t.touchpoint_type) || 'other'
        if (!actionsByType[key]) actionsByType[key] = []
        actionsByType[key].push(t)
      })
      // Only show types that have entries
      TOUCHPOINT_TYPES_FULL.forEach(typeInfo => {
        const items = actionsByType[typeInfo.value] || []
        if (items.length === 0) return
        if (y > 265) { pdf.addPage(); y = 20 }
        pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(70, 62, 54)
        pdf.text(typeInfo.label, 15, y)
        pdf.setTextColor(150, 143, 138); pdf.text(String(items.length), 180, y, { align: 'right' })
        y += 2; pdf.setFillColor(235, 228, 215); pdf.rect(15, y, 165, 0.2, 'F'); y += 4

        items.forEach((t: any) => {
          if (y + 10 > 278) { pdf.addPage(); y = 20 }
          // Company first, then person name
          const primary = t.contactCompany || t.contactName || ''
          const secondary = t.contactCompany && t.contactName ? t.contactName : ''
          const display = [primary, secondary].filter(Boolean).join(' — ')
          pdf.setFontSize(7.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(50, 44, 38)
          pdf.text(display.slice(0, 55), 18, y)
          pdf.setTextColor(154, 122, 79)
          pdf.text(t.touch_date ? format(parseISO(t.touch_date), 'd MMM') : '', 178, y, { align: 'right' })
          y += 3.8
          if (t.notes) {
            pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(150, 143, 138)
            pdf.text(pdf.splitTextToSize(t.notes, 155)[0], 18, y)
            y += 3.6
          }
          y += 1
        })
        y += 3
      })
      y += 5

      // Per-person breakdown — this week only
      const { data: teamUsers } = await supabase.from('users').select('id, full_name').in('role', ['admin', 'manager'])
      const weeklyActions = (data.weeklySalesActions || []).filter((t: any) => !t.touch_date || parseISO(t.touch_date) >= weekStartDate)
      const byPerson: Record<string, number> = {}
      weeklyActions.forEach((t: any) => {
        const key = t.created_by || 'unknown'
        byPerson[key] = (byPerson[key] || 0) + 1
      })
      const personDist = (teamUsers || [])
        .map((u: any) => ({ name: u.full_name, value: byPerson[u.id] || 0 }))
        .filter((p: any) => p.value > 0)
        .sort((a: any, b: any) => b.value - a.value)

      if (y > 230) { pdf.addPage(); y = 20 }
      y = pdfSectionTitle(pdf, 'Sales Actions — By Team Member', y)
      y = pdfDataTable(pdf, personDist, 15, y) + 4

      if (y > 230) { pdf.addPage(); y = 20 }
      y = pdfSectionTitle(pdf, 'Quotes by Stage', y)
      y = pdfDataTable(pdf, data.pipelineStageDist || [], 15, y) + 4

      if (y > 230) { pdf.addPage(); y = 20 }
      y = pdfSectionTitle(pdf, 'Project Handovers by Type', y)
      y = pdfDataTable(pdf, data.handoverTypeDist || [], 15, y) + 4

      if (y > 230) { pdf.addPage(); y = 20 }
      y = pdfSectionTitle(pdf, 'Needs Analysis by Stage', y)
      y = pdfDataTable(pdf, data.leadStageDist || [], 15, y) + 4

      // Needs Analysis — individual entries with closing dates
      const leads = (data.leads || []).filter((l: any) => l.stage !== 'closed_lost')
      if (leads.length > 0) {
        if (y > 240) { pdf.addPage(); y = 20 }
        y = pdfSectionTitle(pdf, 'Needs Analysis — Open Leads', y)
        pdf.setFontSize(7); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(160, 153, 148)
        pdf.text('LEAD', 15, y); pdf.text('CLIENT', 80, y); pdf.text('STAGE', 128, y); pdf.text('CLOSING', 178, y, { align: 'right' })
        y += 2; pdf.setFillColor(235, 228, 215); pdf.rect(15, y, 165, 0.2, 'F'); y += 4
        leads.forEach((l: any) => {
          if (y > 275) { pdf.addPage(); y = 20 }
          pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(50, 44, 38)
          pdf.text((l.name || '').slice(0, 35), 15, y)
          pdf.setTextColor(100, 90, 75)
          pdf.text((l.client || '').slice(0, 25), 80, y)
          pdf.setTextColor(120, 110, 95)
          pdf.text((l.stage || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()).slice(0, 18), 128, y)
          if (l.closing_date) {
            const overdue = isPast(parseISO(l.closing_date)) && !isToday(parseISO(l.closing_date))
            pdf.setTextColor(overdue ? 180 : 154, overdue ? 60 : 122, overdue ? 50 : 79)
            pdf.text(format(parseISO(l.closing_date), 'd MMM'), 178, y, { align: 'right' })
          }
          y += 5.5
          pdf.setFillColor(240, 236, 228); pdf.rect(15, y - 2, 165, 0.15, 'F')
        })
        y += 4
      }

      if (y > 230) { pdf.addPage(); y = 20 }
      y = pdfSectionTitle(pdf, 'Samples by Stage', y)
      y = pdfDataTable(pdf, data.sampleStageDist || [], 15, y) + 8

      const isMob2 = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      if (isMob2) {
        const blob2 = pdf.output('blob')
        const url2 = URL.createObjectURL(blob2)
        const a2 = document.createElement('a'); a2.href=url2; a2.download=`Sales_Report_${format(new Date(),'yyyy-MM-dd')}.pdf`; a2.click()
        setTimeout(()=>URL.revokeObjectURL(url2),5000)
      } else { pdf.save(`Sales_Report_${format(new Date(),'yyyy-MM-dd')}.pdf`) }
      toast.success('Sales Report downloaded')
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate PDF')
    }
    setExportingSales(false)
  }

  async function exportMonthlyReportPDF() {
    setExportingMonthly(true)
    try {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
      const monthEnd = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
      const monthLabel = format(monthStart, 'MMMM yyyy')
      let y = 46
      pdfHeader(pdf, 'Monthly Report', monthLabel)

      // ---- Load all month data ----
      const { data: monthTouchData } = await supabase
        .from('sales_touchpoints')
        .select('*, contact:sales_contacts(name, company, role_type)')
        .gte('touch_date', format(monthStart, 'yyyy-MM-dd'))
        .lte('touch_date', format(monthEnd, 'yyyy-MM-dd'))

      const { data: monthProjData } = await supabase
        .from('projects')
        .select('*, milestones:project_milestones(*), tasks:project_tasks(*)')

      const { data: monthUserData } = await supabase
        .from('users')
        .select('id, full_name')
        .in('role', ['admin', 'manager'])

      // ---- Sales Actions this month ----
      const monthActions = monthTouchData || []
      const monthByType: Record<string, any[]> = {}
      monthActions.forEach((t: any) => {
        const key = normalizeActionType(t.touchpoint_type) || 'other'
        if (!monthByType[key]) monthByType[key] = []
        monthByType[key].push(t)
      })

      y = pdfSectionTitle(pdf, `Sales Actions — ${monthLabel}`, y)
      TOUCHPOINT_TYPES_FULL.forEach(typeInfo => {
        const items = monthByType[typeInfo.value] || []
        if (items.length === 0) return
        if (y > 265) { pdf.addPage(); y = 22 }
        pdf.setFontSize(8.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(70, 62, 54)
        pdf.text(typeInfo.label, 15, y)
        pdf.setTextColor(150, 143, 138); pdf.text(String(items.length), 180, y, { align: 'right' })
        y += 2; pdf.setFillColor(235, 228, 215); pdf.rect(15, y, 165, 0.2, 'F'); y += 4
        items.forEach((t: any) => {
          if (y + 10 > 278) { pdf.addPage(); y = 22 }
          const primary = t.contact?.company || t.contact?.name || ''
          const secondary = t.contact?.company && t.contact?.name ? t.contact.name : ''
          const display = [primary, secondary].filter(Boolean).join(' — ')
          pdf.setFontSize(7.5); pdf.setTextColor(50, 44, 38)
          pdf.text(display.slice(0, 55), 18, y)
          pdf.setTextColor(154, 122, 79)
          pdf.text(t.touch_date ? format(parseISO(t.touch_date), 'd MMM') : '', 178, y, { align: 'right' })
          y += 3.8
          if (t.notes) {
            pdf.setFontSize(7); pdf.setTextColor(150, 143, 138)
            pdf.text(pdf.splitTextToSize(t.notes, 155)[0], 18, y)
            y += 3.6
          }
          y += 1
        })
        y += 3
      })
      y += 4

      // ---- By team member ----
      const byPerson: Record<string, number> = {}
      monthActions.forEach((t: any) => { byPerson[t.created_by] = (byPerson[t.created_by] || 0) + 1 })
      const personDist2 = (monthUserData || [])
        .map((u: any) => ({ name: u.full_name, value: byPerson[u.id] || 0 }))
        .filter((p: any) => p.value > 0)
        .sort((a: any, b: any) => b.value - a.value)
      if (y > 240) { pdf.addPage(); y = 22 }
      y = pdfSectionTitle(pdf, 'Sales Actions — By Team Member', y)
      y = pdfDataTable(pdf, personDist2, 15, y) + 6

      // ---- Projects summary ----
      pdf.addPage(); y = 22
      y = pdfSectionTitle(pdf, 'Project Status — All Active', y)
      const activeProjects = (monthProjData || []).filter((p: any) => p.status !== 'complete')
      const STAGE_ORDER = ['quotation','material_approval','templating','drawings_submission','drawings_approval','fabrication','shipping','delivery','installation','snagging','handover']
      activeProjects.sort((a: any, b: any) => STAGE_ORDER.indexOf(a.current_stage) - STAGE_ORDER.indexOf(b.current_stage))
      activeProjects.forEach((p: any) => {
        if (y > 270) { pdf.addPage(); y = 22 }
        pdf.setFillColor(235, 228, 215); pdf.rect(15, y, 178, 0.2, 'F'); y += 3.5
        pdf.setFontSize(9.5); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(30, 25, 20)
        pdf.text((p.name || '').slice(0, 44), 15, y)
        const stageLabel = (p.current_stage || '').replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase())
        pdf.setFontSize(8); pdf.setTextColor(100, 90, 75)
        pdf.text(stageLabel.slice(0, 22), 130, y)
        const openTasks = (p.tasks || []).filter((t: any) => t.status !== 'completed').length
        if (openTasks > 0) { pdf.setTextColor(154, 122, 79); pdf.text(`${openTasks} tasks`, 180, y, { align: 'right' }) }
        y += 4.5
        pdf.setFontSize(7); pdf.setTextColor(154, 122, 79)
        pdf.text((p.client || ''), 15, y)
        y += 5
      })

      // ---- Stage distribution ----
      y += 4
      if (y > 240) { pdf.addPage(); y = 22 }
      const stageCounts2: Record<string, number> = {}
      activeProjects.forEach((p: any) => { stageCounts2[p.current_stage] = (stageCounts2[p.current_stage] || 0) + 1 })
      const stageDist2 = STAGE_ORDER.map(k => ({ name: k.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()), value: stageCounts2[k] || 0 })).filter(d => d.value > 0)
      y = pdfSectionTitle(pdf, 'Projects by Stage', y)
      y = pdfDataTable(pdf, stageDist2, 15, y) + 6

      // ---- Overdue tasks ----
      const overdueTasks2 = (monthProjData || []).flatMap((p: any) => (p.tasks || []).filter((t: any) => t.due_date && isPast(parseISO(t.due_date)) && t.status !== 'completed').map((t: any) => ({ ...t, projectName: p.name })))
      if (overdueTasks2.length > 0) {
        if (y > 230) { pdf.addPage(); y = 22 }
        y = pdfSectionTitle(pdf, `Overdue Tasks · ${overdueTasks2.length}`, y)
        overdueTasks2.slice(0, 20).forEach((t: any) => {
          if (y + 10 > 278) { pdf.addPage(); y = 22 }
          const tl = pdf.splitTextToSize(t.title || '', 150)
          pdf.setFontSize(9); pdf.setTextColor(30, 25, 20); pdf.text(tl, 15, y)
          pdf.setTextColor(154, 100, 79); pdf.text(t.due_date ? format(parseISO(t.due_date), 'd MMM') : '', 190, y, { align: 'right' })
          y += tl.length * 4.5 + 0.5
          pdf.setFontSize(7); pdf.setTextColor(154, 122, 79); pdf.text(t.projectName || '', 15, y)
          y += 5.5; pdf.setFillColor(235, 228, 215); pdf.rect(15, y - 3, 178, 0.2, 'F')
        })
      }

      const fileName = `Monthly_Report_${format(monthStart, 'yyyy-MM')}.pdf`
      const isMob3 = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
      if (isMob3) {
        const blob3 = pdf.output('blob'); const url3 = URL.createObjectURL(blob3)
        const a3 = document.createElement('a'); a3.href=url3; a3.download=fileName; a3.click()
        setTimeout(()=>URL.revokeObjectURL(url3),5000)
      } else { pdf.save(fileName) }
      toast.success('Monthly Report downloaded')
    } catch (err) {
      console.error(err); toast.error('Failed to generate monthly report')
    }
    setExportingMonthly(false)
  }

  async function openWeeklyBreakdown() {
    setShowWeeklyBreakdown(true)
    setLoadingBreakdown(true)
    const { data: breakdownData } = await supabase
      .from('sales_touchpoints')
      .select('*, contact:sales_contacts(name, company)')
      .eq('created_by', currentUserId)
      .order('touch_date', { ascending: false })
    setMyAllTouchpoints(breakdownData || [])
    setLoadingBreakdown(false)
  }

  async function downloadArchivedReport(fileName: string) {
    const { data, error } = await supabase.storage.from('weekly-reports').createSignedUrl(fileName, 3600)
    if (error || !data) { toast.error('Failed to get file link'); return }
    window.open(data.signedUrl, '_blank')
  }


  async function loadData() {
    const { data: { user } } = await supabase.auth.getUser()
    let role = 'member'
    let myFullName = ''
    if (user) {
      const { data: profile } = await supabase.from('users').select('role, full_access, full_name').eq('id', user.id).single()
      role = profile?.role || 'member'
      myFullName = profile?.full_name || ''
      setCurrentUserName(myFullName)
      setCurrentUserId(user.id)
    }

    let projQuery = supabase.from('projects').select(`*, project_manager:users!project_manager_id(*), milestones:project_milestones(*)`)
    // Previously restricted non-admin managers without full_access to only
    // their own projects — now all managers see everything, same as admin.

    const [projRes, tasksRes, teamRes] = await Promise.all([
      projQuery,
      supabase.from('tasks').select(`*, assigned_to:users!assigned_to_id(*), project:projects(name)`),
      supabase.from('users').select('*'),
    ])
    const projects = projRes.data || []
    const tasks = tasksRes.data || []
    const team = teamRes.data || []

    // Per-project status — the actionable view: where each project is,
    // what the next dated milestone is, and what the next action should be.
    // Replaces the bare stage histogram, which told you nothing you could act on.
    const STAGE_KEYS = Object.keys(STAGE_CONFIG)
    const projectStatus = projects
      .filter(p => p.status !== 'complete')
      .map(p => {
        const stageKey = p.current_stage as string
        const stageLabel = STAGE_CONFIG[stageKey as keyof typeof STAGE_CONFIG]?.label || stageKey
        const stageIdx = STAGE_KEYS.indexOf(stageKey)

        // Next dated milestone at or ahead of the current stage
        const futureMs = (p.milestones || [])
          .filter((m: any) => m.planned_date && STAGE_KEYS.indexOf(m.stage) >= stageIdx)
          .sort((a: any, b: any) => (a.planned_date || '').localeCompare(b.planned_date || ''))
        const nextMs = futureMs[0]
        const nextLabel = nextMs ? (STAGE_CONFIG[nextMs.stage as keyof typeof STAGE_CONFIG]?.label || nextMs.stage) : ''
        const nextDate = nextMs?.planned_date || ''
        const nextIsPast = nextDate ? isPast(parseISO(nextDate)) && !isToday(parseISO(nextDate)) : false

        // Open tasks on this project, earliest-due first — the concrete next action
        const projTasks = tasks
          .filter((t: any) => t.project_id === p.id && t.status !== 'completed')
          .sort((a: any, b: any) => (a.due_date || '9999').localeCompare(b.due_date || '9999'))
        const nextTask = projTasks[0]

        // "Next action" priority: an open task if there is one, else the next milestone
        const nextAction = nextTask
          ? nextTask.title
          : nextMs
            ? `${nextLabel}${nextDate ? ' — ' + format(parseISO(nextDate), 'd MMM') : ''}`
            : 'No next step scheduled'
        const nextActionDate = nextTask?.due_date || nextDate

        return {
          name: p.name,
          client: p.client || '',
          pm: p.project_manager?.full_name?.split(' ')[0] || '',
          stageLabel,
          stageIdx,
          nextLabel,
          nextDate,
          nextIsPast,
          nextAction,
          nextActionDate,
          openTasks: projTasks.length,
        }
      })
      // Order by how far along: soonest next date first, then by stage
      .sort((a, b) => {
        const da = a.nextActionDate || '9999-99-99'
        const db = b.nextActionDate || '9999-99-99'
        return da.localeCompare(db)
      })

    // Stage distribution
    const stageDist = Object.entries(STAGE_CONFIG).map(([key, cfg]) => ({
      name: cfg.label,
      value: projects.filter(p => p.current_stage === key).length,
      color: cfg.color,
    })).filter(s => s.value > 0)

    // Team workload
    const workload = team.map(u => ({
      name: u.full_name?.split(' ')[0],
      projects: projects.filter(p => p.project_manager_id === u.id).length,
      tasks: tasks.filter(t => t.assigned_to_id === u.id && t.status !== 'completed').length,
    })).filter(u => u.projects > 0 || u.tasks > 0)

    // Upcoming deliveries
    const upcoming = projects.filter(p => {
      const ms = p.milestones?.find((m: any) => ['delivery','installation'].includes(m.stage))
      return ms?.planned_date && !isPast(parseISO(ms.planned_date))
    }).sort((a, b) => {
      const da = a.milestones?.find((m: any) => m.stage === 'delivery')?.planned_date || '9999'
      const db = b.milestones?.find((m: any) => m.stage === 'delivery')?.planned_date || '9999'
      return da.localeCompare(db)
    })

    // Sales tasks — admin's personal CRM, only relevant/visible to admin
    let salesContacts: any[] = []
    let deals: any[] = []
    let wonProjects: any[] = []
    let leads: any[] = []
    let samples: any[] = []
    let estimatesData: any[] = []
    // Now visible to every manager and admin, not just admin
    if (role === 'admin' || role === 'manager') {
      const [scRes, dealsRes, wonRes, leadsRes, samplesRes, estimatesRes] = await Promise.all([
        supabase.from('sales_contacts').select('*, touchpoints:sales_touchpoints(*)').order('name'),
        supabase.from('sales_deals').select('*'),
        supabase.from('sales_projects').select('*').is('converted_project_id', null),
        supabase.from('sales_leads').select('*'),
        supabase.from('sales_samples').select('*'),
        supabase.from('quotes').select('id, offer_name, client, country, currency, grand_total'),
      ])
      salesContacts = scRes.data || []
      deals = dealsRes.data || []
      wonProjects = wonRes.data || []
      leads = leadsRes.data || []
      samples = samplesRes.data || []
      estimatesData = estimatesRes.data || []
    }

    const salesStatusCounts = SALES_STATUS_TYPES.map(s => ({
      ...s,
      count: salesContacts.filter(c => (c.status || 'outreach') === s.value).length,
    }))

    const salesReminders = salesContacts
      .flatMap((c: any) =>
        (c.touchpoints || [])
          .filter((t: any) => t.next_reminder_date && !t.reminder_done)
          .map((t: any) => ({ ...t, contactName: c.name, contactCompany: c.company }))
      )
      .sort((a: any, b: any) => a.next_reminder_date.localeCompare(b.next_reminder_date))

    // This week's actions, Monday–Friday, for the weekly export
    const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
    const weekFriday = addDays(weekStart, 4)
    const weekStartStr = format(weekStart, 'yyyy-MM-dd')
    const weekFridayStr = format(weekFriday, 'yyyy-MM-dd')
    const weeklySalesActions = salesContacts
      .flatMap((c: any) =>
        (c.touchpoints || [])
          .filter((t: any) => t.touch_date >= weekStartStr && t.touch_date <= weekFridayStr)
          .map((t: any) => ({ ...t, contactName: c.name, contactCompany: c.company }))
      )
      .sort((a: any, b: any) => a.touch_date.localeCompare(b.touch_date))

    // Full action log (not restricted to this week) for export
    const allSalesActions = salesContacts
      .flatMap((c: any) =>
        (c.touchpoints || []).map((t: any) => ({
          ...t, contactName: c.name, contactCompany: c.company, contactStatus: c.status, contactRole: c.role_type,
        }))
      )
      .sort((a: any, b: any) => b.touch_date.localeCompare(a.touch_date))

    // Action type distribution, for the "Sales actions by type" chart —
    // always shows every current type (even with zero logged actions),
    // grouped in the same order as the Log Action dropdown categories.
    const actionTypeCounts: Record<string, number> = {}
    TOUCHPOINT_TYPES_FULL.forEach(t => { actionTypeCounts[t.value] = 0 })
    allSalesActions.forEach((t: any) => {
      const key = normalizeActionType(t.touchpoint_type)
      actionTypeCounts[key] = (actionTypeCounts[key] || 0) + 1
    })
    const actionTypeDist = TOUCHPOINT_TYPES_FULL.map(t => ({
      name: t.label,
      value: actionTypeCounts[t.value] || 0,
      color: t.color,
      category: t.category,
    }))
    Object.keys(actionTypeCounts).forEach(key => {
      if (!TOUCHPOINT_TYPES_FULL.find(t => t.value === key) && actionTypeCounts[key] > 0) {
        actionTypeDist.push({
          name: TOUCHPOINT_TYPE_LABELS[key] || key,
          value: actionTypeCounts[key],
          color: TOUCHPOINT_TYPE_COLORS[key] || '#6B7280',
          category: 'Other',
        })
      }
    })

    // Pipeline by stage — "Closed Won" reflects actual won sales (Project
    // Handover), not just deals still sitting in the pipeline table with
    // that stage, so it stays accurate even after a deal converts.
    const pipelineStageDist = DEAL_STAGES.map(s => ({
      name: s.label,
      value: s.id === 'closed_won' ? wonProjects.length : deals.filter((d: any) => d.stage === s.id).length,
      color: s.color,
    }))
    const pipelineTotal = deals.reduce((sum: number, d: any) => sum + (d.value || 0), 0)

    // Project Handover by type
    const handoverTypeDist = Object.entries(PROJECT_TYPES).map(([key, cfg]) => ({
      name: cfg.label,
      value: wonProjects.filter((p: any) => p.project_type === key).length,
      color: cfg.color,
    }))
    const handoverTotal = wonProjects.reduce((sum: number, p: any) => sum + (p.value || 0), 0)

    // Needs Analysis by stage
    const leadStageDist = LEAD_STAGES.map(s => ({
      name: s.label,
      value: leads.filter((l: any) => l.stage === s.id).length,
      color: s.color,
    }))
    const leadsTotal = leads.reduce((sum: number, l: any) => sum + (l.value || 0), 0)

    // Samples by stage
    const sampleStageDist = SAMPLE_STAGES.map(s => ({
      name: s.label,
      value: samples.filter((sm: any) => sm.stage === s.id).length,
      color: s.color,
    }))

    const estimatesTotal = estimatesData.length

    // Individual estimates by name/price, colored by value band — capped
    // to the top 20 by value so the chart stays readable.
    const getPriceColor = (value: number): string => {
      if (value >= 150000) return '#DC2626'
      if (value >= 50000) return '#F97316'
      if (value >= 20000) return '#F59E0B'
      if (value >= 5000) return '#3B82F6'
      return '#94A3B8'
    }
    const estimatesByPrice = [...estimatesData]
      .sort((a: any, b: any) => (b.grand_total || 0) - (a.grand_total || 0))
      .slice(0, 10)
      .map((e: any) => ({
        name: e.offer_name || e.client || 'Untitled',
        value: e.grand_total || 0,
        color: getPriceColor(e.grand_total || 0),
      }))

    setData({
      projects,
      tasks,
      stageDist,
      projectStatus,
      workload,
      upcoming,
      overdue: tasks.filter(t => t.due_date && isPast(parseISO(t.due_date)) && t.status !== 'completed'),
      awaitingApproval: projects.filter(p => p.current_stage === 'drawings_approval'),
      complete: projects.filter(p => p.status === 'complete').length,
      active: projects.filter(p => p.status === 'active').length,
      isAdmin: role === 'admin' || role === 'manager',
      salesContactsCount: salesContacts.length,
      salesContactsFull: salesContacts,
      salesStatusCounts,
      salesReminders,
      weeklySalesActions,
      allSalesActions,
      actionTypeDist,
      pipelineStageDist,
      pipelineTotal,
      dealsCount: deals.length,
      handoverTypeDist,
      handoverTotal,
      wonProjectsCount: wonProjects.length,
      leadStageDist,
      leadsTotal,
      leadsCount: leads.length,
      leads,
      sampleStageDist,
      samplesCount: samples.length,
      estimatesTotal,
      estimatesByPrice,
      weekRangeLabel: `${format(weekStart, 'd MMM')} – ${format(weekFriday, 'd MMM yyyy')}`,
    })
    setLoading(false)
  }

  function exportWeeklyReport() {
    if (!data) return
    const wb = XLSX.utils.book_new()
    // Projects sheet
    const projRows = data.projects.map((p: any) => ({
      'Project': p.name, 'Client': p.client,
      'Stage': STAGE_CONFIG[p.current_stage as keyof typeof STAGE_CONFIG]?.label,
      'PM': p.project_manager?.full_name || '',
      'Next Action': p.next_action || '', 'Status': p.status,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(projRows), 'Projects')
    // Tasks sheet
    const taskRows = data.overdue.map((t: any) => ({
      'Task': t.title, 'Project': t.project?.name || '',
      'Assigned To': t.assigned_to?.full_name || '',
      'Due Date': t.due_date, 'Priority': t.priority, 'Status': t.status,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(taskRows), 'Overdue Tasks')
    // Sales contacts + actions — admin only
    if (data.isAdmin) {
      if (data.salesContactsFull) {
        const contactRows = data.salesContactsFull.map((c: any) => {
          const pending = (c.touchpoints || [])
            .filter((t: any) => t.next_reminder_date && !t.reminder_done)
            .sort((a: any, b: any) => a.next_reminder_date.localeCompare(b.next_reminder_date))[0]
          return {
            'Contact': c.name, 'Company': c.company || '',
            'Role': SALES_ROLE_TYPES[c.role_type] || c.role_type,
            'Status': SALES_STATUS_TYPES.find(s => s.value === (c.status || 'outreach'))?.label || 'Outreach',
            'Phone': c.phone || '', 'Email': c.email || '',
            'Next Follow-up': pending ? pending.next_reminder_date : '',
            'Notes': c.notes || '',
          }
        })
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(contactRows), 'Sales Contacts')
      }
      if (data.weeklySalesActions) {
        const weekRows = data.weeklySalesActions.map((t: any) => ({
          'Contact': t.contactName, 'Company': t.contactCompany || '',
          'Action Type': TOUCHPOINT_TYPE_LABELS[t.touchpoint_type] || t.touchpoint_type,
          'Date': t.touch_date,
          'Notes': t.notes || '', 'Next Reminder': t.next_reminder_date || '',
        }))
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(weekRows), 'Sales Actions This Week')
      }
      if (data.allSalesActions) {
        const allActionRows = data.allSalesActions.map((t: any) => ({
          'Contact': t.contactName, 'Company': t.contactCompany || '',
          'Contact Status': SALES_STATUS_TYPES.find(s => s.value === (t.contactStatus || 'outreach'))?.label || 'Outreach',
          'Action Type': TOUCHPOINT_TYPE_LABELS[t.touchpoint_type] || t.touchpoint_type,
          'Date': t.touch_date,
          'Notes': t.notes || '', 'Next Reminder': t.next_reminder_date || '',
        }))
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(allActionRows), 'All Sales Actions')
      }
    }
    XLSX.writeFile(wb, `stoneline-weekly-report-${format(new Date(), 'yyyy-MM-dd')}.xlsx`)
    toast.success('Report exported')
  }

  async function exportAsPDF() {
    if (!reportRef.current) return
    setExportingPdf(true)
    const toastId = toast.loading('Generating PDF...')
    const el = reportRef.current
    const originalWidth = el.style.width
    const originalMaxWidth = el.style.maxWidth
    const originalPosition = el.style.position
    const isMobile = window.innerWidth < 768
    try {
      if (isMobile) {
        // Only override on mobile — force a fixed desktop-width layout for
        // the capture, since on a narrow phone screen this would otherwise
        // capture the stacked responsive layout with squashed charts.
        // Desktop already renders correctly at its natural width, so it's
        // left completely untouched.
        el.style.width = '900px'
        el.style.maxWidth = '900px'
        el.style.position = 'relative'

        // Let React/recharts reflow at the new width before capturing —
        // ResponsiveContainer resizes charts based on actual container
        // width, which needs a beat to settle after the change above.
        await new Promise(resolve => setTimeout(resolve, 500))
      }

      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        ...(isMobile ? { windowWidth: 900, width: 900 } : {}),
      })
      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const pageWidth = pdf.internal.pageSize.getWidth()
      const pageHeight = pdf.internal.pageSize.getHeight()
      const imgWidth = pageWidth
      const imgHeight = (canvas.height * imgWidth) / canvas.width
      let heightLeft = imgHeight
      let position = 0
      pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
      heightLeft -= pageHeight
      while (heightLeft > 0) {
        position = heightLeft - imgHeight
        pdf.addPage()
        pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight)
        heightLeft -= pageHeight
      }
      pdf.save(`stoneline-weekly-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`)
      toast.success('PDF exported', { id: toastId })
    } catch (err) {
      console.error(err)
      toast.error('Failed to generate PDF', { id: toastId })
    }
    // Always restore the normal responsive layout, even if export failed
    el.style.width = originalWidth
    el.style.maxWidth = originalMaxWidth
    el.style.position = originalPosition
    setExportingPdf(false)
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const showProjects = reportView === 'all' || reportView === 'projects'
  const showSales = reportView === 'all' || reportView === 'sales'

  return (
    <div className="p-3 md:p-6 max-w-7xl mx-auto space-y-6 overflow-x-hidden">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Reports</h1>
          <p className="text-sm text-stone-500 mt-0.5">As of {format(new Date(), 'd MMMM yyyy')}</p>
        </div>
        {data.isAdmin && (
          <div className="flex items-center border border-stone-200 rounded-lg bg-white overflow-hidden flex-shrink-0">
            {([
              { key: 'all', label: 'All' },
              { key: 'projects', label: 'Projects' },
              { key: 'sales', label: 'Sales' },
            ] as const).map(v => (
              <button key={v.key} onClick={() => setReportView(v.key)}
                className={'px-3 py-1.5 text-xs font-medium transition-colors ' + (reportView === v.key ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-50')}>
                {v.label}
              </button>
            ))}
          </div>
        )}
        <div className="flex items-center gap-2">
          <button onClick={exportWeeklyReport} className="btn-primary flex items-center gap-2 text-sm">
            <Download size={14}/> <span className="hidden sm:inline">Export</span> Excel
          </button>
          <div className="relative">
            <button onClick={() => setShowMoreExports(!showMoreExports)} className="btn-secondary flex items-center gap-1.5 text-sm">
              More {showMoreExports ? <ChevronUp size={14}/> : <ChevronDown size={14}/>}
            </button>
            {showMoreExports && (
              <>
                <div className="fixed inset-0 z-10" onClick={() => setShowMoreExports(false)}/>
                <div className="absolute right-0 mt-1 w-52 bg-white border border-stone-200 rounded-lg shadow-lg z-20 py-1">
                  <button onClick={() => { exportAsPDF(); setShowMoreExports(false) }} disabled={exportingPdf}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 text-left">
                    <FileDown size={14}/> {exportingPdf ? 'Generating...' : 'Export PDF'}
                  </button>
                  <button onClick={() => { exportProjectReportPDF(); setShowMoreExports(false) }} disabled={exportingProject}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 text-left">
                    <FileText size={14}/> {exportingProject ? 'Generating...' : 'Project Report'}
                  </button>
                  <button onClick={() => { exportSalesReportPDF(); setShowMoreExports(false) }} disabled={exportingSales}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 text-left">
                    <FileText size={14}/> {exportingSales ? 'Generating...' : 'Sales Report'}
                  </button>
                  <button onClick={() => { exportMonthlyReportPDF(); setShowMoreExports(false) }} disabled={exportingMonthly}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 text-left">
                    <FileText size={14}/> {exportingMonthly ? 'Generating...' : 'Monthly Report'}
                  </button>
                  <div className="border-t border-stone-100 my-1"/>
                  <button onClick={() => { setShowArchive(!showArchive); setShowMoreExports(false) }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-700 hover:bg-stone-50 text-left">
                    <Folder size={14}/> Archive ({archivedReports.length})
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {data.weekRangeLabel && <p className="text-xs text-stone-400 -mt-4">{data.weekRangeLabel} · Mon–Fri</p>}

      {/* Weekly report archive — auto-generated every Friday at 4:30pm, plus anything exported manually */}
      {showArchive && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b border-stone-100 bg-stone-50 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-stone-900">Weekly Report Archive</h3>
              <p className="text-xs text-stone-400 mt-0.5">Automatically saved every Friday at 4:30pm</p>
            </div>
            <label className="btn-secondary flex items-center gap-2 cursor-pointer text-xs px-3 py-1.5">
              <Upload size={13}/> Upload PDF
              <input type="file" accept=".pdf" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0]
                if (!file) return
                const fileName = file.name.endsWith('.pdf') ? file.name : `${file.name}.pdf`
                const { error } = await supabase.storage.from('weekly-reports').upload(fileName, file, { upsert: true })
                if (error) { toast.error('Upload failed'); return }
                toast.success('Report uploaded')
                const { data: files } = await supabase.storage.from('weekly-reports').list('', { sortBy: { column: 'name', order: 'desc' } })
                setArchivedReports(files || [])
                e.target.value = ''
              }}/>
            </label>
          </div>
          <div className="divide-y divide-stone-50 max-h-72 overflow-y-auto">
            {archivedReports.length === 0 && (
              <p className="px-5 py-6 text-sm text-stone-400 text-center">No archived reports yet — upload one or wait for the automatic save this Friday</p>
            )}
            {archivedReports.map((f: any) => (
              <button key={f.name} onClick={() => downloadArchivedReport(f.name)}
                className="w-full flex items-center gap-3 px-5 py-2.5 hover:bg-stone-50 transition-colors text-left">
                <FileDown size={14} className="text-stone-400 flex-shrink-0"/>
                <span className="text-sm text-stone-700 flex-1">{f.name}</span>
                <span className="text-xs text-stone-400">{f.created_at ? format(new Date(f.created_at), 'd MMM yyyy') : ''}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Everything inside this div is what gets captured into the PDF */}
      <div ref={reportRef} className="space-y-6 bg-stone-50">
        <div className="bg-white rounded-xl px-5 py-4 border border-stone-100">
          <h2 className="text-lg font-semibold text-stone-900">Stoneline UK — Weekly Report</h2>
          <p className="text-sm text-stone-500 mt-0.5">{data.weekRangeLabel} (Monday – Friday)</p>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            { label: t('dash_active_projects'), value: data.active, color: '#10B981', bg: '#ECFDF5' },
            { label: 'Complete', value: data.complete, color: '#6B7C63', bg: '#ECEFEB' },
            { label: 'Overdue tasks', value: data.overdue.length, color: '#EF4444', bg: '#FEF2F2' },
            { label: 'Awaiting approval', value: data.awaitingApproval.length, color: '#F59E0B', bg: '#FFFBEB' },
          ].map(c => (
            <div key={c.label} className="card p-5">
              <p className="text-xs text-stone-400 uppercase tracking-wide font-medium">{c.label}</p>
              <p className="text-3xl font-bold mt-1.5" style={{ color: c.color }}>{c.value}</p>
            </div>
          ))}
        </div>

        {/* ── PROJECTS SECTION ── */}
        {showProjects && (
        <div className="rounded-xl border-2 border-stone-200 bg-stone-50/50 p-3 md:p-4 space-y-4">
          <button onClick={() => setProjectsOpen(!projectsOpen)}
            className="w-full flex items-center justify-between gap-2 px-1 group">
            <div className="flex items-center gap-2">
              <Folder size={15} className="text-brand-600"/>
              <h2 className="text-sm font-bold text-stone-700 uppercase tracking-wide">Projects</h2>
            </div>
            {projectsOpen ? <ChevronUp size={16} className="text-stone-400 group-hover:text-stone-600"/> : <ChevronDown size={16} className="text-stone-400 group-hover:text-stone-600"/>}
          </button>

          {projectsOpen && (
          <>
        {/* Project timeline by stage */}
        <div className="card p-3 md:p-4">
          <h3 className="font-semibold text-stone-900 mb-3 text-sm">Projects by stage</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={data.stageDist} barSize={22}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4"/>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#78716C' }} angle={-30} textAnchor="end" height={55}/>
              <YAxis tick={{ fontSize: 10, fill: '#A8A29E' }} allowDecimals={false}/>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}/>
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {data.stageDist.map((entry: any, i: number) => (
                  <Cell key={i} fill={entry.color}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Tasks to do */}
        {data.overdue.length > 0 && (
          <div className="card">
            <div className="flex items-center gap-2 px-5 py-4 border-b border-stone-100">
              <AlertTriangle size={15} className="text-red-500"/>
              <h3 className="font-semibold text-stone-900 text-sm">Tasks to do ({data.overdue.length} overdue)</h3>
            </div>
            <div className="divide-y divide-stone-50">
              {data.overdue.slice(0, 10).map((t: any) => (
                <div key={t.id} className="flex items-center gap-4 px-5 py-3">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-stone-900">{t.title}</p>
                    <p className="text-xs text-stone-400">{t.project?.name}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    {t.assigned_to && <span className="text-stone-500">{t.assigned_to.full_name}</span>}
                    <span className="text-red-500 font-medium">{t.due_date ? format(parseISO(t.due_date), 'd MMM') : '—'}</span>
                    <span className="badge" style={{ background: TASK_STATUS_CONFIG[t.status as keyof typeof TASK_STATUS_CONFIG]?.bg, color: TASK_STATUS_CONFIG[t.status as keyof typeof TASK_STATUS_CONFIG]?.color }}>
                      {TASK_STATUS_CONFIG[t.status as keyof typeof TASK_STATUS_CONFIG]?.label}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Upcoming deliveries & installations */}
        <div className="card">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-stone-100">
            <Truck size={15} className="text-indigo-500"/>
            <h3 className="font-semibold text-stone-900 text-sm">Upcoming deliveries & installations</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-100 bg-stone-50">
                  <th className="text-left px-5 py-2.5 text-xs font-semibold text-stone-400 uppercase tracking-wide">Project</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase tracking-wide">Client</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase tracking-wide">PM</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase tracking-wide">Delivery</th>
                  <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase tracking-wide">Installation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {data.upcoming.slice(0, 10).map((p: any) => {
                  const del = p.milestones?.find((m: any) => m.stage === 'delivery')
                  const ins = p.milestones?.find((m: any) => m.stage === 'installation')
                  return (
                    <tr key={p.id} className="hover:bg-stone-50">
                      <td className="px-5 py-3 text-sm font-medium text-stone-900">{p.name}</td>
                      <td className="px-4 py-3 text-sm text-stone-600">{p.client}</td>
                      <td className="px-4 py-3 text-xs text-stone-500">{p.project_manager?.full_name}</td>
                      <td className="px-4 py-3 text-sm font-medium text-indigo-600">
                        {del?.planned_date ? format(parseISO(del.planned_date), 'd MMM yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-brand-600">
                        {ins?.planned_date ? format(parseISO(ins.planned_date), 'd MMM yyyy') : '—'}
                      </td>
                    </tr>
                  )
                })}
                {data.upcoming.length === 0 && (
                  <tr><td colSpan={5} className="py-8 text-center text-sm text-stone-400">No upcoming deliveries or installations</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Team workload — secondary, kept small */}
        <div className="card p-3 md:p-4">
          <h3 className="font-semibold text-stone-900 mb-3 text-sm">Team workload</h3>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={data.workload} barSize={20}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4"/>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#A8A29E' }}/>
              <YAxis tick={{ fontSize: 11, fill: '#A8A29E' }} allowDecimals={false}/>
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}/>
              <Bar dataKey="projects" name="Projects" fill="#6B7C63" radius={[4,4,0,0]}/>
              <Bar dataKey="tasks" name="Open tasks" fill="#BFC9BB" radius={[4,4,0,0]}/>
            </BarChart>
          </ResponsiveContainer>
        </div>
          </>
          )}
        </div>
        )}

        {/* ── SALES SECTION ── */}
        {showSales && data.isAdmin && (
        <div className="rounded-xl border-2 border-amber-200/60 bg-amber-50/30 p-3 md:p-4 space-y-4">
          <button onClick={() => setSalesOpen(!salesOpen)}
            className="w-full flex items-center justify-between gap-2 px-1 group">
            <div className="flex items-center gap-2">
              <TrendingUp size={15} className="text-amber-600"/>
              <h2 className="text-sm font-bold text-stone-700 uppercase tracking-wide">Sales</h2>
            </div>
            {salesOpen ? <ChevronUp size={16} className="text-stone-400 group-hover:text-stone-600"/> : <ChevronDown size={16} className="text-stone-400 group-hover:text-stone-600"/>}
          </button>

          {salesOpen && (
          <>
        {/* Quick actions — jump straight into a new item instead of
            navigating to Sales/Admin and finding the right button there. */}
        <div className="flex flex-wrap gap-2">
          <Link href="/admin?tab=sales_contacts&action=addContact" className="btn-secondary text-xs py-1.5 px-3">+ Contact</Link>
          <Link href="/salestracking?tab=quotes&action=addQuote" className="btn-secondary text-xs py-1.5 px-3">+ Quote</Link>
          <Link href="/salestracking?tab=samples&action=addSample" className="btn-secondary text-xs py-1.5 px-3">+ Sample</Link>
          <Link href="/admin?tab=sales_contacts" className="btn-secondary text-xs py-1.5 px-3">Log action</Link>
        </div>

        {/* Follow-ups — the most important thing for the sales team to
            act on, so it leads the section. */}
        {data.isAdmin && (
          <div className="card">
            <div className="flex items-center justify-between px-5 py-4 border-b border-stone-100">
              <button onClick={openWeeklyBreakdown} className="flex items-center gap-2 hover:opacity-70 transition-opacity">
                <Bell size={15} className="text-amber-600"/>
                <h3 className="font-semibold text-stone-900 text-sm">Follow-up contacts & tasks</h3>
              </button>
              <Link href="/admin?tab=sales_contacts" className="text-xs text-brand-600 hover:underline">
                View all →
              </Link>
            </div>

            {/* Status funnel */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-b border-stone-100">
              {data.salesStatusCounts.map((s: any) => (
                <span key={s.value} className="badge" style={{ color: s.color, background: s.color + '15' }}>
                  {s.label} · {s.count}
                </span>
              ))}
            </div>

            {/* Pending follow-ups */}
            <div className="divide-y divide-stone-50">
              {data.salesReminders.length === 0 && (
                <p className="px-5 py-6 text-sm text-stone-400 text-center">No pending sales follow-ups</p>
              )}
              {data.salesReminders.slice(0, 10).map((r: any) => {
                const overdue = isPast(parseISO(r.next_reminder_date)) && !isToday(parseISO(r.next_reminder_date))
                const dueToday = isToday(parseISO(r.next_reminder_date))
                return (
                  <div key={r.id} className="flex items-center gap-4 px-5 py-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-stone-900 truncate">
                        {r.contactName}{r.contactCompany ? ` (${r.contactCompany})` : ''}
                      </p>
                      <p className="text-xs text-stone-400 truncate">{r.notes || 'Follow-up'}</p>
                    </div>
                    <span className={`text-xs font-medium flex-shrink-0 ${overdue ? 'text-red-500' : dueToday ? 'text-amber-500' : 'text-stone-400'}`}>
                      {overdue ? 'Overdue' : dueToday ? 'Today' : format(parseISO(r.next_reminder_date), 'd MMM')}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Estimates by price — moved here from Projects since Estimates
            are owned by the sales team, and need follow-up like leads do. */}
        {data.isAdmin && data.estimatesByPrice && data.estimatesByPrice.length > 0 && (
          <div className="card p-3 md:p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-stone-900 text-sm">Estimates by price — follow up</h3>
              <div className="flex items-center gap-3">
                <span className="text-xs text-stone-400">Top 10 of {data.estimatesTotal}</span>
                <Link href="/salestracking?tab=estimates" className="text-xs text-brand-600 hover:underline">View all →</Link>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 text-xs text-stone-400 mb-2 flex-wrap">
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#94A3B8' }}/>&lt;5k</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#3B82F6' }}/>5–20k</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#F59E0B' }}/>20–50k</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#F97316' }}/>50–150k</span>
              <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: '#DC2626' }}/>150k+</span>
            </div>
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={data.estimatesByPrice} margin={{ bottom: 50 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4"/>
                <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#57534E' }} angle={-35} textAnchor="end" interval={0} height={65}/>
                <YAxis tick={{ fontSize: 10, fill: '#A8A29E' }}/>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }} formatter={(v: any) => `£${Number(v).toLocaleString()}`}/>
                <Bar dataKey="value" radius={[4, 4, 0, 0]} barSize={22}>
                  {data.estimatesByPrice.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Needs Analysis — leads that need following up on */}
        {data.isAdmin && (
          <div className="card p-3 md:p-4">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-semibold text-stone-900 text-sm">Needs Analysis — follow up</h3>
              <span className="text-xs text-stone-400">{data.leadsCount} leads</span>
            </div>
            <p className="text-base md:text-xl font-bold text-stone-900 mb-2">£{data.leadsTotal.toLocaleString()}</p>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.leadStageDist} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4"/>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#78716C' }} angle={-30} textAnchor="end" height={60}/>
                <YAxis tick={{ fontSize: 10, fill: '#A8A29E' }} allowDecimals={false}/>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}/>
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {data.leadStageDist.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Secondary detail charts, below the follow-up priorities */}
        {data.actionTypeDist && data.actionTypeDist.length > 0 && (
          <div className="card p-3 md:p-4">
            <h3 className="font-semibold text-stone-900 mb-3 text-sm">Sales actions by type</h3>
            <ResponsiveContainer width="100%" height={170}>
              <BarChart data={data.actionTypeDist} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4"/>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#78716C' }} angle={-30} textAnchor="end" height={60}/>
                <YAxis tick={{ fontSize: 10, fill: '#A8A29E' }} allowDecimals={false}/>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}/>
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {data.actionTypeDist.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Pipeline by stage + Project Handover by type — admin only */}
        {data.isAdmin && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="card p-3 md:p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-stone-900 text-sm">Quotes by stage</h3>
                <span className="text-xs text-stone-400">{data.dealsCount} deals</span>
              </div>
              <p className="text-base md:text-xl font-bold text-stone-900 mb-2">£{data.pipelineTotal.toLocaleString()}</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.pipelineStageDist} barSize={18}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4"/>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#78716C' }} angle={-30} textAnchor="end" height={60}/>
                  <YAxis tick={{ fontSize: 10, fill: '#A8A29E' }} allowDecimals={false}/>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}/>
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {data.pipelineStageDist.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.color}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="card p-3 md:p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-semibold text-stone-900 text-sm">Project Handover by type</h3>
                <span className="text-xs text-stone-400">{data.wonProjectsCount} projects</span>
              </div>
              <p className="text-base md:text-xl font-bold text-stone-900 mb-2">£{data.handoverTotal.toLocaleString()}</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={data.handoverTypeDist} barSize={32}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4"/>
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#A8A29E' }}/>
                  <YAxis tick={{ fontSize: 10, fill: '#A8A29E' }} allowDecimals={false}/>
                  <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}/>
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {data.handoverTypeDist.map((entry: any, i: number) => (
                      <Cell key={i} fill={entry.color}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        {/* Samples by stage */}
        {data.isAdmin && (
          <div className="card p-3 md:p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-stone-900 text-sm">Samples by stage</h3>
              <span className="text-xs text-stone-400">{data.samplesCount} samples</span>
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={data.sampleStageDist} barSize={18}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F5F5F4"/>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#78716C' }} angle={-30} textAnchor="end" height={60}/>
                <YAxis tick={{ fontSize: 10, fill: '#A8A29E' }} allowDecimals={false}/>
                <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #E7E5E4' }}/>
                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                  {data.sampleStageDist.map((entry: any, i: number) => (
                    <Cell key={i} fill={entry.color}/>
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
          </>
          )}
        </div>
        )}
      </div>

      {/* My Sales Tasks — full history, grouped by week */}
      {showWeeklyBreakdown && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowWeeklyBreakdown(false)}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-5 border-b border-stone-100 flex items-center justify-between flex-shrink-0">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">My Sales Actions, By Week</h3>
                <p className="text-xs text-stone-400 mt-0.5">{currentUserName} · {myAllTouchpoints.length} action{myAllTouchpoints.length !== 1 ? 's' : ''} total</p>
              </div>
              <button onClick={() => setShowWeeklyBreakdown(false)}><X size={18} className="text-stone-400"/></button>
            </div>

            <div className="overflow-y-auto flex-1 p-5">
              {loadingBreakdown ? (
                <div className="flex items-center justify-center py-16">
                  <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
                </div>
              ) : myAllTouchpoints.length === 0 ? (
                <p className="text-center text-sm text-stone-400 py-12">No sales actions logged yet</p>
              ) : (() => {
                // Group every action into its Monday-start week
                const weekMap: Record<string, { weekStart: Date; items: any[] }> = {}
                myAllTouchpoints.forEach((t: any) => {
                  if (!t.touch_date) return
                  const ws = startOfWeek(parseISO(t.touch_date), { weekStartsOn: 1 })
                  const key = format(ws, 'yyyy-MM-dd')
                  if (!weekMap[key]) weekMap[key] = { weekStart: ws, items: [] }
                  weekMap[key].items.push(t)
                })
                const weeks = Object.entries(weekMap).sort((a, b) => b[0].localeCompare(a[0]))

                return (
                  <div className="space-y-2">
                    {weeks.map(([key, w]) => {
                      const isOpen = expandedWeek === key
                      const weekEndDate = endOfWeek(w.weekStart, { weekStartsOn: 1 })
                      const byType: Record<string, number> = {}
                      w.items.forEach((t: any) => { byType[t.touchpoint_type || 'other'] = (byType[t.touchpoint_type || 'other'] || 0) + 1 })
                      return (
                        <div key={key} className="border border-stone-200 rounded-lg overflow-hidden">
                          <button onClick={() => setExpandedWeek(isOpen ? null : key)}
                            className="w-full flex items-center justify-between px-4 py-3 hover:bg-stone-50 transition-colors">
                            <div className="text-left">
                              <p className="text-sm font-medium text-stone-900">{format(w.weekStart, 'd MMM')} – {format(weekEndDate, 'd MMM yyyy')}</p>
                              <p className="text-xs text-stone-400 mt-0.5">{w.items.length} action{w.items.length !== 1 ? 's' : ''}</p>
                            </div>
                            <div className="flex items-center gap-1.5">
                              {Object.entries(byType).slice(0, 4).map(([type, count]) => (
                                <span key={type} className="text-xs bg-stone-100 text-stone-600 px-2 py-0.5 rounded-full">{type.replace(/_/g, ' ')} · {count}</span>
                              ))}
                            </div>
                          </button>
                          {isOpen && (
                            <div className="border-t border-stone-100 divide-y divide-stone-50">
                              {w.items.map((t: any) => (
                                <div key={t.id} className="px-4 py-2.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-sm text-stone-800 font-medium">
                                      {t.contact?.name}{t.contact?.company ? ` (${t.contact.company})` : ''}{t.project ? ` — ${t.project}` : ''}
                                    </span>
                                    <span className="text-xs text-stone-400 flex-shrink-0">{t.touch_date ? format(parseISO(t.touch_date), 'EEE d MMM') : ''}</span>
                                  </div>
                                  <p className="text-xs text-stone-500 mt-0.5">{(t.touchpoint_type || '').replace(/_/g, ' ')}{t.notes ? ` — ${t.notes}` : ''}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

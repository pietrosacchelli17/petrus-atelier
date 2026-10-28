import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { jsPDF } from 'jspdf'
import { format, startOfWeek, addDays } from 'date-fns'

export const dynamic = 'force-dynamic'

const STAGE_LABELS: Record<string, string> = {
  quotation: 'Quotation', material_approval: 'Material Approval', templating: 'Templating',
  drawings_submission: 'Drawings Submission', drawings_approval: 'Drawings Approval',
  fabrication: 'Fabrication', shipping: 'Shipping', delivery: 'Delivery',
  installation: 'Installation', snagging: 'Snagging', handover: 'Handover',
}
const DEAL_STAGE_LABELS: Record<string, string> = {
  designer_requested: 'Designer Requested', general_pricing: 'General Pricing', contractor_tender: 'Contractor Tender',
  end_user_price: 'End User Price', value_engineering: 'Value Engineering', expected_to_close: 'Expected to Close',
  closed_won: 'Closed Won', closed_lost: 'Closed Lost',
}
const LEAD_STAGE_LABELS: Record<string, string> = {
  needs_analysis: 'Needs Analysis', early_stage_design: 'Early Stage Design', developed_design: 'Developed Design',
  technical_drawings: 'Technical Drawings', need_to_quote: 'Need to Quote', closed_lost: 'Closed Lost',
}
const SAMPLE_STAGE_LABELS: Record<string, string> = {
  client_requested: 'Client Requested', requested_from_tr: 'Requested from TR', sent_from_uk: 'Sent from UK',
  in_transit_from_tr: 'In Transit', delivered_from_uk: 'Delivered from UK', delivered_from_tr: 'Delivered from TR',
  check_in_with_client: 'Check In with Client',
}
const TOUCHPOINT_TYPE_LABELS: Record<string, string> = {
  email: 'Email', call: 'Call', sr_walk_in: 'SR Walk In', sr_meeting: 'SR Meeting', visit: 'Visit',
  site_visit: 'Visit', online_meeting: 'Online Meeting', l_and_l_mtb: 'Marketing (L&L/MtB)',
  physical_touchpoint: 'Physical Touchpoint', quotation_request: 'Quotation Request', sample_request: 'Sample Request',
  other: 'Other', letter: 'Physical Letter', meeting: 'Meeting', sample_marketing: 'Sample Marketing',
}
const ROLE_LABELS: Record<string, string> = {
  end_user_client: 'End User', architect: 'Architect', interior_designer: 'Interior Designer',
  contractor: 'Contractor', developer: 'Developer', supplier: 'Supplier', other: 'Other',
}
function getTouchpointType(value: string): string {
  return TOUCHPOINT_TYPE_LABELS[value] || value || 'Other'
}
const PALETTE: [number, number, number][] = [
  [139, 92, 246], [59, 130, 246], [16, 185, 129], [245, 158, 11], [236, 72, 153],
  [99, 102, 241], [220, 38, 38], [5, 150, 105], [249, 115, 22], [14, 165, 233],
]

function groupCount(rows: any[], key: string): Record<string, number> {
  const counts: Record<string, number> = {}
  rows.forEach(r => { const k = r[key] || 'unspecified'; counts[k] = (counts[k] || 0) + 1 })
  return counts
}

// Draws a simple horizontal bar chart starting at (x, y), returns the y
// position after the chart so the caller can keep laying content out below.
function drawBarChart(pdf: jsPDF, counts: Record<string, number>, labelMap: Record<string, string>, x: number, y: number, barMaxWidth: number): number {
  const entries = Object.entries(counts)
  if (entries.length === 0) {
    pdf.setFontSize(9); pdf.setTextColor(120, 113, 108)
    pdf.text('No data this week', x, y)
    return y + 6
  }
  const maxCount = Math.max(1, ...entries.map(([, v]) => v))
  entries.forEach(([key, count], i) => {
    const barWidth = (count / maxCount) * barMaxWidth
    const color = PALETTE[i % PALETTE.length]
    pdf.setFillColor(color[0], color[1], color[2])
    pdf.rect(x + 45, y - 3.5, barWidth, 4, 'F')
    pdf.setFontSize(8); pdf.setTextColor(87, 83, 78)
    pdf.text((labelMap[key] || key).slice(0, 22), x, y)
    pdf.text(String(count), x + 45 + barWidth + 3, y)
    y += 7
  })
  return y + 4
}

function pageHeader(pdf: jsPDF, title: string, subtitle: string) {
  pdf.setFillColor(28, 25, 23)
  pdf.rect(0, 0, 210, 32, 'F')
  pdf.setTextColor(140, 127, 88); pdf.setFontSize(9)
  pdf.text('STONELINE UK', 15, 14)
  pdf.setTextColor(255, 255, 255); pdf.setFontSize(18)
  pdf.text(title, 15, 23)
  pdf.setFontSize(10); pdf.setTextColor(200, 200, 200)
  pdf.text(subtitle, 15, 29)
}

function sectionTitle(pdf: jsPDF, text: string, y: number): number {
  pdf.setFontSize(12); pdf.setTextColor(28, 25, 23)
  pdf.text(text, 15, y)
  return y + 6
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const [
    projectsRes, tasksRes, dealsRes, wonRes, leadsRes, samplesRes, estimatesRes,
    contactsRes, usersRes,
  ] = await Promise.all([
    supabase.from('projects').select('id, name, current_stage, status'),
    supabase.from('tasks').select('id, title, due_date, status, project:projects(name)').neq('status', 'completed'),
    supabase.from('sales_deals').select('id, name, client, value, stage'),
    supabase.from('sales_projects').select('id, name, value, project_type').is('converted_project_id', null),
    supabase.from('sales_leads').select('id, name, value, stage').neq('stage', 'closed_lost'),
    supabase.from('sales_samples').select('id, stage'),
    supabase.from('quotes').select('id, offer_name, client, grand_total, currency, created_at').order('created_at', { ascending: false }).limit(15),
    supabase.from('sales_contacts').select('*, touchpoints:sales_touchpoints(*)'),
    supabase.from('users').select('id, full_name, email, role').in('role', ['admin', 'manager']),
  ])

  const projects = projectsRes.data || []
  const overdueTasks = (tasksRes.data || []).filter((t: any) => t.due_date && new Date(t.due_date) < new Date())
  const deals = dealsRes.data || []
  const wonProjects = wonRes.data || []
  const leads = leadsRes.data || []
  const samples = samplesRes.data || []
  const estimates = estimatesRes.data || []
  const contacts = contactsRes.data || []
  const users = usersRes.data || []

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  const weekEnd = addDays(weekStart, 4)
  const weekLabel = `${format(weekStart, 'd MMM')} – ${format(weekEnd, 'd MMM yyyy')}`
  const dateStr = format(new Date(), 'yyyy-MM-dd')

  const savedFiles: string[] = []
  const errors: string[] = []

  // ─── PROJECT REPORT ───────────────────────────────────────────────
  {
    const pdf = new jsPDF('p', 'mm', 'a4')
    let y = 42
    pageHeader(pdf, 'Weekly Project Report', weekLabel)

    const active = projects.filter((p: any) => p.status === 'active').length
    const complete = projects.filter((p: any) => p.status === 'complete').length
    const cardItems = [
      { label: 'Active Projects', value: active, color: [16, 185, 129] },
      { label: 'Complete', value: complete, color: [5, 150, 105] },
      { label: 'Overdue Tasks', value: overdueTasks.length, color: [239, 68, 68] },
      { label: 'Recent Quotes', value: estimates.length, color: [59, 130, 246] },
    ]
    cardItems.forEach((item, i) => {
      const x = 15 + i * 47
      pdf.setFillColor(250, 250, 249); pdf.roundedRect(x, y, 44, 22, 2, 2, 'F')
      pdf.setTextColor(item.color[0], item.color[1], item.color[2]); pdf.setFontSize(16)
      pdf.text(String(item.value), x + 5, y + 13)
      pdf.setTextColor(120, 113, 108); pdf.setFontSize(7)
      pdf.text(item.label, x + 5, y + 18)
    })
    y += 32

    y = sectionTitle(pdf, 'Projects by Stage', y)
    const stageCounts: Record<string, number> = {}
    projects.forEach((p: any) => { if (p.current_stage) stageCounts[p.current_stage] = (stageCounts[p.current_stage] || 0) + 1 })
    y = drawBarChart(pdf, stageCounts, STAGE_LABELS, 15, y, 100) + 6

    y = sectionTitle(pdf, `Overdue Tasks (${overdueTasks.length})`, y)
    pdf.setFontSize(8)
    overdueTasks.slice(0, 20).forEach((t: any) => {
      if (y > 275) { pdf.addPage(); y = 20 }
      pdf.setTextColor(28, 25, 23); pdf.text((t.title || '').slice(0, 55), 15, y)
      pdf.setTextColor(120, 113, 108); pdf.text(t.project?.name || '', 110, y)
      pdf.setTextColor(220, 38, 38); pdf.text(t.due_date ? format(new Date(t.due_date), 'd MMM') : '', 170, y)
      y += 5.5
    })
    if (overdueTasks.length === 0) { pdf.setTextColor(120, 113, 108); pdf.text('No overdue tasks', 15, y); y += 6 }
    y += 6

    if (y > 250) { pdf.addPage(); y = 20 }
    y = sectionTitle(pdf, 'Upcoming Deliveries (next 2 weeks)', y)
    const twoWeeks = new Date(); twoWeeks.setDate(twoWeeks.getDate() + 14)
    const { data: msData } = await supabase
      .from('project_milestones')
      .select('planned_date, project:projects(name, client)')
      .eq('stage', 'delivery')
      .gte('planned_date', new Date().toISOString().split('T')[0])
      .lte('planned_date', twoWeeks.toISOString().split('T')[0])
      .order('planned_date')
    const deliveries = msData || []
    pdf.setFontSize(8)
    deliveries.slice(0, 15).forEach((d: any) => {
      if (y > 275) { pdf.addPage(); y = 20 }
      pdf.setTextColor(28, 25, 23); pdf.text(d.project?.name || '', 15, y)
      pdf.setTextColor(120, 113, 108); pdf.text(d.project?.client || '', 110, y)
      pdf.setTextColor(37, 99, 235); pdf.text(d.planned_date ? format(new Date(d.planned_date), 'd MMM') : '', 170, y)
      y += 5.5
    })
    if (deliveries.length === 0) { pdf.setTextColor(120, 113, 108); pdf.text('No deliveries scheduled in the next 2 weeks', 15, y); y += 6 }
    y += 6

    if (y > 240) { pdf.addPage(); y = 20 }
    y = sectionTitle(pdf, 'Recent Quotes', y)
    pdf.setFontSize(8)
    estimates.slice(0, 10).forEach((e: any) => {
      if (y > 275) { pdf.addPage(); y = 20 }
      pdf.setTextColor(28, 25, 23); pdf.text((e.offer_name || e.client || '').slice(0, 45), 15, y)
      pdf.setTextColor(120, 113, 108); pdf.text(e.client || '', 110, y)
      pdf.setTextColor(5, 150, 105); pdf.text(`${e.currency} ${Number(e.grand_total || 0).toLocaleString()}`, 165, y)
      y += 5.5
    })
    if (estimates.length === 0) { pdf.setTextColor(120, 113, 108); pdf.text('No quotes recorded', 15, y) }

    const buffer = Buffer.from(pdf.output('arraybuffer'))
    const fileName = `project-report-${dateStr}.pdf`
    const { error } = await supabase.storage.from('weekly-reports').upload(fileName, buffer, { contentType: 'application/pdf', upsert: true })
    if (error) errors.push(`project report: ${error.message}`)
    else savedFiles.push(fileName)
  }

  // ─── SALES REPORT — shared charts, computed once ───────────────────
  const touchpointsByType = groupCount(contacts.flatMap((c: any) => c.touchpoints || []), 'touchpoint_type')
  const dealStageCounts = groupCount(deals, 'stage')
  const handoverTypeCounts = groupCount(wonProjects, 'project_type')
  const leadStageCounts = groupCount(leads, 'stage')
  const sampleStageCounts = groupCount(samples, 'stage')

  // Initials for the "AM" column, matching how the team already refers
  // to each other on the manual spreadsheet (e.g. "PS", "KG", "AB").
  const initialsFor = (userId: string) => {
    const u = users.find((x: any) => x.id === userId)
    if (!u?.full_name) return '—'
    return u.full_name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
  }

  // The detailed activity log itself — every touchpoint logged this
  // week, across the whole team, in the same shape as the manual weekly
  // report spreadsheet: Date / AM / Client / Client Type / Project /
  // Lead Source / Status / Action / Notes.
  const weekActivities = contacts
    .flatMap((c: any) => (c.touchpoints || []).map((t: any) => ({ ...t, contactName: c.name, roleType: c.role_type })))
    .filter((t: any) => t.touch_date && new Date(t.touch_date) >= weekStart && new Date(t.touch_date) <= weekEnd)
    .sort((a: any, b: any) => (a.touch_date || '').localeCompare(b.touch_date || ''))

  function buildSalesReportPDF(): Buffer {
    const pdf = new jsPDF('p', 'mm', 'a4')
    let y = 42
    pageHeader(pdf, 'Weekly Sales Report', weekLabel)

    // Detailed activity log first — the actual narrative of what
    // happened this week, same shape as the manual spreadsheet.
    y = sectionTitle(pdf, `This Week's Activity (${weekActivities.length})`, y)
    if (weekActivities.length === 0) {
      pdf.setFontSize(9); pdf.setTextColor(120, 113, 108)
      pdf.text('No activity logged this week', 15, y); y += 8
    } else {
      const cols = { date: 15, am: 32, client: 44, type: 78, project: 100, action: 128, notes: 152 }
      const notesWidth = 43
      pdf.setFontSize(7.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(120, 113, 108)
      pdf.text('DATE', cols.date, y); pdf.text('AM', cols.am, y); pdf.text('CLIENT', cols.client, y)
      pdf.text('TYPE', cols.type, y); pdf.text('PROJECT', cols.project, y); pdf.text('ACTION', cols.action, y); pdf.text('NOTES', cols.notes, y)
      y += 2
      pdf.setDrawColor(220, 217, 214); pdf.line(15, y, 195, y)
      y += 5
      pdf.setFont('helvetica', 'normal')

      weekActivities.forEach((a: any) => {
        const tt = getTouchpointType(a.touchpoint_type)
        const notesLines = a.notes ? pdf.splitTextToSize(a.notes, notesWidth) : ['']
        const rowHeight = Math.max(5, notesLines.length * 3.6)
        if (y + rowHeight > 280) { pdf.addPage(); y = 20 }

        pdf.setFontSize(7); pdf.setTextColor(28, 25, 23)
        pdf.text(a.touch_date ? format(new Date(a.touch_date), 'dd/MM') : '', cols.date, y)
        pdf.text(initialsFor(a.created_by), cols.am, y)
        pdf.text((a.contactName || '').slice(0, 16), cols.client, y)
        pdf.setTextColor(87, 83, 78)
        pdf.text((ROLE_LABELS[a.roleType] || a.roleType || '').slice(0, 14), cols.type, y)
        pdf.text((a.project || '—').slice(0, 13), cols.project, y)
        pdf.text(tt.slice(0, 12), cols.action, y)
        pdf.setTextColor(120, 113, 108)
        pdf.text(notesLines, cols.notes, y)
        y += rowHeight + 1.5
      })
      y += 5
    }

    if (y > 250) { pdf.addPage(); y = 20 }
    y = sectionTitle(pdf, 'Sales Actions by Type', y)
    y = drawBarChart(pdf, touchpointsByType, {}, 15, y, 100) + 6

    if (y > 230) { pdf.addPage(); y = 20 }
    y = sectionTitle(pdf, 'Quotes by Stage', y)
    y = drawBarChart(pdf, dealStageCounts, DEAL_STAGE_LABELS, 15, y, 100) + 6

    if (y > 230) { pdf.addPage(); y = 20 }
    y = sectionTitle(pdf, 'Project Handovers by Type', y)
    y = drawBarChart(pdf, handoverTypeCounts, {}, 15, y, 100) + 6

    if (y > 230) { pdf.addPage(); y = 20 }
    y = sectionTitle(pdf, 'Needs Analysis by Stage', y)
    y = drawBarChart(pdf, leadStageCounts, LEAD_STAGE_LABELS, 15, y, 100) + 6

    if (y > 230) { pdf.addPage(); y = 20 }
    y = sectionTitle(pdf, 'Samples by Stage', y)
    y = drawBarChart(pdf, sampleStageCounts, SAMPLE_STAGE_LABELS, 15, y, 100) + 6

    // Everyone's pipeline, broken down by action type (meetings, visits,
    // calls, etc.) — this used to be a separate weekly archive PDF, now
    // folded directly into the same combined Sales Report.
    if (y > 220) { pdf.addPage(); y = 20 }
    y = sectionTitle(pdf, "Everyone's Pipeline — Actions by Type", y)
    const byPersonThisWeek: Record<string, any[]> = {}
    weekActivities.forEach((t: any) => {
      const key = t.created_by || 'unknown'
      if (!byPersonThisWeek[key]) byPersonThisWeek[key] = []
      byPersonThisWeek[key].push(t)
    })
    const peopleWithActivity = users.filter((u: any) => (byPersonThisWeek[u.id] || []).length > 0)
    if (peopleWithActivity.length === 0) {
      pdf.setFontSize(9); pdf.setTextColor(120, 113, 108)
      pdf.text('No pipeline activity logged this week', 15, y); y += 6
    } else {
      peopleWithActivity.forEach((person: any) => {
        const personActivity = byPersonThisWeek[person.id]
        const byType: Record<string, any[]> = {}
        personActivity.forEach((t: any) => {
          const key = t.touchpoint_type || 'other'
          if (!byType[key]) byType[key] = []
          byType[key].push(t)
        })
        if (y > 255) { pdf.addPage(); y = 20 }
        pdf.setFontSize(9.5); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(28, 25, 23)
        pdf.text(`${person.full_name || person.email} — ${personActivity.length} action${personActivity.length !== 1 ? 's' : ''}`, 15, y)
        y += 5.5
        pdf.setFont('helvetica', 'normal')
        Object.entries(byType).forEach(([type, items]) => {
          if (y > 270) { pdf.addPage(); y = 20 }
          pdf.setFontSize(8); pdf.setTextColor(87, 83, 78); pdf.setFont('helvetica', 'bold')
          pdf.text(`${getTouchpointType(type)} (${items.length})`, 20, y)
          y += 4.5
          pdf.setFont('helvetica', 'normal')
          items.forEach((t: any) => {
            if (y > 275) { pdf.addPage(); y = 20 }
            pdf.setFontSize(7.5); pdf.setTextColor(28, 25, 23)
            const label = `${t.contactName}${t.project ? ` — ${t.project}` : ''}`
            pdf.text(label.slice(0, 70), 24, y)
            pdf.setTextColor(160, 154, 148)
            pdf.text(t.touch_date ? format(new Date(t.touch_date), 'd MMM') : '', 175, y)
            y += 4
          })
        })
        y += 3
      })
    }

    // Combined section — everyone's pending follow-ups, grouped by
    // person, in the one shared Sales Report rather than a separate PDF
    // per person.
    if (y > 220) { pdf.addPage(); y = 20 }
    y = sectionTitle(pdf, 'Sales Follow-Ups — Everyone', y)
    if (allReminders.length === 0) {
      pdf.setFontSize(9); pdf.setTextColor(120, 113, 108)
      pdf.text('No pending follow-ups across the team — nothing to chase this week', 15, y)
      y += 6
    } else {
      users.forEach((person: any) => {
        const mine = allReminders.filter((r: any) => r.created_by === person.id)
        if (mine.length === 0) return
        if (y > 260) { pdf.addPage(); y = 20 }
        pdf.setFontSize(9); pdf.setFont('helvetica', 'bold'); pdf.setTextColor(28, 25, 23)
        pdf.text(`${person.full_name || person.email} (${mine.length})`, 15, y)
        y += 5.5
        pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8)
        mine.slice(0, 15).forEach((r: any) => {
          if (y > 275) { pdf.addPage(); y = 20 }
          pdf.setTextColor(28, 25, 23); pdf.text((r.contactName || '').slice(0, 40), 20, y)
          pdf.setTextColor(120, 113, 108); pdf.text((r.notes || r.touchpoint_type || '').slice(0, 32), 92, y)
          const overdue = r.next_reminder_date && new Date(r.next_reminder_date) < new Date()
          pdf.setTextColor(overdue ? 220 : 217, overdue ? 38 : 119, overdue ? 38 : 6)
          pdf.text(r.next_reminder_date ? format(new Date(r.next_reminder_date), 'd MMM') : '', 170, y)
          y += 5
        })
        y += 3
      })
    }

    return Buffer.from(pdf.output('arraybuffer'))
  }

  // One combined Sales Report for the whole team — not a separate PDF
  // per person. Everyone's follow-ups are grouped by name within it.
  const allReminders = contacts
    .flatMap((c: any) => (c.touchpoints || [])
      .filter((t: any) => t.next_reminder_date && !t.reminder_done)
      .map((t: any) => ({ ...t, contactName: c.name, contactCompany: c.company })))
    .sort((a: any, b: any) => (a.next_reminder_date || '').localeCompare(b.next_reminder_date || ''))

  const salesReportBuffer = buildSalesReportPDF()
  const salesReportFileName = `sales-report-${dateStr}.pdf`
  const { error: salesReportError } = await supabase.storage.from('weekly-reports').upload(salesReportFileName, salesReportBuffer, { contentType: 'application/pdf', upsert: true })
  if (salesReportError) errors.push(`sales report: ${salesReportError.message}`)
  else savedFiles.push(salesReportFileName)

  return NextResponse.json({ success: errors.length === 0, savedFiles, errors })
}

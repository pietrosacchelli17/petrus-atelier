'use client'
import { Suspense, useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useLanguage } from '@/lib/LanguageContext'
import { TranslationKey } from '@/lib/translations'
import { format, parseISO } from 'date-fns'
import { Plus, Check, X, Edit, Trash2, ArrowRight, FileText, ChevronLeft, ChevronRight, Beaker, Upload, Download, FileSpreadsheet } from 'lucide-react'
import toast from 'react-hot-toast'
import * as XLSX from 'xlsx'

type SubStatus = 'pending' | 'in_progress' | 'complete'
type ProjectType = 'slab_only' | 'cut_to_size' | 'supply_install'
type DealStage = 'designer_requested' | 'general_pricing' | 'contractor_tender' | 'end_user_price' | 'value_engineering' | 'expected_to_close' | 'closed_won' | 'closed_lost'
type LeadStage = 'needs_analysis' | 'early_stage_design' | 'developed_design' | 'technical_drawings' | 'need_to_quote' | 'closed_lost'
type SampleStage = 'client_requested' | 'requested_from_tr' | 'sent_from_uk' | 'in_transit_from_tr' | 'delivered_from_uk' | 'delivered_from_tr' | 'check_in_with_client'
type ActiveTab = 'needs_analysis' | 'quotes' | 'samples' | 'won' | 'estimates'

const COUNTRY_OPTIONS = [
  'United Kingdom', 'Saudi Arabia', 'UAE', 'Qatar', 'Kuwait', 'Bahrain',
  'France', 'Monaco', 'Italy', 'Spain', 'Germany', 'Switzerland', 'Ireland', 'USA', 'Other',
]

const PROJECT_TYPES: Record<ProjectType, { label: string; labelKey: TranslationKey; color: string; bg: string }> = {
  slab_only:      { label: 'Slab Only',       labelKey: 'type_slab_only',      color: '#8C7F58', bg: '#F5F3EE' },
  cut_to_size:    { label: 'Cut to Size',      labelKey: 'type_cut_to_size',    color: '#7C3AED', bg: '#F5F3FF' },
  supply_install: { label: 'Supply & Install', labelKey: 'type_supply_install', color: '#0D9488', bg: '#F0FDFA' },
}

const DEAL_STAGES: { id: DealStage; label: string; labelKey: TranslationKey; color: string }[] = [
  { id: 'designer_requested',  label: 'Designer Requested',  labelKey: 'stage_designer_requested', color: '#8B5CF6' },
  { id: 'general_pricing',     label: 'General Pricing',     labelKey: 'stage_general_pricing',    color: '#3B82F6' },
  { id: 'contractor_tender',   label: 'Contractor Tender',   labelKey: 'stage_contractor_tender',  color: '#F59E0B' },
  { id: 'end_user_price',      label: 'End User Price',      labelKey: 'stage_end_user_price',     color: '#7D8C74' },
  { id: 'value_engineering',   label: 'Value Engineering',   labelKey: 'stage_value_engineering',  color: '#0D9488' },
  { id: 'expected_to_close',   label: 'Expected to Close',   labelKey: 'stage_expected_to_close',  color: '#F97316' },
  { id: 'closed_won',          label: 'Closed Won',          labelKey: 'stage_closed_won',         color: '#059669' },
  { id: 'closed_lost',         label: 'Closed Lost',         labelKey: 'stage_closed_lost',        color: '#EF4444' },
]

const LEAD_STAGES: { id: LeadStage; label: string; labelKey: TranslationKey; color: string }[] = [
  { id: 'needs_analysis',       label: 'Needs Analysis',       labelKey: 'sales_needs_analysis',     color: '#8B5CF6' },
  { id: 'early_stage_design',   label: 'Early Stage Design',   labelKey: 'stage_early_stage_design', color: '#3B82F6' },
  { id: 'developed_design',     label: 'Developed Design',     labelKey: 'stage_developed_design',   color: '#0EA5E9' },
  { id: 'technical_drawings',   label: 'Technical Drawings',   labelKey: 'stage_technical_drawings', color: '#F59E0B' },
  { id: 'need_to_quote',        label: 'Need to Quote',        labelKey: 'stage_need_to_quote',      color: '#7D8C74' },
  { id: 'closed_lost',          label: 'Closed Lost',          labelKey: 'stage_closed_lost',        color: '#EF4444' },
]

const SAMPLE_STAGES: { id: SampleStage; label: string; labelKey: TranslationKey; color: string }[] = [
  { id: 'client_requested',      label: 'Client Requested',      labelKey: 'stage_client_requested',      color: '#8B5CF6' },
  { id: 'requested_from_tr',     label: 'Requested from TR',     labelKey: 'stage_requested_from_tr',     color: '#3B82F6' },
  { id: 'sent_from_uk',          label: 'Sent from UK',          labelKey: 'stage_sent_from_uk',          color: '#0EA5E9' },
  { id: 'in_transit_from_tr',    label: 'In Transit from TR',    labelKey: 'stage_in_transit_from_tr',    color: '#F97316' },
  { id: 'delivered_from_uk',     label: 'Delivered from UK',     labelKey: 'stage_delivered_from_uk',     color: '#7D8C74' },
  { id: 'delivered_from_tr',     label: 'Delivered from TR',     labelKey: 'stage_delivered_from_tr',     color: '#059669' },
  { id: 'check_in_with_client',  label: 'Check in with Client',  labelKey: 'stage_check_in_with_client',  color: '#EC4899' },
]

export default function SalesPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center h-full"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/></div>
    }>
      <SalesPageInner />
    </Suspense>
  )
}

function SalesPageInner() {
  const { t } = useLanguage()
  const searchParams = useSearchParams()
  const initialTab = (searchParams.get('tab') as ActiveTab) || 'quotes'
  const [tab, setTab] = useState<ActiveTab>(initialTab)
  const [wonProjects, setWonProjects] = useState<any[]>([])
  const [deals, setDeals] = useState<any[]>([])
  const [leads, setLeads] = useState<any[]>([])
  const [samples, setSamples] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [modalType, setModalType] = useState<'won' | 'deal' | 'lead' | 'sample'>('deal')
  const [editItem, setEditItem] = useState<any>(null)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [showLossReasonModal, setShowLossReasonModal] = useState(false)
  const [lossReasonTarget, setLossReasonTarget] = useState<{ type: 'deal' | 'lead'; id: string } | null>(null)
  const [lossReasonForm, setLossReasonForm] = useState({ category: 'Price', description: '' })
  const [filterType, setFilterType] = useState<'all' | ProjectType>('all')
  const [filterAM, setFilterAM] = useState<string>('all')
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const [wonForm, setWonForm] = useState({ name: '', client: '', value: '', pm_id: '', account_manager_id: '', project_type: 'supply_install' as ProjectType, notes: '', supply_date: '', installation_date: '', completion_date: '' })
  const [dealForm, setDealForm] = useState({ name: '', client: '', value: '', stage: 'designer_requested' as DealStage, closing_date: '', account_manager_id: '', project_manager_id: '', notes: '' })
  const [dealContactSearch, setDealContactSearch] = useState('')
  const [dealContactResults, setDealContactResults] = useState<any[]>([])
  const [dealContactId, setDealContactId] = useState('')
  const [allSalesContacts, setAllSalesContacts] = useState<any[]>([])
  const [leadForm, setLeadForm] = useState({ name: '', client: '', value: '', stage: 'needs_analysis' as LeadStage, closing_date: '', account_manager_id: '', project_manager_id: '', notes: '' })
  const [sampleForm, setSampleForm] = useState({
    name: '', client: '', stage: 'client_requested' as SampleStage, expected_date: '', account_manager_id: '', notes: '',
    attention_contact: '', email: '', phone: '', address: '', requested_by: '', ready_code: '', tracking_number: '',
    delivery_destination: 'office' as 'office' | 'client', request_date: '',
  })
  const [sampleLineItems, setSampleLineItems] = useState<{ stone_type: string; dimensions: string; surface_finish: string; quantity: number; unit: string }[]>([])

  // Estimates (imported quote documents)
  const [estimates, setEstimates] = useState<any[]>([])
  const [showImportModal, setShowImportModal] = useState(false)
  const [importStep, setImportStep] = useState<'upload' | 'preview'>('upload')
  const [importFile, setImportFile] = useState<File | null>(null)
  const [importParsed, setImportParsed] = useState<any>(null)
  const [importing, setImporting] = useState(false)
  const [selectedEstimate, setSelectedEstimate] = useState<any>(null)
  const [estimateLineItems, setEstimateLineItems] = useState<any[]>([])
  const [editingEstimate, setEditingEstimate] = useState(false)
  const [editForm, setEditForm] = useState<any>(null)
  const [editItems, setEditItems] = useState<any[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  const [payments, setPayments] = useState<any[]>([])
  const [showAddPayment, setShowAddPayment] = useState(false)
  const [paymentForm, setPaymentForm] = useState({ label: '', percentage: '', amount: '' })
  const [attachments, setAttachments] = useState<any[]>([])
  const [uploadingAttachment, setUploadingAttachment] = useState(false)
  const [lightboxImage, setLightboxImage] = useState<string | null>(null)

  // Keep the visible tab in sync with the URL — sidebar links change the
  // ?tab= param on this same route, which doesn't remount the component.
  useEffect(() => {
    const urlTab = (searchParams.get('tab') as ActiveTab) || 'quotes'
    setTab(urlTab)
  }, [searchParams])

  // Quick-action shortcuts (e.g. from the Reports page) — open the
  // relevant modal directly instead of landing on the plain tab.
  useEffect(() => {
    const action = searchParams.get('action')
    if (action === 'addQuote') openManualQuoteModal()
    else if (action === 'addSample') openAddSample()
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: profile } = await supabase.from('users').select('*').eq('id', data.user.id).single()
        setCurrentUser(profile)
        // Any manager or admin can access Sales — not just a fixed allowlist
        if (profile?.role !== 'admin' && profile?.role !== 'manager') {
          window.location.href = '/dashboard'
          return
        }
      }
    })
    loadAll()
  }, [])

  async function loadAll() {
    const [wonRes, dealsRes, leadsRes, samplesRes, usersRes, estimatesRes, contactsRes] = await Promise.all([
      supabase.from('sales_projects').select('*, pm:users!pm_id(*), account_manager:users!account_manager_id(*)').is('converted_project_id', null).order('created_at', { ascending: false }),
      supabase.from('sales_deals').select('*, account_manager:users!account_manager_id(*), project_manager:users!project_manager_id(*)').order('created_at', { ascending: false }),
      supabase.from('sales_leads').select('*, account_manager:users!account_manager_id(*), project_manager:users!project_manager_id(*)').order('created_at', { ascending: false }),
      supabase.from('sales_samples').select('*, account_manager:users!account_manager_id(*)').order('created_at', { ascending: false }),
      supabase.from('users').select('*').order('full_name'),
      supabase.from('quotes').select('*, account_manager:users!account_manager_id(*), prepared_by:users!prepared_by_id(*), linked_contact:sales_contacts!sales_contact_id(id, name, company), linked_deal:sales_deals!sales_deal_id(id, name, stage)').order('created_at', { ascending: false }),
      supabase.from('sales_contacts').select('id, name, company').order('company'),
    ])
    setWonProjects(wonRes.data || [])
    setDeals(dealsRes.data || [])
    setLeads(leadsRes.data || [])
    setSamples(samplesRes.data || [])
    setUsers(usersRes.data || [])
    setEstimates(estimatesRes.data || [])
    setAllSalesContacts(contactsRes.data || [])
    setLoading(false)
  }

  // ── WON PROJECTS ──
  function openAddWon() {
    setWonForm({ name: '', client: '', value: '', pm_id: '', account_manager_id: currentUser?.id || '', project_type: 'supply_install', notes: '', supply_date: '', installation_date: '', completion_date: '' })
    setEditItem(null)
    setModalType('won')
    setShowModal(true)
  }

  function openEditWon(p: any) {
    setWonForm({ name: p.name, client: p.client, value: p.value?.toString() || '', pm_id: p.pm_id || '', account_manager_id: p.account_manager_id || '', project_type: p.project_type || 'supply_install', notes: p.notes || '', supply_date: p.supply_date || '', installation_date: p.installation_date || '', completion_date: p.completion_date || '' })
    setEditItem(p)
    setModalType('won')
    setShowModal(true)
  }

  async function saveWon() {
    if (!wonForm.name.trim() || !wonForm.client.trim()) { toast.error('Name and client required'); return }
    setSaving(true)
    const payload = { name: wonForm.name.trim(), client: wonForm.client.trim(), value: wonForm.value ? Number(wonForm.value) : null, pm_id: wonForm.pm_id || null, account_manager_id: wonForm.account_manager_id || null, project_type: wonForm.project_type, notes: wonForm.notes || null, supply_date: wonForm.supply_date || null, installation_date: wonForm.installation_date || null, completion_date: wonForm.completion_date || null }
    if (editItem) {
      const { error } = await supabase.from('sales_projects').update(payload).eq('id', editItem.id)
      if (error) { toast.error(`Failed to save: ${error.message}`); setSaving(false); return }
      toast.success('Updated')
    } else {
      const { error } = await supabase.from('sales_projects').insert({ ...payload, created_by: currentUser?.id })
      if (error) { toast.error(`Failed to add: ${error.message}`); setSaving(false); return }
      toast.success('Added')
    }
    setSaving(false)
    setShowModal(false)
    loadAll()
  }

  async function deleteWon(id: string) {
    if (!confirm('Delete this project?')) return
    const { error } = await supabase.from('sales_projects').delete().eq('id', id)
    if (error) { toast.error(`Failed to delete: ${error.message}`); return }
    toast.success('Deleted')
    loadAll()
  }

  async function convertToActive(p: any) {
    if (!confirm('Convert "' + p.name + '" to an active project?')) return
    const { data, error } = await supabase.from('projects').insert({ name: p.name, client: p.client, value: p.value, project_manager_id: p.pm_id, notes: p.notes, project_type: p.project_type, current_stage: 'quotation', status: 'active' }).select().single()
    if (error) { toast.error(error.message); return }
    const { error: linkError } = await supabase.from('sales_projects').update({ converted_project_id: data.id }).eq('id', p.id)
    if (linkError) { toast.error(`Project created, but failed to link back: ${linkError.message}`); loadAll(); return }
    toast.success('Moved to active projects!')
    loadAll()
  }

  // ── QUOTES PIPELINE (sales_deals) ──
  function openAddDeal(stage?: DealStage) {
    setDealForm({ name: '', client: '', value: '', stage: stage || 'designer_requested', closing_date: '', account_manager_id: currentUser?.id || '', project_manager_id: '', notes: '' })
    setDealContactSearch('')
    setDealContactId('')
    setDealContactResults([])
    setEditItem(null)
    setModalType('deal')
    setShowModal(true)
  }

  function openEditDeal(d: any) {
    setDealForm({ name: d.name, client: d.client, value: d.value?.toString() || '', stage: d.stage, closing_date: d.closing_date || '', account_manager_id: d.account_manager_id || '', project_manager_id: d.project_manager_id || '', notes: d.notes || '' })
    setDealContactSearch(d.client || '')
    setDealContactId(d.sales_contact_id || '')
    setDealContactResults([])
    setEditItem(d)
    setModalType('deal')
    setShowModal(true)
  }

  async function saveDeal() {
    if (!dealForm.name.trim() || !dealContactSearch.trim()) { toast.error('Deal name and company required'); return }
    setSaving(true)

    // Resolve contact — link existing or create new
    let contactId = dealContactId
    if (!contactId && dealContactSearch.trim()) {
      const { data: existingContacts } = await supabase.from('sales_contacts').select('id, name, company')
      const existing = (existingContacts || []).find((c: any) =>
        (c.company || '').toLowerCase() === dealContactSearch.trim().toLowerCase() ||
        (c.name || '').toLowerCase() === dealContactSearch.trim().toLowerCase()
      )
      if (existing) {
        contactId = existing.id
      } else {
        const { data: newContact, error: contactError } = await supabase
          .from('sales_contacts')
          .insert({ name: dealContactSearch.trim(), company: dealContactSearch.trim(), role_type: 'other', status: 'outreach', created_by: currentUser?.id })
          .select().single()
        if (!contactError && newContact) {
          contactId = newContact.id
          toast.success(`New contact "${dealContactSearch.trim()}" added to Contacts`)
        }
      }
    }

    const payload = {
      name: dealForm.name.trim(),
      client: dealContactSearch.trim(),
      sales_contact_id: contactId || null,
      value: dealForm.value ? Number(dealForm.value) : null,
      stage: dealForm.stage,
      closing_date: dealForm.closing_date || null,
      account_manager_id: dealForm.account_manager_id || null,
      project_manager_id: dealForm.project_manager_id || null,
      notes: dealForm.notes || null
    }
    if (editItem) {
      const { error } = await supabase.from('sales_deals').update(payload).eq('id', editItem.id)
      if (error) { toast.error(`Failed to save: ${error.message}`); setSaving(false); return }
      toast.success('Updated')
    } else {
      const { error } = await supabase.from('sales_deals').insert({ ...payload, created_by: currentUser?.id })
      if (error) { toast.error(`Failed to add: ${error.message}`); setSaving(false); return }
      toast.success('Deal added')
    }
    setSaving(false)
    setShowModal(false)
    setDealContactSearch('')
    setDealContactResults([])
    setDealContactId('')
    loadAll()
  }

  async function deleteDeal(id: string) {
    if (!confirm('Delete this deal?')) return
    const { error } = await supabase.from('sales_deals').delete().eq('id', id)
    if (error) { toast.error(`Failed to delete: ${error.message}`); return }
    toast.success('Deleted')
    loadAll()
  }

  async function moveDeal(id: string, stage: DealStage) {
    if (stage === 'closed_lost') {
      setLossReasonTarget({ type: 'deal', id })
      setLossReasonForm({ category: 'Price', description: '' })
      setShowLossReasonModal(true)
      return
    }
    const { error } = await supabase.from('sales_deals').update({ stage }).eq('id', id)
    if (error) { toast.error(`Failed to move deal: ${error.message}`); return }
    if (stage === 'closed_won') {
      const deal = deals.find(d => d.id === id)
      if (deal) {
        const { error: convertError } = await supabase.from('sales_projects').insert({
          name: deal.name, client: deal.client, value: deal.value,
          account_manager_id: deal.account_manager_id,
          pm_id: deal.project_manager_id,
          project_type: 'supply_install',
          created_by: currentUser?.id,
        })
        if (convertError) toast.error(`Deal moved, but failed to create Won Project: ${convertError.message}`)
        else toast.success('Deal moved to Won Projects!')
      }
    }
    loadAll()
  }

  async function confirmLossReason() {
    if (!lossReasonTarget) return
    const table = lossReasonTarget.type === 'deal' ? 'sales_deals' : 'sales_leads'
    const { error } = await supabase.from(table).update({
      stage: 'closed_lost',
      loss_reason_category: lossReasonForm.category,
      loss_reason: lossReasonForm.description || null,
    }).eq('id', lossReasonTarget.id)
    if (error) { toast.error(`Failed to move: ${error.message}`); return }
    toast.success('Marked Closed Lost')
    setShowLossReasonModal(false)
    setLossReasonTarget(null)
    loadAll()
  }

  // ── NEEDS ANALYSIS PIPELINE (sales_leads) ──
  function openAddLead(stage?: LeadStage) {
    setLeadForm({ name: '', client: '', value: '', stage: stage || 'needs_analysis', closing_date: '', account_manager_id: currentUser?.id || '', project_manager_id: '', notes: '' })
    setEditItem(null)
    setModalType('lead')
    setShowModal(true)
  }

  function openEditLead(l: any) {
    setLeadForm({ name: l.name, client: l.client, value: l.value?.toString() || '', stage: l.stage, closing_date: l.closing_date || '', account_manager_id: l.account_manager_id || '', project_manager_id: l.project_manager_id || '', notes: l.notes || '' })
    setEditItem(l)
    setModalType('lead')
    setShowModal(true)
  }

  async function saveLead() {
    if (!leadForm.name.trim() || !leadForm.client.trim()) { toast.error('Name and client required'); return }
    setSaving(true)
    const payload = { name: leadForm.name.trim(), client: leadForm.client.trim(), value: leadForm.value ? Number(leadForm.value) : null, stage: leadForm.stage, closing_date: leadForm.closing_date || null, account_manager_id: leadForm.account_manager_id || null, project_manager_id: leadForm.project_manager_id || null, notes: leadForm.notes || null }
    if (editItem) {
      const { error } = await supabase.from('sales_leads').update(payload).eq('id', editItem.id)
      if (error) { toast.error(`Failed to save: ${error.message}`); setSaving(false); return }
      toast.success('Updated')
    } else {
      const { error } = await supabase.from('sales_leads').insert({ ...payload, created_by: currentUser?.id })
      if (error) { toast.error(`Failed to add: ${error.message}`); setSaving(false); return }
      toast.success('Lead added')
    }
    setSaving(false)
    setShowModal(false)
    loadAll()
  }

  async function deleteLead(id: string) {
    if (!confirm('Delete this lead?')) return
    const { error } = await supabase.from('sales_leads').delete().eq('id', id)
    if (error) { toast.error(`Failed to delete: ${error.message}`); return }
    toast.success('Deleted')
    loadAll()
  }

  async function moveLead(id: string, stage: LeadStage) {
    if (stage === 'closed_lost') {
      setLossReasonTarget({ type: 'lead', id })
      setLossReasonForm({ category: 'Price', description: '' })
      setShowLossReasonModal(true)
      return
    }
    const { error } = await supabase.from('sales_leads').update({ stage }).eq('id', id)
    if (error) { toast.error(`Failed to move: ${error.message}`); return }
    loadAll()
  }

  async function convertLeadToQuote(l: any) {
    if (!confirm(`Move "${l.name}" into the Quotes pipeline?`)) return
    const { error } = await supabase.from('sales_deals').insert({
      name: l.name, client: l.client, value: l.value,
      stage: 'designer_requested',
      account_manager_id: l.account_manager_id,
      project_manager_id: l.project_manager_id,
      notes: l.notes,
      created_by: currentUser?.id,
    })
    if (error) { toast.error(`Failed to create quote: ${error.message}`); return }
    const { error: delError } = await supabase.from('sales_leads').delete().eq('id', l.id)
    if (delError) { toast.error(`Quote created, but failed to remove lead: ${delError.message}`) }
    else toast.success('Moved to Quotes pipeline!')
    loadAll()
  }

  // ── SAMPLES PIPELINE (sales_samples) ──
  function openAddSample(stage?: SampleStage) {
    setSampleForm({
      name: '', client: '', stage: stage || 'client_requested', expected_date: '', account_manager_id: currentUser?.id || '', notes: '',
      attention_contact: '', email: '', phone: '', address: '', requested_by: currentUser?.full_name || '', ready_code: '', tracking_number: '',
      delivery_destination: 'office', request_date: format(new Date(), 'yyyy-MM-dd'),
    })
    setSampleLineItems([{ stone_type: '', dimensions: '', surface_finish: '', quantity: 1, unit: 'pc' }])
    setEditItem(null)
    setModalType('sample')
    setShowModal(true)
  }

  async function openEditSample(s: any) {
    setSampleForm({
      name: s.name, client: s.client || '', stage: s.stage, expected_date: s.expected_date || '', account_manager_id: s.account_manager_id || '', notes: s.notes || '',
      attention_contact: s.attention_contact || '', email: s.email || '', phone: s.phone || '', address: s.address || '',
      requested_by: s.requested_by || '', ready_code: s.ready_code || '', tracking_number: s.tracking_number || '',
      delivery_destination: s.delivery_destination || 'office', request_date: s.request_date || '',
    })
    const { data: items } = await supabase.from('sample_request_items').select('*').eq('sample_id', s.id).order('sort_order')
    setSampleLineItems(items && items.length > 0 ? items.map(i => ({ stone_type: i.stone_type, dimensions: i.dimensions || '', surface_finish: i.surface_finish || '', quantity: i.quantity, unit: i.unit })) : [{ stone_type: '', dimensions: '', surface_finish: '', quantity: 1, unit: 'pc' }])
    setEditItem(s)
    setModalType('sample')
    setShowModal(true)
  }

  function addSampleLineItem() {
    setSampleLineItems(prev => [...prev, { stone_type: '', dimensions: '', surface_finish: '', quantity: 1, unit: 'pc' }])
  }

  function removeSampleLineItem(index: number) {
    setSampleLineItems(prev => prev.filter((_, i) => i !== index))
  }

  function updateSampleLineItem(index: number, field: string, value: any) {
    setSampleLineItems(prev => prev.map((li, i) => i === index ? { ...li, [field]: value } : li))
  }

  async function saveSample() {
    if (!sampleForm.name.trim()) { toast.error('Name is required'); return }
    setSaving(true)
    const payload = {
      name: sampleForm.name.trim(), client: sampleForm.client.trim() || null, stage: sampleForm.stage,
      expected_date: sampleForm.expected_date || null, account_manager_id: sampleForm.account_manager_id || null, notes: sampleForm.notes || null,
      attention_contact: sampleForm.attention_contact.trim() || null, email: sampleForm.email.trim() || null,
      phone: sampleForm.phone.trim() || null, address: sampleForm.address.trim() || null,
      requested_by: sampleForm.requested_by.trim() || null, ready_code: sampleForm.ready_code.trim() || null,
      tracking_number: sampleForm.tracking_number.trim() || null, delivery_destination: sampleForm.delivery_destination,
      request_date: sampleForm.request_date || null,
    }
    let sampleId = editItem?.id
    if (editItem) {
      const { error } = await supabase.from('sales_samples').update(payload).eq('id', editItem.id)
      if (error) { toast.error(`Failed to save: ${error.message}`); setSaving(false); return }
      toast.success('Updated')
    } else {
      const { data, error } = await supabase.from('sales_samples').insert({ ...payload, created_by: currentUser?.id }).select().single()
      if (error) { toast.error(`Failed to add: ${error.message}`); setSaving(false); return }
      sampleId = data.id
      toast.success('Sample added')
    }

    // Replace line items wholesale — simpler and safer than diffing
    if (sampleId) {
      await supabase.from('sample_request_items').delete().eq('sample_id', sampleId)
      const validItems = sampleLineItems.filter(li => li.stone_type.trim())
      if (validItems.length > 0) {
        await supabase.from('sample_request_items').insert(
          validItems.map((li, idx) => ({ sample_id: sampleId, stone_type: li.stone_type.trim(), dimensions: li.dimensions.trim() || null, surface_finish: li.surface_finish.trim() || null, quantity: li.quantity, unit: li.unit, sort_order: idx }))
        )
      }
    }

    setSaving(false)
    setShowModal(false)
    loadAll()
  }

  async function generateSampleRequestPDF(sample: any) {
    const { data: items } = await supabase.from('sample_request_items').select('*').eq('sample_id', sample.id).order('sort_order')
    const { jsPDF } = await import('jspdf')
    const pdf = new jsPDF('p', 'mm', 'a4')

    pdf.setFontSize(16); pdf.setFont('helvetica', 'bold')
    pdf.text('SAMPLE REQUEST', 15, 20)
    pdf.setFontSize(9); pdf.setFont('helvetica', 'normal'); pdf.setTextColor(120, 113, 108)
    pdf.text('Stoneline UK', 15, 26)

    let y = 40
    const field = (label: string, value: string) => {
      pdf.setFont('helvetica', 'bold'); pdf.setTextColor(87, 83, 78); pdf.setFontSize(9)
      pdf.text(label, 15, y)
      pdf.setFont('helvetica', 'normal'); pdf.setTextColor(28, 25, 23)
      pdf.text(value || '—', 60, y)
      y += 7
    }
    field('DATE:', sample.request_date ? format(parseISO(sample.request_date), 'd MMM yyyy') : '')
    field('CLIENT:', sample.client)
    field('ATTENTION:', sample.attention_contact)
    field('EMAIL:', sample.email)
    field('TELEPHONE:', sample.phone)
    field('ADDRESS:', sample.address)
    field('PROJECT:', sample.name)
    field('REQUESTED BY:', sample.requested_by)
    field('NOTE:', sample.notes)
    if (sample.tracking_number) field('TRACKING NUMBER:', sample.tracking_number)

    y += 5
    pdf.setFillColor(28, 25, 23)
    pdf.rect(15, y - 5, 180, 8, 'F')
    pdf.setTextColor(255, 255, 255); pdf.setFontSize(8); pdf.setFont('helvetica', 'bold')
    pdf.text('STONE TYPE', 18, y)
    pdf.text('DIMENSIONS (MM)', 85, y)
    pdf.text('SURFACE FINISH', 125, y)
    pdf.text('QTY', 165, y)
    pdf.text('UNIT', 180, y)
    y += 8

    pdf.setFont('helvetica', 'normal'); pdf.setTextColor(28, 25, 23); pdf.setFontSize(8)
    ;(items || []).forEach((li: any) => {
      pdf.text(li.stone_type || '', 18, y)
      pdf.text(li.dimensions || '', 85, y)
      pdf.text(li.surface_finish || '', 125, y)
      pdf.text(String(li.quantity ?? ''), 165, y)
      pdf.text(li.unit || '', 180, y)
      y += 6
      pdf.setDrawColor(230, 227, 224)
      pdf.line(15, y - 4, 195, y - 4)
    })

    pdf.save(`Sample_Request_${(sample.name || 'request').replace(/[^a-z0-9]+/gi, '_')}.pdf`)
  }

  async function deleteSample(id: string) {
    if (!confirm('Delete this sample?')) return
    const { error } = await supabase.from('sales_samples').delete().eq('id', id)
    if (error) { toast.error(`Failed to delete: ${error.message}`); return }
    toast.success('Deleted')
    loadAll()
  }

  async function moveSample(id: string, stage: SampleStage) {
    const { error } = await supabase.from('sales_samples').update({ stage }).eq('id', id)
    if (error) { toast.error(`Failed to move: ${error.message}`); return }
    loadAll()
  }

  // ── ESTIMATES (imported quote documents) ──
  const [showManualQuoteModal, setShowManualQuoteModal] = useState(false)
  const [pricingOptions, setPricingOptions] = useState<any[]>([])
  const [manualQuoteForm, setManualQuoteForm] = useState({ offer_name: '', client: '', country: '', currency: 'GBP', shipping_handling: 0, subtotal_installation: 0, discount_percent: 0 })
  const [manualLineItems, setManualLineItems] = useState<{ material_name: string; finish: string; unit: string; quantity: number; unit_price: number }[]>([])

  async function openManualQuoteModal() {
    const { data } = await supabase.from('pricing_list').select('*').order('material_name')
    setPricingOptions(data || [])
    setManualQuoteForm({ offer_name: '', client: '', country: '', currency: 'GBP', shipping_handling: 0, subtotal_installation: 0, discount_percent: 0 })
    setManualLineItems([{ material_name: '', finish: '', unit: 'm2', quantity: 1, unit_price: 0 }])
    setShowManualQuoteModal(true)
  }

  function addManualLineItem() {
    setManualLineItems(prev => [...prev, { material_name: '', finish: '', unit: 'm2', quantity: 1, unit_price: 0 }])
  }

  function removeManualLineItem(index: number) {
    setManualLineItems(prev => prev.filter((_, i) => i !== index))
  }

  function updateManualLineItem(index: number, field: string, value: any) {
    setManualLineItems(prev => prev.map((li, i) => {
      if (i !== index) return li
      const updated = { ...li, [field]: value }
      // Selecting a known material from stock auto-fills its finish, unit,
      // and current price — still fully editable afterward, and typing a
      // name that isn't in the list just keeps it as a custom line item.
      if (field === 'material_name') {
        const match = pricingOptions.find(p => p.material_name === value)
        if (match) {
          updated.finish = match.finish || ''
          updated.unit_price = Number(match.price_per_m2) || 0
          updated.unit = 'm2'
        }
      }
      return updated
    }))
  }

  function manualLineTotal(li: { quantity: number; unit_price: number }) {
    return (li.quantity || 0) * (li.unit_price || 0)
  }

  const manualSubtotalMaterial = manualLineItems.reduce((sum, li) => sum + manualLineTotal(li), 0)
  const manualGrandTotal = calcGrandTotal(manualSubtotalMaterial, manualQuoteForm.shipping_handling, manualQuoteForm.subtotal_installation, manualQuoteForm.discount_percent)

  async function saveManualQuote() {
    if (!manualQuoteForm.offer_name.trim()) { toast.error('Quote name is required'); return }
    const validLines = manualLineItems.filter(li => li.material_name.trim())
    if (validLines.length === 0) { toast.error('Add at least one line item'); return }

    const { data: quoteRow, error } = await supabase.from('quotes').insert({
      offer_name: manualQuoteForm.offer_name.trim(),
      client: manualQuoteForm.client.trim() || null,
      country: manualQuoteForm.country.trim() || null,
      currency: manualQuoteForm.currency,
      prepared_by_id: currentUser?.id,
      discount_percent: manualQuoteForm.discount_percent || 0,
      subtotal_material: manualSubtotalMaterial,
      shipping_handling: manualQuoteForm.shipping_handling || 0,
      subtotal_installation: manualQuoteForm.subtotal_installation || 0,
      grand_total: manualGrandTotal,
      created_by: currentUser?.id,
      status: 'draft',
    }).select().single()

    if (error) { toast.error('Failed to save: ' + error.message); return }

    const rows = validLines.map((li, idx) => ({
      quote_id: quoteRow.id, sort_order: idx,
      product: li.material_name, finish: li.finish || null, unit: li.unit,
      quantity: li.quantity, unit_price: li.unit_price,
      subtotal: manualLineTotal(li), net_total: manualLineTotal(li),
    }))
    await supabase.from('quote_line_items').insert(rows)

    toast.success('Quote created')
    setShowManualQuoteModal(false)
    loadAll()
  }

  function openImportModal() {
    setImportStep('upload')
    setImportFile(null)
    setImportParsed(null)
    setShowImportModal(true)
  }

  function parseEstimateFile(file: File) {
    setImportFile(file)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: true })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const rows: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: false })

        // Scans every cell for a label match, then reads rightward on the
        // same row for the first non-empty cell — resilient to the label
        // and value not being in adjacent columns (common with merged cells).
        const findLabelValue = (labelPatterns: string[]): string => {
          for (let r = 0; r < rows.length; r++) {
            for (let c = 0; c < rows[r].length; c++) {
              const cellStr = String(rows[r][c] || '').trim().toLowerCase().replace(/:$/, '')
              if (labelPatterns.includes(cellStr)) {
                for (let c2 = c + 1; c2 < Math.min(c + 12, rows[r].length); c2++) {
                  const val = String(rows[r][c2] || '').trim()
                  if (val) return val
                }
              }
            }
          }
          return ''
        }

        const findTotalValue = (labelPatterns: string[]): number => {
          for (let r = 0; r < rows.length; r++) {
            for (let c = 0; c < rows[r].length; c++) {
              const cellStr = String(rows[r][c] || '').trim().toLowerCase()
              if (labelPatterns.some(p => cellStr.includes(p))) {
                for (let c2 = c + 1; c2 < rows[r].length; c2++) {
                  const num = parseMoney(rows[r][c2])
                  if (num !== null) return num
                }
              }
            }
          }
          return 0
        }

        const clientName = findLabelValue(['company / client name', 'client name', 'customer'])
        const clientAddress = findLabelValue(['company address'])

        // Best-effort country detection from the address — editable
        // afterward if it guesses wrong or the address doesn't mention one.
        const detectCountry = (address: string): string => {
          const lower = address.toLowerCase()
          if (lower.includes('saudi') || lower.includes('ksa') || lower.includes('riyadh') || lower.includes('jeddah')) return 'Saudi Arabia'
          if (lower.includes('united arab emirates') || lower.includes('uae') || lower.includes('dubai') || lower.includes('abu dhabi')) return 'UAE'
          if (lower.includes('qatar') || lower.includes('doha')) return 'Qatar'
          if (lower.includes('kuwait')) return 'Kuwait'
          if (lower.includes('bahrain')) return 'Bahrain'
          if (lower.includes('france') || lower.includes('paris') || lower.includes('nice') || lower.includes('cannes') || lower.includes('saint-tropez')) return 'France'
          if (lower.includes('monaco') || lower.includes('monte carlo') || lower.includes('monte-carlo')) return 'Monaco'
          if (lower.includes('italy') || lower.includes('milan') || lower.includes('rome') || lower.includes('como')) return 'Italy'
          if (lower.includes('spain') || lower.includes('madrid') || lower.includes('marbella') || lower.includes('barcelona')) return 'Spain'
          if (lower.includes('germany') || lower.includes('berlin') || lower.includes('munich')) return 'Germany'
          if (lower.includes('switzerland') || lower.includes('geneva') || lower.includes('zurich')) return 'Switzerland'
          if (lower.includes('ireland') || lower.includes('dublin')) return 'Ireland'
          if (lower.includes('united states') || /\busa\b/.test(lower) || lower.includes('new york') || lower.includes('miami') || lower.includes('los angeles')) return 'USA'
          if (lower.includes('united kingdom') || /\buk\b/.test(lower) || lower.includes('london') || lower.includes('england') || lower.includes('scotland') || lower.includes('wales')) return 'United Kingdom'
          return ''
        }
        const detectedCountry = detectCountry(clientAddress || '')
        const projectName = findLabelValue(['project'])
        const contactPerson = findLabelValue(['contact person'])
        const contactEmail = findLabelValue(['contact email'])
        const contactPhone = findLabelValue(['contact phone'])
        const offerDate = findLabelValue(['date'])
        const estimateNumber = findLabelValue(['estimate number'])
        const accountManager = findLabelValue(['account manager'])
        const preparedBy = findLabelValue(['prepared by'])
        const currency = findLabelValue(['currency']) || 'GBP'
        const memo = findLabelValue(['memo'])

        // Payment Terms / Delivery Terms are usually one long sentence
        // inside a single cell (e.g. "Payment Terms: a 50% deposit is
        // required...") rather than a separate label+value pair, so this
        // reads everything after the colon from within that same cell.
        const findInlineLabelText = (prefixes: string[]): string => {
          for (let r = 0; r < rows.length; r++) {
            for (let c = 0; c < rows[r].length; c++) {
              const cellStr = String(rows[r][c] || '').trim()
              const lower = cellStr.toLowerCase()
              for (const prefix of prefixes) {
                if (lower.startsWith(prefix)) {
                  const afterColon = cellStr.slice(cellStr.indexOf(':') + 1).trim()
                  if (afterColon) return afterColon
                }
              }
            }
          }
          return ''
        }
        const paymentTerms = findInlineLabelText(['payment terms:'])
        const deliveryTerms = findInlineLabelText(['delivery terms:'])

        // Discount, e.g. "Discount Price %25" — captures the number
        let discountPercent = 0
        for (let r = 0; r < rows.length; r++) {
          for (let c = 0; c < rows[r].length; c++) {
            const cellStr = String(rows[r][c] || '').trim().toLowerCase()
            if (cellStr.includes('discount')) {
              const match = cellStr.match(/(\d+(\.\d+)?)/)
              if (match) { discountPercent = parseFloat(match[1]); break }
              // discount % might be in the next cell instead of inline
              for (let c2 = c + 1; c2 < rows[r].length; c2++) {
                const nextMatch = String(rows[r][c2] || '').match(/(\d+(\.\d+)?)/)
                if (nextMatch) { discountPercent = parseFloat(nextMatch[1]); break }
              }
            }
          }
          if (discountPercent) break
        }

        // Normalizes the many ways people write units in stone quoting
        // (l.m, linear metre, sq m, m2, pcs, no...) down to a consistent form.
        // Currency-formatted cells come through as text like "£1,764.27",
        // not a plain number — parseFloat on that returns NaN and silently
        // becomes 0. This strips the symbol/separators first. Returns null
        // (not 0) for genuinely non-numeric text, so callers can still tell
        // "this cell has a real number" apart from "this cell is text".
        const parseMoney = (val: any): number | null => {
          if (val === null || val === undefined || val === '') return null
          const cleaned = String(val).replace(/[£$€,\s]/g, '').trim()
          if (cleaned === '') return null
          const num = parseFloat(cleaned)
          return isNaN(num) ? null : num
        }

        const normalizeUnit = (raw: string): string => {
          const u = raw.trim().toLowerCase().replace(/[.\s]/g, '')
          if (['lm', 'lnm', 'linearmetre', 'linearmeter', 'lm2'].includes(u)) return 'LM'
          if (['sqm', 'm2', 'm²', 'squaremetre', 'squaremeter'].includes(u)) return 'SQM'
          if (['unit', 'units', 'pcs', 'pc', 'each', 'no', 'nos', 'ea'].includes(u)) return 'Unit'
          return raw.trim() || 'Unit'
        }

        // Common natural stone finishes — scans description/product text
        // for a match so it's captured as structured data, not buried in
        // free text.
        const FINISH_KEYWORDS = [
          'polished', 'honed', 'leather finished', 'leathered', 'sandblasted',
          'sand blast', 'brushed', 'flamed', 'bush hammered', 'bush-hammered',
          'antiqued', 'tumbled', 'satin',
        ]
        const extractFinish = (text: string): string => {
          const lower = text.toLowerCase()
          for (const kw of FINISH_KEYWORDS) {
            if (lower.includes(kw)) {
              return kw.replace(/\b\w/g, c => c.toUpperCase())
            }
          }
          return ''
        }

        // Line items table — find the header row, map its columns, then
        // read rows until hitting a "Subtotal"/"Total" row or two blank rows.
        let headerRowIdx = -1
        const colMap: Record<string, number> = {}
        for (let r = 0; r < rows.length; r++) {
          const rowLower = rows[r].map((c: any) => String(c || '').trim().toLowerCase())
          if (rowLower.includes('material') && rowLower.includes('description') && rowLower.includes('quantity')) {
            headerRowIdx = r
            rowLower.forEach((hRaw, i) => {
              const h = hRaw.replace(/[^a-z ]/g, '').trim() // strip punctuation/currency symbols for matching
              if (h === 'material') colMap.material = i
              if (h.includes('description')) colMap.description = i
              if (h === 'category') colMap.category = i
              if (h.includes('quantity') || h === 'qty') colMap.quantity = i
              if (h === 'unit' || h === 'uom') colMap.unit = i
              // "Unit Price" (regular Estimate) or "Material Unit Price" (BOQ Estimate)
              if (h.includes('unit price')) colMap.unit_price = i
              // Prefer the rightmost total-like column — BOQ format has both
              // "Total Material Cost" and "Total"; the final "Total" column
              // is the one that matters for Amount.
              if (h === 'amount' || h === 'net amount' || h === 'net total' || h === 'total' || h === 'total material cost') colMap.amount = i
            })
            break
          }
        }

        const lineItems: any[] = []
        let currentSection = ''
        if (headerRowIdx >= 0) {
          for (let r = headerRowIdx + 1; r < rows.length; r++) {
            const row = rows[r]
            const rowLower = row.map((c: any) => String(c || '').trim().toLowerCase())
            if (rowLower.some((c: string) => c.includes('subtotal') || c.includes('grand total'))) break
            const product = colMap.material !== undefined ? String(row[colMap.material] || '').trim() : ''
            const description = colMap.description !== undefined ? String(row[colMap.description] || '').trim() : ''
            // Room/section header rows (e.g. "Powder Room", "Cigar Room
            // (7.01)") have text — often in the SAME column as Material,
            // which is why checking "is product empty" doesn't work — but
            // never have any quantity or amount data. That's the reliable
            // signal: text present, but nothing priced.
            const hasQuantity = colMap.quantity !== undefined && parseMoney(row[colMap.quantity]) !== null
            const hasAmount = colMap.amount !== undefined && parseMoney(row[colMap.amount]) !== null
            if ((product || description) && !hasQuantity && !hasAmount) {
              currentSection = product || description
              continue
            }
            if (!product && !description) continue
            const rawUnit = colMap.unit !== undefined ? String(row[colMap.unit] || '').trim() : ''
            let quantity = colMap.quantity !== undefined ? parseMoney(row[colMap.quantity]) || 0 : 0
            let unitPrice = colMap.unit_price !== undefined ? parseMoney(row[colMap.unit_price]) || 0 : 0
            const netTotal = colMap.amount !== undefined ? parseMoney(row[colMap.amount]) || 0 : 0
            // If one of quantity/unit price is missing but we have the
            // amount, back-calculate it rather than leaving it at 0.
            if (!quantity && unitPrice && netTotal) quantity = Math.round((netTotal / unitPrice) * 100) / 100
            if (!unitPrice && quantity && netTotal) unitPrice = Math.round((netTotal / quantity) * 100) / 100
            lineItems.push({
              product, description,
              category: (colMap.category !== undefined ? String(row[colMap.category] || '').trim() : '') || 'Material',
              room_section: currentSection,
              quantity, unit: rawUnit ? normalizeUnit(rawUnit) : '',
              unit_price: unitPrice, net_total: netTotal,
              finish: extractFinish(`${product} ${description}`),
            })
          }
        }

        // Collect every "Subtotal" row's value in order — first is usually
        // material/fabrication, second is shipping/installation.
        const subtotalValues: number[] = []
        for (let r = 0; r < rows.length; r++) {
          const rowLower = rows[r].map((c: any) => String(c || '').trim().toLowerCase())
          const idx = rowLower.findIndex((c: string) => c.includes('subtotal'))
          if (idx >= 0) {
            for (let c2 = idx + 1; c2 < rows[r].length; c2++) {
              const num = parseMoney(rows[r][c2])
              if (num !== null) { subtotalValues.push(num); break }
            }
          }
        }

        // Shipping & Handling sits as its own section (like "Dry Fit
        // Installation" does) — find that section header, then sum the
        // Amount column for the rows underneath it until the next section
        // or a Subtotal row.
        const findSectionTotal = (sectionLabel: string): number => {
          let sectionRowIdx = -1
          for (let r = 0; r < rows.length; r++) {
            const rowLower = rows[r].map((c: any) => String(c || '').trim().toLowerCase())
            if (rowLower.some((c: string) => c === sectionLabel.toLowerCase())) { sectionRowIdx = r; break }
          }
          if (sectionRowIdx === -1) return 0
          let total = 0
          for (let r = sectionRowIdx + 1; r < rows.length; r++) {
            const rowLower = rows[r].map((c: any) => String(c || '').trim().toLowerCase())
            if (rowLower.some((c: string) => c.includes('subtotal') || c.includes('grand total') || c.includes('dry fit') || c === 'installation')) break
            // Take the rightmost numeric value in the row — more robust
            // than a fixed column, since this section's layout sometimes
            // differs slightly from the main table's (e.g. BOQ format).
            let rowLast: number | null = null
            for (let c = 0; c < rows[r].length; c++) {
              const val = parseMoney(rows[r][c])
              if (val !== null) rowLast = val
            }
            if (rowLast !== null) total += rowLast
          }
          return total
        }
        const shippingHandling = findSectionTotal('shipping & handling') || findSectionTotal('shipping and handling')

        // Individual installation items (Templating, Installation Labour,
        // Ditra Matting, Post Installation Surface Finishing, Protection,
        // etc.) — this section has no header row of its own, so it reuses
        // the Quantity/Unit Price/Amount column positions already found
        // from the main line items table above.
        const installationItems: any[] = []
        let installSectionIdx = -1
        for (let r = 0; r < rows.length; r++) {
          const rowLower = rows[r].map((c: any) => String(c || '').trim().toLowerCase())
          if (rowLower.some((c: string) => c.includes('dry fit installation') || c === 'installation')) { installSectionIdx = r; break }
        }
        if (installSectionIdx >= 0 && colMap.amount !== undefined) {
          for (let r = installSectionIdx + 1; r < rows.length; r++) {
            const row = rows[r]
            const rowLower = row.map((c: any) => String(c || '').trim().toLowerCase())
            if (rowLower.some((c: string) => c.includes('subtotal') || c.includes('grand total'))) break
            const name = String(row[0] || '').trim()
            if (!name) continue
            const amount = parseMoney(row[colMap.amount])
            installationItems.push({
              product: name, description: '', category: 'Installation',
              quantity: colMap.quantity !== undefined ? parseMoney(row[colMap.quantity]) || 0 : 0,
              unit: colMap.unit !== undefined ? normalizeUnit(String(row[colMap.unit] || '')) : '',
              unit_price: colMap.unit_price !== undefined ? parseMoney(row[colMap.unit_price]) || 0 : 0,
              net_total: amount !== null ? amount : 0,
              finish: '',
            })
          }
        }

        // Four-tier fallback so Grand Total is almost never left at 0:
        // 1) explicit "Grand Total" label, 2) subtotals with the discount
        // applied (if one was found), 3) plain sum of subtotals,
        // 4) sum of every line item's Amount — in that order of preference.
        const rawSumOfSubtotals = subtotalValues.reduce((s, v) => s + v, 0)
        const discountedSum = discountPercent > 0 ? Math.round(rawSumOfSubtotals * (1 - discountPercent / 100) * 100) / 100 : 0
        const sumOfLineItems = [...lineItems, ...installationItems].reduce((s, li) => s + (li.net_total || 0), 0)
        const grandTotal = findTotalValue(['grand total']) || discountedSum || rawSumOfSubtotals || sumOfLineItems

        setImportParsed({
          offer_name: projectName || clientName || importFile?.name.replace(/\.(xlsx|xls)$/i, '') || 'Imported Estimate',
          client: clientName, client_address: clientAddress, project_name: projectName, country: detectedCountry,
          contact_person: contactPerson, contact_email: contactEmail, contact_phone: contactPhone,
          offer_date: offerDate, estimate_number: estimateNumber,
          account_manager_name: accountManager, prepared_by_name: preparedBy,
          currency, memo, payment_terms: paymentTerms, delivery_terms: deliveryTerms,
          discount_percent: discountPercent,
          subtotal_material: subtotalValues[0] || 0,
          shipping_handling: shippingHandling,
          subtotal_installation: subtotalValues[1] || 0,
          grand_total: grandTotal,
          line_items: [...lineItems, ...installationItems],
        })
        setImportStep('preview')
      } catch (err: any) {
        toast.error('Failed to read file: ' + err.message)
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function matchUserByName(name: string) {
    if (!name) return null
    const first = name.toLowerCase().split(' ')[0]
    const match = users.find(u => u.full_name?.toLowerCase().includes(first))
    return match?.id || null
  }

  function calcGrandTotal(subtotalMaterial: number, shipping: number, subtotalInstallation: number, discountPercent: number): number {
    const sum = (subtotalMaterial || 0) + (shipping || 0) + (subtotalInstallation || 0)
    return Math.round(sum * (1 - (discountPercent || 0) / 100) * 100) / 100
  }

  function updateImportLineItem(idx: number, field: string, value: any) {
    setImportParsed((prev: any) => ({
      ...prev,
      line_items: prev.line_items.map((li: any, i: number) => i === idx ? { ...li, [field]: value } : li),
    }))
  }

  function addImportLineItem() {
    setImportParsed((prev: any) => ({
      ...prev,
      line_items: [...(prev.line_items || []), { product: '', description: '', category: 'Material', finish: '', quantity: 0, unit: '', unit_price: 0, net_total: 0 }],
    }))
  }

  function removeImportLineItem(idx: number) {
    setImportParsed((prev: any) => ({
      ...prev,
      line_items: prev.line_items.filter((_: any, i: number) => i !== idx),
    }))
  }

  async function saveEstimate() {
    if (!importParsed) return
    setImporting(true)
    try {
      let filePath: string | null = null
      if (importFile) {
        filePath = `${Date.now()}_${importFile.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
        const { error: uploadError } = await supabase.storage.from('quote-files').upload(filePath, importFile)
        if (uploadError) toast.error('File upload failed: ' + uploadError.message)
      }

      // Find or create a matching Sales Contact, so the estimate is tied
      // into the CRM instead of sitting as a standalone document.
      let salesContactId: string | null = null
      const contactName = importParsed.contact_person || importParsed.client
      if (contactName) {
        const { data: existingContacts } = await supabase
          .from('sales_contacts')
          .select('id, name, company')
          .ilike('name', `%${contactName}%`)
        const existing = existingContacts?.[0]
        if (existing) {
          salesContactId = existing.id
        } else {
          const { data: newContact, error: contactError } = await supabase.from('sales_contacts').insert({
            name: contactName,
            company: importParsed.client || null,
            phone: importParsed.contact_phone || null,
            email: importParsed.contact_email || null,
            role_type: 'end_user_client',
            status: 'new_project',
            notes: `Auto-created from imported estimate: ${importParsed.offer_name}`,
            created_by: currentUser?.id,
          }).select().single()
          if (!contactError && newContact) salesContactId = newContact.id
        }
      }

      // Auto-create the matching deal in the Quotes pipeline, with the
      // estimate's grand total as its value — this is what makes it show
      // up in the pipeline automatically, as requested.
      let salesDealId: string | null = null
      const { data: newDeal, error: dealError } = await supabase.from('sales_deals').insert({
        name: importParsed.offer_name,
        client: importParsed.client || null,
        value: importParsed.grand_total || 0,
        stage: 'general_pricing',
        account_manager_id: importParsed.account_manager_id || matchUserByName(importParsed.account_manager_name),
        notes: importParsed.memo || null,
        created_by: currentUser?.id,
      }).select().single()
      if (!dealError && newDeal) salesDealId = newDeal.id
      else if (dealError) toast.error('Estimate saved, but failed to create pipeline deal: ' + dealError.message)

      const { data: quoteRow, error } = await supabase.from('quotes').insert({
        offer_name: importParsed.offer_name,
        estimate_number: importParsed.estimate_number || null,
        client: importParsed.client || null,
        client_address: importParsed.client_address || null,
        project_name: importParsed.project_name || null,
        contact_person: importParsed.contact_person || null,
        contact_email: importParsed.contact_email || null,
        contact_phone: importParsed.contact_phone || null,
        account_manager_id: importParsed.account_manager_id || matchUserByName(importParsed.account_manager_name),
        prepared_by_id: importParsed.prepared_by_id || matchUserByName(importParsed.prepared_by_name) || currentUser?.id,
        currency: importParsed.currency || 'GBP',
        country: importParsed.country || null,
        offer_date: importParsed.offer_date || null,
        memo: importParsed.memo || null,
        payment_terms: importParsed.payment_terms || null,
        delivery_terms: importParsed.delivery_terms || null,
        discount_percent: importParsed.discount_percent || 0,
        subtotal_material: importParsed.subtotal_material || 0,
        shipping_handling: importParsed.shipping_handling || 0,
        subtotal_installation: importParsed.subtotal_installation || 0,
        grand_total: importParsed.grand_total || 0,
        source_file_name: importFile?.name || null,
        source_file_url: filePath,
        sales_contact_id: salesContactId,
        sales_deal_id: salesDealId,
        created_by: currentUser?.id,
        status: 'draft',
      }).select().single()

      if (error) { toast.error('Failed to save: ' + error.message); setImporting(false); return }

      if (importParsed.line_items?.length) {
        const rows = importParsed.line_items.map((li: any, idx: number) => ({
          quote_id: quoteRow.id, sort_order: idx,
          product: li.product, description: li.description, category: li.category,
          quantity: li.quantity, unit: li.unit, unit_price: li.unit_price, finish: li.finish || null,
          room_section: li.room_section || null,
          subtotal: (li.quantity || 0) * (li.unit_price || 0), net_total: li.net_total,
        }))
        await supabase.from('quote_line_items').insert(rows)
      }

      // Log this as a Quotation Request action on the contact so it shows
      // up in their touchpoint history and the Action Log automatically.
      if (salesContactId) {
        await supabase.from('sales_touchpoints').insert({
          contact_id: salesContactId,
          touchpoint_type: 'quotation_request',
          touch_date: importParsed.offer_date || format(new Date(), 'yyyy-MM-dd'),
          notes: `${importParsed.offer_name} — ${importParsed.currency} ${Number(importParsed.grand_total || 0).toLocaleString()}`,
          created_by: currentUser?.id,
        })
      }

      toast.success('Estimate imported and linked to CRM!')
      setShowImportModal(false)
      loadAll()
    } catch (err: any) {
      toast.error('Import failed: ' + err.message)
    }
    setImporting(false)
  }

  async function openEstimateDetail(estimate: any) {
    setSelectedEstimate(estimate)
    setEditingEstimate(false)
    const { data } = await supabase.from('quote_line_items').select('*').eq('quote_id', estimate.id).order('sort_order')
    setEstimateLineItems(data || [])
    loadPayments(estimate.id)
    loadAttachments(estimate.id)
  }

  async function loadAttachments(quoteId: string) {
    const { data } = await supabase.from('quote_attachments').select('*').eq('quote_id', quoteId).order('created_at')
    // Bucket is private, so image thumbnails need a signed URL each —
    // fetch them all up front so the gallery renders straight away.
    const withUrls = await Promise.all((data || []).map(async (a: any) => {
      if (a.file_type !== 'image') return a
      const { data: signed } = await supabase.storage.from('quote-files').createSignedUrl(a.file_url, 3600)
      return { ...a, signedUrl: signed?.signedUrl }
    }))
    setAttachments(withUrls)
  }

  async function uploadAttachments(files: FileList | null, fileType: 'pdf' | 'image') {
    if (!files || files.length === 0 || !selectedEstimate) return
    setUploadingAttachment(true)
    for (const file of Array.from(files)) {
      const filePath = `attachments/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
      const { error: uploadError } = await supabase.storage.from('quote-files').upload(filePath, file)
      if (uploadError) { toast.error(`Failed to upload ${file.name}: ${uploadError.message}`); continue }
      await supabase.from('quote_attachments').insert({
        quote_id: selectedEstimate.id, file_type: fileType, file_name: file.name, file_url: filePath, uploaded_by: currentUser?.id,
      })
    }
    toast.success(`${files.length} file${files.length === 1 ? '' : 's'} uploaded`)
    loadAttachments(selectedEstimate.id)
    setUploadingAttachment(false)
  }

  async function deleteAttachment(attachment: any) {
    if (!confirm('Delete this file?')) return
    await supabase.storage.from('quote-files').remove([attachment.file_url])
    await supabase.from('quote_attachments').delete().eq('id', attachment.id)
    loadAttachments(selectedEstimate.id)
  }

  async function viewAttachment(attachment: any) {
    const { data, error } = await supabase.storage.from('quote-files').createSignedUrl(attachment.file_url, 3600)
    if (error || !data) { toast.error('Failed to get file link'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function loadPayments(quoteId: string) {
    const { data } = await supabase.from('quote_payments').select('*').eq('quote_id', quoteId).order('sort_order')
    setPayments(data || [])
  }

  const PAYMENT_PRESETS_BASE = [
    { name: '50 / 45 / 5', stages: [{ label: 'Advance Payment', percentage: 50 }, { label: 'Prior to Shipping/Installation', percentage: 45 }, { label: 'On Completion', percentage: 5 }] },
    { name: '50 / 50', stages: [{ label: 'Advance Payment', percentage: 50 }, { label: 'Balance', percentage: 50 }] },
    { name: '100% Upfront', stages: [{ label: 'Full Payment', percentage: 100 }] },
  ]
  // Gulf-region projects (Saudi Arabia etc.) commonly go 100% upfront —
  // surface that preset first for those countries; UK-style 50/45/5 stays
  // first everywhere else.
  const GULF_COUNTRIES = ['saudi arabia', 'uae', 'qatar', 'kuwait', 'bahrain']
  const PAYMENT_PRESETS = GULF_COUNTRIES.includes((selectedEstimate?.country || '').toLowerCase())
    ? [PAYMENT_PRESETS_BASE[2], PAYMENT_PRESETS_BASE[0], PAYMENT_PRESETS_BASE[1]]
    : PAYMENT_PRESETS_BASE

  async function applyPaymentPreset(stages: { label: string; percentage: number }[]) {
    if (!selectedEstimate) return
    const rows = stages.map((s, idx) => ({
      quote_id: selectedEstimate.id, label: s.label, percentage: s.percentage,
      amount: Math.round((selectedEstimate.grand_total || 0) * s.percentage / 100 * 100) / 100,
      sort_order: idx,
    }))
    const { error } = await supabase.from('quote_payments').insert(rows)
    if (error) { toast.error('Failed to add: ' + error.message); return }
    toast.success('Payment stages added')
    loadPayments(selectedEstimate.id)
  }

  function openAddPayment() {
    setPaymentForm({ label: '', percentage: '', amount: '' })
    setShowAddPayment(true)
  }

  async function savePaymentStage() {
    if (!selectedEstimate) return
    if (!paymentForm.label.trim()) { toast.error('Label is required'); return }
    const percentage = paymentForm.percentage ? parseFloat(paymentForm.percentage) : null
    const amount = paymentForm.amount
      ? parseFloat(paymentForm.amount)
      : percentage ? Math.round((selectedEstimate.grand_total || 0) * percentage / 100 * 100) / 100 : 0
    const { error } = await supabase.from('quote_payments').insert({
      quote_id: selectedEstimate.id, label: paymentForm.label.trim(), percentage, amount,
      sort_order: payments.length,
    })
    if (error) { toast.error('Failed to add: ' + error.message); return }
    toast.success('Payment stage added')
    setShowAddPayment(false)
    loadPayments(selectedEstimate.id)
  }

  async function markPaymentPaid(paymentId: string, currentStatus: string) {
    const newStatus = currentStatus === 'paid' ? 'pending' : 'paid'
    const { error } = await supabase.from('quote_payments').update({
      status: newStatus,
      paid_date: newStatus === 'paid' ? format(new Date(), 'yyyy-MM-dd') : null,
    }).eq('id', paymentId)
    if (error) { toast.error('Failed to update: ' + error.message); return }
    loadPayments(selectedEstimate.id)
  }

  async function uploadPaymentInvoice(paymentId: string, file: File) {
    const filePath = `invoices/${Date.now()}_${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`
    const { error: uploadError } = await supabase.storage.from('quote-files').upload(filePath, file)
    if (uploadError) { toast.error('Upload failed: ' + uploadError.message); return }
    const { error } = await supabase.from('quote_payments').update({
      invoice_file_name: file.name, invoice_file_url: filePath,
    }).eq('id', paymentId)
    if (error) { toast.error('Failed to save: ' + error.message); return }
    toast.success('Invoice uploaded')
    loadPayments(selectedEstimate.id)
  }

  async function downloadPaymentInvoice(payment: any) {
    if (!payment.invoice_file_url) { toast.error('No invoice attached'); return }
    const { data, error } = await supabase.storage.from('quote-files').createSignedUrl(payment.invoice_file_url, 3600)
    if (error || !data) { toast.error('Failed to get file link'); return }
    window.open(data.signedUrl, '_blank')
  }

  async function deletePaymentStage(paymentId: string) {
    if (!confirm('Delete this payment stage?')) return
    await supabase.from('quote_payments').delete().eq('id', paymentId)
    loadPayments(selectedEstimate.id)
  }

  function startEditEstimate() {
    setEditForm({
      offer_name: selectedEstimate.offer_name || '',
      client: selectedEstimate.client || '',
      project_name: selectedEstimate.project_name || '',
      estimate_number: selectedEstimate.estimate_number || '',
      offer_date: selectedEstimate.offer_date || '',
      currency: selectedEstimate.currency || 'GBP',
      country: selectedEstimate.country || '',
      discount_percent: selectedEstimate.discount_percent || 0,
      payment_terms: selectedEstimate.payment_terms || '',
      delivery_terms: selectedEstimate.delivery_terms || '',
      subtotal_material: selectedEstimate.subtotal_material || 0,
      shipping_handling: selectedEstimate.shipping_handling || 0,
      subtotal_installation: selectedEstimate.subtotal_installation || 0,
      grand_total: selectedEstimate.grand_total || 0,
      status: selectedEstimate.status || 'draft',
    })
    setEditItems(estimateLineItems.map(li => ({ ...li })))
    setEditingEstimate(true)
  }

  function cancelEditEstimate() {
    setEditingEstimate(false)
    setEditForm(null)
    setEditItems([])
  }

  function updateEditItem(idx: number, field: string, value: any) {
    setEditItems(prev => prev.map((li, i) => i === idx ? { ...li, [field]: value } : li))
  }

  function addEditItem() {
    setEditItems(prev => [...prev, { product: '', description: '', category: 'Material', finish: '', quantity: 0, unit: '', unit_price: 0, net_total: 0 }])
  }

  function removeEditItem(idx: number) {
    setEditItems(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveEstimateEdits() {
    if (!editForm || !selectedEstimate) return
    setSavingEdit(true)
    const { error } = await supabase.from('quotes').update({
      offer_name: editForm.offer_name,
      client: editForm.client || null,
      project_name: editForm.project_name || null,
      estimate_number: editForm.estimate_number || null,
      offer_date: editForm.offer_date || null,
      currency: editForm.currency,
      country: editForm.country || null,
      discount_percent: editForm.discount_percent || 0,
      payment_terms: editForm.payment_terms || null,
      delivery_terms: editForm.delivery_terms || null,
      subtotal_material: editForm.subtotal_material || 0,
      shipping_handling: editForm.shipping_handling || 0,
      subtotal_installation: editForm.subtotal_installation || 0,
      grand_total: editForm.grand_total || 0,
      status: editForm.status,
    }).eq('id', selectedEstimate.id)

    if (error) { toast.error('Failed to save: ' + error.message); setSavingEdit(false); return }

    // Simplest reliable approach: replace the whole line item set rather
    // than trying to diff/upsert individual rows.
    await supabase.from('quote_line_items').delete().eq('quote_id', selectedEstimate.id)
    if (editItems.length > 0) {
      const rows = editItems.map((li, idx) => ({
        quote_id: selectedEstimate.id, sort_order: idx,
        product: li.product || '', description: li.description || '', category: li.category || 'Material',
        finish: li.finish || null, room_section: li.room_section || null,
        quantity: li.quantity || 0, unit: li.unit || '', unit_price: li.unit_price || 0,
        subtotal: (li.quantity || 0) * (li.unit_price || 0), net_total: li.net_total || 0,
      }))
      await supabase.from('quote_line_items').insert(rows)
    }

    toast.success('Estimate updated')
    setEditingEstimate(false)
    loadAll()
    const { data } = await supabase.from('quotes').select('*, account_manager:users!account_manager_id(*), prepared_by:users!prepared_by_id(*), linked_contact:sales_contacts!sales_contact_id(id, name, company), linked_deal:sales_deals!sales_deal_id(id, name, stage)').eq('id', selectedEstimate.id).single()
    if (data) openEstimateDetail(data)
    setSavingEdit(false)
  }

  async function deleteEstimate(id: string) {
    if (!confirm('Delete this estimate?')) return
    await supabase.from('quotes').delete().eq('id', id)
    toast.success('Deleted')
    setSelectedEstimate(null)
    loadAll()
  }

  async function downloadEstimateFile(estimate: any) {
    if (!estimate.source_file_url) { toast.error('No original file attached'); return }
    const { data, error } = await supabase.storage.from('quote-files').createSignedUrl(estimate.source_file_url, 3600)
    if (error || !data) { toast.error('Failed to get file link'); return }
    window.open(data.signedUrl, '_blank')
  }

  function exportEstimateXLSX(estimate: any, lineItems: any[]) {
    const wb = XLSX.utils.book_new()
    const headerRows = [
      ['Offer Name', estimate.offer_name], ['Client', estimate.client],
      ['Project', estimate.project_name], ['Estimate Number', estimate.estimate_number],
      ['Date', estimate.offer_date], ['Currency', estimate.currency],
      ['Subtotal (Material)', estimate.subtotal_material],
      ['Shipping & Handling', estimate.shipping_handling],
      ['Subtotal (Installation)', estimate.subtotal_installation],
      ['Grand Total', estimate.grand_total], [],
    ]
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(headerRows), 'Details')
    const itemRows = lineItems.map(li => ({
      Product: li.product, Description: li.description, Finish: li.finish, Category: li.category,
      Quantity: li.quantity, Unit: li.unit, 'Unit Price': li.unit_price, 'Net Total': li.net_total,
    }))
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(itemRows), 'Line Items')
    XLSX.writeFile(wb, `${(estimate.offer_name || 'estimate').replace(/[^a-zA-Z0-9._ -]/g, '')}.xlsx`)
  }

  const filteredWon = filterType === 'all' ? wonProjects : wonProjects.filter(p => p.project_type === filterType)
  const amFilter = (item: any) => filterAM === 'all' || item.account_manager_id === filterAM || item.pm_id === filterAM
  const filteredDeals = deals.filter(amFilter)
  const filteredLeads = leads.filter(amFilter)
  const filteredSamples = samples.filter(amFilter)
  const filteredWonAM = filteredWon.filter(amFilter)
  const totalPipeline = filteredDeals.reduce((sum, d) => sum + (d.value || 0), 0)
  const totalLeads = filteredLeads.reduce((sum, l) => sum + (l.value || 0), 0)

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-3 md:px-5 py-3 border-b border-stone-100 flex-shrink-0 flex-wrap gap-2">
        <div className="flex items-center gap-4">
          <h1 className="text-lg font-semibold text-stone-900">{tab === 'estimates' ? t('nav_estimates') : tab === 'samples' ? t('nav_samples') : t('nav_sales')}</h1>
          {tab === 'quotes' && <span className="text-sm text-stone-400">Pipeline: <span className="font-semibold text-stone-700">£{totalPipeline.toLocaleString()}</span></span>}
          {tab === 'needs_analysis' && <span className="text-sm text-stone-400">Total: <span className="font-semibold text-stone-700">£{totalLeads.toLocaleString()}</span></span>}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Team member filter */}
          <select
            className="text-xs border border-stone-200 rounded-lg px-2.5 py-1.5 text-stone-600 bg-white focus:outline-none focus:ring-1 focus:ring-brand-400"
            value={filterAM}
            onChange={e => setFilterAM(e.target.value)}>
            <option value="all">{t('sales_all_team')}</option>
            {users.map((u: any) => (
              <option key={u.id} value={u.id}>{u.full_name?.split(' ')[0]}</option>
            ))}
          </select>
          {tab === 'estimates' && (
            <button onClick={openManualQuoteModal} className="btn-secondary flex items-center gap-2 text-sm py-1.5">
              <Plus size={14}/> {t('sales_create_quote')}
            </button>
          )}
          <button onClick={() => {
            if (tab === 'won') openAddWon()
            else if (tab === 'quotes') openAddDeal()
            else if (tab === 'needs_analysis') openAddLead()
            else if (tab === 'samples') openAddSample()
            else if (tab === 'estimates') openImportModal()
          }} className="btn-primary flex items-center gap-2 text-sm py-1.5">
            {tab === 'estimates' ? <Upload size={14}/> : <Plus size={14}/>}
            {tab === 'won' ? t('sales_new_sale') : tab === 'needs_analysis' ? t('sales_new_lead') : tab === 'samples' ? t('sales_new_sample') : tab === 'estimates' ? t('sales_import_estimate') : t('sales_new_deal')}
          </button>
        </div>
      </div>

      {/* Tabs — hidden on Estimates, which is now a standalone view reached directly from the sidebar */}
      {tab !== 'estimates' && tab !== 'samples' && (
        <div className="flex items-center gap-2 px-5 py-3 border-b border-stone-100 flex-shrink-0 overflow-x-auto">
          <button onClick={() => setTab('needs_analysis')}
            className={'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex-shrink-0 ' + (tab === 'needs_analysis' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200')}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#8B5CF6' }}/>
            {t('sales_needs_analysis')} ({filteredLeads.length})
          </button>
          <button onClick={() => setTab('quotes')}
            className={'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex-shrink-0 ' + (tab === 'quotes' ? 'bg-stone-900 text-white' : 'bg-stone-100 text-stone-500 hover:bg-stone-200')}>
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: '#3B82F6' }}/>
            {t('sales_quotes_type')} ({filteredDeals.length})
          </button>
          <button onClick={() => setTab('won')}
            className={'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all flex-shrink-0 ' + (tab === 'won' ? 'text-white' : 'text-green-700 hover:opacity-80')}
            style={tab === 'won' ? { background: '#059669' } : { background: '#ECFDF5' }}>
            <span className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0"/>
            {t('dash_project_handover')} ({wonProjects.length})
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center flex-1"><div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/></div>
      ) : tab === 'won' ? (
        /* WON PROJECTS */
        <div className="flex-1 overflow-y-auto p-5">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <div className="card p-3 text-center"><div className="text-2xl font-bold text-stone-700">{wonProjects.length}</div><div className="text-xs text-stone-400 mt-0.5">{t('sales_total_won')}</div></div>
            {(Object.entries(PROJECT_TYPES) as [ProjectType, typeof PROJECT_TYPES[ProjectType]][]).map(([type, tc]) => (
              <div key={type} className="card p-3 text-center"><div className="text-2xl font-bold" style={{ color: tc.color }}>{wonProjects.filter(p => p.project_type === type).length}</div><div className="text-xs text-stone-400 mt-0.5">{t(tc.labelKey)}</div></div>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-4 flex-wrap">
            <button onClick={() => setFilterType('all')} className={'text-xs px-3 py-1.5 rounded-full border transition-colors ' + (filterType === 'all' ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 text-stone-500')}>All ({wonProjects.length})</button>
            {(Object.entries(PROJECT_TYPES) as [ProjectType, typeof PROJECT_TYPES[ProjectType]][]).map(([type, tc]) => (
              <button key={type} onClick={() => setFilterType(type)} className={'text-xs px-3 py-1.5 rounded-full border transition-colors ' + (filterType === type ? 'text-white border-transparent' : 'bg-white border-stone-200 text-stone-500')} style={filterType === type ? { background: tc.color } : {}}>
                {t(tc.labelKey)} ({wonProjects.filter(p => p.project_type === type).length})
              </button>
            ))}
          </div>
          {filteredWon.length === 0 ? (
            <div className="card py-16 text-center"><p className="text-stone-400 text-sm mb-3">{t('sales_no_handover_yet')}</p><button onClick={openAddWon} className="btn-primary text-sm">+ {t('sales_add_first_project')}</button></div>
          ) : (
            <div className="space-y-3">
              {filteredWon.map(p => {
                const tc = PROJECT_TYPES[p.project_type as ProjectType || 'supply_install']
                return (
                  <div key={p.id} className="card p-4 md:p-5">
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <h3 className="font-semibold text-stone-900">{p.name}</h3>
                          <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: tc.bg, color: tc.color }}>{t(tc.labelKey)}</span>
                        </div>
                        <p className="text-sm text-stone-500">{p.client}{p.value ? <span className="ml-2 font-semibold text-stone-700">£{p.value.toLocaleString()}</span> : null}</p>
                        <div className="flex items-center gap-3 mt-1 flex-wrap">
                          {p.account_manager && <div className="flex items-center gap-1"><div className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold" style={{ background: p.account_manager.color || '#8C7F58', fontSize: '8px' }}>{p.account_manager.full_name?.slice(0,1)}</div><span className="text-xs text-stone-400">AM: {p.account_manager.full_name?.split(' ')[0]}</span></div>}
                          {p.pm && <div className="flex items-center gap-1"><div className="w-4 h-4 rounded-full flex items-center justify-center text-white font-bold" style={{ background: p.pm.color || '#7D8C74', fontSize: '8px' }}>{p.pm.full_name?.slice(0,1)}</div><span className="text-xs text-stone-400">PM: {p.pm.full_name?.split(' ')[0]}</span></div>}
                          {p.won_date && <span className="text-xs text-stone-400">{t('sales_won')} {format(parseISO(p.won_date), 'd MMM yyyy')}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button onClick={() => openEditWon(p)} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400"><Edit size={14}/></button>
                        <button onClick={() => deleteWon(p.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-stone-400 hover:text-red-500"><Trash2 size={14}/></button>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-stone-100 flex items-center justify-between">
                      <p className="text-xs text-stone-400">{t('sales_ready_to_convert')}</p>
                      <button onClick={() => convertToActive(p)}
                        className="flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg font-semibold text-white"
                        style={{ background: '#7D8C74' }}>
                        <Check size={13}/> {t('sales_confirm_activate')}
                      </button>
                    </div>
                    {p.notes && <p className="text-xs text-stone-400 mt-2 italic">{p.notes}</p>}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : tab === 'quotes' ? (
        /* QUOTES PIPELINE (was: Pipeline) */
        <div className="flex-1 overflow-y-auto md:overflow-x-auto md:overflow-y-hidden">
          <div className="flex flex-col md:flex-row md:h-full w-full md:min-w-[900px]">
            {DEAL_STAGES.map((stage) => {
              const stageDeals = filteredDeals.filter(d => d.stage === stage.id)
              const total = stageDeals.reduce((sum, d) => sum + (d.value || 0), 0)
              return (
                <div key={stage.id} className="flex flex-col md:border-r border-b md:border-b-0 border-stone-100 md:h-full flex-1 min-w-0"
                  onDragOver={e => e.preventDefault()}
                  onDrop={async e => { e.preventDefault(); if (draggedId) { await moveDeal(draggedId, stage.id); setDraggedId(null) } }}>
                  <div className="px-3 py-3 border-b border-stone-100 flex-shrink-0" style={{ borderTop: '3px solid ' + stage.color }}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-stone-700">{t(stage.labelKey)}</p>
                      <span className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full">{stageDeals.length}</span>
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5">£{total.toLocaleString()}</p>
                  </div>
                  <div className="md:flex-1 md:overflow-y-auto p-2 space-y-2">
                    {stageDeals.map(deal => {
                      const isOverdue = deal.closing_date && new Date(deal.closing_date) < new Date()
                      return (
                        <div key={deal.id} draggable onDragStart={() => setDraggedId(deal.id)} onDragEnd={() => setDraggedId(null)}
                          className="bg-white rounded-lg border border-stone-200 p-2.5 md:p-3 cursor-grab hover:shadow-sm transition-shadow group">
                          <div className="flex items-start justify-between gap-1 mb-1.5 md:mb-2">
                            <p className="text-sm font-medium text-stone-900 leading-snug">{deal.name}</p>
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <button onClick={() => openEditDeal(deal)} className="p-1 hover:bg-stone-100 rounded text-stone-400"><Edit size={11}/></button>
                              <button onClick={() => deleteDeal(deal.id)} className="p-1 hover:bg-red-50 rounded text-stone-400 hover:text-red-500"><Trash2 size={11}/></button>
                            </div>
                          </div>
                          {deal.value ? <p className="text-sm font-semibold text-stone-700 mb-1">£{deal.value.toLocaleString()}</p> : null}
                          {deal.closing_date && <p className={'text-xs mb-1 ' + (isOverdue ? 'text-red-500 font-medium' : 'text-stone-400')}>{format(parseISO(deal.closing_date), 'd MMM yyyy')}</p>}
                          {deal.account_manager && (
                            <div className="flex items-center gap-1.5 mt-2">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: deal.account_manager.color || '#8C7F58', fontSize: '9px' }}>{deal.account_manager.full_name?.slice(0,1)}</div>
                              <span className="text-xs text-stone-500">{deal.account_manager.full_name?.split(' ')[0]}</span>
                            </div>
                          )}
                          <p className="text-xs text-stone-400 mt-1">{deal.client}</p>
                          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {DEAL_STAGES.indexOf(stage) > 0 && (
                              <button onClick={() => moveDeal(deal.id, DEAL_STAGES[DEAL_STAGES.indexOf(stage) - 1].id)} className="flex-1 text-xs py-0.5 rounded border border-stone-200 hover:bg-stone-50 text-stone-400 flex items-center justify-center gap-0.5">
                                <ChevronLeft size={10}/> Back
                              </button>
                            )}
                            {DEAL_STAGES.indexOf(stage) < DEAL_STAGES.length - 1 && (
                              <button onClick={() => moveDeal(deal.id, DEAL_STAGES[DEAL_STAGES.indexOf(stage) + 1].id)} className="flex-1 text-xs py-0.5 rounded border flex items-center justify-center gap-0.5 font-medium" style={{ borderColor: DEAL_STAGES[DEAL_STAGES.indexOf(stage) + 1].color, color: DEAL_STAGES[DEAL_STAGES.indexOf(stage) + 1].color }}>
                                Next <ChevronRight size={10}/>
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <button onClick={() => openAddDeal(stage.id)} className="w-full text-xs text-stone-400 hover:text-stone-600 py-2 border border-dashed border-stone-200 rounded-lg hover:border-stone-300 transition-colors">+ Add deal</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : tab === 'needs_analysis' ? (
        /* NEEDS ANALYSIS PIPELINE */
        <div className="flex-1 overflow-y-auto md:overflow-x-auto md:overflow-y-hidden">
          <div className="flex flex-col md:flex-row md:h-full w-full md:min-w-[900px]">
            {LEAD_STAGES.map((stage) => {
              const stageLeads = filteredLeads.filter(l => l.stage === stage.id)
              const total = stageLeads.reduce((sum, l) => sum + (l.value || 0), 0)
              return (
                <div key={stage.id} className="flex flex-col md:border-r border-b md:border-b-0 border-stone-100 md:h-full flex-1 min-w-0"
                  onDragOver={e => e.preventDefault()}
                  onDrop={async e => { e.preventDefault(); if (draggedId) { await moveLead(draggedId, stage.id); setDraggedId(null) } }}>
                  <div className="px-3 py-3 border-b border-stone-100 flex-shrink-0" style={{ borderTop: '3px solid ' + stage.color }}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-stone-700">{t(stage.labelKey)}</p>
                      <span className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full">{stageLeads.length}</span>
                    </div>
                    <p className="text-xs text-stone-400 mt-0.5">£{total.toLocaleString()}</p>
                  </div>
                  <div className="md:flex-1 md:overflow-y-auto p-2 space-y-2">
                    {stageLeads.map(lead => (
                      <div key={lead.id} draggable onDragStart={() => setDraggedId(lead.id)} onDragEnd={() => setDraggedId(null)}
                        className="bg-white rounded-lg border border-stone-200 p-2.5 md:p-3 cursor-grab hover:shadow-sm transition-shadow group">
                        <div className="flex items-start justify-between gap-1 mb-1.5 md:mb-2">
                          <p className="text-sm font-medium text-stone-900 leading-snug">{lead.name}</p>
                          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            <button onClick={() => openEditLead(lead)} className="p-1 hover:bg-stone-100 rounded text-stone-400"><Edit size={11}/></button>
                            <button onClick={() => deleteLead(lead.id)} className="p-1 hover:bg-red-50 rounded text-stone-400 hover:text-red-500"><Trash2 size={11}/></button>
                          </div>
                        </div>
                        {lead.value ? <p className="text-sm font-semibold text-stone-700 mb-1">£{lead.value.toLocaleString()}</p> : null}
                        {lead.account_manager && (
                          <div className="flex items-center gap-1.5 mt-2">
                            <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: lead.account_manager.color || '#8C7F58', fontSize: '9px' }}>{lead.account_manager.full_name?.slice(0,1)}</div>
                            <span className="text-xs text-stone-500">{lead.account_manager.full_name?.split(' ')[0]}</span>
                          </div>
                        )}
                        <p className="text-xs text-stone-400 mt-1">{lead.client}</p>
                        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {LEAD_STAGES.indexOf(stage) > 0 && (
                            <button onClick={() => moveLead(lead.id, LEAD_STAGES[LEAD_STAGES.indexOf(stage) - 1].id)} className="flex-1 text-xs py-0.5 rounded border border-stone-200 hover:bg-stone-50 text-stone-400 flex items-center justify-center gap-0.5">
                              <ChevronLeft size={10}/> Back
                            </button>
                          )}
                          {LEAD_STAGES.indexOf(stage) < LEAD_STAGES.length - 1 && (
                            <button onClick={() => moveLead(lead.id, LEAD_STAGES[LEAD_STAGES.indexOf(stage) + 1].id)} className="flex-1 text-xs py-0.5 rounded border flex items-center justify-center gap-0.5 font-medium" style={{ borderColor: LEAD_STAGES[LEAD_STAGES.indexOf(stage) + 1].color, color: LEAD_STAGES[LEAD_STAGES.indexOf(stage) + 1].color }}>
                              Next <ChevronRight size={10}/>
                            </button>
                          )}
                        </div>
                        {stage.id === 'need_to_quote' && (
                          <button onClick={() => convertLeadToQuote(lead)}
                            className="w-full mt-2 text-xs py-1.5 rounded-lg font-semibold text-white flex items-center justify-center gap-1"
                            style={{ background: '#7D8C74' }}>
                            <ArrowRight size={11}/> Move to Quotes
                          </button>
                        )}
                      </div>
                    ))}
                    <button onClick={() => openAddLead(stage.id)} className="w-full text-xs text-stone-400 hover:text-stone-600 py-2 border border-dashed border-stone-200 rounded-lg hover:border-stone-300 transition-colors">+ Add lead</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : tab === 'samples' ? (
        /* SAMPLES PIPELINE */
        <div className="flex-1 overflow-y-auto md:overflow-x-auto md:overflow-y-hidden">
          <div className="flex flex-col md:flex-row md:h-full w-full md:min-w-[900px]">
            {SAMPLE_STAGES.map((stage) => {
              const stageSamples = filteredSamples.filter(s => s.stage === stage.id)
              return (
                <div key={stage.id} className="flex flex-col md:border-r border-b md:border-b-0 border-stone-100 md:h-full flex-1 min-w-0"
                  onDragOver={e => e.preventDefault()}
                  onDrop={async e => { e.preventDefault(); if (draggedId) { await moveSample(draggedId, stage.id); setDraggedId(null) } }}>
                  <div className="px-3 py-3 border-b border-stone-100 flex-shrink-0" style={{ borderTop: '3px solid ' + stage.color }}>
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold text-stone-700">{t(stage.labelKey)}</p>
                      <span className="text-xs text-stone-400 bg-stone-100 px-1.5 py-0.5 rounded-full">{stageSamples.length}</span>
                    </div>
                  </div>
                  <div className="md:flex-1 md:overflow-y-auto p-2 space-y-2">
                    {stageSamples.map(sample => {
                      const isOverdue = sample.expected_date && new Date(sample.expected_date) < new Date()
                      return (
                        <div key={sample.id} draggable onDragStart={() => setDraggedId(sample.id)} onDragEnd={() => setDraggedId(null)}
                          className="bg-white rounded-lg border border-stone-200 p-2.5 md:p-3 cursor-grab hover:shadow-sm transition-shadow group">
                          <div className="flex items-start justify-between gap-1 mb-1.5 md:mb-2">
                            <p className="text-sm font-medium text-stone-900 leading-snug">{sample.name}</p>
                            <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                              <button onClick={() => generateSampleRequestPDF(sample)} className="p-1 hover:bg-stone-100 rounded text-stone-400" title={t('sample_generate_pdf')}><FileText size={11}/></button>
                              <button onClick={() => openEditSample(sample)} className="p-1 hover:bg-stone-100 rounded text-stone-400"><Edit size={11}/></button>
                              <button onClick={() => deleteSample(sample.id)} className="p-1 hover:bg-red-50 rounded text-stone-400 hover:text-red-500"><Trash2 size={11}/></button>
                            </div>
                          </div>
                          {sample.expected_date && <p className={'text-xs mb-1 ' + (isOverdue ? 'text-red-500 font-medium' : 'text-stone-400')}>{format(parseISO(sample.expected_date), 'd MMM yyyy')}</p>}
                          {sample.account_manager && (
                            <div className="flex items-center gap-1.5 mt-2">
                              <div className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0" style={{ background: sample.account_manager.color || '#8C7F58', fontSize: '9px' }}>{sample.account_manager.full_name?.slice(0,1)}</div>
                              <span className="text-xs text-stone-500">{sample.account_manager.full_name?.split(' ')[0]}</span>
                            </div>
                          )}
                          {sample.client && <p className="text-xs text-stone-400 mt-1">{sample.client}</p>}
                          {(sample.ready_code || sample.tracking_number) && (
                            <div className="flex flex-col gap-1 mt-2">
                              {sample.ready_code && (
                                <span className="text-xs px-2 py-1 rounded-md bg-emerald-50 text-emerald-700 font-medium">{t('sample_ready_code')} {sample.ready_code}</span>
                              )}
                              {sample.tracking_number && (
                                <span className="text-xs px-2 py-1 rounded-md bg-blue-50 text-blue-700 font-medium">{t('sample_tracking')} {sample.tracking_number}</span>
                              )}
                            </div>
                          )}
                          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                            {SAMPLE_STAGES.indexOf(stage) > 0 && (
                              <button onClick={() => moveSample(sample.id, SAMPLE_STAGES[SAMPLE_STAGES.indexOf(stage) - 1].id)} className="flex-1 text-xs py-0.5 rounded border border-stone-200 hover:bg-stone-50 text-stone-400 flex items-center justify-center gap-0.5">
                                <ChevronLeft size={10}/> {t('sample_back')}
                              </button>
                            )}
                            {SAMPLE_STAGES.indexOf(stage) < SAMPLE_STAGES.length - 1 && (
                              <button onClick={() => moveSample(sample.id, SAMPLE_STAGES[SAMPLE_STAGES.indexOf(stage) + 1].id)} className="flex-1 text-xs py-0.5 rounded border flex items-center justify-center gap-0.5 font-medium" style={{ borderColor: SAMPLE_STAGES[SAMPLE_STAGES.indexOf(stage) + 1].color, color: SAMPLE_STAGES[SAMPLE_STAGES.indexOf(stage) + 1].color }}>
                                {t('sample_next')} <ChevronRight size={10}/>
                              </button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                    <button onClick={() => openAddSample(stage.id)} className="w-full text-xs text-stone-400 hover:text-stone-600 py-2 border border-dashed border-stone-200 rounded-lg hover:border-stone-300 transition-colors">{t('sample_add_sample')}</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        /* ESTIMATES */
        <div className="flex-1 overflow-y-auto p-5">
          {estimates.length === 0 ? (
            <div className="card py-16 text-center">
              <FileSpreadsheet size={32} className="text-stone-300 mx-auto mb-3"/>
              <p className="text-stone-400 text-sm mb-3">{t('sales_no_estimates_imported')}</p>
              <button onClick={openImportModal} className="btn-primary text-sm flex items-center gap-2 mx-auto"><Upload size={14}/> {t('sales_import_first_estimate')}</button>
            </div>
          ) : (
            (() => {
              // Group by country — known countries first (in COUNTRY_OPTIONS
              // order), anything else after, "No Country Set" last.
              const groups: Record<string, any[]> = {}
              estimates.forEach((est: any) => {
                const key = est.country || 'No Country Set'
                if (!groups[key]) groups[key] = []
                groups[key].push(est)
              })
              const orderedKeys = [
                ...COUNTRY_OPTIONS.filter(c => groups[c]),
                ...Object.keys(groups).filter(k => k !== 'No Country Set' && !COUNTRY_OPTIONS.includes(k)),
                ...(groups['No Country Set'] ? ['No Country Set'] : []),
              ]
              return (
                <div className="space-y-6">
                  {orderedKeys.map(country => {
                    const group = groups[country]
                    // Only sum when every estimate in the group shares the
                    // same currency — mixing GBP/SAR/EUR into one number
                    // would be misleading otherwise.
                    const currencies = new Set(group.map((e: any) => e.currency))
                    const groupTotal = currencies.size === 1
                      ? group.reduce((s: number, e: any) => s + (e.grand_total || 0), 0)
                      : null
                    return (
                      <div key={country}>
                        <div className="flex items-center justify-between mb-2 px-1">
                          <h3 className="text-sm font-semibold text-stone-900 flex items-center gap-2">
                            {country}
                            <span className="text-xs font-normal text-stone-400">({group.length})</span>
                          </h3>
                          {groupTotal !== null && (
                            <span className="text-xs font-medium text-stone-500">{group[0].currency} {groupTotal.toLocaleString()}</span>
                          )}
                        </div>
                        <div className="space-y-2">
                          {group.map((est: any) => (
                            <button key={est.id} onClick={() => openEstimateDetail(est)}
                              className="w-full text-left card p-4 hover:shadow-sm transition-shadow flex items-center justify-between gap-3">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="font-medium text-stone-900 text-sm truncate">{est.offer_name}</p>
                                  {est.estimate_number && <span className="text-xs text-stone-400 font-mono">{est.estimate_number}</span>}
                                </div>
                                <p className="text-xs text-stone-500 mt-0.5 truncate">{est.client}{est.project_name ? ` · ${est.project_name}` : ''}</p>
                                {(est.account_manager || est.prepared_by) && (
                                  <div className="flex items-center gap-2 mt-1.5">
                                    {est.account_manager && (
                                      <div className="flex items-center gap-1">
                                        <div className="w-4 h-4 rounded-full flex items-center justify-center text-white flex-shrink-0" style={{ background: est.account_manager.color || '#7D8C74', fontSize: '8px', fontWeight: 600 }}>
                                          {est.account_manager.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0,2)}
                                        </div>
                                        <span className="text-xs text-stone-400">{est.account_manager.full_name?.split(' ')[0]}</span>
                                      </div>
                                    )}
                                    {est.prepared_by && est.prepared_by.id !== est.account_manager?.id && (
                                      <span className="text-xs text-stone-300">· prepared by {est.prepared_by.full_name?.split(' ')[0]}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                              <div className="text-right flex-shrink-0">
                                <p className="text-sm font-semibold text-stone-700">{est.currency} {Number(est.grand_total || 0).toLocaleString()}</p>
                                <p className="text-xs text-stone-400 mt-0.5">{est.offer_date ? est.offer_date : format(parseISO(est.created_at), 'd MMM yyyy')}</p>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )
            })()
          )}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowModal(false)}>
          <div className={`bg-white rounded-xl w-full p-4 sm:p-6 max-h-[90vh] overflow-y-auto overflow-x-hidden ${modalType === 'sample' ? 'max-w-2xl' : 'max-w-lg'}`} onClick={e => e.stopPropagation()}>
            {modalType === 'won' && (
              <>
                <div className="flex items-center justify-between mb-5"><h3 className="text-lg font-semibold">{editItem ? 'Edit project' : 'New won project'}</h3><button onClick={() => setShowModal(false)}><X size={18} className="text-stone-400"/></button></div>
                <div className="space-y-3">
                  <div><label className="label">Project type</label>
                    <div className="grid grid-cols-3 gap-2">
                      {(Object.entries(PROJECT_TYPES) as [ProjectType, typeof PROJECT_TYPES[ProjectType]][]).map(([type, tc]) => (
                        <button key={type} type="button" onClick={() => setWonForm({...wonForm, project_type: type})} className="min-w-0 py-2 px-1.5 rounded-lg border-2 text-xs font-medium transition-all leading-tight" style={wonForm.project_type === type ? { borderColor: tc.color, background: tc.bg, color: tc.color } : { borderColor: '#E7E5E4', color: '#78716C' }}>{t(tc.labelKey)}</button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2"><label className="label">Project name</label><input className="input" value={wonForm.name} onChange={e => setWonForm({...wonForm, name: e.target.value})}/></div>
                    <div className="min-w-0"><label className="label">Client</label><input className="input" value={wonForm.client} onChange={e => setWonForm({...wonForm, client: e.target.value})}/></div>
                    <div className="min-w-0"><label className="label">Value (£)</label><input className="input" type="number" value={wonForm.value} onChange={e => setWonForm({...wonForm, value: e.target.value})}/></div>
                    <div className="min-w-0"><label className="label">Account Manager</label><select className="input" value={wonForm.account_manager_id} onChange={e => setWonForm({...wonForm, account_manager_id: e.target.value})}><option value="">Select</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
                    <div className="min-w-0"><label className="label">Project Manager</label><select className="input" value={wonForm.pm_id} onChange={e => setWonForm({...wonForm, pm_id: e.target.value})}><option value="">Select</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
                    <div className="min-w-0"><label className="label">Supply date</label><input className="input" type="date" value={wonForm.supply_date} onChange={e => setWonForm({...wonForm, supply_date: e.target.value})}/></div>
                    <div className="min-w-0"><label className="label">Installation date</label><input className="input" type="date" value={wonForm.installation_date} onChange={e => setWonForm({...wonForm, installation_date: e.target.value})}/></div>
                    <div className="min-w-0"><label className="label">Completion date</label><input className="input" type="date" value={wonForm.completion_date} onChange={e => setWonForm({...wonForm, completion_date: e.target.value})}/></div>
                    <div className="sm:col-span-2"><label className="label">Notes</label><textarea className="input min-h-16" value={wonForm.notes} onChange={e => setWonForm({...wonForm, notes: e.target.value})}/></div>
                  </div>
                </div>
                <div className="flex gap-2 mt-5"><button onClick={saveWon} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : editItem ? 'Save changes' : 'Add project'}</button><button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button></div>
              </>
            )}
            {modalType === 'deal' && (
              <>
                <div className="flex items-center justify-between mb-5"><h3 className="text-lg font-semibold">{editItem ? 'Edit deal' : 'New deal'}</h3><button onClick={() => setShowModal(false)}><X size={18} className="text-stone-400"/></button></div>
                <div className="space-y-3">
                  <div><label className="label">Stage</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {DEAL_STAGES.map(s => (
                        <button key={s.id} type="button" onClick={() => setDealForm({...dealForm, stage: s.id})} className="text-xs py-1.5 px-2 rounded-lg border-2 font-medium transition-all text-left" style={dealForm.stage === s.id ? { borderColor: s.color, background: s.color + '15', color: s.color } : { borderColor: '#E7E5E4', color: '#78716C' }}>{t(s.labelKey)}</button>
                      ))}
                    </div>
                  </div>
                  <div><label className="label">Deal name</label><input className="input" value={dealForm.name} onChange={e => setDealForm({...dealForm, name: e.target.value})}/></div>
                  <div>
                    <label className="label">Company / Client</label>
                    <div className="relative">
                      <input
                        className="input"
                        placeholder="Type company name..."
                        value={dealContactSearch}
                        onChange={e => {
                          setDealContactSearch(e.target.value)
                          setDealContactId('')
                          const q = e.target.value.toLowerCase()
                          if (q.length < 1) { setDealContactResults([]); return }
                          const matches = allSalesContacts.filter((c: any) =>
                            (c.company || '').toLowerCase().includes(q) ||
                            (c.name || '').toLowerCase().includes(q)
                          ).slice(0, 6)
                          setDealContactResults(matches)
                        }}
                      />
                      {dealContactResults.length > 0 && (
                        <div className="absolute z-50 w-full mt-1 bg-white border border-stone-200 rounded-lg shadow-lg max-h-48 overflow-y-auto">
                          {dealContactResults.map((c: any) => (
                            <button key={c.id} type="button"
                              className="w-full text-left px-3 py-2 hover:bg-stone-50 border-b border-stone-50 last:border-0"
                              onClick={() => {
                                setDealContactId(c.id)
                                setDealContactSearch(c.company || c.name)
                                setDealContactResults([])
                              }}>
                              <p className="text-sm font-medium text-stone-900">{c.company || c.name}</p>
                              {c.company && c.name && <p className="text-xs text-stone-400">{c.name}</p>}
                            </button>
                          ))}
                        </div>
                      )}
                      {dealContactSearch && dealContactResults.length === 0 && !dealContactId && (
                        <p className="text-xs text-brand-600 mt-1">✦ New contact will be created and added to Contacts</p>
                      )}
                      {dealContactId && <p className="text-xs text-stone-400 mt-1">✓ Linked to existing contact</p>}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="label">Value (£)</label><input className="input" type="number" value={dealForm.value} onChange={e => setDealForm({...dealForm, value: e.target.value})}/></div>
                    <div><label className="label">Closing date</label><input className="input" type="date" value={dealForm.closing_date} onChange={e => setDealForm({...dealForm, closing_date: e.target.value})}/></div>
                  </div>
                  <div><label className="label">Account Manager</label><select className="input" value={dealForm.account_manager_id} onChange={e => setDealForm({...dealForm, account_manager_id: e.target.value})}><option value="">Select</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
                  <div><label className="label">Project Manager</label><select className="input" value={dealForm.project_manager_id} onChange={e => setDealForm({...dealForm, project_manager_id: e.target.value})}><option value="">Select</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
                  <div><label className="label">Notes</label><textarea className="input min-h-16" value={dealForm.notes} onChange={e => setDealForm({...dealForm, notes: e.target.value})}/></div>
                </div>
                <div className="flex gap-2 mt-5"><button onClick={saveDeal} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : editItem ? 'Save changes' : 'Add deal'}</button><button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button></div>
              </>
            )}
            {modalType === 'lead' && (
              <>
                <div className="flex items-center justify-between mb-5"><h3 className="text-lg font-semibold">{editItem ? 'Edit lead' : 'New lead'}</h3><button onClick={() => setShowModal(false)}><X size={18} className="text-stone-400"/></button></div>
                <div className="space-y-3">
                  <div><label className="label">Stage</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {LEAD_STAGES.map(s => (
                        <button key={s.id} type="button" onClick={() => setLeadForm({...leadForm, stage: s.id})} className="text-xs py-1.5 px-2 rounded-lg border-2 font-medium transition-all text-left" style={leadForm.stage === s.id ? { borderColor: s.color, background: s.color + '15', color: s.color } : { borderColor: '#E7E5E4', color: '#78716C' }}>{t(s.labelKey)}</button>
                      ))}
                    </div>
                  </div>
                  <div><label className="label">Lead name</label><input className="input" value={leadForm.name} onChange={e => setLeadForm({...leadForm, name: e.target.value})}/></div>
                  <div><label className="label">Client</label><input className="input" value={leadForm.client} onChange={e => setLeadForm({...leadForm, client: e.target.value})}/></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="label">Value (£)</label><input className="input" type="number" value={leadForm.value} onChange={e => setLeadForm({...leadForm, value: e.target.value})}/></div>
                    <div><label className="label">Closing date</label><input className="input" type="date" value={leadForm.closing_date} onChange={e => setLeadForm({...leadForm, closing_date: e.target.value})}/></div>
                  </div>
                  <div><label className="label">Account Manager</label><select className="input" value={leadForm.account_manager_id} onChange={e => setLeadForm({...leadForm, account_manager_id: e.target.value})}><option value="">Select</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>

                  <div><label className="label">Notes</label><textarea className="input min-h-16" value={leadForm.notes} onChange={e => setLeadForm({...leadForm, notes: e.target.value})}/></div>
                </div>
                <div className="flex gap-2 mt-5"><button onClick={saveLead} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : editItem ? 'Save changes' : 'Add lead'}</button><button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button></div>
              </>
            )}
            {modalType === 'sample' && (
              <>
                <div className="flex items-center justify-between mb-5"><h3 className="text-lg font-semibold">{editItem ? t('sample_edit_title') : t('sample_new_title')}</h3><button onClick={() => setShowModal(false)}><X size={18} className="text-stone-400"/></button></div>
                <div className="space-y-4">
                  <div>
                    <label className="label">{t('sample_stage')}</label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {SAMPLE_STAGES.map(s => (
                        <button key={s.id} type="button" onClick={() => setSampleForm({...sampleForm, stage: s.id})} className="text-xs py-1.5 px-2 rounded-lg border-2 font-medium transition-all text-left" style={sampleForm.stage === s.id ? { borderColor: s.color, background: s.color + '15', color: s.color } : { borderColor: '#E7E5E4', color: '#78716C' }}>{t(s.labelKey)}</button>
                      ))}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div><label className="label">{t('sample_description')}</label><input className="input" value={sampleForm.name} onChange={e => setSampleForm({...sampleForm, name: e.target.value})}/></div>
                    <div><label className="label">{t('sample_request_date')}</label><input className="input" type="date" value={sampleForm.request_date} onChange={e => setSampleForm({...sampleForm, request_date: e.target.value})}/></div>
                  </div>

                  <div className="border-t border-stone-100 pt-3">
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">{t('sample_client_details')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div><label className="label">{t('sample_client')}</label><input className="input" value={sampleForm.client} onChange={e => setSampleForm({...sampleForm, client: e.target.value})}/></div>
                      <div><label className="label">{t('sample_attention')}</label><input className="input" value={sampleForm.attention_contact} onChange={e => setSampleForm({...sampleForm, attention_contact: e.target.value})}/></div>
                      <div><label className="label">{t('sample_email')}</label><input className="input" value={sampleForm.email} onChange={e => setSampleForm({...sampleForm, email: e.target.value})}/></div>
                      <div><label className="label">{t('sample_telephone')}</label><input className="input" value={sampleForm.phone} onChange={e => setSampleForm({...sampleForm, phone: e.target.value})}/></div>
                      <div className="col-span-2"><label className="label">{t('sample_address')}</label><input className="input" value={sampleForm.address} onChange={e => setSampleForm({...sampleForm, address: e.target.value})}/></div>
                      <div><label className="label">{t('sample_requested_by')}</label><input className="input" value={sampleForm.requested_by} onChange={e => setSampleForm({...sampleForm, requested_by: e.target.value})}/></div>
                      <div><label className="label">{t('sample_account_manager')}</label><select className="input" value={sampleForm.account_manager_id} onChange={e => setSampleForm({...sampleForm, account_manager_id: e.target.value})}><option value="">{t('sample_select')}</option>{users.map(u => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
                    </div>
                  </div>

                  <div className="border-t border-stone-100 pt-3">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">{t('sample_stones_requested')}</p>
                      <button onClick={addSampleLineItem} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Plus size={12}/> {t('sample_add_line')}</button>
                    </div>
                    <div className="space-y-2">
                      {sampleLineItems.map((li, idx) => (
                        <div key={idx} className="grid grid-cols-2 sm:flex sm:items-center gap-1.5 bg-stone-50 rounded-lg p-2">
                          <input className="input text-xs col-span-2 sm:flex-1" placeholder={t('sample_stone_type')} value={li.stone_type} onChange={e => updateSampleLineItem(idx, 'stone_type', e.target.value)}/>
                          <input className="input text-xs sm:w-24" placeholder={t('sample_dimensions')} value={li.dimensions} onChange={e => updateSampleLineItem(idx, 'dimensions', e.target.value)}/>
                          <input className="input text-xs sm:w-24" placeholder={t('sample_finish')} value={li.surface_finish} onChange={e => updateSampleLineItem(idx, 'surface_finish', e.target.value)}/>
                          <input type="number" className="input text-xs sm:w-14" placeholder={t('sample_qty')} value={li.quantity} onChange={e => updateSampleLineItem(idx, 'quantity', Number(e.target.value) || 0)}/>
                          <div className="flex items-center gap-1.5">
                            <select className="input text-xs flex-1 sm:w-16" value={li.unit} onChange={e => updateSampleLineItem(idx, 'unit', e.target.value)}>
                              <option value="pc">pc</option>
                              <option value="box">box</option>
                              <option value="set">set</option>
                            </select>
                            <button onClick={() => removeSampleLineItem(idx)} className="p-1 text-stone-300 hover:text-red-500 flex-shrink-0"><Trash2 size={13}/></button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-stone-100 pt-3">
                    <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">{t('sample_delivery_tracking')}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="label">{t('sample_ready_code_label')}</label>
                        <input className="input" placeholder={t('sample_ready_code_placeholder')} value={sampleForm.ready_code} onChange={e => setSampleForm({...sampleForm, ready_code: e.target.value})}/>
                      </div>
                      <div>
                        <label className="label">{t('sample_tracking_number')}</label>
                        <input className="input" placeholder={t('sample_tracking_placeholder')} value={sampleForm.tracking_number} onChange={e => setSampleForm({...sampleForm, tracking_number: e.target.value})}/>
                      </div>
                      <div>
                        <label className="label">{t('sample_delivering_to')}</label>
                        <select className="input" value={sampleForm.delivery_destination} onChange={e => setSampleForm({...sampleForm, delivery_destination: e.target.value as 'office' | 'client'})}>
                          <option value="office">{t('sample_our_office')}</option>
                          <option value="client">{t('sample_direct_to_client')}</option>
                        </select>
                      </div>
                      <div><label className="label">{t('sample_expected_date')}</label><input className="input" type="date" value={sampleForm.expected_date} onChange={e => setSampleForm({...sampleForm, expected_date: e.target.value})}/></div>
                    </div>
                  </div>

                  <div><label className="label">{t('sample_notes')}</label><textarea className="input min-h-16" value={sampleForm.notes} onChange={e => setSampleForm({...sampleForm, notes: e.target.value})}/></div>
                </div>
                <div className="flex gap-2 mt-5"><button onClick={saveSample} disabled={saving} className="btn-primary flex-1">{saving ? t('sample_saving') : editItem ? t('sample_save_changes') : t('sample_add_sample_btn')}</button><button onClick={() => setShowModal(false)} className="btn-secondary">{t('action_cancel')}</button></div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Import Estimate Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowImportModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto overflow-x-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">Import Estimate</h3>
              <button onClick={() => setShowImportModal(false)}><X size={18} className="text-stone-400"/></button>
            </div>

            {importStep === 'upload' && (
              <div
                onClick={() => document.getElementById('estimate-file-input')?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) parseEstimateFile(f) }}
                className="border-2 border-dashed border-stone-200 rounded-xl p-12 text-center cursor-pointer hover:border-stone-300 hover:bg-stone-50 transition-all">
                <FileSpreadsheet size={32} className="text-stone-300 mx-auto mb-3"/>
                <p className="text-sm font-medium text-stone-700 mb-1">Drop your quote Excel file here</p>
                <p className="text-xs text-stone-400">or click to browse</p>
                <input id="estimate-file-input" type="file" accept=".xlsx,.xls" className="hidden"
                  onChange={e => { const f = e.target.files?.[0]; if (f) parseEstimateFile(f); e.target.value = '' }}/>
              </div>
            )}

            {importStep === 'preview' && importParsed && (
              <div className="space-y-4">
                <p className="text-xs text-stone-500 bg-stone-50 rounded-lg p-3">
                  Extracted from <span className="font-medium">{importFile?.name}</span> — check these over before saving, since parsing can miss fields if your template varies.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="label">Offer Name</label><input className="input" value={importParsed.offer_name} onChange={e => setImportParsed({ ...importParsed, offer_name: e.target.value })}/></div>
                  <div><label className="label">Client</label><input className="input" value={importParsed.client} onChange={e => setImportParsed({ ...importParsed, client: e.target.value })}/></div>
                  <div><label className="label">Project</label><input className="input" value={importParsed.project_name} onChange={e => setImportParsed({ ...importParsed, project_name: e.target.value })}/></div>
                  <div><label className="label">Estimate Number</label><input className="input" value={importParsed.estimate_number} onChange={e => setImportParsed({ ...importParsed, estimate_number: e.target.value })}/></div>
                  <div><label className="label">Date</label><input className="input" value={importParsed.offer_date} onChange={e => setImportParsed({ ...importParsed, offer_date: e.target.value })}/></div>
                  <div><label className="label">Currency</label><input className="input" value={importParsed.currency} onChange={e => setImportParsed({ ...importParsed, currency: e.target.value })}/></div>
                  <div><label className="label">Country</label>
                    <select className="input" value={importParsed.country} onChange={e => setImportParsed({ ...importParsed, country: e.target.value })}>
                      <option value="">Not set</option>
                      {COUNTRY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Subtotal (Material)</label><input className="input" type="number" value={importParsed.subtotal_material} onChange={e => { const v = parseFloat(e.target.value) || 0; setImportParsed({ ...importParsed, subtotal_material: v, grand_total: calcGrandTotal(v, importParsed.shipping_handling, importParsed.subtotal_installation, importParsed.discount_percent) }) }}/></div>
                  <div><label className="label">Shipping & Handling</label><input className="input" type="number" value={importParsed.shipping_handling} onChange={e => { const v = parseFloat(e.target.value) || 0; setImportParsed({ ...importParsed, shipping_handling: v, grand_total: calcGrandTotal(importParsed.subtotal_material, v, importParsed.subtotal_installation, importParsed.discount_percent) }) }}/></div>
                  <div><label className="label">Subtotal (Installation)</label><input className="input" type="number" value={importParsed.subtotal_installation} onChange={e => { const v = parseFloat(e.target.value) || 0; setImportParsed({ ...importParsed, subtotal_installation: v, grand_total: calcGrandTotal(importParsed.subtotal_material, importParsed.shipping_handling, v, importParsed.discount_percent) }) }}/></div>
                  <div><label className="label">Grand Total</label><input className="input" type="number" value={importParsed.grand_total} onChange={e => setImportParsed({ ...importParsed, grand_total: parseFloat(e.target.value) || 0 })}/></div>
                  <div><label className="label">Discount %</label><input className="input" type="number" value={importParsed.discount_percent} onChange={e => { const v = parseFloat(e.target.value) || 0; setImportParsed({ ...importParsed, discount_percent: v, grand_total: calcGrandTotal(importParsed.subtotal_material, importParsed.shipping_handling, importParsed.subtotal_installation, v) }) }}/></div>
                  <div className="col-span-2"><label className="label">Payment Terms</label><textarea className="input min-h-14" value={importParsed.payment_terms} onChange={e => setImportParsed({ ...importParsed, payment_terms: e.target.value })}/></div>
                  <div className="col-span-2"><label className="label">Delivery Terms</label><textarea className="input min-h-14" value={importParsed.delivery_terms} onChange={e => setImportParsed({ ...importParsed, delivery_terms: e.target.value })}/></div>
                  <div><label className="label">Account Manager</label><select className="input" value={importParsed.account_manager_id || ''} onChange={e => setImportParsed({ ...importParsed, account_manager_id: e.target.value })}><option value="">Select...</option>{users.map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
                  <div><label className="label">Prepared By</label><select className="input" value={importParsed.prepared_by_id || ''} onChange={e => setImportParsed({ ...importParsed, prepared_by_id: e.target.value })}><option value="">Select...</option>{users.map((u: any) => <option key={u.id} value={u.id}>{u.full_name}</option>)}</select></div>
                </div>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Line items ({importParsed.line_items?.length || 0} found)</label>
                    <button onClick={addImportLineItem} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Plus size={12}/> Add line item</button>
                  </div>
                  <div className="border border-stone-200 rounded-lg overflow-hidden max-h-64 overflow-y-auto">
                    {(!importParsed.line_items || importParsed.line_items.length === 0) && (
                      <p className="text-xs text-stone-400 text-center py-4">No line items detected — you can still save the header info and download the original file later.</p>
                    )}
                    {importParsed.line_items?.map((li: any, i: number) => (
                      <div key={i} className="grid grid-cols-12 gap-1.5 px-2 py-2 border-b border-stone-100 last:border-0 items-center">
                        <input className="input text-xs col-span-3" placeholder="Product" value={li.product} onChange={e => updateImportLineItem(i, 'product', e.target.value)}/>
                        <input className="input text-xs col-span-2" placeholder="Category" value={li.category} onChange={e => updateImportLineItem(i, 'category', e.target.value)}/>
                        <input className="input text-xs col-span-1" placeholder="Finish" value={li.finish || ''} onChange={e => updateImportLineItem(i, 'finish', e.target.value)}/>
                        <input className="input text-xs col-span-1" type="number" placeholder="Qty" value={li.quantity} onChange={e => updateImportLineItem(i, 'quantity', parseFloat(e.target.value) || 0)}/>
                        <input className="input text-xs col-span-1" placeholder="Unit" value={li.unit} onChange={e => updateImportLineItem(i, 'unit', e.target.value)}/>
                        <input className="input text-xs col-span-2" type="number" placeholder="Unit Price" value={li.unit_price} onChange={e => updateImportLineItem(i, 'unit_price', parseFloat(e.target.value) || 0)}/>
                        <input className="input text-xs col-span-1" type="number" placeholder="Net Total" value={li.net_total} onChange={e => updateImportLineItem(i, 'net_total', parseFloat(e.target.value) || 0)}/>
                        <button onClick={() => removeImportLineItem(i)} className="col-span-1 text-red-400 hover:text-red-600 flex justify-center"><Trash2 size={13}/></button>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveEstimate} disabled={importing} className="btn-primary flex-1">{importing ? 'Saving...' : 'Save Estimate'}</button>
                  <button onClick={() => setImportStep('upload')} className="btn-secondary">← Re-upload</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Estimate Detail Modal */}
      {selectedEstimate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => { setSelectedEstimate(null); setEditingEstimate(false) }}>
          <div className="bg-white rounded-xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto overflow-x-hidden" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <div>
                <h3 className="text-lg font-semibold">{editingEstimate ? 'Edit Estimate' : selectedEstimate.offer_name}</h3>
                {selectedEstimate.estimate_number && <p className="text-xs text-stone-400 font-mono">{selectedEstimate.estimate_number}</p>}
              </div>
              <div className="flex items-center gap-2">
                {!editingEstimate && (
                  <button onClick={startEditEstimate} className="btn-secondary text-sm flex items-center gap-1.5"><Edit size={13}/> Edit</button>
                )}
                <button onClick={() => { setSelectedEstimate(null); setEditingEstimate(false) }}><X size={18} className="text-stone-400"/></button>
              </div>
            </div>

            {editingEstimate ? (
              /* ── EDIT MODE ── */
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="col-span-2"><label className="label">Offer Name</label><input className="input" value={editForm.offer_name} onChange={e => setEditForm({ ...editForm, offer_name: e.target.value })}/></div>
                  <div><label className="label">Client</label><input className="input" value={editForm.client} onChange={e => setEditForm({ ...editForm, client: e.target.value })}/></div>
                  <div><label className="label">Project</label><input className="input" value={editForm.project_name} onChange={e => setEditForm({ ...editForm, project_name: e.target.value })}/></div>
                  <div><label className="label">Estimate Number</label><input className="input" value={editForm.estimate_number} onChange={e => setEditForm({ ...editForm, estimate_number: e.target.value })}/></div>
                  <div><label className="label">Date</label><input className="input" value={editForm.offer_date} onChange={e => setEditForm({ ...editForm, offer_date: e.target.value })}/></div>
                  <div><label className="label">Currency</label><input className="input" value={editForm.currency} onChange={e => setEditForm({ ...editForm, currency: e.target.value })}/></div>
                  <div><label className="label">Country</label>
                    <select className="input" value={editForm.country} onChange={e => setEditForm({ ...editForm, country: e.target.value })}>
                      <option value="">Not set</option>
                      {COUNTRY_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Status</label>
                    <select className="input" value={editForm.status} onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
                      <option value="draft">Draft</option><option value="sent">Sent</option><option value="approved">Approved</option><option value="rejected">Rejected</option><option value="on_hold">On Hold</option>
                    </select>
                  </div>
                  <div><label className="label">Subtotal (Material)</label><input className="input" type="number" value={editForm.subtotal_material} onChange={e => { const v = parseFloat(e.target.value) || 0; setEditForm({ ...editForm, subtotal_material: v, grand_total: calcGrandTotal(v, editForm.shipping_handling, editForm.subtotal_installation, editForm.discount_percent) }) }}/></div>
                  <div><label className="label">Shipping & Handling</label><input className="input" type="number" value={editForm.shipping_handling} onChange={e => { const v = parseFloat(e.target.value) || 0; setEditForm({ ...editForm, shipping_handling: v, grand_total: calcGrandTotal(editForm.subtotal_material, v, editForm.subtotal_installation, editForm.discount_percent) }) }}/></div>
                  <div><label className="label">Subtotal (Installation)</label><input className="input" type="number" value={editForm.subtotal_installation} onChange={e => { const v = parseFloat(e.target.value) || 0; setEditForm({ ...editForm, subtotal_installation: v, grand_total: calcGrandTotal(editForm.subtotal_material, editForm.shipping_handling, v, editForm.discount_percent) }) }}/></div>
                  <div><label className="label">Grand Total</label><input className="input" type="number" value={editForm.grand_total} onChange={e => setEditForm({ ...editForm, grand_total: parseFloat(e.target.value) || 0 })}/></div>
                  <div><label className="label">Discount %</label><input className="input" type="number" value={editForm.discount_percent} onChange={e => { const v = parseFloat(e.target.value) || 0; setEditForm({ ...editForm, discount_percent: v, grand_total: calcGrandTotal(editForm.subtotal_material, editForm.shipping_handling, editForm.subtotal_installation, v) }) }}/></div>
                  <div className="col-span-2"><label className="label">Payment Terms</label><textarea className="input min-h-14" value={editForm.payment_terms} onChange={e => setEditForm({ ...editForm, payment_terms: e.target.value })}/></div>
                  <div className="col-span-2"><label className="label">Delivery Terms</label><textarea className="input min-h-14" value={editForm.delivery_terms} onChange={e => setEditForm({ ...editForm, delivery_terms: e.target.value })}/></div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="label mb-0">Line Items ({editItems.length})</label>
                    <button onClick={addEditItem} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Plus size={12}/> Add line item</button>
                  </div>
                  <div className="border border-stone-200 rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                    {editItems.length === 0 && <p className="text-xs text-stone-400 text-center py-6">No line items — click "Add line item" above</p>}
                    {editItems.map((li, idx) => (
                      <div key={idx} className="grid grid-cols-12 gap-1.5 px-2 py-2 border-b border-stone-100 last:border-0 items-center">
                        <input className="input text-xs col-span-3" placeholder="Product" value={li.product} onChange={e => updateEditItem(idx, 'product', e.target.value)}/>
                        <input className="input text-xs col-span-2" placeholder="Category" value={li.category} onChange={e => updateEditItem(idx, 'category', e.target.value)}/>
                        <input className="input text-xs col-span-1" placeholder="Finish" value={li.finish || ''} onChange={e => updateEditItem(idx, 'finish', e.target.value)}/>
                        <input className="input text-xs col-span-1" type="number" placeholder="Qty" value={li.quantity} onChange={e => updateEditItem(idx, 'quantity', parseFloat(e.target.value) || 0)}/>
                        <input className="input text-xs col-span-1" placeholder="Unit" value={li.unit} onChange={e => updateEditItem(idx, 'unit', e.target.value)}/>
                        <input className="input text-xs col-span-2" type="number" placeholder="Unit Price" value={li.unit_price} onChange={e => updateEditItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}/>
                        <input className="input text-xs col-span-1" type="number" placeholder="Net Total" value={li.net_total} onChange={e => updateEditItem(idx, 'net_total', parseFloat(e.target.value) || 0)}/>
                        <button onClick={() => removeEditItem(idx)} className="col-span-1 text-red-400 hover:text-red-600 flex justify-center"><Trash2 size={13}/></button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex gap-2">
                  <button onClick={saveEstimateEdits} disabled={savingEdit} className="btn-primary flex-1">{savingEdit ? 'Saving...' : 'Save changes'}</button>
                  <button onClick={cancelEditEstimate} className="btn-secondary">Cancel</button>
                </div>
              </div>
            ) : (
              /* ── VIEW MODE ── */
              <>
                <div className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm mb-3 bg-stone-50 rounded-lg p-4">
                  <div><span className="text-stone-400">Client:</span> <span className="text-stone-800">{selectedEstimate.client || '—'}</span></div>
                  <div><span className="text-stone-400">Project:</span> <span className="text-stone-800">{selectedEstimate.project_name || '—'}</span></div>
                  <div><span className="text-stone-400">Date:</span> <span className="text-stone-800">{selectedEstimate.offer_date || '—'}</span></div>
                  <div><span className="text-stone-400">Currency:</span> <span className="text-stone-800">{selectedEstimate.currency}</span></div>
                  <div><span className="text-stone-400">Country:</span> <span className="text-stone-800">{selectedEstimate.country || '—'}</span></div>
                  <div><span className="text-stone-400">Account Manager:</span> <span className="text-stone-800">{selectedEstimate.account_manager?.full_name || '—'}</span></div>
                  <div><span className="text-stone-400">Prepared By:</span> <span className="text-stone-800">{selectedEstimate.prepared_by?.full_name || '—'}</span></div>
                  {selectedEstimate.discount_percent > 0 && (
                    <div><span className="text-stone-400">Discount:</span> <span className="text-red-500 font-medium">{selectedEstimate.discount_percent}%</span></div>
                  )}
                </div>

                {(selectedEstimate.payment_terms || selectedEstimate.delivery_terms) && (
                  <div className="grid grid-cols-1 gap-2 text-xs mb-3 border border-stone-100 rounded-lg p-3">
                    {selectedEstimate.payment_terms && (
                      <div><span className="text-stone-400 font-medium">Payment Terms:</span> <span className="text-stone-600">{selectedEstimate.payment_terms}</span></div>
                    )}
                    {selectedEstimate.delivery_terms && (
                      <div><span className="text-stone-400 font-medium">Delivery Terms:</span> <span className="text-stone-600">{selectedEstimate.delivery_terms}</span></div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 mb-5">
                  {selectedEstimate.linked_contact && (
                    <span className="badge text-xs" style={{ color: '#0D9488', background: '#F0FDFA' }}>
                      Linked to Sales Contact: {selectedEstimate.linked_contact.name}
                    </span>
                  )}
                  {selectedEstimate.linked_deal && (
                    <span className="badge text-xs" style={{ color: '#3B82F6', background: '#EFF6FF' }}>
                      In Quotes Pipeline: {selectedEstimate.linked_deal.name}
                    </span>
                  )}
                </div>

                <div className="card overflow-hidden mb-4">
                  {/* Mobile: stacked cards, every field readable without horizontal scroll */}
                  <div className="md:hidden divide-y divide-stone-100">
                    {estimateLineItems.map(li => (
                      <div key={li.id} className="p-3">
                        <div className="flex items-start justify-between gap-2 mb-1.5">
                          <p className="text-sm font-semibold text-stone-900">{li.product}</p>
                          <span className="badge text-xs flex-shrink-0" style={li.category === 'Installation' ? { color: '#0D9488', background: '#F0FDFA' } : { color: '#8C7F58', background: '#F5F3EE' }}>
                            {li.category || 'Material'}
                          </span>
                        </div>
                        {li.description && <p className="text-xs text-stone-500 mb-2">{li.description}</p>}
                        <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                          <div><span className="text-stone-400">Finish:</span> <span className="text-stone-700">{li.finish || '—'}</span></div>
                          <div><span className="text-stone-400">Unit:</span> <span className="text-stone-700">{li.unit}</span></div>
                          <div><span className="text-stone-400">Qty:</span> <span className="text-stone-700">{li.quantity}</span></div>
                          <div><span className="text-stone-400">Unit Price:</span> <span className="text-stone-700">{Number(li.unit_price || 0).toLocaleString()}</span></div>
                        </div>
                        <div className="flex justify-between items-center mt-2 pt-2 border-t border-stone-50">
                          <span className="text-xs text-stone-400">Net Total</span>
                          <span className="text-sm font-semibold text-stone-900">{Number(li.net_total || 0).toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                    {estimateLineItems.length === 0 && (
                      <p className="px-3 py-6 text-center text-sm text-stone-400">No line items on file</p>
                    )}
                  </div>

                  {/* Desktop: full table */}
                  <table className="w-full hidden md:table">
                    <thead><tr className="bg-stone-50 border-b border-stone-100">
                      <th className="text-left px-3 py-2 text-xs font-semibold text-stone-400 uppercase">Product</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-stone-400 uppercase">Description</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-stone-400 uppercase">Category</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-stone-400 uppercase">Finish</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-stone-400 uppercase">Qty</th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-stone-400 uppercase">Unit</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-stone-400 uppercase">Unit Price</th>
                      <th className="text-right px-3 py-2 text-xs font-semibold text-stone-400 uppercase">Net Total</th>
                    </tr></thead>
                    <tbody className="divide-y divide-stone-50">
                      {estimateLineItems.map(li => (
                        <tr key={li.id}>
                          <td className="px-3 py-2 text-sm text-stone-900">{li.product}</td>
                          <td className="px-3 py-2 text-xs text-stone-500">{li.description}</td>
                          <td className="px-3 py-2">
                            <span className="badge text-xs" style={li.category === 'Installation' ? { color: '#0D9488', background: '#F0FDFA' } : { color: '#8C7F58', background: '#F5F3EE' }}>
                              {li.category || 'Material'}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-xs text-stone-500">{li.finish || '—'}</td>
                          <td className="px-3 py-2 text-sm text-stone-700 text-right">{li.quantity}</td>
                          <td className="px-3 py-2 text-xs text-stone-500">{li.unit}</td>
                          <td className="px-3 py-2 text-sm text-stone-700 text-right">{Number(li.unit_price || 0).toLocaleString()}</td>
                          <td className="px-3 py-2 text-sm font-medium text-stone-900 text-right">{Number(li.net_total || 0).toLocaleString()}</td>
                        </tr>
                      ))}
                      {estimateLineItems.length === 0 && (
                        <tr><td colSpan={8} className="px-3 py-6 text-center text-sm text-stone-400">No line items on file</td></tr>
                      )}
                    </tbody>
                  </table>
                  <div className="px-3 py-3 border-t border-stone-100 bg-stone-50 space-y-1">
                    <div className="flex justify-between text-xs text-stone-500">
                      <span>Subtotal (Material)</span>
                      <span>{selectedEstimate.currency} {Number(selectedEstimate.subtotal_material || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between text-sm font-semibold text-stone-900 pt-1 border-t border-stone-200">
                      <span>Grand Total <span className="text-xs font-normal text-stone-400">(incl. shipping & installation)</span></span>
                      <span>{selectedEstimate.currency} {Number(selectedEstimate.grand_total || 0).toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                {/* Payments */}
                <div className="card overflow-hidden mb-4">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 bg-stone-50">
                    <h4 className="text-sm font-semibold text-stone-900">Payments</h4>
                    {payments.length === 0 && (
                      <div className="flex gap-1.5">
                        {PAYMENT_PRESETS.map(p => (
                          <button key={p.name} onClick={() => applyPaymentPreset(p.stages)} className="text-xs px-2 py-1 rounded border border-stone-200 hover:bg-stone-100 text-stone-500">{p.name}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="divide-y divide-stone-50">
                    {payments.length === 0 && (
                      <p className="px-4 py-6 text-xs text-stone-400 text-center">No payment stages yet — pick a preset above, or add one manually below</p>
                    )}
                    {payments.map(p => (
                      <div key={p.id} className="flex items-center gap-3 px-4 py-3">
                        <button onClick={() => markPaymentPaid(p.id, p.status)}
                          className="flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors"
                          style={p.status === 'paid' ? { background: '#7D8C74', borderColor: '#7D8C74' } : { borderColor: '#D6D3D1' }}
                          title={p.status === 'paid' ? 'Mark as pending' : 'Mark as paid'}>
                          {p.status === 'paid' && <Check size={12} className="text-white"/>}
                        </button>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium ${p.status === 'paid' ? 'text-stone-400 line-through' : 'text-stone-900'}`}>
                            {p.label}{p.percentage ? ` (${p.percentage}%)` : ''}
                          </p>
                          <p className="text-xs text-stone-400">
                            {selectedEstimate.currency} {Number(p.amount || 0).toLocaleString()}
                            {p.paid_date ? ` · Paid ${p.paid_date}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {p.invoice_file_url ? (
                            <button onClick={() => downloadPaymentInvoice(p)} className="text-xs text-brand-600 hover:underline flex items-center gap-1">
                              <FileSpreadsheet size={12}/> Invoice
                            </button>
                          ) : (
                            <label className="text-xs text-stone-400 hover:text-stone-600 cursor-pointer flex items-center gap-1">
                              <Upload size={12}/> Upload invoice
                              <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                                onChange={e => { const f = e.target.files?.[0]; if (f) uploadPaymentInvoice(p.id, f); e.target.value = '' }}/>
                            </label>
                          )}
                          <button onClick={() => deletePaymentStage(p.id)} className="text-red-400 hover:text-red-600"><Trash2 size={12}/></button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="px-4 py-2.5 border-t border-stone-100">
                    {showAddPayment ? (
                      <div className="space-y-2">
                        <input className="input text-sm" placeholder="Label e.g. Advance Payment" value={paymentForm.label} onChange={e => setPaymentForm({ ...paymentForm, label: e.target.value })}/>
                        <div className="grid grid-cols-2 gap-2">
                          <input className="input text-sm" type="number" placeholder="Percentage %" value={paymentForm.percentage} onChange={e => setPaymentForm({ ...paymentForm, percentage: e.target.value })}/>
                          <input className="input text-sm" type="number" placeholder="Or fixed amount" value={paymentForm.amount} onChange={e => setPaymentForm({ ...paymentForm, amount: e.target.value })}/>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={savePaymentStage} className="btn-primary text-sm flex-1">Add Stage</button>
                          <button onClick={() => setShowAddPayment(false)} className="btn-secondary text-sm">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={openAddPayment} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Plus size={12}/> Add payment stage</button>
                    )}
                  </div>
                </div>

                {/* PDF documents */}
                <div className="card overflow-hidden mb-4">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 bg-stone-50">
                    <h4 className="text-sm font-semibold text-stone-900">PDF</h4>
                    <label className="text-xs text-brand-600 hover:underline flex items-center gap-1 cursor-pointer">
                      <Upload size={12}/> {uploadingAttachment ? 'Uploading...' : 'Upload PDF'}
                      <input type="file" accept=".pdf" multiple className="hidden" disabled={uploadingAttachment}
                        onChange={e => { uploadAttachments(e.target.files, 'pdf'); e.target.value = '' }}/>
                    </label>
                  </div>
                  <div className="divide-y divide-stone-50">
                    {attachments.filter(a => a.file_type === 'pdf').length === 0 && (
                      <p className="px-4 py-4 text-xs text-stone-400 text-center">No PDF uploaded yet</p>
                    )}
                    {attachments.filter(a => a.file_type === 'pdf').map(a => (
                      <div key={a.id} className="flex items-center gap-3 px-4 py-2.5">
                        <FileSpreadsheet size={14} className="text-stone-400 flex-shrink-0"/>
                        <button onClick={() => viewAttachment(a)} className="text-sm text-stone-700 hover:text-brand-600 hover:underline truncate flex-1 text-left">{a.file_name}</button>
                        <button onClick={() => deleteAttachment(a)} className="text-red-400 hover:text-red-600 flex-shrink-0"><Trash2 size={12}/></button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Material / slab images */}
                <div className="card overflow-hidden mb-4">
                  <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 bg-stone-50">
                    <h4 className="text-sm font-semibold text-stone-900">Material Images</h4>
                    <label className="text-xs text-brand-600 hover:underline flex items-center gap-1 cursor-pointer">
                      <Upload size={12}/> {uploadingAttachment ? 'Uploading...' : 'Upload images'}
                      <input type="file" accept="image/*" multiple className="hidden" disabled={uploadingAttachment}
                        onChange={e => { uploadAttachments(e.target.files, 'image'); e.target.value = '' }}/>
                    </label>
                  </div>
                  {attachments.filter(a => a.file_type === 'image').length === 0 ? (
                    <p className="px-4 py-6 text-xs text-stone-400 text-center">No material photos yet — upload slab/finish images to keep them with this estimate</p>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 p-3">
                      {attachments.filter(a => a.file_type === 'image').map(a => (
                        <div key={a.id} className="relative group aspect-square rounded-lg overflow-hidden border border-stone-200 bg-stone-50">
                          <img src={a.signedUrl} alt={a.file_name} className="w-full h-full object-cover cursor-pointer" onClick={() => setLightboxImage(a.signedUrl)}/>
                          <button onClick={() => deleteAttachment(a)}
                            className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <X size={11}/>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button onClick={() => exportEstimateXLSX(selectedEstimate, estimateLineItems)} className="btn-secondary text-sm flex items-center gap-1.5"><Download size={13}/> Export XLSX</button>
                  {selectedEstimate.source_file_url && (
                    <button onClick={() => downloadEstimateFile(selectedEstimate)} className="btn-secondary text-sm flex items-center gap-1.5"><FileSpreadsheet size={13}/> Original File</button>
                  )}
                  <button onClick={() => deleteEstimate(selectedEstimate.id)} className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1.5 ml-auto px-3"><Trash2 size={13}/> Delete</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Image lightbox */}
      {lightboxImage && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setLightboxImage(null)}>
          <img src={lightboxImage} alt="Material" className="max-w-full max-h-full rounded-lg object-contain"/>
          <button onClick={() => setLightboxImage(null)} className="absolute top-4 right-4 text-white/80 hover:text-white"><X size={24}/></button>
        </div>
      )}

      {/* Loss Reason Modal — required whenever a deal or lead is moved to Closed Lost */}
      {showLossReasonModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowLossReasonModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-900 mb-1">Why was this lost?</h3>
            <p className="text-xs text-stone-400 mb-4">This helps spot patterns in what's actually costing deals — takes a few seconds.</p>
            <div className="space-y-3">
              <div>
                <label className="label">Reason</label>
                <select className="input" value={lossReasonForm.category} onChange={e => setLossReasonForm({ ...lossReasonForm, category: e.target.value })}>
                  <option value="Price">Price</option>
                  <option value="Timeline">Timeline</option>
                  <option value="Went with a competitor">Went with a competitor</option>
                  <option value="Project cancelled">Project cancelled</option>
                  <option value="No response / went quiet">No response / went quiet</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div>
                <label className="label">Details (optional)</label>
                <textarea className="input min-h-20" value={lossReasonForm.description} onChange={e => setLossReasonForm({ ...lossReasonForm, description: e.target.value })} placeholder="Any extra context..."/>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-5">
              <button onClick={() => setShowLossReasonModal(false)} className="btn-secondary text-sm py-1.5">Cancel</button>
              <button onClick={confirmLossReason} className="btn-primary text-sm py-1.5 flex-1">Mark Closed Lost</button>
            </div>
          </div>
        </div>
      )}

      {/* Create Quote Manually — no Excel needed */}
      {showManualQuoteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-xl w-full max-w-3xl max-h-[90vh] flex flex-col">
            <div className="p-5 border-b border-stone-100 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-stone-900">Create Quote</h3>
              <button onClick={() => setShowManualQuoteModal(false)}><X size={18} className="text-stone-400"/></button>
            </div>

            <div className="overflow-y-auto flex-1 p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="label">Quote Name</label>
                  <input className="input" value={manualQuoteForm.offer_name} onChange={e => setManualQuoteForm({ ...manualQuoteForm, offer_name: e.target.value })} placeholder="e.g. 64 Mount Pleasant Road"/>
                </div>
                <div>
                  <label className="label">Client</label>
                  <input className="input" value={manualQuoteForm.client} onChange={e => setManualQuoteForm({ ...manualQuoteForm, client: e.target.value })}/>
                </div>
                <div>
                  <label className="label">Country</label>
                  <input className="input" value={manualQuoteForm.country} onChange={e => setManualQuoteForm({ ...manualQuoteForm, country: e.target.value })}/>
                </div>
                <div>
                  <label className="label">Currency</label>
                  <input className="input" value={manualQuoteForm.currency} onChange={e => setManualQuoteForm({ ...manualQuoteForm, currency: e.target.value })}/>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Line Items</label>
                  <button onClick={addManualLineItem} className="text-xs text-brand-600 hover:underline flex items-center gap-1"><Plus size={12}/> Add line</button>
                </div>
                <div className="space-y-2">
                  {manualLineItems.map((li, idx) => (
                    <div key={idx} className="grid grid-cols-2 sm:flex sm:items-center gap-2 bg-stone-50 rounded-lg p-2">
                      <input
                        list="pricing-materials"
                        className="input text-sm col-span-2 sm:flex-1"
                        placeholder="Material (pick from stock or type your own)"
                        value={li.material_name}
                        onChange={e => updateManualLineItem(idx, 'material_name', e.target.value)}
                      />
                      <input className="input text-sm sm:w-28" placeholder="Finish" value={li.finish} onChange={e => updateManualLineItem(idx, 'finish', e.target.value)}/>
                      <select className="input text-sm sm:w-24" value={li.unit} onChange={e => updateManualLineItem(idx, 'unit', e.target.value)}>
                        <option value="m2">m²</option>
                        <option value="lm">lm</option>
                        <option value="unit">Unit</option>
                        <option value="pcs">Pcs</option>
                      </select>
                      <input type="number" className="input text-sm sm:w-20" placeholder="Qty" value={li.quantity} onChange={e => updateManualLineItem(idx, 'quantity', Number(e.target.value) || 0)}/>
                      <input type="number" className="input text-sm sm:w-24" placeholder="Price" value={li.unit_price} onChange={e => updateManualLineItem(idx, 'unit_price', Number(e.target.value) || 0)}/>
                      <span className="text-sm text-stone-600 col-span-2 sm:w-24 text-right flex-shrink-0">{manualQuoteForm.currency} {manualLineTotal(li).toLocaleString()}</span>
                      <button onClick={() => removeManualLineItem(idx)} className="p-1 text-stone-300 hover:text-red-500 flex-shrink-0 col-span-2 sm:col-auto justify-self-end sm:justify-self-auto"><Trash2 size={14}/></button>
                    </div>
                  ))}
                </div>
                <datalist id="pricing-materials">
                  {pricingOptions.map(p => <option key={p.id} value={p.material_name}/>)}
                </datalist>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="label">Shipping & Handling</label>
                  <input type="number" className="input" value={manualQuoteForm.shipping_handling} onChange={e => setManualQuoteForm({ ...manualQuoteForm, shipping_handling: Number(e.target.value) || 0 })}/>
                </div>
                <div>
                  <label className="label">Installation</label>
                  <input type="number" className="input" value={manualQuoteForm.subtotal_installation} onChange={e => setManualQuoteForm({ ...manualQuoteForm, subtotal_installation: Number(e.target.value) || 0 })}/>
                </div>
                <div>
                  <label className="label">Discount %</label>
                  <input type="number" className="input" value={manualQuoteForm.discount_percent} onChange={e => setManualQuoteForm({ ...manualQuoteForm, discount_percent: Number(e.target.value) || 0 })}/>
                </div>
              </div>

              <div className="flex items-center justify-between px-4 py-3 bg-stone-900 rounded-lg text-white">
                <span className="text-sm">Material: {manualQuoteForm.currency} {manualSubtotalMaterial.toLocaleString()}</span>
                <span className="font-semibold">Grand Total: {manualQuoteForm.currency} {manualGrandTotal.toLocaleString()}</span>
              </div>
            </div>

            <div className="p-5 border-t border-stone-100 flex gap-2">
              <button onClick={saveManualQuote} className="btn-primary flex-1">Create Quote</button>
              <button onClick={() => setShowManualQuoteModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

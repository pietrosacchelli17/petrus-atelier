'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { Plus, X, Edit, Trash2, Package, MapPin, Search, Image as ImageIcon, Link2, CheckCircle2, Scissors, Upload, FileSpreadsheet, ChevronDown } from 'lucide-react'
import toast from 'react-hot-toast'

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  in_stock: { label: 'In Stock', color: '#10B981', bg: '#ECFDF5' },
  reserved: { label: 'Reserved', color: '#F59E0B', bg: '#FFFBEB' },
  used: { label: 'Used', color: '#78716C', bg: '#F5F5F4' },
  remnant: { label: 'Remnant', color: '#8B5CF6', bg: '#F5F3FF' },
}

export default function InventoryPage() {
  const [tab, setTab] = useState<'stock' | 'samples'>('stock')
  const [stockSubTab, setStockSubTab] = useState<'blocks' | 'slabs'>('slabs')
  const [blocks, setBlocks] = useState<any[]>([])
  const [showBlockModal, setShowBlockModal] = useState(false)
  const [editBlock, setEditBlock] = useState<any>(null)
  const [selectedBlock, setSelectedBlock] = useState<any>(null)
  const [blockForm, setBlockForm] = useState({
    code: '', material_group: '', material_name: '', warehouse: '', quantity_m3: '',
    party_lot: '', width_cm: '', height_cm: '', length_cm: '', cost: '', currency: 'GBP', notes: '',
  })
  const [showStockDetails, setShowStockDetails] = useState(false)
  const [stockDetailsSurface, setStockDetailsSurface] = useState('all')
  const [exportingStockPdf, setExportingStockPdf] = useState(false)
  const [slabs, setSlabs] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editSlab, setEditSlab] = useState<any>(null)
  const [selectedSlab, setSelectedSlab] = useState<any>(null)
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null)
  const [showReserveModal, setShowReserveModal] = useState(false)
  const [showRemnantModal, setShowRemnantModal] = useState(false)
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  // Sample stock
  const [sampleStock, setSampleStock] = useState<any[]>([])
  const [sampleSearch, setSampleSearch] = useState('')
  const [showSampleModal, setShowSampleModal] = useState(false)
  const [editSample, setEditSample] = useState<any>(null)
  const [selectedSample, setSelectedSample] = useState<any>(null)
  const [showCheckoutModal, setShowCheckoutModal] = useState(false)
  const [checkoutMode, setCheckoutMode] = useState<'checked_out' | 'returned' | 'received'>('checked_out')
  const [checkoutForm, setCheckoutForm] = useState({ quantity: '1', checked_out_to: '', notes: '' })
  const [sampleForm, setSampleForm] = useState({
    material_name: '', finish: '', sample_size: '', supplier: '',
    quantity_on_hand: '0', reorder_level: '3', cost_per_unit: '', currency: 'GBP', location: '', notes: '',
  })

  // Sample stock import from Excel/CSV
  const [showImportModal, setShowImportModal] = useState(false)
  const [importRows, setImportRows] = useState<any[]>([])
  const [importing, setImporting] = useState(false)
  const [importFileName, setImportFileName] = useState('')

  // Slab stock import (aggregate warehouse stock format — Code/Group/Name/Warehouse/Quantity/Unit)
  const [showSlabImportModal, setShowSlabImportModal] = useState(false)
  const [slabImportRows, setSlabImportRows] = useState<any[]>([])
  const [slabImporting, setSlabImporting] = useState(false)
  const [slabImportFileName, setSlabImportFileName] = useState('')

  const [form, setForm] = useState({
    material_name: '', finish: '', lot_number: '', supplier: '',
    length_mm: '', width_mm: '', thickness_mm: '', cost: '', currency: 'GBP',
    location: '', notes: '',
  })
  const [reserveProjectId, setReserveProjectId] = useState('')
  const [remnantForm, setRemnantForm] = useState({ length_mm: '', width_mm: '', location: '', notes: '' })

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) {
        const { data: profile } = await supabase.from('users').select('*').eq('id', data.user.id).single()
        setCurrentUser(profile)
      }
    })
    loadAll()
  }, [])

  async function loadAll() {
    const [blocksRes, slabsRes, projectsRes, samplesRes] = await Promise.all([
      supabase.from('stock_blocks').select('*, reserved_project:projects!reserved_project_id(id, name, client)').order('created_at', { ascending: false }),
      supabase.from('stock_slabs').select('*, reserved_project:projects!reserved_project_id(id, name, client)').order('created_at', { ascending: false }),
      supabase.from('projects').select('id, name, client').eq('status', 'active').order('name'),
      supabase.from('sample_stock').select('*').order('material_name'),
    ])
    setBlocks(blocksRes.data || [])
    setSlabs(slabsRes.data || [])
    setProjects(projectsRes.data || [])
    setSampleStock(samplesRes.data || [])
    setLoading(false)
  }

  // ── SLAB STOCK IMPORT ──
  // This format is aggregate warehouse stock (total m² per material per
  // warehouse), not individual slab pieces with unique dimensions — so it
  // maps to area_m2 rather than length_mm/width_mm.
  async function handleImportSlabFile(file: File) {
    setSlabImportFileName(file.name)
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })

    let headerIdx = -1
    let colMap: Record<string, number> = {}
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i].map((c: any) => String(c).trim().toUpperCase())
      const codeIdx = row.findIndex(c => c === 'CODE')
      const whIdx = row.findIndex(c => c === 'WAREHOUSE')
      const qtyIdx = row.findIndex(c => c === 'QUANTITY')
      if (codeIdx !== -1 && whIdx !== -1 && qtyIdx !== -1) {
        headerIdx = i
        row.forEach((c, idx) => { colMap[c] = idx })
        break
      }
    }
    if (headerIdx === -1) { toast.error('Could not find a header row with Code, Warehouse, and Quantity columns'); return }

    // Turkish finish terms seen in real exports, translated for consistency
    // with the rest of the app — unrecognised values pass through as-is.
    const FINISH_TRANSLATE: Record<string, string> = {
      'HONLU': 'Honed', 'CILALI': 'Polished', 'PATİNELİ': 'Leathered', 'PATINELI': 'Leathered',
      'LEATHERFINISH': 'Leathered', 'HYDROFINISH': 'Honed', 'MUCARTALI': 'Brushed',
    }
    function translateFinish(raw: string) {
      const key = raw.trim().toUpperCase()
      return FINISH_TRANSLATE[key] || raw.trim()
    }

    const parsed = rows.slice(headerIdx + 1)
      .filter(row => String(row[colMap['UNIT']] || '').trim().toUpperCase() === 'M2')
      .map(row => {
        // Width/Height/Thickness in this export are in cm — converted to
        // mm here since that's the unit used everywhere else in the app.
        const widthCm = Number(row[colMap['WIDTH']]) || 0
        const heightCm = Number(row[colMap['HEIGHT']]) || 0
        const thicknessCm = Number(row[colMap['THICKNESS']]) || 0
        const hasPieceDimensions = widthCm > 0 && heightCm > 0
        const desc = String(row[colMap['DESC']] || '').trim()
        const rezCustomer = String(row[colMap['REZ.CUSTOMER']] || '').trim()
        return {
          code: String(row[colMap['CODE']] || '').trim(),
          material_name: String(row[colMap['NAME']] || '').trim(),
          group_code: String(row[colMap['GROUP']] || '').trim(),
          location: String(row[colMap['WAREHOUSE']] || '').trim(),
          warehouse_no: String(row[colMap['W.NO']] || '').trim(),
          area_m2: hasPieceDimensions ? null : (Number(row[colMap['QUANTITY']]) || 0),
          length_mm: hasPieceDimensions ? Math.round(widthCm * 10) : null,
          width_mm: hasPieceDimensions ? Math.round(heightCm * 10) : null,
          thickness_mm: thicknessCm > 0 ? Math.round(thicknessCm * 10) : null,
          finish: row[colMap['SURFACE']] ? translateFinish(String(row[colMap['SURFACE']])) : null,
          lot_number: String(row[colMap['PARTY']] || '').trim() || null,
          specLotId: String(row[colMap['SPEC/LOT']] || '').trim(),
          bundle: String(row[colMap['BUNDLE']] || '').trim(),
          desc: (desc && desc !== '-') ? desc : '',
          reservedCustomer: rezCustomer || null,
        }
      })
      .filter(r => r.material_name)

    setSlabImportRows(parsed)
    setShowSlabImportModal(true)
  }

  async function confirmSlabImport() {
    if (slabImportRows.length === 0) return
    setSlabImporting(true)
    const payload = slabImportRows.map(r => ({
      material_name: r.material_name,
      lot_number: r.lot_number || r.code || null,
      location: r.location || null,
      area_m2: r.area_m2 || null,
      length_mm: r.length_mm || null,
      width_mm: r.width_mm || null,
      thickness_mm: r.thickness_mm || null,
      finish: r.finish || null,
      group_code: r.group_code || null,
      bundle: r.bundle || null,
      spec_lot_id: r.specLotId || null,
      condition_notes: r.desc || null,
      reserved_customer: r.reservedCustomer || null,
      warehouse_no: r.warehouse_no || null,
      notes: r.code || null,
      status: r.reservedCustomer ? 'reserved' : 'in_stock',
      currency: 'GBP', created_by: currentUser?.id,
    }))
    const batchSize = 100
    let inserted = 0
    for (let i = 0; i < payload.length; i += batchSize) {
      const batch = payload.slice(i, i + batchSize)
      const { error } = await supabase.from('stock_slabs').insert(batch)
      if (error) { toast.error(`Import failed partway through (${inserted} imported before the error): ${error.message}`); setSlabImporting(false); return }
      inserted += batch.length
    }
    toast.success(`Imported ${inserted} slab stock lines`)
    setSlabImporting(false)
    setShowSlabImportModal(false)
    setSlabImportRows([])
    loadAll()
  }

  function openAdd() {
    setForm({ material_name: '', finish: '', lot_number: '', supplier: '', length_mm: '', width_mm: '', thickness_mm: '', cost: '', currency: 'GBP', location: '', notes: '' })
    setEditSlab(null)
    setShowModal(true)
  }

  function openEdit(slab: any) {
    setForm({
      material_name: slab.material_name || '', finish: slab.finish || '', lot_number: slab.lot_number || '',
      supplier: slab.supplier || '', length_mm: slab.length_mm || '', width_mm: slab.width_mm || '',
      thickness_mm: slab.thickness_mm || '', cost: slab.cost || '', currency: slab.currency || 'GBP',
      location: slab.location || '', notes: slab.notes || '',
    })
    setEditSlab(slab)
    setShowModal(true)
  }

  async function saveSlab() {
    if (!form.material_name.trim()) { toast.error('Material name is required'); return }
    setSaving(true)
    const payload = {
      material_name: form.material_name.trim(), finish: form.finish || null, lot_number: form.lot_number || null,
      supplier: form.supplier || null, length_mm: form.length_mm ? Number(form.length_mm) : null,
      width_mm: form.width_mm ? Number(form.width_mm) : null, thickness_mm: form.thickness_mm ? Number(form.thickness_mm) : null,
      cost: form.cost ? Number(form.cost) : null, currency: form.currency, location: form.location || null, notes: form.notes || null,
    }
    if (editSlab) {
      const { error } = await supabase.from('stock_slabs').update(payload).eq('id', editSlab.id)
      if (error) { toast.error(`Failed to save: ${error.message}`); setSaving(false); return }
      toast.success('Updated')
    } else {
      const { error } = await supabase.from('stock_slabs').insert({ ...payload, created_by: currentUser?.id })
      if (error) { toast.error(`Failed to add: ${error.message}`); setSaving(false); return }
      toast.success('Slab added')
    }
    setSaving(false)
    setShowModal(false)
    loadAll()
  }

  async function deleteSlab(id: string) {
    if (!confirm('Delete this slab record?')) return
    const { error } = await supabase.from('stock_slabs').delete().eq('id', id)
    if (error) { toast.error(`Failed to delete: ${error.message}`); return }
    toast.success('Deleted')
    setSelectedSlab(null)
    loadAll()
  }

  function openReserve(slab: any) {
    setSelectedSlab(slab)
    setReserveProjectId(slab.reserved_project_id || '')
    setShowReserveModal(true)
  }

  async function confirmReserve() {
    if (!reserveProjectId) { toast.error('Select a project'); return }
    const { error } = await supabase.from('stock_slabs').update({
      status: 'reserved', reserved_project_id: reserveProjectId,
    }).eq('id', selectedSlab.id)
    if (error) { toast.error(`Failed: ${error.message}`); return }
    toast.success('Slab reserved')
    setShowReserveModal(false)
    setSelectedSlab(null)
    loadAll()
  }

  async function unreserve(slab: any) {
    const { error } = await supabase.from('stock_slabs').update({ status: 'in_stock', reserved_project_id: null, reserved_estimate_id: null }).eq('id', slab.id)
    if (error) { toast.error(`Failed: ${error.message}`); return }
    toast.success('Reservation cleared')
    loadAll()
  }

  async function markUsed(slab: any) {
    if (!confirm(`Mark "${slab.material_name}" as used?`)) return
    const { error } = await supabase.from('stock_slabs').update({ status: 'used' }).eq('id', slab.id)
    if (error) { toast.error(`Failed: ${error.message}`); return }
    toast.success('Marked as used')
    setSelectedSlab(null)
    loadAll()
  }

  function openLogRemnant(slab: any) {
    setSelectedSlab(slab)
    setRemnantForm({ length_mm: '', width_mm: '', location: slab.location || '', notes: '' })
    setShowRemnantModal(true)
  }

  async function saveRemnant() {
    if (!remnantForm.length_mm || !remnantForm.width_mm) { toast.error('Dimensions required'); return }
    setSaving(true)
    const { error } = await supabase.from('stock_slabs').insert({
      material_name: selectedSlab.material_name, finish: selectedSlab.finish, lot_number: selectedSlab.lot_number,
      supplier: selectedSlab.supplier, length_mm: Number(remnantForm.length_mm), width_mm: Number(remnantForm.width_mm),
      thickness_mm: selectedSlab.thickness_mm, currency: selectedSlab.currency,
      location: remnantForm.location || null, notes: remnantForm.notes || null,
      status: 'remnant', is_remnant: true, parent_slab_id: selectedSlab.id,
      created_by: currentUser?.id,
    })
    if (error) { toast.error(`Failed: ${error.message}`); setSaving(false); return }
    // Mark the parent as used now that a remnant has been logged from it
    await supabase.from('stock_slabs').update({ status: 'used' }).eq('id', selectedSlab.id)
    toast.success('Remnant logged')
    setSaving(false)
    setShowRemnantModal(false)
    setSelectedSlab(null)
    loadAll()
  }

  // ── BLOCKS (raw, pre-cutting) ──
  function openAddBlock() {
    setBlockForm({ code: '', material_group: '', material_name: '', warehouse: '', quantity_m3: '', party_lot: '', width_cm: '', height_cm: '', length_cm: '', cost: '', currency: 'GBP', notes: '' })
    setEditBlock(null)
    setShowBlockModal(true)
  }

  function openEditBlock(b: any) {
    setBlockForm({
      code: b.code || '', material_group: b.material_group || '', material_name: b.material_name || '',
      warehouse: b.warehouse || '', quantity_m3: b.quantity_m3 || '', party_lot: b.party_lot || '',
      width_cm: b.width_cm || '', height_cm: b.height_cm || '', length_cm: b.length_cm || '',
      cost: b.cost || '', currency: b.currency || 'GBP', notes: b.notes || '',
    })
    setEditBlock(b)
    setShowBlockModal(true)
  }

  async function saveBlock() {
    if (!blockForm.material_name.trim()) { toast.error('Material name is required'); return }
    setSaving(true)
    const payload = {
      code: blockForm.code || null, material_group: blockForm.material_group || null, material_name: blockForm.material_name.trim(),
      warehouse: blockForm.warehouse || null, quantity_m3: blockForm.quantity_m3 ? Number(blockForm.quantity_m3) : null,
      party_lot: blockForm.party_lot || null, width_cm: blockForm.width_cm ? Number(blockForm.width_cm) : null,
      height_cm: blockForm.height_cm ? Number(blockForm.height_cm) : null, length_cm: blockForm.length_cm ? Number(blockForm.length_cm) : null,
      cost: blockForm.cost ? Number(blockForm.cost) : null, currency: blockForm.currency, notes: blockForm.notes || null,
    }
    if (editBlock) {
      const { error } = await supabase.from('stock_blocks').update(payload).eq('id', editBlock.id)
      if (error) { toast.error(`Failed to save: ${error.message}`); setSaving(false); return }
      toast.success('Updated')
    } else {
      const { error } = await supabase.from('stock_blocks').insert({ ...payload, created_by: currentUser?.id })
      if (error) { toast.error(`Failed to add: ${error.message}`); setSaving(false); return }
      toast.success('Block added')
    }
    setSaving(false)
    setShowBlockModal(false)
    loadAll()
  }

  async function deleteBlock(id: string) {
    if (!confirm('Delete this block record?')) return
    const { error } = await supabase.from('stock_blocks').delete().eq('id', id)
    if (error) { toast.error(`Failed to delete: ${error.message}`); return }
    toast.success('Deleted')
    setSelectedBlock(null)
    loadAll()
  }

  async function markBlockCut(block: any) {
    if (!confirm(`Mark "${block.material_name}" as cut? You can then log the resulting slabs separately, linked to this block.`)) return
    const { error } = await supabase.from('stock_blocks').update({ status: 'cut' }).eq('id', block.id)
    if (error) { toast.error(`Failed: ${error.message}`); return }
    toast.success('Marked as cut — add the resulting slabs from the Slabs tab')
    setSelectedBlock(null)
    loadAll()
  }

  // ── SAMPLE STOCK ──
  function openAddSample() {
    setSampleForm({ material_name: '', finish: '', sample_size: '', supplier: '', quantity_on_hand: '0', reorder_level: '3', cost_per_unit: '', currency: 'GBP', location: '', notes: '' })
    setEditSample(null)
    setShowSampleModal(true)
  }

  function openEditSample(s: any) {
    setSampleForm({
      material_name: s.material_name || '', finish: s.finish || '', sample_size: s.sample_size || '',
      supplier: s.supplier || '', quantity_on_hand: String(s.quantity_on_hand ?? 0), reorder_level: String(s.reorder_level ?? 3),
      cost_per_unit: s.cost_per_unit || '', currency: s.currency || 'GBP', location: s.location || '', notes: s.notes || '',
    })
    setEditSample(s)
    setShowSampleModal(true)
  }

  async function saveSample() {
    if (!sampleForm.material_name.trim()) { toast.error('Material name is required'); return }
    setSaving(true)
    const payload = {
      material_name: sampleForm.material_name.trim(), finish: sampleForm.finish || null, sample_size: sampleForm.sample_size || null,
      supplier: sampleForm.supplier || null, quantity_on_hand: Number(sampleForm.quantity_on_hand) || 0,
      reorder_level: Number(sampleForm.reorder_level) || 0, cost_per_unit: sampleForm.cost_per_unit ? Number(sampleForm.cost_per_unit) : null,
      currency: sampleForm.currency, location: sampleForm.location || null, notes: sampleForm.notes || null,
    }
    if (editSample) {
      const { error } = await supabase.from('sample_stock').update(payload).eq('id', editSample.id)
      if (error) { toast.error(`Failed to save: ${error.message}`); setSaving(false); return }
      toast.success('Updated')
    } else {
      const { error } = await supabase.from('sample_stock').insert({ ...payload, created_by: currentUser?.id })
      if (error) { toast.error(`Failed to add: ${error.message}`); setSaving(false); return }
      toast.success('Sample stock added')
    }
    setSaving(false)
    setShowSampleModal(false)
    loadAll()
  }

  async function deleteSample(id: string) {
    if (!confirm('Delete this sample stock record?')) return
    const { error } = await supabase.from('sample_stock').delete().eq('id', id)
    if (error) { toast.error(`Failed to delete: ${error.message}`); return }
    toast.success('Deleted')
    setSelectedSample(null)
    loadAll()
  }

  function openCheckout(sample: any, mode: 'checked_out' | 'returned' | 'received') {
    setSelectedSample(sample)
    setCheckoutMode(mode)
    setCheckoutForm({ quantity: '1', checked_out_to: '', notes: '' })
    setShowCheckoutModal(true)
  }

  async function exportStockDetailsPdf() {
    setExportingStockPdf(true)
    try {
      const { jsPDF } = await import('jspdf')
      const pdf = new jsPDF('p', 'mm', 'a4')
      const availableSlabs = slabs.filter(s => s.status === 'in_stock' && (stockDetailsSurface === 'all' || s.finish === stockDetailsSurface))

      pdf.setFontSize(18)
      pdf.setTextColor(28, 25, 23)
      pdf.text('STOCK DETAILS', 15, 20)
      pdf.setFontSize(9)
      pdf.setTextColor(120, 113, 108)
      pdf.text('Please contact us to obtain reservation information regarding the stones you have selected.', 15, 27)

      let y = 38
      pdf.setFontSize(8)
      pdf.setTextColor(87, 83, 78)
      const cols = [15, 70, 100, 130, 155, 175]
      ;['Product Name', 'Width', 'Height', 'Surface Type', 'Lot', 'M2'].forEach((h, i) => pdf.text(h, cols[i], y))
      y += 3
      pdf.setDrawColor(230, 226, 220)
      pdf.line(15, y, 195, y)
      y += 6

      let totalM2 = 0
      availableSlabs.forEach(s => {
        if (y > 280) { pdf.addPage(); y = 20 }
        const m2 = s.length_mm && s.width_mm ? (s.length_mm * s.width_mm) / 1000000 : 0
        totalM2 += m2
        pdf.setTextColor(28, 25, 23)
        pdf.text(String(s.material_name).slice(0, 28), cols[0], y)
        pdf.setTextColor(87, 83, 78)
        pdf.text(String(s.length_mm || '—'), cols[1], y)
        pdf.text(String(s.width_mm || '—'), cols[2], y)
        pdf.text(String(s.finish || '—'), cols[3], y)
        pdf.text(String(s.lot_number || '—'), cols[4], y)
        pdf.text(m2 ? m2.toFixed(2) : '—', cols[5], y)
        y += 7
      })

      y += 4
      pdf.setDrawColor(230, 226, 220)
      pdf.line(140, y, 195, y)
      y += 6
      pdf.setFontSize(10)
      pdf.setTextColor(28, 25, 23)
      pdf.text('Stock Sum:', 140, y)
      pdf.text(`${totalM2.toFixed(2)} m²`, 175, y)

      pdf.save('stock-details.pdf')
      toast.success('Stock details exported')
    } catch (err: any) {
      toast.error('Export failed: ' + err.message)
    }
    setExportingStockPdf(false)
  }

  async function confirmCheckout() {
    const qty = Number(checkoutForm.quantity) || 0
    if (qty <= 0) { toast.error('Enter a quantity'); return }
    setSaving(true)

    let newOnHand = selectedSample.quantity_on_hand
    let newCheckedOut = selectedSample.quantity_checked_out
    if (checkoutMode === 'checked_out') {
      if (qty > selectedSample.quantity_on_hand) { toast.error('Not enough in stock'); setSaving(false); return }
      newOnHand -= qty
      newCheckedOut += qty
    } else if (checkoutMode === 'returned') {
      newCheckedOut = Math.max(0, newCheckedOut - qty)
      newOnHand += qty
    } else if (checkoutMode === 'received') {
      newOnHand += qty
    }

    const { error } = await supabase.from('sample_stock').update({ quantity_on_hand: newOnHand, quantity_checked_out: newCheckedOut }).eq('id', selectedSample.id)
    if (error) { toast.error(`Failed: ${error.message}`); setSaving(false); return }

    await supabase.from('sample_stock_movements').insert({
      sample_stock_id: selectedSample.id, movement_type: checkoutMode, quantity: qty,
      checked_out_to: checkoutForm.checked_out_to || null, notes: checkoutForm.notes || null, created_by: currentUser?.id,
    })

    toast.success('Stock updated')
    setSaving(false)
    setShowCheckoutModal(false)
    setSelectedSample(null)
    loadAll()
  }

  // ── SAMPLE STOCK IMPORT ──
  // Detects the header row automatically (looking for NAME + FINISH columns)
  // rather than assuming a fixed row number, so slightly different exports
  // of the same spreadsheet still work.
  async function handleImportFile(file: File) {
    setImportFileName(file.name)
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })

    let headerIdx = -1
    let colMap: Record<string, number> = {}
    for (let i = 0; i < Math.min(rows.length, 15); i++) {
      const row = rows[i].map((c: any) => String(c).trim().toUpperCase())
      const nameIdx = row.findIndex(c => c === 'NAME')
      const finishIdx = row.findIndex(c => c === 'FINISH')
      if (nameIdx !== -1 && finishIdx !== -1) {
        headerIdx = i
        row.forEach((c, idx) => { colMap[c] = idx })
        break
      }
    }
    if (headerIdx === -1) { toast.error('Could not find a header row with NAME and FINISH columns'); return }

    // Some rows have non-numeric junk typed into the quantity column (seen
    // in real data, e.g. "gr" instead of a number) — fall back to 0 and
    // flag the row for review rather than silently breaking the import.
    const safeNum = (val: any, fallback: number) => {
      const n = Number(val)
      return (val !== '' && val !== undefined && !isNaN(n)) ? n : fallback
    }

    const parsed = rows.slice(headerIdx + 1)
      .map(row => {
        const qtyRaw = row[colMap['QTY']]
        const reorderRaw = row[colMap['REORDER QTY']]
        const qty = safeNum(qtyRaw, 0)
        const needsReview = qtyRaw !== undefined && qtyRaw !== '' && isNaN(Number(qtyRaw))
        return {
          material_name: String(row[colMap['NAME']] || '').trim(),
          finish: String(row[colMap['FINISH']] || '').trim(),
          rack: String(row[colMap['RACK #']] ?? '').trim(),
          location_area: String(row[colMap['LOCATION']] ?? '').trim(),
          quantity_on_hand: qty,
          reorder_level: safeNum(reorderRaw, 3),
          notes: String(row[colMap['NOTES']] || '').trim() + (needsReview ? ` [qty was "${qtyRaw}" — set to 0, please check]` : ''),
          needsReview,
        }
      })
      .filter(r => r.material_name)
      .map(r => ({ ...r, location: [r.rack, r.location_area].filter(Boolean).join(' · ') }))


    setImportRows(parsed)
    setShowImportModal(true)
  }

  async function confirmImport() {
    if (importRows.length === 0) return
    setImporting(true)
    const payload = importRows.map(r => ({
      material_name: r.material_name, finish: r.finish || null, location: r.location || null,
      quantity_on_hand: r.quantity_on_hand || 0, reorder_level: r.reorder_level || 0,
      notes: r.notes || null, currency: 'GBP', created_by: currentUser?.id,
    }))
    // Insert in batches so one large file doesn't hit a request size limit
    const batchSize = 100
    let inserted = 0
    for (let i = 0; i < payload.length; i += batchSize) {
      const batch = payload.slice(i, i + batchSize)
      const { error } = await supabase.from('sample_stock').insert(batch)
      if (error) { toast.error(`Import failed partway through: ${error.message}`); setImporting(false); return }
      inserted += batch.length
    }
    toast.success(`Imported ${inserted} sample stock lines`)
    setImporting(false)
    setShowImportModal(false)
    setImportRows([])
    loadAll()
  }

  const filteredSamples = sampleStock.filter(s =>
    !sampleSearch || `${s.material_name} ${s.finish} ${s.supplier}`.toLowerCase().includes(sampleSearch.toLowerCase())
  )
  const sampleStats = {
    total: sampleStock.length,
    lowStock: sampleStock.filter(s => s.quantity_on_hand <= (s.reorder_level || 0)).length,
    totalUnits: sampleStock.reduce((sum, s) => sum + (s.quantity_on_hand || 0), 0),
    checkedOut: sampleStock.reduce((sum, s) => sum + (s.quantity_checked_out || 0), 0),
  }

  const blockStats = {
    total: blocks.length,
    inStockM3: blocks.filter(b => b.status === 'in_stock').reduce((sum, b) => sum + (b.quantity_m3 || 0), 0),
    reserved: blocks.filter(b => b.status === 'reserved').length,
    cut: blocks.filter(b => b.status === 'cut').length,
  }

  const filtered = slabs.filter(s => {
    if (statusFilter !== 'all' && s.status !== statusFilter) return false
    if (search && !`${s.material_name} ${s.finish} ${s.lot_number} ${s.supplier}`.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // Group slabs by material so each material shows as one row with a
  // "Lot Details" list underneath containing every individual piece
  // imported for it — matches how the source Excel data is organised
  // (one material, many lot/party rows).
  const groupedByMaterial = Object.values(
    filtered.reduce((acc: Record<string, any>, s: any) => {
      const key = s.material_name
      if (!acc[key]) {
        acc[key] = { material_name: key, finish: s.finish, items: [], totalArea: 0, inStockCount: 0, reservedCount: 0 }
      }
      acc[key].items.push(s)
      const area = s.area_m2 || (s.length_mm && s.width_mm ? (s.length_mm * s.width_mm) / 1000000 : 0)
      acc[key].totalArea += area
      if (s.status === 'in_stock') acc[key].inStockCount++
      if (s.status === 'reserved') acc[key].reservedCount++
      return acc
    }, {})
  ).sort((a: any, b: any) => a.material_name.localeCompare(b.material_name))

  const stats = {
    total: slabs.length,
    inStock: slabs.filter(s => s.status === 'in_stock').length,
    reserved: slabs.filter(s => s.status === 'reserved').length,
    remnants: slabs.filter(s => s.status === 'remnant').length,
    totalValue: slabs.filter(s => s.status !== 'used').reduce((sum, s) => sum + (s.cost || 0), 0),
  }

  if (loading) return (
    <div className="flex items-center justify-center h-64">
      <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="p-4 sm:p-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Material Inventory</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {tab === 'samples'
              ? `${sampleStats.total} sample lines tracked`
              : stockSubTab === 'blocks' ? `${blockStats.total} blocks tracked` : `${stats.total} slabs tracked`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {tab === 'stock' && stockSubTab === 'slabs' && (
            <button onClick={() => setShowStockDetails(true)} className="btn-secondary flex items-center gap-2">
              <ImageIcon size={14}/> Stock Details
            </button>
          )}
          <button onClick={() => tab === 'samples' ? openAddSample() : stockSubTab === 'blocks' ? openAddBlock() : openAdd()} className="btn-primary flex items-center gap-2">
            <Plus size={14}/> {tab === 'samples' ? 'Add Sample Stock' : stockSubTab === 'blocks' ? 'Add Block' : 'Add Slab'}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between flex-wrap gap-3 mb-5">
        <div className="flex border border-stone-200 rounded-lg bg-white overflow-hidden w-fit">
          <button onClick={() => setTab('stock')} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'stock' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-50'}`}>Stock Product</button>
          <button onClick={() => setTab('samples')} className={`px-4 py-2 text-sm font-medium transition-colors ${tab === 'samples' ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-50'}`}>
            Samples {sampleStats.lowStock > 0 && <span className={`ml-1 text-xs px-1.5 py-0.5 rounded-full ${tab === 'samples' ? 'bg-white/20 text-white' : 'bg-red-100 text-red-600'}`}>{sampleStats.lowStock} low</span>}
          </button>
        </div>

        {tab === 'stock' && (
          <div className="flex border border-stone-300 rounded-lg bg-white overflow-hidden w-fit">
            <button onClick={() => setStockSubTab('slabs')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${stockSubTab === 'slabs' ? 'bg-stone-300 text-stone-900 shadow-inner' : 'text-stone-400 hover:bg-stone-100'}`}>Slabs</button>
            <button onClick={() => setStockSubTab('blocks')} className={`px-3 py-1.5 text-xs font-semibold transition-colors ${stockSubTab === 'blocks' ? 'bg-stone-300 text-stone-900 shadow-inner' : 'text-stone-400 hover:bg-stone-100'}`}>Blocks</button>
          </div>
        )}
      </div>

      {tab === 'stock' && stockSubTab === 'blocks' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-brand-600">{blockStats.inStockM3.toFixed(2)}</div>
              <div className="text-xs text-stone-400 mt-0.5">M³ In Stock</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold" style={{ color: '#F59E0B' }}>{blockStats.reserved}</div>
              <div className="text-xs text-stone-400 mt-0.5">Reserved</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold" style={{ color: '#78716C' }}>{blockStats.cut}</div>
              <div className="text-xs text-stone-400 mt-0.5">Cut</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-stone-700">{blockStats.total}</div>
              <div className="text-xs text-stone-400 mt-0.5">Total Blocks</div>
            </div>
          </div>

          {blocks.length === 0 ? (
            <div className="card py-16 text-center">
              <Package size={32} className="text-stone-300 mx-auto mb-3"/>
              <p className="text-stone-400 text-sm mb-3">No blocks recorded yet</p>
              <button onClick={openAddBlock} className="btn-primary text-sm">+ Add first block</button>
            </div>
          ) : (
            <div className="card overflow-hidden overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase">Code</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase">Material</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase">Warehouse</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase">Party / Lot</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase">Quantity (M³)</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {blocks.map(b => (
                    <tr key={b.id} className="hover:bg-stone-50 cursor-pointer" onClick={() => setSelectedBlock(b)}>
                      <td className="px-4 py-3 text-xs text-stone-400 font-mono">{b.code || '—'}</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-stone-900">{b.material_name}</p>
                        {b.material_group && <p className="text-xs text-stone-400">{b.material_group}</p>}
                      </td>
                      <td className="px-4 py-3 text-sm text-stone-600">{b.warehouse || '—'}</td>
                      <td className="px-4 py-3 text-sm text-stone-600">{b.party_lot || '—'}</td>
                      <td className="px-4 py-3 text-sm text-stone-700 text-right">{b.quantity_m3 ?? '—'}</td>
                      <td className="px-4 py-3">
                        <span className="badge text-xs" style={
                          b.status === 'in_stock' ? { background: '#ECFDF5', color: '#059669' } :
                          b.status === 'reserved' ? { background: '#FFFBEB', color: '#D97706' } :
                          { background: '#F5F5F4', color: '#78716C' }
                        }>{b.status === 'in_stock' ? 'In Stock' : b.status === 'reserved' ? 'Reserved' : 'Cut'}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'stock' && stockSubTab === 'slabs' && (
      <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-brand-600">{stats.inStock}</div>
          <div className="text-xs text-stone-400 mt-0.5">In Stock</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: '#F59E0B' }}>{stats.reserved}</div>
          <div className="text-xs text-stone-400 mt-0.5">Reserved</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold" style={{ color: '#8B5CF6' }}>{stats.remnants}</div>
          <div className="text-xs text-stone-400 mt-0.5">Remnants</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-2xl font-bold text-stone-700">£{stats.totalValue.toLocaleString()}</div>
          <div className="text-xs text-stone-400 mt-0.5">Stock Value</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/>
          <input className="input pl-9" placeholder="Search material, lot, supplier..." value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        {['all', 'in_stock', 'reserved', 'used', 'remnant'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`text-xs px-3 py-2 rounded-lg border transition-colors flex-shrink-0 ${statusFilter === s ? 'bg-stone-900 text-white border-stone-900' : 'bg-white border-stone-200 text-stone-500'}`}>
            {s === 'all' ? 'All' : STATUS_CONFIG[s].label}
          </button>
        ))}
        <label className="btn-secondary flex items-center gap-2 cursor-pointer flex-shrink-0 text-xs px-3 py-2">
          <Upload size={13}/> Import from Excel/CSV
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleImportSlabFile(e.target.files[0])}/>
        </label>
      </div>

      {groupedByMaterial.length === 0 ? (
        <div className="card py-16 text-center">
          <Package size={32} className="text-stone-300 mx-auto mb-3"/>
          <p className="text-stone-400 text-sm mb-3">No slabs found</p>
          <button onClick={openAdd} className="btn-primary text-sm">+ Add first slab</button>
        </div>
      ) : (
        <div className="space-y-3">
          {groupedByMaterial.map((group: any) => {
            const isOpen = expandedMaterial === group.material_name
            return (
              <div key={group.material_name} className="card overflow-hidden">
                <button
                  onClick={() => setExpandedMaterial(isOpen ? null : group.material_name)}
                  className="w-full flex items-center justify-between gap-3 p-4 text-left hover:bg-stone-50 transition-colors">
                  <div className="min-w-0">
                    <p className="font-medium text-stone-900 text-sm truncate">{group.material_name}</p>
                    <p className="text-xs text-stone-400 mt-0.5">
                      {group.items.length} piece{group.items.length !== 1 ? 's' : ''}
                      {group.totalArea > 0 && ` · ${group.totalArea.toFixed(2)} m² total`}
                      {group.reservedCount > 0 && ` · ${group.reservedCount} reserved`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {group.finish && <span className="text-xs text-stone-400 hidden sm:inline">{group.finish}</span>}
                    <ChevronDown size={16} className={`text-stone-400 transition-transform ${isOpen ? 'rotate-180' : ''}`}/>
                  </div>
                </button>

                {isOpen && (
                  <div className="border-t border-stone-100">
                    <div className="px-4 py-2 bg-stone-50 border-b border-stone-100 flex items-center justify-between">
                      <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide">Lot Details</p>
                      <label className="flex items-center gap-1.5 text-xs text-brand-600 hover:underline cursor-pointer" onClick={e => e.stopPropagation()}>
                        <Upload size={12}/> Import from Excel/CSV
                        <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleImportSlabFile(e.target.files[0])}/>
                      </label>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-stone-100">
                            <th className="text-left px-4 py-2 text-xs font-semibold text-stone-400">Lot / Party</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-stone-400">Dimensions / Area</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-stone-400">Location</th>
                            <th className="text-left px-4 py-2 text-xs font-semibold text-stone-400">Status</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-50">
                          {group.items.map((slab: any) => {
                            const sc = STATUS_CONFIG[slab.status]
                            return (
                              <tr key={slab.id} className="hover:bg-stone-50 cursor-pointer" onClick={() => setSelectedSlab(slab)}>
                                <td className="px-4 py-2 text-stone-700">{slab.lot_number || '—'}</td>
                                <td className="px-4 py-2 text-stone-600">
                                  {slab.length_mm && slab.width_mm ? `${slab.length_mm}×${slab.width_mm}mm` : slab.area_m2 ? `${Number(slab.area_m2).toFixed(2)} m²` : '—'}
                                </td>
                                <td className="px-4 py-2 text-stone-500">{slab.location || '—'}</td>
                                <td className="px-4 py-2">
                                  <span className="badge text-xs" style={{ background: sc.bg, color: sc.color }}>{sc.label}</span>
                                </td>
                                <td className="px-4 py-2 text-right text-stone-300">›</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
      </>
      )}

      {tab === 'samples' && (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-brand-600">{sampleStats.total}</div>
              <div className="text-xs text-stone-400 mt-0.5">Materials Tracked</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold text-stone-700">{sampleStats.totalUnits}</div>
              <div className="text-xs text-stone-400 mt-0.5">Units In Stock</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold" style={{ color: '#F59E0B' }}>{sampleStats.checkedOut}</div>
              <div className="text-xs text-stone-400 mt-0.5">Checked Out</div>
            </div>
            <div className="card p-4 text-center">
              <div className="text-2xl font-bold" style={{ color: '#DC2626' }}>{sampleStats.lowStock}</div>
              <div className="text-xs text-stone-400 mt-0.5">Low Stock</div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/>
              <input className="input pl-9" placeholder="Search material, finish, supplier..." value={sampleSearch} onChange={e => setSampleSearch(e.target.value)}/>
            </div>
            <label className="btn-secondary flex items-center gap-2 cursor-pointer flex-shrink-0">
              <Upload size={14}/> Import from Excel/CSV
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleImportFile(e.target.files[0])}/>
            </label>
          </div>

          {filteredSamples.length === 0 ? (
            <div className="card py-16 text-center">
              <Package size={32} className="text-stone-300 mx-auto mb-3"/>
              <p className="text-stone-400 text-sm mb-3">No sample stock recorded yet</p>
              <button onClick={openAddSample} className="btn-primary text-sm">+ Add first sample stock</button>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-stone-100 bg-stone-50">
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase">Material</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase">Size</th>
                    <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase">Location</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase">On Hand</th>
                    <th className="text-right px-4 py-2.5 text-xs font-semibold text-stone-400 uppercase">Checked Out</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {filteredSamples.map(s => {
                    const low = s.quantity_on_hand <= (s.reorder_level || 0)
                    return (
                      <tr key={s.id} className="hover:bg-stone-50 cursor-pointer" onClick={() => setSelectedSample(s)}>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium text-stone-900">{s.material_name}</p>
                          <p className="text-xs text-stone-400">{s.finish}{s.supplier ? ` · ${s.supplier}` : ''}</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-600">{s.sample_size || '—'}</td>
                        <td className="px-4 py-3 text-sm text-stone-600">{s.location || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-semibold ${low ? 'text-red-500' : 'text-stone-700'}`}>{s.quantity_on_hand}</span>
                          {low && <span className="ml-1 text-xs text-red-500">low</span>}
                        </td>
                        <td className="px-4 py-3 text-sm text-stone-500 text-right">{s.quantity_checked_out}</td>
                        <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center gap-1 justify-end">
                            <button onClick={() => openCheckout(s, 'checked_out')} className="text-xs text-amber-600 hover:underline px-1.5">Check out</button>
                            <button onClick={() => openCheckout(s, 'returned')} className="text-xs text-brand-600 hover:underline px-1.5">Return</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Add/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">{editSlab ? 'Edit Slab' : 'Add Slab'}</h3>
              <button onClick={() => setShowModal(false)}><X size={18} className="text-stone-400"/></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Material Name</label><input className="input" value={form.material_name} onChange={e => setForm({ ...form, material_name: e.target.value })} placeholder="e.g. Calacatta Gold Marble"/></div>
              <div><label className="label">Finish</label><input className="input" value={form.finish} onChange={e => setForm({ ...form, finish: e.target.value })} placeholder="Polished, Honed..."/></div>
              <div><label className="label">Lot Number</label><input className="input" value={form.lot_number} onChange={e => setForm({ ...form, lot_number: e.target.value })}/></div>
              <div className="col-span-2"><label className="label">Supplier</label><input className="input" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })}/></div>
              <div><label className="label">Length (mm)</label><input className="input" type="number" value={form.length_mm} onChange={e => setForm({ ...form, length_mm: e.target.value })}/></div>
              <div><label className="label">Width (mm)</label><input className="input" type="number" value={form.width_mm} onChange={e => setForm({ ...form, width_mm: e.target.value })}/></div>
              <div><label className="label">Thickness (mm)</label><input className="input" type="number" value={form.thickness_mm} onChange={e => setForm({ ...form, thickness_mm: e.target.value })}/></div>
              <div><label className="label">Cost</label><input className="input" type="number" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })}/></div>
              <div><label className="label">Currency</label><input className="input" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}/></div>
              <div><label className="label">Location</label><input className="input" value={form.location} onChange={e => setForm({ ...form, location: e.target.value })} placeholder="e.g. Bay 3, Rack A"/></div>
              <div className="col-span-2"><label className="label">Notes</label><textarea className="input min-h-16" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={saveSlab} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : editSlab ? 'Save changes' : 'Add slab'}</button>
              <button onClick={() => setShowModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Reserve Modal */}
      {showReserveModal && selectedSlab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowReserveModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-4">Reserve for Project</h3>
            <label className="label">Project</label>
            <select className="input mb-4" value={reserveProjectId} onChange={e => setReserveProjectId(e.target.value)}>
              <option value="">Select a project</option>
              {projects.map(p => <option key={p.id} value={p.id}>{p.name} — {p.client}</option>)}
            </select>
            <div className="flex gap-2">
              <button onClick={confirmReserve} className="btn-primary flex-1">Reserve</button>
              <button onClick={() => setShowReserveModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Log Remnant Modal */}
      {showRemnantModal && selectedSlab && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowRemnantModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">Log Remnant</h3>
            <p className="text-xs text-stone-400 mb-4">From {selectedSlab.material_name} — this will mark the original slab as used and add the offcut as new stock.</p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="label">Length (mm)</label><input className="input" type="number" value={remnantForm.length_mm} onChange={e => setRemnantForm({ ...remnantForm, length_mm: e.target.value })}/></div>
              <div><label className="label">Width (mm)</label><input className="input" type="number" value={remnantForm.width_mm} onChange={e => setRemnantForm({ ...remnantForm, width_mm: e.target.value })}/></div>
            </div>
            <label className="label">Location</label>
            <input className="input mb-3" value={remnantForm.location} onChange={e => setRemnantForm({ ...remnantForm, location: e.target.value })}/>
            <label className="label">Notes</label>
            <textarea className="input min-h-16 mb-4" value={remnantForm.notes} onChange={e => setRemnantForm({ ...remnantForm, notes: e.target.value })}/>
            <div className="flex gap-2">
              <button onClick={saveRemnant} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Log Remnant'}</button>
              <button onClick={() => setShowRemnantModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Slab Detail Modal */}
      {selectedSlab && !showReserveModal && !showRemnantModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setSelectedSlab(null)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{selectedSlab.material_name}</h3>
                {selectedSlab.finish && <p className="text-xs text-stone-400">{selectedSlab.finish}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEdit(selectedSlab)} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400"><Edit size={16}/></button>
                <button onClick={() => setSelectedSlab(null)}><X size={18} className="text-stone-400"/></button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4 bg-stone-50 rounded-lg p-4">
              <div><span className="text-stone-400">Status:</span> <span className="font-medium" style={{ color: STATUS_CONFIG[selectedSlab.status].color }}>{STATUS_CONFIG[selectedSlab.status].label}</span></div>
              <div><span className="text-stone-400">Lot / Party:</span> <span className="text-stone-800">{selectedSlab.lot_number || '—'}</span></div>
              <div><span className="text-stone-400">Location:</span> <span className="text-stone-800">{selectedSlab.location || '—'}</span></div>
              <div><span className="text-stone-400">Dimensions:</span> <span className="text-stone-800">{selectedSlab.length_mm && selectedSlab.width_mm ? `${selectedSlab.length_mm} × ${selectedSlab.width_mm} mm` : '—'}</span></div>
              <div><span className="text-stone-400">Thickness:</span> <span className="text-stone-800">{selectedSlab.thickness_mm ? `${selectedSlab.thickness_mm}mm` : '—'}</span></div>
              <div><span className="text-stone-400">Area:</span> <span className="text-stone-800">{selectedSlab.area_m2 ? `${Number(selectedSlab.area_m2).toFixed(2)} m²` : selectedSlab.length_mm && selectedSlab.width_mm ? `${((selectedSlab.length_mm * selectedSlab.width_mm) / 1000000).toFixed(2)} m²` : '—'}</span></div>
              <div><span className="text-stone-400">Cost:</span> <span className="text-stone-800">{selectedSlab.cost ? `${selectedSlab.currency} ${Number(selectedSlab.cost).toLocaleString()}` : '—'}</span></div>
              {selectedSlab.is_remnant && <div><span className="text-stone-400">Type:</span> <span className="text-purple-600 font-medium">Remnant</span></div>}
            </div>

            {(selectedSlab.group_code || selectedSlab.bundle || selectedSlab.spec_lot_id || selectedSlab.warehouse_no || selectedSlab.notes) && (
              <div className="mb-4">
                <p className="text-xs font-semibold text-stone-400 uppercase tracking-wide mb-2">Lot Details</p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm border border-stone-200 rounded-lg p-4">
                  <div><span className="text-stone-400">Code:</span> <span className="text-stone-700">{selectedSlab.notes || '—'}</span></div>
                  <div><span className="text-stone-400">Group:</span> <span className="text-stone-700">{selectedSlab.group_code || '—'}</span></div>
                  <div><span className="text-stone-400">Spec / Lot ID:</span> <span className="text-stone-700">{selectedSlab.spec_lot_id || '—'}</span></div>
                  <div><span className="text-stone-400">Bundle:</span> <span className="text-stone-700">{selectedSlab.bundle || '—'}</span></div>
                  <div><span className="text-stone-400">W.No:</span> <span className="text-stone-700">{selectedSlab.warehouse_no || '—'}</span></div>
                </div>
              </div>
            )}

            {selectedSlab.condition_notes && (
              <div className="mb-4 px-4 py-3 bg-red-50 rounded-lg text-sm text-red-700 flex items-start gap-2">
                <span>⚠</span> <div><b>Condition note:</b> {selectedSlab.condition_notes}</div>
              </div>
            )}

            {selectedSlab.reserved_customer && (
              <div className="mb-4 px-4 py-3 bg-amber-50 rounded-lg text-sm text-amber-700 flex items-center gap-2">
                <Link2 size={14}/> Reserved for <b>{selectedSlab.reserved_customer}</b>
              </div>
            )}

            {selectedSlab.reserved_project && (
              <div className="mb-4 px-4 py-3 bg-amber-50 rounded-lg text-sm text-amber-700 flex items-center gap-2">
                <Link2 size={14}/> Reserved for <b>{selectedSlab.reserved_project.name}</b> ({selectedSlab.reserved_project.client})
              </div>
            )}


            <div className="flex flex-wrap gap-2">
              {selectedSlab.status === 'in_stock' && (
                <button onClick={() => openReserve(selectedSlab)} className="btn-secondary text-sm flex items-center gap-1.5"><Link2 size={13}/> Reserve for Project</button>
              )}
              {selectedSlab.status === 'reserved' && (
                <button onClick={() => unreserve(selectedSlab)} className="btn-secondary text-sm">Clear Reservation</button>
              )}
              {(selectedSlab.status === 'in_stock' || selectedSlab.status === 'reserved') && (
                <>
                  <button onClick={() => openLogRemnant(selectedSlab)} className="btn-secondary text-sm flex items-center gap-1.5"><Scissors size={13}/> Log Remnant &amp; Use</button>
                  <button onClick={() => markUsed(selectedSlab)} className="btn-secondary text-sm flex items-center gap-1.5"><CheckCircle2 size={13}/> Mark as Used</button>
                </>
              )}
              <button onClick={() => deleteSlab(selectedSlab.id)} className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1.5 ml-auto px-3"><Trash2 size={13}/> Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Sample Stock Add/Edit Modal */}
      {showSampleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowSampleModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">{editSample ? 'Edit Sample Stock' : 'Add Sample Stock'}</h3>
              <button onClick={() => setShowSampleModal(false)}><X size={18} className="text-stone-400"/></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2"><label className="label">Material Name</label><input className="input" value={sampleForm.material_name} onChange={e => setSampleForm({ ...sampleForm, material_name: e.target.value })} placeholder="e.g. Calacatta Gold Marble"/></div>
              <div><label className="label">Finish</label><input className="input" value={sampleForm.finish} onChange={e => setSampleForm({ ...sampleForm, finish: e.target.value })}/></div>
              <div><label className="label">Sample Size</label><input className="input" value={sampleForm.sample_size} onChange={e => setSampleForm({ ...sampleForm, sample_size: e.target.value })} placeholder="e.g. 10x10cm"/></div>
              <div className="col-span-2"><label className="label">Supplier</label><input className="input" value={sampleForm.supplier} onChange={e => setSampleForm({ ...sampleForm, supplier: e.target.value })}/></div>
              <div><label className="label">Quantity On Hand</label><input className="input" type="number" value={sampleForm.quantity_on_hand} onChange={e => setSampleForm({ ...sampleForm, quantity_on_hand: e.target.value })}/></div>
              <div><label className="label">Reorder Level</label><input className="input" type="number" value={sampleForm.reorder_level} onChange={e => setSampleForm({ ...sampleForm, reorder_level: e.target.value })}/></div>
              <div><label className="label">Cost per Unit</label><input className="input" type="number" value={sampleForm.cost_per_unit} onChange={e => setSampleForm({ ...sampleForm, cost_per_unit: e.target.value })}/></div>
              <div><label className="label">Currency</label><input className="input" value={sampleForm.currency} onChange={e => setSampleForm({ ...sampleForm, currency: e.target.value })}/></div>
              <div className="col-span-2"><label className="label">Location</label><input className="input" value={sampleForm.location} onChange={e => setSampleForm({ ...sampleForm, location: e.target.value })} placeholder="e.g. Sample Room, Shelf B"/></div>
              <div className="col-span-2"><label className="label">Notes</label><textarea className="input min-h-16" value={sampleForm.notes} onChange={e => setSampleForm({ ...sampleForm, notes: e.target.value })}/></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={saveSample} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : editSample ? 'Save changes' : 'Add sample stock'}</button>
              <button onClick={() => setShowSampleModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Check Out / Return / Receive Modal */}
      {showCheckoutModal && selectedSample && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowCheckoutModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-sm p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold mb-1">
              {checkoutMode === 'checked_out' ? 'Check Out' : checkoutMode === 'returned' ? 'Return to Stock' : 'Receive Stock'}
            </h3>
            <p className="text-xs text-stone-400 mb-4">{selectedSample.material_name} — {selectedSample.quantity_on_hand} currently on hand</p>
            <label className="label">Quantity</label>
            <input className="input mb-3" type="number" value={checkoutForm.quantity} onChange={e => setCheckoutForm({ ...checkoutForm, quantity: e.target.value })}/>
            {checkoutMode === 'checked_out' && (
              <>
                <label className="label">Checked Out To</label>
                <input className="input mb-3" value={checkoutForm.checked_out_to} onChange={e => setCheckoutForm({ ...checkoutForm, checked_out_to: e.target.value })} placeholder="Client or rep name"/>
              </>
            )}
            <label className="label">Notes</label>
            <textarea className="input min-h-16 mb-4" value={checkoutForm.notes} onChange={e => setCheckoutForm({ ...checkoutForm, notes: e.target.value })}/>
            <div className="flex gap-2">
              <button onClick={confirmCheckout} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : 'Confirm'}</button>
              <button onClick={() => setShowCheckoutModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Sample Detail Modal */}
      {selectedSample && !showCheckoutModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setSelectedSample(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{selectedSample.material_name}</h3>
                {selectedSample.finish && <p className="text-xs text-stone-400">{selectedSample.finish}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEditSample(selectedSample)} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400"><Edit size={16}/></button>
                <button onClick={() => setSelectedSample(null)}><X size={18} className="text-stone-400"/></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4 bg-stone-50 rounded-lg p-4">
              <div><span className="text-stone-400">On Hand:</span> <span className="font-medium text-stone-800">{selectedSample.quantity_on_hand}</span></div>
              <div><span className="text-stone-400">Checked Out:</span> <span className="font-medium text-stone-800">{selectedSample.quantity_checked_out}</span></div>
              <div><span className="text-stone-400">Size:</span> <span className="text-stone-800">{selectedSample.sample_size || '—'}</span></div>
              <div><span className="text-stone-400">Location:</span> <span className="text-stone-800">{selectedSample.location || '—'}</span></div>
              <div><span className="text-stone-400">Supplier:</span> <span className="text-stone-800">{selectedSample.supplier || '—'}</span></div>
              <div><span className="text-stone-400">Reorder Level:</span> <span className="text-stone-800">{selectedSample.reorder_level}</span></div>
            </div>
            {selectedSample.notes && <p className="text-xs text-stone-400 italic mb-4">{selectedSample.notes}</p>}
            <div className="flex flex-wrap gap-2">
              <button onClick={() => openCheckout(selectedSample, 'received')} className="btn-secondary text-sm">+ Receive Stock</button>
              <button onClick={() => openCheckout(selectedSample, 'checked_out')} className="btn-secondary text-sm">Check Out</button>
              <button onClick={() => openCheckout(selectedSample, 'returned')} className="btn-secondary text-sm">Return</button>
              <button onClick={() => deleteSample(selectedSample.id)} className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1.5 ml-auto px-3"><Trash2 size={13}/> Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Block Add/Edit Modal */}
      {showBlockModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowBlockModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-lg p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-semibold">{editBlock ? 'Edit Block' : 'Add Block'}</h3>
              <button onClick={() => setShowBlockModal(false)}><X size={18} className="text-stone-400"/></button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><label className="label">Code</label><input className="input" value={blockForm.code} onChange={e => setBlockForm({ ...blockForm, code: e.target.value })} placeholder="e.g. 01.15673"/></div>
              <div><label className="label">Material Group</label><input className="input" value={blockForm.material_group} onChange={e => setBlockForm({ ...blockForm, material_group: e.target.value })} placeholder="e.g. 01.GREY STARIATO"/></div>
              <div className="col-span-2"><label className="label">Material Name</label><input className="input" value={blockForm.material_name} onChange={e => setBlockForm({ ...blockForm, material_name: e.target.value })} placeholder="e.g. Grey Stariato Onyx Block 554"/></div>
              <div><label className="label">Warehouse</label><input className="input" value={blockForm.warehouse} onChange={e => setBlockForm({ ...blockForm, warehouse: e.target.value })}/></div>
              <div><label className="label">Party / Lot</label><input className="input" value={blockForm.party_lot} onChange={e => setBlockForm({ ...blockForm, party_lot: e.target.value })}/></div>
              <div><label className="label">Quantity (M³)</label><input className="input" type="number" value={blockForm.quantity_m3} onChange={e => setBlockForm({ ...blockForm, quantity_m3: e.target.value })}/></div>
              <div><label className="label">Cost</label><input className="input" type="number" value={blockForm.cost} onChange={e => setBlockForm({ ...blockForm, cost: e.target.value })}/></div>
              <div><label className="label">Width (cm)</label><input className="input" type="number" value={blockForm.width_cm} onChange={e => setBlockForm({ ...blockForm, width_cm: e.target.value })}/></div>
              <div><label className="label">Height (cm)</label><input className="input" type="number" value={blockForm.height_cm} onChange={e => setBlockForm({ ...blockForm, height_cm: e.target.value })}/></div>
              <div><label className="label">Length (cm)</label><input className="input" type="number" value={blockForm.length_cm} onChange={e => setBlockForm({ ...blockForm, length_cm: e.target.value })}/></div>
              <div className="col-span-2"><label className="label">Notes</label><textarea className="input min-h-16" value={blockForm.notes} onChange={e => setBlockForm({ ...blockForm, notes: e.target.value })}/></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={saveBlock} disabled={saving} className="btn-primary flex-1">{saving ? 'Saving...' : editBlock ? 'Save changes' : 'Add block'}</button>
              <button onClick={() => setShowBlockModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Block Detail Modal */}
      {selectedBlock && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setSelectedBlock(null)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold">{selectedBlock.material_name}</h3>
                {selectedBlock.material_group && <p className="text-xs text-stone-400">{selectedBlock.material_group}</p>}
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => openEditBlock(selectedBlock)} className="p-1.5 hover:bg-stone-100 rounded-lg text-stone-400"><Edit size={16}/></button>
                <button onClick={() => setSelectedBlock(null)}><X size={18} className="text-stone-400"/></button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm mb-4 bg-stone-50 rounded-lg p-4">
              <div><span className="text-stone-400">Code:</span> <span className="text-stone-800 font-mono">{selectedBlock.code || '—'}</span></div>
              <div><span className="text-stone-400">Warehouse:</span> <span className="text-stone-800">{selectedBlock.warehouse || '—'}</span></div>
              <div><span className="text-stone-400">Party/Lot:</span> <span className="text-stone-800">{selectedBlock.party_lot || '—'}</span></div>
              <div><span className="text-stone-400">Quantity:</span> <span className="text-stone-800">{selectedBlock.quantity_m3 ?? '—'} M³</span></div>
              <div><span className="text-stone-400">Dimensions:</span> <span className="text-stone-800">{selectedBlock.width_cm || '—'}×{selectedBlock.height_cm || '—'}×{selectedBlock.length_cm || '—'} cm</span></div>
              <div><span className="text-stone-400">Cost:</span> <span className="text-stone-800">{selectedBlock.cost ? `${selectedBlock.currency} ${Number(selectedBlock.cost).toLocaleString()}` : '—'}</span></div>
            </div>
            {selectedBlock.reserved_project && (
              <div className="mb-4 px-4 py-3 bg-amber-50 rounded-lg text-sm text-amber-700 flex items-center gap-2">
                <Link2 size={14}/> Reserved for <b>{selectedBlock.reserved_project.name}</b>
              </div>
            )}
            {selectedBlock.notes && <p className="text-xs text-stone-400 italic mb-4">{selectedBlock.notes}</p>}
            <div className="flex flex-wrap gap-2">
              {selectedBlock.status !== 'cut' && (
                <button onClick={() => markBlockCut(selectedBlock)} className="btn-secondary text-sm flex items-center gap-1.5"><Scissors size={13}/> Mark as Cut</button>
              )}
              <button onClick={() => deleteBlock(selectedBlock.id)} className="text-sm text-red-500 hover:text-red-600 flex items-center gap-1.5 ml-auto px-3"><Trash2 size={13}/> Delete</button>
            </div>
          </div>
        </div>
      )}

      {/* Stock Details — client-presentable view */}
      {showStockDetails && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowStockDetails(false)}>
          <div className="bg-white rounded-xl w-full max-w-4xl p-6 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-2xl font-bold text-stone-900">STOCK DETAILS</h2>
              <button onClick={() => setShowStockDetails(false)}><X size={18} className="text-stone-400"/></button>
            </div>
            <p className="text-xs text-stone-400 mb-1">Please contact us to obtain reservation information regarding the stones you have selected.</p>
            <div className="flex items-center justify-between mb-4 mt-2">
              <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide">All Surface Stock Details</p>
              <div className="flex items-center gap-2">
                <select className="input w-auto text-sm" value={stockDetailsSurface} onChange={e => setStockDetailsSurface(e.target.value)}>
                  <option value="all">ALL</option>
                  {Array.from(new Set(slabs.map(s => s.finish).filter(Boolean))).map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <button onClick={exportStockDetailsPdf} disabled={exportingStockPdf} className="btn-secondary text-sm flex items-center gap-1.5">
                  {exportingStockPdf ? 'Exporting...' : 'Export PDF'}
                </button>
              </div>
            </div>

            {(() => {
              const availableSlabs = slabs.filter(s => s.status === 'in_stock' && (stockDetailsSurface === 'all' || s.finish === stockDetailsSurface))
              const totalM2 = availableSlabs.reduce((sum, s) => sum + (s.length_mm && s.width_mm ? (s.length_mm * s.width_mm) / 1000000 : 0), 0)
              return (
                <>
                  <div className="border border-stone-200 rounded-lg overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-stone-200 bg-stone-50">
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-500">Product Name</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-500">Width</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-500">Height</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-500">Surface Type</th>
                          <th className="text-left px-4 py-2.5 text-xs font-semibold text-stone-500">Lot</th>
                          <th className="text-right px-4 py-2.5 text-xs font-semibold text-stone-500">M2</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {availableSlabs.map(s => {
                          const m2 = s.length_mm && s.width_mm ? (s.length_mm * s.width_mm) / 1000000 : null
                          return (
                            <tr key={s.id}>
                              <td className="px-4 py-2.5 text-sm font-medium text-stone-900">{s.material_name}</td>
                              <td className="px-4 py-2.5 text-sm text-stone-600">{s.length_mm || '—'}</td>
                              <td className="px-4 py-2.5 text-sm text-stone-600">{s.width_mm || '—'}</td>
                              <td className="px-4 py-2.5 text-sm text-stone-600">{s.finish || '—'}</td>
                              <td className="px-4 py-2.5 text-sm text-stone-600">{s.lot_number || '—'}</td>
                              <td className="px-4 py-2.5 text-sm text-stone-700 text-right">{m2 ? m2.toFixed(2) : '—'}</td>
                            </tr>
                          )
                        })}
                        {availableSlabs.length === 0 && (
                          <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-stone-400">No matching stock available</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                  <div className="flex justify-end mt-3">
                    <p className="text-sm font-semibold text-stone-900">Stock Sum: {totalM2.toFixed(2)} m²</p>
                  </div>
                </>
              )
            })()}
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => !importing && setShowImportModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold flex items-center gap-2"><FileSpreadsheet size={18} className="text-brand-500"/> Import Preview</h3>
              <button onClick={() => setShowImportModal(false)}><X size={18} className="text-stone-400"/></button>
            </div>
            <p className="text-xs text-stone-400 mb-4">
              {importFileName} — {importRows.length} sample stock lines found
              {importRows.filter(r => r.needsReview).length > 0 && (
                <span className="text-amber-600 ml-1">· {importRows.filter(r => r.needsReview).length} flagged for review (non-numeric quantity in source file)</span>
              )}
            </p>

            <div className="border border-stone-200 rounded-lg overflow-hidden overflow-y-auto max-h-[50vh] mb-4">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-stone-50">
                  <tr className="border-b border-stone-200">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-stone-500">Material</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-stone-500">Finish</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-stone-500">Location</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-stone-500">Qty</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-stone-500">Reorder At</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {importRows.map((r, i) => (
                    <tr key={i} className={r.needsReview ? 'bg-amber-50' : ''}>
                      <td className="px-3 py-1.5 text-stone-900">{r.material_name}</td>
                      <td className="px-3 py-1.5 text-stone-600">{r.finish}</td>
                      <td className="px-3 py-1.5 text-stone-600">{r.location}</td>
                      <td className="px-3 py-1.5 text-right text-stone-600">
                        {r.quantity_on_hand}{r.needsReview && <span className="text-amber-600 ml-1" title="Non-numeric value in source file">⚠</span>}
                      </td>
                      <td className="px-3 py-1.5 text-right text-stone-600">{r.reorder_level}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex gap-2">
              <button onClick={confirmImport} disabled={importing} className="btn-primary flex-1">
                {importing ? 'Importing...' : `Import ${importRows.length} lines`}
              </button>
              <button onClick={() => setShowImportModal(false)} disabled={importing} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Slab Import Preview Modal */}
      {showSlabImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => !slabImporting && setShowSlabImportModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-3xl p-6 max-h-[90vh] overflow-y-auto flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h3 className="text-lg font-semibold flex items-center gap-2"><FileSpreadsheet size={18} className="text-brand-500"/> Import Preview</h3>
              <button onClick={() => setShowSlabImportModal(false)}><X size={18} className="text-stone-400"/></button>
            </div>
            <p className="text-xs text-stone-400 mb-4">
              {slabImportFileName} — {slabImportRows.length} slab stock lines found (M2 rows only — block/other units are skipped here)
            </p>

            <div className="border border-stone-200 rounded-lg overflow-hidden overflow-y-auto max-h-[50vh] mb-4">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-stone-50">
                  <tr className="border-b border-stone-200">
                    <th className="text-left px-3 py-2 text-xs font-semibold text-stone-500">Material</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-stone-500">Finish</th>
                    <th className="text-left px-3 py-2 text-xs font-semibold text-stone-500">Warehouse</th>
                    <th className="text-right px-3 py-2 text-xs font-semibold text-stone-500">Dimensions / Area</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {slabImportRows.slice(0, 300).map((r, i) => (
                    <tr key={i} className={r.reservedCustomer ? 'bg-amber-50' : ''}>
                      <td className="px-3 py-1.5 text-stone-900">{r.material_name}</td>
                      <td className="px-3 py-1.5 text-stone-500">{r.finish || '—'}</td>
                      <td className="px-3 py-1.5 text-stone-600">{r.location}</td>
                      <td className="px-3 py-1.5 text-right text-stone-600">
                        {r.length_mm && r.width_mm ? `${r.length_mm}×${r.width_mm}mm` : r.area_m2 != null ? `${r.area_m2.toFixed(2)} m²` : '—'}
                        {r.reservedCustomer && <span className="text-amber-600 ml-1" title={`Reserved for ${r.reservedCustomer}`}>🔒</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {slabImportRows.length > 300 && (
                <p className="text-xs text-stone-400 text-center py-2 bg-stone-50 border-t border-stone-200">
                  + {slabImportRows.length - 300} more rows not shown here, but will be included in the import
                </p>
              )}
            </div>

            <div className="flex gap-2">
              <button onClick={confirmSlabImport} disabled={slabImporting} className="btn-primary flex-1">
                {slabImporting ? 'Importing...' : `Import ${slabImportRows.length} lines`}
              </button>
              <button onClick={() => setShowSlabImportModal(false)} disabled={slabImporting} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

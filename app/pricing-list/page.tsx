'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import { Tag, Upload, Search, Pencil, Trash2, Plus, X } from 'lucide-react'
import toast from 'react-hot-toast'

export default function PricingListPage() {
  const [prices, setPrices] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)

  const [importRows, setImportRows] = useState<any[]>([])
  const [importFileName, setImportFileName] = useState('')
  const [showImportPreview, setShowImportPreview] = useState(false)
  const [importing, setImporting] = useState(false)

  const [showEditModal, setShowEditModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState({ material_name: '', finish: '', thickness_mm: '', price_tier: 'retail', price_per_m2: '', currency: 'GBP', supplier: '', notes: '' })

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    const [priceRes, userRes] = await Promise.all([
      supabase.from('pricing_list').select('*').order('material_name'),
      user ? supabase.from('users').select('*').eq('id', user.id).single() : Promise.resolve({ data: null }),
    ])
    setPrices(priceRes.data || [])
    setCurrentUser(userRes.data)
    setLoading(false)
  }

  // ── EXCEL SYNC ──
  // Handles two formats:
  // 1. Turkish wholesale/retail slab price lists (PERAKENDE / TOPTAN
  //    sheets), where the header row has a "PLAKA" (slab) price column
  //    and the material name sits in the column immediately to its left.
  // 2. Simple English sheets with plain MATERIAL/NAME + PRICE columns.
  async function handleImportFile(file: File) {
    setImportFileName(file.name)
    const XLSX = await import('xlsx')
    const buffer = await file.arrayBuffer()
    const wb = XLSX.read(buffer, { type: 'array' })

    const allParsed: any[] = []

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName]
      const rows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })
      if (rows.length === 0) continue

      const upperSheetName = sheetName.trim().toUpperCase()
      const sheetTier = upperSheetName.includes('TOPTAN') ? 'wholesale' : upperSheetName.includes('PERAKENDE') ? 'retail' : null

      // Try the PLAKA-anchored format first (real Turkish price lists)
      let headerIdx = -1
      let plakaCol = -1
      let nameCol = -1
      let notesCol = -1
      for (let i = 0; i < Math.min(rows.length, 10); i++) {
        const row = rows[i].map((c: any) => String(c).trim().toUpperCase())
        const idx = row.findIndex(c => c === 'PLAKA')
        if (idx > 0) {
          headerIdx = i
          plakaCol = idx
          nameCol = idx - 1
          notesCol = row.findIndex(c => c.includes('BİLGİLER') || c.includes('BILGILER'))
          break
        }
      }

      // Detect currency from the header text itself, e.g. "(EURO)"
      const headerText = rows.slice(0, Math.min(rows.length, 5)).flat().join(' ').toUpperCase()
      const currency = headerText.includes('EURO') || headerText.includes('EUR') ? 'EUR'
        : headerText.includes('USD') || headerText.includes('DOLAR') ? 'USD'
        : headerText.includes('GBP') || headerText.includes('£') ? 'GBP' : 'GBP'

      if (headerIdx !== -1) {
        for (let r = headerIdx + 1; r < rows.length; r++) {
          const row = rows[r]
          const name = String(row[nameCol] ?? '').trim()
          const price = Number(row[plakaCol])
          if (!name || !price || isNaN(price)) continue // skip category-divider rows and blanks
          allParsed.push({
            material_name: name,
            finish: '',
            thickness_mm: 0,
            price_tier: sheetTier || 'retail',
            price_per_m2: price,
            currency,
            supplier: '',
            notes: notesCol !== -1 ? String(row[notesCol] ?? '').trim() || null : null,
          })
        }
        continue
      }

      // Fallback: simple MATERIAL/NAME + PRICE column format
      let colMap: Record<string, number> = {}
      let simpleHeaderIdx = -1
      for (let i = 0; i < Math.min(rows.length, 15); i++) {
        const row = rows[i].map((c: any) => String(c).trim().toUpperCase())
        const nameIdx = row.findIndex(c => c === 'MATERIAL' || c === 'NAME' || c === 'MATERIAL NAME')
        const priceIdx = row.findIndex(c => c.includes('PRICE'))
        if (nameIdx !== -1 && priceIdx !== -1) {
          simpleHeaderIdx = i
          row.forEach((c, idx) => { colMap[c] = idx })
          break
        }
      }
      if (simpleHeaderIdx === -1) continue

      const nameKey = 'MATERIAL' in colMap ? 'MATERIAL' : 'NAME' in colMap ? 'NAME' : 'MATERIAL NAME'
      const priceKey = Object.keys(colMap).find(k => k.includes('PRICE'))!

      rows.slice(simpleHeaderIdx + 1).forEach(row => {
        const name = String(row[colMap[nameKey]] || '').trim()
        if (!name) return
        allParsed.push({
          material_name: name,
          finish: String(row[colMap['FINISH']] ?? '').trim(),
          thickness_mm: Number(row[colMap['THICKNESS']] ?? row[colMap['THICKNESS (MM)']] ?? 0) || 0,
          price_tier: 'retail',
          price_per_m2: Number(row[colMap[priceKey]]) || 0,
          currency: String(row[colMap['CURRENCY']] || 'GBP').trim() || 'GBP',
          supplier: String(row[colMap['SUPPLIER']] || '').trim(),
        })
      })
    }

    if (allParsed.length === 0) {
      toast.error('Could not find a recognisable price list in this file — checked for a "PLAKA" column and a MATERIAL/PRICE header, found neither')
      return
    }
    setImportRows(allParsed)
    setShowImportPreview(true)
  }

  async function confirmImport() {
    setImporting(true)
    const batchSize = 100
    let failed = 0
    for (let i = 0; i < importRows.length; i += batchSize) {
      const batch = importRows.slice(i, i + batchSize)
      const { error } = await supabase.from('pricing_list').upsert(batch, { onConflict: 'material_name,finish,thickness_mm,price_tier' })
      if (error) failed++
    }
    setImporting(false)
    setShowImportPreview(false)
    setImportRows([])
    if (failed > 0) toast.error(`${failed} batch(es) failed to import`)
    else toast.success(`Synced ${importRows.length} price entries`)
    loadAll()
  }

  // ── MANUAL ADD/EDIT ──
  function openAdd() {
    setEditingId(null)
    setForm({ material_name: '', finish: '', thickness_mm: '', price_tier: 'retail', price_per_m2: '', currency: 'GBP', supplier: '', notes: '' })
    setShowEditModal(true)
  }

  function openEdit(p: any) {
    setEditingId(p.id)
    setForm({
      material_name: p.material_name, finish: p.finish || '', thickness_mm: String(p.thickness_mm || ''),
      price_tier: p.price_tier || 'retail', price_per_m2: String(p.price_per_m2 || ''), currency: p.currency, supplier: p.supplier || '', notes: p.notes || '',
    })
    setShowEditModal(true)
  }

  async function saveEntry() {
    if (!form.material_name.trim()) { toast.error('Material name is required'); return }
    const payload = {
      material_name: form.material_name.trim(), finish: form.finish.trim(),
      thickness_mm: Number(form.thickness_mm) || 0, price_tier: form.price_tier,
      price_per_m2: Number(form.price_per_m2) || null,
      currency: form.currency || 'GBP', supplier: form.supplier.trim() || null, notes: form.notes.trim() || null,
    }
    const { error } = editingId
      ? await supabase.from('pricing_list').update(payload).eq('id', editingId)
      : await supabase.from('pricing_list').upsert(payload, { onConflict: 'material_name,finish,thickness_mm,price_tier' })
    if (error) { toast.error(error.message); return }
    toast.success(editingId ? 'Price updated' : 'Price added')
    setShowEditModal(false)
    loadAll()
  }

  async function deleteEntry(id: string) {
    if (!confirm('Delete this price entry?')) return
    await supabase.from('pricing_list').delete().eq('id', id)
    toast.success('Deleted')
    loadAll()
  }

  const [tierFilter, setTierFilter] = useState<'all' | 'retail' | 'wholesale'>('all')

  const filtered = prices.filter(p =>
    (tierFilter === 'all' || p.price_tier === tierFilter) &&
    (!search || `${p.material_name} ${p.finish} ${p.supplier}`.toLowerCase().includes(search.toLowerCase()))
  )

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-1 flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <Tag size={20} className="text-brand-500"/>
          <h1 className="text-xl font-semibold text-stone-900">Pricing List</h1>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={openAdd} className="btn-secondary text-sm flex items-center gap-1.5"><Plus size={14}/> Add Price</button>
          <label className="btn-primary text-sm flex items-center gap-1.5 cursor-pointer">
            <Upload size={14}/> Sync Excel
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => e.target.files?.[0] && handleImportFile(e.target.files[0])}/>
          </label>
        </div>
      </div>
      <p className="text-sm text-stone-500 mb-6">Reference pricing for materials — re-sync the Excel any time to update prices in bulk</p>

      <div className="flex items-center gap-2 mb-4">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/>
          <input className="input pl-9" placeholder="Search material, finish, or supplier…" value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        <select className="input w-auto" value={tierFilter} onChange={e => setTierFilter(e.target.value as any)}>
          <option value="all">All prices</option>
          <option value="retail">Retail</option>
          <option value="wholesale">Wholesale</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-16 text-center">
          <Tag size={32} className="text-stone-300 mx-auto mb-3"/>
          <p className="text-stone-400 text-sm mb-4">{prices.length === 0 ? 'No pricing synced yet' : 'No prices match your search'}</p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          {/* Mobile: card list instead of a wide scrolling table */}
          <div className="md:hidden divide-y divide-stone-100">
            {filtered.map(p => (
              <div key={p.id} className="p-3 flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-stone-900 truncate">{p.material_name}</p>
                  <p className="text-xs text-stone-500 mt-0.5 truncate">
                    {p.finish || '—'}{p.thickness_mm ? ` · ${p.thickness_mm}mm` : ''}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                    <span className="badge text-[10px]" style={{ background: p.price_tier === 'wholesale' ? '#EFF6FF' : '#ECFDF5', color: p.price_tier === 'wholesale' ? '#2563EB' : '#059669' }}>
                      {p.price_tier === 'wholesale' ? 'Wholesale' : 'Retail'}
                    </span>
                    {p.supplier && <span className="text-[11px] text-stone-400 truncate">{p.supplier}</span>}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-stone-800">{p.price_per_m2 ? `${p.currency} ${Number(p.price_per_m2).toLocaleString()}` : '—'}</p>
                  <p className="text-[11px] text-stone-400 mt-0.5">{p.updated_at ? format(parseISO(p.updated_at), 'd MMM yyyy') : '—'}</p>
                  <div className="flex items-center gap-1 mt-1.5 justify-end">
                    <button onClick={() => openEdit(p)} className="p-1 hover:bg-stone-100 rounded text-stone-400 hover:text-stone-600"><Pencil size={13}/></button>
                    <button onClick={() => deleteEntry(p.id)} className="p-1 hover:bg-red-50 rounded text-stone-400 hover:text-red-500"><Trash2 size={13}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop: full table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Material</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Finish</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Thickness</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Price / m²</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Tier</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Supplier</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-stone-500 uppercase tracking-wide">Updated</th>
                  <th></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-50">
                {filtered.map(p => (
                  <tr key={p.id} className="hover:bg-stone-50 group">
                    <td className="px-4 py-2.5 font-medium text-stone-900">{p.material_name}</td>
                    <td className="px-4 py-2.5 text-stone-600">{p.finish || '—'}</td>
                    <td className="px-4 py-2.5 text-stone-600">{p.thickness_mm ? `${p.thickness_mm}mm` : '—'}</td>
                    <td className="px-4 py-2.5 font-medium text-stone-800">{p.price_per_m2 ? `${p.currency} ${Number(p.price_per_m2).toLocaleString()}` : '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="badge text-xs" style={{ background: p.price_tier === 'wholesale' ? '#EFF6FF' : '#ECFDF5', color: p.price_tier === 'wholesale' ? '#2563EB' : '#059669' }}>
                        {p.price_tier === 'wholesale' ? 'Wholesale' : 'Retail'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-stone-500">{p.supplier || '—'}</td>
                    <td className="px-4 py-2.5 text-stone-400 text-xs">{p.updated_at ? format(parseISO(p.updated_at), 'd MMM yyyy') : '—'}</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity justify-end">
                        <button onClick={() => openEdit(p)} className="p-1 hover:bg-stone-100 rounded text-stone-400 hover:text-stone-600"><Pencil size={13}/></button>
                        <button onClick={() => deleteEntry(p.id)} className="p-1 hover:bg-red-50 rounded text-stone-400 hover:text-red-500"><Trash2 size={13}/></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Import Preview Modal */}
      {showImportPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }}>
          <div className="bg-white rounded-xl w-full max-w-2xl max-h-[85vh] flex flex-col">
            <div className="p-5 border-b border-stone-100 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-stone-900">Confirm Import</h3>
                <p className="text-xs text-stone-400 mt-0.5">{importFileName} — {importRows.length} rows found</p>
              </div>
              <button onClick={() => setShowImportPreview(false)}><X size={18} className="text-stone-400"/></button>
            </div>
            <div className="overflow-auto flex-1 p-5">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-stone-200">
                    <th className="text-left py-2 text-stone-400 font-semibold uppercase">Material</th>
                    <th className="text-left py-2 text-stone-400 font-semibold uppercase">Finish</th>
                    <th className="text-left py-2 text-stone-400 font-semibold uppercase">Thickness</th>
                    <th className="text-left py-2 text-stone-400 font-semibold uppercase">Tier</th>
                    <th className="text-left py-2 text-stone-400 font-semibold uppercase">Price</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-50">
                  {importRows.slice(0, 300).map((r, i) => (
                    <tr key={i}>
                      <td className="py-1.5">{r.material_name}</td>
                      <td className="py-1.5 text-stone-500">{r.finish || '—'}</td>
                      <td className="py-1.5 text-stone-500">{r.thickness_mm ? `${r.thickness_mm}mm` : '—'}</td>
                      <td className="py-1.5 text-stone-500 capitalize">{r.price_tier}</td>
                      <td className="py-1.5 text-stone-700">{r.currency} {r.price_per_m2}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {importRows.length > 300 && <p className="text-xs text-stone-400 mt-2">+{importRows.length - 300} more not shown in preview</p>}
            </div>
            <div className="p-5 border-t border-stone-100 flex gap-2">
              <button onClick={confirmImport} disabled={importing} className="btn-primary flex-1">
                {importing ? 'Importing…' : `Sync ${importRows.length} entries`}
              </button>
              <button onClick={() => setShowImportPreview(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setShowEditModal(false)}>
          <div className="bg-white rounded-xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-900 mb-4">{editingId ? 'Edit Price' : 'Add Price'}</h3>
            <div className="space-y-3">
              <div><label className="label">Material Name</label><input className="input" value={form.material_name} onChange={e => setForm({ ...form, material_name: e.target.value })}/></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Finish</label><input className="input" value={form.finish} onChange={e => setForm({ ...form, finish: e.target.value })}/></div>
                <div><label className="label">Thickness (mm)</label><input type="number" className="input" value={form.thickness_mm} onChange={e => setForm({ ...form, thickness_mm: e.target.value })}/></div>
              </div>
              <div>
                <label className="label">Price Tier</label>
                <select className="input" value={form.price_tier} onChange={e => setForm({ ...form, price_tier: e.target.value })}>
                  <option value="retail">Retail</option>
                  <option value="wholesale">Wholesale</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="label">Price per m²</label><input type="number" className="input" value={form.price_per_m2} onChange={e => setForm({ ...form, price_per_m2: e.target.value })}/></div>
                <div><label className="label">Currency</label><input className="input" value={form.currency} onChange={e => setForm({ ...form, currency: e.target.value })}/></div>
              </div>
              <div><label className="label">Supplier</label><input className="input" value={form.supplier} onChange={e => setForm({ ...form, supplier: e.target.value })}/></div>
              <div><label className="label">Notes</label><textarea className="input min-h-16" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></div>
            </div>
            <div className="flex gap-2 mt-5">
              <button onClick={saveEntry} className="btn-primary flex-1">{editingId ? 'Save' : 'Add'}</button>
              <button onClick={() => setShowEditModal(false)} className="btn-secondary">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

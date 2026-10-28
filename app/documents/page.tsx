'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO } from 'date-fns'
import {
  FileText, Upload, Search, Download, Trash2, Image as ImageIcon, File as FileIcon, FileSpreadsheet,
  ChevronDown, ChevronRight, FolderOpen, Folder, Receipt, ClipboardList, Package, MessageSquare, Building2
} from 'lucide-react'
import toast from 'react-hot-toast'

// Same categories as the individual project page — kept in sync so a
// document filed under "Invoices" there shows under "Invoices" here too.
const DOC_CATEGORIES: { value: string; label: string; icon: any }[] = [
  { value: 'drawing',         label: 'Drawings',        icon: FileText },
  { value: 'photo',           label: 'Images',          icon: ImageIcon },
  { value: 'invoice',         label: 'Invoices',        icon: Receipt },
  { value: 'quotation',       label: 'Quotations',      icon: ClipboardList },
  { value: 'purchase_order',  label: 'Purchase Orders', icon: Package },
  { value: 'meeting_minutes', label: 'Meeting Minutes', icon: MessageSquare },
  { value: 'other',           label: 'Other',           icon: FileIcon },
]

function fileIcon(type: string) {
  if (type?.includes('image')) return <ImageIcon size={16} className="text-blue-500 flex-shrink-0"/>
  if (type?.includes('sheet') || type?.includes('excel') || type?.includes('csv')) return <FileSpreadsheet size={16} className="text-green-500 flex-shrink-0"/>
  if (type?.includes('pdf')) return <FileText size={16} className="text-red-500 flex-shrink-0"/>
  return <FileIcon size={16} className="text-stone-400 flex-shrink-0"/>
}

function formatSize(bytes: number) {
  if (!bytes) return ''
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + 'KB'
  return (bytes / (1024 * 1024)).toFixed(1) + 'MB'
}

export default function DocumentsPage() {
  const [docs, setDocs] = useState<any[]>([])
  const [projects, setProjects] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [search, setSearch] = useState('')
  const [currentUser, setCurrentUser] = useState<any>(null)
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set())
  const [openSubfolders, setOpenSubfolders] = useState<Set<string>>(new Set())
  const [docTab, setDocTab] = useState<'projects' | 'sales'>('projects')
  const [uploadingTo, setUploadingTo] = useState<string | null>(null)
  const [uploadCategory, setUploadCategory] = useState('other')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    const { data: { user } } = await supabase.auth.getUser()
    const [docsRes, projRes, meRes] = await Promise.all([
      supabase.from('documents').select('*, project:projects(id,name), uploaded_by:users!uploaded_by_id(full_name,color)').order('created_at', { ascending: false }),
      supabase.from('projects').select('id,name').order('name'),
      supabase.from('users').select('*').eq('id', user?.id || '').single(),
    ])
    setDocs(docsRes.data || [])
    setProjects(projRes.data || [])
    setCurrentUser(meRes.data)
    // All folders start collapsed — just the folder list shows first,
    // click a project to open it, then click a category to see files.
    setOpenFolders(new Set())
    setLoading(false)
  }

  async function openDocument(doc: any) {
    if (!doc.file_url) return
    const match = doc.file_url.match(/\/storage\/v1\/object\/public\/documents\/(.+)/)
    if (match) {
      const { data } = await supabase.storage.from('documents').createSignedUrl(match[1], 3600)
      if (data?.signedUrl) { window.open(data.signedUrl, '_blank'); return }
    }
    window.open(doc.file_url, '_blank')
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>, projectId?: string, category?: string) {
    const files = Array.from(e.target.files || [])
    if (!files.length || !currentUser) return
    setUploading(true)
    setUploadingTo(projectId || null)
    for (const file of files) {
      const path = (projectId || 'general') + '/' + Date.now() + '-' + file.name.replace(/\s/g, '_')
      const { error: upErr } = await supabase.storage.from('documents').upload(path, file)
      if (upErr) { toast.error(upErr.message); continue }
      const urlResult = supabase.storage.from('documents').getPublicUrl(path)
      const publicUrl = urlResult.data.publicUrl
      await supabase.from('documents').insert({
        project_id: projectId || null, name: file.name,
        file_url: publicUrl, file_type: file.type,
        file_size: file.size, uploaded_by_id: currentUser.id, category: category || uploadCategory
      })
    }
    toast.success(files.length + ' file' + (files.length > 1 ? 's' : '') + ' uploaded')
    setUploading(false)
    setUploadingTo(null)
    loadAll()
    e.target.value = ''
  }

  async function deleteDoc(doc: any) {
    if (!confirm('Delete "' + doc.name + '"?')) return
    await supabase.from('documents').delete().eq('id', doc.id)
    toast.success('Deleted')
    loadAll()
  }

  async function updateCategory(id: string, category: string) {
    await supabase.from('documents').update({ category }).eq('id', id)
    loadAll()
  }

  function toggleFolder(id: string) {
    setOpenFolders(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSubfolder(key: string) {
    setOpenSubfolders(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  // Group docs by project
  const projectsWithDocs = projects.map(p => ({
    ...p,
    docs: docs.filter(d => d.project_id === p.id)
  })).filter(p => p.docs.length > 0)

  const noDocs = docs.filter(d => !d.project_id)

  // Apply search
  const filterDocs = (docList: any[]) =>
    search ? docList.filter(d => d.name.toLowerCase().includes(search.toLowerCase())) : docList

  const totalDocs = docs.length

  // Renders the category subfolders for a given set of documents — shared
  // between project folders and the "no project" folder so both get the
  // same Drawings/Images/Invoices/etc. breakdown.
  function renderCategorySubfolders(docList: any[], keyPrefix: string, projectId?: string) {
    const byCategory = DOC_CATEGORIES
      .map(cat => ({ ...cat, items: filterDocs(docList.filter(d => (d.category || 'other') === cat.value)) }))
      .filter(cat => cat.items.length > 0)

    if (byCategory.length === 0) {
      return <p className="px-4 py-4 text-xs text-stone-400 text-center">No files match your search</p>
    }

    return byCategory.map(cat => {
      const subKey = keyPrefix + ':' + cat.value
      const isSubOpen = openSubfolders.has(subKey) || search.length > 0
      const Icon = cat.icon
      return (
        <div key={subKey} className="border-b border-stone-50 last:border-b-0">
          <div className="flex items-center gap-2.5 pl-9 pr-4 py-2 cursor-pointer hover:bg-stone-50 transition-colors"
            onClick={() => toggleSubfolder(subKey)}>
            <Icon size={14} className="text-stone-400 flex-shrink-0"/>
            <span className="text-sm text-stone-700 flex-1">{cat.label}</span>
            <span className="text-xs text-stone-400">{cat.items.length}</span>
            {isSubOpen ? <ChevronDown size={14} className="text-stone-400"/> : <ChevronRight size={14} className="text-stone-400"/>}
          </div>
          {isSubOpen && (
            <div className="divide-y divide-stone-50 bg-stone-50/40">
              {cat.items.map((doc: any) => (
                <div key={doc.id} className="flex items-center gap-3 pl-16 pr-4 py-2 hover:bg-stone-50 group transition-colors">
                  {fileIcon(doc.file_type)}
                  <button onClick={() => openDocument(doc)}
                    className="flex-1 text-sm text-stone-800 hover:text-brand-600 text-left truncate font-medium transition-colors">
                    {doc.name}
                  </button>
                  <span className="text-xs text-stone-400 hidden md:block flex-shrink-0">{formatSize(doc.file_size)}</span>
                  <span className="text-xs text-stone-400 hidden md:block flex-shrink-0">{format(parseISO(doc.created_at), 'd MMM yyyy')}</span>
                  <select
                    className="text-xs border border-stone-200 rounded px-1 py-0.5 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity flex-shrink-0"
                    value={doc.category || 'other'}
                    onChange={e => updateCategory(doc.id, e.target.value)}
                    title="Move to a different category">
                    {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                  </select>
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                    <button onClick={() => openDocument(doc)} className="p-1 hover:bg-stone-100 rounded text-stone-400 hover:text-stone-600">
                      <Download size={13}/>
                    </button>
                    <button onClick={() => deleteDoc(doc)} className="p-1 hover:bg-red-50 rounded text-stone-400 hover:text-red-500">
                      <Trash2 size={13}/>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )
    })
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <h1 className="text-xl font-semibold text-stone-900">Documents</h1>
        <div className="flex items-center gap-2">
          <select className="input py-1.5 text-sm w-auto" value={uploadCategory} onChange={e => setUploadCategory(e.target.value)}>
            {DOC_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
          <label className={'btn-primary flex items-center gap-2 cursor-pointer ' + (uploading ? 'opacity-60 pointer-events-none' : '')}>
            <Upload size={14}/> {uploading ? 'Uploading…' : 'Upload'}
            <input type="file" multiple className="hidden" onChange={e => handleUpload(e, docTab === 'sales' ? undefined : undefined, uploadCategory)}/>
          </label>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b border-stone-200">
        <button
          onClick={() => setDocTab('projects')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${docTab === 'projects' ? 'border-brand-600 text-brand-700' : 'border-transparent text-stone-500 hover:text-stone-700'}`}>
          <FolderOpen size={15}/> Project Documents
          <span className="text-xs text-stone-400">({docs.filter(d => d.project_id).length})</span>
        </button>
        <button
          onClick={() => setDocTab('sales')}
          className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${docTab === 'sales' ? 'border-brand-600 text-brand-700' : 'border-transparent text-stone-500 hover:text-stone-700'}`}>
          <Building2 size={15}/> Sales Documents
          <span className="text-xs text-stone-400">({docs.filter(d => !d.project_id).length})</span>
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/>
        <input className="input pl-9" placeholder="Search files…" value={search} onChange={e => setSearch(e.target.value)}/>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
        </div>
      ) : docTab === 'projects' ? (
        /* PROJECT DOCUMENTS — grouped by project */
        <>
          {totalDocs === 0 ? (
            <div className="card py-20 text-center">
              <FileText size={36} className="text-stone-300 mx-auto mb-3"/>
              <p className="text-stone-400 text-sm mb-4">No project documents yet</p>
            </div>
          ) : (
            projectsWithDocs.length === 0 ? (
              <div className="card py-20 text-center">
                <FileText size={36} className="text-stone-300 mx-auto mb-3"/>
                <p className="text-stone-400 text-sm">No results</p>
              </div>
            ) : (
              <div className="space-y-2">
                {projectsWithDocs.map((p) => {
                  const isOpen = openFolders.has(p.id)
                  const pDocs = p.docs
                  return (
                    <div key={p.id} className="card overflow-hidden">
                      <button onClick={() => {
                        const next = new Set(openFolders)
                        isOpen ? next.delete(p.id) : next.add(p.id)
                        setOpenFolders(next)
                      }} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-stone-50 transition-colors text-left">
                        {isOpen ? <FolderOpen size={18} className="text-brand-500 flex-shrink-0"/> : <Folder size={18} className="text-stone-400 flex-shrink-0"/>}
                        <span className="font-medium text-stone-900 text-sm flex-1">{p.name}</span>
                        <span className="text-xs text-stone-400 mr-2">{pDocs.length} file{pDocs.length !== 1 ? 's' : ''}</span>
                        {isOpen ? <ChevronDown size={16} className="text-stone-400"/> : <ChevronRight size={16} className="text-stone-400"/>}
                      </button>
                      {isOpen && (
                        <div className="border-t border-stone-100 px-4 py-3">
                          <div className="flex items-center justify-between mb-3">
                            <label className="btn-secondary text-xs flex items-center gap-1.5 cursor-pointer">
                              <Upload size={12}/> Upload to {p.name}
                              <input type="file" multiple className="hidden" onChange={e => handleUpload(e, p.id, uploadCategory)}/>
                            </label>
                          </div>
                          {renderCategorySubfolders(pDocs, p.id, p.id)}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          )}
        </>
      ) : (
        /* SALES DOCUMENTS — not linked to a project */
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-stone-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Building2 size={16} className="text-stone-400"/>
              <span className="text-sm font-semibold text-stone-900">Sales Documents</span>
              <span className="text-xs text-stone-400">{docs.filter(d => !d.project_id).length} files</span>
            </div>
            <label className="btn-secondary text-xs flex items-center gap-1.5 cursor-pointer">
              <Upload size={12}/> Upload
              <input type="file" multiple className="hidden" onChange={e => handleUpload(e, undefined, uploadCategory)}/>
            </label>
          </div>
          <div className="px-4 py-3">
            {renderCategorySubfolders(docs.filter(d => !d.project_id), 'sales')}
            {docs.filter(d => !d.project_id).length === 0 && (
              <div className="py-12 text-center">
                <Building2 size={32} className="text-stone-200 mx-auto mb-3"/>
                <p className="text-sm text-stone-400 mb-3">No sales documents yet</p>
                <label className="btn-primary inline-flex items-center gap-2 cursor-pointer text-sm">
                  <Upload size={14}/> Upload first sales document
                  <input type="file" multiple className="hidden" onChange={e => handleUpload(e, undefined, uploadCategory)}/>
                </label>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

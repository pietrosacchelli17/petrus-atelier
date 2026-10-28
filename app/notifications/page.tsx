'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO, differenceInDays } from 'date-fns'
import { Bell, Check, Trash2, AlertTriangle, Clock, CheckCircle, FolderOpen } from 'lucide-react'
import toast from 'react-hot-toast'
import Link from 'next/link'

const TYPE_CONFIG: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  task_overdue:  { icon: AlertTriangle, color: '#EF4444', bg: '#FEF2F2', label: 'Overdue' },
  task_due:      { icon: Clock,         color: '#F59E0B', bg: '#FFFBEB', label: 'Due soon' },
  task_assigned: { icon: CheckCircle,   color: '#10B981', bg: '#ECFDF5', label: 'Task' },
  project_update:{ icon: FolderOpen,    color: '#6366F1', bg: '#EEF2FF', label: 'Project' },
  mention:       { icon: Bell,          color: '#8B5CF6', bg: '#F5F3FF', label: 'Mention' },
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'unread' | 'overdue' | 'upcoming'>('all')

  useEffect(() => { loadNotifications() }, [])

  async function loadNotifications() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('notifications')
      .select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(100)
    setNotifications(data || [])
    setLoading(false)
  }

  async function markAllRead() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('notifications').update({ read: true }).eq('user_id', user.id).eq('read', false)
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
    toast.success('All marked as read')
  }

  async function markRead(id: string) {
    await supabase.from('notifications').update({ read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n))
  }

  async function deleteNotification(id: string) {
    await supabase.from('notifications').delete().eq('id', id)
    setNotifications(prev => prev.filter(n => n.id !== id))
  }

  async function clearAll() {
    if (!confirm('Clear all notifications?')) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('notifications').delete().eq('user_id', user.id)
    setNotifications([])
    toast.success('All cleared')
  }

  const filtered = notifications.filter(n => {
    if (filter === 'unread') return !n.read
    if (filter === 'overdue') return n.type === 'task_overdue'
    if (filter === 'upcoming') return n.type === 'task_due'
    return true
  })

  const unread = notifications.filter(n => !n.read).length
  const overdue = notifications.filter(n => n.type === 'task_overdue').length
  const upcoming = notifications.filter(n => n.type === 'task_due').length

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-xl font-semibold text-stone-900">Notifications</h1>
          <p className="text-sm text-stone-500 mt-0.5">
            {unread > 0 ? `${unread} unread` : 'All caught up'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {unread > 0 && (
            <button onClick={markAllRead} className="btn-secondary flex items-center gap-2 text-sm py-1.5">
              <Check size={14}/> Mark all read
            </button>
          )}
          {notifications.length > 0 && (
            <button onClick={clearAll} className="btn-secondary text-sm py-1.5 text-red-500 hover:bg-red-50">
              Clear all
            </button>
          )}
        </div>
      </div>

      {/* Summary chips */}
      {notifications.length > 0 && (
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          {[
            { id: 'all',      label: `All (${notifications.length})`,   color: '' },
            { id: 'unread',   label: `Unread (${unread})`,              color: 'text-brand-600' },
            { id: 'overdue',  label: `🔴 Overdue (${overdue})`,         color: 'text-red-600' },
            { id: 'upcoming', label: `🟡 Due soon (${upcoming})`,       color: 'text-amber-600' },
          ].map(f => (
            <button key={f.id} onClick={() => setFilter(f.id as any)}
              className={`text-xs px-3 py-1.5 rounded-full border font-medium transition-all
                ${filter === f.id
                  ? 'bg-stone-900 text-white border-stone-900'
                  : `bg-white border-stone-200 hover:border-stone-300 ${f.color}`}`}>
              {f.label}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"/>
        </div>
      ) : filtered.length === 0 ? (
        <div className="card py-20 text-center">
          <Bell size={36} className="text-stone-300 mx-auto mb-3"/>
          <p className="text-stone-400 text-sm">
            {filter === 'all' ? 'No notifications yet' : `No ${filter} notifications`}
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-stone-50 overflow-hidden">
          {filtered.map(n => {
            const tc = TYPE_CONFIG[n.type] || TYPE_CONFIG.project_update
            const Icon = tc.icon
            return (
              <div key={n.id}
                className={`flex items-start gap-3 p-4 group transition-colors
                  ${!n.read ? 'bg-amber-50/30' : 'hover:bg-stone-50'}
                  ${n.type === 'task_overdue' && !n.read ? 'bg-red-50/40' : ''}`}>
                {/* Icon */}
                <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: tc.bg }}>
                  <Icon size={15} style={{ color: tc.color }}/>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0 cursor-pointer" onClick={() => markRead(n.id)}>
                  <div className="flex items-start gap-2">
                    <p className={`text-sm flex-1 ${!n.read ? 'font-semibold text-stone-900' : 'font-medium text-stone-600'}`}>
                      {n.title}
                    </p>
                    {!n.read && <div className="w-2 h-2 rounded-full bg-brand-500 flex-shrink-0 mt-1.5"/>}
                  </div>
                  <p className="text-xs text-stone-400 mt-0.5 leading-relaxed">{n.body}</p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <p className="text-xs text-stone-300">{format(parseISO(n.created_at), 'HH:mm · d MMM yyyy')}</p>
                    {n.link && (
                      <Link href={n.link} onClick={e => e.stopPropagation()}
                        className="text-xs text-brand-600 hover:underline">
                        View project →
                      </Link>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                  {!n.read && (
                    <button onClick={() => markRead(n.id)} title="Mark read"
                      className="p-1.5 hover:bg-stone-100 rounded text-stone-400 hover:text-brand-600">
                      <Check size={13}/>
                    </button>
                  )}
                  <button onClick={() => deleteNotification(n.id)} title="Delete"
                    className="p-1.5 hover:bg-red-50 rounded text-stone-400 hover:text-red-500">
                    <Trash2 size={13}/>
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

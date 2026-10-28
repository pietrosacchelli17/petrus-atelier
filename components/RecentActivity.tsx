'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { format, parseISO, isPast, isToday, differenceInDays } from 'date-fns'
import { Activity, AlertCircle } from 'lucide-react'

export default function RecentActivity() {
  const [quoteDeadlines, setQuoteDeadlines] = useState<any[]>([])
  const [activity, setActivity] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      // Quote deadlines — deals with closing_date set, not yet won/lost
      const { data: deals } = await supabase
        .from('sales_pipeline')
        .select('id, name, client, closing_date, stage, account_manager:users!account_manager_id(full_name, color)')
        .not('closing_date', 'is', null)
        .not('stage', 'in', '("closed_won","closed_lost")')
        .order('closing_date', { ascending: true })
        .limit(10)

      // Recent activity across all projects — last 20 entries
      const { data: logs } = await supabase
        .from('activity_log')
        .select('*, user:users(*), project:projects(name)')
        .order('created_at', { ascending: false })
        .limit(15)

      setQuoteDeadlines(deals || [])
      setActivity(logs || [])
      setLoading(false)
    }
    load()
  }, [])

  if (loading) return null

  const hasDeadlines = quoteDeadlines.length > 0
  const hasActivity = activity.length > 0
  if (!hasDeadlines && !hasActivity) return null

  return (
    <div className="space-y-4">

      {/* Quote deadlines */}
      {hasDeadlines && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-2">
            <AlertCircle size={15} className="text-amber-500"/>
            <h2 className="text-sm font-semibold text-stone-900">Quote Deadlines</h2>
            <span className="text-xs text-stone-400 ml-auto">Closing dates for open quotes</span>
          </div>
          <div className="divide-y divide-stone-50">
            {quoteDeadlines.map(deal => {
              const date = parseISO(deal.closing_date)
              const overdue = isPast(date) && !isToday(date)
              const today = isToday(date)
              const daysLeft = differenceInDays(date, new Date())
              const urgent = daysLeft <= 7 && daysLeft >= 0

              return (
                <div key={deal.id} className="flex items-center gap-3 px-5 py-2.5">
                  {/* AM avatar */}
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0"
                    style={{ background: deal.account_manager?.color || '#7D8C74' }}>
                    {deal.account_manager?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0,2) || '?'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-stone-900 truncate">{deal.name}</p>
                    <p className="text-xs text-stone-400 truncate">{deal.client}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className={`text-xs font-medium ${overdue ? 'text-red-500' : today ? 'text-amber-500' : urgent ? 'text-amber-400' : 'text-stone-500'}`}>
                      {overdue ? `${Math.abs(daysLeft)}d overdue` : today ? 'Today' : `in ${daysLeft}d`}
                    </p>
                    <p className="text-xs text-stone-400">{format(date, 'd MMM')}</p>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Recent activity across projects */}
      {hasActivity && (
        <div className="bg-white rounded-xl border border-stone-200 shadow-sm overflow-hidden">
          <div className="px-5 py-3 border-b border-stone-100 flex items-center gap-2">
            <Activity size={15} className="text-stone-400"/>
            <h2 className="text-sm font-semibold text-stone-900">Recent Activity</h2>
            <span className="text-xs text-stone-400 ml-auto">Latest changes across all projects</span>
          </div>
          <div className="divide-y divide-stone-50 max-h-80 overflow-y-auto">
            {activity.map(item => (
              <div key={item.id} className="flex items-start gap-3 px-5 py-2.5">
                <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium text-white flex-shrink-0 mt-0.5"
                  style={{ background: item.user?.color || '#7D8C74' }}>
                  {item.user?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0,2).toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-stone-700">
                    <span className="font-medium text-stone-900">{item.user?.full_name || 'Someone'}</span>
                    {' '}{item.action}
                  </p>
                  {item.project?.name && (
                    <p className="text-xs text-stone-400 mt-0.5">{item.project.name}</p>
                  )}
                  {item.details && (
                    <p className="text-xs text-stone-400 mt-0.5 italic">{item.details}</p>
                  )}
                </div>
                <span className="text-xs text-stone-400 flex-shrink-0 mt-0.5 ml-2">
                  {format(parseISO(item.created_at), 'd MMM · HH:mm')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

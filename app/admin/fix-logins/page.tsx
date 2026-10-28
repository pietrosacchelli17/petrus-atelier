'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

const USERS_TO_FIX = [
  { label: 'Thomas Harwood', email: 'thomasharwood@stoneline.co.uk', id: 'f3a730f0-be50-45de-bea6-990225c5b97d' },
  { label: 'Ugur Berkin',    email: 'ugurberkin@stoneline.co.uk',    id: 'f3329375-189e-4974-b7a4-9f9067e175f7' },
]

export default function FixLoginsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [results, setResults] = useState<Record<string, string>>({})
  const [authorized, setAuthorized] = useState(false)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: sessionData }) => {
      if (!sessionData.session?.user) { router.push('/auth'); return }
      const userId = sessionData.session.user.id
      const { data: profile, error: profileError } = await supabase.from('users').select('role').eq('id', userId).single()
      if (profileError || profile?.role !== 'admin') { router.push('/dashboard'); return }
      setAuthorized(true)
      setChecking(false)
    })
  }, [])

  async function fixPassword(userId: string, label: string) {
    setLoading(userId)
    const { data: sessionData } = await supabase.auth.getSession()
    const token = sessionData.session?.access_token
    try {
      const res = await fetch('/api/admin/fix-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, callerAccessToken: token }),
      })
      const json = await res.json()
      if (!res.ok) {
        const extra = json.supabaseUrlUsed ? ` | URL used: ${json.supabaseUrlUsed} | Searched for ID: ${json.userIdSearched} | Control test (looked up your own account): ${json.controlTest}` : ''
        setResults(prev => ({ ...prev, [userId]: `Failed at "${json.step}": ${json.error}${extra}` }))
      } else {
        setResults(prev => ({ ...prev, [userId]: `Password reset to "Stoneline1" for ${json.email}` }))
      }
    } catch (err: any) {
      setResults(prev => ({ ...prev, [userId]: `Failed: ${err.message}` }))
    }
    setLoading(null)
  }

  if (checking) return <div className="p-6 text-sm text-stone-400">Checking access...</div>
  if (!authorized) return null

  return (
    <div className="p-6 max-w-xl mx-auto">
      <h1 className="text-xl font-semibold text-stone-900 mb-1">Fix Logins</h1>
      <p className="text-sm text-stone-500 mb-6">Resets a user's password to <span className="font-mono bg-stone-100 px-1.5 py-0.5 rounded">Stoneline1</span> directly, no email needed.</p>
      <div className="space-y-3">
        {USERS_TO_FIX.map(u => (
          <div key={u.id} className="card p-4 flex items-center justify-between gap-4">
            <div>
              <p className="font-medium text-stone-900 text-sm">{u.label}</p>
              <p className="text-xs text-stone-400">{u.email}</p>
              {results[u.id] && (
                <p className={`text-xs mt-1 ${results[u.id].startsWith('Failed') ? 'text-red-500' : 'text-green-600'}`}>
                  {results[u.id]}
                </p>
              )}
            </div>
            <button
              onClick={() => fixPassword(u.id, u.label)}
              disabled={loading === u.id}
              className="btn-primary text-sm flex-shrink-0">
              {loading === u.id ? 'Resetting...' : 'Reset Password'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

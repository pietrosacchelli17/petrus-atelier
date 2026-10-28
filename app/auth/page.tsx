'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSignIn(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Invalid email or password.')
      setLoading(false)
    } else {
      router.push('/dashboard')
    }
  }

  return (
    <div className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="w-full max-w-xs">

        {/* Wordmark */}
        <div className="mb-10">
          <div className="text-xs font-medium tracking-[0.2em] text-stone-400 uppercase">Keystone</div>
          <div className="text-xs tracking-[0.15em] text-stone-300 uppercase mt-0.5">Petrus Atelier</div>
        </div>

        <form onSubmit={handleSignIn} className="space-y-5">
          <div>
            <label className="block text-xs text-stone-400 tracking-widest uppercase mb-1.5">Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@stoneline.co.uk"
              required
              autoFocus
              className="w-full border-0 border-b border-stone-200 pb-2 text-sm text-stone-800 bg-transparent focus:outline-none focus:border-stone-400 placeholder:text-stone-300 transition-colors"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-400 tracking-widest uppercase mb-1.5">Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              className="w-full border-0 border-b border-stone-200 pb-2 text-sm text-stone-800 bg-transparent focus:outline-none focus:border-stone-400 placeholder:text-stone-300 transition-colors"
            />
          </div>

          {error && <p className="text-xs text-red-400">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full mt-2 py-2.5 text-sm text-white tracking-wide transition-colors"
            style={{ background: loading ? '#9A8E7F' : '#463E36' }}>
            {loading ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        <p className="mt-8 text-xs text-stone-300 text-center">
          No account?{' '}
          <a href="mailto:qs@stoneline.co.uk" className="text-stone-400 hover:text-stone-600 transition-colors">
            Request access
          </a>
        </p>

      </div>
    </div>
  )
}

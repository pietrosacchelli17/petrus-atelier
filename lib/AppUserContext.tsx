'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

interface AppUserContextValue {
  user: any
  userLoaded: boolean
  notifications: number
  refreshNotifications: () => void
}

const AppUserContext = createContext<AppUserContextValue>({
  user: null,
  userLoaded: false,
  notifications: 0,
  refreshNotifications: () => {},
})

export function useAppUser() {
  return useContext(AppUserContext)
}

// Mounted once in the true root layout (app/layout.tsx), which Next.js never
// unmounts during client-side navigation. This means the user profile and
// notification count are fetched exactly once per session instead of on
// every sidebar click — each top-level route (dashboard/, projects/, etc.)
// has its own layout.tsx and therefore its own AppLayout instance, so
// without this, AppLayout's own useEffect was re-fetching from Supabase
// every single time you navigated between sections.
export function AppUserProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [userLoaded, setUserLoaded] = useState(false)
  const [notifications, setNotifications] = useState(0)

  async function loadNotifications() {
    const { data } = await supabase.from('notifications').select('id').eq('read', false)
    setNotifications(data?.length || 0)
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) { router.push('/auth'); return }
      supabase.from('users').select('*').eq('id', data.user.id).single()
        .then(({ data: profile }) => {
          setUser(profile)
          setUserLoaded(true)
        })
    })
    loadNotifications()
  }, [])

  return (
    <AppUserContext.Provider value={{ user, userLoaded, notifications, refreshNotifications: loadNotifications }}>
      {children}
    </AppUserContext.Provider>
  )
}

'use client'
import { Suspense, useState } from 'react'
import Link from 'next/link'
import { usePathname, useSearchParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useAppUser } from '@/lib/AppUserContext'
import { useLanguage } from '@/lib/LanguageContext'
import { TranslationKey } from '@/lib/translations'
import {
  LayoutDashboard, FolderOpen, CheckSquare, Calendar, CalendarClock, Users,
  FileText, BarChart2, Bell, Search, Settings, LogOut,
  ChevronLeft, ChevronRight, Menu, X, Target, ShoppingCart, FileSpreadsheet, PhoneCall, Package, Tag, Globe, Beaker
} from 'lucide-react'

const MAIN_NAV: { href: string; labelKey: TranslationKey; icon: any; salesOnly?: boolean }[] = [
  { href: '/dashboard',      labelKey: 'nav_dashboard',  icon: LayoutDashboard },
  { href: '/projects',       labelKey: 'nav_projects',   icon: FolderOpen },
  { href: '/salestracking',  labelKey: 'nav_sales',       icon: ShoppingCart, salesOnly: true },
  { href: '/salestracking?tab=estimates', labelKey: 'nav_estimates', icon: FileSpreadsheet, salesOnly: true },
  { href: '/salestracking?tab=samples', labelKey: 'nav_samples', icon: Beaker, salesOnly: true },
  { href: '/my-sales-pipeline', labelKey: 'nav_weekly_report', icon: Target, salesOnly: true },
  { href: '/inventory',      labelKey: 'nav_inventory',   icon: Package, salesOnly: true },
  { href: '/pricing-list',   labelKey: 'nav_pricing_list', icon: Tag, salesOnly: true },
  { href: '/timeline',       labelKey: 'nav_timeline',   icon: Calendar },
  { href: '/calendar',       labelKey: 'nav_calendar',   icon: CalendarClock },
  { href: '/tasks',          labelKey: 'nav_project_tasks',   icon: CheckSquare },
  { href: '/team',           labelKey: 'nav_team',        icon: Users },
  { href: '/documents',      labelKey: 'nav_documents',   icon: FileText },
  { href: '/reports',        labelKey: 'nav_reports',     icon: BarChart2 },
]

// Open to everyone — not just admin
const TEAM_NAV: { href: string; labelKey: TranslationKey; icon: any }[] = [
  { href: '/admin?tab=projects',        labelKey: 'nav_project_tracker',  icon: Target },
  { href: '/admin?tab=sales_contacts',  labelKey: 'nav_contacts',   icon: PhoneCall },
]

// Stays admin-only
const ADMIN_ONLY_NAV: { href: string; labelKey: TranslationKey; icon: any }[] = [
  { href: '/admin?tab=todo',            labelKey: 'nav_todo_list',       icon: CheckSquare },
]

const ADMIN_NAV_SYNC: { href: string; labelKey: TranslationKey; icon: any }[] = [
  { href: '/admin/sync', labelKey: 'nav_sync_excel', icon: FileSpreadsheet },
]


// Isolated in its own component + Suspense boundary because useSearchParams()
// requires one — without this, it forces client-side rendering on EVERY page
// that renders AppLayout (i.e. the whole app), breaking the build.
function AdminNavLinks({ collapsed, onNavigate, isAdmin }: { collapsed: boolean; onNavigate: () => void; isAdmin: boolean }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab')
  const { t } = useLanguage()

  function isAdminActive(href: string) {
    const [path, query] = href.split('?')
    if (pathname !== path) return false
    if (!query) return true // routes without a tab param (e.g. /admin/sync) just match on path
    const tab = new URLSearchParams(query).get('tab')
    // Default tab when landing on bare /admin matches what the page itself
    // defaults to — sales_contacts for admin, projects for everyone else.
    if (!currentTab) return tab === (isAdmin ? 'sales_contacts' : 'projects')
    return currentTab === tab
  }

  function renderLink({ href, labelKey, icon: Icon }: { href: string; labelKey: TranslationKey; icon: any }) {
    const active = isAdminActive(href)
    const label = t(labelKey)
    return (
      <Link key={href} href={href}
        onClick={onNavigate}
        className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all
          ${active ? '' : 'text-stone-400 hover:text-white hover:bg-stone-800'}
          ${collapsed ? 'justify-center' : ''}`}
        style={active ? { background: 'rgba(140,127,88,0.18)', color: '#C9A876' } : undefined}
        title={collapsed ? label : undefined}>
        <Icon size={16} className="flex-shrink-0"/>
        {!collapsed && <span>{label}</span>}
      </Link>
    )
  }

  return (
    <>
      {TEAM_NAV.map(renderLink)}
      <div className="mt-4 space-y-0.5">
        {ADMIN_ONLY_NAV.map(renderLink)}
        {isAdmin && ADMIN_NAV_SYNC.map(renderLink)}
      </div>
    </>
  )
}

// Same reasoning as AdminNavLinks: isolated + Suspense-wrapped because
// useSearchParams() needs it. Items sharing a pathname are distinguished
// by their ?tab= param — plain pathname comparison alone can't tell them
// apart (used by the Project Tracker / Contacts pair, for example).
function MainNavLinks({ collapsed, onNavigate, items }: { collapsed: boolean; onNavigate: () => void; items: typeof MAIN_NAV }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const currentTab = searchParams.get('tab')
  const { t } = useLanguage()

  function isActive(href: string) {
    const [path, query] = href.split('?')
    if (pathname !== path) return false
    if (!query) return path !== '/salestracking' || (currentTab !== 'estimates' && currentTab !== 'samples')
    const linkTab = new URLSearchParams(query).get('tab')
    return currentTab === linkTab
  }

  return (
    <>
      {items.map(({ href, labelKey, icon: Icon }) => {
        const active = isActive(href)
        const label = t(labelKey)
        return (
          <Link key={href} href={href}
            onClick={onNavigate}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-all
              ${active ? '' : 'text-stone-400 hover:text-white hover:bg-stone-800'}
              ${collapsed ? 'justify-center' : ''}`}
            style={active ? { background: 'rgba(140,127,88,0.18)', color: '#C9A876' } : undefined}
            title={collapsed ? label : undefined}>
            <Icon size={16} className="flex-shrink-0"/>
            {!collapsed && <span>{label}</span>}
          </Link>
        )
      })}
    </>
  )
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter()
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  // Sourced from context, populated once at the true root layout — no longer
  // re-fetched on every navigation between sidebar sections.
  const { user, userLoaded, notifications } = useAppUser()
  const { t, language, setLanguage } = useLanguage()

  async function signOut() {
    await supabase.auth.signOut()
    router.push('/auth')
  }

  const initials = user?.full_name?.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase() || '?'
  const isAdmin = user?.role === 'admin'

  return (
    <div className="flex h-screen bg-stone-50 overflow-hidden">
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden" onClick={() => setMobileOpen(false)}/>
      )}

      <aside className={`
        fixed lg:relative inset-y-0 left-0 z-50 flex flex-col bg-stone-900 transition-all duration-200
        ${collapsed ? 'w-16' : 'w-56'}
        ${mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        {/* Logo — click to see what Keystone is */}
        <button onClick={() => router.push('/about')}
          className={`flex items-center gap-3 px-4 h-14 border-b border-stone-800 flex-shrink-0 hover:bg-stone-800/60 transition-colors text-left w-full ${collapsed ? 'justify-center' : ''}`}>
          <div className="w-7 h-7 rounded-full overflow-hidden flex-shrink-0 ring-1 ring-stone-700">
            <img src="/icon-192.png" alt="Keystone" className="w-full h-full object-cover" />
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="text-white text-sm font-medium leading-none tracking-normal">Keystone</div>
              <div className="text-stone-500 text-[11px] mt-1 tracking-wide">Stoneline UK</div>
            </div>
          )}
        </button>

        <nav className="flex-1 px-2 py-3 overflow-y-auto">
          {/* Main nav */}
          <div className="space-y-0.5">
            <Suspense fallback={null}>
              <MainNavLinks
                collapsed={collapsed}
                onNavigate={() => setMobileOpen(false)}
                items={MAIN_NAV}
              />
            </Suspense>
          </div>

          {/* Team section — Project Tracker and Contacts are open to
              everyone; To Do List and Sync Excel inside AdminNavLinks stay
              admin-only. Project Contacts still exists as a tab within the
              admin page, just without its own sidebar shortcut. */}
          <div className="mt-4">
              {!collapsed && (
                <div className="px-3 pb-1.5 text-xs font-semibold text-stone-600 uppercase tracking-wide">
                  {isAdmin ? 'Admin' : 'Team'}
                </div>
              )}
              <div className="space-y-0.5">
                <Suspense fallback={null}>
                  <AdminNavLinks collapsed={collapsed} onNavigate={() => setMobileOpen(false)} isAdmin={isAdmin}/>
                </Suspense>
              </div>
            </div>
        </nav>

        {/* Bottom */}
        <div className="border-t border-stone-800 p-2 space-y-0.5">
          <Link href="/settings"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone-400 hover:text-white hover:bg-stone-800 ${collapsed ? 'justify-center' : ''}`}>
            <Settings size={16}/>
            {!collapsed && <span>{t('nav_settings')}</span>}
          </Link>
          <button onClick={signOut}
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-stone-400 hover:text-red-400 hover:bg-stone-800 w-full ${collapsed ? 'justify-center' : ''}`}>
            <LogOut size={16}/>
            {!collapsed && <span>{t('nav_sign_out')}</span>}
          </button>
          {!collapsed && user && (
            <div className="flex items-center gap-2 px-3 py-2 mt-1">
              <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                style={{ background: user?.color || '#B85042' }}>
                {initials}
              </div>
              <div className="min-w-0">
                <div className="text-stone-300 text-xs font-medium truncate">{user?.full_name}</div>
                <div className="text-stone-500 text-xs truncate">{user?.role}</div>
              </div>
            </div>
          )}
        </div>

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 bg-stone-800 border border-stone-700 rounded-full items-center justify-center text-stone-400 hover:text-white">
          {collapsed ? <ChevronRight size={12}/> : <ChevronLeft size={12}/>}
        </button>
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <header className="flex items-center gap-3 px-4 h-14 bg-white border-b border-stone-200 flex-shrink-0">
          <button className="lg:hidden p-1.5 rounded-lg hover:bg-stone-100" onClick={() => setMobileOpen(true)}>
            <Menu size={18} className="text-stone-600"/>
          </button>
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400"/>
              <input
                className="w-full bg-stone-100 rounded-lg pl-9 pr-4 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                placeholder={t('nav_search_placeholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => setLanguage(language === 'en' ? 'tr' : 'en')}
              title={language === 'en' ? 'Türkçe\'ye geç' : 'Switch to English'}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-stone-600 border border-stone-200 hover:bg-stone-100 transition-colors">
              <Globe size={14} className="text-stone-400"/>
              {language === 'en' ? 'EN' : 'TR'}
            </button>
            <Link href="/notifications" className="relative p-2 rounded-lg hover:bg-stone-100">
              <Bell size={18} className="text-stone-600"/>
              {notifications > 0 && (
                <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
                  {notifications > 9 ? '9+' : notifications}
                </span>
              )}
            </Link>
            <Link href="/settings" className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: user?.color || '#B85042' }}>
              {initials}
            </Link>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  )
}

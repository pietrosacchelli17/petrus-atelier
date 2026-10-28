import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from 'react-hot-toast'
import ServiceWorkerRegister from './service-worker-register'
import { AppUserProvider } from '@/lib/AppUserContext'
import { LanguageProvider } from '@/lib/LanguageContext'

const inter = Inter({ subsets: ['latin'], variable: '--font-sans' })

export const metadata: Metadata = {
  title: 'Keystone',
  description: 'ERP Petrus Atelier',
  applicationName: 'Keystone',
  manifest: '/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'Keystone',
    statusBarStyle: 'default',
  },
  icons: {
    icon: '/icon-192.png',
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={`${inter.className} bg-stone-50 text-stone-900 antialiased`}>
        <ServiceWorkerRegister />
        <LanguageProvider>
          <AppUserProvider>
            {children}
          </AppUserProvider>
        </LanguageProvider>
        <Toaster
          position="top-right"
          toastOptions={{
            style: { background: '#1C1917', color: '#fff', borderRadius: '8px', fontSize: '13px' },
            success: { iconTheme: { primary: '#10B981', secondary: '#fff' } },
            error: { iconTheme: { primary: '#EF4444', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  )
}

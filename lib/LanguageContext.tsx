'use client'
import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { translations, TranslationKey } from './translations'

type Language = 'en' | 'tr'

interface LanguageContextValue {
  language: Language
  setLanguage: (lang: Language) => void
  t: (key: TranslationKey) => string
}

const LanguageContext = createContext<LanguageContextValue>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => translations[key]?.en || key,
})

export function useLanguage() {
  return useContext(LanguageContext)
}

const STORAGE_KEY = 'keystone_language'

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en')

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY) as Language | null
    if (saved === 'en' || saved === 'tr') setLanguageState(saved)
  }, [])

  function setLanguage(lang: Language) {
    setLanguageState(lang)
    localStorage.setItem(STORAGE_KEY, lang)
  }

  function t(key: TranslationKey) {
    return translations[key]?.[language] || translations[key]?.en || key
  }

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  )
}

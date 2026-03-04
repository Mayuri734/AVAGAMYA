import {
    createContext,
    useContext,
    useState,
    type ReactNode,
  } from 'react'
  
  export type AnalysisLanguage = 'en' | 'hi' | 'mr'
  
  type AnalysisContextValue = {
    language: AnalysisLanguage | null
    setLanguage: (lang: AnalysisLanguage) => void
  }
  
  const AnalysisContext = createContext<AnalysisContextValue | undefined>(
    undefined,
  )
  
  export function AnalysisProvider({ children }: { children: ReactNode }) {
    const [language, setLanguage] = useState<AnalysisLanguage | null>(null)
  
    return (
      <AnalysisContext.Provider value={{ language, setLanguage }}>
        {children}
      </AnalysisContext.Provider>
    )
  }
  
  export function useAnalysis() {
    const ctx = useContext(AnalysisContext)
    if (!ctx) {
      throw new Error('useAnalysis must be used within an AnalysisProvider')
    }
    return ctx
  }
  
  export const LANGUAGE_LABELS: Record<AnalysisLanguage, string> = {
    en: 'English',
    hi: 'Hindi',
    mr: 'Marathi',
  }
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Languages } from 'lucide-react'
import {
  useAnalysis,
  type AnalysisLanguage,
} from '../context/AnalysisContext'

const OPTIONS: { code: AnalysisLanguage; label: string; subtitle: string }[] = [
  { code: 'en', label: 'English', subtitle: 'English Explanation' },
  { code: 'hi', label: 'Hindi', subtitle: 'हिन्दी में स्पष्टीकरण' },
  { code: 'mr', label: 'Marathi', subtitle: 'मराठीत स्पष्टीकरण' },
]

export function LanguageSelection() {
  const { language, setLanguage } = useAnalysis()
  const navigate = useNavigate()
  const [selected, setSelected] = useState<AnalysisLanguage | null>(language)

  const handleContinue = () => {
    if (!selected) return
    setLanguage(selected)
    navigate('/analyze/upload')
  }

  return (
    <motion.section
      className="min-h-[calc(100vh-4rem)] bg-page flex items-center justify-center px-4 py-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      {/* 1. Relative wrapper to anchor the avatar */}
      <div className="relative max-w-xl w-full">
        
        {/* 2. Avatar - Positioned Bottom-Left with high z-index */}
       <motion.div
  className="absolute left-0 bottom-0 z-50 translate-x-[-10%]"
  initial={{ x: -16, opacity: 0 }}
  animate={{ x: 0, opacity: 1 }}
  transition={{ delay: 0.2, duration: 0.5, ease: "easeOut" }}
>
  <img
    src="/language.png"
    alt="AVAGAMYA guide"
    className="w-28 h-auto drop-shadow-xl select-none pointer-events-none"
    draggable={false}
  />
</motion.div>

        {/* 3. The Selection Card */}
        <div className="relative z-20 rounded-3xl bg-white/80 backdrop-blur-xl border border-slate-100 shadow-xl p-8 sm:p-10">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-full bg-orange-50 text-vibrant-orange flex items-center justify-center">
              <Languages className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-serif text-xl sm:text-2xl md:text-3xl font-bold text-deep-blue">
                Choose your language
              </h1>
              <p className="text-slate-grey text-sm mt-1">
                AVAGAMYA explains policies in the language you prefer.
              </p>
            </div>
          </div>

          <div className="space-y-3 mb-6">
            {OPTIONS.map((opt) => {
              const isActive = selected === opt.code
              return (
                <button
                  key={opt.code}
                  type="button"
                  onClick={() => setSelected(opt.code)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border text-left transition-all ${
                    isActive
                      ? 'border-vibrant-orange bg-orange-50/60'
                      : 'border-slate-200 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div>
                    <p className="font-sans font-semibold text-deep-blue">{opt.label}</p>
                    <p className="text-xs text-slate-grey mt-0.5">{opt.subtitle}</p>
                  </div>
                  <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center text-[10px] ${
                    isActive ? 'border-vibrant-orange bg-vibrant-orange text-white' : 'border-slate-300 bg-white text-transparent'
                  }`}>
                    ●
                  </span>
                </button>
              )
            })}
          </div>

          {/* 4. Continue Button - specifically set with high z-index to stay clickable */}
          <button
            type="button"
            onClick={handleContinue}
            disabled={!selected}
            className="relative z-50 w-full inline-flex justify-center items-center rounded-full bg-vibrant-orange text-white font-semibold py-3 disabled:opacity-50 active:scale-95 transition-all"
          >
            Continue
          </button>
        </div>
      </div>
    </motion.section>
  )
}
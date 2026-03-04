import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CloudUpload,
  Languages,
  Brain,
  Calculator,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
} from 'lucide-react'

type DemoPhase =
  | 'start'
  | 'language'
  | 'upload'
  | 'scanning'
  | 'result'
  | 'simulator'
  | 'reset'

const steps = [
  { id: 1, title: 'Select Language', desc: 'Choose English, Hindi, or Marathi for your analysis.', icon: Languages },
  { id: 2, title: 'Upload & Detect', desc: 'Upload any bank policy PDF. We support major Indian banks.', icon: CloudUpload },
  { id: 3, title: 'Neuro-Symbolic Scan', desc: 'Our AI cross-references clauses with RBI guidelines to find hidden risks.', icon: Brain },
  { id: 4, title: 'Simulate Impact', desc: 'Use the financial slider to see exactly how much a late fee will cost you.', icon: Calculator },
]

function stepFromPhase(phase: DemoPhase): number {
  switch (phase) {
    case 'start':
    case 'language':
      return 1
    case 'upload':
      return 2
    case 'scanning':
    case 'result':
      return 3
    case 'simulator':
      return 4
    default:
      return 1
  }
}

export function HowItWorks() {
  const [currentPhase, setCurrentPhase] = useState<DemoPhase>('start')
  const [scanProgress, setScanProgress] = useState(0)
  const [sliderValue, setSliderValue] = useState(1)
  const [isPlaying, setIsPlaying] = useState(true)

  const activeStep = stepFromPhase(currentPhase)

  useEffect(() => {
    if (!isPlaying) return
    const timings: Record<DemoPhase, number> = {
      start: 2000,
      language: 2000,
      upload: 2500,
      scanning: 3000,
      result: 2500,
      simulator: 3500,
      reset: 1200,
    }
    const timer = setTimeout(() => {
      setCurrentPhase((prev) => {
        switch (prev) {
          case 'start':
            return 'language'
          case 'language':
            return 'upload'
          case 'upload':
            return 'scanning'
          case 'scanning':
            return 'result'
          case 'result':
            return 'simulator'
          case 'simulator':
            return 'reset'
          case 'reset':
            return 'start'
          default:
            return 'start'
        }
      })
    }, timings[currentPhase])
    return () => clearTimeout(timer)
  }, [currentPhase, isPlaying])

  useEffect(() => {
    if (currentPhase === 'scanning') {
      setScanProgress(0)
      const interval = setInterval(() => {
        setScanProgress((prev) => (prev >= 100 ? 100 : prev + 4))
      }, 100)
      return () => clearInterval(interval)
    }
  }, [currentPhase])

  useEffect(() => {
    if (currentPhase === 'simulator') {
      setSliderValue(1)
      const interval = setInterval(() => {
        setSliderValue((prev) => (prev >= 25 ? 25 : prev + 1))
      }, 100)
      return () => clearInterval(interval)
    }
  }, [currentPhase])

  const penalty = 500 + (sliderValue - 1) * 70
  const penaltyColor =
    sliderValue <= 7 ? 'text-emerald-600' : sliderValue <= 15 ? 'text-amber-600' : 'text-red-600'

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen pt-16 pb-20 px-4 bg-page"
    >
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-12 lg:mb-16">
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-deep-blue mb-4">
            How AVAGAMYA Works
          </h1>
          <p className="text-sm md:text-lg text-slate-grey">
            From complex contract to simple clarity in 4 steps.
          </p>
        </header>

        <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-start">
          {/* Left: Browser mockup */}
          <div className="rounded-2xl bg-white border border-slate-200 shadow-xl overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-3 bg-[#F1F5F9] border-b border-slate-200">
              <div className="flex gap-1.5">
                <span className="w-3 h-3 rounded-full bg-red-400" />
                <span className="w-3 h-3 rounded-full bg-amber-400" />
                <span className="w-3 h-3 rounded-full bg-emerald-400" />
              </div>
              <div className="flex-1 text-center text-xs text-slate-grey font-mono">
                avagamya.ai/analyze
              </div>
              <button
                type="button"
                onClick={() => setIsPlaying(!isPlaying)}
                className="p-1.5 rounded-lg bg-vibrant-orange/10 text-vibrant-orange hover:bg-vibrant-orange/20 transition-colors"
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
              </button>
            </div>

            <div className="relative h-[420px] bg-gradient-to-br from-page to-white p-8 overflow-hidden">
              <AnimatePresence mode="wait">
                {currentPhase === 'start' && (
                  <motion.div
                    key="start"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center h-full text-center"
                  >
                    <Languages className="w-14 h-14 text-vibrant-orange mb-6" />
                    <h3 className="font-serif font-semibold text-deep-blue text-xl mb-2">Select Language</h3>
                    <p className="text-slate-grey text-sm">Choose your preferred language</p>
                  </motion.div>
                )}

                {currentPhase === 'upload' && (
                  <motion.div
                    key="upload"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center h-full text-center"
                  >
                    <CloudUpload className="w-16 h-16 text-vibrant-orange mb-6" />
                    <h3 className="font-serif font-semibold text-deep-blue text-lg mb-2">Upload Policy PDF</h3>
                    <p className="text-sm text-slate-grey">Drop your bank policy document here</p>
                  </motion.div>
                )}

                {currentPhase === 'scanning' && (
                  <motion.div
                    key="scan"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center justify-center h-full text-center"
                  >
                    <div className="relative w-28 h-28 mb-6">
                      <svg className="w-28 h-28 -rotate-90" viewBox="0 0 36 36">
                        <path
                          fill="none"
                          stroke="#E2E8F0"
                          strokeWidth="3"
                          d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
                        />
                        <motion.path
                          fill="none"
                          stroke="#FC5923"
                          strokeWidth="3"
                          strokeLinecap="round"
                          d="M18 2.5 a 15.5 15.5 0 0 1 0 31 a 15.5 15.5 0 0 1 0 -31"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: scanProgress / 100 }}
                          transition={{ duration: 0.2 }}
                        />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Brain className="w-10 h-10 text-vibrant-orange" />
                      </div>
                    </div>
                    <h3 className="font-serif font-semibold text-deep-blue text-lg mb-3">Scanning Document...</h3>
                    <div className="w-full max-w-xs h-2 rounded-full bg-slate-100 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-vibrant-orange to-emerald-500"
                        initial={{ width: 0 }}
                        animate={{ width: `${scanProgress}%` }}
                        transition={{ duration: 0.2 }}
                      />
                    </div>
                    <p className="mt-2 font-semibold text-vibrant-orange">{scanProgress}%</p>
                  </motion.div>
                )}

                {currentPhase === 'result' && (
                  <motion.div
                    key="result"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <AlertTriangle className="w-6 h-6 text-red-500" />
                      <h3 className="font-semibold text-red-600">High-Risk Clause Detected</h3>
                    </div>
                    <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-slate-grey">
                      This policy allows 36% APR compound interest plus ₹1,200 penalty per missed cycle.
                    </div>
                  </motion.div>
                )}

                {currentPhase === 'simulator' && (
                  <motion.div
                    key="sim"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <Calculator className="w-5 h-5 text-vibrant-orange" />
                      <h3 className="font-serif font-semibold text-deep-blue">Financial Impact Simulator</h3>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={30}
                      value={sliderValue}
                      readOnly
                      className="w-full accent-vibrant-orange mb-4"
                    />
                    <p className={`text-3xl font-bold text-center ${penaltyColor}`}>
                      ₹{penalty.toLocaleString()}
                    </p>
                  </motion.div>
                )}

                {currentPhase === 'reset' && (
                  <motion.div
                    key="reset"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex flex-col items-center justify-center h-full text-center"
                  >
                    <CheckCircle2 className="w-14 h-14 text-emerald-500 mb-4" />
                    <p className="font-semibold text-emerald-600">Demo Complete</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right: 4-step vertical timeline with orange line for active step */}
          <div className="relative">
            <div className="absolute left-5 top-0 bottom-0 w-0.5 bg-slate-200" aria-hidden />
            <motion.div
              className="absolute left-5 top-0 w-0.5 bg-vibrant-orange origin-top"
              initial={false}
              animate={{ height: `${(activeStep / 4) * 100}%` }}
              transition={{ duration: 0.4, ease: 'easeInOut' }}
              aria-hidden
            />
            <div className="space-y-0">
              {steps.map((step) => {
                const isActive = activeStep === step.id
                const Icon = step.icon
                return (
                  <motion.div
                    key={step.id}
                    layout
                    className="relative pl-14 pr-6 py-5"
                    initial={false}
                    animate={{
                      transition: { duration: 0.3 },
                    }}
                  >
                    <div
                      className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs font-semibold ${isActive
                          ? 'bg-vibrant-orange border-vibrant-orange text-white'
                          : 'bg-white border-slate-200 text-slate-grey'
                        }`}
                    >
                      {step.id}
                    </div>
                    <div
                      className={`p-6 rounded-2xl border-2 bg-white shadow-lg transition-all ${isActive ? 'border-vibrant-orange' : 'border-slate-100'
                        }`}
                    >
                      <div className="flex gap-4">
                        <div
                          className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${isActive ? 'bg-vibrant-orange/10 text-vibrant-orange' : 'bg-slate-100 text-slate-grey'
                            }`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <h3 className="font-serif font-semibold text-deep-blue text-lg">{step.title}</h3>
                          <p className="text-slate-grey text-sm mt-1">{step.desc}</p>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  )
}

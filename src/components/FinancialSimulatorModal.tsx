import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, TrendingUp, Calculator, FileText, CheckCircle2 } from 'lucide-react'

interface FinancialSimulatorModalProps {
  isOpen: boolean
  onClose: () => void
}

type Step = 'ingestion' | 'extraction' | 'calculation'

export function FinancialSimulatorModal({ isOpen, onClose }: FinancialSimulatorModalProps) {
  const [step, setStep] = useState<Step>('ingestion')
  const [inputText, setInputText] = useState('')
  const [interestRate, setInterestRate] = useState<number>(0)
  const [flatFee, setFlatFee] = useState<number>(0)
  const [formulaType, setFormulaType] = useState<'A' | 'B'>('A')
  const [balance, setBalance] = useState<number>(10000)
  const [result, setResult] = useState<number | null>(null)

  // 1. EXTRACT TERMS (Deterministic Logic)
  const extractTerms = () => {
    if (!inputText.trim()) return

    // RegEx: Percentage (e.g. 3.5% or 3%)
    const percentMatch = inputText.match(/(\d+(?:\.\d+)?)\s*%/ )
    if (percentMatch) setInterestRate(parseFloat(percentMatch[1]))

    // RegEx: Currency (e.g. ₹500 or Rs. 500)
    const currencyMatch = inputText.match(/(?:₹|Rs\.?)\s*(\d+(?:\.\d+)?)/)
    if (currencyMatch) setFlatFee(parseFloat(currencyMatch[1]))

    setStep('extraction')
  }

  // 2. CALCULATE IMPACT (Deterministic Math)
  const calculateImpact = () => {
    let calculated = 0
    if (formulaType === 'A') {
      // Late Fee: Max of (% of balance) or Flat Fee
      calculated = Math.max(balance * (interestRate / 100), flatFee)
    } else {
      // Monthly Interest: Balance * (% rate)
      calculated = balance * (interestRate / 100)
    }
    setResult(calculated)
    setStep('calculation')
  }

  const resetAll = () => {
    setStep('ingestion')
    setInputText('')
    setInterestRate(0)
    setFlatFee(0)
    setBalance(10000)
    setResult(null)
  }

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-deep-blue/40 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.9, y: 20 }}
          className="w-full max-w-2xl bg-white rounded-[2rem] shadow-2xl overflow-hidden border border-slate-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-slate-50 bg-slate-50/50">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-vibrant-orange/10 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-vibrant-orange" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-deep-blue">Financial Impact Simulator</h2>
                <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">Deterministic Calculation Engine</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-200/50 rounded-xl transition-colors"
            >
              <X className="w-6 h-6 text-slate-400" />
            </button>
          </div>

          <div className="p-8">
            {/* Step 1: Ingestion */}
            {step === 'ingestion' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center gap-2 mb-4 text-slate-600 font-bold">
                  <FileText className="w-5 h-5" />
                  <span>Step 1: Paste Fee Clause</span>
                </div>
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Paste clause here (e.g., 'Late payment fee is 3.5% or ₹500...')"
                  className="w-full h-40 p-4 rounded-2xl bg-slate-50 border border-slate-100 outline-none focus:ring-4 focus:ring-vibrant-orange/5 text-deep-blue placeholder:text-slate-300 resize-none transition-all"
                />
                <button
                  onClick={extractTerms}
                  disabled={!inputText.trim()}
                  className="w-full mt-6 py-4 bg-vibrant-orange text-white rounded-2xl font-bold shadow-lg shadow-vibrant-orange/20 hover:opacity-90 disabled:bg-slate-200 disabled:shadow-none transition-all flex items-center justify-center gap-2"
                >
                  <Calculator className="w-5 h-5" /> Extract Terms
                </button>
              </motion.div>
            )}

            {/* Step 2: Extraction & Verification */}
            {step === 'extraction' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center gap-2 mb-6 text-emerald-600 font-bold">
                  <CheckCircle2 className="w-5 h-5" />
                  <span>Step 2: Verify Extracted Metrics</span>
                </div>
                
                <div className="grid grid-cols-2 gap-4 mb-8">
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase ml-1">Extracted Rate (%)</label>
                    <input
                      type="number"
                      value={interestRate}
                      onChange={(e) => setInterestRate(parseFloat(e.target.value) || 0)}
                      className="w-full p-4 rounded-xl border border-slate-100 bg-slate-50 text-deep-blue font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-black text-slate-400 uppercase ml-1">Extracted Fee (₹)</label>
                    <input
                      type="number"
                      value={flatFee}
                      onChange={(e) => setFlatFee(parseFloat(e.target.value) || 0)}
                      className="w-full p-4 rounded-xl border border-slate-100 bg-slate-50 text-deep-blue font-bold outline-none focus:ring-2 focus:ring-emerald-500/20"
                    />
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-xs font-black text-slate-400 uppercase ml-1">Select Formula Type</label>
                  <select
                    value={formulaType}
                    onChange={(e) => setFormulaType(e.target.value as 'A' | 'B')}
                    className="w-full p-4 rounded-xl border border-slate-100 bg-white text-deep-blue font-bold outline-none shadow-sm cursor-pointer"
                  >
                    <option value="A">Late Fee (Max of % or Flat)</option>
                    <option value="B">Monthly Interest (Balance * Rate)</option>
                  </select>
                </div>

                <div className="flex gap-4 mt-8">
                  <button onClick={() => setStep('ingestion')} className="flex-1 py-4 bg-slate-100 text-slate-600 rounded-2xl font-bold">Back</button>
                  <button
                    onClick={() => setStep('calculation')}
                    className="flex-[2] py-4 bg-deep-blue text-white rounded-2xl font-bold shadow-lg"
                  >
                    Proceed to Calculate
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3: Calculation */}
            {step === 'calculation' && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <div className="flex items-center gap-2 mb-6 text-deep-blue font-bold">
                  <TrendingUp className="w-5 h-5" />
                  <span>Step 3: Enter Balance & Predict Impact</span>
                </div>

                <div className="space-y-2 mb-8">
                  <label className="text-xs font-black text-slate-400 uppercase ml-1">Outstanding Balance (₹)</label>
                  <input
                    type="number"
                    value={balance}
                    onChange={(e) => setBalance(parseFloat(e.target.value) || 0)}
                    className="w-full p-4 rounded-2xl border border-slate-100 bg-slate-50 text-deep-blue font-bold text-2xl outline-none focus:ring-4 focus:ring-vibrant-orange/5"
                  />
                </div>

                <button
                  onClick={calculateImpact}
                  className="w-full py-4 bg-vibrant-orange text-white rounded-2xl font-bold shadow-xl shadow-vibrant-orange/20 mb-8"
                >
                  Calculate Impact
                </button>

                {result !== null && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    className="p-8 rounded-3xl bg-slate-900 text-white text-center shadow-2xl relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-10">
                      <TrendingUp className="w-24 h-24" />
                    </div>
                    <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">Estimated Financial Impact</p>
                    <h3 className="text-5xl font-black text-vibrant-orange mb-2">
                    ₹{result.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
                    </h3>
                    <p className="text-xs text-slate-500 font-mono italic">
                      Based on {formulaType === 'A' ? 'Step-up Logic' : 'Simple Accrual Logic'}
                    </p>
                  </motion.div>
                )}

                <button onClick={resetAll} className="w-full mt-6 py-2 text-slate-400 font-bold hover:text-slate-600 transition-colors">Start Over</button>
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

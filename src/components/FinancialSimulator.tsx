import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, TrendingUp } from 'lucide-react'

interface FinancialSimulatorModalProps {
  isOpen: boolean
  clause: {
    id: number
    original_text: string
    simplified: string
    risk_score: number
    metric?: {
      type: 'percentage' | 'amount' | 'rate'
      value: number
      unit: string // '%', '₹', 'per annum', etc.
      label: string // 'Interest Rate', 'Charge', etc.
    }
    financial_metric?: string | null
  }
  onClose: () => void
}

/**
 * Detects financial metrics in text
 * Returns: { type, value, unit, label, isPerAnnum, flatAmount }
 */
function extractMetric(text: string): {
  type: 'percentage' | 'amount' | 'conditional'
  value: number
  unit: string
  label: string
  isPerAnnum?: boolean
  flatAmount?: number
} | null {
  if (!text) return null;

  // 1) Translate Devanagari numerals (०-९) to Arabic (0-9)
  const devanagariToNumber = (str: string) => {
    return str.replace(/[०-९]/g, (char) => String.fromCharCode(char.charCodeAt(0) - 2406 + 48))
  }
  const cleanText = devanagariToNumber(text).replace(/,/g, '')

  const percentMatch = cleanText.match(/(\d+(?:\.\d+)?)\s*%/)
  const amountMatch = cleanText.match(/(?:₹|Rs\.?)\s*(\d+(?:\.\d+)?)/)

  const hasPercent = !!percentMatch
  const hasAmount = !!amountMatch

  // Contextual checks
  const isPerAnnum = /p\.a\.|per annum|annually|प्रति वर्ष/i.test(cleanText)

  // Conditional checks: "whichever is higher", "greater of", "or ₹"
  const isConditional = /(whichever is higher|greater of|or ₹|किंवा अधिक|यापैकी जे जास्त असेल)/i.test(cleanText)

  if (hasPercent && hasAmount && isConditional) {
    return {
      type: 'conditional',
      value: parseFloat(percentMatch[1]), // The percentage
      unit: '%',
      label: 'Minimum Flat Fee + %',
      isPerAnnum,
      flatAmount: parseFloat(amountMatch[1]) // Flat fallback
    }
  }

  // Pure Percentage
  if (hasPercent) {
    return {
      type: 'percentage',
      value: parseFloat(percentMatch[1]),
      unit: '%',
      label: isPerAnnum ? 'Annual Percentage (p.a.)' : 'Monthly Percentage',
      isPerAnnum
    }
  }

  // Pure Amount
  if (hasAmount) {
    return {
      type: 'amount',
      value: parseFloat(amountMatch[1]),
      unit: '₹',
      label: 'Flat Amount',
    }
  }

  return null
}

export function FinancialSimulatorModal({
  isOpen,
  clause,
  onClose,
}: FinancialSimulatorModalProps) {
  const [userInput, setUserInput] = useState('')
  const [result, setResult] = useState<number | null>(null)
  const [duration, setDuration] = useState(12) // months

  // Extract metric from clause text or fallback to backend metric
  const metric = extractMetric(clause.original_text) || extractMetric(clause.financial_metric || '');

  useEffect(() => {
    if (!metric && userInput) {
      setResult(null)
      return
    }

    const principal = parseFloat(userInput)
    if (!principal || principal <= 0 || !metric) {
      setResult(null)
      return
    }

    // Adaptive Calculation Logic
    if (metric.type === 'percentage') {
      if (metric.isPerAnnum) {
        // Principal * (Rate/100) * (duration/12)
        const cost = principal * (metric.value / 100) * (duration / 12)
        setResult(cost)
      } else {
        // Principal * (Rate/100) * duration (Monthly compounding simplified)
        const cost = principal * (metric.value / 100) * duration
        setResult(cost)
      }
    } else if (metric.type === 'amount') {
      // Flat fee applied per month
      setResult(metric.value * duration)
    } else if (metric.type === 'conditional') {
      // Greater Of: (Principal * Rate/100) vs FlatAmount
      const calculatedPercentage = principal * (metric.value / 100)
      const flat = metric.flatAmount || 0

      // Assume the conditional charge applies once per month mathematically
      setResult(Math.max(calculatedPercentage, flat) * duration)
    }
  }, [userInput, duration, metric])

  if (!isOpen || !metric) return null

  const hasResult = result !== null && result > 0

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
        <motion.div
          className="bg-white rounded-2xl shadow-2xl p-8 max-w-md w-full mx-4"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.2 }}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div className="flex items-center gap-2">
              <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-blue-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Financial Impact</h2>
                <p className="text-xs text-gray-500">Scenario Simulator</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>

          {/* Clause Preview */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-1 mb-2">
            <p className="text-xs font-semibold text-yellow-900 mb-1">Clause ID: {clause.id}</p>
 
          </div>

          {/* Detected Metric */}
          <div className="bg-blue-50 rounded-lg p-4 mb-6">
            <p className="text-xs text-blue-600 font-semibold mb-2">Detected {metric.label}</p>
            <div className="text-lg font-bold text-blue-900 flex items-center gap-2 flex-wrap">
              {metric.value}{metric.unit}
              {metric.type === 'conditional' && (
                <span className="text-sm font-semibold text-blue-700">or max flat ₹{metric.flatAmount}</span>
              )}
            </div>
          </div>

          {/* Input Section */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              {metric.type === 'amount' ? 'Transaction Volume (Count)' : 'Principal Amount (₹)'}
            </label>
            <input
              type="number"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Enter amount (e.g., 50000)"
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 mt-1">
              Enter the principal or base amount to simulate impact
            </p>
          </div>

          {/* Duration Selector */}
          <div className="mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-3">
              Duration: {duration} months
            </label>
            <input
              type="range"
              min="1"
              max="60"
              value={duration}
              onChange={(e) => setDuration(parseInt(e.target.value))}
              className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-2">
              <span>1 month</span>
              <span>5 years</span>
            </div>
          </div>

          {/* Result Display */}
          {hasResult && (
            <motion.div
              className="bg-gradient-to-r from-orange-50 to-red-50 border border-orange-200 rounded-lg p-4 mb-6"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <p className="text-xs text-orange-600 font-semibold mb-2">💰 Estimated Impact</p>
              <div className="text-3xl font-bold text-orange-900">
                ₹{result.toLocaleString('en-IN', { maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-orange-800 mt-2 p-2 bg-orange-100/50 rounded font-mono border border-orange-200 border-dashed">
                {metric.type === 'percentage' && metric.isPerAnnum && (
                  `Math: (₹${userInput} × ${metric.value / 100}) × (${duration}/12 months) = ₹${result.toFixed(0)}`
                )}
                {metric.type === 'percentage' && !metric.isPerAnnum && (
                  `Math: (₹${userInput} × ${metric.value / 100}) × ${duration} months = ₹${result.toFixed(0)}`
                )}
                {metric.type === 'amount' && (
                  `Math: ₹${metric.value} × ${duration} = ₹${result.toFixed(0)}`
                )}
                {metric.type === 'conditional' && (
                  `Math: Max(₹${userInput} × ${metric.value / 100}, ₹${metric.flatAmount}) × ${duration} months = ₹${result.toFixed(0)}`
                )}
              </div>
            </motion.div>
          )}

          {/* Warnings */}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-6">
            <p className="text-xs text-amber-900">
              <strong>⚠️ Disclaimer:</strong> Simplified for illustration. Actual impact may vary due to compounding or extra charges. Consult a financial advisor.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium transition-colors"
            >
              Close
            </button>

          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

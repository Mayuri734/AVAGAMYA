import { useMemo, useState, useEffect, useCallback } from 'react'
import { ChevronRight, TrendingUp, Volume2, Square, Brain, ChevronDown, ChevronUp } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

// ── ML types ──────────────────────────────────────────────────────────────────
interface MLFeatures {
  jargon_count: number
  word_count: number
  avg_word_length: number
  flesch_score: number
  has_currency: number
  has_percentage: number
  has_devanagari: number
  has_regional_risk: number
  sentence_length_z: number
  unique_word_ratio: number
}

interface MLInsightData {
  ml_risk_level: 'HIGH' | 'MEDIUM' | 'LOW' | 'UNKNOWN'
  ml_confidence: number
  ml_probabilities: Record<string, number>
  ml_features: MLFeatures
  symbolic_risk_level: string | null
  symbolic_score: number | null
  model_status: string
}

// ── Human-readable reason generator ──────────────────────────────────────────
// ── Consumer-friendly verdict ─────────────────────────────────────────────────
function getVerdict(riskLevel: string): { headline: string; subtext: string; bg: string; border: string; dot: string } {
  if (riskLevel === 'HIGH') return {
    headline: 'This clause needs your attention',
    subtext: 'Our AI found this clause could significantly affect your rights or money.',
    bg: 'bg-red-50', border: 'border-red-200', dot: 'bg-red-500',
  }
  if (riskLevel === 'MEDIUM') return {
    headline: 'Read this clause carefully',
    subtext: 'Our AI found this clause has some terms that may not be obvious at first glance.',
    bg: 'bg-amber-50', border: 'border-amber-200', dot: 'bg-amber-400',
  }
  return {
    headline: 'This clause looks routine',
    subtext: 'Our AI found this clause uses straightforward language with low risk to you.',
    bg: 'bg-green-50', border: 'border-green-200', dot: 'bg-green-500',
  }
}

// ── Plain-language reasons (what it means FOR the consumer) ───────────────────
function buildConsumerReasons(features: MLFeatures, riskLevel: string): Array<{ icon: string; text: string }> {
  const reasons: Array<{ icon: string; text: string }> = []

  if (features.jargon_count >= 3)
    reasons.push({ icon: '⚠️', text: 'Uses several legal terms that banks use to limit your rights — worth reading twice.' })
  else if (features.jargon_count >= 1)
    reasons.push({ icon: '📋', text: 'Contains legal terms that could quietly affect your rights or account.' })

  if (features.flesch_score < 30)
    reasons.push({ icon: '🔍', text: 'Written in very complex language — intentionally hard to understand for a regular person.' })
  else if (features.flesch_score < 50)
    reasons.push({ icon: '🔍', text: 'Written in dense language — take a moment to re-read this one.' })

  if (features.has_currency)
    reasons.push({ icon: '💸', text: 'Involves a specific amount of money that could be charged to you.' })

  if (features.has_percentage)
    reasons.push({ icon: '📈', text: 'Mentions a percentage — this could affect interest rates or charges on your account.' })

  if (features.has_devanagari && features.has_regional_risk)
    reasons.push({ icon: '🌐', text: 'Regional language clause with risk terms — make sure you fully understand what you\'re agreeing to.' })

  if (features.sentence_length_z > 1)
    reasons.push({ icon: '📜', text: 'This is an unusually long clause — it may bundle multiple conditions together that are easy to miss.' })

  if (features.avg_word_length > 6)
    reasons.push({ icon: '🔤', text: 'Uses very technical or legal vocabulary — you may want to ask someone to explain this.' })

  if (reasons.length === 0) {
    if (riskLevel === 'LOW')
      reasons.push({ icon: '✅', text: 'Standard clause with no unusual terms or hidden charges detected.' })
    else
      reasons.push({ icon: '🤖', text: 'Our AI detected a moderate risk pattern in how this clause is worded.' })
  }

  return reasons
}

// ── What should the user do? ──────────────────────────────────────────────────
function getActionTip(riskLevel: string): string {
  if (riskLevel === 'HIGH') return '👉 Ask your bank to explain this clause before signing.'
  if (riskLevel === 'MEDIUM') return '👉 Re-read this clause and check if any conditions apply to your situation.'
  return '👉 No action needed — this clause is standard.'
}

// ── ML Insight Panel (Consumer-Friendly) ─────────────────────────────────────
const MLInsightPanel = ({
  clauseText,
  pageType = "TEXT", // New
  prefetchedData,
}: {
  clauseText: string
  pageType?: string
  prefetchedData?: MLInsightData | null
}) => {
  const [data, setData] = useState<MLInsightData | null>(prefetchedData ?? null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [fetched, setFetched] = useState(!!prefetchedData)

  // Sync if batch data arrives after mount
  useEffect(() => {
    if (prefetchedData && !fetched) {
      setData(prefetchedData)
      setFetched(true)
    }
  }, [prefetchedData, fetched])

  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  const fetchInsight = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (fetched) { setExpanded(p => !p); return }
    setLoading(true)
    setExpanded(true)
    try {
      const res = await fetch(`${baseUrl}/analyze/ml-risk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          clause: clauseText, 
          compare_symbolic: true,
          page_type: pageType 
        }),
      })
      const json: MLInsightData = await res.json()
      setData(json)
      setFetched(true)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [clauseText, fetched, baseUrl])

  return (
    <div className="mt-2">
      {/* Trigger button */}
      <button
        onClick={fetchInsight}
        className="flex items-center gap-1.5 text-xs font-semibold text-purple-700 bg-purple-50 hover:bg-purple-100 border border-purple-200 px-2.5 py-1.5 rounded-lg transition-colors w-full justify-between"
      >
        <span className="flex items-center gap-1.5">
          <Brain className="w-3.5 h-3.5" />
          {loading ? 'AI is checking this clause...' : 'What does AI think?'}
        </span>
        {loading
          ? <span className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
          : expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />
        }
      </button>

      {/* Expanded panel */}
      <AnimatePresence>
        {expanded && data && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.22 }}
            className="overflow-hidden"
          >
            <div className="mt-2 rounded-xl border border-purple-100 bg-white shadow-sm overflow-hidden">

              {/* Verdict header */}
              {(() => {
                const v = getVerdict(data.ml_risk_level)
                return (
                  <div className={`${v.bg} ${v.border} border-b px-3 py-2.5 flex items-start gap-2.5`}>
                    <span className={`mt-0.5 w-2.5 h-2.5 rounded-full flex-shrink-0 ${v.dot}`} />
                    <div>
                      <p className="text-sm font-bold text-gray-800">{v.headline}</p>
                      <p className="text-xs text-gray-600 mt-0.5 leading-snug">{v.subtext}</p>
                    </div>
                  </div>
                )
              })()}

              {/* Reasons */}
              <div className="px-3 py-2.5 space-y-1.5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Why you should know this</p>
                {buildConsumerReasons(data.ml_features, data.ml_risk_level).map((r, i) => (
                  <div key={i} className="flex items-start gap-2 bg-gray-50 rounded-lg px-2.5 py-2 border border-gray-100">
                    <span className="text-sm leading-none mt-px flex-shrink-0">{r.icon}</span>
                    <p className="text-xs text-gray-700 leading-snug">{r.text}</p>
                  </div>
                ))}
              </div>

              {/* Action tip */}
              <div className="px-3 pb-3">
                <div className="bg-purple-50 border border-purple-100 rounded-lg px-3 py-2">
                  <p className="text-xs text-purple-800 font-medium leading-snug">
                    {getActionTip(data.ml_risk_level)}
                  </p>
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}


export interface RiskClause {
  id: number
  page: number
  page_type?: string // New
  original_text: string
  simplified: string
  risk_score: number
  highlight_coords?: Array<[number, number, number, number, number]>
}

interface RiskSidebarProps {
  clauses: RiskClause[]
  selectedClauseId: number | null
  onSelectClause: (clauseId: number) => void
  onSimulateFinancialImpact?: (clause: RiskClause) => void
  totalScanned: number
  avgRiskScore: number
  documentLanguage?: string
}

export function RiskSidebar({
  clauses,
  selectedClauseId,
  onSelectClause,
  onSimulateFinancialImpact,
  avgRiskScore,
  documentLanguage,
}: RiskSidebarProps) {
  const hasFinancialMetric = (text: string) =>
    /([\d\u0966-\u096F]+(?:\.[\d\u0966-\u096F]+)?)\s*%|(?:₹|Rs\.?)\s*([\d\u0966-\u096F,]+(?:\.[\d\u0966-\u096F]+)?)/.test(text)

  const sortedClauses = useMemo(
    () => [...clauses].sort((a, b) => b.risk_score - a.risk_score),
    [clauses]
  )

  const getRiskLevel = (score: number): 'CRITICAL' | 'HIGH' | 'MEDIUM' => {
    if (score >= 80) return 'CRITICAL'
    if (score >= 70) return 'HIGH'
    return 'MEDIUM'
  }
  const getRiskColor = (score: number) => {
    if (score >= 80) return 'text-red-700 bg-red-50'
    if (score >= 70) return 'text-orange-700 bg-orange-50'
    return 'text-yellow-700 bg-yellow-50'
  }
  const getRiskBadgeColor = (score: number) => {
    if (score >= 80) return 'bg-red-500'
    if (score >= 70) return 'bg-orange-500'
    return 'bg-yellow-500'
  }

  // ── Batch ML Scan state ───────────────────────────────────────────────
  const [mlBatchResults, setMlBatchResults] = useState<Record<number, MLInsightData>>({})
  const [batchLoading, setBatchLoading]     = useState(false)
  const [batchDone, setBatchDone]           = useState(false)
  const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  const runBatchML = useCallback(async () => {
    if (batchLoading || clauses.length === 0) return
    setBatchLoading(true)
    setBatchDone(false)

    const results = await Promise.allSettled(
      clauses.map(async (clause) => {
        const res = await fetch(`${baseUrl}/analyze/ml-risk`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            clause: clause.original_text, 
            compare_symbolic: true,
            page_type: clause.page_type || "TEXT"
          }),
        })
        const json: MLInsightData = await res.json()
        return { id: clause.id, data: json }
      })
    )

    const map: Record<number, MLInsightData> = {}
    results.forEach((r) => {
      if (r.status === 'fulfilled') map[r.value.id] = r.value.data
    })
    setMlBatchResults(map)
    setBatchLoading(false)
    setBatchDone(true)
  }, [clauses, batchLoading, baseUrl])

  // ── Batch summary stats ───────────────────────────────────────────────
  const batchSummary = useMemo(() => {
    if (!batchDone) return null
    const vals = Object.values(mlBatchResults)
    const high   = vals.filter(v => v.ml_risk_level === 'HIGH').length
    const medium = vals.filter(v => v.ml_risk_level === 'MEDIUM').length
    const low    = vals.filter(v => v.ml_risk_level === 'LOW').length
    const disagree = clauses.filter(c => {
      const r = mlBatchResults[c.id]
      if (!r) return false
      // rule engine level derived from risk_score
      const ruleLevel = c.risk_score >= 80 ? 'HIGH' : c.risk_score >= 70 ? 'HIGH' : 'MEDIUM'
      return r.ml_risk_level !== ruleLevel && r.symbolic_risk_level !== null
    })
    return { high, medium, low, total: vals.length, disagree }
  }, [batchDone, mlBatchResults, clauses])

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-4 py-4 flex-shrink-0 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-bold text-[#000F2E]">High-Risk Analysis</h2>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-gray-500 font-semibold text-xs mb-1">DETECTED</p>
            <p className="text-2xl font-bold text-red-600">{clauses.length}</p>
          </div>
          <div>
            <p className="text-gray-500 font-semibold text-xs mb-1">AVG RISK</p>
            <p className="text-2xl font-bold text-orange-500">{avgRiskScore.toFixed(0)}</p>
          </div>
        </div>

        {/* Batch ML Scan button */}
        {clauses.length > 0 && (
          <button
            onClick={runBatchML}
            disabled={batchLoading}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl text-xs font-bold transition-all duration-200
              bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700
              text-white shadow-sm disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {batchLoading ? (
              <>
                <span className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Scanning all {clauses.length} clauses with AI...
              </>
            ) : batchDone ? (
              <>click to rescan</>
            ) : (
              <>
                <Brain className="w-3.5 h-3.5" />
                Run Full AI Scan ({clauses.length} clauses)
              </>
            )}
          </button>
        )}

        {/* Batch summary panel */}
        <AnimatePresence>
          {batchSummary && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.25 }}
              className="overflow-hidden"
            >
              <div className="rounded-xl border border-purple-100 bg-gradient-to-br from-purple-50 to-indigo-50 p-3 space-y-2">
                <p className="text-xs font-bold text-purple-800">🤖 AI scanned all {batchSummary.total} clauses</p>

                {/* Risk breakdown */}
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="bg-red-50 border border-red-200 rounded-lg py-1.5 text-center">
                    <p className="text-base font-black text-red-600">{batchSummary.high}</p>
                    <p className="text-[10px] text-red-500 font-semibold">HIGH</p>
                  </div>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg py-1.5 text-center">
                    <p className="text-base font-black text-amber-600">{batchSummary.medium}</p>
                    <p className="text-[10px] text-amber-500 font-semibold">MEDIUM</p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-lg py-1.5 text-center">
                    <p className="text-base font-black text-green-600">{batchSummary.low}</p>
                    <p className="text-[10px] text-green-500 font-semibold">LOW</p>
                  </div>
                </div>

                {/* Disagreement alert */}
                {batchSummary.disagree.length > 0 && (
                  <div className="bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-2">
                    <p className="text-xs font-semibold text-amber-800">
                      ⚠️ AI found {batchSummary.disagree.length} clause{batchSummary.disagree.length > 1 ? 's' : ''} riskier than initially scored
                    </p>
                    <p className="text-[10px] text-amber-600 mt-0.5">
                      Clause{batchSummary.disagree.length > 1 ? 's' : ''}{' '}
                      {batchSummary.disagree.map(c => `#${c.id}`).join(', ')} — check AI Insight
                    </p>
                  </div>
                )}

                {batchSummary.disagree.length === 0 && (
                  <p className="text-[10px] text-purple-600">✅ AI agrees with all initial scores.</p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Clauses List */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {sortedClauses.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <div className="text-green-500 text-3xl mb-2">✓</div>
            <p className="text-sm font-semibold text-gray-600">No High-Risk Clauses</p>
            <p className="text-xs text-gray-500 mt-1">Document is clean</p>
          </div>
        ) : (
          sortedClauses.map((clause, index) => {
            const isSelected = selectedClauseId === clause.id
            const riskLevel = getRiskLevel(clause.risk_score)

            return (
              <motion.button
                key={clause.id}
                onClick={() => onSelectClause(clause.id)}
                className={`w-full text-left p-5 rounded-xl border-2 transition-all duration-200 group ${isSelected
                  ? 'border-red-500 bg-red-50 shadow-md'
                  : 'border-slate-200 bg-white hover:border-red-300 hover:bg-red-50/50'
                  }`}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
              >
                {/* Top Row: ID, Page, Risk Badge */}
                <div className="flex items-start justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-600">
                      Clause {clause.id}
                    </span>
                    <span className="text-xs text-gray-500">•</span>
                    <span className="text-xs font-semibold text-gray-600">
                      📄 Page {clause.page}
                    </span>
                  </div>
                  <div
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-white text-xs font-bold ${getRiskBadgeColor(
                      clause.risk_score
                    )}`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-white' : 'bg-white/70'
                        }`}
                    />
                    {riskLevel}
                  </div>
                </div>
                {/* Original Text - Removed line-clamp-2 */}
                <p className="text-xs font-semibold text-gray-900 mb-2 leading-snug">
                  {clause.original_text}
                </p>
                {/* Simplified / translated explanation - Full width of card */}
                <div className="bg-blue-50/80 rounded-lg p-3 w-full mb-3 border border-blue-100">
                  <p
                    className="text-sm font-medium text-blue-900 leading-relaxed break-words"
                    dir="auto"
                  >
                    {clause.simplified
                      .replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '')
                      .replace(/^(here's|here is|this is|simplified|explanation|simplified version).*?:\s*/i, '')
                      .trim()}
                  </p>
                </div>

                {/* ML Insight Panel — uses batch cache if available */}
                <MLInsightPanel
                  clauseText={clause.original_text}
                  pageType={clause.page_type}
                  prefetchedData={mlBatchResults[clause.id] ?? null}
                />

                {/* Footer: Score + Buttons */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-gray-600">Score:</span>
                    <div className="relative w-20 h-1.5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full ${getRiskBadgeColor(clause.risk_score)}`}
                        style={{
                          width: `${(clause.risk_score / 100) * 100}%`,
                        }}
                      />
                    </div>
                    <span className={`text-xs font-bold ${getRiskColor(clause.risk_score)}`}>
                      {clause.risk_score.toFixed(0)}/100
                    </span>
                  </div>

                  {/* Button Group */}
                  <div className="flex gap-1">
                    {/* TTS Read Aloud Button */}
                    <TTSButton text={clause.simplified} langCode={documentLanguage} />

                    {/* Financial Simulator (if metrics detected) */}
                    {hasFinancialMetric(clause.original_text) && onSimulateFinancialImpact && (
                      <div
                        onClick={(e) => {
                          e.stopPropagation()
                          onSimulateFinancialImpact(clause)
                        }}
                        className="p-1.5 rounded-lg bg-blue-100 hover:bg-blue-200 transition-colors cursor-pointer"
                        title="Calculate Financial Impact"
                      >
                        <TrendingUp className="w-4 h-4 text-blue-600" />
                      </div>
                    )}

                    {/* Show in PDF button */}
                    <div
                      onClick={(e) => {
                        e.stopPropagation()
                        onSelectClause(clause.id)
                      }}
                      className="ml-2 p-1.5 rounded-lg bg-gray-100 group-hover:bg-gray-200 transition-colors cursor-pointer"
                      title="Show in PDF"
                    >
                      <ChevronRight className="w-4 h-4 text-gray-700" />
                    </div>
                  </div>
                </div>
              </motion.button>
            )
          })
        )}
      </div>


    </div>
  )
}

const audioCache = new Map<string, HTMLAudioElement>()
let currentAudio: HTMLAudioElement | null = null

const TTSButton = ({ text, langCode }: { text: string; langCode?: string }) => {
  const [isPlaying, setIsPlaying] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    return () => {
      if (isPlaying && currentAudio) {
        currentAudio.pause()
        currentAudio.currentTime = 0
      }
      window.speechSynthesis.cancel()
    }
  }, [isPlaying])

  const fallbackToLocalTTS = (safeText: string, targetLang: string) => {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(safeText)
    utterance.lang = targetLang

    const voices = window.speechSynthesis.getVoices()
    const selectedVoice = voices.find(voice => 
      targetLang.startsWith('hi') || targetLang.startsWith('mr') 
        ? (voice.lang.includes('hi') || voice.lang.includes('IN'))
        : voice.lang.includes(targetLang) || voice.lang.includes('IN')
    )
    
    if (selectedVoice) {
      utterance.voice = selectedVoice
    }
    
    utterance.rate = 0.9
    utterance.onend = () => setIsPlaying(false)
    utterance.onerror = () => setIsPlaying(false)

    setIsPlaying(true)
    window.speechSynthesis.speak(utterance)
  }

  const handleTTS = async (e: React.MouseEvent) => {
    e.stopPropagation()

    if (isPlaying) {
      if (currentAudio) {
        currentAudio.pause()
        currentAudio.currentTime = 0
      }
      window.speechSynthesis.cancel()
      setIsPlaying(false)
      setIsLoading(false)
      return
    }

    // Stop any previously playing audio globally
    if (currentAudio) {
      currentAudio.pause()
      currentAudio.currentTime = 0
    }
    window.speechSynthesis.cancel()

    // Clean text before reading
    const cleanText = text
      .replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '')
      .replace(/^(here's|here is|this is|simplified|explanation|simplified version).*?:\s*/i, '')
      .trim()

    // Text Sanitization (Edge Cases)
    const safeText = cleanText
      .replace(/₹/g, ' रुपये ')
      .replace(/Rs\.?/gi, ' rupees ')
    
    // Language Detection & Mapping
    const isIndic = /[\u0900-\u097F]/.test(safeText)
    let targetLang = 'en-US'

    if (langCode === 'hi') {
      targetLang = 'hi-IN'
    } else if (langCode === 'mr') {
      targetLang = 'mr-IN'
    } else if (langCode === 'en') {
      targetLang = 'en-IN'
    } else if (isIndic) {
      targetLang = 'hi-IN'
    }

    const cacheKey = `${targetLang}_${safeText}`

    // Check Cache
    if (audioCache.has(cacheKey)) {
      const audio = audioCache.get(cacheKey)!
      currentAudio = audio
      audio.onended = () => setIsPlaying(false)
      audio.onerror = () => {
        setIsPlaying(false)
        fallbackToLocalTTS(safeText, targetLang)
      }
      setIsPlaying(true)
      audio.play().catch(() => fallbackToLocalTTS(safeText, targetLang))
      return
    }

    // Fetch from Backend API
    try {
      setIsLoading(true)
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
      const response = await fetch(`${baseUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: safeText, language: targetLang })
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.statusText}`)
      }

      const data = await response.json()
      if (!data.audio) {
        throw new Error('No audio returned')
      }

      const audioSrc = `data:audio/wav;base64,${data.audio}`
      const audio = new Audio(audioSrc)
      audioCache.set(cacheKey, audio)
      currentAudio = audio

      audio.onended = () => setIsPlaying(false)
      audio.onerror = () => {
        setIsPlaying(false)
        fallbackToLocalTTS(safeText, targetLang)
      }

      setIsLoading(false)
      setIsPlaying(true)
      audio.play().catch(() => fallbackToLocalTTS(safeText, targetLang))

    } catch (error) {
      console.error("Sarvam API TTS failed, falling back to local TTS:", error)
      setIsLoading(false)
      fallbackToLocalTTS(safeText, targetLang)
    }
  }

  return (
    <div
      onClick={handleTTS}
      className={`p-1.5 rounded-lg transition-colors cursor-pointer flex items-center justify-center ${
        isPlaying 
          ? 'bg-orange-100 text-orange-600 hover:bg-orange-200' 
          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
      } ${isLoading ? 'opacity-70' : ''}`}
      title={isPlaying ? "Stop Reading" : "Read Aloud"}
    >
      {isPlaying ? (
        <Square className="w-4 h-4 fill-current" />
      ) : (
        <Volume2 className={`w-4 h-4 ${isLoading ? 'animate-pulse text-blue-500' : ''}`} />
      )}
    </div>
  )
}

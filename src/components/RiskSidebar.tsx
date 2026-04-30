import { useMemo, useState, useEffect } from 'react'
import { ChevronRight, TrendingUp, Volume2, Square } from 'lucide-react'
import { motion } from 'framer-motion'

export interface RiskClause {
  id: number
  page: number
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
  // Detect if clause has financial metrics
  // Detect if clause has financial metrics (Supports Arabic and Devanagari numerals)
  const hasFinancialMetric = (text: string) => {
    return /([\d\u0966-\u096F]+(?:\.[\d\u0966-\u096F]+)?)\s*%|(?:₹|Rs\.?)\s*([\d\u0966-\u096F,]+(?:\.[\d\u0966-\u096F]+)?)/.test(text)
  }
  // Sort clauses by risk score (highest first)
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

  return (
    <div className="h-full flex flex-col bg-white border-l border-gray-200 overflow-hidden">
      {/* Header */}
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-6 flex-shrink-0">
        <div className="flex items-center justify-center lg:justify-start gap-3 mb-3">
          <h2 className="text-xl font-bold text-[#000F2E]">High-Risk Analysis</h2>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-gray-500 font-semibold text-xs mb-1">DETECTED</p>
            <p className="text-2xl font-bold text-red-600">{clauses.length}</p>
          </div>
          <div>
            <p className="text-gray-500 font-semibold text-xs mb-1">AVG RISK</p>
            <p className="text-2xl font-bold text-orange-500">
              {avgRiskScore.toFixed(0)}
            </p>
          </div>
        </div>
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

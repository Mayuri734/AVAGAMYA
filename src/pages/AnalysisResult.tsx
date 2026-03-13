import { useState, useMemo, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { PDFInspector, type HighlightCoord } from '../components/PDFInspector'
import { RiskSidebar, type RiskClause } from '../components/RiskSidebar'
import { FinancialSimulatorModal } from '../components/FinancialSimulator'

interface ApiResponse {
  status: 'ANALYSIS_COMPLETE' | 'BLOCKED'
  pii_result: 'OK' | 'BLOCKED'
  message?: string | null
  meta?: {
    total_scanned: number
    high_risk_found: number
  }
  high_risk_clauses?: Array<{
    id: number
    page: number
    original_text: string
    simplified: string
    risk_score: number
    highlight_coords?: Array<[number, number, number, number, number]>
  }>
}

interface LocationState {
  analysis: ApiResponse
  pdfFile: File
}

export function AnalysisResult() {
  const location = useLocation()
  const [selectedClauseId, setSelectedClauseId] = useState<number | null>(null)
  const [activeTab, setActiveTab] = useState<'document' | 'analysis'>('document')
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [simulatorOpen, setSimulatorOpen] = useState(false)
  const [selectedClauseForSimulator, setSelectedClauseForSimulator] = useState<RiskClause | null>(null)

  const state = location.state as LocationState | null

  // Debug: Log state to console with detailed info
  useEffect(() => {
    console.log('=== AnalysisResult Component ===')
    console.log('Full location:', location)
    console.log('location.state:', location.state)
    console.log('state object:', state)
    console.log('analysis present:', !!state?.analysis)
    console.log('pdfFile present:', !!state?.pdfFile)
    console.log('pdfUrl state:', pdfUrl)

    if (!state) {
      console.warn('WARNING: No state data! Did navigation preserve state?')
    }
    if (state && !state.analysis) {
      console.warn('WARNING: State exists but analysis is missing')
    }
    if (state && !state.pdfFile) {
      console.warn('WARNING: State exists but pdfFile is missing')
    }
  }, [state, pdfUrl])

  // Convert PDF file to blob URL
  useEffect(() => {
    if (state?.pdfFile) {
      try {
        // Protect against React Router hard-refresh serialization loss
        // where a File object becomes a generic empty object {}
        const pdfFileObj = state.pdfFile as any;
        if (!(pdfFileObj instanceof Blob || pdfFileObj instanceof File)) {
          console.warn('pdfFile is not a valid Blob/File object (likely due to page refresh).');
          setError('Session expired or page refreshed. Please re-upload the document.');
          return;
        }

        console.log(' Creating blob URL from PDF file:', state.pdfFile.name, 'Size:', state.pdfFile.size, 'bytes')
        const url = URL.createObjectURL(state.pdfFile)
        console.log(' Blob URL created:', url)
        setPdfUrl(url)
        setError(null)

        return () => {
          console.log(' Revoking blob URL')
          URL.revokeObjectURL(url)
        }
      } catch (err) {
        console.error(' Error creating Blob URL:', err)
        setError('Failed to load PDF file')
      }
    } else {
      console.warn('No PDF file in state')
    }
  }, [state?.pdfFile])

  const analysis = state?.analysis

  // Show error if present (render inside layout)
  if (error) {
    console.error('AnalysisResult error:', error)
  }

  const hasAnalysis = !!analysis
  const hasPdf = !!pdfUrl

  // Instead of returning early and risking a blank white page, render the
  // app chrome (top bar + split layout) and show clear placeholders when
  // analysis or PDF is missing. This makes UI visible for debugging.

  const riskClauses: RiskClause[] = useMemo(() => {
    return analysis?.high_risk_clauses || []
  }, [analysis?.high_risk_clauses])

  // Transform backend highlight_coords into PDFInspector HighlightCoord format (Flattening multi-rect structures)
  const highlights: HighlightCoord[] = useMemo(
    () =>
      analysis?.high_risk_clauses
        ?.filter((clause) => clause.highlight_coords && clause.highlight_coords.length > 0)
        .flatMap((clause) => {
          return clause.highlight_coords!.map(coordSet => {
            const [page, x, y, width, height] = coordSet
            return {
              page,
              x,
              y,
              width,
              height,
              clauseId: clause.id,
              riskScore: clause.risk_score,
              isSelected: clause.id === selectedClauseId,
            }
          })
        }) ?? [],
    [analysis?.high_risk_clauses, selectedClauseId],
  )

  const avgRiskScore = useMemo(() => {
    if (riskClauses.length === 0) return 0
    return riskClauses.reduce((sum, c) => sum + c.risk_score, 0) / riskClauses.length
  }, [riskClauses])

  // Fallback: If we have analysis but no PDF, show data in a simplified view
  if (analysis && !pdfUrl) {
    return (
      <div className="min-h-screen flex flex-col bg-slate-50">
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <h1 className="text-xl font-bold text-gray-900">Analysis Complete</h1>
          <p className="text-sm text-gray-500 mt-1">(Loading PDF...)</p>
        </div>

        <div className="flex-1 p-6">
          <div className="max-w-2xl">
            <h2 className="text-lg font-bold text-gray-900 mb-4">High-Risk Clauses Found: {riskClauses.length}</h2>
            <div className="space-y-3">
              {riskClauses.map((clause) => (
                <div
                  key={clause.id}
                  className="p-4 rounded-lg bg-white border border-red-200"
                >
                  <div className="flex justify-between items-start mb-2">
                    <p className="text-sm font-bold text-gray-900">
                      Clause {clause.id} • Page {clause.page}
                    </p>
                    <span className="px-2 py-1 rounded text-xs font-bold bg-red-100 text-red-700">
                      {clause.risk_score.toFixed(0)}/100
                    </span>
                  </div>
                  <p className="text-sm text-gray-600 mb-2">{clause.original_text}</p>
                  <p
                    className="p-2 bg-blue-50 rounded text-sm font-medium text-blue-900 leading-relaxed break-words"
                    dir="auto"
                  >
                    {clause.simplified
                      .replace(/<think>[\s\S]*?(?:<\/think>|$)/g, '')
                      .replace(/^(here's|here is|this is|simplified|explanation|simplified version).*?:\s*/i, '')
                      .trim()}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const handleSimulateFinancialImpact = (clause: RiskClause) => {
    setSelectedClauseForSimulator(clause)
    setSimulatorOpen(true)
  }

  return (
    <div className="h-screen flex flex-col bg-slate-50 overflow-hidden">


      {/* Mobile Tab Switcher */}
      <div className="lg:hidden flex justify-center p-4 bg-white border-b border-slate-200 shadow-sm z-10">
        <div className="flex bg-slate-100 p-1 rounded-full w-full max-w-sm">
          <button
            onClick={() => setActiveTab('document')}
            className={`flex-1 py-2 text-sm font-bold rounded-full transition-all ${activeTab === 'document' ? 'bg-white shadow text-[#000F2E]' : 'text-slate-500'
              }`}
          >
            Document
          </button>
          <button
            onClick={() => setActiveTab('analysis')}
            className={`flex-1 py-2 text-sm font-bold rounded-full transition-all ${activeTab === 'analysis' ? 'bg-white shadow text-[#000F2E]' : 'text-slate-500'
              }`}
          >
            Analysis
          </button>
        </div>
      </div>

      {/* Main Content: Split Screen / Stacked on Mobile */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        {/* Top/Left Panel: PDF Inspector */}
        <div className={`flex-1 w-full lg:min-w-0 relative h-[calc(100vh-8rem)] lg:h-auto ${activeTab === 'document' ? 'block' : 'hidden lg:block'}`}>
          {hasPdf ? (
            <PDFInspector
              pdfUrl={pdfUrl as string}
              highlights={highlights}
              selectedClauseId={selectedClauseId}
              onPageChange={(page) => {
                console.log(`Navigated to page ${page}`)
              }}
            />
          ) : (
            <div className="h-full flex flex-col items-center justify-center p-8">
              <div className="max-w-lg w-full bg-white rounded-lg shadow p-8 text-center">
                <div className="text-3xl mb-4">📄</div>
                <h2 className="text-lg font-semibold mb-2">No PDF Loaded</h2>
                <p className="text-sm text-gray-600 mb-4">
                  Please refresh the page or upload a new document.
                </p>
                <p className="text-xs text-gray-400 mt-3">{hasAnalysis ? 'Analysis present' : 'No analysis'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Bottom/Right Panel: Risk Sidebar */}
        <div className={`w-full lg:w-[450px] lg:max-w-[40%] relative border-t lg:border-t-0 lg:border-l border-slate-200 h-[calc(100vh-8rem)] lg:h-auto ${activeTab === 'analysis' ? 'block' : 'hidden lg:block'}`}>
          {hasAnalysis ? (
            <RiskSidebar
              clauses={riskClauses}
              selectedClauseId={selectedClauseId}
              onSelectClause={(id) => {
                setSelectedClauseId(id)
                setActiveTab('document')
              }}
              onSimulateFinancialImpact={handleSimulateFinancialImpact}
              totalScanned={analysis?.meta?.total_scanned || 0}
              avgRiskScore={avgRiskScore}
            />
          ) : (
            <div className="p-6 h-full overflow-auto">
              <div className="bg-white rounded-lg shadow p-4">
                <h3 className="font-semibold">No Analysis Data</h3>
                <p className="text-sm text-gray-600 mt-2">Please refresh the page or upload a new document.</p>
              </div>
            </div>
          )}
        </div>
      </div>



      {/* Financial Simulator Modal */}
      {selectedClauseForSimulator && (
        <FinancialSimulatorModal
          isOpen={simulatorOpen}
          clause={selectedClauseForSimulator}
          onClose={() => setSimulatorOpen(false)}
        />
      )}
    </div>
  )
}

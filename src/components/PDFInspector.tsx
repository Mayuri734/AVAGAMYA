import { useEffect, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'

export interface HighlightCoord {
  page: number
  x: number
  y: number
  width: number
  height: number
  clauseId: number
  riskScore: number
  isSelected?: boolean
}

interface PDFInspectorProps {
  pdfUrl: string
  highlights?: HighlightCoord[]
  selectedClauseId?: number | null
  onPageChange?: (page: number) => void
}

export function PDFInspector({
  pdfUrl,
  highlights = [],
  selectedClauseId,
  onPageChange,
}: PDFInspectorProps) {
  // Configure pdf.js worker - use local worker file
  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfjsAny = pdfjs as any
    // Use local worker file (bundled with Vite)
    pdfjsAny.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
    // eslint-disable-next-line no-console
    console.log('✅ pdfjs worker configured: version 5.4.296 (local worker)')
  }, [])

  const [loadError, setLoadError] = useState<string | null>(null)
  const [zoomScale, setZoomScale] = useState(1)
  const [currentPage, setCurrentPage] = useState(1)
  const [numPages, setNumPages] = useState<number | null>(null)
  const [originalWidth, setOriginalWidth] = useState<number | null>(null)
  const [originalHeight, setOriginalHeight] = useState<number | null>(null)
  const [renderedPageWidth, setRenderedPageWidth] = useState<number | null>(null)
  const [renderedPageHeight, setRenderedPageHeight] = useState<number | null>(null)
  const [containerWidth, setContainerWidth] = useState<number>(612)
  const containerRef = useRef<HTMLDivElement>(null)
  const pageRef = useRef<HTMLDivElement>(null)

  // ── AI Page Classification (Feature 3 - Feature C) ────────────────────────
  const [cvData, setCvData] = useState<Record<number, { type: string; confidence: number }>>({})
  const [cvLoading, setCvLoading] = useState(false)

  const fetchPageType = async (page: number) => {
    if (cvData[page] || cvLoading || !pdfUrl) return
    
    setCvLoading(true)
    try {
      const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'
      
      // 1. Get the PDF blob from the URL
      const pdfBlob = await fetch(pdfUrl).then(r => r.blob())
      const file = new File([pdfBlob], 'document.pdf', { type: 'application/pdf' })

      // 2. Call our proxy endpoint
      const formData = new FormData()
      formData.append('file', file)
      
      const res = await fetch(`${baseUrl}/analyze/cv-verify-page?page_number=${page}`, {
        method: 'POST',
        body: formData
      })
      
      if (res.ok) {
        const result = await res.json()
        setCvData(prev => ({ 
          ...prev, 
          [page]: { type: result.page_type, confidence: result.confidence } 
        }))
      }
    } catch (err) {
      console.error('AI Page Classification failed:', err)
    } finally {
      setCvLoading(false)
    }
  }

  // Trigger classification when page changes
  useEffect(() => {
    if (numPages) fetchPageType(currentPage)
  }, [currentPage, numPages, pdfUrl])

  const PAGE_METADATA: Record<string, { icon: string; color: string; label: string }> = {
    TABLE:  { icon: '📊', color: 'text-blue-600 bg-blue-50 border-blue-200', label: 'TABLE' },
    TEXT:   { icon: '📄', color: 'text-slate-600 bg-slate-50 border-slate-200', label: 'TEXT' },
    MIXED:  { icon: '🔀', color: 'text-purple-600 bg-purple-50 border-purple-200', label: 'MIXED' },
    HEADER: { icon: '📋', color: 'text-amber-600 bg-amber-50 border-amber-200', label: 'HEADER' },
  }

  // Dynamically calculate the safe width for the PDF based on the container constraints
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        const computedStyle = window.getComputedStyle(containerRef.current)
        const paddingLeft = parseFloat(computedStyle.paddingLeft)
        const paddingRight = parseFloat(computedStyle.paddingRight)

        // Ensure the width doesn't exceed 612px (standard letter width) but fits nicely into mobile formats
        const safeWidth = containerRef.current.clientWidth - paddingLeft - paddingRight
        setContainerWidth(Math.min(612, safeWidth))
      }
    }

    updateWidth()

    const observer = new ResizeObserver(updateWidth)
    if (containerRef.current) {
      observer.observe(containerRef.current)
    }

    return () => observer.disconnect()
  }, [])

  // Debug: Log PDF URL when it changes
  useEffect(() => {
    if (pdfUrl) {
      console.log('📄 PDF URL available:', pdfUrl.substring(0, 100) + '...')
    } else {
      console.warn('⚠️ No PDF URL provided')
    }
  }, [pdfUrl])

  // Handle zoom
  const handleZoomIn = () => setZoomScale((prev) => Math.min(prev + 0.2, 3))
  const handleZoomOut = () => setZoomScale((prev) => Math.max(prev - 0.2, 0.5))
  const handleResetZoom = () => setZoomScale(1)

  // Handle page navigation
  const handlePrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((prev) => prev - 1)
    }
  }

  const handleNextPage = () => {
    if (numPages && currentPage < numPages) {
      setCurrentPage((prev) => prev + 1)
    }
  }

  // Scroll to selected page
  useEffect(() => {
    if (selectedClauseId !== undefined && selectedClauseId !== null) {
      const selectedHighlight = (highlights || []).find(
        (h) => h.clauseId === selectedClauseId
      )
      if (selectedHighlight) {
        setCurrentPage(selectedHighlight.page)
        onPageChange?.(selectedHighlight.page)
      }
    }
  }, [selectedClauseId, highlights, onPageChange])

  const onDocumentLoadSuccess = ({ numPages }: { numPages: number }) => {
    setNumPages(numPages)
    setLoadError(null)
    // eslint-disable-next-line no-console
    console.log(`✅ PDF loaded successfully with ${numPages} pages`)
  }

  const onDocumentLoadError = (err: unknown) => {
    console.error('❌ Document load error:', err)
    setLoadError(String(err))
  }

  const onPageLoadSuccess = (page: any) => {
    // Get the original PDF page dimensions in points (typically 612x792 for letter-size)
    const originalPageWidth = page.width
    const originalPageHeight = page.height
    setOriginalWidth(originalPageWidth)
    setOriginalHeight(originalPageHeight)

    // Get the actual rendered dimensions by querying the DOM
    if (pageRef.current) {
      const canvas = pageRef.current.querySelector('canvas')
      if (canvas) {
        // Get rendered pixel dimensions from canvas
        const actualRenderedWidth = canvas.width
        const actualRenderedHeight = canvas.height
        setRenderedPageWidth(actualRenderedWidth)
        setRenderedPageHeight(actualRenderedHeight)

        // eslint-disable-next-line no-console
        console.log(
          `✅ Page rendered: original=${originalPageWidth}pt×${originalPageHeight}pt, ` +
          `rendered=${actualRenderedWidth}px×${actualRenderedHeight}px, ` +
          `scale=${(actualRenderedWidth / originalPageWidth).toFixed(2)}`
        )
      }
    }
  }

  // Get highlights for current page
  const currentPageHighlights = (highlights || []).filter(
    (h) => h.page === currentPage
  )

  return (
    <div className="h-full flex flex-col relative bg-gradient-to-b from-slate-100 to-slate-50">
      <div
        ref={containerRef}
        className="flex-1 overflow-auto flex justify-center p-2 sm:p-4 md:p-8 bg-gradient-to-b from-slate-100/50 to-slate-50/50"
      >
        <div
          ref={pageRef}
          className="relative bg-white rounded-lg shadow-2xl transition-all duration-200"
        >
          {/* PDF Document */}
          <Document
            file={pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
            onLoadError={onDocumentLoadError}
            loading={
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-500 text-center">
                  <div className="animate-spin mb-3">📄</div>
                  <p>Loading PDF...</p>
                </div>
              </div>
            }
            error={
              <div className="text-red-500 p-4">
                <p>Error loading PDF</p>
                <p className="text-sm mt-2">The PDF file could not be loaded. Please try uploading again.</p>
                {loadError && (
                  <pre className="text-xs text-red-700 mt-2 whitespace-pre-wrap">{loadError}</pre>
                )}
              </div>
            }
          >
            <Page
              pageNumber={currentPage}
              width={containerWidth * zoomScale}
              renderTextLayer={true}
              renderAnnotationLayer={true}
              onLoadSuccess={onPageLoadSuccess}
            />

            {/* Red Highlight Overlays */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
              {currentPageHighlights.map((highlight) => {
                // Calculate dynamic scale factors based on actual rendered dimensions
                // Backend returns coordinates in PDF points (typically 612×792 for letter-size)
                const pdfOriginalWidth = originalWidth || 612
                const pdfOriginalHeight = originalHeight || 792

                const scaleX = renderedPageWidth ? renderedPageWidth / pdfOriginalWidth : 1
                const scaleY = renderedPageHeight ? renderedPageHeight / pdfOriginalHeight : 1

                // Apply DPI + Native zoom scale since we are rendering the <Page> larger/smaller directly
                const mappedScaleX = scaleX * zoomScale
                const mappedScaleY = scaleY * zoomScale

                const scaledX = highlight.x * mappedScaleX
                const scaledY = highlight.y * mappedScaleY
                const scaledWidth = highlight.width * mappedScaleX
                const scaledHeight = highlight.height * mappedScaleY + (2 * zoomScale)

                const isSelected = highlight.clauseId === selectedClauseId

                return (
                  <div
                    key={`${highlight.page}-${highlight.clauseId}-${highlight.x}-${highlight.y}`}
                    className={`absolute transition-all duration-200 cursor-pointer ${isSelected
                      ? 'ring-2 ring-red-600'
                      : 'hover:ring-2 hover:ring-red-400'
                      }`}
                    style={{
                      left: `${scaledX}px`,
                      top: `${scaledY}px`,
                      width: `${scaledWidth}px`,
                      height: `${scaledHeight}px`,
                      borderLeft: '3px solid #ef4444',
                      backgroundColor: 'rgba(239, 68, 68, 0.3)',
                      mixBlendMode: 'multiply',
                    }}
                    title={`Clause ${highlight.clauseId} - Risk: ${highlight.riskScore.toFixed(1)}/100`}
                  />
                )
              })}
            </div>
          </Document>
        </div>
      </div>

      {/* Zoom & Page Controls - Floating Button Group */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex items-center gap-1 sm:gap-2 bg-white rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)] border border-slate-200 p-1 sm:p-2 z-40 w-max max-w-[95vw] overflow-x-auto no-scrollbar">
        <button
          onClick={handlePrevPage}
          disabled={currentPage === 1}
          className="p-2 sm:p-3 rounded-full hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Previous Page"
        >
          ←
        </button>
        <div className="flex flex-col items-center justify-center px-1">
          <span className="text-xs sm:text-sm font-bold text-[#000F2E] whitespace-nowrap">
            {currentPage} / {numPages || '-'}
          </span>
          {currentPageHighlights.length > 0 && (
            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded-full mt-0.5">
              {currentPageHighlights.length} Risk{currentPageHighlights.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <button
          onClick={handleNextPage}
          disabled={!numPages || currentPage === numPages}
          className="p-2 sm:p-3 rounded-full hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Next Page"
        >
          →
        </button>

        <div className="hidden sm:block w-[1px] h-6 bg-slate-200 mx-0 sm:mx-1" />

        <button
          onClick={handleZoomOut}
          disabled={zoomScale <= 0.5}
          className="p-2 sm:p-3 rounded-full hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
        </button>

        <div className="flex items-center px-1 sm:px-2 py-1 sm:py-2 gap-1 sm:gap-2">
          <span className="text-xs sm:text-sm font-bold text-slate-600 min-w-[30px] sm:min-w-[40px] text-center">
            {Math.round(zoomScale * 50)}%
          </span>
        </div>

        <button
          onClick={handleZoomIn}
          disabled={zoomScale >= 3}
          className="p-2 sm:p-3 rounded-full hover:bg-slate-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
        </button>

        <div className="hidden sm:block w-[1px] h-6 bg-slate-200 mx-0 sm:mx-1" />

        <button
          onClick={handleResetZoom}
          className="p-2 sm:p-3 rounded-full hover:bg-slate-100 transition-colors"
          title="Reset Zoom"
        >
          <RotateCcw className="w-4 h-4 sm:w-5 sm:h-5 text-slate-700" />
        </button>

        {/* AI Page Type Badge */}
        <div className="hidden md:flex items-center gap-1.5 ml-2 mr-1">
          <div className="w-[1px] h-6 bg-slate-200 mr-2" />
          {cvLoading ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border border-slate-100 rounded-full animate-pulse">
              <div className="w-3 h-3 border-2 border-purple-400 border-t-transparent rounded-full animate-spin" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">AI Scanning Page...</span>
            </div>
          ) : cvData[currentPage] ? (
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border transition-all duration-300 ${PAGE_METADATA[cvData[currentPage].type]?.color || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
              <span className="text-xs">{PAGE_METADATA[cvData[currentPage].type]?.icon || '✨'}</span>
              <div className="flex flex-col">
                <span className="text-[9px] font-black leading-none uppercase tracking-tighter">AI VERDICT</span>
                <span className="text-[10px] font-bold leading-none mt-0.5">
                  {cvData[currentPage].type} ({(cvData[currentPage].confidence * 100).toFixed(0)}%)
                </span>
              </div>
            </div>
          ) : null}
        </div>
      </div>

      {/* Status Bar */}
      {currentPageHighlights.length === 0 && numPages && (
        <div className="bg-green-50 border-t border-green-200 px-6 py-3 text-sm text-green-700">
          ✓ This page has no high-risk clauses
        </div>
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FileText, UploadCloud} from 'lucide-react'
import { useAnalysis, LANGUAGE_LABELS } from '../context/AnalysisContext'
import { API_BASE_URL } from '../lib/api'
import axios from 'axios'
import type { AxiosProgressEvent } from 'axios'
import { SecurityAlertModal } from '../components/SecurityAlertModal'

type UploadStatus = 'idle' | 'uploading' | 'success' | 'blocked' | 'error'

type HighRiskClause = {
  id: number
  page: number
  original_text: string
  simplified: string
  risk_score: number
  highlight_coords: [number, number, number, number, number]
}

type ApiResponse = {
  status: 'ANALYSIS_COMPLETE' | 'BLOCKED'
  pii_result: 'OK' | 'BLOCKED'
  message?: string | null
  meta?: {
    total_scanned: number
    high_risk_found: number
  }
  high_risk_clauses?: HighRiskClause[]
}

export function UploadDocument() {
  const { language } = useAnalysis()
  const navigate = useNavigate()
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<UploadStatus>('idle')
  const [alertOpen, setAlertOpen] = useState(false)
  const [alertMessage, setAlertMessage] = useState<string | undefined>()
  const [uploadProgress, setUploadProgress] = useState(0)

  useEffect(() => {
    if (!language) {
      navigate('/analyze/language', { replace: true })
    }
  }, [language, navigate])

  const onFileChange = (ev: React.ChangeEvent<HTMLInputElement>) => {
    setError(null)
    const f = ev.target.files?.[0]
    if (!f) {
      setFile(null)
      return
    }
    const isPdf =
      f.type === 'application/pdf' ||
      f.name.toLowerCase().endsWith('.pdf')
    if (!isPdf) {
      setFile(null)
      setError('Only PDF files are supported.')
      return
    }

    if (f.size === 0) {
      setFile(null)
      setError('Empty PDF not allowed.')
      return
    }

    setFile(f)
  }

  const onSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault()
    if (!file || !language) {
      setError('Please choose a language and upload a PDF file.')
      return
    }
    setError(null)
    setStatus('uploading')
    try {
      const formData = new FormData()
      formData.append('file', file)

      const res = await axios.post<ApiResponse>(
        `${API_BASE_URL}/analyze/upload?language=${language}`,
        formData,
        {
          onUploadProgress: (progressEvent: AxiosProgressEvent) => {
            if (progressEvent.total) {
              const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
              setUploadProgress(percentCompleted)
            }
          }
        }
      )

      const data = res.data
      if (data.status === 'BLOCKED') {
        setStatus('blocked')
        setAlertMessage(data.message ?? undefined)
        setAlertOpen(true)
      } else {
        setStatus('success')
        localStorage.setItem('recent_pdf_name', file.name)
        // Navigate immediately (don't delay - state might be lost)
        console.log('Navigating to /analyze/result with state:', { analysis: data, pdfFile: file })
        navigate('/analyze/result', {
          state: {
            analysis: data,
            pdfFile: file,
          },
          replace: false,
        })
      }
    } catch (err) {
      console.error(err)
      setStatus('error')
      setError('Something went wrong while uploading. Please try again.')
    }
  }

  const langLabel = language ? LANGUAGE_LABELS[language] : ''





  return (
    <>
      <SecurityAlertModal
        open={alertOpen}
        onClose={() => setAlertOpen(false)}
        message={alertMessage}
      />

      <motion.section
        className="min-h-[calc(100vh-4rem)] bg-page flex items-center justify-center px-4 py-12"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      >
        <div className="max-w-xl w-full">
          <form
            onSubmit={onSubmit}
            className="rounded-3xl bg-white/80 backdrop-blur-xl border border-slate-100 shadow-xl p-8 sm:p-10"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-orange-50 text-vibrant-orange flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-serif text-xl sm:text-2xl md:text-3xl font-bold text-deep-blue">
                  Upload your document
                </h1>
                <p className="text-slate-grey text-sm mt-1">
                  Language:{' '}
                  <span className="font-semibold text-deep-blue">
                    {langLabel}
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-6 mb-4">
              <label
                htmlFor="pdf"
                className="block text-sm font-medium text-slate-grey mb-2"
              >
                Bank policy PDF (MITC)
              </label>

              <label className="flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl px-4 py-8 bg-slate-50/60 hover:border-vibrant-orange hover:bg-orange-50/40 transition-colors cursor-pointer">
                <UploadCloud className="w-8 h-8 text-vibrant-orange mb-3" />
                <span className="text-sm font-medium text-deep-blue">
                  Click to browse your PDF
                </span>
                <span className="text-xs text-slate-grey mt-1">
                  Only .pdf files are accepted
                </span>
                <input
                  id="pdf"
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={onFileChange}
                />
              </label>

              {file && (
                <p className="mt-2 text-xs text-slate-grey">
                  Selected:{' '}
                  <span className="font-medium text-deep-blue">
                    {file.name}
                  </span>
                </p>
              )}
              {error && (
                <p className="mt-2 text-xs text-[#EF4444]">{error}</p>
              )}
            </div>

            <button
              type="submit"
              disabled={!file || status === 'uploading'}
              className="w-full inline-flex justify-center items-center rounded-full bg-deep-blue text-white font-semibold py-3 disabled:opacity-50"
            >
              {status === 'uploading'
                ? 'Scanning…'
                : 'Upload'}
            </button>

            {/* Real-Time Progress Visualization */}
            {status === 'uploading' && (
              <div className="mt-6 w-full mx-auto space-y-2">
                <div className="flex justify-between text-xs font-black uppercase text-slate-500 tracking-wider">
                  <span>{uploadProgress < 100 ? 'Transferring File...' : 'File Uploaded'}</span>
                  <span>{uploadProgress}%</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${uploadProgress}%` }}
                    className="h-full bg-vibrant-orange"                  />
                </div>
                {uploadProgress === 100 && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center justify-center gap-2 mt-4 text-vibrant-orange font-bold"
                  >
                 
                  </motion.div>
                )}
              </div>
            )}
          </form>
        </div>
      </motion.section>
    </>
  )
}
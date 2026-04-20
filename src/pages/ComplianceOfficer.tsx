import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { UploadCloud, Download, FileSignature, FileSearch } from 'lucide-react'
import { useNavigate } from 'react-router-dom' // Added for security redirect
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { notoSansDevanagariBase64 } from '../assets/NotoSansDevanagari'
import axios from 'axios'
import type { AxiosProgressEvent } from 'axios'
import { JiraFloatingWidget } from '../components/JiraFloatingWidget'

interface ClauseResult {
    id: string
    page: number
    text: string
    jargon: string[]
    score: number
}

export function ComplianceOfficer() {
    const navigate = useNavigate()
    const [activeTab, setActiveTab] = useState<'audit' | 'sandbox'>('audit')
    const [isUploading, setIsUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [auditResults, setAuditResults] = useState<ClauseResult[]>([])
    const auditReportRef = useRef<HTMLDivElement>(null)

    const [draftText, setDraftText] = useState('')
    const [draftRisk, setDraftRisk] = useState({ score: 0, detectedJargon: [] as string[] })

    // --- 1. SECURITY GUARD (Architect Standard) ---
    useEffect(() => {
        const session = localStorage.getItem('avagamya_session')
        if (session !== 'active') {
            navigate('/staff/compliance/login') // Redirect if not authenticated
        }
    }, [navigate])

    // --- 2. AUDIT LOGIC ---
    const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0]
        if (!file) return
        setIsUploading(true)
        try {
            const formData = new FormData()
            formData.append('file', file)
            formData.append('language', 'en')

            const response = await axios.post(
                `${import.meta.env.VITE_API_BASE_URL}/analyze/compliance/audit`,
                formData,
                {
                    headers: { 'Content-Type': 'multipart/form-data' },
                    onUploadProgress: (progressEvent: AxiosProgressEvent) => {
                        if (progressEvent.total) {
                            const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total)
                            setUploadProgress(percentCompleted)
                        }
                    }
                }
            )

            const data = response.data

            const mappedResults: ClauseResult[] = data.clauses.map((c: any) => ({
                id: c.id,
                page: c.page,
                text: c.original_text,
                jargon: c.jargon_detected,
                score: c.mathematical_score
            }))
            setAuditResults(mappedResults)
        } catch (err) {
            console.error('Audit error:', err)
        } finally {
            setIsUploading(false)
        }
    }

    const exportAuditReport = () => {
        if (auditResults.length === 0) return

        const pdf = new jsPDF('p', 'mm', 'a4')
        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()

        pdf.addFileToVFS('NotoSansDevanagari-Regular.ttf', notoSansDevanagariBase64)
        pdf.addFont('NotoSansDevanagari-Regular.ttf', 'NotoSans', 'normal', 'Identity-H')

        // Title
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(16)
        pdf.text('Compliance Audit Report', 15, 20)

        // Setup Native AutoTable
        autoTable(pdf, {
            head: [['Clause', 'Risk Metric']],
            body: auditResults.map(res => {
                const cleanText = res.text ? res.text.replace(/[\n\r]+/g, ' ').trim().normalize('NFKC') : 'No clause text available'
                const hasDevanagari = /[\u0900-\u097F]/.test(cleanText)

                let pillBg: [number, number, number] = [209, 250, 229] // Emerald
                let pillText: [number, number, number] = [4, 120, 87]

                if (res.score >= 70) {
                    pillBg = [254, 226, 226] // Red
                    pillText = [185, 28, 28]
                } else if (res.score >= 40) {
                    pillBg = [254, 243, 199] // Amber
                    pillText = [180, 83, 9]
                }

                return [
                    {
                        content: cleanText,
                        styles: { font: hasDevanagari ? 'NotoSans' : 'helvetica', fontStyle: 'normal' }
                    },
                    {
                        content: `Score: ${res.score}/100`,
                        styles: {
                            font: 'helvetica',
                            fontStyle: 'bold',
                            halign: 'center',
                            fillColor: pillBg,
                            textColor: pillText
                        }
                    }
                ]
            }),
            styles: {
                fontSize: 10,
                cellPadding: 6,
                lineColor: [220, 220, 220],
                lineWidth: 0.1
            },
            headStyles: {
                font: 'helvetica',
                fontStyle: 'bold',
                fillColor: [59, 130, 246] // Blue to match standard headers
            },
            columnStyles: {
                0: { cellWidth: 140 }, // Auto-handles text wrapping dynamically
                1: { cellWidth: 40, halign: 'center', valign: 'middle' }
            },
            margin: { top: 30, left: 15, right: 15, bottom: 20 },
            didDrawPage: function (data) {
                // Footer
                pdf.setFont('helvetica', 'normal')
                pdf.setFontSize(8)
                pdf.text(
                    `Page ${data.pageNumber} - AVAGAMYA Compliance Intelligence`,
                    pageWidth / 2,
                    pageHeight - 10,
                    { align: 'center' }
                )
            }
        })

        pdf.save('Compliance_Audit_Report.pdf')
    }

    // --- 3. SANDBOX LOGIC ---
    useEffect(() => {
        const fetchSandboxRisk = async () => {
            if (!draftText.trim()) {
                setDraftRisk({ score: 0, detectedJargon: [] })
                return
            }
            try {
                const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/analyze/compliance/sandbox`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: draftText }),
                })
                if (response.ok) {
                    const data = await response.json()
                    setDraftRisk({ score: data.score, detectedJargon: data.detected_jargon })
                }
            } catch (err) {
                console.error("Sandbox error:", err)
            }
        }
        const timeoutId = setTimeout(() => fetchSandboxRisk(), 300)
        return () => clearTimeout(timeoutId)
    }, [draftText])

    const manuallyFetchSandboxRisk = async () => {
        if (!draftText.trim()) {
            setDraftRisk({ score: 0, detectedJargon: [] })
            return
        }
        try {
            const response = await fetch(`${import.meta.env.VITE_API_BASE_URL}/analyze/compliance/sandbox`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: draftText }),
            })
            if (response.ok) {
                const data = await response.json()
                setDraftRisk({ score: data.score, detectedJargon: data.detected_jargon })
            }
        } catch (err) {
            console.error("Manual Sandbox error:", err)
        }
    }

    const exportSandboxDraft = () => {
        if (!draftText.trim()) return

        const pdf = new jsPDF('p', 'mm', 'a4')
        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()

        // 1. Add Watermark
        pdf.setTextColor(240, 240, 240) // Very light gray
        pdf.setFontSize(40)
        pdf.setFont('helvetica', 'bold')

        // Diagonal watermark centered
        pdf.text("UNPUBLISHED WORK",
            pageWidth / 2, pageHeight / 2,
            { angle: 45, align: 'center' })

        // 2. Add Content
        pdf.addFileToVFS('NotoSansDevanagari-Regular.ttf', notoSansDevanagariBase64)
        pdf.addFont('NotoSansDevanagari-Regular.ttf', 'NotoSans', 'normal', 'Identity-H')

        pdf.setTextColor(0, 0, 0)
        pdf.setFontSize(12)
        pdf.setFont('NotoSans')

        const margin = 15
        const maxWidth = pageWidth - (margin * 2)
        const lineHeight = 7

        let currentY = 20
        const splitText = pdf.splitTextToSize(draftText, maxWidth)

        // Auto-Wrapping Loop Matrix
        for (let i = 0; i < splitText.length; i++) {
            if (currentY + lineHeight > pageHeight - margin - 15) { // 15mm footer buffer
                // Dynamic Footer before new page
                pdf.setFontSize(8)
                pdf.setTextColor(150, 150, 150)
                pdf.text(
                    `Page ${pdf.getNumberOfPages()} - AVAGAMYA Compliance Intelligence`,
                    pageWidth / 2,
                    pageHeight - 10,
                    { align: 'center' }
                )

                pdf.addPage()
                currentY = margin

                // Reinitialize Watermark
                pdf.setTextColor(240, 240, 240)
                pdf.setFontSize(40)
                pdf.setFont('helvetica', 'bold')
                pdf.text("UNPUBLISHED WORK", pageWidth / 2, pageHeight / 2, { angle: 45, align: 'center' })
            }

            // Re-assert Hindi/Marathi Text encoding BEFORE drawing EVERY line to prevent fragmentation
            pdf.setTextColor(0, 0, 0)
            pdf.setFontSize(12)
            pdf.setFont('NotoSans')

            pdf.text(splitText[i], margin, currentY)
            currentY += lineHeight
        }

        // Final Page Footer
        pdf.setFontSize(8)
        pdf.setTextColor(150, 150, 150)
        pdf.text(
            `Page ${pdf.getNumberOfPages()} - AVAGAMYA Compliance Intelligence`,
            pageWidth / 2,
            pageHeight - 10,
            { align: 'center' }
        )

        pdf.save('Compliance_Sandbox_Draft.pdf')
    }

    const riskLabel = useMemo(() => {
        if (draftRisk.score <= 40) return { label: 'SAFE', color: 'bg-emerald-500', text: 'text-emerald-700', bgBorder: 'bg-emerald-50 border-emerald-200' }
        if (draftRisk.score < 70) return { label: 'WARNING', color: 'bg-amber-500', text: 'text-amber-700', bgBorder: 'bg-amber-50 border-amber-200' }
        return { label: 'CRITICAL', color: 'bg-red-600', text: 'text-red-700', bgBorder: 'bg-red-50 border-red-200' }
    }, [draftRisk.score])

    return (
        <div className="min-h-screen bg-slate-50 p-4 sm:p-6 lg:p-8 flex flex-col gap-8">
            <div className="max-w-7xl w-full mx-auto space-y-8">
                {/* Header */}
                <div className="flex flex-col items-center text-center mb-10 gap-4">
                    {/* Small Icon-Type Image */}
                    <div className="w-16 h-16 mb-2 rounded-full bg-slate-100 flex items-center justify-center p-2 shadow-sm">
                        <img
                            src="/com.png"
                            alt="Compliance Logo"
                            className="w-full h-full object-contain rounded-lg"
                        />
                    </div>

                    <div>
                        <h1 className="text-4xl font-extrabold text-deep-blue">Compliance Officer</h1>
                    </div>
                    {/* Centered Tab Navigation */}
                    <div className="flex p-1 bg-slate-200 rounded-2xl w-full md:w-fit shadow-inner">
                        <button
                            onClick={() => setActiveTab('audit')}
                            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-bold transition-all ${activeTab === 'audit' ? 'bg-white text-deep-blue shadow-lg scale-105' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <FileSearch className="w-5 h-5" /> Audit
                        </button>
                        <button
                            onClick={() => setActiveTab('sandbox')}
                            className={`flex-1 md:flex-none flex items-center justify-center gap-2 px-8 py-3 rounded-xl font-bold transition-all ${activeTab === 'sandbox' ? 'bg-white text-deep-blue shadow-lg scale-105' : 'text-slate-500 hover:text-slate-700'}`}
                        >
                            <FileSignature className="w-5 h-5" /> Sandbox
                        </button>
                    </div>
                </div>

                <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden min-h-[600px]">
                    <AnimatePresence mode="wait">
                        {activeTab === 'audit' ? (
                            <motion.div key="audit" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-6 md:p-10 space-y-8">
                                <div className="flex justify-between items-center flex-wrap gap-4">
                                    <h2 className="text-xl md:text-2xl font-serif font-bold text-deep-blue">Public Document Audit</h2>
                                    <button onClick={exportAuditReport} disabled={auditResults.length === 0} className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-deep-blue text-white rounded-xl font-bold shadow-lg shadow-deep-blue/10 disabled:bg-slate-200">
                                        <Download className="w-4 h-4" /> Export Report
                                    </button>
                                </div>

                                <div className="border-4 border-dashed border-slate-100 rounded-3xl p-10 flex flex-col items-center justify-center bg-slate-50/50 hover:bg-slate-50 transition-all relative group">
                                    <input type="file" accept="application/pdf" onChange={handleUpload} className="absolute inset-0 opacity-0 cursor-pointer" />
                                    {isUploading ? (
                                        <div className="w-full max-w-sm flex flex-col items-center gap-4 py-8">
                                            {uploadProgress < 100 ? (
                                                <>
                                                    <div className="flex justify-between w-full text-xs font-black uppercase text-slate-500 tracking-wider">
                                                        <span>Processing PDF Securely...</span>
                                                        <span>{uploadProgress}%</span>
                                                    </div>
                                                    <div className="h-3 w-full bg-slate-200 rounded-full overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${uploadProgress}%` }}
                                                            className="h-full bg-vibrant-orange"
                                                        />
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="flex flex-col items-center gap-4">
                                                    <div className="animate-spin rounded-full h-12 w-12 border-4 border-vibrant-orange border-t-transparent" />
                                                    <p className="font-bold text-deep-blue animate-pulse text-center">
                                                        Running Risk Engine<br />

                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <>
                                            <UploadCloud className="w-16 h-16 text-slate-300 mb-4 group-hover:text-vibrant-orange transition-colors" />
                                            <p className="text-lg md:text-xl font-bold text-deep-blue text-center">Drop Policy PDF</p>
                                            <p className="text-slate-400 text-xs md:text-sm mt-1 uppercase tracking-widest font-bold font-sans text-center">Multilingual Audit Support</p>
                                        </>
                                    )}
                                </div>

                                {auditResults.length > 0 && (
                                    <div ref={auditReportRef} className="overflow-x-auto rounded-2xl border border-slate-100">
                                        <table className="w-full text-left">
                                            <thead className="bg-slate-50 text-slate-500 text-xs font-bold uppercase">
                                                <tr>
                                                    <th className="px-6 py-4">Clause</th>
                                                    <th className="px-6 py-4">Risk Metric</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {auditResults.map(res => (
                                                    <tr key={res.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-5 text-sm font-medium text-deep-blue leading-relaxed">{res.text}</td>
                                                        <td className="px-6 py-5">
                                                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${res.score > 70 ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                                                Score: {res.score}
                                                            </span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </motion.div>
                        ) : (
                            <motion.div key="sandbox" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="p-6 md:p-10 flex flex-col gap-8">
                                <div className="flex justify-between items-center flex-wrap gap-4">
                                    <h2 className="text-xl md:text-2xl font-serif font-bold text-deep-blue">Sandbox Simulator</h2>
                                    <div className="flex flex-wrap gap-4">
                                        <button onClick={exportSandboxDraft} disabled={!draftText.trim()} className="w-full md:w-auto flex items-center justify-center gap-2 px-5 py-2.5 bg-deep-blue text-white rounded-xl font-bold shadow-lg shadow-deep-blue/10 disabled:bg-slate-200">
                                            <Download className="w-4 h-4" /> Download Draft
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                                    <div className="lg:col-span-2 flex flex-col gap-3">
                                        <textarea
                                            value={draftText} onChange={(e) => setDraftText(e.target.value)}
                                            className="w-full h-[400px] p-6 bg-slate-50 rounded-3xl border border-slate-100 outline-none focus:ring-4 focus:ring-vibrant-orange/5 text-deep-blue text-lg leading-relaxed shadow-inner resize-none"
                                            placeholder="Compose new bank policy clauses here..."
                                        />
                                        <button onClick={manuallyFetchSandboxRisk} className="">

                                        </button>
                                    </div>

                                    <div className="space-y-6">
                                        <div className={`p-8 rounded-3xl border-2 shadow-sm transition-all ${riskLabel.bgBorder}`}>
                                            <p className={`text-xs font-black uppercase tracking-widest ${riskLabel.text}`}>Risk Velocity Meter</p>
                                            <div className="mt-4 flex items-baseline gap-2">
                                                <span className={`text-6xl font-black ${riskLabel.text}`}>{draftRisk.score}</span>
                                                <span className={`text-xl font-bold ${riskLabel.text}`}>/ 100</span>
                                            </div>
                                            <div className="mt-6 w-full h-4 bg-white/50 rounded-full overflow-hidden border border-black/5 shadow-inner">
                                                <motion.div animate={{ width: `${draftRisk.score}%` }} className={`h-full ${riskLabel.color}`} />
                                            </div>
                                            <p className={`mt-6 text-sm font-bold ${riskLabel.text}`}>
                                                Status: {draftRisk.score > 70 ? 'NON-COMPLIANT' : 'APPROVED'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
            {activeTab === 'audit' && <JiraFloatingWidget />}
        </div>
    )
}
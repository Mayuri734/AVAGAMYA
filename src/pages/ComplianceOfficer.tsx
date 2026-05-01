import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  UploadCloud, Download, FileSignature, FileSearch, Shield, AlertCircle, 
  CheckCircle2, XCircle, Loader2,  X, ClipboardList 
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { notoSansDevanagariBase64 } from '../assets/NotoSansDevanagari'
import axios from 'axios'
import type { AxiosProgressEvent } from 'axios'

interface ClauseResult {
    id: string
    page: number
    text: string
    jargon: string[]
    score: number
}

export function ComplianceOfficer() {
    const navigate = useNavigate()
    const [userRole, setUserRole] = useState<'MAKER' | 'CHECKER'>('MAKER')
    const [heatmapActive, setHeatmapActive] = useState(false)
    const [isApproved, setIsApproved] = useState(false)
    
    // Jira States
    const [jiraStatus, setJiraStatus] = useState<'idle' | 'form' | 'loading' | 'success'>('idle')
    const [jiraNotes, setJiraNotes] = useState('')
    const [ticketId, setTicketId] = useState('')

    const [isUploading, setIsUploading] = useState(false)
    const [uploadProgress, setUploadProgress] = useState(0)
    const [auditResults, setAuditResults] = useState<ClauseResult[]>([])

    const [draftText, setDraftText] = useState('')
    const [draftRisk, setDraftRisk] = useState({ score: 0, detectedJargon: [] as string[] })

    // --- 1. SECURITY GUARD ---
    useEffect(() => {
        const session = localStorage.getItem('avagamya_session')
        if (session !== 'active') {
            navigate('/staff/compliance/login')
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
        pdf.setFont('helvetica', 'bold')
        pdf.setFontSize(16)
        pdf.text('Compliance Audit Report', 15, 20)
        autoTable(pdf, {
            head: [['Clause', 'Risk Metric']],
            body: auditResults.map(res => {
                const cleanText = res.text ? res.text.replace(/[\n\r]+/g, ' ').trim().normalize('NFKC') : 'No clause text available'
                const hasDevanagari = /[\u0900-\u097F]/.test(cleanText)
                let pillBg: [number, number, number] = [209, 250, 229]
                let pillText: [number, number, number] = [4, 120, 87]
                if (res.score >= 70) {
                    pillBg = [254, 226, 226]
                    pillText = [185, 28, 28]
                } else if (res.score >= 40) {
                    pillBg = [254, 243, 199]
                    pillText = [180, 83, 9]
                }
                return [
                    { content: cleanText, styles: { font: hasDevanagari ? 'NotoSans' : 'helvetica', fontStyle: 'normal' } },
                    { content: `Score: ${res.score}/100`, styles: { font: 'helvetica', fontStyle: 'bold', halign: 'center', fillColor: pillBg, textColor: pillText } }
                ]
            }),
            styles: { fontSize: 10, cellPadding: 6, lineColor: [220, 220, 220], lineWidth: 0.1 },
            headStyles: { font: 'helvetica', fontStyle: 'bold', fillColor: [59, 130, 246] },
            columnStyles: { 0: { cellWidth: 140 }, 1: { cellWidth: 40, halign: 'center', valign: 'middle' } },
            margin: { top: 30, left: 15, right: 15, bottom: 20 },
            didDrawPage: (data) => {
                pdf.setFont('helvetica', 'normal')
                pdf.setFontSize(8)
                pdf.text(`Page ${data.pageNumber} - AVAGAMYA Compliance Intelligence`, pageWidth / 2, pageHeight - 10, { align: 'center' })
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

    const exportSandboxDraft = () => {
        if (!draftText.trim()) return
        const pdf = new jsPDF('p', 'mm', 'a4')
        const pageWidth = pdf.internal.pageSize.getWidth()
        const pageHeight = pdf.internal.pageSize.getHeight()
        pdf.setTextColor(240, 240, 240)
        pdf.setFontSize(40)
        pdf.setFont('helvetica', 'bold')
        pdf.text("UNPUBLISHED WORK", pageWidth / 2, pageHeight / 2, { angle: 45, align: 'center' })
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
        for (let i = 0; i < splitText.length; i++) {
            if (currentY + lineHeight > pageHeight - margin - 15) {
                pdf.setFontSize(8)
                pdf.setTextColor(150, 150, 150)
                pdf.text(`Page ${pdf.getNumberOfPages()} - AVAGAMYA Compliance Intelligence`, pageWidth / 2, pageHeight - 10, { align: 'center' })
                pdf.addPage()
                currentY = margin
                pdf.setTextColor(240, 240, 240)
                pdf.setFontSize(40)
                pdf.setFont('helvetica', 'bold')
                pdf.text("UNPUBLISHED WORK", pageWidth / 2, pageHeight / 2, { angle: 45, align: 'center' })
            }
            pdf.setTextColor(0, 0, 0)
            pdf.setFontSize(12)
            pdf.setFont('NotoSans')
            pdf.text(splitText[i], margin, currentY)
            currentY += lineHeight
        }
        pdf.setFontSize(8)
        pdf.setTextColor(150, 150, 150)
        pdf.text(`Page ${pdf.getNumberOfPages()} - AVAGAMYA Compliance Intelligence`, pageWidth / 2, pageHeight - 10, { align: 'center' })
        pdf.save('Compliance_Sandbox_Draft.pdf')
    }

    // Jira Escalation Logic
    const handleJiraSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!jiraNotes.trim()) return

        setJiraStatus('loading')
        try {
            const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/analyze/compliance/escalate`, {
                notes: jiraNotes
            })
            if (response.data.status === 'SUCCESS') {
                setTicketId(response.data.ticket_id)
                setJiraStatus('success')
            }
        } catch (error) {
            console.error('Failed to escalate to Jira:', error)
            setJiraStatus('form')
            alert('Failed to create Jira ticket. Please check if backend is running.')
        }
    }

    const riskLabel = useMemo(() => {
        if (draftRisk.score <= 40) return { label: 'SAFE', color: 'bg-emerald-500', text: 'text-emerald-400', border: 'border-emerald-500/20', bg: 'bg-emerald-500/10' }
        if (draftRisk.score < 70) return { label: 'WARNING', color: 'bg-amber-500', text: 'text-amber-400', border: 'border-amber-500/20', bg: 'bg-amber-500/10' }
        return { label: 'CRITICAL', color: 'bg-red-600', text: 'text-red-400', border: 'border-red-500/20', bg: 'bg-red-500/10' }
    }, [draftRisk.score])

    return (
        <div className="min-h-screen bg-slate-950 text-slate-300 p-4 md:p-8 flex flex-col gap-8">
            <div className="max-w-[1600px] w-full mx-auto space-y-8">
                
                {/* Header Section */}
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 border-b border-slate-800 pb-8">
                    <div className="flex items-center gap-4">
                        <div className="p-3 bg-slate-900 rounded-2xl border border-slate-800 shadow-xl">
                            <Shield className="w-8 h-8 text-[#0052CC]" />
                        </div>
                        <div>
                            <h1 className="text-3xl font-black text-white tracking-tight">Compliance Command Center</h1>
                            <p className="text-slate-500 text-sm font-medium">Audit. Draft. Sign.</p>
                        </div>
                    </div>

                    <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-inner">
                        <button
                            onClick={() => setUserRole('MAKER')}
                            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${userRole === 'MAKER' ? 'bg-[#0052CC] text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                        >
                            MAKER
                        </button>
                        <button
                            onClick={() => setUserRole('CHECKER')}
                            className={`px-6 py-2 rounded-lg font-bold text-sm transition-all ${userRole === 'CHECKER' ? 'bg-[#0052CC] text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}
                        >
                            CHECKER
                        </button>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                    
                    {/* LEFT PANE - AUDIT & HEATMAP */}
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col gap-8 shadow-2xl">
                        <div className="flex justify-between items-center">
                            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                                <FileSearch className="w-5 h-5 text-slate-400" /> Policy Intelligence
                            </h2>
                            <button 
                                onClick={exportAuditReport} 
                                disabled={auditResults.length === 0} 
                                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold border border-slate-700 disabled:opacity-30 transition-all flex items-center gap-2"
                            >
                                <Download className="w-4 h-4" /> Export Report
                            </button>
                        </div>

                        {/* Upload Zone */}
                        <div className="relative group bg-slate-950 border-2 border-dashed border-slate-800 rounded-2xl p-10 flex flex-col items-center justify-center hover:border-[#0052CC]/50 transition-all">
                            <input type="file" accept="application/pdf" onChange={handleUpload} className="absolute inset-0 opacity-0 cursor-pointer z-10" />
                            {isUploading ? (
                                <div className="w-full max-w-sm space-y-4">
                                    <div className="flex justify-between text-[10px] font-black uppercase text-slate-500 tracking-widest">
                                        <span>Analyzing Security Vectors</span>
                                        <span>{uploadProgress}%</span>
                                    </div>
                                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                                        <motion.div initial={{ width: 0 }} animate={{ width: `${uploadProgress}%` }} className="h-full bg-[#0052CC]" />
                                    </div>
                                </div>
                            ) : (
                                <>
                                    <UploadCloud className="w-12 h-12 text-slate-700 mb-4 group-hover:text-[#0052CC] transition-colors" />
                                    <p className="text-white font-bold">Drop Policy Document</p>
                                    <p className="text-slate-500 text-xs mt-2 uppercase tracking-widest font-bold font-mono">PDF Standard Only</p>
                                </>
                            )}
                        </div>

                        {/* Heatmap Toggle */}
                        <div className="flex items-center justify-between p-4 bg-slate-950 rounded-2xl border border-slate-800">
                            <div className="flex items-center gap-3">
                                <div 
                                    className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${heatmapActive ? 'bg-[#0052CC]' : 'bg-slate-800'}`} 
                                    onClick={() => setHeatmapActive(!heatmapActive)}
                                >
                                    <motion.div animate={{ x: heatmapActive ? 16 : 0 }} className="w-4 h-4 bg-white rounded-full shadow-sm" />
                                </div>
                                <span className="text-sm font-bold text-white">Cognitive Heatmap Mode</span>
                            </div>
                            <Shield className={`w-5 h-5 ${heatmapActive ? 'text-red-500 animate-pulse' : 'text-slate-700'}`} />
                        </div>

                        {/* Audit Table */}
                        <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950">
                            <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                                <table className="w-full text-left border-collapse">
                                    <thead className="bg-slate-950 sticky top-0 z-20">
                                        <tr>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Risk Matrix Clause</th>
                                            <th className="px-6 py-4 text-[10px] font-black text-slate-500 uppercase tracking-widest border-b border-slate-800">Impact</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-800/50">
                                        {auditResults.length === 0 ? (
                                            <tr>
                                                <td colSpan={2} className="px-6 py-20 text-center text-slate-600 italic text-sm">Waiting for document ingestion...</td>
                                            </tr>
                                        ) : (
                                            auditResults.map(res => (
                                                <tr key={res.id} className={`transition-colors ${heatmapActive && res.score > 70 ? 'bg-red-500/10' : 'hover:bg-slate-900'}`}>
                                                    <td className="px-6 py-5 text-sm font-medium text-slate-300 leading-relaxed">{res.text}</td>
                                                    <td className="px-6 py-5">
                                                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${res.score > 70 ? 'text-red-400 bg-red-400/10 border border-red-400/20' : 'text-emerald-400 bg-emerald-400/10 border border-emerald-400/20'}`}>
                                                            {res.score}
                                                        </span>
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT PANE - MAKER/CHECKER WORKFLOW */}
                    <div className="bg-slate-900 border border-slate-800 rounded-3xl p-8 flex flex-col gap-6 shadow-2xl min-h-[800px]">
                        
                     

                        {/* Sandbox Area */}
                        <div className="flex-1 flex flex-col gap-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                                    <FileSignature className="w-5 h-5 text-slate-400" /> Governance Sandbox
                                </h3>
                                {userRole === 'CHECKER' && (
                                    <div className="px-3 py-1 bg-slate-950 border border-slate-800 rounded-lg text-[10px] font-black text-slate-500">READ-ONLY AUDIT</div>
                                )}
                            </div>

                            <textarea
                                value={draftText}
                                onChange={(e) => setDraftText(e.target.value)}
                                readOnly={userRole === 'CHECKER'}
                                className={`w-full h-[350px] p-6 bg-slate-950 rounded-2xl border border-slate-800 outline-none focus:ring-4 focus:ring-[#0052CC]/10 text-white text-base leading-relaxed resize-none transition-all placeholder:text-slate-700 ${userRole === 'CHECKER' ? 'opacity-70 italic' : ''}`}
                                placeholder="Refine or compose new policy clauses..."
                            />

                         
                        </div>

                        {/* Risk Metrics */}
                        <div className={`p-6 rounded-2xl border ${riskLabel.border} ${riskLabel.bg} flex items-center justify-between`}>
                            <div className="space-y-1">
                                <p className={`text-[10px] font-black uppercase tracking-widest ${riskLabel.text}`}>Risk Velocity Meter</p>
                                <div className="flex items-baseline gap-2">
                                    <span className={`text-4xl font-black ${riskLabel.text}`}>{draftRisk.score}</span>
                                    <span className={`text-sm font-bold opacity-50 ${riskLabel.text}`}>/ 100</span>
                                </div>
                            </div>
                            <div className="w-48 h-3 bg-slate-950 rounded-full overflow-hidden p-0.5 border border-slate-800 shadow-inner">
                                <motion.div animate={{ width: `${draftRisk.score}%` }} className={`h-full rounded-full ${riskLabel.color}`} />
                            </div>
                        </div>

                        {/* Action Bar */}
                        <div className="pt-4 border-t border-slate-800 space-y-4">
                            {userRole === 'MAKER' ? (
                                <>
                                    <div className="flex gap-4">
                                        <button 
                                            onClick={exportSandboxDraft} 
                                            disabled={!draftText.trim()} 
                                            className="flex-1 py-4 bg-[#0052CC] hover:bg-[#0047b3] text-white rounded-2xl font-black text-sm shadow-xl shadow-[#0052CC]/20 disabled:opacity-30 transition-all flex items-center justify-center gap-3"
                                        >
                                            <Download className="w-5 h-5" /> EXPORT GOVERNANCE DRAFT
                                        </button>
                                        <button 
                                            onClick={() => setJiraStatus('form')}
                                            className="flex-1 py-4 bg-transparent border border-slate-700 hover:border-red-500/50 text-slate-400 hover:text-red-400 rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-3"
                                        >
                                            <AlertCircle className="w-5 h-5" /> ESCALATE TO LEGAL
                                        </button>
                                    </div>

                                    <AnimatePresence>
                                        {jiraStatus !== 'idle' && (
                                            <motion.div 
                                                initial={{ opacity: 0, height: 0 }}
                                                animate={{ opacity: 1, height: 'auto' }}
                                                exit={{ opacity: 0, height: 0 }}
                                                className="bg-slate-950 border border-slate-800 p-6 rounded-2xl space-y-4 overflow-hidden shadow-2xl"
                                            >
                                                {jiraStatus === 'form' && (
                                                    <form onSubmit={handleJiraSubmit} className="space-y-4">
                                                        <div className="flex items-center justify-between">
                                                            <h4 className="text-xs font-black text-white uppercase tracking-widest flex items-center gap-2">
                                                                <ClipboardList className="w-4 h-4 text-[#0052CC]" /> Jira Escalation Request
                                                            </h4>
                                                            <button type="button" onClick={() => setJiraStatus('idle')} className="text-slate-500 hover:text-white">
                                                                <X className="w-4 h-4" />
                                                            </button>
                                                        </div>
                                                        <textarea 
                                                            value={jiraNotes}
                                                            onChange={(e) => setJiraNotes(e.target.value)}
                                                            className="w-full h-24 p-4 bg-slate-900 border border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-[#0052CC]/50 text-white text-sm placeholder:text-slate-700 resize-none"
                                                            placeholder="Describe the compliance conflict or legal ambiguity..."
                                                        />
                                                        <div className="flex gap-3">
                                                            <button type="button" onClick={() => setJiraStatus('idle')} className="flex-1 py-2 text-xs font-bold text-slate-500 hover:text-white transition-colors">CANCEL</button>
                                                            <button 
                                                                type="submit" 
                                                                disabled={!jiraNotes.trim()}
                                                                className="flex-[2] py-2 bg-[#0052CC] text-white rounded-lg font-bold text-xs shadow-lg shadow-[#0052CC]/20 disabled:opacity-30"
                                                            >
                                                                CREATE JIRA TICKET
                                                            </button>
                                                        </div>
                                                    </form>
                                                )}

                                                {jiraStatus === 'loading' && (
                                                    <div className="py-8 flex flex-col items-center gap-4">
                                                        <Loader2 className="w-8 h-8 text-[#0052CC] animate-spin" />
                                                        <p className="text-xs font-bold text-slate-400 animate-pulse uppercase tracking-widest">Syncing with Jira Cloud...</p>
                                                    </div>
                                                )}

                                                {jiraStatus === 'success' && (
                                                    <div className="py-6 flex flex-col items-center text-center gap-4">
                                                        <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center">
                                                            <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                                        </div>
                                                        <div>
                                                            <p className="text-sm font-bold text-white">Escalation Successful</p>
                                                            <p className="text-[10px] text-slate-500 mt-1 uppercase tracking-widest">
                                                                Ticket <span className="font-mono text-emerald-400 font-black">{ticketId}</span> created.
                                                            </p>
                                                        </div>
                                                        <button 
                                                            onClick={() => { setJiraStatus('idle'); setJiraNotes(''); }}
                                                            className="px-6 py-2 bg-slate-900 text-slate-400 hover:text-white rounded-lg text-[10px] font-black transition-colors"
                                                        >
                                                            DISMISS
                                                        </button>
                                                    </div>
                                                )}
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </>
                            ) : (
                                <>
                                    {isApproved ? (
                                        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="font-mono text-[11px] text-emerald-400 bg-slate-950 p-5 rounded-2xl border border-emerald-500/30 leading-relaxed">
                                            <p className="flex items-center gap-2 mb-2"><CheckCircle2 className="w-4 h-4" /> System.log("Policy_Approved");</p>
                                            <p className="opacity-50">Auth_User: CHECKER_ADMIN_V4</p>
                                            <p className="mt-2 text-[10px] break-all opacity-80">Hash: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855</p>
                                        </motion.div>
                                    ) : (
                                        <div className="flex gap-4">
                                            <button className="flex-1 py-4 bg-slate-950 border border-slate-800 hover:border-red-500/50 text-red-500 rounded-2xl font-black text-sm flex items-center justify-center gap-2 transition-all">
                                                <XCircle className="w-5 h-5" /> REJECT
                                            </button>
                                            <button 
                                                onClick={() => setIsApproved(true)}
                                                className="flex-[2] py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-sm shadow-xl shadow-emerald-600/20 flex items-center justify-center gap-2 transition-all"
                                            >
                                                <CheckCircle2 className="w-5 h-5" /> APPROVE & SIGN
                                            </button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Shield, Clock, CheckCircle, LayoutDashboard, Award, Download, Lock, BarChart3 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { AuditorAnalytics } from '../components/AuditorAnalyticsModal'
import html2canvas from 'html2canvas'
import { jsPDF } from 'jspdf'

interface AuditLog {
  id: number
  timestamp: string
  filename: string
  status: string
  details: string
  processing_time: number
  language_detected: string
  unique_hash: string
  risk_score: string
}

export function AuditorDashboard() {
  const navigate = useNavigate()

  // --- UI STATE ---
  const [activeTab, setActiveTab] = useState<'dashboard' | 'analytics' | 'certification'>('dashboard')
  const [policyName, setPolicyName] = useState('HDFC Credit Card MITC v2.4')
  const [auditDate] = useState(new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }))
  const [isGenerating, setIsGenerating] = useState(false)
  const certificateRef = useRef<HTMLDivElement>(null)
  const [logFilter, setLogFilter] = useState<'ALL' | 'CLEAN' | 'BLOCKED'>('ALL')

  // --- DATA STATE ---
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([])
  const [summary, setSummary] = useState({ totalEvents: 0, complianceRate: 0, avgTime: '0' })

  // --- 1. SECURITY GUARD ---
  useEffect(() => {
    const session = localStorage.getItem('avagamya_session')
    if (session !== 'active') {
      navigate('/staff/auditor/login')
    }
  }, [navigate])

  // --- 2. DATA FETCHING ---
  const fetchAuditData = async () => {
    try {
      const [summaryRes, logsRes] = await Promise.all([
        fetch(`${import.meta.env.VITE_API_BASE_URL}/audit/summary`),
        fetch(`${import.meta.env.VITE_API_BASE_URL}/analyze/dpo/logs`)
      ])
      if (!summaryRes.ok || !logsRes.ok) throw new Error('Failed to fetch data')
      const summaryData = await summaryRes.json()
      const logsData = await logsRes.json()
      setSummary({
        totalEvents: summaryData.total_processed || 0,
        complianceRate: summaryData.compliance_percentage || 0,
        avgTime: summaryData.avg_processing_time_last_50 || '0'
      })
      setAuditLogs(logsData || [])
    } catch (err) {
      console.error('Fetch error:', err)
    }
  }

  useEffect(() => {
    fetchAuditData()
    const intervalId = setInterval(() => fetchAuditData(), 30000)
    return () => clearInterval(intervalId)
  }, [])

  const generatePDF = async () => {
    if (!certificateRef.current) return
    setIsGenerating(true)
    try {
      const canvas = await html2canvas(certificateRef.current, { scale: 2, useCORS: true })
      const pdf = new jsPDF('p', 'mm', 'a4')
      pdf.addImage(canvas.toDataURL('image/png'), 'PNG', 0, 0, 210, (canvas.height * 210) / canvas.width)
      pdf.save(`Auditor_Cert_${policyName.replace(/\s+/g, '_')}.pdf`)
    } finally {
      setIsGenerating(false)
    }
  }

  const metrics = useMemo(() => [
    { label: 'Total Events', value: summary.totalEvents.toLocaleString(), icon: FileText, color: 'bg-slate-900 border-slate-800', iconColor: 'text-blue-500' },
    { label: 'DPDP Compliant', value: `${summary.complianceRate}%`, icon: Shield, color: 'bg-slate-900 border-slate-800', iconColor: 'text-emerald-500' },
    { label: 'Active Audits', value: auditLogs.length.toString(), icon: CheckCircle, color: 'bg-slate-900 border-slate-800', iconColor: 'text-purple-500' },
    { label: 'Avg Time', value: `${summary.avgTime}s`, icon: Clock, color: 'bg-slate-900 border-slate-800', iconColor: 'text-vibrant-orange' },
  ], [summary, auditLogs.length])

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      if (logFilter === 'ALL') return true
      if (logFilter === 'CLEAN') return log.status === 'CLEAN'
      if (logFilter === 'BLOCKED') return log.status === 'BLOCKED'
      return true
    })
  }, [auditLogs, logFilter])

  return (
    <div className="min-h-screen bg-slate-950 text-slate-300 p-4 sm:p-6 lg:p-8 flex flex-col gap-8">
      <div className="max-w-7xl w-full mx-auto space-y-8">

        {/* Top Header Section with Left-Aligned Layout */}
        <div className="flex flex-col md:flex-row items-center justify-between mb-10 gap-6">
          <div className="flex flex-col md:flex-row items-center gap-4">
            {/* Small Icon-Type Image for Auditor */}
            <div className="w-16 h-16 rounded-full bg-slate-900 flex items-center justify-center p-2 shadow-sm border border-slate-800">
                <img 
                    src="/audit.png" 
                    alt="Auditor Logo" 
                    className="w-full h-full object-contain rounded-lg"
                />
            </div>

            <div>
                <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white">Auditor Control</h1>
            </div>

            {/* Left-Aligned Tab Navigation */}
            <div className="flex flex-row p-1 bg-slate-900 rounded-xl w-fit gap-1 shadow-inner md:ml-6 border border-slate-800">
                <button
                    onClick={() => setActiveTab('dashboard')}
                    className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all text-sm ${activeTab === 'dashboard' ? 'bg-slate-800 text-white shadow-md border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <LayoutDashboard className="w-4 h-4" /> Dashboard
                </button>
                <button
                    onClick={() => setActiveTab('analytics')}
                    className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all text-sm ${activeTab === 'analytics' ? 'bg-slate-800 text-white shadow-md border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <BarChart3 className="w-4 h-4" /> Visual Report
                </button>
                <button
                    onClick={() => setActiveTab('certification')}
                    className={`flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg font-bold transition-all text-sm ${activeTab === 'certification' ? 'bg-slate-800 text-white shadow-md border border-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
                >
                    <Award className="w-4 h-4" /> Certification
                </button>
            </div>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="bg-slate-900/50 rounded-3xl shadow-2xl border border-slate-800 overflow-hidden min-h-[600px]">
          <AnimatePresence mode="wait">
            {activeTab === 'dashboard' ? (
              <motion.div
                key="dashboard"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-6 md:p-10 space-y-8"
              >
                {/* Metrics Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {metrics.map((m) => (
                    <div key={m.label} className={`${m.color} p-6 rounded-2xl border flex items-center justify-between transition-colors hover:border-slate-700`}>
                      <div>
                        <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{m.label}</p>
                        <p className="text-2xl font-bold text-white mt-1">{m.value}</p>
                      </div>
                      <m.icon className={`w-6 h-6 ${m.iconColor}`} />
                    </div>
                  ))}
                </div>

                {/* Audit Log Table */}
                <div className="rounded-2xl border border-slate-800 bg-slate-900 overflow-hidden">
                  <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-900/50">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-slate-400" />
                      <span className="text-sm font-bold text-slate-300 uppercase tracking-tighter">Secure Audit Trail</span>
                    </div>
                    {/* Filter Button Group */}
                    <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800">
                      <button onClick={() => setLogFilter('ALL')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${logFilter === 'ALL' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>ALL</button>
                      <button onClick={() => setLogFilter('CLEAN')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${logFilter === 'CLEAN' ? 'bg-slate-800 text-emerald-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>CLEAN</button>
                      <button onClick={() => setLogFilter('BLOCKED')} className={`px-4 py-1.5 text-xs font-bold rounded-md transition-colors ${logFilter === 'BLOCKED' ? 'bg-slate-800 text-red-400 shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}>BLOCKED</button>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead className="bg-slate-950/50 text-slate-500 text-[10px] uppercase font-black tracking-widest">
                        <tr>
                          <th className="px-6 py-4">Timestamp</th>
                          <th className="px-6 py-4">Document</th>
                          <th className="px-6 py-4">Risk Status</th>
                          <th className="px-6 py-4">Log Hash</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/50">
                        {filteredLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-slate-800/50 transition-colors group">
                            <td className="px-6 py-5 text-sm text-slate-500 font-medium">
                              {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="px-6 py-5 text-sm font-bold text-slate-300 group-hover:text-vibrant-orange transition-colors">
                              {log.filename}
                            </td>
                            <td className="px-6 py-5">
                              <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${log.status === 'CLEAN'
                                ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                                : 'bg-red-500/10 text-red-400 border-red-500/20'
                                }`}>
                                {log.risk_score}
                              </span>
                            </td>
                            <td className="px-6 py-5 font-mono text-[10px] text-emerald-400 tracking-widest">
                              {log.unique_hash ? log.unique_hash.substring(0, 12) : `fallback_hash_${log.id}`}...
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            ) : activeTab === 'analytics' ? (
              <motion.div
                key="analytics"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-6 md:p-10"
              >
                <AuditorAnalytics auditLogs={auditLogs} />
              </motion.div>
            ) : (
              <motion.div
                key="certification"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="p-6 md:p-10 flex flex-col items-center gap-8"
              >
                <div className="w-full max-w-2xl space-y-6">
                  <div className="text-center">
                    <h2 className="text-xl md:text-2xl font-serif font-bold text-white">Transparency Certification</h2>
                    <p className="text-slate-400 text-xs md:text-sm mt-1">Issue official compliance verification for analyzed policies</p>
                  </div>

                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-xs font-black text-slate-500 uppercase ml-1">Policy Designation</label>
                      <input
                        type="text"
                        value={policyName}
                        onChange={(e) => setPolicyName(e.target.value)}
                        className="w-full p-4 rounded-xl border border-slate-700 bg-slate-900 outline-none focus:ring-2 focus:ring-vibrant-orange/50 text-white font-bold transition-all"
                        placeholder="Enter full policy name..."
                      />
                    </div>

                    <button
                      onClick={generatePDF}
                      className="w-full bg-deep-blue text-white py-4 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg shadow-deep-blue/10"
                    >
                      <Download className="w-5 h-5" />
                      {isGenerating ? 'Securing Document...' : 'Download Official Certificate'}
                    </button>
                  </div>

                  {/* Certificate Preview Card */}
                  <div className="mt-8 flex justify-center">
                    <div
                      ref={certificateRef}
                      className="relative w-full max-w-sm aspect-[1/1.414] bg-white rounded-lg shadow-2xl overflow-hidden border-8 border-white"
                    >
                      <img src="/certificate-bg.jpg" className="absolute inset-0 w-full h-full object-cover" alt="Verification Background" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-8 z-10">
                        {/* Policy Name Overlay - Fixed Positioning based on your template */}
                        <p className="absolute top-[34.5%] left-0 right-0 px-8 text-xs sm:text-sm font-bold text-black leading-tight">
                          {policyName}
                        </p>
                        {/* Date Overlay */}
                        <p className="absolute bottom-[20%] text-[9px] font-black text-slate-600 uppercase tracking-[0.2em]">
                          Verified on: {auditDate}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}
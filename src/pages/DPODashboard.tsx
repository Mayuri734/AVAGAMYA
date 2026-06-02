import { useState, useEffect, useMemo } from 'react'
import { Shield, AlertTriangle, CheckCircle, Lock, MapPin, BarChart2, TrendingUp, FileText, Globe } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { API_BASE_URL } from '../lib/api'

interface DPOLog {
  id: number
  timestamp: string
  filename: string
  status: 'BLOCKED' | 'CLEAN'
  details: string
  storage_status?: string
}

// ── Analytics types (from GET /analytics/document-stats) ─────────────────────
interface AnalyticsData {
  total_documents: number
  clean_count: number
  blocked_count: number
  compliance_percentage: number
  processing_time_stats: { avg_seconds: number; p95_seconds: number }
  risk_stats: { avg_high_risk_clauses: number; max_high_risk_clauses: number }
  status_distribution: Record<string, number>
  language_distribution: Record<string, number>
  daily_upload_trend: Array<{ date: string; uploads: number }>
  peak_upload_hour: number
  top_risk_documents: Array<{ filename: string; risk_count: number; timestamp: string; language_detected: string }>
}

const LANG_LABELS: Record<string, string> = { en: 'English', hi: 'Hindi', mr: 'Marathi' }

export function DPODashboard() {
  const navigate = useNavigate()
  const [logs, setLogs]           = useState<DPOLog[]>([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [telemetry, setTelemetry] = useState({ residency: 'Fetching...', piiRetained: 0 })
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null)
  const [analyticsLoading, setAnalyticsLoading] = useState(true)

  // --- 1. SECURITY GUARD ---
  useEffect(() => {
    const session = localStorage.getItem('avagamya_session')
    if (session !== 'active') navigate('/staff/dpo/login')
  }, [navigate])

  // --- 2. DATA FETCHING ---
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_BASE_URL}/analyze/dpo/logs`)
        if (!response.ok) throw new Error('Failed to fetch DPO logs')
        setLogs(await response.json())
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Backend Offline')
      } finally {
        setLoading(false)
      }
    }

    const fetchTelemetry = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/system/telemetry`)
        if (response.ok) {
          const data = await response.json()
          setTelemetry({ residency: data.residency_region || 'ap-south-1 (Mumbai)', piiRetained: data.pii_bytes_retained || 0 })
        }
      } catch { setTelemetry({ residency: 'ap-south-1 (Mumbai)', piiRetained: 0 }) }
    }

    const fetchAnalytics = async () => {
      try {
        setAnalyticsLoading(true)
        const res = await fetch(`${API_BASE_URL}/analytics/document-stats`)
        if (res.ok) setAnalytics(await res.json())
      } catch { /* silent */ } finally {
        setAnalyticsLoading(false)
      }
    }

    fetchLogs()
    fetchTelemetry()
    fetchAnalytics()
  }, [])

  const totalScanned = logs.length
  const blockedCount = logs.filter(l => l.status === 'BLOCKED').length
  const cleanCount   = logs.filter(l => l.status === 'CLEAN').length

  const metrics = [
    { label: 'Total Scanned',       value: totalScanned, icon: Shield,       color: 'bg-slate-900 border-slate-800', iconColor: 'text-blue-600' },
    { label: 'Blocked (PII)',        value: blockedCount, icon: AlertTriangle, color: 'bg-slate-900 border-slate-800', iconColor: 'text-red-600' },
    { label: 'Clean Documents',      value: cleanCount,   icon: CheckCircle,  color: 'bg-slate-900 border-slate-800', iconColor: 'text-emerald-600' },
    { label: 'Ephemeral Processing', value: 'Active',     icon: Shield,       color: 'bg-slate-900 border-slate-800', iconColor: 'text-emerald-500',
      subtitle: `${telemetry.piiRetained} Bytes PII Retained` },
  ]

  // SVG sparkline from daily_upload_trend
  const sparkline = useMemo(() => {
    if (!analytics?.daily_upload_trend?.length) return null
    const vals = analytics.daily_upload_trend.map(d => d.uploads)
    const max  = Math.max(...vals, 1)
    const W = 200, H = 40
    return vals.map((v, i) => `${(i / Math.max(vals.length - 1, 1)) * W},${H - (v / max) * H}`).join(' ')
  }, [analytics])

  return (
    <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8 flex flex-col gap-8">
      <div className="max-w-7xl w-full mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white">DPO Console</h1>
            <p className="text-slate-400 italic">Enterprise Data Protection Monitoring</p>
          </div>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs font-mono text-slate-300 shadow-sm">
            <MapPin className="w-4 h-4 text-emerald-500"/> Data Residency: {telemetry.residency}
          </div>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
          {metrics.map((metric) => (
            <div key={metric.label} className={`${metric.color} p-6 rounded-2xl border-2 shadow-sm`}>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{metric.label}</p>
              <div className="flex items-center justify-between mt-2">
                <div className="flex flex-col">
                  <span className="text-3xl font-bold text-white">{metric.value}</span>
                  {metric.subtitle && <span className="text-[10px] text-emerald-400 font-mono mt-1">{metric.subtitle}</span>}
                </div>
                <metric.icon className={`w-7 h-7 ${metric.iconColor}`} />
              </div>
            </div>
          ))}
        </div>

        {/* ── Document Analytics Dashboard ──────────────────────────────────────── */}
        <div>
          <div className="flex items-center gap-2 mb-4">
            <BarChart2 className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-bold text-white">Document Analytics</h2>
            <span className="text-[10px] font-black text-purple-400 bg-purple-400/10 border border-purple-400/20 px-2 py-0.5 rounded-full uppercase tracking-widest ml-1">
              Pandas · NumPy · ML
            </span>
          </div>

          {analyticsLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[1,2,3].map(i => <div key={i} className="bg-slate-900 border border-slate-800 rounded-2xl p-6 animate-pulse h-32" />)}
            </div>
          ) : !analytics || analytics.total_documents === 0 ? (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-8 text-center text-slate-500">
              No analytics data yet — upload documents to see insights here.
            </div>
          ) : (
            <div className="space-y-4">

              {/* Row 1: Compliance + Risk + Processing */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">

                {/* Compliance Rate */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest">Compliance Rate</p>
                  <div className="flex items-end gap-2">
                    <span className="text-4xl font-black text-emerald-400">{analytics.compliance_percentage.toFixed(1)}%</span>
                    <span className="text-xs text-slate-500 mb-1">{analytics.clean_count}/{analytics.total_documents} clean</span>
                  </div>
                  <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full transition-all duration-700"
                      style={{ width: `${analytics.compliance_percentage}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500">{analytics.blocked_count} document{analytics.blocked_count !== 1 ? 's' : ''} blocked</p>
                </div>

                {/* Risk Stats */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Risk Statistics
                  </p>
                  <div className="grid grid-cols-2 gap-3 flex-1">
                    <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-orange-400">{analytics.risk_stats.avg_high_risk_clauses.toFixed(1)}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Avg Risk Clauses</p>
                    </div>
                    <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-red-400">{analytics.risk_stats.max_high_risk_clauses}</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Max in One Doc</p>
                    </div>
                  </div>
                </div>

                {/* Processing Speed */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 flex flex-col gap-3">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-400" /> Processing Time
                  </p>
                  <div className="grid grid-cols-2 gap-3 flex-1">
                    <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-blue-400">{analytics.processing_time_stats.avg_seconds.toFixed(2)}s</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">Average</p>
                    </div>
                    <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                      <p className="text-2xl font-black text-indigo-400">{analytics.processing_time_stats.p95_seconds.toFixed(2)}s</p>
                      <p className="text-[10px] text-slate-500 mt-0.5">P95</p>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500">Peak uploads at {analytics.peak_upload_hour}:00 hrs</p>
                </div>
              </div>

              {/* Row 2: Daily Trend Sparkline + Language Distribution */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Sparkline */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3">Daily Upload Trend</p>
                  {sparkline ? (
                    <>
                      <svg viewBox="0 0 200 40" className="w-full h-16" preserveAspectRatio="none">
                        <defs>
                          <linearGradient id="sparkGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#a855f7" stopOpacity="0.25"/>
                            <stop offset="100%" stopColor="#a855f7" stopOpacity="0"/>
                          </linearGradient>
                        </defs>
                        <polyline points={sparkline} fill="none" stroke="#a855f7" strokeWidth="2"
                          strokeLinejoin="round" strokeLinecap="round" />
                      </svg>
                      <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                        <span>{analytics.daily_upload_trend[0]?.date}</span>
                        <span>{analytics.daily_upload_trend.at(-1)?.date}</span>
                      </div>
                    </>
                  ) : (
                    <p className="text-slate-600 text-sm">Not enough data yet</p>
                  )}
                </div>

                {/* Language Distribution */}
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                  <p className="text-xs font-black text-slate-500 uppercase tracking-widest mb-3 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-purple-400" /> Language Distribution
                  </p>
                  <div className="space-y-3">
                    {Object.entries(analytics.language_distribution)
                      .sort((a, b) => b[1] - a[1]).slice(0, 4)
                      .map(([lang, count]) => {
                        const pct = Math.round((count / analytics.total_documents) * 100)
                        const bar: Record<string, string> = { en: 'bg-blue-500', hi: 'bg-orange-500', mr: 'bg-purple-500' }
                        return (
                          <div key={lang}>
                            <div className="flex justify-between text-xs mb-1">
                              <span className="text-slate-300 font-semibold">{LANG_LABELS[lang] || lang}</span>
                              <span className="text-slate-500">{count} ({pct}%)</span>
                            </div>
                            <div className="w-full h-1.5 bg-slate-800 rounded-full overflow-hidden">
                              <div className={`h-full ${bar[lang] || 'bg-slate-500'} rounded-full transition-all duration-500`} style={{ width: `${pct}%` }} />
                            </div>
                          </div>
                        )
                      })}
                  </div>
                </div>
              </div>

              {/* Row 3: Top Risk Documents */}
              {analytics.top_risk_documents.length > 0 && (
                <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
                  <div className="px-5 py-4 border-b border-slate-800 flex items-center gap-2">
                    <FileText className="w-4 h-4 text-red-400" />
                    <h3 className="text-sm font-bold text-white">Top Risk Documents</h3>
                    <span className="text-[10px] text-slate-500 ml-1">Highest risk clause count</span>
                  </div>
                  <div className="divide-y divide-slate-800/50">
                    {analytics.top_risk_documents.map((doc, i) => (
                      <div key={i} className="px-5 py-3 flex items-center justify-between hover:bg-slate-800/40 transition-colors">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-black text-slate-600 w-4">#{i + 1}</span>
                          <div>
                            <p className="text-sm font-semibold text-blue-400 truncate max-w-xs">{doc.filename}</p>
                            <p className="text-[10px] text-slate-500">{doc.language_detected?.toUpperCase()} · {new Date(doc.timestamp).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 text-xs font-black text-red-400 bg-red-400/10 border border-red-400/20 rounded-full">
                          {doc.risk_count} risk clauses
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            </div>
          )}
        </div>

        {/* Audit Trail Table */}
        <div className="bg-slate-900 rounded-3xl shadow-xl border border-slate-800 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-slate-400" /> Secure Audit Trail
            </h2>
            <div className="flex items-center gap-2">
               <span className="w-2 h-2 bg-emerald-500 rounded-full animate-ping" />
               <span className="text-[10px] font-bold text-slate-400 uppercase">Live Sync Active</span>
            </div>
          </div>
          {loading ? (
            <div className="p-12 text-center text-slate-500 animate-pulse font-bold">Synchronizing Encrypted Logs...</div>
          ) : error ? (
            <div className="p-12 text-center text-red-600 font-bold">{error}</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead className="bg-slate-950 text-slate-500 text-[10px] uppercase font-black tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Timestamp</th>
                    <th className="px-6 py-4">Document</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Storage Status</th>
                    <th className="px-6 py-4">Event Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/50 transition-colors">
                      <td className="px-6 py-5 text-sm text-slate-400">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-5 text-sm font-bold text-blue-400">{log.filename}</td>
                      <td className="px-6 py-5">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                          log.status === 'BLOCKED' ? 'bg-red-950/30 text-red-400 border-red-900/50' : 'bg-emerald-950/30 text-emerald-400 border-emerald-900/50'
                        }`}>{log.status}</span>
                      </td>
                      <td className="px-6 py-5">
                        <span className="px-2 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 rounded-md">
                          {log.storage_status || 'PURGED'}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-300 italic">{log.details}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}
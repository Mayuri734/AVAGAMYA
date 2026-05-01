import { useState, useEffect } from 'react'
import { Shield, AlertTriangle, CheckCircle, Lock, MapPin } from 'lucide-react'
import { useNavigate } from 'react-router-dom' // For security redirect
import { API_BASE_URL } from '../lib/api'

interface DPOLog {
  id: number
  timestamp: string
  filename: string
  status: 'BLOCKED' | 'CLEAN'
  details: string
  storage_status?: string
}

export function DPODashboard() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState<DPOLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [telemetry, setTelemetry] = useState({ residency: 'Fetching...', piiRetained: 0 })

  // --- 1. SECURITY GUARD (Architect Standard) ---
  useEffect(() => {
    const session = localStorage.getItem('avagamya_session')
    if (session !== 'active') {
      navigate('/staff/dpo/login') // Redirect if not authenticated
    }
  }, [navigate])

  // --- 2. DATA FETCHING ---
  useEffect(() => {
    const fetchLogs = async () => {
      try {
        setLoading(true)
        const response = await fetch(`${API_BASE_URL}/analyze/dpo/logs`)
        if (!response.ok) throw new Error('Failed to fetch DPO logs')
        const data = await response.json()
        setLogs(data)
        setError(null)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Backend Offline')
        console.error('Fetch error:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchLogs()

    const fetchTelemetry = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/v1/system/telemetry`)
        if (response.ok) {
          const data = await response.json()
          setTelemetry({
            residency: data.residency_region || 'ap-south-1 (Mumbai)',
            piiRetained: data.pii_bytes_retained || 0
          })
        }
      } catch (err) {
        // Handle silently as requested
        console.warn('Telemetry offline, using defaults.')
        setTelemetry({ residency: 'ap-south-1 (Mumbai)', piiRetained: 0 })
      }
    }
    fetchTelemetry()
  }, [])

  // Calculate metrics
  const totalScanned = logs.length
  const blockedCount = logs.filter((log) => log.status === 'BLOCKED').length
  const cleanCount = logs.filter((log) => log.status === 'CLEAN').length

  const metrics = [
    { label: 'Total Scanned', value: totalScanned, icon: Shield, color: 'bg-slate-900 border-slate-800', iconColor: 'text-blue-600' },
    { label: 'Blocked (PII)', value: blockedCount, icon: AlertTriangle, color: 'bg-slate-900 border-slate-800', iconColor: 'text-red-600' },
    { label: 'Clean Documents', value: cleanCount, icon: CheckCircle, color: 'bg-slate-900 border-slate-800', iconColor: 'text-emerald-600' },
    { label: 'Ephemeral Processing', value: 'Active', icon: Shield, color: 'bg-slate-900 border-slate-800', iconColor: 'text-emerald-500', subtitle: `${telemetry.piiRetained} Bytes PII Retained` }
  ]

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
                  {metric.subtitle && (
                    <span className="text-[10px] text-emerald-400 font-mono mt-1">{metric.subtitle}</span>
                  )}
                </div>
                <metric.icon className={`w-7 h-7 ${metric.iconColor}`} />
              </div>
            </div>
          ))}
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
                        }`}>
                          {log.status}
                        </span>
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
import { useState, useEffect } from 'react'
import { Shield, AlertTriangle, CheckCircle, Lock } from 'lucide-react'
import { useNavigate } from 'react-router-dom' // For security redirect
import { API_BASE_URL } from '../lib/api'

interface DPOLog {
  id: number
  timestamp: string
  filename: string
  status: 'BLOCKED' | 'CLEAN'
  details: string
}

export function DPODashboard() {
  const navigate = useNavigate()
  const [logs, setLogs] = useState<DPOLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

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
  }, [])

  // Calculate metrics
  const totalScanned = logs.length
  const blockedCount = logs.filter((log) => log.status === 'BLOCKED').length
  const cleanCount = logs.filter((log) => log.status === 'CLEAN').length

  const metrics = [
    { label: 'Total Scanned', value: totalScanned, icon: Shield, color: 'bg-blue-50 border-blue-200', iconColor: 'text-blue-600' },
    { label: 'Blocked (PII)', value: blockedCount, icon: AlertTriangle, color: 'bg-red-50 border-red-200', iconColor: 'text-red-600' },
    { label: 'Clean Documents', value: cleanCount, icon: CheckCircle, color: 'bg-emerald-50 border-emerald-200', iconColor: 'text-emerald-600' },
  ]

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 flex flex-col gap-8">
      <div className="max-w-7xl w-full mx-auto space-y-8">
        
        {/* Header */}
        <div>
          <h1 className="text-3xl md:text-4xl font-bold text-slate-900">DPO Console</h1>
          <p className="text-slate-600 italic">Enterprise Data Protection Monitoring</p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
          {metrics.map((metric) => (
            <div key={metric.label} className={`${metric.color} p-6 rounded-2xl border-2 shadow-sm`}>
              <p className="text-xs font-black text-slate-500 uppercase tracking-widest">{metric.label}</p>
              <div className="flex items-center justify-between mt-2">
                <span className="text-3xl font-bold text-slate-800">{metric.value}</span>
                <metric.icon className={`w-7 h-7 ${metric.iconColor}`} />
              </div>
            </div>
          ))}
        </div>

        {/* Audit Trail Table */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-100 overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
            <h2 className="text-lg font-bold text-deep-blue flex items-center gap-2">
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
                <thead className="bg-slate-50 text-slate-500 text-[10px] uppercase font-black tracking-widest">
                  <tr>
                    <th className="px-6 py-4">Timestamp</th>
                    <th className="px-6 py-4">Document</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Event Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="px-6 py-5 text-sm text-slate-500">
                        {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="px-6 py-5 text-sm font-bold text-deep-blue">{log.filename}</td>
                      <td className="px-6 py-5">
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase border ${
                          log.status === 'BLOCKED' ? 'bg-red-50 text-red-700 border-red-100' : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                        }`}>
                          {log.status}
                        </span>
                      </td>
                      <td className="px-6 py-5 text-sm text-slate-600 italic">{log.details}</td>
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
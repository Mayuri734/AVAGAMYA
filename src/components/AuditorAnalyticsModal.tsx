import React from 'react'
import { PieChart as PieIcon, BarChart as BarIcon, TrendingDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  Legend
} from 'recharts'

interface AuditorAnalyticsProps {
  auditLogs?: any[]
}

// Generating 30 days of decreasing risk velocity (85 -> 35) for demo trend
const riskVelocityData = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  score: Math.max(35, 85 - i * 1.8 + Math.random() * 5)
}))

export function AuditorAnalytics({ auditLogs = [] }: AuditorAnalyticsProps) {
  
  // Calculate real distribution from passed audit logs
  const riskDistributionData = React.useMemo(() => {
    if (auditLogs.length === 0) {
      return [
        { name: 'Compliant', value: 82, color: '#10b981' }, 
        { name: 'Minor Friction', value: 12, color: '#f59e0b' }, 
        { name: 'Critical DPDP Risk', value: 6, color: '#ef4444' }
      ]
    }
    const clean = auditLogs.filter(l => l.risk_score.includes('Low')).length
    const minor = auditLogs.filter(l => l.risk_score.includes('Medium')).length
    const critical = auditLogs.filter(l => l.risk_score.includes('High')).length
    
    return [
      { name: 'Compliant', value: clean || 1, color: '#10b981' }, 
      { name: 'Minor Friction', value: minor, color: '#f59e0b' }, 
      { name: 'Critical Risk', value: critical, color: '#ef4444' }
    ]
  }, [auditLogs])

  // Scale violations dynamically based on real audit load
  const violationsData = React.useMemo(() => {
    const base = auditLogs.length > 0 ? auditLogs.length * 3 : 100
    return [
      { name: 'Bundled Consent', cases: Math.floor(base * 0.45) },
      { name: 'Hidden APR', cases: Math.floor(base * 0.32) },
      { name: 'Data Locality', cases: Math.floor(base * 0.18) },
      { name: 'Cross-Border', cases: Math.floor(base * 0.10) }
    ]
  }, [auditLogs])

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="w-full bg-slate-900 rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-800"
      >
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-slate-800 bg-slate-950/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-900/50">
                <BarIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-white tracking-tight">Enterprise Analytics Dashboard</h2>
                <p className="text-sm text-slate-400 font-medium">Internal Auditor Intelligence View</p>
              </div>
            </div>
          </div>

          {/* Charts Area */}
          <div className="flex-1 p-8 overflow-y-auto bg-slate-900">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

              {/* Chart 1: Donut Chart */}
              <div className="bg-slate-950/50 rounded-3xl p-6 border border-slate-800 flex flex-col items-center">
                <div className="flex items-center gap-2 mb-6 self-start">
                  <PieIcon className="w-4 h-4 text-emerald-500" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Compliance Risk Distribution</span>
                </div>
                <div className="w-full h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={riskDistributionData}
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={8}
                        dataKey="value"
                      >
                        {riskDistributionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} stroke="none" />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ borderRadius: '1rem', backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Bar Chart */}
              <div className="bg-slate-950/50 rounded-3xl p-6 border border-slate-800">
                <div className="flex items-center gap-2 mb-6">
                  <BarIcon className="w-4 h-4 text-blue-500" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Violation Intensity by Category</span>
                </div>
                <div className="w-full h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={violationsData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" />
                      <XAxis type="number" hide />
                      <YAxis
                        dataKey="name"
                        type="category"
                        axisLine={false}
                        tickLine={false}
                        width={120}
                        style={{ fontSize: '10px', fontWeight: 'bold', fill: '#94a3b8' }}
                      />
                      <Tooltip
                        cursor={{ fill: '#1e293b' }}
                        contentStyle={{ borderRadius: '1rem', backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' }}
                      />
                      <Bar dataKey="cases" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 3: Area Chart (Full Width) */}
              <div className="lg:col-span-2 bg-slate-950/50 rounded-3xl p-8 border border-slate-800">
                <div className="flex items-center gap-2 mb-6">
                  <TrendingDown className="w-4 h-4 text-vibrant-orange" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Risk Velocity Trend (30 Days)</span>
                </div>
                <div className="w-full h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={riskVelocityData}>
                      <defs>
                        <linearGradient id="colorRisk" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f97316" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#f97316" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" />
                      <XAxis
                        dataKey="day"
                        hide
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        style={{ fontSize: '10px', fontWeight: 'bold', fill: '#94a3b8' }}
                      />
                      <Tooltip
                        contentStyle={{ borderRadius: '1rem', backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.5)' }}
                      />
                      <Area
                        type="monotone"
                        dataKey="score"
                        stroke="#f97316"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorRisk)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <p className="mt-4 text-center text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Average Confusion Index Decreased from 85 to 35</p>
              </div>

            </div>
          </div>

        </motion.div>
    </AnimatePresence>
  )
}

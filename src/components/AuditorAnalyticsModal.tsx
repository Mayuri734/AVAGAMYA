import { X, PieChart as PieIcon, BarChart as BarIcon, TrendingDown } from 'lucide-react'
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

interface AuditorAnalyticsModalProps {
  isOpen: boolean
  onClose: () => void
}

// --- MOCK DATA FOR DEMO ---

const riskDistributionData = [
  { name: 'Compliant', value: 82, color: '#10b981' }, // Emerald-500
  { name: 'Minor Friction', value: 12, color: '#f59e0b' }, // Amber-500
  { name: 'Critical DPDP Risk', value: 6, color: '#ef4444' } // Red-500
]

const violationsData = [
  { name: 'Bundled Consent', cases: 45 },
  { name: 'Hidden APR', cases: 32 },
  { name: 'Data Localization', cases: 18 },
  { name: 'Cross-Border Risk', cases: 10 }
]

// Generating 30 days of decreasing risk velocity (85 -> 35)
const riskVelocityData = Array.from({ length: 30 }, (_, i) => ({
  day: `Day ${i + 1}`,
  score: Math.max(35, 85 - i * 1.8 + Math.random() * 5)
}))

export function AuditorAnalyticsModal({ isOpen, onClose }: AuditorAnalyticsModalProps) {
  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-slate-900/60 backdrop-blur-md"
        />

        {/* Modal Content */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative w-full max-w-[90%] lg:max-w-6xl h-[85vh] bg-white rounded-[2.5rem] shadow-2xl flex flex-col overflow-hidden border border-slate-100"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-8 py-6 border-b border-slate-50 bg-slate-50/50">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-600 flex items-center justify-center shadow-lg shadow-blue-200">
                <BarIcon className="w-6 h-6 text-white" />
              </div>
              <div>
                <h2 className="text-2xl font-black text-slate-900 tracking-tight">Enterprise Analytics Dashboard</h2>
                <p className="text-sm text-slate-500 font-medium">External Auditor Intelligence View</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-3 hover:bg-slate-200/50 rounded-2xl transition-all group"
            >
              <X className="w-6 h-6 text-slate-400 group-hover:text-slate-600 transition-colors" />
            </button>
          </div>

          {/* Charts Area */}
          <div className="flex-1 p-8 overflow-y-auto bg-white">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              
              {/* Chart 1: Donut Chart */}
              <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100 flex flex-col items-center">
                <div className="flex items-center gap-2 mb-6 self-start">
                  <PieIcon className="w-4 h-4 text-emerald-600" />
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
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Legend verticalAlign="bottom" height={36} iconType="circle" />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 2: Bar Chart */}
              <div className="bg-slate-50/50 rounded-3xl p-6 border border-slate-100">
                <div className="flex items-center gap-2 mb-6">
                  <BarIcon className="w-4 h-4 text-blue-600" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Violation Intensity by Category</span>
                </div>
                <div className="w-full h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={violationsData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                      <XAxis type="number" hide />
                      <YAxis 
                        dataKey="name" 
                        type="category" 
                        axisLine={false} 
                        tickLine={false} 
                        width={120}
                        style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }}
                      />
                      <Tooltip 
                        cursor={{ fill: '#f1f5f9' }}
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
                      />
                      <Bar dataKey="cases" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Chart 3: Area Chart (Full Width) */}
              <div className="lg:col-span-2 bg-slate-50/50 rounded-3xl p-8 border border-slate-100">
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
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis 
                        dataKey="day" 
                        hide 
                      />
                      <YAxis 
                        axisLine={false} 
                        tickLine={false}
                        style={{ fontSize: '10px', fontWeight: 'bold', fill: '#64748b' }}
                      />
                      <Tooltip 
                        contentStyle={{ borderRadius: '1rem', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
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

          {/* Footer */}
          <div className="px-8 py-4 border-t border-slate-50 bg-slate-50/30 flex justify-end">
             <button 
              onClick={onClose}
              className="px-6 py-2.5 bg-slate-900 text-white rounded-xl font-bold hover:shadow-lg transition-all"
             >
                Close Report
             </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

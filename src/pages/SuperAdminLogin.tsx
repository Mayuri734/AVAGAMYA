import { useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldAlert, AlertCircle, ArrowRight, Lock, User } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MODULE_CREDENTIALS } from '../constants/access'

export function SuperAdminLogin() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [formData, setFormData] = useState({ email: '', password: '' })

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Hardcoded Admin Logic
      if (formData.email === MODULE_CREDENTIALS.SUPERADMIN.user && 
          formData.password === MODULE_CREDENTIALS.SUPERADMIN.pass) {
        
        // Mock successful login delay
        await new Promise(resolve => setTimeout(resolve, 800))
        navigate('/superadmin/dashboard')
      } else {
        throw new Error('Invalid administrator credentials.')
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-[3rem] shadow-2xl p-10 relative overflow-hidden"
      >
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-red-500 via-orange-500 to-red-500" />
        
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-red-50 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-red-100">
            <ShieldAlert className="w-10 h-10 text-red-600" />
          </div>
          <h2 className="text-3xl font-serif font-bold text-slate-900 leading-tight">Super Admin Console</h2>
          <p className="text-slate-500 mt-2 text-sm uppercase tracking-widest font-bold">AVAGAMYA Platform Owner</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="email"
              placeholder="Admin Email"
              required
              className="w-full pl-12 pr-4 py-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-red-500/10 outline-none transition-all"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
          </div>

          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <input
              type="password"
              placeholder="Master Key"
              required
              className="w-full pl-12 pr-4 py-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-red-500/10 outline-none transition-all"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
          </div>

          {error && (
            <div className="text-red-600 text-sm flex items-center gap-2 bg-red-50 p-4 rounded-2xl border border-red-100">
              <AlertCircle className="w-5 h-5 shrink-0" /> {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-5 bg-slate-900 text-white rounded-2xl font-bold hover:bg-slate-800 transition-all shadow-xl shadow-slate-200 flex items-center justify-center gap-3 disabled:opacity-50 group"
          >
            {loading ? 'Authenticating...' : 'Enter Console'}
            {!loading && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
          </button>
        </form>

        <div className="mt-10 text-center">
          <button 
            onClick={() => navigate('/enterprise/auth')}
            className="text-slate-400 text-xs font-bold uppercase tracking-widest hover:text-slate-600 transition-colors"
          >
            Back to Bank Portal
          </button>
        </div>
      </motion.div>
    </div>
  )
}

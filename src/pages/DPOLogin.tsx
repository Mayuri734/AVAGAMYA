import { useState } from 'react'
import { motion } from 'framer-motion'
import { ShieldCheck, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MODULE_CREDENTIALS } from '../constants/access' // Centralized RBAC

export function DPOLogin() {
  const navigate = useNavigate()
  const [loginForm, setLoginForm] = useState({ user: '', pass: '' })
  const [loginError, setLoginError] = useState('')

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    
    // Validate against central credentials
    if (
      loginForm.user === MODULE_CREDENTIALS.DPO.user &&
      loginForm.pass === MODULE_CREDENTIALS.DPO.pass
    ) {
      // 1. Set the session flag for the Global Navbar
      localStorage.setItem('avagamya_session', 'active')
      
      // 2. Clear errors and redirect to the actual dashboard
      setLoginError('')
      navigate('/staff/dpo-dashboard')
    } else {
      setLoginError('Unauthorized: Invalid DPO Credentials.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-slate-100"
      >
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-deep-blue/5 rounded-full flex items-center justify-center mx-auto mb-4">
            <ShieldCheck className="w-8 h-8 text-deep-blue" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-deep-blue">DPO Access Portal</h2>
          <p className="text-slate-grey text-sm italic">Oversight & Data Protection</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <input
              type="text" 
              placeholder="DPO Username" 
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-vibrant-orange/20 outline-none transition-all"
              onChange={(e) => setLoginForm({ ...loginForm, user: e.target.value })}
            />
          </div>
          
          <div>
            <input
              type="password" 
              placeholder="Access Key" 
              required
              className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-vibrant-orange/20 outline-none transition-all"
              onChange={(e) => setLoginForm({ ...loginForm, pass: e.target.value })}
            />
          </div>

          {loginError && (
            <div className="text-red-500 text-sm flex items-center gap-2 bg-red-50 p-3 rounded-lg border border-red-100">
              <AlertCircle className="w-4 h-4" /> {loginError}
            </div>
          )}

          <button 
            type="submit" 
            className="w-full py-4 bg-deep-blue text-white rounded-xl font-bold hover:bg-opacity-90 transition-all shadow-lg shadow-deep-blue/10 active:scale-95"
          >
            Verify Access
          </button>
        </form>
      </motion.div>
    </div>
  )
}
import { useState } from 'react'
import { motion } from 'framer-motion'
import { Scale, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MODULE_CREDENTIALS } from '../constants/access'

export function ComplianceLogin() {
  const navigate = useNavigate()
  const [loginForm, setLoginForm] = useState({ user: '', pass: '' })
  const [loginError, setLoginError] = useState('')

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (
      loginForm.user === MODULE_CREDENTIALS.COMPLIANCE.user &&
      loginForm.pass === MODULE_CREDENTIALS.COMPLIANCE.pass
    ) {
      localStorage.setItem('avagamya_session', 'active')
      navigate('/staff/compliance-dashboard')
    } else {
      setLoginError('Unauthorized: Invalid Compliance Credentials.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-slate-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-vibrant-orange/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <Scale className="w-8 h-8 text-vibrant-orange" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-deep-blue">Compliance Portal</h2>
          <p className="text-slate-grey text-sm">Regulatory Audit & Simulation</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="text" placeholder="Compliance Username" required className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none" onChange={(e) => setLoginForm({ ...loginForm, user: e.target.value })} />
          <input type="password" placeholder="Access Key" required className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none" onChange={(e) => setLoginForm({ ...loginForm, pass: e.target.value })} />
          {loginError && <div className="text-red-500 text-sm flex items-center gap-2 bg-red-50 p-3 rounded-lg"><AlertCircle className="w-4 h-4" /> {loginError}</div>}
          <button type="submit" className="w-full py-4 bg-deep-blue text-white rounded-xl font-bold shadow-lg shadow-deep-blue/10">Verify Access</button>
        </form>
      </motion.div>
    </div>
  )
}
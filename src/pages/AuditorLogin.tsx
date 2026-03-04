import { useState } from 'react'
import { motion } from 'framer-motion'
import { ClipboardCheck, AlertCircle } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { MODULE_CREDENTIALS } from '../constants/access'

export function AuditorLogin() {
  const navigate = useNavigate()
  const [loginForm, setLoginForm] = useState({ user: '', pass: '' })
  const [loginError, setLoginError] = useState('')

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    if (
      loginForm.user === MODULE_CREDENTIALS.AUDITOR.user &&
      loginForm.pass === MODULE_CREDENTIALS.AUDITOR.pass
    ) {
      localStorage.setItem('avagamya_session', 'active')
      navigate('/staff/auditor-dashboard')
    } else {
      setLoginError('Unauthorized: Invalid Auditor Credentials.')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 border border-slate-100">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <ClipboardCheck className="w-8 h-8 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-serif font-bold text-deep-blue">Auditor Control</h2>
          <p className="text-slate-grey text-sm">Transparency & Logs Verification</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <input type="text" placeholder="Auditor Username" required className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none" onChange={(e) => setLoginForm({ ...loginForm, user: e.target.value })} />
          <input type="password" placeholder="Access Key" required className="w-full px-4 py-3 rounded-xl border border-slate-200 outline-none" onChange={(e) => setLoginForm({ ...loginForm, pass: e.target.value })} />
          {loginError && <div className="text-red-500 text-sm flex items-center gap-2 bg-red-50 p-3 rounded-lg"><AlertCircle className="w-4 h-4" /> {loginError}</div>}
          <button type="submit" className="w-full py-4 bg-deep-blue text-white rounded-xl font-bold shadow-lg shadow-deep-blue/10">Verify Access</button>
        </form>
      </motion.div>
    </div>
  )
}
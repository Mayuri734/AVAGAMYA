import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { AlertCircle, Building2, Mail, Phone, Lock, ArrowRight, MailCheck, ArrowLeft } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function EnterpriseAuth() {
  const navigate = useNavigate()
  const [step, setStep] = useState<'form' | 'otp'>('form')
  const [isSignUp, setIsSignUp] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [otpToken, setOtpToken] = useState('')

  const [formData, setFormData] = useState({
    bankName: '',
    email: '',
    phone: '',
    password: ''
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      if (isSignUp) {
        // Register User in Supabase Auth & Pass Metadata
        const { error: authError } = await supabase.auth.signUp({
          email: formData.email,
          password: formData.password,
          options: {
            data: {
              bank_name: formData.bankName,
              phone_number: formData.phone
            }
          }
        })

        if (authError) throw authError

        alert('Registration successful! Your organization is now under review. Waiting for approval.')
        setIsSignUp(false)
      } else {
        // Passwordless OTP login trigger
        const { error: loginError } = await supabase.auth.signInWithOtp({
          email: formData.email,
        })

        if (loginError) throw loginError

        setStep('otp')
      }
    } catch (err: any) {
      setError(err.message || 'An error occurred during authentication.')
    } finally {
      setLoading(false)
    }
  }

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      const { error: verifyError } = await supabase.auth.verifyOtp({
        email: formData.email,
        token: otpToken,
        type: 'email'
      })

      if (verifyError) throw verifyError

      navigate('/staff/modules')
    } catch (err: any) {
      setError(err.message || 'Invalid verification code.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 pt-24 overflow-hidden">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-xl bg-white rounded-[2.5rem] shadow-2xl p-10 border border-slate-100 relative"
      >
        <AnimatePresence mode="wait">
          {step === 'form' ? (
            <motion.div
              key="form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.3 }}
            >
              <div className="text-center mb-10">
                <div className="w-20 h-20 bg-orange-50 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-orange-100 shadow-sm">
                  <Building2 className="w-10 h-10 text-orange-600" />
                </div>
                <h2 className="text-3xl font-serif font-bold text-slate-900">
                  {isSignUp ? 'Bank Onboarding' : 'Bank IT Portal'}
                </h2>
              </div>

              <form onSubmit={handleSubmit} className="space-y-5">
                {isSignUp && (
                  <div className="grid grid-cols-1 gap-5">
                    <div className="relative">
                      <Building2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <input
                        type="text"
                        placeholder="Bank Name"
                        required
                        className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                        value={formData.bankName}
                        onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                      />
                    </div>
                  </div>
                )}

                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="email"
                    placeholder="Official Email"
                    required
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  />
                </div>

                {isSignUp && (
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <input
                      type="tel"
                      placeholder="Phone Number"
                      required
                      className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    />
                  </div>
                )}

                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="password"
                    placeholder="Password"
                    required
                    className="w-full pl-12 pr-4 py-3.5 rounded-2xl border border-slate-200 focus:ring-2 focus:ring-orange-500/20 outline-none transition-all"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  />
                </div>

                {error && (
                  <div className="text-red-500 text-sm flex items-center gap-2 bg-red-50 p-4 rounded-2xl border border-red-100">
                    <AlertCircle className="w-5 h-5 shrink-0" /> {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-4 bg-orange-600 text-white rounded-2xl font-bold hover:bg-orange-700 transition-all shadow-lg shadow-orange-200 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {loading ? 'Processing...' : (isSignUp ? 'Submit' : 'Sign In with OTP')}
                  {!loading && <ArrowRight className="w-5 h-5" />}
                </button>
              </form>

              <div className="mt-8 text-center pt-8 border-t border-slate-100">
                <p className="text-slate-600 text-sm">
                  {isSignUp ? 'Already registered?' : 'New organization?'}
                  <button
                    onClick={() => setIsSignUp(!isSignUp)}
                    className="ml-2 font-bold text-orange-600 hover:underline"
                  >
                    {isSignUp ? 'Log in here' : 'Request Onboarding'}
                  </button>
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="otp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.3 }}
              className="text-center"
            >
              <div className="w-20 h-20 bg-emerald-50 rounded-3xl flex items-center justify-center mx-auto mb-6 border border-emerald-100 shadow-sm">
                <MailCheck className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-3xl font-serif font-bold text-slate-900 mb-2">
                Verify Your Email
              </h2>
              <p className="text-slate-500 mb-8">
                We've sent a 6-digit secure code to <span className="font-bold text-slate-700">{formData.email}</span>
              </p>

              <form onSubmit={handleVerifyOtp} className="space-y-6">
                <div>
                  <input
                    type="text"
                    maxLength={6}
                    placeholder="------"
                    required
                    className="w-full text-center text-4xl tracking-[1em] py-4 rounded-2xl border border-slate-200 focus:ring-4 focus:ring-emerald-500/20 outline-none transition-all font-mono font-bold text-slate-800 placeholder:text-slate-300"
                    value={otpToken}
                    onChange={(e) => setOtpToken(e.target.value.replace(/\D/g, ''))}
                  />
                </div>

                {error && (
                  <div className="text-red-500 text-sm flex items-center justify-center gap-2 bg-red-50 p-4 rounded-2xl border border-red-100">
                    <AlertCircle className="w-5 h-5 shrink-0" /> {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading || otpToken.length !== 6}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200 flex items-center justify-center gap-3 disabled:opacity-50"
                >
                  {loading ? 'Verifying...' : 'Verify & Proceed'}
                  {!loading && <ArrowRight className="w-5 h-5" />}
                </button>
              </form>

              <div className="mt-8 pt-8 border-t border-slate-100">
                <button
                  onClick={() => {
                    setStep('form');
                    setOtpToken('');
                    setError('');
                  }}
                  className="text-slate-400 font-bold hover:text-slate-600 transition-colors flex items-center justify-center gap-2 mx-auto text-sm uppercase tracking-widest"
                >
                  <ArrowLeft className="w-4 h-4" /> Back to login
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}

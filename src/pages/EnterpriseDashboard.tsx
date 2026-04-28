import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Building2, 
  ShieldCheck, 
  Key, 
  Clock, 
  Copy, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCcw,
  LogOut,
  Terminal,
  Activity,
  Layers
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function EnterpriseDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tenant, setTenant] = useState<any>(null)
  const [keys, setKeys] = useState<any[]>([])
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)

  useEffect(() => {
    fetchTenantData()
  }, [])

  const fetchTenantData = async () => {
    setLoading(true)
    let userEmail = ''
    
    const { data: { user } } = await supabase.auth.getUser()
    
    if (user) {
      userEmail = user.email || ''
    } else {
      // Check for mock session
      const mockSessionStr = localStorage.getItem('avagamya_mock_session')
      if (mockSessionStr) {
        const mockSession = JSON.parse(mockSessionStr)
        userEmail = mockSession.email
      }
    }
    
    if (!userEmail) {
      navigate('/enterprise/auth')
      return
    }

    // Use a hardcoded mock tenant for the developer demo
    if (userEmail === 'dev@bank.com') {
      const mockTenant = {
        id: 'mock-tenant-id-123',
        bank_name: 'HDFC Global Banking',
        admin_name: 'Jayesh (Demo Admin)',
        official_email: 'dev@bank.com',
        status: 'APPROVED',
        created_at: new Date().toISOString()
      }
      setTenant(mockTenant)
      fetchKeys(mockTenant.id)
      setLoading(false)
      return
    }

    const { data: tenantData, error: tenantError } = await supabase
      .from('api_tenants')
      .select('*')
      .eq('official_email', userEmail)
      .single()

    if (tenantError) {
      console.error(tenantError)
    } else {
      setTenant(tenantData)
      if (tenantData.status === 'APPROVED') {
        fetchKeys(tenantData.id)
      }
    }
    setLoading(false)
  }

  const fetchKeys = async (tenantId: string) => {
    const { data, error } = await supabase
      .from('api_keys')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    
    if (!error) setKeys(data || [])
  }

  const handleGenerateKey = async () => {
    if (!tenant) return

    // Create a raw key (avm_...)
    const rawKey = `avm_${crypto.randomUUID().replace(/-/g, '')}`
    
    // Hash it for storage
    const encoder = new TextEncoder()
    const data = encoder.encode(rawKey)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    const hashedKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

    const { error } = await supabase.from('api_keys').insert({
      tenant_id: tenant.id,
      hashed_key: hashedKey,
      is_active: true
    })

    if (!error) {
      setNewKey(rawKey)
      fetchKeys(tenant.id)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopying(true)
    setTimeout(() => setCopying(false), 2000)
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    localStorage.removeItem('avagamya_mock_session')
    navigate('/staff/modules')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <RefreshCcw className="w-8 h-8 text-orange-600 animate-spin" />
      </div>
    )
  }

  if (!tenant || tenant.status === 'PENDING') {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl w-full bg-white rounded-[3rem] shadow-2xl p-12 text-center border border-slate-100"
        >
          <div className="w-24 h-24 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-8 border border-amber-100 shadow-sm relative">
            <Clock className="w-12 h-12 text-amber-600" />
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-full flex items-center justify-center shadow-md animate-bounce">
              <Activity className="w-4 h-4 text-amber-500" />
            </div>
          </div>
          <h2 className="text-3xl font-serif font-bold text-slate-900 mb-4">Verification in Progress</h2>
          <p className="text-slate-600 text-lg leading-relaxed mb-8">
            Greetings from AVAGAMYA. Your organization, <span className="font-bold text-slate-900">{tenant?.bank_name || 'Loading...'}</span>, 
            is currently undergoing our secure enterprise vetting process.
          </p>
          <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100 inline-block text-left mb-10">
            <div className="flex items-center gap-3 text-sm text-slate-500 mb-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Administrative Review
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500 mb-2">
              <CheckCircle2 className="w-4 h-4 text-slate-300" /> Security Clearance
            </div>
            <div className="flex items-center gap-3 text-sm text-slate-500">
              <CheckCircle2 className="w-4 h-4 text-slate-300" /> Key Activation
            </div>
          </div>
          <p className="text-slate-400 text-sm mb-8 italic">Please check back in 24-48 business hours.</p>
          <button 
            onClick={handleLogout}
            className="flex items-center gap-2 text-slate-500 hover:text-red-500 transition-colors mx-auto font-semibold"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 p-6 pt-24 pb-20">
      <div className="max-w-6xl mx-auto">
        {/* Header Area */}
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div className="flex items-center gap-6">
            <div className="w-16 h-16 bg-gradient-to-br from-orange-500 to-orange-600 rounded-2xl flex items-center justify-center shadow-lg shadow-orange-200">
              <Building2 className="w-8 h-8 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-serif font-bold text-slate-900">{tenant.bank_name}</h1>
              <div className="flex items-center gap-2 mt-1">
                <span className="px-3 py-1 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-full border border-emerald-100 flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> APPROVED ENTERPRISE
                </span>
                <span className="text-slate-400 text-sm italic">• Admin: {tenant.admin_name}</span>
              </div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="px-6 py-3 bg-white border border-slate-200 text-slate-600 rounded-xl font-bold hover:bg-red-50 hover:text-red-600 hover:border-red-100 transition-all flex items-center gap-2 shadow-sm"
          >
            <LogOut className="w-4 h-4" /> Terminate Session
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Dashboard Content */}
          <div className="lg:col-span-2 space-y-8">
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="bg-white rounded-[2.5rem] shadow-xl p-8 border border-slate-100"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-blue-50 rounded-xl">
                    <Key className="w-6 h-6 text-blue-600" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 font-serif">API Authentication Keys</h3>
                </div>
                <button 
                  onClick={handleGenerateKey}
                  className="px-5 py-2.5 bg-slate-900 text-white rounded-xl text-sm font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-lg active:scale-95"
                >
                  <RefreshCcw className="w-4 h-4" /> Generate New Key
                </button>
              </div>

              {/* Reveal New Key Area */}
              <AnimatePresence>
                {newKey && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mb-8"
                  >
                    <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-6 relative overflow-hidden">
                      <div className="absolute top-0 right-0 p-2 bg-amber-200 text-amber-700 text-[10px] font-bold uppercase tracking-widest rounded-bl-xl">
                        Reveal Once
                      </div>
                      <div className="flex items-center gap-2 text-amber-800 mb-3 font-bold text-sm">
                        <AlertCircle className="w-4 h-4" /> Copy your key now. It will not be shown again.
                      </div>
                      <div className="flex items-center gap-4 bg-white p-4 rounded-xl border border-amber-100 shadow-inner">
                        <code className="text-sm font-mono text-slate-900 break-all select-all flex-grow">
                          {newKey}
                        </code>
                        <button 
                          onClick={() => copyToClipboard(newKey)}
                          className="p-3 bg-amber-500 text-white rounded-lg hover:bg-amber-600 transition-colors shrink-0"
                        >
                          {copying ? <CheckCircle2 className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                        </button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Active Keys Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-50">
                      <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Key Fingerprint</th>
                      <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest">Created</th>
                      <th className="pb-4 text-xs font-bold text-slate-400 uppercase tracking-widest text-right">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.length === 0 ? (
                      <tr>
                        <td colSpan={3} className="py-12 text-center text-slate-400 italic">
                          No API keys generated yet.
                        </td>
                      </tr>
                    ) : (
                      keys.map((key) => (
                        <tr key={key.id} className="border-b border-slate-50 last:border-0">
                          <td className="py-5 font-mono text-xs text-slate-500">
                            {key.hashed_key.substring(0, 16)}...
                          </td>
                          <td className="py-5 text-sm text-slate-600">
                            {new Date(key.created_at).toLocaleDateString()}
                          </td>
                          <td className="py-5 text-right">
                            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                              <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> ACTIVE
                            </span>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-slate-900 rounded-3xl p-8 text-white">
                <Terminal className="w-8 h-8 text-orange-500 mb-4" />
                <h4 className="text-lg font-bold mb-2 font-serif">Quick Integration</h4>
                <p className="text-slate-400 text-sm leading-relaxed mb-6">
                  Use your API key in the <code className="text-orange-400">X-AVAGAMYA-API-KEY</code> header for all requests.
                </p>
                <button className="text-xs font-bold text-white uppercase tracking-widest hover:text-orange-400 transition-colors flex items-center gap-2">
                  Read API Docs <ArrowRight className="w-3 h-3 text-orange-500" />
                </button>
              </div>
              <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-md">
                <Layers className="w-8 h-8 text-blue-600 mb-4" />
                <h4 className="text-lg font-bold mb-2 font-serif text-slate-900">Module Access</h4>
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Compliance Engine</span>
                    <span className="text-emerald-600 font-bold">ENABLED</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Document Scoring</span>
                    <span className="text-emerald-600 font-bold">ENABLED</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Custom Ruleset</span>
                    <span className="text-slate-400 font-bold italic">ADD-ON</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Sidebar / Stats */}
          <div className="space-y-8">
            <div className="bg-white rounded-[2.5rem] shadow-xl p-8 border border-slate-100 overflow-hidden relative">
              <div className="absolute -right-8 -top-8 w-24 h-24 bg-orange-50 rounded-full blur-3xl opacity-50" />
              <h3 className="text-lg font-bold text-slate-900 mb-6 font-serif">Usage Snapshot</h3>
              <div className="space-y-8">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100">
                    <Activity className="w-6 h-6 text-slate-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900 font-serif">0</div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">Total API Calls</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-50 flex items-center justify-center border border-slate-100">
                    <CheckCircle2 className="w-6 h-6 text-slate-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-slate-900 font-serif">99.9%</div>
                    <div className="text-xs font-bold text-slate-400 uppercase tracking-widest">System Uptime</div>
                  </div>
                </div>
              </div>
              <div className="mt-10 pt-8 border-t border-slate-50">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">
                  Account Manager
                </div>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-50 border border-orange-100 flex items-center justify-center text-orange-600 font-bold text-xs">
                    AV
                  </div>
                  <div>
                    <div className="text-sm font-bold text-slate-900">AVAGAMYA Business Support</div>
                    <div className="text-[10px] text-slate-500">support@avagamya.com</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

function ArrowRight(props: any) {
  return (
    <svg 
      {...props}
      xmlns="http://www.w3.org/2000/svg" 
      width="24" 
      height="24" 
      viewBox="0 0 24 24" 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
    >
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  )
}

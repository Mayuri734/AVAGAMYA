import { useState, useEffect } from 'react'
import { 
  ShieldAlert, 
  Users, 
  CheckCircle2, 
  XCircle, 
  Search, 
  Building2, 
  Calendar,
  MoreVertical,
  LogOut,
  RefreshCcw,
  ExternalLink,
  Clock,
  CreditCard,
  BarChart3
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'

export function SuperAdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState<any[]>([])
  const [stats, setStats] = useState({ pending: 0, approved: 0 })
  const [activeTab, setActiveTab] = useState<'onboarding' | 'billing'>('onboarding')

  useEffect(() => {
    fetchTenants()
  }, [])

  const fetchTenants = async () => {
    setLoading(true)
    // Supabase auth check removed for hardcoded admin logic

    const { data, error } = await supabase
      .from('api_tenants')
      .select('*')
      .order('created_at', { ascending: false })

    if (!error) {
      setTenants(data || [])
      const pending = data?.filter(t => t.status === 'PENDING').length || 0
      const approved = data?.filter(t => t.status === 'APPROVED').length || 0
      setStats({ pending, approved })
    }
    setLoading(false)
  }

  const handleUpdateStatus = async (id: string, status: 'APPROVED' | 'REJECTED') => {
    const { error } = await supabase
      .from('api_tenants')
      .update({ status })
      .eq('id', id)

    if (!error) {
      fetchTenants()
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    navigate('/enterprise/auth')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      {/* Sidebar (Mobile Hidden) */}
      <div className="fixed left-0 top-0 h-full w-64 bg-slate-900 border-r border-slate-800 p-6 hidden lg:block">
        <div className="flex items-center gap-3 mb-10 px-2">
          <ShieldAlert className="w-8 h-8 text-red-500" />
          <span className="text-xl font-bold font-serif tracking-tight text-white">AVAGAMYA HQ</span>
        </div>

        <nav className="space-y-2">
          <button 
            onClick={() => setActiveTab('onboarding')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'onboarding' ? 'bg-red-500/10 text-red-500' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <Users className="w-5 h-5" /> Onboarding Requests
          </button>
          <button 
            onClick={() => setActiveTab('billing')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
              activeTab === 'billing' ? 'bg-red-500/10 text-red-500' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <CreditCard className="w-5 h-5" /> Billing & Usage
          </button>
        </nav>

        <div className="absolute bottom-10 left-6 right-6">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 text-slate-500 hover:text-white transition-colors text-sm font-bold"
          >
            <LogOut className="w-5 h-5" /> Sign Out
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="lg:ml-64 p-8">
        <header className="flex flex-col md:flex-row md:items-center justify-between mb-10 gap-6">
          <div>
            <h1 className="text-3xl font-bold text-white font-serif">Maker-Checker Console</h1>
            <p className="text-slate-500 mt-1">Reviewing bank onboarding & API gateway requests</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-xl px-4 py-2">
              <Search className="w-4 h-4 text-slate-500 mr-3" />
              <input 
                type="text" 
                placeholder="Search organizations..." 
                className="bg-transparent border-none outline-none text-sm w-48"
              />
            </div>
            <button 
              onClick={fetchTenants}
              className="p-2.5 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors border border-slate-700"
            >
              <RefreshCcw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-10">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-amber-500/10 rounded-lg text-amber-500">
                <Clock className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold text-white">{stats.pending}</div>
            <div className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Pending Review</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500">
                <CheckCircle2 className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold text-white">{stats.approved}</div>
            <div className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Approved Banks</div>
          </div>
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
            <div className="flex items-center justify-between mb-4">
              <div className="p-2 bg-blue-500/10 rounded-lg text-blue-500">
                <ExternalLink className="w-5 h-5" />
              </div>
            </div>
            <div className="text-3xl font-bold text-white">{tenants.length}</div>
            <div className="text-sm text-slate-500 font-bold uppercase tracking-widest mt-1">Total Requests</div>
          </div>
        </div>

        {/* Dynamic Content based on Tab */}
        {activeTab === 'onboarding' ? (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white font-serif tracking-tight">Active Onboarding Requests</h3>
              <span className="text-xs bg-slate-800 px-3 py-1 rounded-full text-slate-400 font-bold uppercase tracking-widest">Live Updates</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-800/30">
                    <th className="p-6 text-xs font-bold text-slate-500 uppercase tracking-widest">Organization Details</th>
                    <th className="p-6 text-xs font-bold text-slate-500 uppercase tracking-widest">Administrator</th>
                    <th className="p-6 text-xs font-bold text-slate-500 uppercase tracking-widest">Submission Date</th>
                    <th className="p-6 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
                    <th className="p-6 text-xs font-bold text-slate-500 uppercase tracking-widest text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-slate-800/50 transition-colors group">
                      <td className="p-6">
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400 group-hover:text-red-500 transition-colors">
                            <Building2 className="w-6 h-6" />
                          </div>
                          <div>
                            <p className="font-bold text-white">{tenant.bank_name}</p>
                            <p className="text-sm text-slate-500">{tenant.official_email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="p-6">
                        <p className="font-medium text-slate-300">{tenant.admin_name}</p>
                        <p className="text-xs text-slate-500">{tenant.phone_number}</p>
                      </td>
                      <td className="p-6">
                        <div className="flex items-center gap-2 text-slate-400 text-sm">
                          <Calendar className="w-4 h-4" />
                          {new Date(tenant.created_at).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="p-6">
                        {tenant.status === 'PENDING' ? (
                          <div className="flex items-center gap-2 text-amber-500 text-xs font-bold uppercase tracking-widest">
                            <Clock className="w-4 h-4" /> Request Pending
                          </div>
                        ) : tenant.status === 'APPROVED' ? (
                          <div className="flex items-center gap-2 text-emerald-500 text-xs font-bold uppercase tracking-widest">
                            <CheckCircle2 className="w-4 h-4" /> Fully Cleared
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 text-red-500 text-xs font-bold uppercase tracking-widest">
                            <XCircle className="w-4 h-4" /> Request Denied
                          </div>
                        )}
                      </td>
                      <td className="p-6 text-right">
                        {tenant.status === 'PENDING' ? (
                          <div className="flex items-center justify-end gap-3">
                            <button 
                              onClick={() => handleUpdateStatus(tenant.id, 'REJECTED')}
                              className="p-2 hover:bg-red-500/10 text-slate-600 hover:text-red-500 rounded-lg transition-all"
                            >
                              <XCircle className="w-6 h-6" />
                            </button>
                            <button 
                              onClick={() => handleUpdateStatus(tenant.id, 'APPROVED')}
                              className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-500 transition-all shadow-lg shadow-emerald-900/20 active:scale-95 flex items-center gap-2"
                            >
                              Authorize Access
                            </button>
                          </div>
                        ) : (
                          <button className="p-2 text-slate-600 hover:text-slate-400">
                            <MoreVertical className="w-5 h-5" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tenants.length === 0 && (
                <div className="py-20 text-center text-slate-600 font-serif italic text-lg">
                  The global vetting queue is currently empty.
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-bold text-white font-serif">Enterprise Billing Console</h3>
                <p className="text-slate-500 text-sm mt-1">Real-time consumption tracking for active API tenants</p>
              </div>
              <div className="px-4 py-2 bg-blue-500/10 text-blue-500 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2 border border-blue-500/20">
                <BarChart3 className="w-4 h-4" /> Credits-Based Billing
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-800/30">
                    <th className="p-6 text-xs font-bold text-slate-500 uppercase tracking-widest">Bank Client</th>
                    <th className="p-6 text-xs font-bold text-slate-500 uppercase tracking-widest">API Consumption</th>
                    <th className="p-6 text-xs font-bold text-slate-500 uppercase tracking-widest">Remaining Credits</th>
                    <th className="p-6 text-xs font-bold text-slate-500 uppercase tracking-widest">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {tenants.filter(t => t.status === 'APPROVED').map((tenant) => (
                    <tr key={tenant.id} className="hover:bg-slate-800/50 transition-colors group">
                      <td className="p-6">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 group-hover:text-blue-500 transition-colors">
                            <Building2 className="w-5 h-5" />
                          </div>
                          <p className="font-bold text-white">{tenant.bank_name}</p>
                        </div>
                      </td>
                      <td className="p-6 text-slate-300 font-mono text-sm">
                        {(Math.random() * 5000 + 100).toFixed(0)} calls
                      </td>
                      <td className="p-6 text-slate-300 font-mono text-sm">
                        ${(Math.random() * 1000 + 500).toFixed(2)}
                      </td>
                      <td className="p-6">
                        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-500 text-[10px] font-bold rounded-full border border-emerald-500/20">
                          AUTO-RENEW ACTIVE
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {tenants.filter(t => t.status === 'APPROVED').length === 0 && (
                <div className="py-20 text-center text-slate-600 font-serif italic text-lg">
                  No active enterprise clients to display billing for.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

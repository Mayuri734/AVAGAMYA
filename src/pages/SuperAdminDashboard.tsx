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
  BarChart3,
  Activity,
  TrendingUp,
  Terminal,
  ArrowUpRight,
  ArrowDownRight,
  PauseCircle,
  Trash2,
  Key,
  Megaphone,
  PlayCircle
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'

const getSeed = (id: string) => {
  if (!id) return 12345;
  let seed = 0;
  for (let i = 0; i < id.length; i++) {
    seed += id.charCodeAt(i);
  }
  return seed;
};

const chartData = [
  { time: 'Mon', requests: 4000, cacheHits: 2400 },
  { time: 'Tue', requests: 3000, cacheHits: 1398 },
  { time: 'Wed', requests: 2000, cacheHits: 9800 },
  { time: 'Thu', requests: 2780, cacheHits: 3908 },
  { time: 'Fri', requests: 1890, cacheHits: 4800 },
  { time: 'Sat', requests: 2390, cacheHits: 3800 },
  { time: 'Sun', requests: 3490, cacheHits: 4300 },
];

export function SuperAdminDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tenants, setTenants] = useState<any[]>([])
  const [stats, setStats] = useState({ pending: 0, approved: 0 })
  const [activeTab, setActiveTab] = useState<'onboarding' | 'billing' | 'telemetry'>('onboarding')

  const [liveMetrics, setLiveMetrics] = useState({
    totalApiCalls: 845020,
    cacheHits: 654000,
    avgLatency: 124,
    revenue: 45050.50
  })
  const [recentLogs, setRecentLogs] = useState<string[]>([])

  useEffect(() => {
    fetchTenants()
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      setLiveMetrics(prev => {
        const newCalls = Math.floor(Math.random() * 5) + 1;
        const newCache = Math.random() > 0.3 ? newCalls : 0; // ~70% cache hit rate
        return {
          totalApiCalls: prev.totalApiCalls + newCalls,
          cacheHits: prev.cacheHits + newCache,
          avgLatency: 110 + Math.floor(Math.random() * 40), // 110-150ms
          revenue: prev.revenue + (newCalls * 0.05) // $0.05 per call
        }
      });

      setRecentLogs(prev => {
        const endpoints = ['/v1/analyze', '/v2/score', '/v1/kyc', '/v2/onboarding'];
        const tenants = ['HDFC', 'ICICI', 'SBI', 'Axis', 'Kotak'];
        const endpoint = endpoints[Math.floor(Math.random() * endpoints.length)];
        const tenant = tenants[Math.floor(Math.random() * tenants.length)];
        const latency = 110 + Math.floor(Math.random() * 40);
        const isCache = Math.random() > 0.3;

        const newLog = `[200 OK] POST ${endpoint} - Tenant: ${tenant} - Latency: ${latency}ms ${isCache ? '(CACHE HIT)' : ''}`;
        return [newLog, ...prev].slice(0, 6);
      });
    }, 2500);

    return () => clearInterval(interval);
  }, []);

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

  const [activeMenu, setActiveMenu] = useState<string | null>(null)
  const [broadcastMsg, setBroadcastMsg] = useState('')
  const [broadcastSeverity, setBroadcastSeverity] = useState('info')

  const handleBroadcast = async () => {
    if (!broadcastMsg.trim()) return;

    const { error } = await supabase.from('platform_broadcasts').insert([{
      message: broadcastMsg.trim(),
      severity: broadcastSeverity.toUpperCase()
    }]);

    if (error) {
      alert(`Error sending broadcast: ${error.message}`);
      return;
    }

    alert(`Broadcast sent to all tenants! [Severity: ${broadcastSeverity.toUpperCase()}]`);
    setBroadcastMsg('');
  }

  const handleTenantAction = async (tenantId: string, actionType: 'SUSPEND' | 'RESTORE' | 'REVOKE' | 'DELETE') => {
    setActiveMenu(null);
    if (actionType === 'DELETE') {
      const confirmDelete = window.confirm("Are you sure you want to permanently delete this tenant?");
      if (!confirmDelete) return;
      const { error } = await supabase.from('api_tenants').delete().eq('id', tenantId);
      if (!error) fetchTenants();
    } else if (actionType === 'SUSPEND') {
      const { error } = await supabase.from('api_tenants').update({ status: 'SUSPENDED' }).eq('id', tenantId);
      if (!error) fetchTenants();
    } else if (actionType === 'RESTORE') {
      const { error } = await supabase.from('api_tenants').update({ status: 'APPROVED' }).eq('id', tenantId);
      if (!error) fetchTenants();
    } else if (actionType === 'REVOKE') {
      alert(`API Keys revoked for tenant ${tenantId}. They must generate new keys.`);
    }
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
          <span className="text-xl font-bold font-serif tracking-tight text-white">AVAGAMYA</span>
        </div>

        <nav className="space-y-2">
          <button
            onClick={() => setActiveTab('onboarding')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'onboarding' ? 'bg-red-500/10 text-red-500' : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            <Users className="w-5 h-5" /> Onboarding Requests
          </button>
          <button
            onClick={() => setActiveTab('billing')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'billing' ? 'bg-red-500/10 text-red-500' : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            <CreditCard className="w-5 h-5" /> Billing & Usage
          </button>
          <button
            onClick={() => setActiveTab('telemetry')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-sm transition-all ${activeTab === 'telemetry' ? 'bg-emerald-500/10 text-emerald-500' : 'text-slate-500 hover:text-slate-300'
              }`}
          >
            <Activity className="w-5 h-5" /> Telemetry & FinOps
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
                        ) : tenant.status === 'SUSPENDED' ? (
                          <div className="flex items-center gap-2 text-orange-500 text-xs font-bold uppercase tracking-widest">
                            <PauseCircle className="w-4 h-4" /> Suspended
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
                          <div className="relative inline-block text-left">
                            <button
                              onClick={() => setActiveMenu(activeMenu === tenant.id ? null : tenant.id)}
                              className="p-2 text-slate-600 hover:text-slate-400 focus:outline-none"
                            >
                              <MoreVertical className="w-5 h-5" />
                            </button>
                            {activeMenu === tenant.id && (
                              <div className="absolute right-0 mt-2 w-48 rounded-md shadow-xl bg-slate-800 border border-slate-700 z-[100]">
                                <div className="py-1">
                                  {tenant.status === 'SUSPENDED' ? (
                                    <button
                                      onClick={() => handleTenantAction(tenant.id, 'RESTORE')}
                                      className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-emerald-400 hover:bg-slate-700"
                                    >
                                      <PlayCircle className="w-4 h-4" /> Restore Access
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => handleTenantAction(tenant.id, 'SUSPEND')}
                                      className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-amber-500 hover:bg-slate-700"
                                    >
                                      <PauseCircle className="w-4 h-4" /> Suspend Access
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleTenantAction(tenant.id, 'REVOKE')}
                                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-orange-500 hover:bg-slate-700"
                                  >
                                    <Key className="w-4 h-4" /> Revoke API Keys
                                  </button>
                                  <button
                                    onClick={() => handleTenantAction(tenant.id, 'DELETE')}
                                    className="flex items-center gap-2 w-full text-left px-4 py-2 text-sm text-red-500 hover:bg-slate-700"
                                  >
                                    <Trash2 className="w-4 h-4" /> Delete Tenant
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
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
        ) : activeTab === 'billing' ? (
          <div className="space-y-6">
            {/* Global Broadcast Panel */}
            <div className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-8">
              <div className="flex items-center gap-3 mb-6">
                <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-500">
                  <Megaphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-white font-serif">Global Broadcast</h3>
                  <p className="text-slate-500 text-sm mt-1">Send a system-wide announcement to all active tenants</p>
                </div>
              </div>
              <textarea
                value={broadcastMsg}
                onChange={(e) => setBroadcastMsg(e.target.value)}
                placeholder="Enter announcement message..."
                className="w-full bg-slate-950 border border-slate-800 rounded-xl p-4 text-slate-300 placeholder:text-slate-600 focus:outline-none focus:border-indigo-500 transition-colors mb-4 resize-none h-24"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-slate-400 font-bold uppercase tracking-widest">Severity:</span>
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="radio" name="severity" checked={broadcastSeverity === 'info'} onChange={() => setBroadcastSeverity('info')} className="accent-indigo-500" />
                    Info
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="radio" name="severity" checked={broadcastSeverity === 'warning'} onChange={() => setBroadcastSeverity('warning')} className="accent-amber-500" />
                    Warning
                  </label>
                  <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                    <input type="radio" name="severity" checked={broadcastSeverity === 'critical'} onChange={() => setBroadcastSeverity('critical')} className="accent-red-500" />
                    Critical
                  </label>
                </div>
                <button
                  onClick={handleBroadcast}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-900/20 transition-all flex items-center gap-2"
                >
                  <Megaphone className="w-4 h-4" /> Broadcast to All
                </button>
              </div>
            </div>

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
                          {((getSeed(tenant.id) % 5000) + 100).toLocaleString()} calls
                        </td>
                        <td className="p-6 text-slate-300 font-mono text-sm">
                          ${((getSeed(tenant.id) % 1000) + 500).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
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
          </div>
        ) : activeTab === 'telemetry' ? (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h3 className="text-xl font-bold text-white font-serif">Enterprise Telemetry & FinOps</h3>
                <p className="text-slate-500 text-sm mt-1">Real-time system observability and revenue metrics</p>
              </div>
              <div className="px-4 py-2 bg-emerald-500/10 text-emerald-500 rounded-lg text-xs font-bold uppercase tracking-widest flex items-center gap-2 border border-emerald-500/20">
                <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Live System
              </div>
            </div>

            {/* Top Row: 4 Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
                <div className="flex justify-between items-start mb-4">
                  <div className="text-slate-400 font-medium text-sm">Total API Calls</div>
                  <Activity className="w-5 h-5 text-blue-500" />
                </div>
                <div className="text-3xl font-bold text-white mb-2">{liveMetrics.totalApiCalls.toLocaleString()}</div>
                <div className="flex items-center text-xs text-emerald-500 font-medium">
                  <ArrowUpRight className="w-3 h-3 mr-1" /> +12% this week
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
                <div className="flex justify-between items-start mb-4">
                  <div className="text-slate-400 font-medium text-sm">Cache Hit Ratio</div>
                  <Activity className="w-5 h-5 text-indigo-500" />
                </div>
                <div className="text-3xl font-bold text-white mb-2">
                  {((liveMetrics.cacheHits / liveMetrics.totalApiCalls) * 100).toFixed(1)}%
                </div>
                <div className="flex items-center text-xs text-emerald-500 font-medium">
                  <ArrowUpRight className="w-3 h-3 mr-1" /> Optimal Range
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
                <div className="flex justify-between items-start mb-4">
                  <div className="text-slate-400 font-medium text-sm">Avg Latency</div>
                  <Activity className="w-5 h-5 text-amber-500" />
                </div>
                <div className="text-3xl font-bold text-white mb-2">{liveMetrics.avgLatency}ms</div>
                <div className="flex items-center text-xs text-emerald-500 font-medium">
                  <ArrowDownRight className="w-3 h-3 mr-1" /> -5ms from yesterday
                </div>
              </div>

              <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl">
                <div className="flex justify-between items-start mb-4">
                  <div className="text-slate-400 font-medium text-sm">Live Revenue</div>
                  <TrendingUp className="w-5 h-5 text-emerald-500" />
                </div>
                <div className="text-3xl font-bold text-emerald-400 mb-2">
                  ${liveMetrics.revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
                <div className="flex items-center text-xs text-emerald-500 font-medium">
                  <ArrowUpRight className="w-3 h-3 mr-1" /> Streaming
                </div>
              </div>
            </div>

            {/* Middle Row: The Chart */}
            <div className="bg-slate-900 border border-slate-800 p-6 rounded-3xl shadow-xl">
              <h4 className="text-white font-bold mb-6">Traffic & Caching Trends (Last 7 Days)</h4>
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="colorCache" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="time" stroke="#475569" tick={{ fill: '#94a3b8' }} />
                    <YAxis stroke="#475569" tick={{ fill: '#94a3b8' }} />
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#0f172a', borderColor: '#1e293b', color: '#f8fafc' }}
                      itemStyle={{ color: '#e2e8f0' }}
                    />
                    <Area type="monotone" dataKey="requests" name="Total Requests" stroke="#3b82f6" fillOpacity={1} fill="url(#colorRequests)" />
                    <Area type="monotone" dataKey="cacheHits" name="Cache Hits" stroke="#10b981" fillOpacity={1} fill="url(#colorCache)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bottom Row: Live Traffic Feed */}
            <div className="bg-slate-950 border border-slate-800 p-6 rounded-3xl shadow-xl font-mono relative overflow-hidden">
              <div className="flex items-center gap-2 mb-4 text-slate-400 text-sm">
                <Terminal className="w-4 h-4" /> Gateway Firehose
              </div>
              <div className="space-y-2 text-sm">
                {recentLogs.length === 0 ? (
                  <div className="text-slate-600 italic">Waiting for incoming requests...</div>
                ) : (
                  recentLogs.map((log, i) => (
                    <div key={i} className={`flex items-start ${i === 0 ? 'text-emerald-400' : 'text-slate-500'} transition-colors duration-500`}>
                      <span className="mr-2 opacity-50">&gt;</span>
                      {log}
                    </div>
                  ))
                )}
              </div>
              {/* Gradient overlay for fading effect at bottom */}
              <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-slate-950 to-transparent pointer-events-none" />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Building2, 
  Key, 
  Clock, 
  Copy, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCcw,
  LogOut,
  Terminal,
  Activity,
  Trash2,
  Users,
  BookOpen,
  ShieldCheck
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import SwaggerUI from 'swagger-ui-react'
import 'swagger-ui-react/swagger-ui.css'

export function EnterpriseDashboard() {
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [tenant, setTenant] = useState<any>(null)
  const [keys, setKeys] = useState<any[]>([])
  const [newKey, setNewKey] = useState<string | null>(null)
  const [copying, setCopying] = useState(false)
  const [liveBroadcast, setLiveBroadcast] = useState('System Operational. Welcome to AVAGAMYA.')

  // Command Center States
  const [activeTab, setActiveTab] = useState<'credentials' | 'team' | 'docs'>('credentials')
  const [teamMembers, setTeamMembers] = useState<any[]>([])
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteRole, setInviteRole] = useState('COMPLIANCE')
  const [inviteLoading, setInviteLoading] = useState(false)

  useEffect(() => {
    fetchTenantData()

    // Fetch initial broadcast
    const fetchBroadcast = async () => {
      const { data } = await supabase
        .from('platform_broadcasts')
        .select('message')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (data) {
        setLiveBroadcast(data.message);
      }
    };
    fetchBroadcast();

    // Subscribe to real-time updates
    const channel = supabase.channel('custom-all-channel')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'platform_broadcasts' }, (payload) => {
        setLiveBroadcast(payload.new.message);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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

    const { data: tenantData, error: tenantError } = await supabase
      .from('api_tenants')
      .select('*')
      .eq('official_email', userEmail)
      .single()

    if (tenantError && tenantError.code === 'PGRST116' && userEmail === 'dev@bank.com') {
      // Seed the dev tenant if it doesn't exist so foreign keys work
      const devTenant = {
        bank_name: 'HDFC Global Banking (Demo)',
        admin_name: 'Jayesh (Demo Admin)',
        official_email: 'dev@bank.com',
        phone_number: '+91 9999999999',
        status: 'APPROVED'
      };
      const { data: newTenant, error: insertError } = await supabase.from('api_tenants').insert(devTenant).select().single();
      if (!insertError && newTenant) {
        setTenant(newTenant)
        fetchKeys(newTenant.id)
        fetchTeamMembers(newTenant.id)
        setLoading(false)
        return
      }
    }

    if (tenantError && tenantError.code !== 'PGRST116') {
      console.error(tenantError)
    } else if (tenantData) {
      setTenant(tenantData)
      if (tenantData.status === 'APPROVED') {
        fetchKeys(tenantData.id)
        fetchTeamMembers(tenantData.id)
      }
    }
    setLoading(false)
  }

  const fetchTeamMembers = async (tenantId: string) => {
    const { data, error } = await supabase
      .from('tenant_users')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
    
    if (!error) setTeamMembers(data || [])
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

    // Fallback for random UUID if not in secure context (localhost/HTTPS)
    const generateId = () => {
      if (window.crypto && crypto.randomUUID) {
        return crypto.randomUUID().replace(/-/g, '');
      }
      return 'xxxxxxxxxxxx4xxxyxxxxxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
      });
    }

    // Create a raw key (avm_...)
    const rawKey = `avm_${generateId()}`
    
    // Hash it for storage
    let hashedKey = '';
    if (window.crypto && crypto.subtle) {
      const encoder = new TextEncoder()
      const data = encoder.encode(rawKey)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      hashedKey = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
    } else {
      // Fallback pseudo-hash for insecure network testing over local IP
      let hash = 0;
      for (let i = 0; i < rawKey.length; i++) {
        const char = rawKey.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      hashedKey = 'fallback_' + Math.abs(hash).toString(16) + Date.now().toString(16);
    }

    const { error } = await supabase.from('api_keys').insert({
      tenant_id: tenant.id,
      hashed_key: hashedKey,
      is_active: true
    })

    if (error) {
      console.error("Failed to generate key:", error);
      alert("Database error: Could not generate key. Check console.");
    } else {
      setNewKey(rawKey)
      fetchKeys(tenant.id)
    }
  }

  const handleRevokeKey = async (keyId: string) => {
    if (!tenant) return;
    const { error } = await supabase.from('api_keys').delete().eq('id', keyId);
    if (!error) {
      fetchKeys(tenant.id);
    }
  }

  const handleInviteUser = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!tenant || !inviteEmail.trim()) return
    setInviteLoading(true)
    
    // We use signInWithOtp to trigger a real Supabase invite email (Magic Link style)
    // while inserting them into our RBAC table. 
    // In a full prod setup, you'd use supabase.auth.admin.inviteUserByEmail via an Edge Function.
    
    const { error: insertError } = await supabase.from('tenant_users').insert([{ 
      tenant_id: tenant.id, 
      email: inviteEmail, 
      role: inviteRole, 
      status: 'ACTIVE' 
    }])

    if (!insertError) {
      await supabase.auth.signInWithOtp({ email: inviteEmail })
      setInviteEmail('')
      fetchTeamMembers(tenant.id)
      alert('Invitation sent successfully!')
    } else {
      alert('Failed to send invite: ' + insertError.message)
    }
    setInviteLoading(false)
  }

  const handleRevokeUser = async (id: string) => {
    if (!tenant) return
    const { error } = await supabase.from('tenant_users').delete().eq('id', id)
    if (!error) {
      fetchTeamMembers(tenant.id)
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
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Sidebar */}
      <div className="w-64 bg-slate-950 flex flex-col flex-shrink-0 z-20">
        <div className="p-6 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-orange-500 to-orange-600 rounded-lg flex items-center justify-center shadow-lg">
              <Building2 className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white font-bold tracking-wider text-sm truncate">{tenant.bank_name}</div>
              <div className="text-slate-400 text-xs mt-0.5">IT Portal</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-2">
          <button
            onClick={() => setActiveTab('credentials')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'credentials' 
                ? 'bg-slate-800 text-white shadow-inner border border-slate-700' 
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Key className="w-5 h-5" />
            API Credentials
          </button>
          <button
            onClick={() => setActiveTab('team')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'team' 
                ? 'bg-slate-800 text-white shadow-inner border border-slate-700' 
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <Users className="w-5 h-5" />
            Team Provisioning
          </button>
          <button
            onClick={() => setActiveTab('docs')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'docs' 
                ? 'bg-slate-800 text-white shadow-inner border border-slate-700' 
                : 'text-slate-400 hover:text-white hover:bg-slate-900'
            }`}
          >
            <BookOpen className="w-5 h-5" />
            Developer Hub
          </button>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 px-2 py-3">
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 font-bold text-xs border border-slate-700">
              {tenant.admin_name.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold text-white truncate">{tenant.admin_name}</div>
              <div className="text-[10px] text-slate-400 truncate">{tenant.official_email}</div>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="mt-2 w-full flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-red-950/30 text-slate-400 hover:text-red-400 border border-transparent hover:border-red-900/50 rounded-lg text-xs font-bold transition-all"
          >
            <LogOut className="w-3 h-3" /> Terminate Session
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col h-full relative overflow-hidden pb-10">
        
        {/* Top Header / Stats Row */}
        <div className="p-8 border-b border-slate-200 bg-white flex-shrink-0 z-10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Security Footprint</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">{keys.length} <span className="text-sm font-normal text-slate-500">Active Keys</span></div>
            </div>
            
            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <Activity className="w-5 h-5 text-blue-600" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">API Quota</span>
              </div>
              <div className="text-xl font-bold text-slate-900 mb-2">14,500 / 50,000 <span className="text-sm font-normal text-slate-500">Calls</span></div>
              <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden">
                <div className="h-full bg-blue-600 w-[29%]" />
              </div>
            </div>

            <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200">
              <div className="flex items-center gap-3 mb-2">
                <Terminal className="w-5 h-5 text-purple-600" />
                <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Cache Efficiency</span>
              </div>
              <div className="text-2xl font-bold text-slate-900">42% <span className="text-sm font-normal text-slate-500">Hits</span></div>
              <div className="text-xs text-emerald-600 font-bold mt-1">₹8,400 Saved this month</div>
            </div>
          </div>
        </div>

        {/* Dynamic Tab Content */}
        <div className="flex-1 overflow-y-auto p-8">
          
          {/* CREDENTIALS TAB */}
          {activeTab === 'credentials' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl space-y-6"
            >
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-8">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-slate-100 rounded-lg">
                      <Key className="w-5 h-5 text-slate-700" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-900">Active API Keys</h3>
                  </div>
                  <button 
                    onClick={handleGenerateKey}
                    disabled={!tenant}
                    className="px-4 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition-all flex items-center gap-2 shadow-sm active:scale-95 disabled:opacity-50"
                  >
                    <RefreshCcw className="w-4 h-4" /> Generate Key
                  </button>
                </div>

                <AnimatePresence>
                  {newKey && (
                    <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="mb-8"
                    >
                      <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5 relative overflow-hidden">
                        <div className="absolute top-0 right-0 p-1.5 bg-amber-200 text-amber-700 text-[9px] font-bold uppercase tracking-widest rounded-bl-lg">
                          Reveal Once
                        </div>
                        <div className="flex items-center gap-2 text-amber-800 mb-3 font-bold text-sm">
                          <AlertCircle className="w-4 h-4" /> Copy your key now. For security reasons, it will not be shown again.
                        </div>
                        <div className="flex items-center gap-3 bg-white p-3 rounded-lg border border-amber-100 shadow-inner">
                          <code className="text-sm font-mono text-slate-900 break-all select-all flex-grow">
                            {newKey}
                          </code>
                          <button 
                            onClick={() => copyToClipboard(newKey)}
                            className="p-2 bg-amber-500 text-white rounded-md hover:bg-amber-600 transition-colors shrink-0"
                          >
                            {copying ? <CheckCircle2 className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">Key Fingerprint</th>
                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">Created</th>
                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200 text-right">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {!keys || keys.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-slate-400 italic text-sm">
                            No API keys generated yet.
                          </td>
                        </tr>
                      ) : (
                        keys?.map((key) => (
                          <tr key={key.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-4 font-mono text-xs text-slate-600">
                              {key.hashed_key.substring(0, 16)}...
                            </td>
                            <td className="px-4 py-4 text-sm text-slate-600">
                              {new Date(key.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-4 text-right">
                              <div className="flex items-center justify-end gap-3">
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full border border-emerald-100">
                                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse" /> ACTIVE
                                </span>
                                <button 
                                  onClick={() => handleRevokeKey(key.id)}
                                  className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Revoke Key"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* TEAM PROVISIONING TAB */}
          {activeTab === 'team' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl space-y-6"
            >
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <Users className="w-5 h-5 text-blue-600" /> Provision Employee
                </h3>
                <form onSubmit={handleInviteUser} className="flex flex-col md:flex-row gap-4 items-end">
                  <div className="flex-1 w-full">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Employee Email</label>
                    <input 
                      type="email" 
                      required
                      value={inviteEmail}
                      onChange={e => setInviteEmail(e.target.value)}
                      placeholder="colleague@bank.com"
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    />
                  </div>
                  <div className="w-full md:w-48">
                    <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Role Assignment</label>
                    <select 
                      value={inviteRole}
                      onChange={e => setInviteRole(e.target.value)}
                      className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                    >
                      <option value="DPO">Data Protection Officer</option>
                      <option value="COMPLIANCE">Compliance Officer</option>
                      <option value="AUDITOR">Internal Auditor</option>
                    </select>
                  </div>
                  <button 
                    type="submit"
                    disabled={inviteLoading}
                    className="w-full md:w-auto px-6 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-bold hover:bg-blue-700 transition-all shadow-sm active:scale-95 disabled:opacity-70"
                  >
                    {inviteLoading ? 'Sending...' : 'Send Invite'}
                  </button>
                </form>
              </div>

              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <h3 className="text-lg font-bold text-slate-900 mb-6 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-600" /> Active Team Members
                </h3>
                <div className="overflow-x-auto rounded-xl border border-slate-100">
                  <table className="w-full text-left">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">Email</th>
                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200">Role</th>
                        <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase tracking-widest border-b border-slate-200 text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {teamMembers.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="py-8 text-center text-slate-400 italic text-sm">
                            No team members provisioned yet.
                          </td>
                        </tr>
                      ) : (
                        teamMembers.map((member) => (
                          <tr key={member.id} className="hover:bg-slate-50/50 transition-colors">
                            <td className="px-4 py-4 text-sm text-slate-900 font-medium">
                              {member.email}
                            </td>
                            <td className="px-4 py-4">
                              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border bg-slate-50 text-slate-600 border-slate-200">
                                {member.role}
                              </span>
                            </td>
                            <td className="px-4 py-4 text-right">
                              <button 
                                onClick={() => handleRevokeUser(member.id)}
                                className="px-3 py-1.5 text-xs font-bold text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-100"
                              >
                                Revoke
                              </button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          )}

          {/* DEVELOPER HUB TAB */}
          {activeTab === 'docs' && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="h-full bg-white rounded-2xl shadow-sm border border-slate-200 p-4 overflow-y-auto"
            >
              <SwaggerUI url="https://avagamya.onrender.com/openapi.json" />
            </motion.div>
          )}

        </div>

      </div>

      {/* Real-time Broadcast Footer (Global) */}
      <div className="fixed bottom-0 left-64 right-0 bg-slate-900 border-t border-slate-800 text-slate-300 py-2.5 z-50 flex items-center">
        <div className="flex-shrink-0 px-6 font-bold text-emerald-500 uppercase tracking-widest text-xs border-r border-slate-700 bg-slate-900 z-10 flex items-center gap-2">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" /> Live System Broadcast
        </div>
        <div className="flex-1 overflow-hidden relative px-4">
          <div className="font-mono text-sm text-amber-400 truncate">
            {liveBroadcast}
          </div>
        </div>
      </div>
    </div>
  )
}


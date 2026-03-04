import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LogOut, AlertCircle } from 'lucide-react'

export function StaffNavbar() {
  const navigate = useNavigate()
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)

  const handleLogout = () => {
    localStorage.removeItem('avagamya_session') // Clear the secure session
    setShowLogoutConfirm(false)
    navigate('/') // Final redirection home
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-xl border-b border-slate-100">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

          {/* LOGO: Gatekeeper to Home */}
          <Link
            to="#"
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-2 shrink-0"
          >
            <img src="/AVAGAMYA logo.png" alt="AVAGAMYA" className="h-10 w-auto object-contain" />
            <span className="font-serif font-semibold text-deep-blue text-lg tracking-tight">AVAGAMYA</span>
          </Link>

          {/* LOGOUT BUTTON: Only visible for logged-in staff */}
          <button
            onClick={() => setShowLogoutConfirm(true)}
            className="flex items-center gap-2 px-6 py-2 min-h-[44px] rounded-full bg-red-50 text-red-600 text-sm font-bold border border-red-100 hover:bg-red-100 transition-all shadow-sm"
          >
            <LogOut className="w-4 h-4" />
            <span>Logout</span>
          </button>
        </nav>
      </header>

      {/* --- SECURE LOGOUT MODAL --- */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-deep-blue/20 backdrop-blur-md">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 border border-slate-100 text-center animate-in fade-in zoom-in duration-200">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-deep-blue mb-2">Secure Session Active</h3>
            <p className="text-slate-500 text-sm mb-8 leading-relaxed">
              You are currently inside a restricted banking module. You must terminate this session before leaving the command center.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={handleLogout}
                className="w-full py-4 min-h-[44px] bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200 hover:bg-red-700 transition-all"
              >
                Logout & Exit
              </button>
              <button
                onClick={() => setShowLogoutConfirm(false)}
                className="w-full py-4 min-h-[44px] bg-slate-100 text-slate-600 rounded-xl font-bold hover:bg-slate-200 transition-all"
              >
                Stay Logged In
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
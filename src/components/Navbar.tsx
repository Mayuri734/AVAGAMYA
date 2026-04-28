import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { Lock, Menu, X, AlertCircle, LogOut} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'


const navLinks = [
  { to: '/', label: 'Home' },
  { to: '/about', label: 'About' },
  { to: '/how-it-works', label: 'How it Works' },
  { to: '/faqs', label: 'FAQs' },
   { to: '/CreditCardSimulator', label: 'Simulator' },
]

export function Navbar() {
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileOpen, setMobileOpen] = useState(false)

  // Guard states for secure modules
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false)
  const [pendingPath, setPendingPath] = useState<string | null>(null)

  // LOGIC: Check if user is actually INSIDE a dashboard/module
  // This EXCLUDES login pages so they don't see a logout button prematurely
  const isUserLoggedIn = location.pathname.includes('dashboard') ||
    (location.pathname.includes('compliance') && !location.pathname.includes('login'));

  const handleNavClick = (e: React.MouseEvent, to: string) => {
    // If logged in, don't let them wander off without logging out
    if (isUserLoggedIn && to !== location.pathname) {
      e.preventDefault()
      setPendingPath(to)
      setShowLogoutConfirm(true)
    }
  }

  const confirmLogoutAndNavigate = () => {
    localStorage.removeItem('avagamya_session') // Clear the flag
    setShowLogoutConfirm(false)
    navigate(pendingPath || '/')
  }

  return (
    <>
      <header className="fixed top-0 left-0 right-0 z-50 bg-white/85 backdrop-blur-md border-b border-slate-100">
        <nav className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">

          {/* LOGO: Leads home but triggers guard if logged in */}
          <Link
            to="/"
            onClick={(e) => handleNavClick(e, '/')}
            className="flex items-center gap-2 shrink-0"
          >
            <img src="/AVAGAMYA logo.png" alt="AVAGAMYA" className="h-10 w-auto object-contain" />
            <span className="font-serif font-semibold text-deep-blue text-lg tracking-tight">AVAGAMYA</span>
          </Link>

          {/* Desktop Navigation: Only show if NOT logged into a dashboard */}
          <div className="hidden md:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
            {!isUserLoggedIn && navLinks.map(({ to, label }) => {
              const isActive = location.pathname === to
              return (
                <Link
                  key={to}
                  to={to}
                  className={`text-sm font-medium transition-colors ${isActive ? 'text-vibrant-orange' : 'text-slate-grey hover:text-deep-blue'}`}
                >
                  {label}
                </Link>
              )
            })}
            
          
          </div>

          {/* Right Action Button */}
          <div className="hidden md:block">
            {isUserLoggedIn ? (
              /* LOGOUT: Only for dashboard pages */
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className="flex items-center gap-2 px-6 py-2 rounded-full bg-red-50 text-red-600 text-sm font-bold border border-red-100 hover:bg-red-100 transition-all shadow-sm"
              >
                <LogOut className="w-4 h-4" /> Logout
              </button>
            ) : (
              /* STAFF ACCESS: For login and public pages */
              <Link
                to="/enterprise/auth"
                className="flex items-center gap-2 px-4 py-2 rounded-full bg-deep-blue text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-md"
              >
                <Lock className="w-4 h-4" /> Staff Access
              </Link>
            )}
          </div>

          <button
            className="md:hidden flex items-center justify-center min-w-[44px] min-h-[44px] rounded-lg text-slate-600 hover:bg-slate-100 transition-colors bg-transparent border-none outline-none focus:ring-2 focus:ring-vibrant-orange/30"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-expanded={mobileOpen}
            aria-label="Toggle Navigation"
          >
            {mobileOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </nav>

        {/* Mobile Dropdown Menu */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className="absolute top-16 left-0 right-0 bg-white/95 backdrop-blur-md border-b border-slate-100 shadow-xl md:hidden overflow-hidden"
            >
              <div className="flex flex-col px-4 py-4 space-y-2">
                {!isUserLoggedIn && navLinks.map(({ to, label }) => {
                  const isActive = location.pathname === to
                  return (
                    <Link
                      key={to}
                      to={to}
                      onClick={(e) => {
                        handleNavClick(e, to)
                        if (!isUserLoggedIn) setMobileOpen(false)
                      }}
                      className={`block flex items-center min-h-[44px] px-4 py-3 rounded-xl text-base font-medium transition-colors ${isActive ? 'bg-vibrant-orange/10 text-vibrant-orange' : 'text-slate-grey hover:bg-slate-50'}`}
                    >
                      {label}
                    </Link>
                  )
                })}

               
                {/* Right Action Button for Mobile */}
                <div className="pt-4 mt-2 border-t border-slate-100">
                  {isUserLoggedIn ? (
                    <button
                      onClick={() => {
                        setMobileOpen(false)
                        setShowLogoutConfirm(true)
                      }}
                      className="flex w-full items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-xl bg-red-50 text-red-600 text-base font-bold box-border transition-all"
                    >
                      <LogOut className="w-5 h-5" /> Logout
                    </button>
                  ) : (
                    <Link
                      to="/staff/modules"
                      onClick={() => setMobileOpen(false)}
                      className="flex w-full items-center justify-center gap-2 px-6 py-3 min-h-[44px] rounded-xl bg-deep-blue text-white text-base font-medium transition-all"
                    >
                      <Lock className="w-5 h-5" /> Staff Access
                    </Link>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      {/* SECURE LOGOUT MODAL */}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-deep-blue/20 backdrop-blur-md">
          <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-8 border border-slate-100 text-center">
            <div className="w-16 h-16 bg-amber-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-bold text-deep-blue mb-2">Secure Session Active</h3>
            <p className="text-slate-500 text-sm mb-8">
              You must terminate this session before returning to the public site.
            </p>
            <div className="flex flex-col gap-3">
              <button onClick={confirmLogoutAndNavigate} className="w-full py-4 bg-red-600 text-white rounded-xl font-bold shadow-lg shadow-red-200">Logout & Exit</button>
              <button onClick={() => setShowLogoutConfirm(false)} className="w-full py-4 bg-slate-100 text-slate-600 rounded-xl font-bold">Stay Logged In</button>
            </div>
          </div>
        </div>
      )}
      
    </>
  )
}
import { Outlet, useLocation } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { AdminFooter } from './AdminFooter'
import { SHRAWYA } from './SHRAWYA'

export function Layout() {
  const location = useLocation()

  // Visibility Logic:
  const isEnterpriseAuth = location.pathname === '/enterprise/auth'
  const isStaffModules = location.pathname === '/staff/modules'

  const showShrawya =
    ['/', '/about', '/how-it-works', '/faqs'].includes(location.pathname) &&
    !location.pathname.startsWith('/analyze')

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-16">
        <Outlet />
      </main>
      
      {isEnterpriseAuth ? (
        <AdminFooter
  label="Admin Login"
  to="/superadmin/login"
  className="flex items-center px-2 py-2 rounded-full bg-deep-blue text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-md"
/>
      ) : isStaffModules ? (
        <AdminFooter 
        label="Bank IT Admin" 
        to="/enterprise/admin-login" 
        className="flex items-center px-2 py-2 rounded-full bg-deep-blue text-white text-sm font-medium hover:opacity-90 transition-opacity shadow-md"
/>
      ) : (
        <Footer />
      )}

      {showShrawya && <SHRAWYA />}
    </div>
  )
}

import { Outlet, useLocation } from 'react-router-dom'
import { Navbar } from './Navbar'
import { Footer } from './Footer'
import { SHRAWYA } from './SHRAWYA'

export function Layout() {
  const location = useLocation()

  // Visibility Logic:
  // - Show on: /, /about, /how-it-works, /faqs
  // - Hide on: /analyze/*
  const showShrawya =
    ['/', '/about', '/how-it-works', '/faqs'].includes(location.pathname) &&
    !location.pathname.startsWith('/analyze')

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 pt-16">
        <Outlet />
      </main>
      <Footer />
      {showShrawya && <SHRAWYA />}
    </div>
  )
}

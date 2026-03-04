import { ShieldCheck } from 'lucide-react'

export function Footer() {
  return (
    <footer className="bg-white border-t border-slate-100">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-center">
          {/* REMOVED: gap-3, px-6, py-3, rounded-full, bg-emerald-50/50, border, border-emerald-100, shadow-sm
             KEPT: flex, items-center (to align icon and text), text-emerald-700, text-sm, font-bold
          */}
          <div className="flex items-center gap-3 text-emerald-700 text-sm font-bold">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-200">
              <ShieldCheck className="w-4 h-4" aria-hidden />
            </span>
            Bank-Grade Security & Compliance Ready
          </div>
        </div>
      </div>
    </footer>
  )
}
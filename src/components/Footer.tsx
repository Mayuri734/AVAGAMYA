import { ShieldCheck } from 'lucide-react'

export function Footer() {
  return (
    <footer className="w-full bg-emerald-50 border-t border-emerald-200 overflow-hidden">
  <div className="py-2 overflow-hidden">

    <div className="whitespace-nowrap">
      <div className="inline-flex items-center gap-3 animate-marquee text-emerald-700 text-sm font-semibold">
        
        <ShieldCheck className="w-4 h-4" />

        Bank-Grade Security & Compliance Ready,delivering trusted protection for modern digital finance.
       
       ⭐ Secure. Compliant. Trusted.

      </div>
      
    </div>

  </div>
</footer>
  )
}
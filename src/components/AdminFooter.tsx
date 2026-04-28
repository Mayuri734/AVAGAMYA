import { motion } from 'framer-motion'
import { Settings } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

interface AdminFooterProps {
  label: string
  to: string
  className?: string
}

export function AdminFooter({ label, to, className }: AdminFooterProps) {
  const navigate = useNavigate()

  return (
    <footer className="bg-white border-t border-slate-100 py-6">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-12">
<div className="flex justify-start">
          <motion.button
            whileHover={{ scale: 1.05 }}
            onClick={() => navigate(to)}
            className={`flex items-center gap-2 px-4 py-2 rounded-full ${className || ''}`}
          >
            <div className="p-1.5 rounded-full bg-white/10">
              <Settings className="w-4 h-4 text-white" />
            </div>

            <span className="text-sm font-semibold text-white">
              {label}
            </span>

          </motion.button>

        </div>
      </div>
    </footer>
  )
}
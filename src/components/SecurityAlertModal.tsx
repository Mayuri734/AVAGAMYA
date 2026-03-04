import { motion, AnimatePresence } from 'framer-motion'
import { AlertTriangle } from 'lucide-react'

type Props = {
  open: boolean
  onClose: () => void
  message?: string
}

const DEFAULT_MESSAGE =
  "Security Alert: This document contains personal sensitive details (e.g., Credit Card numbers). For your safety, AVAGAMYA only accepts public policy documents (MITC). Please upload a clean version to proceed."

export function SecurityAlertModal({ open, onClose, message }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="max-w-lg w-full mx-4 rounded-3xl bg-white/90 backdrop-blur-xl border border-slate-100 shadow-2xl p-8"
            initial={{ scale: 0.9, opacity: 0, y: 12 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 12 }}
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-[#FEE2E2] text-[#EF4444] flex items-center justify-center">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <h2 className="font-serif text-xl font-bold text-[#EF4444]">
                Security Alert
              </h2>
            </div>
            <p className="text-slate-grey text-sm leading-relaxed">
              {message ?? DEFAULT_MESSAGE}
            </p>
            <div className="mt-6 flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="inline-flex items-center justify-center px-6 py-2.5 rounded-full bg-vibrant-orange text-white font-semibold hover:opacity-95"
              >
                Back
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
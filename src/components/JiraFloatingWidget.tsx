import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, X, CheckCircle2, Loader2, ClipboardList } from 'lucide-react'
import axios from 'axios'

export function JiraFloatingWidget() {
  const [isOpen, setIsOpen] = useState(false)
  const [status, setStatus] = useState<'form' | 'loading' | 'success'>('form')
  const [notes, setNotes] = useState('')
  const [ticketId, setTicketId] = useState('')

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000'

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!notes.trim()) return

    setStatus('loading')
    try {
      const response = await axios.post(`${API_BASE_URL}/analyze/compliance/escalate`, {
        notes: notes
      })
      if (response.data.status === 'SUCCESS') {
        setTicketId(response.data.ticket_id)
        setStatus('success')
      }
    } catch (error) {
      console.error('Failed to escalate to Jira:', error)
      setStatus('form')
      alert('Failed to create Jira ticket. Please check if backend is running.')
    }
  }

  const reset = () => {
    setIsOpen(false)
    setTimeout(() => {
      setStatus('form')
      setNotes('')
    }, 300) // Reset after closing animation
  }

  return (
    <div className="fixed bottom-8 left-8 z-[100] font-sans">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20, x: -20 }}
            animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20, x: -20 }}
            className="absolute bottom-20 left-0 w-80 bg-white rounded-3xl shadow-2xl border border-slate-100 overflow-hidden"
          >
            {/* Header */}
            <div className="bg-[#0052CC] p-4 flex items-center justify-between">
              <div className="flex items-center gap-2 text-white">
                <ClipboardList className="w-5 h-5" />
                <span className="font-bold text-sm tracking-tight">Escalate to Legal (Jira)</span>
              </div>
              <button onClick={reset} className="text-white/80 hover:text-white transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6">
              {status === 'form' && (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Remediation Notes</p>
                  <textarea
                    autoFocus
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Enter remediation notes for the legal team..."
                    className="w-full h-32 p-4 bg-slate-50 rounded-2xl border border-slate-100 outline-none focus:ring-4 focus:ring-[#0052CC]/5 text-sm text-slate-700 placeholder:text-slate-300 resize-none transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!notes.trim()}
                    className="w-full py-3.5 bg-[#0052CC] text-white rounded-xl font-bold shadow-lg shadow-blue-200 hover:opacity-90 disabled:opacity-50 transition-all text-sm"
                  >
                    Create Ticket
                  </button>
                </form>
              )}

              {status === 'loading' && (
                <div className="py-12 flex flex-col items-center gap-4">
                  <Loader2 className="w-10 h-10 text-[#0052CC] animate-spin" />
                  <p className="font-bold text-slate-900 animate-pulse">Syncing with Jira...</p>
                </div>
              )}

              {status === 'success' && (
                <div className="py-8 flex flex-col items-center text-center gap-4 animate-in fade-in zoom-in duration-300">
                  <div className="w-16 h-16 bg-emerald-50 rounded-full flex items-center justify-center">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">Success!</h3>
                    <p className="text-sm text-slate-500 mt-1 leading-relaxed">
                      Ticket <span className="font-mono font-black text-[#0052CC] bg-blue-50 px-1.5 py-0.5 rounded">{ticketId}</span> created and assigned to 'Drafting Team'.
                    </p>
                  </div>
                  <button 
                    onClick={reset}
                    className="mt-2 text-sm font-bold text-slate-400 hover:text-slate-600 transition-colors"
                  >
                    Dismiss
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FAB */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xl transition-all duration-300 ${
          isOpen ? 'bg-slate-200 text-slate-600' : 'bg-[#0052CC] text-white'
        }`}
      >
        {isOpen ? <X className="w-6 h-6" /> : <Plus className="w-6 h-6" />}
      </motion.button>
    </div>
  )
}

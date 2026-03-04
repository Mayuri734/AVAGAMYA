import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown, Shield, FileText, Users, HelpCircle } from 'lucide-react'

const faqs = [
  {
    id: 'data-safe',
    icon: Shield,
    question: 'Is my personal data safe?',
    answer: "Absolutely. AVAGAMYA uses a 'Fail-Fast' PII Gate. If you accidentally upload a bank statement or document containing account numbers, our system detects it locally and blocks the upload before analysis begins. We never store your personal documents.",
    defaultOpen: true,
  },
  {
    id: 'documents',
    icon: FileText,
    question: 'What types of documents can I upload?',
    answer: 'You can upload bank policy PDFs from major Indian banks. We support standard terms & conditions, fee schedules, and product brochures in PDF format.',
    defaultOpen: false,
  },
  {
    id: 'business',
    icon: Users,
    question: 'Can I use this for my business?',
    answer: 'Yes. AVAGAMYA can help businesses review vendor contracts, compliance documents, and policy papers. Contact our team for enterprise options.',
    defaultOpen: false,
  },
]

export function FAQs() {
  const [openId, setOpenId] = useState<string | null>(faqs.find((f) => f.defaultOpen)?.id ?? null)

  // Function to handle direct email opening
  const handleContactSupport = () => {
    // This triggers the native email app (Gmail/Outlook) with auto-filled details
    window.location.href = "mailto:teamavagamya@gmail.com?subject=AVAGAMYA Support Query&body=Hello AVAGAMYA Team,%0D%0A%0D%0AI have a question regarding...";
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      <section className="py-12 lg:py-16 bg-page">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center mb-12">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-200/80 text-slate-grey mb-6">
            <HelpCircle className="w-8 h-8" aria-hidden />
          </div>
          <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold text-deep-blue">
            Frequently Asked Questions
          </h1>
          <p className="text-slate-grey text-lg mt-3">
            Everything you need to know about AVAGAMYA and how we protect your interests.
          </p>
        </div>

        {/* FAQ Accordion Section */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">
          {faqs.map(({ id, icon: Icon, question, answer }) => {
            const isOpen = openId === id
            return (
              <motion.div key={id} layout className="rounded-2xl bg-white border border-slate-100 shadow-xl overflow-hidden">
                <button
                  type="button"
                  onClick={() => setOpenId(isOpen ? null : id)}
                  className="w-full flex items-center gap-4 p-6 text-left"
                >
                  <div className="shrink-0 w-10 h-10 rounded-full bg-deep-blue/10 text-deep-blue flex items-center justify-center">
                    <Icon className="w-5 h-5" aria-hidden />
                  </div>
                  <span className="flex-1 font-sans font-medium text-deep-blue">{question}</span>
                  <ChevronDown className={`w-5 h-5 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="px-6 pb-6 pl-[4.5rem] sm:pl-20 text-slate-grey leading-relaxed">
                        {answer}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            )
          })}
        </div>

        {/* CTA: Refactored Direct Email Redirection */}
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 mt-16">
          <motion.div
            className="rounded-2xl bg-deep-blue p-8 sm:p-10 text-center shadow-xl border border-white/10"
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-serif text-xl sm:text-2xl lg:text-3xl font-bold text-white">
              Still have questions?
            </h2>
            <p className="text-white/90 mt-2 max-w-md mx-auto">
              Skip the forms. Click below to email our team directly from your favorite mail app.
            </p>

            {/* Direct Email Action */}
            <button
              onClick={handleContactSupport}
              className="group relative inline-flex items-center justify-center mt-6 px-10 py-4 rounded-full bg-white text-deep-blue font-bold hover:bg-slate-50 transition-all shadow-lg hover:shadow-emerald-500/20 active:scale-95"
            >
              Contact Support
              <span className="ml-2 transition-transform group-hover:translate-x-1">→</span>
            </button>

            <p className="text-white/40 text-xs mt-4">
              Will open your default email client (Gmail, Outlook, etc.)
            </p>
          </motion.div>
        </div>
      </section>
    </motion.div>
  )
}
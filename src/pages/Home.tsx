import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowRight, FileText, Languages, Calculator } from 'lucide-react'

const features = [
  {
    icon: FileText,
    title: 'Risk Heatmap',
    description: 'AI highlights dangerous clauses in red, flagging hidden fees and penalties instantly.',
  },
  {
    icon: Languages,
    title: 'Native Translation',
    description: 'Complex legal jargon explained in Hindi, Marathi, and more regional languages.',
  },
  {
    icon: Calculator,
    title: 'Impact Simulator',
    description: 'See exactly how late payments affect you with real-time penalty calculations.',
  },
]

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.08 },
  },
}

const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0 },
}

export function Home() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="min-h-screen"
    >
      {/* Hero */}
      <section className="relative overflow-hidden bg-page">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-16 pb-20 lg:pt-20 lg:pb-28">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div>
              <p className="font-sans text-vibrant-orange text-sm font-semibold tracking-wide uppercase mb-4">
                Decoding the fine print. Empowering the digital citizen.
              </p>
              <h1 className="font-serif text-3xl sm:text-5xl lg:text-6xl font-bold text-deep-blue leading-tight">
                Don't Sign What You{' '}
                <span className="text-vibrant-orange">Don't Understand</span>
              </h1>
              <p className="mt-6 text-slate-grey text-lg max-w-xl">
                AI-driven Verification for Accessible Governance, Analytics, and Management of Yield Accuracy.
              </p>
              <Link
                to="/analyze/language"
                className="inline-flex items-center gap-2 mt-8 px-8 py-4 rounded-full bg-vibrant-orange text-white font-semibold text-lg shadow-cta hover:opacity-95 transition-opacity"
              >
                Start Free Analysis
                <ArrowRight className="w-5 h-5" aria-hidden />
              </Link>
            </div>
            <motion.div
              className="relative flex justify-center lg:justify-end"
              /* Initial entrance state */
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              /* Combined transition to avoid the multiple-attribute error */
              transition={{
                duration: 0.8,
                ease: "easeOut",
                y: {
                  duration: 5,
                  repeat: Infinity,
                  ease: "easeInOut",
                  delay: 0.5
                }
              }}
            >
              <motion.img
                /* Use the filename from your public folder */
                src="/homea.jpg"
                alt="Verification illustration"
                /* Floating motion logic */
                animate={{ y: [0, -15, 0] }}
                /* Visual styling to match your AVAGAMYA theme */
                className="w-full max-w-md h-auto rounded-3xl shadow-2xl border-8 border-white object-cover"
              />

              {/* Decorative glow behind the image to match the home page */}
              <div className="absolute -inset-4 bg-vibrant-orange/10 rounded-full blur-3xl -z-10" />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8"
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-60px' }}
          >
            {features.map(({ icon: Icon, title, description }) => (
              <motion.div
                key={title}
                variants={item}
                className="p-8 rounded-2xl bg-white border border-slate-100 shadow-xl hover:shadow-card-hover transition-shadow duration-300"
              >
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-orange-50 text-vibrant-orange mb-5">
                  <Icon className="w-6 h-6" aria-hidden />
                </div>
                <h3 className="font-serif font-semibold text-deep-blue text-xl mb-3">{title}</h3>
                <p className="text-slate-grey leading-relaxed">{description}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>
    </motion.div>
  )
}

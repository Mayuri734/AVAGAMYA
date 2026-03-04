import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'

export function ModuleSelector() {
  const navigate = useNavigate()

  const modules = [
    {
      id: 'dpo',
      title: 'Data Protection Officer',
      image: '/dpo.png',
      color: 'bg-blue border-blue-200 hover:bg-blue-100',
      onClick: () => navigate('/staff/dpo/login'),
    },
    {
      id: 'compliance',
      title: 'Compliance Officer',
      image: '/com.png',
      color: 'bg-emerald-50 border-emerald-200 hover:bg-emerald-100',
      onClick: () => navigate('/staff/compliance/login'),
    },
    {
      id: 'auditor',
      title: 'External Auditor',
      image: '/audit.png',
      color: 'bg-purple-50 border-purple-200 hover:bg-purple-100',
      onClick: () => navigate('/staff/auditor/login'),
    },
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 p-8 pt-24">
      <div className="max-w-6xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="text-center mb-12"
        >
          <h1 className="text-4xl font-bold text-slate-900 mb-3 font-serif">
            Select Enterprise Module
          </h1>
          <p className="text-lg text-slate-600">
            Choose a module to access specialized tools and dashboards
          </p>
        </motion.div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {modules.map((module, index) => {
            return (
              <motion.div
                key={module.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
                onClick={module.onClick}
                className={`${module.color} border-2 rounded-[2.5rem] p-8 cursor-pointer transition-all duration-300 shadow-md hover:shadow-2xl hover:-translate-y-2 group`}
              >
                <div className="flex flex-col items-center text-center">
  
  {/* CONTAINER: Fixed height and width */}
  <div className="w-32 h-40 mb-6 overflow-hidden rounded-2xl bg-white shadow-sm border border-slate-100 flex items-center justify-center p-2">
    <img
      src={module.image}
      alt={module.title}
      /* CHANGE: Use object-contain to stop side cutting */
      className="w-full h-full object-contain transition-transform duration-500 group-hover:scale-110"
    />
  </div>

  <h2 className="text-2xl font-bold text-deep-blue mb-3 leading-tight">
    {module.title}
  </h2>
                 
                </div>
              </motion.div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
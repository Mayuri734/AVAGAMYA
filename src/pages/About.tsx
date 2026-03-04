import { motion } from 'framer-motion'


const whyCards = [
  {
    image: "/about-problem.jpg", // Replace with your 'Problem' JPG
    title: 'The Problem',
    description: 'Hidden fees and 40-page documents confuse 85% of customers.',
  },
  {
    image: "/about-solution.jpg", // Using the Shield/Mobile illustration
    title: 'The Solution',
    description: 'Neuro-Symbolic AI that reads like a lawyer but speaks like a friend.',
  },
  {
    image: "/about-impact.jpg", // Using the Team/Tablet illustration
    title: 'The Impact',
    description: 'Financial literacy for every digital citizen, in their native language.',
  },
]
const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.1 },
  },
}

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0 },
}

export function About() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.4 }}
    >
      {/* Our Mission */}
      <section className="bg-page py-16 lg:py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">

            {/* COLUMN 1: Your Mission Text */}
            <div>
              <span className="inline-block px-4 py-1.5 rounded-full bg-orange-100/80 text-deep-blue font-serif text-sm font-semibold mb-6">
                Our Mission
              </span>
              <h1 className="font-serif text-3xl sm:text-4xl lg:text-5xl font-bold leading-tight">
                <span className="text-deep-blue">DECODING THE </span>
                <span className="text-vibrant-orange">FINE PRINT.</span>
              </h1>
              <p className="mt-6 text-slate-grey text-lg max-w-xl">
                Banking shouldn't require a law degree. We are bridging the gap between complex policy and human understanding.
              </p>
            </div>

            {/* COLUMN 2: Single Animated JPG Image */}
            <div className="flex justify-center lg:justify-end relative">
              {/* Optional: Soft Background Glow */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-vibrant-orange/10 blur-[80px] rounded-full -z-10" />

              <motion.img
                /* IMPORTANT: Replace '/your-single-image.jpg' with the actual path to your image in the /public folder */
                src="/about-hero-man.jpg"

                alt="Our Mission Illustration"

                /* Styling for a high-quality, card-like appearance */
                className="w-full max-w-[400px] rounded-[2.5rem] shadow-2xl border-[6px] border-white relative z-10"

                /* 1. Initial Appearance: Slide in from the right */
                initial={{ opacity: 0, x: 40 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}

                /* 2. Continuous Motion: Gentle floating effect */
                animate={{
                  y: [0, -12, 0], // Move up 12px, then back down
                }}

                /* 3. Transition Settings */
                transition={{
                  // Transition for the slide-in entrance
                  x: { duration: 0.8, ease: "easeOut" },
                  opacity: { duration: 0.8, ease: "easeOut" },

                  // Transition for the continuous floating animation
                  y: {
                    duration: 5,
                    repeat: Infinity,
                    ease: "easeInOut",
                    delay: 0.8 // Wait for the entrance to finish before floating
                  }
                }}
              />
            </div>
          </div>
        </div>
      </section>

      {/* The Why Section */}
      <section className="py-16 lg:py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="font-serif text-2xl sm:text-3xl lg:text-4xl font-bold text-deep-blue text-center">The Why</h2>
          <p className="text-sm md:text-base text-slate-grey text-center mt-3 max-w-xl mx-auto">
            Understanding the journey from problem to impact
          </p>
          <motion.div
            className="grid sm:grid-cols-2 lg:grid-cols-3 gap-8 mt-12"
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: '-40px' }}
          >
            {whyCards.map(({ image, title, description }) => (
              <motion.div
                key={title}
                variants={item}
                className="group p-2 rounded-3xl bg-white border border-slate-100 shadow-xl hover:shadow-card-hover transition-all duration-300"
              >
                {/* JPG Thumbnail Container */}
                <div className="relative h-48 w-full rounded-2xl overflow-hidden mb-6">
                  <img
                    src={image}
                    alt={title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                </div>
                <div className="px-6 pb-6">
                  <h3 className="font-serif font-semibold text-deep-blue text-xl mb-3">{title}</h3>
                  <p className="text-slate-grey leading-relaxed">{description}</p>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>
    </motion.div>
  )
}
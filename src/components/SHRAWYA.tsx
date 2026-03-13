import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface AwarenessFact {
  id: number;
  category: string;
  title: string;
  content: string;
  color_theme: string;
}

export const SHRAWYA: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [facts, setFacts] = useState<AwarenessFact[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [hasInteracted, setHasInteracted] = useState(false);

  useEffect(() => {
    fetchFacts();
  }, []);

  const fetchFacts = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('awareness_facts')
        .select('*');

      if (error) {
        console.error('Error fetching facts:', error);
      } else if (data) {
        setFacts(data);
      }
    } catch (err) {
      console.error('Unexpected error fetching facts:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = () => {
    setIsOpen(true);
    setHasInteracted(true);
  };

  const handleClose = () => {
    setIsOpen(false);
  };

  const nextFact = () => {
    setCurrentIndex((prev) => (prev + 1) % facts.length);
  };

  const prevFact = () => {
    setCurrentIndex((prev) => (prev - 1 + facts.length) % facts.length);
  };

  const currentFact = facts[currentIndex];

  return (
    <>
      {/* Floating Bot Icon */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-center">
        <AnimatePresence>
          {!isOpen && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.8 }}
              className="relative group cursor-pointer"
              onClick={handleOpen}
            >
              {/* Badge Label */}
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#122D50] text-[#f9551C] text-xs font-bold px-3 py-1 rounded-full border border-[#f9551C] shadow-lg whitespace-nowrap">
                SHRAWYA
              </div>

              {/* Bot Avatar with Pulse */}
              <div className="relative">
                {/* Infinite Pulse until interaction */}
                {!hasInteracted && (
                  <motion.div
                    animate={{
                      scale: [1, 1.2, 1],
                      opacity: [0, 0.5, 0],
                    }}
                    transition={{
                      duration: 2,
                      repeat: Infinity,
                      ease: "easeInOut",
                    }}
                    className="absolute inset-0 bg-[#f9551C] rounded-full filter blur-md"
                  />
                )}
                
                {/* Hover Pulse */}
                <motion.div
                  whileHover={{
                    scale: [1, 1.15, 1],
                    opacity: [0, 0.3, 0],
                    transition: { duration: 1.5, repeat: Infinity }
                  }}
                  className="absolute inset-0 bg-[#f9551C] rounded-full filter blur-md pointer-events-none"
                />

                <div className="relative w-16 h-16 rounded-full border-2 border-[#f9551C] overflow-hidden shadow-2xl transition-all duration-300 group-hover:scale-110 group-hover:shadow-[0_0_25px_rgba(249,85,28,0.5)]">
                  <img
                    src="/SHRAWYA bot.jpg"
                    alt="SHRAWYA Bot"
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Flashcard Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white/10 backdrop-blur-xl border border-white/20 rounded-3xl shadow-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(18, 45, 80, 0.9) 0%, rgba(18, 45, 80, 0.7) 100%)'
              }}
            >
              {/* Modal Header */}
              <div className="flex items-center justify-between p-6 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-[#f9551C] rounded-lg">
                    <Info className="w-5 h-5 text-[#122D50]" />
                  </div>
                  <h3 className="text-xl font-bold text-white">Did You Know?</h3>
                </div>
                <button
                  onClick={handleClose}
                  className="p-2 hover:bg-white/10 rounded-full transition-colors text-white/70 hover:text-white"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              {/* Flashcard Content */}
              <div className="relative h-80 flex items-center justify-center p-8">
                {loading ? (
                  <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 border-4 border-[#f9551C] border-t-transparent rounded-full animate-spin" />
                    <p className="text-white/60">Fetching awareness facts...</p>
                  </div>
                ) : facts.length > 0 ? (
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={currentIndex}
                      initial={{ rotateY: 90, opacity: 0 }}
                      animate={{ rotateY: 0, opacity: 1 }}
                      exit={{ rotateY: -90, opacity: 0 }}
                      transition={{ duration: 0.4, ease: "easeInOut" }}
                      className="w-full h-full bg-white/5 rounded-2xl p-8 flex flex-col justify-center border border-white/10"
                    >
                      <span className="text-[#f9551C] text-sm font-bold uppercase tracking-wider mb-2">
                        {currentFact.category}
                      </span>
                      <h4 className="text-2xl font-bold text-white mb-4 leading-tight">
                        {currentFact.title}
                      </h4>
                      <p className="text-white/80 text-lg leading-relaxed">
                        {currentFact.content}
                      </p>
                    </motion.div>
                  </AnimatePresence>
                ) : (
                  <div className="text-center text-white/60">
                    No facts available at the moment.
                  </div>
                )}
              </div>

              {/* Navigation Footer */}
              <div className="flex items-center justify-between p-6 border-t border-white/10">
                <div className="flex items-center gap-4">
                  <button
                    onClick={prevFact}
                    disabled={facts.length <= 1}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all disabled:opacity-30 text-white"
                  >
                    <ChevronLeft className="w-6 h-6" />
                  </button>
                  <button
                    onClick={nextFact}
                    disabled={facts.length <= 1}
                    className="p-3 bg-white/5 hover:bg-white/10 rounded-xl transition-all disabled:opacity-30 text-white"
                  >
                    <ChevronRight className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="text-white/40 text-sm font-medium">
                  {currentIndex + 1} / {facts.length}
                </div>

                <button
                  onClick={handleClose}
                  className="px-6 py-2 bg-[#f9551C] text-[#122D50] font-bold rounded-xl hover:bg-[#ff6a38] transition-all shadow-lg active:scale-95"
                >
                  Got it!
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

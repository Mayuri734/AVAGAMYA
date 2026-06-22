import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Send, Bot, User, Loader2, Mic, MicOff, Volume2, Calculator as CalcIcon, Mail } from 'lucide-react';
import axios from 'axios';
import { CreditCardSimulator } from '../pages/CreditCardSimulator';

interface Message {
  role: 'user' | 'agent';
  content: string;
}

export const SHRAWYA: React.FC = () => {
  const [isOpen, setIsOpen] = useState(false);
  const recentPdfName = localStorage.getItem('recent_pdf_name');
  const greetingText = recentPdfName 
    ? `Hi! I'm SHRAWYA, your AI Financial Assistant. I can answer questions about the document "${recentPdfName}" you just analyzed. What would you like to know?`
    : "Hi! I'm SHRAWYA, your AI Financial Assistant. I can answer questions about the document you just analyzed. What would you like to know?";

  const [messages, setMessages] = useState<Message[]>([
    { role: 'agent', content: greetingText }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [showSimulator, setShowSimulator] = useState(false);
  const [simProps, setSimProps] = useState<any>({});
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const QUICK_REPLIES = [
    "Summarize this document",
    "What are the hidden fees?",
    "Are there any penalties?"
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isTyping]);

  const handleSend = async (text: string) => {
    if (!text.trim()) return;
    
    const newMessages = [...messages, { role: 'user' as const, content: text }];
    setMessages(newMessages);
    setInput('');
    setIsTyping(true);

    try {
      const lang = localStorage.getItem('avagamya_lang') || 'en';
      
      const response = await axios.post(`${import.meta.env.VITE_API_BASE_URL}/api/agent/shrawya/chat`, {
        query: text,
        history: messages.slice(-4),
        document_hash: "",
        language: lang
      });

      setMessages([...newMessages, { role: 'agent', content: response.data.response }]);
    } catch (error) {
      console.error("SHRAWYA Chat Error:", error);
      setMessages([...newMessages, { role: 'agent', content: "I'm sorry, I'm having trouble connecting to my brain right now." }]);
    } finally {
      setIsTyping(false);
    }
  };

  // --- Voice Integration ---
  const handleListen = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      alert("Your browser does not support Speech Recognition. Please use Chrome or Edge.");
      return;
    }
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    const lang = localStorage.getItem('avagamya_lang') || 'en';
    const langCode = lang === 'hi' ? 'hi-IN' : lang === 'mr' ? 'mr-IN' : 'en-IN';
    recognition.lang = langCode;
    recognition.continuous = false;
    recognition.interimResults = false;

    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setInput(transcript);
    };
    recognition.onerror = (event: any) => {
      console.error("Speech error:", event.error);
      setIsListening(false);
    };
    recognition.onend = () => setIsListening(false);
    
    recognition.start();
  };

  const speakText = (text: string) => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    
    // Strip tags before speaking
    let cleanText = text.replace(/\[UI: SIMULATOR.*?\]/g, '').replace(/\[ACTION: DRAFT_WAIVER_EMAIL\]/g, '').trim();
    
    const utterance = new SpeechSynthesisUtterance(cleanText);
    const lang = localStorage.getItem('avagamya_lang') || 'en';
    utterance.lang = lang === 'hi' ? 'hi-IN' : lang === 'mr' ? 'mr-IN' : 'en-IN';
    window.speechSynthesis.speak(utterance);
  };

  // --- Render Message with Generative UI & Next Best Actions ---
  const renderMessageContent = (msg: Message) => {
    let content = msg.content;
    let hasSim = false;
    let parsedProps = {};
    let hasDraft = false;

    // Check Simulator Tag
    const simRegex = /\[UI: SIMULATOR \| P=(.*?) \| R=(.*?) \| T=(.*?) \| F=(.*?)\]/;
    const simMatch = content.match(simRegex);
    if (simMatch) {
      hasSim = true;
      parsedProps = {
        initialPrincipal: Number(simMatch[1]),
        initialRoi: Number(simMatch[2]),
        initialTenure: Number(simMatch[3]),
        initialFee: Number(simMatch[4])
      };
      content = content.replace(simRegex, '').trim();
    }

    // Check Draft Tag
    if (content.includes('[ACTION: DRAFT_WAIVER_EMAIL]')) {
      hasDraft = true;
      content = content.replace('[ACTION: DRAFT_WAIVER_EMAIL]', '').trim();
    }

    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm leading-relaxed whitespace-pre-wrap">{content}</p>
        
        {/* Generative UI Components */}
        {hasSim && (
          <button 
            onClick={() => { setSimProps(parsedProps); setShowSimulator(true); }}
            className="mt-2 flex items-center gap-2 bg-[#f9551C]/10 text-[#f9551C] px-3 py-2 rounded-lg font-medium text-sm hover:bg-[#f9551C]/20 transition-colors w-fit border border-[#f9551C]/30"
          >
            <CalcIcon className="w-4 h-4" />
            Launch Interactive Simulator
          </button>
        )}

        {hasDraft && (
          <button 
            onClick={() => handleSend("Please draft a highly professional email to the bank requesting a waiver for this specific fee.")}
            className="mt-2 flex items-center gap-2 bg-[#122D50]/10 text-[#122D50] px-3 py-2 rounded-lg font-medium text-sm hover:bg-[#122D50]/20 transition-colors w-fit border border-[#122D50]/30"
          >
            <Mail className="w-4 h-4" />
            Draft Waiver Email
          </button>
        )}

        {/* Text to Speech Speaker */}
        {msg.role === 'agent' && (
          <button onClick={() => speakText(content)} className="mt-1 text-gray-400 hover:text-[#f9551C] transition-colors self-end" title="Listen to response">
            <Volume2 className="w-4 h-4" />
          </button>
        )}
      </div>
    );
  };

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
              onClick={() => setIsOpen(true)}
            >
              <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#122D50] text-[#f9551C] text-xs font-bold px-3 py-1 rounded-full border border-[#f9551C] shadow-lg whitespace-nowrap">
                SHRAWYA
              </div>
              <div className="relative w-16 h-16 rounded-full border-2 border-[#f9551C] overflow-hidden shadow-2xl transition-all duration-300 group-hover:scale-110">
                <img src="/SHRAWYA bot.jpg" alt="SHRAWYA Bot" className="w-full h-full object-cover" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Chat Modal */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm md:items-end md:justify-end md:p-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-md h-[600px] flex flex-col bg-white rounded-2xl shadow-2xl overflow-hidden border border-gray-200"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 bg-[#122D50] text-white">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full overflow-hidden border-2 border-[#f9551C]">
                    <img src="/SHRAWYA bot.jpg" alt="Bot" className="w-full h-full object-cover" />
                  </div>
                  <div>
                    <h3 className="font-bold">SHRAWYA</h3>
                    <p className="text-xs text-white/70">AI Financial Agent</p>
                  </div>
                </div>
                <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Chat Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50">
                {messages.map((msg, idx) => (
                  <div key={idx} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    {msg.role === 'agent' && (
                      <div className="w-8 h-8 rounded-full bg-[#122D50] flex items-center justify-center shrink-0">
                        <Bot className="w-5 h-5 text-[#f9551C]" />
                      </div>
                    )}
                    <div className={`p-3 rounded-2xl max-w-[85%] ${msg.role === 'user' ? 'bg-[#f9551C] text-white rounded-br-none' : 'bg-white text-[#122D50] border border-gray-100 shadow-sm rounded-bl-none'}`}>
                      {renderMessageContent(msg)}
                    </div>
                    {msg.role === 'user' && (
                      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center shrink-0">
                        <User className="w-5 h-5 text-gray-500" />
                      </div>
                    )}
                  </div>
                ))}
                {isTyping && (
                  <div className="flex gap-3 justify-start">
                    <div className="w-8 h-8 rounded-full bg-[#122D50] flex items-center justify-center shrink-0">
                      <Bot className="w-5 h-5 text-[#f9551C]" />
                    </div>
                    <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm rounded-bl-none flex items-center gap-2">
                      <Loader2 className="w-4 h-4 text-[#f9551C] animate-spin" />
                      <span className="text-xs text-gray-400 font-medium">SHRAWYA is reasoning...</span>
                    </div>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Quick Replies */}
              {messages.length === 1 && (
                <div className="px-4 py-2 bg-gray-50 flex flex-wrap gap-2">
                  {QUICK_REPLIES.map((reply, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(reply)}
                      className="text-xs px-3 py-1.5 bg-white border border-[#f9551C]/30 text-[#f9551C] rounded-full hover:bg-[#f9551C] hover:text-white transition-colors"
                    >
                      {reply}
                    </button>
                  ))}
                </div>
              )}

              {/* Input Area */}
              <div className="p-4 bg-white border-t border-gray-100">
                <form 
                  onSubmit={(e) => { e.preventDefault(); handleSend(input); }}
                  className="flex items-center gap-2"
                >
                  <button
                    type="button"
                    onClick={handleListen}
                    className={`p-3 rounded-xl transition-colors ${isListening ? 'bg-red-100 text-red-500 animate-pulse' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                    title="Speak"
                  >
                    {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                  </button>
                  
                  <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder={isListening ? "Listening..." : "Ask about the document..."}
                    className="flex-1 bg-gray-100 text-sm rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-[#f9551C]/50 transition-all text-[#122D50]"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim() || isTyping}
                    className="p-3 bg-[#122D50] text-white rounded-xl hover:bg-[#1a4073] disabled:opacity-50 transition-colors"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </form>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Embedded Simulator Modal */}
      <AnimatePresence>
        {showSimulator && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-gray-50 rounded-2xl shadow-2xl"
            >
              <button 
                onClick={() => setShowSimulator(false)} 
                className="absolute top-4 right-4 z-10 p-2 bg-white hover:bg-gray-100 rounded-full shadow-md"
              >
                <X className="w-5 h-5 text-gray-600" />
              </button>
              <CreditCardSimulator {...simProps} />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};

import { motion } from 'framer-motion'
import { FileText, Shield, Activity, Database, Server } from 'lucide-react'

export function Docs() {
    return (
        <div className="min-h-screen bg-gray-50 pt-24 pb-12">
            <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">

                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-center mb-16"
                >
                    <div className="inline-flex items-center justify-center p-3 bg-blue-100 rounded-full mb-6">
                        <FileText className="w-8 h-8 text-blue-600" />
                    </div>
                    <h1 className="text-4xl font-bold text-gray-900 mb-4 tracking-tight">Technical Documentation</h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                        Comprehensive guide to the AVAGAMYA core endpoints, security architecture, and system logic.
                    </p>
                </motion.div>

                <div className="space-y-12">

                    {/* Endpoint 1 */}
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100"
                    >
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 bg-indigo-50 rounded-lg">
                                <Server className="w-6 h-6 text-indigo-600" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="px-3 py-1 bg-green-100 text-green-700 text-sm font-semibold rounded-full border border-green-200">POST</span>
                                    <h2 className="text-2xl font-bold text-gray-900 font-mono text-lg">/analyze/upload</h2>
                                </div>
                                <p className="text-gray-600">High-Risk Analysis</p>
                            </div>
                        </div>

                        <div className="prose prose-blue max-w-none text-gray-600">
                            <p>
                                Core endpoint driving the End-User pipeline. Built on a <strong>Neuro-Symbolic Hybrid</strong> architecture:
                            </p>
                            <ul className="space-y-2 mt-4 ml-4 list-disc marker:text-blue-500">
                                <li><strong>Symbolic Layer:</strong> Executes deterministic mathematical heuristics (Flesch Reading Ease via <code>textstat</code>) alongside <code>spaCy</code> syntactic validation to score complexity and drop safe clauses instantly.</li>
                                <li><strong>Neural Layer:</strong> Only high-friction clauses (CI &gt; 70) are routed to <strong>Gemini 1.5 Flash</strong> and <strong>Sarvam AI</strong> for highly constrained target-language translation.</li>
                            </ul>
                        </div>
                    </motion.section>

                    {/* Endpoint 2 */}
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2 }}
                        className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100"
                    >
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 bg-purple-50 rounded-lg">
                                <Database className="w-6 h-6 text-purple-600" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-semibold rounded-full border border-blue-200">GET</span>
                                    <h2 className="text-2xl font-bold text-gray-900 font-mono text-lg">/analyze/dpo/logs</h2>
                                </div>
                                <p className="text-gray-600">Immutable Audit Trail</p>
                            </div>
                        </div>

                        <div className="prose prose-purple max-w-none text-gray-600">
                            <p>
                                Enterprise API for the Data Protection Officer (DPO). Automatically polls <strong>Supabase</strong> to retrieve a rolling ledger of system transactions.
                            </p>
                            <ul className="space-y-2 mt-4 ml-4 list-disc marker:text-purple-500">
                                <li>Fetches cryptographically secure <strong>SHA-256 Hashes</strong> of every uploaded PDF to guarantee Binary Parity.</li>
                                <li>Displays intercepted PII events (PAN / Credit Cards) confirming DPDP Act data sovereignty controls.</li>
                            </ul>
                        </div>
                    </motion.section>

                    {/* Endpoint 3 */}
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100"
                    >
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 bg-sky-50 rounded-lg">
                                <Activity className="w-6 h-6 text-sky-600" />
                            </div>
                            <div>
                                <div className="flex items-center gap-3 mb-2">
                                    <span className="px-3 py-1 bg-blue-100 text-blue-700 text-sm font-semibold rounded-full border border-blue-200">GET</span>
                                    <h2 className="text-2xl font-bold text-gray-900 font-mono text-lg">/audit/summary</h2>
                                </div>
                                <p className="text-gray-600">Real-Time Telemetry</p>
                            </div>
                        </div>

                        <div className="prose prose-sky max-w-none text-gray-600">
                            <p>
                                Aggregation node populating the live overview cards on the DPO dashboard directly from Supabase. Compute logic tracks rolling averages across:
                            </p>
                            <ul className="space-y-2 mt-4 ml-4 list-disc marker:text-sky-500">
                                <li>Overall DPDP Compliance Percentage.</li>
                                <li>Real-time average document processing latency.</li>
                            </ul>
                        </div>
                    </motion.section>

                    {/* Security Architecture */}
                    <motion.section
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="bg-white rounded-2xl p-8 shadow-sm border border-gray-100"
                    >
                        <div className="flex items-start gap-4 mb-6">
                            <div className="p-3 bg-red-50 rounded-lg">
                                <Shield className="w-6 h-6 text-red-600" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-gray-900 mb-2">Security & Sanitization</h2>
                                <p className="text-gray-600">Frontend Plain Language Compliance (Rule 3)</p>
                            </div>
                        </div>

                        <div className="prose prose-red max-w-none text-gray-600">
                            <p>
                                To strictly adhere to the DPDP Act requirement for clear and plain language notice (Rule 3), the system employs aggressive <strong>Frontend Sanitization Pipelines</strong>. We prevent users from seeing AI hallucinations or reasoning artifacts.
                            </p>
                            <div className="mt-6 bg-gray-50 rounded-lg p-4 border border-gray-200">
                                <h4 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wider">Zero-Chatter Enforcement</h4>
                                <ul className="space-y-3 text-sm">
                                    <li className="flex items-start">
                                        <span className="mr-3 text-red-500 font-bold">•</span>
                                        <span><strong>Regex Stripping:</strong> A hard-coded RegExp engine (<code>re.sub(r"^(?i)(here is|simplified).*?:\s*", "")</code>) physically strips away conversational AI preambles generated by Sarvam and Gemini before they reach the UI DOM.</span>
                                    </li>
                                    <li className="flex items-start">
                                        <span className="mr-3 text-red-500 font-bold">•</span>
                                        <span><strong>Internal Tag Scraping:</strong> Any unintentional internal reasoning tags emitted by the LLM (e.g. <code>&lt;think&gt;...&lt;/think&gt;</code> bounds) are violently stripped from the final simplified text string via strict Regex bounds mapping to ensure the user reads only a perfectly clean, translated sentence.</span>
                                    </li>
                                </ul>
                            </div>
                        </div>
                    </motion.section>

                </div>
            </div>
        </div>
    )
}

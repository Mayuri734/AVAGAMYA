import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { About } from './pages/About'
import { HowItWorks } from './pages/HowItWorks'
import { FAQs } from './pages/FAQs'
import { AnalysisProvider } from './context/AnalysisContext'
import { LanguageSelection } from './pages/LanguageSelection'
import { UploadDocument } from './pages/UploadDocument'
import { AnalysisResult } from './pages/AnalysisResult'
import { ModuleSelector } from './pages/ModuleSelector'
import { DPODashboard } from './pages/DPODashboard'
import { AuditorDashboard } from './pages/AuditorDashboard'
import { ComplianceOfficer } from './pages/ComplianceOfficer'
import { DPOLogin } from './pages/DPOLogin';
import { ComplianceLogin } from './pages/ComplianceLogin';
import { AuditorLogin } from './pages/AuditorLogin'; 

export default function App() {
  return (
    <BrowserRouter>
      <AnalysisProvider>
        <Routes>
          {/* Main Layout Wrap: Ensures Navbar & Footer are on every page */}
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="about" element={<About />} />
            <Route path="how-it-works" element={<HowItWorks />} />
            <Route path="faqs" element={<FAQs />} />
            
            {/* Analysis Workflow */}
            <Route path="analyze/language" element={<LanguageSelection />} />
            <Route path="staff/modules" element={<ModuleSelector />} />
            <Route path="analyze/upload" element={<UploadDocument />} />
            <Route path="analyze/result" element={<AnalysisResult />} />

{/* Staff Login Routes */}
  <Route path="staff/dpo/login" element={<DPOLogin />} />
  <Route path="staff/compliance/login" element={<ComplianceLogin />} />
  <Route path="staff/auditor/login" element={<AuditorLogin />} />

            {/* Staff/Enterprise Routes: Now inside Layout to show Navbar */}
            <Route path="staff/dpo-dashboard" element={<DPODashboard />} />
            <Route path="staff/auditor-dashboard" element={<AuditorDashboard />} />
            <Route path="staff/compliance-dashboard" element={<ComplianceOfficer />} />
          </Route>
        </Routes>
      </AnalysisProvider>
    </BrowserRouter>
  )
}
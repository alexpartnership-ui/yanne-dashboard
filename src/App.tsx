import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthGuard } from './components/AuthGuard'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { AcquisitionDashboard } from './pages/AcquisitionDashboard'
import { CallsPage } from './pages/CallsPage'
import { CallDetailPage } from './pages/CallDetailPage'
import { RepsPage } from './pages/RepsPage'
import { DealsPage } from './pages/DealsPage'
import { ChatPage } from './pages/ChatPage'
import { ReportingPage } from './pages/ReportingPage'
import { CEODashboard } from './pages/CEODashboard'
import { PlaceholderPage } from './pages/PlaceholderPage'
import { EmailIntelligencePage } from './pages/EmailIntelligencePage'
import { CopyLibraryPage } from './pages/CopyLibraryPage'
import { SetterPerformancePage } from './pages/SetterPerformancePage'
import { LeadQualityPage } from './pages/LeadQualityPage'
import { ClientOverviewPage } from './pages/ClientOverviewPage'
import { OnboardingTrackerPage } from './pages/OnboardingTrackerPage'
import { CampaignDashboardsPage } from './pages/CampaignDashboardsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthGuard />}>
        <Route element={<Layout />}>
          {/* Client Acquisition */}
          <Route path="/dashboard" element={<AcquisitionDashboard />} />
          <Route path="/calls" element={<CallsPage />} />
          <Route path="/calls/:id" element={<CallDetailPage />} />
          <Route path="/reps" element={<RepsPage />} />
          <Route path="/deals" element={<DealsPage />} />
          <Route path="/chat" element={<ChatPage />} />

          {/* Clients */}
          <Route path="/clients/overview" element={<ClientOverviewPage />} />
          <Route path="/clients/campaigns" element={<CampaignDashboardsPage />} />
          <Route path="/clients/onboarding" element={<OnboardingTrackerPage />} />
          <Route path="/clients/deals" element={<PlaceholderPage title="Client Deal Pipeline" source="Airtable" previews={['Deal stages', 'Expected close dates', 'Deal values']} />} />
          <Route path="/clients/reporting" element={<ReportingPage />} />

          {/* Outbound / GTM */}
          <Route path="/outbound/email" element={<EmailIntelligencePage />} />
          <Route path="/outbound/copy" element={<CopyLibraryPage />} />
          <Route path="/outbound/setters" element={<SetterPerformancePage />} />
          <Route path="/outbound/leads" element={<LeadQualityPage />} />

          {/* CEO Dashboard */}
          <Route path="/ceo" element={<CEODashboard />} />

          {/* Finance */}
          <Route path="/finance" element={<PlaceholderPage title="Finance" source="accounting system" previews={['Revenue tracking', 'Expense breakdown', 'Cash flow projections']} />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

import { lazy, Suspense } from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthGuard } from './components/AuthGuard'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { ErrorBoundary } from './components/ErrorBoundary'
import { ToastProvider } from './components/Toast'

// Phase 3.5: Code splitting — lazy load all pages
const AcquisitionDashboard = lazy(() => import('./pages/AcquisitionDashboard').then(m => ({ default: m.AcquisitionDashboard })))
const CallsPage = lazy(() => import('./pages/CallsPage').then(m => ({ default: m.CallsPage })))
const CallDetailPage = lazy(() => import('./pages/CallDetailPage').then(m => ({ default: m.CallDetailPage })))
const RepsPage = lazy(() => import('./pages/RepsPage').then(m => ({ default: m.RepsPage })))
const DealsPage = lazy(() => import('./pages/DealsPage').then(m => ({ default: m.DealsPage })))
const ChatPage = lazy(() => import('./pages/ChatPage').then(m => ({ default: m.ChatPage })))
const ReportingPage = lazy(() => import('./pages/ReportingPage').then(m => ({ default: m.ReportingPage })))
const CEODashboard = lazy(() => import('./pages/CEODashboard').then(m => ({ default: m.CEODashboard })))
const PlaceholderPage = lazy(() => import('./pages/PlaceholderPage').then(m => ({ default: m.PlaceholderPage })))
const EmailIntelligencePage = lazy(() => import('./pages/EmailIntelligencePage').then(m => ({ default: m.EmailIntelligencePage })))
const CopyLibraryPage = lazy(() => import('./pages/CopyLibraryPage').then(m => ({ default: m.CopyLibraryPage })))
const SetterPerformancePage = lazy(() => import('./pages/SetterPerformancePage').then(m => ({ default: m.SetterPerformancePage })))
const LeadQualityPage = lazy(() => import('./pages/LeadQualityPage').then(m => ({ default: m.LeadQualityPage })))
const ActiveCampaignsPage = lazy(() => import('./pages/ActiveCampaignsPage').then(m => ({ default: m.ActiveCampaignsPage })))
const ClientOverviewPage = lazy(() => import('./pages/ClientOverviewPage').then(m => ({ default: m.ClientOverviewPage })))
const OnboardingTrackerPage = lazy(() => import('./pages/OnboardingTrackerPage').then(m => ({ default: m.OnboardingTrackerPage })))
const CampaignDashboardsPage = lazy(() => import('./pages/CampaignDashboardsPage').then(m => ({ default: m.CampaignDashboardsPage })))
const SettingsPage = lazy(() => import('./pages/SettingsPage').then(m => ({ default: m.SettingsPage })))
const AuditLogPage = lazy(() => import('./pages/AuditLogPage').then(m => ({ default: m.AuditLogPage })))
const TrackersPage = lazy(() => import('./pages/TrackersPage').then(m => ({ default: m.TrackersPage })))
const CallSearchPage = lazy(() => import('./pages/CallSearchPage').then(m => ({ default: m.CallSearchPage })))
const BenchmarksPage = lazy(() => import('./pages/BenchmarksPage').then(m => ({ default: m.BenchmarksPage })))
const DealsAIPage = lazy(() => import('./pages/DealsAIPage').then(m => ({ default: m.DealsAIPage })))
const LinkedInOutboundPage = lazy(() => import('./pages/LinkedInOutboundPage').then(m => ({ default: m.LinkedInOutboundPage })))
const InvestorDatabasePage = lazy(() => import('./pages/InvestorDatabasePage').then(m => ({ default: m.InvestorDatabasePage })))
const InvestorCadencePage = lazy(() => import('./pages/InvestorCadencePage').then(m => ({ default: m.InvestorCadencePage })))

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <div className="flex items-center gap-3 text-text-faint">
        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24" fill="none"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
        Loading...
      </div>
    </div>
  )
}

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <Suspense fallback={<PageLoader />}>
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
                <Route path="/deals/ai" element={<DealsAIPage />} />
                <Route path="/trackers" element={<TrackersPage />} />
                <Route path="/call-search" element={<CallSearchPage />} />
                <Route path="/benchmarks" element={<BenchmarksPage />} />
                <Route path="/chat" element={<ChatPage />} />

                {/* Clients */}
                <Route path="/clients/overview" element={<ClientOverviewPage />} />
                <Route path="/clients/campaigns" element={<CampaignDashboardsPage />} />
                <Route path="/clients/onboarding" element={<OnboardingTrackerPage />} />
                <Route path="/clients/deals" element={<PlaceholderPage title="Client Deal Pipeline" source="Airtable" previews={['Deal stages', 'Expected close dates', 'Deal values']} />} />
                <Route path="/clients/reporting" element={<ReportingPage />} />

                {/* Outbound / GTM */}
                <Route path="/outbound/email" element={<EmailIntelligencePage />} />
                <Route path="/outbound/campaigns" element={<ActiveCampaignsPage />} />
                <Route path="/outbound/copy" element={<CopyLibraryPage />} />
                <Route path="/outbound/setters" element={<SetterPerformancePage />} />
                <Route path="/outbound/leads" element={<LeadQualityPage />} />
                <Route path="/outbound/linkedin" element={<LinkedInOutboundPage />} />

                {/* Relationships */}
                <Route path="/relationships/investors" element={<InvestorDatabasePage />} />
                <Route path="/relationships/cadence" element={<InvestorCadencePage />} />

                {/* CEO Dashboard */}
                <Route path="/ceo" element={<CEODashboard />} />

                {/* Finance */}
                <Route path="/finance" element={<PlaceholderPage title="Finance" source="accounting system" previews={['Revenue tracking', 'Expense breakdown', 'Cash flow projections']} />} />

                {/* Settings (admin only) */}
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/settings/audit" element={<AuditLogPage />} />
              </Route>
            </Route>
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Routes>
        </Suspense>
      </ToastProvider>
    </ErrorBoundary>
  )
}

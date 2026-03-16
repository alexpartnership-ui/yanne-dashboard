import { Routes, Route, Navigate } from 'react-router-dom'
import { AuthGuard } from './components/AuthGuard'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { CallsPage } from './pages/CallsPage'
import { CallDetailPage } from './pages/CallDetailPage'
import { RepsPage } from './pages/RepsPage'
import { DealsPage } from './pages/DealsPage'

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<AuthGuard />}>
        <Route element={<Layout />}>
          <Route path="/calls" element={<CallsPage />} />
          <Route path="/calls/:id" element={<CallDetailPage />} />
          <Route path="/reps" element={<RepsPage />} />
          <Route path="/deals" element={<DealsPage />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/calls" replace />} />
    </Routes>
  )
}

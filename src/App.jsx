import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider } from './hooks/useAuth'
import ProtectedRoute from './components/layout/ProtectedRoute'
import RequireBudget from './components/layout/RequireBudget'
import Login from './pages/Login'
import Signup from './pages/Signup'
import ForgotPassword from './pages/ForgotPassword'
import ResetPassword from './pages/ResetPassword'
import Onboarding from './pages/Onboarding'
import Welcome from './pages/Welcome'
import AppShell from './pages/AppShell'

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login"           element={<Login />} />
          <Route path="/signup"          element={<Signup />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />

          {/* The emailed recovery link lands here — Supabase auto-exchanges
              its token into a session, so this needs to be signed-in-gated
              the same way the rest of the app is. */}
          <Route path="/reset-password" element={
            <ProtectedRoute><ResetPassword /></ProtectedRoute>
          } />

          <Route path="/welcome" element={
            <ProtectedRoute><Welcome /></ProtectedRoute>
          } />

          <Route path="/onboarding" element={
            <ProtectedRoute><Onboarding /></ProtectedRoute>
          } />

          <Route path="/dashboard" element={
            <ProtectedRoute><RequireBudget><AppShell /></RequireBudget></ProtectedRoute>
          } />

          {/* Catch-all → dashboard (or login via ProtectedRoute) */}
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

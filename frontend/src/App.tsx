import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from '@/contexts/AuthContext';
import { ProtectedRoute } from '@/components/layout/ProtectedRoute';
import ErrorBoundary from '@/components/ErrorBoundary';
import Layout from '@/components/layout/Layout';
import LoginPage from '@/pages/auth/LoginPage';
import RegisterPage from '@/pages/auth/RegisterPage';
import ForgotPasswordPage from '@/pages/auth/ForgotPasswordPage';
import DashboardPage from '@/pages/DashboardPage';
import GradesPage from '@/pages/grades/GradesPage';
import FeesPage from '@/pages/fees/FeesPage';
import StudentsPage from '@/pages/students/StudentsPage';
import PaymentsPage from '@/pages/payments/PaymentsPage';
import ReceiptsPage from '@/pages/receipts/ReceiptsPage';
import StatementsPage from '@/pages/statements/StatementsPage';
import InvoicesPage from '@/pages/invoices/InvoicesPage';
import ReportsPage from '@/pages/reports/ReportsPage';
import ChargesPage from '@/pages/charges/ChargesPage';
import ParentDashboard from '@/pages/parent/ParentDashboard';
import ProfilePage from '@/pages/profile/ProfilePage';
import SettingsPage from '@/pages/settings/SettingsPage';
import RegistrationsPage from '@/pages/registrations/RegistrationsPage';
import PaymentSuccessPage from '@/pages/payment/PaymentSuccessPage';
import PaymentFailedPage from '@/pages/payment/PaymentFailedPage';

function AppRoutes() {
  const { user } = useAuth();

  const isFinanceUser = user?.role === 'admin' || user?.role === 'super_admin' || user?.role === 'finance';
  const isParent = user?.role === 'parent';

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />
      <Route path="/payment/success" element={<PaymentSuccessPage />} />
      <Route path="/payment/failed" element={<PaymentFailedPage />} />
      <Route
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        {/* Parent-only routes */}
        <Route path="/parent" element={<ParentDashboard />} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/receipts" element={<ReceiptsPage />} />
        <Route path="/statements" element={<StatementsPage />} />

        {/* Parents + staff: invoices (read-only for parents) */}
        <Route path="/invoices" element={
          isFinanceUser || isParent ? <InvoicesPage /> : <Navigate to={isParent ? "/parent" : "/"} replace />
        } />

        {/* Root: redirect parents to portal */}
        <Route path="/" element={
          isParent ? <Navigate to="/parent" replace /> : <DashboardPage />
        } />

        {/* Admin/Finance-only routes */}
        <Route path="/grades" element={
          isFinanceUser ? <GradesPage /> : <Navigate to={isParent ? "/parent" : "/"} replace />
        } />
        <Route path="/fees" element={
          isFinanceUser ? <FeesPage /> : <Navigate to={isParent ? "/parent" : "/"} replace />
        } />
        <Route path="/students" element={
          isFinanceUser ? <StudentsPage /> : <Navigate to={isParent ? "/parent" : "/"} replace />
        } />
        <Route path="/payments" element={
          isFinanceUser ? <PaymentsPage /> : <Navigate to={isParent ? "/parent" : "/"} replace />
        } />
        <Route path="/charges" element={
          isFinanceUser ? <ChargesPage /> : <Navigate to={isParent ? "/parent" : "/"} replace />
        } />
        <Route path="/registrations" element={
          user?.role === 'admin' || user?.role === 'super_admin' ? <RegistrationsPage /> : <Navigate to={isParent ? "/parent" : "/"} replace />
        } />
        <Route path="/reports" element={
          isFinanceUser ? <ReportsPage /> : <Navigate to={isParent ? "/parent" : "/"} replace />
        } />
        <Route path="/settings" element={
          user?.role === 'super_admin' ? <SettingsPage /> : <Navigate to={isParent ? "/parent" : "/"} replace />
        } />
      </Route>
    </Routes>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <Toaster position="top-right" />
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </AuthProvider>
    </ErrorBoundary>
  );
}

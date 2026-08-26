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
import UserAccountsPage from '@/pages/users/UserAccountsPage';
import SendNotificationPage from '@/pages/notifications/SendNotificationPage';
import DiscountsPage from '@/pages/discounts/DiscountsPage';
import PaymentSuccessPage from '@/pages/payment/PaymentSuccessPage';
import PaymentFailedPage from '@/pages/payment/PaymentFailedPage';

function AppRoutes() {
  const { user } = useAuth();

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
        <Route path="/parent" element={<ProtectedRoute roles={['parent']}><ParentDashboard /></ProtectedRoute>} />
        <Route path="/profile" element={<ProfilePage />} />
        <Route path="/receipts" element={<ProtectedRoute roles={['admin', 'finance', 'parent']}><ReceiptsPage /></ProtectedRoute>} />
        <Route path="/statements" element={<ProtectedRoute roles={['admin', 'finance', 'parent']}><StatementsPage /></ProtectedRoute>} />
        <Route path="/invoices" element={<ProtectedRoute roles={['admin', 'finance', 'parent']}><InvoicesPage /></ProtectedRoute>} />

        {/* Root: redirect parents to portal */}
        <Route path="/" element={
          user?.role === 'parent' ? <Navigate to="/parent" replace /> : <DashboardPage />
        } />

        {/* Admin/Finance-only routes */}
        <Route path="/grades" element={<ProtectedRoute roles={['admin', 'super_admin', 'finance']}><GradesPage /></ProtectedRoute>} />
        <Route path="/fees" element={<ProtectedRoute roles={['admin', 'super_admin', 'finance']}><FeesPage /></ProtectedRoute>} />
        <Route path="/students" element={<ProtectedRoute roles={['admin', 'super_admin', 'finance']}><StudentsPage /></ProtectedRoute>} />
        <Route path="/payments" element={<ProtectedRoute roles={['admin', 'super_admin', 'finance']}><PaymentsPage /></ProtectedRoute>} />
        <Route path="/charges" element={<ProtectedRoute roles={['admin', 'super_admin', 'finance']}><ChargesPage /></ProtectedRoute>} />
        <Route path="/discounts" element={<ProtectedRoute roles={['admin', 'super_admin', 'finance']}><DiscountsPage /></ProtectedRoute>} />
        <Route path="/registrations" element={<ProtectedRoute roles={['admin', 'super_admin']}><RegistrationsPage /></ProtectedRoute>} />
        <Route path="/reports" element={<ProtectedRoute roles={['admin', 'super_admin', 'finance']}><ReportsPage /></ProtectedRoute>} />
        <Route path="/settings" element={<ProtectedRoute roles={['super_admin']}><SettingsPage /></ProtectedRoute>} />
        <Route path="/send-notification" element={<ProtectedRoute roles={['admin', 'super_admin']}><SendNotificationPage /></ProtectedRoute>} />
        <Route path="/accounts" element={<ProtectedRoute roles={['super_admin']}><UserAccountsPage /></ProtectedRoute>} />
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

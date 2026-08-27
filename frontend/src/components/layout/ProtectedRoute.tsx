import { Navigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

export function ProtectedRoute({ children, roles }: { children: React.ReactNode; roles?: string[] }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) {
    // super_admin inherits all admin/finance permissions (matches sidebar logic)
    const isSuperAdminBypass = user.role === 'super_admin' && (
      roles.includes('admin') || roles.includes('finance')
    );
    if (!isSuperAdminBypass) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

import { Link, useLocation, Outlet } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import {
  LayoutDashboard,
  GraduationCap,
  Wallet,
  Users,
  Receipt,
  FileText,
  BarChart3,
  LogOut,
  Menu,
  X,
  CreditCard,
  DollarSign,
  Settings,
  UserPlus,
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['admin', 'finance'] },
  { name: 'Registrations', href: '/registrations', icon: UserPlus, roles: ['admin'] },
  { name: 'Grades', href: '/grades', icon: GraduationCap, roles: ['admin', 'finance'] },
  { name: 'Fees', href: '/fees', icon: CreditCard, roles: ['admin', 'finance'] },
  { name: 'Students', href: '/students', icon: Users, roles: ['admin', 'finance'] },
  { name: 'Charges', href: '/charges', icon: DollarSign, roles: ['admin', 'finance'] },
  { name: 'Payments', href: '/payments', icon: Wallet, roles: ['admin', 'finance'] },
  { name: 'Receipts', href: '/receipts', icon: Receipt, roles: ['admin', 'finance', 'parent'] },
  { name: 'Statements', href: '/statements', icon: FileText, roles: ['admin', 'finance', 'parent'] },
  { name: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin', 'finance'] },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['admin'] },
];

const parentNavigation = [
  { name: 'My Portal', href: '/parent', icon: LayoutDashboard },
  { name: 'Receipts', href: '/receipts', icon: Receipt },
  { name: 'Statements', href: '/statements', icon: FileText },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isParent = user?.role === 'parent';
  const items = isParent
    ? parentNavigation
    : navigation.filter((item) => item.roles.includes(user?.role || ''));

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:z-auto',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="flex h-full flex-col">
          <div className="flex h-16 items-center justify-between border-b border-gray-200 px-6">
            <h1 className="text-lg font-bold text-primary-700">School Finance</h1>
            <button className="lg:hidden" onClick={() => setSidebarOpen(false)}>
              <X className="h-5 w-5" />
            </button>
          </div>

          <nav className="flex-1 space-y-1 px-3 py-4">
            {items.map((item) => {
              const isActive = location.pathname === item.href || (item.href !== '/' && location.pathname.startsWith(item.href));
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={clsx(
                    'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-primary-50 text-primary-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  )}
                >
                  <item.icon className="h-5 w-5 flex-shrink-0" />
                  {item.name}
                </Link>
              );
            })}
          </nav>

          <div className="border-t border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-100 text-sm font-medium text-primary-700">
                {user?.full_name?.charAt(0) || '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{user?.full_name}</p>
                <p className="text-xs text-gray-500 capitalize">{user?.role}</p>
              </div>
              <button
                onClick={logout}
                className="text-gray-400 hover:text-gray-600"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-6">
          <button className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold text-gray-900">
            {items.find((n) => location.pathname === n.href || (n.href !== '/' && location.pathname.startsWith(n.href)))?.name || (isParent ? 'My Portal' : 'Dashboard')}
          </h2>
        </header>

        <main className="flex-1 overflow-y-auto p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

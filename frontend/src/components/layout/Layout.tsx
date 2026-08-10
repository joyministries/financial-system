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
  FilePlus2,
  CalendarDays,
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import BrandMark from '@/components/Brand';
import NotificationsBell from '@/components/notifications/NotificationsBell';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['admin', 'finance'] },
  { name: 'Registrations', href: '/registrations', icon: UserPlus, roles: ['admin'] },
  { name: 'Grades', href: '/grades', icon: GraduationCap, roles: ['admin', 'finance'] },
  { name: 'Fees', href: '/fees', icon: CreditCard, roles: ['admin', 'finance'] },
  { name: 'Students', href: '/students', icon: Users, roles: ['admin', 'finance'] },
  { name: 'Additional Charges', href: '/charges', icon: DollarSign, roles: ['admin', 'finance'] },
  { name: 'Payments', href: '/payments', icon: Wallet, roles: ['admin', 'finance'] },
  { name: 'Receipts', href: '/receipts', icon: Receipt, roles: ['admin', 'finance', 'parent'] },
  { name: 'Statements', href: '/statements', icon: FileText, roles: ['admin', 'finance', 'parent'] },
  { name: 'Invoices', href: '/invoices', icon: FilePlus2, roles: ['admin', 'finance', 'parent'] },
  { name: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin', 'finance'] },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['admin'] },
];

const parentNavigation = [
  { name: 'My Portal', href: '/parent', icon: LayoutDashboard },
  { name: 'Invoices', href: '/invoices', icon: FilePlus2 },
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

  const activeName =
    items.find(
      (n) => location.pathname === n.href || (n.href !== '/' && location.pathname.startsWith(n.href))
    )?.name || (isParent ? 'My Portal' : 'Dashboard');

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col bg-[#131d3c] text-white transition-transform duration-200 ease-in-out lg:static lg:z-auto lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Decorative glow */}
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(560px_200px_at_50%_-30px,rgba(212,175,55,0.14),transparent)]" />

        {/* Brand */}
        <div className="relative flex h-20 items-center justify-between border-b border-white/10 px-6">
          <div className="flex items-center gap-3">
            <BrandMark className="h-10 w-10 text-lg" />
            <div>
              <h1 className="font-display text-base font-bold leading-tight tracking-tight text-white">
                Lambton Christian School
              </h1>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-accent-300/90">
                Finance Portal
              </p>
            </div>
          </div>
          <button
            className="rounded-lg p-1.5 text-slate-300 transition-colors hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="relative flex-1 space-y-1 overflow-y-auto px-4 py-5">
          {items.map((item) => {
            const isActive =
              location.pathname === item.href ||
              (item.href !== '/' && location.pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                to={item.href}
                onClick={() => setSidebarOpen(false)}
                className={clsx(
                  'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'bg-white/10 text-white'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                )}
              >
                {isActive && (
                  <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent-400" />
                )}
                <item.icon
                  className={clsx(
                    'h-5 w-5 flex-shrink-0 transition-colors',
                    isActive ? 'text-accent-300' : 'text-slate-400 group-hover:text-slate-200'
                  )}
                />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* User */}
        <div className="relative border-t border-white/10 p-4">
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-300 to-accent-600 text-sm font-bold text-[#131d3c] ring-2 ring-white/20">
                {user?.full_name?.charAt(0) || '?'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{user?.full_name}</p>
                <p className="text-xs capitalize text-slate-400">{user?.role}</p>
              </div>
              <button
                onClick={logout}
                title="Logout"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 items-center gap-4 border-b border-slate-200 bg-white/80 px-6 backdrop-blur">
          <button
            className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <h2 className="text-lg font-semibold tracking-tight text-slate-900">{activeName}</h2>
          {!isParent && (
            <div className="ml-auto flex items-center gap-3">
              <NotificationsBell />
              <div className="hidden items-center gap-2 text-sm text-slate-500 sm:flex">
                <CalendarDays className="h-4 w-4 text-slate-400" />
                <span className="font-medium text-slate-600">
                  {new Date().toLocaleDateString(undefined, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}
                </span>
              </div>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

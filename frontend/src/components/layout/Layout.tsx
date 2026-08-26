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
  Coins,
  Settings,
  UserPlus,
  FilePlus2,
  CalendarDays,
  UserRound,
  ShieldCheck,
  Bell,
  Percent,
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
  { name: 'Additional Charges', href: '/charges', icon: Coins, roles: ['admin', 'finance'] },
  { name: 'Discounts', href: '/discounts', icon: Percent, roles: ['admin', 'finance'] },
  { name: 'Payments', href: '/payments', icon: Wallet, roles: ['admin', 'finance'] },
  { name: 'Receipts', href: '/receipts', icon: Receipt, roles: ['admin', 'finance', 'parent'] },
  { name: 'Statements', href: '/statements', icon: FileText, roles: ['admin', 'finance', 'parent'] },
  { name: 'Invoices', href: '/invoices', icon: FilePlus2, roles: ['admin', 'finance', 'parent'] },
  { name: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin', 'finance'] },
  { name: 'Send Notification', href: '/send-notification', icon: Bell, roles: ['admin'] },
  { name: 'Notification History', href: '/notification-history', icon: Bell, roles: ['admin', 'finance'] },
  { name: 'Staff Accounts', href: '/accounts', icon: ShieldCheck, roles: ['super_admin'] },
  { name: 'Settings', href: '/settings', icon: Settings, roles: ['super_admin'] },
];

const parentNavigation = [
  { name: 'My Portal', href: '/parent', icon: LayoutDashboard },
  { name: 'Invoices', href: '/invoices', icon: FilePlus2 },
  { name: 'Receipts', href: '/receipts', icon: Receipt },
  { name: 'Statements', href: '/statements', icon: FileText },
  { name: 'Notifications', href: '/notification-history', icon: Bell },
  { name: 'Profile', href: '/profile', icon: UserRound },
];

const profileNavItem = { name: 'Profile', href: '/profile', icon: UserRound };

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isParent = user?.role === 'parent';
  const items = isParent
    ? parentNavigation
    : [...navigation.filter(
        (item) =>
          item.roles.includes(user?.role || '') ||
          (user?.role === 'super_admin' && item.roles.includes('admin'))
      ), profileNavItem];

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
    'fixed inset-y-0 left-0 z-50 flex w-72 transform flex-col bg-[#131d3c] text-white shadow-2xl transition-transform duration-300 ease-in-out lg:static lg:z-auto lg:translate-x-0 lg:shadow-none',
    sidebarOpen ? 'translate-x-0' : '-translate-x-full'
  )}
>
  {/* Decorative glow */}
  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(560px_240px_at_50%_-30px,rgba(212,175,55,0.16),transparent)]" />
  <div className="pointer-events-none absolute inset-y-0 right-0 w-px bg-gradient-to-b from-transparent via-white/10 to-transparent" />

  {/* Brand */}
  <div className="relative flex h-20 items-center justify-between border-b border-white/10 px-6">
    <div className="flex items-center gap-3">
      <BrandMark className="h-10 w-10 text-lg shadow-lg shadow-black/20 ring-1 ring-white/10" />
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
      className="rounded-lg p-1.5 text-slate-300 transition-colors duration-150 hover:bg-white/10 hover:text-white lg:hidden"
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
            'group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all duration-200',
            isActive
              ? 'bg-gradient-to-r from-white/12 to-white/[0.03] text-white shadow-inner shadow-black/10'
              : 'text-slate-300 hover:bg-white/5 hover:text-white hover:translate-x-0.5'
          )}
        >
          {isActive && (
            <span className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-accent-400 shadow-[0_0_8px_rgba(212,175,55,0.6)]" />
          )}
          <item.icon
            className={clsx(
              'h-5 w-5 flex-shrink-0 transition-colors duration-200',
              isActive ? 'text-accent-300' : 'text-slate-400 group-hover:text-slate-200'
            )}
          />
          <span className="truncate">{item.name}</span>
          {isActive && (
            <span className="ml-auto h-1.5 w-1.5 rounded-full bg-accent-300" />
          )}
        </Link>
      );
    })}
  </nav>

  {/* User */}
  <div className="relative border-t border-white/10 p-4">
    <div className="rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur-sm transition-colors duration-200 hover:bg-white/[0.07]">
      <div className="flex items-center gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-accent-300 to-accent-600 text-sm font-bold text-[#131d3c] ring-2 ring-white/20 shadow-lg shadow-black/20">
          {user?.full_name?.charAt(0) || '?'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-white">{user?.full_name}</p>
          <p className="text-xs capitalize text-slate-400">{user?.role}</p>
        </div>
        <button
          onClick={logout}
          title="Logout"
          className="rounded-lg p-1.5 text-slate-400 transition-colors duration-150 hover:bg-white/10 hover:text-white"
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
          <div className="ml-auto flex items-center gap-3">
            <NotificationsBell />
            {!isParent && (
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
            )}
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 lg:p-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

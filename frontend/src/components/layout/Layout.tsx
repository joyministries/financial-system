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
} from 'lucide-react';
import { useState } from 'react';
import clsx from 'clsx';
import BrandMark from '@/components/Brand';
import NotificationsBell from '@/components/notifications/NotificationsBell';

const navigationGroups = [
  {
    label: 'Overview',
    items: [
      { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['admin', 'finance'] },
      { name: 'Reports', href: '/reports', icon: BarChart3, roles: ['admin', 'finance'] },
    ],
  },
  {
    label: 'Records',
    items: [
      { name: 'Registrations', href: '/registrations', icon: UserPlus, roles: ['admin'] },
      { name: 'Students', href: '/students', icon: Users, roles: ['admin', 'finance'] },
      { name: 'Grades', href: '/grades', icon: GraduationCap, roles: ['admin', 'finance'] },
    ],
  },
  {
    label: 'Finance',
    items: [
      { name: 'Fees', href: '/fees', icon: CreditCard, roles: ['admin', 'finance'] },
      { name: 'Additional Charges', href: '/charges', icon: Coins, roles: ['admin', 'finance'] },
      { name: 'Payments', href: '/payments', icon: Wallet, roles: ['admin', 'finance'] },
      { name: 'Receipts', href: '/receipts', icon: Receipt, roles: ['admin', 'finance', 'parent'] },
      { name: 'Statements', href: '/statements', icon: FileText, roles: ['admin', 'finance', 'parent'] },
      { name: 'Invoices', href: '/invoices', icon: FilePlus2, roles: ['admin', 'finance', 'parent'] },
    ],
  },
  {
    label: 'System',
    items: [
      { name: 'Settings', href: '/settings', icon: Settings, roles: ['super_admin'] },
    ],
  },
];

const parentNavigation = [
  { name: 'My Portal', href: '/parent', icon: LayoutDashboard },
  { name: 'Invoices', href: '/invoices', icon: FilePlus2 },
  { name: 'Receipts', href: '/receipts', icon: Receipt },
  { name: 'Statements', href: '/statements', icon: FileText },
  { name: 'Profile', href: '/profile', icon: UserRound },
];

const profileNavItem = { name: 'Profile', href: '/profile', icon: UserRound };

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const isParent = user?.role === 'parent';
  const groups = isParent
    ? [{ label: 'Portal', items: parentNavigation }]
    : navigationGroups.map((group) => ({
        ...group,
        items: group.items.filter(
          (item) =>
            item.roles.includes(user?.role || '') ||
            (user?.role === 'super_admin' && item.roles.includes('admin'))
        ),
      })).filter((group) => group.items.length > 0);
  const items = [...groups.flatMap((group) => group.items), profileNavItem];

  const activeName =
    items.find(
      (n) => location.pathname === n.href || (n.href !== '/' && location.pathname.startsWith(n.href))
    )?.name || (isParent ? 'My Portal' : 'Dashboard');

  return (
    <div className="flex h-screen overflow-hidden bg-ledger-bg text-ledger-ink">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-ledger-ink/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex transform flex-col border-r border-ledger-border bg-ledger-surface text-ledger-ink transition-all duration-150 ease-in-out lg:static lg:z-auto lg:translate-x-0', collapsed ? 'w-16' : 'w-60',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand */}
        <div className="relative flex h-14 items-center justify-between border-b border-ledger-border px-3">
          <div className="flex items-center gap-3">
            <BrandMark className="h-9 w-9 text-base" />
            <div className={clsx('min-w-0', collapsed && 'hidden')}>
              <h1 className="font-display text-base font-bold leading-tight tracking-tight text-ledger-ink">
                Lambton Christian School
              </h1>
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ledger-muted">
                Finance Portal
              </p>
            </div>
          </div>
          <button
            className="rounded-lg p-1.5 text-ledger-muted transition-colors hover:bg-ledger-row-hover hover:text-ledger-ink lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="relative flex-1 overflow-y-auto px-2 py-4">
          {groups.map((group) => (
            <div key={group.label} className="mb-5 last:mb-0">
              {!collapsed && (
                <p className="mb-2 px-3 text-[11px] font-medium uppercase text-ledger-muted">
                  {group.label}
                </p>
              )}
              <div className="space-y-1">
                {group.items.map((item) => {
                  const isActive =
                    location.pathname === item.href ||
                    (item.href !== '/' && location.pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      title={collapsed ? item.name : undefined}
                      className={clsx(
                        'group relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors duration-150',
                        collapsed && 'justify-center px-0',
                        isActive
                          ? 'bg-ledger-bg text-primary-600'
                          : 'text-ledger-muted hover:bg-ledger-row-hover hover:text-ledger-ink'
                      )}
                    >
                      {isActive && (
                        <span className="absolute left-0 top-1/2 h-6 w-0.5 -translate-y-1/2 bg-primary-600" />
                      )}
                      <item.icon className={clsx('h-4 w-4 flex-shrink-0', isActive ? 'text-primary-600' : 'text-ledger-muted')} />
                      {!collapsed && <span className="truncate">{item.name}</span>}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* User */}
        <div className="relative border-t border-ledger-border p-2">
          <div className={clsx('flex items-center gap-2 rounded-lg p-2', collapsed && 'justify-center')}>
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-ledger-border bg-ledger-bg text-sm font-semibold text-ledger-ink">
              {user?.full_name?.charAt(0) || '?'}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ledger-ink">{user?.full_name}</p>
                  <p className="text-xs capitalize text-ledger-muted">{user?.role}</p>
                </div>
                <button
                  onClick={logout}
                  title="Logout"
                  className="rounded-lg p-1.5 text-ledger-muted transition-colors hover:bg-ledger-row-hover hover:text-ledger-ink"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-4 border-b border-ledger-border bg-ledger-bg px-6">
          <button
            className="rounded-lg p-2 text-ledger-muted transition-colors hover:bg-ledger-row-hover lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            className="hidden rounded-lg p-2 text-ledger-muted transition-colors hover:bg-ledger-row-hover hover:text-ledger-ink lg:inline-flex"
            onClick={() => setCollapsed((v) => !v)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu className="h-4 w-4" />
          </button>
          <h2 className="font-display text-lg font-semibold tracking-normal text-ledger-ink">{activeName}</h2>
          {!isParent && (
            <div className="ml-auto flex items-center gap-3">
              <NotificationsBell />
              <div className="hidden items-center gap-2 text-sm text-ledger-muted sm:flex">
                <CalendarDays className="h-4 w-4 text-ledger-muted" />
                <span className="font-medium text-ledger-muted">
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

        <main className="flex-1 overflow-y-auto p-6">
          <div className="mx-auto w-full max-w-[1600px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

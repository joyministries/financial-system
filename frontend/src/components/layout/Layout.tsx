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
  Calculator,
  Coins,
  Settings,
  UserPlus,
  FilePlus2,
  CalendarDays,
  UserRound,
  ShieldCheck,
  Bell,
  Percent,
  FileMinus2,
  Trash2,
} from 'lucide-react';
import { useState, type ComponentType } from 'react';
import clsx from 'clsx';
import BrandMark from '@/components/Brand';
import NotificationsBell from '@/components/notifications/NotificationsBell';

type NavItem = {
  name: string;
  href: string;
  icon: ComponentType<{ className?: string }>;
  group: string;
  roles?: string[];
};

const navGroups = ['Overview', 'Students', 'Money', 'Documents', 'Administration'] as const;

const navigation: NavItem[] = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard, group: 'Overview', roles: ['admin', 'finance'] },

  { name: 'Registrations', href: '/registrations', icon: UserPlus, group: 'Students', roles: ['admin'] },
  { name: 'Students', href: '/students', icon: Users, group: 'Students', roles: ['admin', 'finance'] },
  { name: 'Grades', href: '/grades', icon: GraduationCap, group: 'Students', roles: ['admin', 'finance'] },
  { name: 'Grade Fees', href: '/grade-fees', icon: Calculator, group: 'Students', roles: ['admin', 'finance'] },

  { name: 'Fees', href: '/fees', icon: CreditCard, group: 'Money', roles: ['admin', 'finance'] },
  { name: 'Payments', href: '/payments', icon: Wallet, group: 'Money', roles: ['admin', 'finance'] },
  { name: 'Receipts', href: '/receipts', icon: Receipt, group: 'Money', roles: ['admin', 'finance', 'parent'] },
  { name: 'Additional Charges', href: '/charges', icon: Coins, group: 'Money', roles: ['admin', 'finance'] },
  { name: 'Credit Notes', href: '/credit-notes', icon: FileMinus2, group: 'Money', roles: ['admin', 'finance'] },
  { name: 'Discounts', href: '/discounts', icon: Percent, group: 'Money', roles: ['admin', 'finance'] },

  { name: 'Statements', href: '/statements', icon: FileText, group: 'Documents', roles: ['admin', 'finance', 'parent'] },
  { name: 'Invoices', href: '/invoices', icon: FilePlus2, group: 'Documents', roles: ['admin', 'finance', 'parent'] },
  { name: 'Reports', href: '/reports', icon: BarChart3, group: 'Documents', roles: ['admin', 'finance'] },

  { name: 'Send Notification', href: '/send-notification', icon: Bell, group: 'Administration', roles: ['admin'] },
  { name: 'Notification History', href: '/notification-history', icon: Bell, group: 'Administration', roles: ['admin', 'finance'] },
  { name: 'Staff Accounts', href: '/accounts', icon: ShieldCheck, group: 'Administration', roles: ['super_admin'] },
  { name: 'Deletion Requests', href: '/deletion-requests', icon: Trash2, group: 'Administration', roles: ['admin'] },
  { name: 'Settings', href: '/settings', icon: Settings, group: 'Administration', roles: ['super_admin'] },
];

const parentNavigation: NavItem[] = [
  { name: 'My Portal', href: '/parent', icon: LayoutDashboard, group: 'Overview' },
  { name: 'Invoices', href: '/invoices', icon: FilePlus2, group: 'Documents' },
  { name: 'Receipts', href: '/receipts', icon: Receipt, group: 'Documents' },
  { name: 'Statements', href: '/statements', icon: FileText, group: 'Documents' },
  { name: 'Notifications', href: '/notification-history', icon: Bell, group: 'Account' },
  { name: 'Profile', href: '/profile', icon: UserRound, group: 'Account' },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const isParent = user?.role === 'parent';

  const items: NavItem[] = isParent
    ? parentNavigation
    : [
        ...navigation.filter(
          (item) =>
            (item.roles ?? []).includes(user?.role || '') ||
            (user?.role === 'super_admin' && (item.roles ?? []).includes('admin'))
        ),
        { name: 'Profile', href: '/profile', icon: UserRound, group: 'Account' },
      ];

  const groups = isParent
    ? (['Overview', 'Documents', 'Account'] as const)
    : ([...navGroups, 'Account'] as const);

  const activeName =
    items.find(
      (n) => location.pathname === n.href || (n.href !== '/' && location.pathname.startsWith(n.href))
    )?.name || (isParent ? 'My Portal' : 'Dashboard');

  const today = new Date().toLocaleDateString('en-ZA', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const initials = (user?.full_name || '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');

  return (
    <div className="flex h-screen overflow-hidden bg-paper">
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-primary-950/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Rail ─────────────────────────────────────────────── */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex w-[252px] flex-col bg-primary-900 text-white transition-transform duration-300 ease-in-out lg:static lg:z-auto lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-2.5 px-4 py-4">
          <BrandMark className="h-[34px] w-[34px] text-[17px]" />
          <div className="min-w-0">
            <p className="truncate text-[13.5px] font-bold leading-tight tracking-[0.005em] text-white">
              Lambton Christian
            </p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.18em] text-accent-400">
              Finance
            </p>
          </div>
          <button
            className="ml-auto rounded-md p-1.5 text-white/50 hover:bg-white/10 hover:text-white lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="nav-fade flex-1 overflow-y-auto px-2.5 pb-4">
          {groups.map((group) => {
            const groupItems = items.filter((i) => i.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group}>
                <p className="px-2.5 pb-1.5 pt-4 font-mono text-[9px] font-medium uppercase tracking-[0.18em] text-white/[0.34]">
                  {group}
                </p>
                {groupItems.map((item) => {
                  const isActive =
                    location.pathname === item.href ||
                    (item.href !== '/' && location.pathname.startsWith(item.href));
                  return (
                    <Link
                      key={item.name}
                      to={item.href}
                      onClick={() => setSidebarOpen(false)}
                      aria-current={isActive ? 'page' : undefined}
                      className={clsx(
                        'relative flex items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-[13px] transition-colors',
                        isActive
                          ? 'bg-white/[0.075] font-semibold text-white'
                          : 'font-medium text-white/[0.74] hover:bg-white/[0.055] hover:text-white'
                      )}
                    >
                      {isActive && (
                        <span className="absolute -left-2.5 top-[7px] bottom-[7px] w-[2.5px] rounded-r-[3px] bg-accent-500" />
                      )}
                      <item.icon
                        className={clsx(
                          'h-4 w-4 flex-shrink-0',
                          isActive ? 'text-white' : 'text-white/70'
                        )}
                      />
                      <span className="truncate">{item.name}</span>
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>

        {/* User */}
        <div className="flex items-center gap-2.5 border-t border-white/10 px-3.5 py-3">
          <div className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-full bg-white/[0.12] text-[11px] font-bold text-white">
            {initials || '?'}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[12.5px] font-semibold leading-tight text-white">
              {user?.full_name}
            </p>
            <p className="mt-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-white/45">
              {user?.role?.replace('_', ' ')}
            </p>
          </div>
          <button
            onClick={logout}
            title="Sign out"
            aria-label="Sign out"
            className="rounded-md p-1.5 text-white/55 transition-colors hover:bg-white/10 hover:text-white"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </aside>

      {/* ── Main ─────────────────────────────────────────────── */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[58px] flex-shrink-0 items-center gap-3 border-b border-line bg-paper/90 px-4 backdrop-blur sm:px-6">
          <button
            className="rounded-md p-1.5 text-body transition-colors hover:bg-[#f3efe6] lg:hidden"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="flex min-w-0 items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-muted">
              <span className="font-semibold text-ink">{activeName}</span>
              <span className="mx-1.5 text-line">/</span>
              {new Date().toLocaleDateString('en-ZA', { month: 'long', year: 'numeric' })}
            </span>
          </div>

          <div className="ml-auto flex items-center gap-2">
            <div className="hidden items-center gap-2 text-muted sm:flex">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="font-mono text-[9.5px] uppercase tracking-[0.12em]">{today}</span>
            </div>
            <span className="hidden h-5 w-px bg-line sm:block" />
            <NotificationsBell />
            <div
              className="hidden h-[34px] items-center gap-2 rounded-lg border border-line bg-white px-2.5 sm:flex"
              title={user?.full_name}
            >
              <span className="font-mono text-[10.5px] font-semibold text-ink">{initials || '?'}</span>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1320px] px-4 py-5 sm:px-6 sm:py-6 lg:px-7">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

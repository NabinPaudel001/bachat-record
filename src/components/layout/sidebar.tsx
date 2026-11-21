'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Users,
  CreditCard,
  Grid3X3,
  Clock,
  Banknote,
  AlertTriangle,
  TrendingUp,
  Package,
  BookOpen,
  Receipt,
  Calculator,
  PieChart,
  FileText,
  Settings,
  UserCog,
  ScrollText,
  Menu,
  X,
} from 'lucide-react';
import { useState } from 'react';

export interface NavItem {
  title: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  adminOnly?: boolean;
}

export const navItems: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { title: 'Members', href: '/members', icon: Users },
  { title: 'Record Payment', href: '/payments', icon: CreditCard },
  { title: 'Contribution Register', href: '/register', icon: Grid3X3 },
  { title: 'Pending Center', href: '/pending', icon: Clock },
  { title: 'Loans', href: '/loans', icon: Banknote },
  { title: 'Fines', href: '/fines', icon: AlertTriangle },
  { title: 'Investments', href: '/investments', icon: TrendingUp },
  { title: 'Other Assets', href: '/assets', icon: Package },
  { title: 'Ledger', href: '/ledger', icon: BookOpen },
  { title: 'Expenses & Income', href: '/expenses', icon: Receipt },
  { title: 'Calculators', href: '/calculators', icon: Calculator },
  { title: 'Distributions', href: '/distributions', icon: PieChart },
  { title: 'Reports', href: '/reports', icon: FileText },
  { title: 'Settings', href: '/settings', icon: Settings, adminOnly: true },
  { title: 'Users', href: '/users', icon: UserCog, adminOnly: true },
  { title: 'Audit Log', href: '/audit', icon: ScrollText, adminOnly: true },
];

export function Sidebar({ userRole }: { userRole?: string }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const filteredItems = navItems.filter((item) => {
    if (item.adminOnly && userRole !== 'ADMIN') return false;
    return true;
  });

  return (
    <>
      {/* Mobile Top Bar with Hamburger */}
      <div className="md:hidden flex items-center justify-between p-4 border-b bg-card">
        <Link href="/dashboard" className="font-bold text-lg text-primary">
          Bachat Record
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 rounded-md hover:bg-muted"
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
      </div>

      {/* Backdrop for mobile */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar navigation */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-64 border-r bg-card flex flex-col transition-transform duration-200 md:static md:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="p-4 border-b hidden md:block">
          <Link href="/dashboard" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm">
              BR
            </div>
            <div>
              <div className="font-bold text-base leading-tight">Bachat Record</div>
              <div className="text-xs text-muted-foreground">Group Savings & Loan</div>
            </div>
          </Link>
        </div>

        <nav className="flex-1 overflow-y-auto p-3 space-y-1">
          {filteredItems.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.title}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t text-xs text-muted-foreground">
          <p>Bikram Sambat: UTC+5:45</p>
          <p>Nepali Group Accounting</p>
        </div>
      </aside>
    </>
  );
}

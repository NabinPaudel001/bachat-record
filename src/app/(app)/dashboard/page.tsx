import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { prisma } from '@/server/db';
import { formatNPR } from '@/lib/format';
import { todayBS } from '@/server/engines/bs';
import Link from 'next/link';
import Decimal from 'decimal.js';
import {
  Wallet,
  TrendingUp,
  Banknote,
  PiggyBank,
  ShieldAlert,
  Clock,
  ArrowRight,
  Users,
} from 'lucide-react';

export const runtime = 'nodejs';

export default async function DashboardPage() {
  const bsToday = todayBS();

  // Aggregate numbers from DB safely
  let totalDeposited = new Decimal(0);
  let totalInvested = new Decimal(0);
  let totalLoansOut = new Decimal(0);
  let pendingFines = new Decimal(0);
  let pendingContributions = new Decimal(0);
  let activeMembersCount = 0;

  try {
    const members = await prisma.member.findMany({
      where: { status: 'ACTIVE' },
      select: { id: true },
    });
    activeMembersCount = members.length;

    // Member deposits from paid contributions
    const paidContributions = await prisma.contributionDue.aggregate({
      _sum: { paidAmount: true },
    });
    if (paidContributions._sum.paidAmount) {
      totalDeposited = new Decimal(paidContributions._sum.paidAmount.toString());
    }

    // Pending contributions
    const pendingDues = await prisma.contributionDue.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL'] } },
      select: { amount: true, paidAmount: true },
    });
    for (const d of pendingDues) {
      pendingContributions = pendingContributions.plus(
        new Decimal(d.amount.toString()).minus(new Decimal(d.paidAmount.toString()))
      );
    }

    // Pending fines
    const fines = await prisma.fine.findMany({
      where: { status: { in: ['PENDING', 'PARTIAL'] } },
      select: { amount: true, paidAmount: true, waivedAmount: true },
    });
    for (const f of fines) {
      pendingFines = pendingFines.plus(
        new Decimal(f.amount.toString())
          .minus(new Decimal(f.paidAmount.toString()))
          .minus(new Decimal(f.waivedAmount.toString()))
      );
    }

    // Loans out
    const loans = await prisma.loan.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { principalOutstanding: true },
    });
    if (loans._sum.principalOutstanding) {
      totalLoansOut = new Decimal(loans._sum.principalOutstanding.toString());
    }

    // Active investments
    const investments = await prisma.investment.aggregate({
      where: { status: 'ACTIVE' },
      _sum: { currentValue: true },
    });
    if (investments._sum.currentValue) {
      totalInvested = new Decimal(investments._sum.currentValue.toString());
    }
  } catch (err) {
    console.error('Error fetching dashboard metrics:', err);
  }

  // Estimated cash on hand = deposits - loans - investments (simplified or from account 1000)
  const cashOnHand = Decimal.max(0, totalDeposited.minus(totalLoansOut).minus(totalInvested));

  const stats = [
    {
      title: 'Total Deposited',
      value: formatNPR(totalDeposited),
      icon: Wallet,
      desc: 'Sum of member savings',
      color: 'text-blue-600',
      href: '/register',
    },
    {
      title: 'Investments',
      value: formatNPR(totalInvested),
      icon: TrendingUp,
      desc: 'Gold, Land, Stocks',
      color: 'text-emerald-600',
      href: '/investments',
    },
    {
      title: 'Loans Outstanding',
      value: formatNPR(totalLoansOut),
      icon: Banknote,
      desc: 'Principal with members',
      color: 'text-amber-600',
      href: '/loans',
    },
    {
      title: 'Estimated Cash on Hand',
      value: formatNPR(cashOnHand),
      icon: PiggyBank,
      desc: 'Available liquid fund',
      color: 'text-indigo-600',
      href: '/ledger',
    },
    {
      title: 'Pending Contributions',
      value: formatNPR(pendingContributions),
      icon: Clock,
      desc: 'Unpaid monthly dues',
      color: 'text-rose-600',
      href: '/pending',
    },
    {
      title: 'Pending Fines',
      value: formatNPR(pendingFines),
      icon: ShieldAlert,
      desc: 'Uncollected penalties',
      color: 'text-orange-600',
      href: '/fines',
    },
    {
      title: 'Active Members',
      value: `${activeMembersCount}`,
      icon: Users,
      desc: 'Active saving members',
      color: 'text-purple-600',
      href: '/members',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">
            Overview for {bsToday.year} BS, Month {bsToday.month}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/payments"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 shadow-sm"
          >
            Record Payment
          </Link>
          <Link
            href="/loans"
            className="inline-flex items-center justify-center rounded-md text-sm font-medium border border-input bg-background px-4 py-2 hover:bg-accent hover:text-accent-foreground shadow-sm"
          >
            New Loan
          </Link>
        </div>
      </div>

      {/* Grid of Key Performance Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {stat.title}
                </CardTitle>
                <Icon className={`h-4 w-4 ${stat.color}`} />
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold tracking-tight">{stat.value}</div>
                <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                  <span>{stat.desc}</span>
                  <Link href={stat.href} className="inline-flex items-center hover:text-primary">
                    <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Action Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Monthly Collection Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Month {bsToday.month} collection is in progress. Check the Contribution Register for full member grid.
            </p>
            <div className="flex gap-3">
              <Link
                href="/register"
                className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1"
              >
                Open Contribution Register <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href="/pending"
                className="text-sm text-muted-foreground hover:underline font-medium inline-flex items-center gap-1"
              >
                View Pending Dues <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Group Health & Books</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Double-entry books are active. Interest accrues daily on actual savings balances.
            </p>
            <div className="flex gap-3">
              <Link
                href="/reports"
                className="text-sm text-primary hover:underline font-medium inline-flex items-center gap-1"
              >
                Financial Reports <ArrowRight className="h-3 w-3" />
              </Link>
              <Link
                href="/calculators"
                className="text-sm text-muted-foreground hover:underline font-medium inline-flex items-center gap-1"
              >
                Interest & Bonus Calculator <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

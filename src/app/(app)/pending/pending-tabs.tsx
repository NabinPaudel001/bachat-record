'use client';

import { useState } from 'react';
import { formatNPR, bsMonthName } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';

/* ───── Types ───── */
interface MemberRef {
  id: string;
  memberNo: string;
  fullName: string;
  phone: string;
}

export interface PendingLevyRow {
  id: string;
  bsYear: number;
  bsMonth: number;
  amount: string;
  paidAmount: string;
  status: string;
  member: MemberRef;
}

export interface PendingFineRow {
  id: string;
  type: string;
  amount: string;
  paidAmount: string;
  waivedAmount: string;
  postedOn: string;
  status: string;
  member: MemberRef;
}

export interface PendingInterestRow {
  id: string;
  loanId: string;
  loanNo: string;
  bsYear: number;
  bsMonth: number;
  accrued: string;
  paid: string;
  capitalised: string;
  memberFullName: string;
  memberNo: string;
  memberId: string;
  memberPhone: string;
}

type TabKey = 'levy' | 'levyFine' | 'loanInterest' | 'loanFine';

/* ───── Helpers ───── */
function groupByMember<T extends { member?: MemberRef; memberId?: string; memberFullName?: string; memberNo?: string; memberPhone?: string }>(
  items: T[],
  getMember: (item: T) => MemberRef
): Map<string, { member: MemberRef; items: T[] }> {
  const map = new Map<string, { member: MemberRef; items: T[] }>();
  for (const item of items) {
    const m = getMember(item);
    if (!map.has(m.id)) {
      map.set(m.id, { member: m, items: [] });
    }
    map.get(m.id)!.items.push(item);
  }
  return map;
}

function owed(amount: string, paid: string, waived = '0'): number {
  return Math.max(0, parseFloat(amount) - parseFloat(paid) - parseFloat(waived));
}

/* ───── Components ───── */

function MemberAccordion({
  member,
  totalOwed,
  count,
  children,
  expandedId,
  onToggle,
}: {
  member: MemberRef;
  totalOwed: number;
  count: number;
  children: React.ReactNode;
  expandedId: string | null;
  onToggle: (id: string) => void;
}) {
  const isOpen = expandedId === member.id;
  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(member.id)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/30 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary">
            {member.fullName.charAt(0)}
          </div>
          <div>
            <span className="font-semibold text-sm">{member.fullName}</span>
            <span className="text-xs text-muted-foreground ml-2">({member.memberNo})</span>
            <span className="block text-xs text-muted-foreground">{member.phone}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-sm font-bold font-mono text-rose-600">
              {formatNPR(totalOwed.toFixed(2))}
            </div>
            <div className="text-[10px] text-muted-foreground">{count} items</div>
          </div>
          <svg
            className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {isOpen && <div className="border-t">{children}</div>}
    </div>
  );
}

/* ===== Pending Monthly Levy Tab ===== */
function PendingLevyTab({ rows }: { rows: PendingLevyRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id));
  const grouped = groupByMember(rows, (r) => r.member);

  if (grouped.size === 0) {
    return <p className="text-center text-muted-foreground py-8">No pending monthly levy</p>;
  }

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([memberId, { member, items }]) => {
        const total = items.reduce((s, d) => s + owed(d.amount, d.paidAmount), 0);
        return (
          <MemberAccordion
            key={memberId}
            member={member}
            totalOwed={total}
            count={items.length}
            expandedId={expanded}
            onToggle={toggle}
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="p-3">BS Month</th>
                  <th className="p-3 text-right">Due</th>
                  <th className="p-3 text-right">Paid</th>
                  <th className="p-3 text-right">Owed</th>
                  <th className="p-3 text-center">Status</th>
                  <th className="p-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((d) => (
                  <tr key={d.id} className="hover:bg-muted/20">
                    <td className="p-3">{d.bsYear} {bsMonthName(d.bsMonth)}</td>
                    <td className="p-3 text-right font-mono">{formatNPR(d.amount)}</td>
                    <td className="p-3 text-right font-mono text-muted-foreground">{formatNPR(d.paidAmount)}</td>
                    <td className="p-3 text-right font-mono font-bold text-rose-600">
                      {formatNPR(owed(d.amount, d.paidAmount).toFixed(2))}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="destructive" className="text-[10px]">{d.status}</Badge>
                    </td>
                    <td className="p-3 text-right">
                      <Link href={`/payments?memberId=${member.id}`} className="text-xs font-semibold text-primary hover:underline">
                        Collect →
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </MemberAccordion>
        );
      })}
    </div>
  );
}

/* ===== Pending Levy Fine Tab ===== */
function PendingLevyFineTab({ rows }: { rows: PendingFineRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id));
  const grouped = groupByMember(rows, (r) => r.member);

  if (grouped.size === 0) {
    return <p className="text-center text-muted-foreground py-8">No pending levy fines</p>;
  }

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([memberId, { member, items }]) => {
        const total = items.reduce((s, f) => s + owed(f.amount, f.paidAmount, f.waivedAmount), 0);
        return (
          <MemberAccordion
            key={memberId}
            member={member}
            totalOwed={total}
            count={items.length}
            expandedId={expanded}
            onToggle={toggle}
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="p-3">Posted Date</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-right">Paid</th>
                  <th className="p-3 text-right">Owed</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((f) => (
                  <tr key={f.id} className="hover:bg-muted/20">
                    <td className="p-3 text-muted-foreground">{f.postedOn}</td>
                    <td className="p-3 text-right font-mono">{formatNPR(f.amount)}</td>
                    <td className="p-3 text-right font-mono text-muted-foreground">{formatNPR(f.paidAmount)}</td>
                    <td className="p-3 text-right font-mono font-bold text-orange-600">
                      {formatNPR(owed(f.amount, f.paidAmount, f.waivedAmount).toFixed(2))}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="destructive" className="text-[10px]">{f.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </MemberAccordion>
        );
      })}
    </div>
  );
}

/* ===== Pending Loan Interest Tab ===== */
function PendingLoanInterestTab({ rows }: { rows: PendingInterestRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id));
  const grouped = groupByMember(
    rows,
    (r) => ({ id: r.memberId, memberNo: r.memberNo, fullName: r.memberFullName, phone: r.memberPhone })
  );

  if (grouped.size === 0) {
    return <p className="text-center text-muted-foreground py-8">No pending loan interest</p>;
  }

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([memberId, { member, items }]) => {
        const total = items.reduce(
          (s, p) => s + Math.max(0, parseFloat(p.accrued) - parseFloat(p.paid) - parseFloat(p.capitalised)),
          0
        );
        return (
          <MemberAccordion
            key={memberId}
            member={member}
            totalOwed={total}
            count={items.length}
            expandedId={expanded}
            onToggle={toggle}
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="p-3">Loan</th>
                  <th className="p-3">BS Month</th>
                  <th className="p-3 text-right">Accrued</th>
                  <th className="p-3 text-right">Paid</th>
                  <th className="p-3 text-right">Owed</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((p) => {
                  const owedAmt = Math.max(0, parseFloat(p.accrued) - parseFloat(p.paid) - parseFloat(p.capitalised));
                  return (
                    <tr key={p.id} className="hover:bg-muted/20">
                      <td className="p-3 text-xs font-medium">{p.loanNo}</td>
                      <td className="p-3">{p.bsYear} {bsMonthName(p.bsMonth)}</td>
                      <td className="p-3 text-right font-mono">{formatNPR(p.accrued)}</td>
                      <td className="p-3 text-right font-mono text-muted-foreground">{formatNPR(p.paid)}</td>
                      <td className="p-3 text-right font-mono font-bold text-purple-600">
                        {formatNPR(owedAmt.toFixed(2))}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </MemberAccordion>
        );
      })}
    </div>
  );
}

/* ===== Pending Loan Fine Tab ===== */
function PendingLoanFineTab({ rows }: { rows: PendingFineRow[] }) {
  const [expanded, setExpanded] = useState<string | null>(null);
  const toggle = (id: string) => setExpanded((prev) => (prev === id ? null : id));
  const grouped = groupByMember(rows, (r) => r.member);

  if (grouped.size === 0) {
    return <p className="text-center text-muted-foreground py-8">No pending loan fines</p>;
  }

  return (
    <div className="space-y-3">
      {Array.from(grouped.entries()).map(([memberId, { member, items }]) => {
        const total = items.reduce((s, f) => s + owed(f.amount, f.paidAmount, f.waivedAmount), 0);
        return (
          <MemberAccordion
            key={memberId}
            member={member}
            totalOwed={total}
            count={items.length}
            expandedId={expanded}
            onToggle={toggle}
          >
            <table className="w-full text-sm">
              <thead className="bg-muted/40 border-b text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="p-3">Posted Date</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3 text-right">Paid</th>
                  <th className="p-3 text-right">Owed</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {items.map((f) => (
                  <tr key={f.id} className="hover:bg-muted/20">
                    <td className="p-3 text-muted-foreground">{f.postedOn}</td>
                    <td className="p-3 text-right font-mono">{formatNPR(f.amount)}</td>
                    <td className="p-3 text-right font-mono text-muted-foreground">{formatNPR(f.paidAmount)}</td>
                    <td className="p-3 text-right font-mono font-bold text-red-600">
                      {formatNPR(owed(f.amount, f.paidAmount, f.waivedAmount).toFixed(2))}
                    </td>
                    <td className="p-3 text-center">
                      <Badge variant="destructive" className="text-[10px]">{f.status}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </MemberAccordion>
        );
      })}
    </div>
  );
}

/* ═══════════ MAIN EXPORT ═══════════ */
export default function PendingTabs({
  levyRows,
  levyFineRows,
  loanInterestRows,
  loanFineRows,
  totals,
  counts,
  initialTab,
}: {
  levyRows: PendingLevyRow[];
  levyFineRows: PendingFineRow[];
  loanInterestRows: PendingInterestRow[];
  loanFineRows: PendingFineRow[];
  totals: { levy: string; levyFine: string; loanInterest: string; loanFine: string };
  counts: { levy: number; levyFine: number; loanInterest: number; loanFine: number };
  initialTab: TabKey;
}) {
  const [tab, setTab] = useState<TabKey>(initialTab);

  const tabs: { key: TabKey; label: string; count: number; color: string; total: string; borderColor: string }[] = [
    { key: 'levy', label: 'Pending Monthly Levy', count: counts.levy, color: 'text-rose-600', total: totals.levy, borderColor: 'border-rose-200' },
    { key: 'levyFine', label: 'Pending Levy Fine', count: counts.levyFine, color: 'text-orange-600', total: totals.levyFine, borderColor: 'border-orange-200' },
    { key: 'loanInterest', label: 'Pending Loan Interest', count: counts.loanInterest, color: 'text-purple-600', total: totals.loanInterest, borderColor: 'border-purple-200' },
    { key: 'loanFine', label: 'Pending Loan Fine', count: counts.loanFine, color: 'text-red-600', total: totals.loanFine, borderColor: 'border-red-200' },
  ];

  return (
    <>
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`text-left p-4 rounded-lg border transition-all ${
              tab === t.key ? `${t.borderColor} ring-2 ring-offset-1 ring-primary/30 shadow-sm` : 'border-border hover:border-primary/30'
            }`}
          >
            <div className={`text-xs font-semibold ${t.color}`}>{t.label}</div>
            <div className={`text-xl font-bold mt-1 font-mono ${t.color}`}>
              {formatNPR(t.total)}
            </div>
            <div className="text-xs text-muted-foreground mt-1">{t.count} members</div>
          </button>
        ))}
      </div>

      {/* Tab Selector */}
      <div className="border-b flex gap-6 text-sm font-medium overflow-x-auto">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`pb-2 border-b-2 transition-colors whitespace-nowrap ${
              tab === t.key
                ? 'border-primary text-primary font-bold'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label} ({t.count})
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <Card>
        <CardHeader className="p-4 border-b">
          <CardTitle className="text-base">
            {tabs.find((t) => t.key === tab)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4">
          {tab === 'levy' && <PendingLevyTab rows={levyRows} />}
          {tab === 'levyFine' && <PendingLevyFineTab rows={levyFineRows} />}
          {tab === 'loanInterest' && <PendingLoanInterestTab rows={loanInterestRows} />}
          {tab === 'loanFine' && <PendingLoanFineTab rows={loanFineRows} />}
        </CardContent>
      </Card>
    </>
  );
}

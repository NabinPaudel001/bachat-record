import { getMemberProfile } from '@/server/services/memberService';
import { requireRole } from '@/server/auth/rbac';
import { formatBSDate, formatNPR, bsMonthName } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Role } from '@prisma/client';
import { CloseAccountModal } from './close-account-modal';
import { EditMemberModal } from './edit-member-modal';
import { RemoveMemberModal } from './remove-member-modal';
import { PrintButton } from '@/components/ui/print-button';

export const runtime = 'nodejs';

export default async function MemberDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = 'overview' } = await searchParams;
  const user = await requireRole(Role.ADMIN, Role.TREASURER, Role.HELPER);

  const member = await getMemberProfile(id, user.role);
  if (!member) {
    notFound();
  }

  const activeLoan = member.loans.find((l) => l.status === 'ACTIVE');
  const isAdmin = user.role === Role.ADMIN;

  return (
    <div className="space-y-6">
      {/* Member Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight">{member.fullName}</h1>
            <Badge variant="outline" className="text-sm font-mono">
              {member.memberNo}
            </Badge>
            <Badge variant="secondary">Class {member.memberClass.replace(/^Class\s*/i, '')}</Badge>
            <Badge
              variant={member.status === 'ACTIVE' ? 'success' : 'destructive'}
              className="text-xs"
            >
              {member.status}
            </Badge>
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Joined: {formatBSDate(member.joinBsYear, member.joinBsMonth, 1, member.joinDate)} • Phone: {member.phone}
            {member.previousMemberId && (
              <span className="ml-2 font-medium text-amber-600">• Previously member record exists</span>
            )}
          </p>
        </div>

        <div className="flex items-center gap-2">
          {member.status === 'ACTIVE' && (
            <>
              <Link
                href={`/payments?memberId=${member.id}`}
                className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground px-4 py-2 hover:bg-primary/90 shadow-sm"
              >
                Record Payment
              </Link>
              {isAdmin && (
                <>
                  <EditMemberModal
                    member={{
                      id: member.id,
                      fullName: member.fullName,
                      phone: member.phone,
                      altPhone: member.altPhone,
                      email: member.email,
                      permanentAddress: member.permanentAddress,
                      currentAddress: member.currentAddress,
                      bankDetails: member.bankDetails,
                      notes: member.notes,
                      nomineeName: member.nomineeName,
                      nomineeRelation: member.nomineeRelation,
                      nomineePhone: member.nomineePhone,
                      monthlyAmount: member.monthlyAmount.toString(),
                      dob: member.dob ? member.dob.toISOString().split('T')[0] : null,
                      idNumber: member.idNumber,
                    }}
                  />
                  <CloseAccountModal
                    member={{
                      id: member.id,
                      fullName: member.fullName,
                      memberNo: member.memberNo,
                      totalDeposited: member.totalDeposited.toString(),
                      totalLoanPrincipal: member.totalLoanPrincipal.toString(),
                      guarantees: member.guarantees.map((g) => ({
                        id: g.id,
                        loan: {
                          status: g.loan.status,
                          loanNo: g.loan.loanNo,
                        },
                      })),
                    }}
                  />
                </>
              )}
            </>
          )}
          {isAdmin && (
            <RemoveMemberModal
              memberId={member.id}
              memberNo={member.memberNo}
              fullName={member.fullName}
            />
          )}
        </div>
      </div>

      {/* Summary KPI Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Total Deposited</div>
          <div className="text-lg font-bold text-emerald-600 mt-1 font-mono">
            {formatNPR(member.totalDeposited)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Pending Contribution</div>
          <div className="text-lg font-bold text-rose-600 mt-1 font-mono">
            {formatNPR(member.pendingContribution)}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Pending Fines (Total)</div>
          <div className="text-lg font-bold text-orange-600 mt-1 font-mono">
            {formatNPR(member.pendingFinesContribution.plus(member.pendingFinesLoan))}
          </div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-medium text-muted-foreground">Active Loan Principal</div>
          <div className="text-lg font-bold text-blue-600 mt-1 font-mono">
            {formatNPR(member.totalLoanPrincipal)}
          </div>
        </Card>
      </div>

      {/* Tabs Bar */}
      <div className="border-b flex gap-4 text-sm font-medium">
        <Link
          href={`/members/${member.id}?tab=overview`}
          className={`pb-2 border-b-2 transition-colors ${
            tab === 'overview'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Overview
        </Link>
        <Link
          href={`/members/${member.id}?tab=contributions`}
          className={`pb-2 border-b-2 transition-colors ${
            tab === 'contributions'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Contributions ({member.dues.length})
        </Link>
        <Link
          href={`/members/${member.id}?tab=loans`}
          className={`pb-2 border-b-2 transition-colors ${
            tab === 'loans'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Loans ({member.loans.length})
        </Link>
        <Link
          href={`/members/${member.id}?tab=fines`}
          className={`pb-2 border-b-2 transition-colors ${
            tab === 'fines'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Fines ({member.fines.length})
        </Link>
        <Link
          href={`/members/${member.id}?tab=statement`}
          className={`pb-2 border-b-2 transition-colors ${
            tab === 'statement'
              ? 'border-primary text-primary font-bold'
              : 'border-transparent text-muted-foreground hover:text-foreground'
          }`}
        >
          Statement (Print)
        </Link>
      </div>

      {/* Tab: Overview */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-base">Personal & Nominee Details</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3 text-sm">
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Permanent Address</span>
                <span className="font-medium">{member.permanentAddress}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Current Address</span>
                <span className="font-medium">{member.currentAddress || '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Citizenship / ID Number</span>
                <span className="font-medium font-mono">
                  {member.idNumber ? member.idNumber : '[Confidential / Hidden]'}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Phone Number</span>
                <span className="font-medium font-mono">
                  {member.phone}{member.altPhone ? ` / ${member.altPhone}` : ''}
                </span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Monthly Installment</span>
                <span className="font-medium">{formatNPR(member.monthlyAmount.toString())}</span>
              </div>
              <div className="flex justify-between py-1 border-b">
                <span className="text-muted-foreground">Advance Credit Balance</span>
                <span className="font-medium text-emerald-600">{formatNPR(member.advanceBalance.toString())}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="text-muted-foreground">Nominee</span>
                <span className="font-medium">
                  {member.nomineeName ? `${member.nomineeName} (${member.nomineeRelation ?? 'Nominee'})` : 'None'}
                </span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="p-4 border-b">
              <CardTitle className="text-base">Guarantor Information</CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-4 text-sm">
              <div>
                <h4 className="text-xs font-bold uppercase text-muted-foreground">
                  Guarantor on Active Loans (Reference only)
                </h4>
                {member.guarantees.length === 0 ? (
                  <p className="text-muted-foreground text-xs mt-2">Not currently a guarantor for any loans.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {member.guarantees.map((g) => (
                      <li key={g.id} className="p-2 border rounded bg-muted/20 flex justify-between items-center">
                        <div>
                          <span className="font-medium">Loan {g.loan.loanNo}</span>
                          <span className="text-xs text-muted-foreground block">
                            Borrower: {g.loan.borrower.fullName} ({g.loan.borrower.memberNo})
                          </span>
                        </div>
                        <Badge variant="outline" className="text-[10px]">
                          Ref Only
                        </Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {activeLoan && (
                <div className="border-t pt-3">
                  <h4 className="text-xs font-bold uppercase text-muted-foreground">
                    Guarantors for Member&apos;s Active Loan ({activeLoan.loanNo})
                  </h4>
                  <ul className="mt-2 space-y-1">
                    {activeLoan.guarantors.map((ag) => (
                      <li key={ag.id} className="text-xs text-muted-foreground flex justify-between">
                        <span>
                          {ag.member.fullName} ({ag.member.memberNo})
                        </span>
                        <span className="text-[10px] text-muted-foreground">Reference Only</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tab: Contributions */}
      {tab === 'contributions' && (
        <Card>
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-base">Monthly Installment Dues & Payments</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b text-xs text-muted-foreground uppercase bg-muted/40">
                <tr>
                  <th className="p-3">BS Month</th>
                  <th className="p-3">Grace Day</th>
                  <th className="p-3 text-right">Due Amount</th>
                  <th className="p-3 text-right">Paid Amount</th>
                  <th className="p-3 text-right">Balance Owed</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {member.dues.map((d) => {
                  const amt = Number(d.amount);
                  const paid = Number(d.paidAmount);
                  const owed = Math.max(0, amt - paid);
                  return (
                    <tr key={d.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">
                        {d.bsYear} {bsMonthName(d.bsMonth)}
                      </td>
                      <td className="p-3 text-muted-foreground">
                        Day 10 of next month
                      </td>
                      <td className="p-3 text-right font-mono">{formatNPR(amt)}</td>
                      <td className="p-3 text-right font-mono text-emerald-600">
                        {formatNPR(paid)}
                      </td>
                      <td className="p-3 text-right font-mono text-rose-600">
                        {owed > 0 ? formatNPR(owed) : '—'}
                      </td>
                      <td className="p-3 text-center">
                        <Badge
                          variant={d.status === 'PAID' ? 'success' : d.status === 'PARTIAL' ? 'warning' : 'destructive'}
                          className="text-[10px]"
                        >
                          {d.status}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Tab: Fines */}
      {tab === 'fines' && (
        <Card>
          <CardHeader className="p-4 border-b">
            <CardTitle className="text-base">Fine History & Status</CardTitle>
          </CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="border-b text-xs text-muted-foreground uppercase bg-muted/40">
                <tr>
                  <th className="p-3">Type</th>
                  <th className="p-3">Posted Date</th>
                  <th className="p-3 text-right">Fine Amount</th>
                  <th className="p-3 text-right">Paid</th>
                  <th className="p-3 text-right">Waived</th>
                  <th className="p-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {member.fines.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-4 text-center text-muted-foreground">
                      No fines recorded.
                    </td>
                  </tr>
                ) : (
                  member.fines.map((f) => (
                    <tr key={f.id} className="hover:bg-muted/30">
                      <td className="p-3 font-medium">{f.type}</td>
                      <td className="p-3 text-muted-foreground">
                        {f.postedOn.toISOString().split('T')[0]}
                      </td>
                      <td className="p-3 text-right font-mono">{formatNPR(f.amount.toString())}</td>
                      <td className="p-3 text-right font-mono text-emerald-600">
                        {formatNPR(f.paidAmount.toString())}
                      </td>
                      <td className="p-3 text-right font-mono text-muted-foreground">
                        {formatNPR(f.waivedAmount.toString())}
                      </td>
                      <td className="p-3 text-center">
                        <Badge variant="outline" className="text-[10px]">
                          {f.status}
                        </Badge>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* Tab: Statement */}
      {tab === 'statement' && (
        <Card className="print:shadow-none print:border-none p-6">
          <div className="flex justify-between items-start border-b pb-4 mb-4">
            <div>
              <h2 className="text-xl font-bold">Bachat Record — Member Statement</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Member: {member.fullName} ({member.memberNo}) • Class {member.memberClass}
              </p>
            </div>
            <PrintButton />
          </div>

          <div className="space-y-4 text-sm">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-muted-foreground">Total Cumulative Deposit:</p>
                <p className="text-xl font-bold font-mono text-emerald-600">{formatNPR(member.totalDeposited)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Advance Credit Available:</p>
                <p className="text-xl font-bold font-mono">{formatNPR(member.advanceBalance.toString())}</p>
              </div>
            </div>

            <div className="border-t pt-4">
              <h4 className="font-semibold mb-2">Statement Summary</h4>
              <p className="text-xs text-muted-foreground">
                Official statement generated from the immutable ledger. For questions contact the group treasurer.
              </p>
            </div>
          </div>
        </Card>
      )}
    </div>
  );
}

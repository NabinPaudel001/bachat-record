'use client';

import { useState } from 'react';
import { formatNPR } from '@/lib/format';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { WaiveFineModal } from './waive-modal';

export interface FineData {
  id: string;
  type: string;
  amount: number;
  paidAmount: number;
  waivedAmount: number;
  postedOn: string;
  status: string;
  member: {
    id: string;
    memberNo: string;
    fullName: string;
    phone?: string | null;
  };
}

export function FinesList({
  fines,
  isAdmin,
}: {
  fines: FineData[];
  isAdmin: boolean;
}) {
  const [expandedMemberId, setExpandedMemberId] = useState<string | null>(null);

  // Group fines by member
  const memberMap = new Map<
    string,
    {
      member: FineData['member'];
      fines: FineData[];
      totalFine: number;
      totalPaid: number;
      totalWaived: number;
      totalRemaining: number;
    }
  >();

  for (const f of fines) {
    const mId = f.member.id;
    if (!memberMap.has(mId)) {
      memberMap.set(mId, {
        member: f.member,
        fines: [],
        totalFine: 0,
        totalPaid: 0,
        totalWaived: 0,
        totalRemaining: 0,
      });
    }

    const group = memberMap.get(mId)!;
    group.fines.push(f);
    group.totalFine += f.amount;
    group.totalPaid += f.paidAmount;
    group.totalWaived += f.waivedAmount;
    group.totalRemaining += Math.max(0, f.amount - f.paidAmount - f.waivedAmount);
  }

  const groupedList = Array.from(memberMap.values());

  const toggle = (id: string) => {
    setExpandedMemberId((prev) => (prev === id ? null : id));
  };

  if (groupedList.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          No fines found matching the criteria.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {groupedList.map(({ member, fines: memberFines, totalFine, totalPaid, totalWaived, totalRemaining }) => {
        const isOpen = expandedMemberId === member.id;

        return (
          <div key={member.id} className="border rounded-lg bg-card overflow-hidden shadow-sm">
            <button
              type="button"
              onClick={() => toggle(member.id)}
              className="w-full flex items-center justify-between p-4 hover:bg-muted/40 transition-colors text-left"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-orange-100 dark:bg-orange-950/40 text-orange-700 dark:text-orange-400 font-bold flex items-center justify-center text-sm border border-orange-200">
                  {member.fullName.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-base">{member.fullName}</span>
                    <Badge variant="outline" className="text-xs font-mono">
                      {member.memberNo}
                    </Badge>
                  </div>
                  {member.phone && (
                    <span className="block text-xs text-muted-foreground mt-0.5">
                      Phone: {member.phone}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-6">
                <div className="text-right">
                  <div className="text-sm font-bold font-mono text-orange-600">
                    Remaining: {formatNPR(totalRemaining)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {memberFines.length} fine{memberFines.length > 1 ? 's' : ''} (Total: {formatNPR(totalFine)})
                  </div>
                </div>

                <svg
                  className={`w-5 h-5 text-muted-foreground transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {isOpen && (
              <div className="border-t bg-muted/10 p-0 overflow-x-auto">
                <table className="w-full text-sm text-left">
                  <thead className="bg-muted/50 border-b text-xs text-muted-foreground uppercase">
                    <tr>
                      <th className="p-3">Penalty Type</th>
                      <th className="p-3">Posted Date</th>
                      <th className="p-3 text-right">Fine Amount</th>
                      <th className="p-3 text-right">Paid</th>
                      <th className="p-3 text-right">Waived</th>
                      <th className="p-3 text-right">Remaining</th>
                      <th className="p-3 text-center">Status</th>
                      <th className="p-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {memberFines.map((f) => {
                      const rem = Math.max(0, f.amount - f.paidAmount - f.waivedAmount);

                      return (
                        <tr key={f.id} className="hover:bg-muted/20">
                          <td className="p-3 font-mono text-xs">
                            <Badge variant="outline" className="text-[11px]">
                              {f.type}
                            </Badge>
                          </td>
                          <td className="p-3 text-muted-foreground text-xs">{f.postedOn}</td>
                          <td className="p-3 text-right font-mono">{formatNPR(f.amount)}</td>
                          <td className="p-3 text-right font-mono text-emerald-600">
                            {formatNPR(f.paidAmount)}
                          </td>
                          <td className="p-3 text-right font-mono text-muted-foreground">
                            {formatNPR(f.waivedAmount)}
                          </td>
                          <td className="p-3 text-right font-mono font-bold text-orange-600">
                            {formatNPR(rem)}
                          </td>
                          <td className="p-3 text-center">
                            <Badge
                              variant={
                                f.status === 'PAID'
                                  ? 'success'
                                  : f.status === 'WAIVED'
                                  ? 'secondary'
                                  : 'warning'
                              }
                              className="text-[10px]"
                            >
                              {f.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-right">
                            {isAdmin && rem > 0 ? (
                              <WaiveFineModal
                                fineId={f.id}
                                memberInfo={`${f.member.fullName} (${f.member.memberNo})`}
                                remainingAmount={rem}
                              />
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

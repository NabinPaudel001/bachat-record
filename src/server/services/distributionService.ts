import { prisma } from '@/server/db';
import { allocateDistributionLines } from '@/server/engines/calculators';
import { postJournal } from './ledgerService';
import Decimal from 'decimal.js';
import { DistType, PayoutPeriod, PayoutMode, DistStatus } from '@prisma/client';

export interface CreateDistributionInput {
  type: DistType;
  period: PayoutPeriod;
  fromDate: Date;
  toDate: Date;
  percent?: Decimal | string | number | null;
  totalAmount: Decimal | string | number;
  reservePercent?: Decimal | string | number | null;
  reserveAmount?: Decimal | string | number | null;
  includeUnpaid?: boolean;
  payoutMode: PayoutMode;
  userId: string;
}

/**
 * Compute the base for each active member.
 * For BONUS: sum of monthly contribution dues up to the book-close month (paid or unpaid, per setting).
 * For SAVINGS: sum of paid contributions up to toDate.
 */
export async function getMemberBasesForDistribution(opts: {
  type: DistType;
  toDate: Date;
  includeUnpaid: boolean;
}): Promise<{ memberId: string; base: Decimal }[]> {
  const members = await prisma.member.findMany({
    where: { status: 'ACTIVE' },
    select: { id: true },
  });

  const memberBases: { memberId: string; base: Decimal }[] = [];

  for (const m of members) {
    let base = new Decimal(0);
    if (opts.type === DistType.BONUS && opts.includeUnpaid) {
      // Bonus base includes all dues for months up to toDate, paid or not
      const dues = await prisma.contributionDue.findMany({
        where: {
          memberId: m.id,
          monthStart: { lte: opts.toDate },
        },
        select: { amount: true },
      });
      for (const d of dues) {
        base = base.plus(new Decimal(d.amount.toString()));
      }
    } else {
      // Savings interest or paid-only bonus: contributions actually paid
      const dues = await prisma.contributionDue.findMany({
        where: {
          memberId: m.id,
          monthStart: { lte: opts.toDate },
        },
        select: { paidAmount: true },
      });
      for (const d of dues) {
        base = base.plus(new Decimal(d.paidAmount.toString()));
      }
    }
    memberBases.push({ memberId: m.id, base });
  }

  return memberBases;
}

/**
 * Preview distribution lines before confirming.
 */
export async function previewDistribution(input: {
  type: DistType;
  toDate: Date;
  totalAmount: Decimal | string | number;
  includeUnpaid?: boolean;
}) {
  const memberBases = await getMemberBasesForDistribution({
    type: input.type,
    toDate: input.toDate,
    includeUnpaid: input.includeUnpaid ?? true,
  });

  const lines = allocateDistributionLines(input.totalAmount, memberBases);

  // Attach member details
  const members = await prisma.member.findMany({
    where: { id: { in: lines.map((l) => l.memberId) } },
    select: { id: true, memberNo: true, fullName: true },
  });
  const memberMap = new Map(members.map((m) => [m.id, m]));

  return lines.map((l) => ({
    ...l,
    member: memberMap.get(l.memberId),
  }));
}

/**
 * Confirm and execute a distribution (Section 3.9, 3.12).
 * Admin only.
 */
export async function confirmDistribution(input: CreateDistributionInput) {
  const totalAmount = new Decimal(input.totalAmount.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
  const includeUnpaid = input.includeUnpaid ?? true;

  return prisma.$transaction(async (tx) => {
    // 1. Calculate per-member bases and lines
    const memberBases = await getMemberBasesForDistribution({
      type: input.type,
      toDate: input.toDate,
      includeUnpaid,
    });

    const lines = allocateDistributionLines(totalAmount, memberBases);

    // 2. Post accounting journal:
    // Dr 5000 Interest and Bonus to Members
    // Cr 2100 Interest and Bonus Payable (if PAYABLE) OR Cr 2000 Member Deposits (if REINVEST)
    const creditAccount = input.payoutMode === PayoutMode.REINVEST ? '2000' : '2100';

    const journal = await postJournal(
      {
        date: input.toDate,
        description: `Distribution: ${input.type} (${input.period})`,
        refType: 'DISTRIBUTION',
        createdById: input.userId,
        lines: [
          { accountCode: '5000', debit: totalAmount },
          { accountCode: creditAccount, credit: totalAmount },
        ],
      },
      tx
    );

    // 3. Create distribution record
    const dist = await tx.distribution.create({
      data: {
        type: input.type,
        period: input.period,
        fromDate: input.fromDate,
        toDate: input.toDate,
        percent: input.percent ? new Decimal(input.percent.toString()) : null,
        totalAmount,
        reservePercent: input.reservePercent ? new Decimal(input.reservePercent.toString()) : null,
        reserveAmount: input.reserveAmount ? new Decimal(input.reserveAmount.toString()) : null,
        includeUnpaid,
        payoutMode: input.payoutMode,
        status: DistStatus.CONFIRMED,
        confirmedById: input.userId,
        confirmedAt: new Date(),
        journalId: journal.id,
        lines: {
          create: lines.map((l) => ({
            memberId: l.memberId,
            base: l.base,
            amount: l.amount,
          })),
        },
      },
      include: { lines: true },
    });

    // 4. If REINVEST mode, increase advance/deposit on member records
    if (input.payoutMode === PayoutMode.REINVEST) {
      for (const line of lines) {
        if (line.amount.gt(0)) {
          await tx.member.update({
            where: { id: line.memberId },
            data: {
              advanceBalance: { increment: line.amount },
            },
          });
        }
      }
    }

    return dist;
  });
}

import { prisma } from '@/server/db';
import Decimal from 'decimal.js';
import { Prisma } from '@prisma/client';

export interface JournalLineInput {
  accountCode: string;
  debit?: Decimal | string | number;
  credit?: Decimal | string | number;
  memberId?: string | null;
}

export interface PostJournalParams {
  date: Date;
  description: string;
  refType?: string;
  refId?: string;
  createdById: string;
  lines: JournalLineInput[];
}

/**
 * Check if a date falls inside a locked accounting period.
 */
export async function isPeriodLocked(
  tx: Prisma.TransactionClient | typeof prisma,
  date: Date
): Promise<boolean> {
  const lockedPeriod = await tx.accountingPeriod.findFirst({
    where: {
      startDate: { lte: date },
      endDate: { gte: date },
      lockedAt: { not: null },
    },
  });
  return !!lockedPeriod;
}

/**
 * Single, unified entry point for posting accounting journals (Section 3.12).
 * Enforces:
 * 1. Balanced debits and credits (sum(debit) == sum(credit))
 * 2. No posting in locked periods
 * 3. Immutable creation inside a Prisma transaction
 */
export async function postJournal(
  params: PostJournalParams,
  externalTx?: Prisma.TransactionClient
) {
  const runner = async (tx: Prisma.TransactionClient) => {
    // 1. Period lock validation
    const locked = await isPeriodLocked(tx, params.date);
    if (locked) {
      throw new Error(`Cannot post journal: Accounting period for date ${params.date.toISOString().split('T')[0]} is locked.`);
    }

    // 2. Validate and balance lines
    let totalDebit = new Decimal(0);
    let totalCredit = new Decimal(0);

    const processedLines: {
      accountId: string;
      debit: Decimal;
      credit: Decimal;
      memberId?: string | null;
    }[] = [];

    // Pre-fetch account IDs by code
    const codes = params.lines.map((l) => l.accountCode);
    const accounts = await tx.account.findMany({
      where: { code: { in: codes } },
      select: { id: true, code: true },
    });
    const codeMap = new Map(accounts.map((a) => [a.code, a.id]));

    for (const line of params.lines) {
      const accountId = codeMap.get(line.accountCode);
      if (!accountId) {
        throw new Error(`Account code '${line.accountCode}' not found in Chart of Accounts.`);
      }

      const debit = new Decimal((line.debit ?? 0).toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
      const credit = new Decimal((line.credit ?? 0).toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

      if (debit.lt(0) || credit.lt(0)) {
        throw new Error('Debit and credit values cannot be negative.');
      }
      if (debit.gt(0) && credit.gt(0)) {
        throw new Error('A single journal line cannot contain both positive debit and credit.');
      }

      totalDebit = totalDebit.plus(debit);
      totalCredit = totalCredit.plus(credit);

      processedLines.push({
        accountId,
        debit,
        credit,
        memberId: line.memberId ?? null,
      });
    }

    if (!totalDebit.equals(totalCredit)) {
      throw new Error(
        `Journal entry does not balance: total debits (${totalDebit.toFixed(2)}) must equal total credits (${totalCredit.toFixed(2)}).`
      );
    }

    if (totalDebit.isZero()) {
      throw new Error('Journal must have a non-zero balanced amount.');
    }

    // 3. Create the journal and lines atomically
    const journal = await tx.journal.create({
      data: {
        date: params.date,
        description: params.description,
        refType: params.refType,
        refId: params.refId,
        createdById: params.createdById,
        lines: {
          create: processedLines.map((l) => ({
            accountId: l.accountId,
            debit: l.debit,
            credit: l.credit,
            memberId: l.memberId,
          })),
        },
      },
      include: {
        lines: {
          include: { account: true },
        },
      },
    });

    return journal;
  };

  if (externalTx) {
    return runner(externalTx);
  } else {
    return prisma.$transaction(runner);
  }
}

/**
 * Reverse an existing journal with reason (Section 3.12).
 * Creates an equal and opposite journal linked to the original via `reversesId`.
 */
export async function reverseJournal(
  journalId: string,
  reversalReason: string,
  userId: string,
  externalTx?: Prisma.TransactionClient
) {
  const runner = async (tx: Prisma.TransactionClient) => {
    const original = await tx.journal.findUnique({
      where: { id: journalId },
      include: { lines: { include: { account: true } } },
    });

    if (!original) {
      throw new Error(`Journal with ID ${journalId} not found.`);
    }

    if (original.reversesId) {
      throw new Error('Cannot reverse a journal that is already a reversal.');
    }

    const existingReversal = await tx.journal.findUnique({
      where: { reversesId: journalId },
    });
    if (existingReversal) {
      throw new Error(`Journal ${journalId} has already been reversed by journal ${existingReversal.id}.`);
    }

    const today = new Date();
    const locked = await isPeriodLocked(tx, today);
    if (locked) {
      throw new Error(`Cannot post reversal: Current accounting period is locked.`);
    }

    // Opposite lines: debit becomes credit, credit becomes debit
    const reversedLines: JournalLineInput[] = original.lines.map((l) => ({
      accountCode: l.account.code,
      debit: l.credit,
      credit: l.debit,
      memberId: l.memberId,
    }));

    const reversalJournal = await tx.journal.create({
      data: {
        date: today,
        description: `Reversal of [${original.description}]: ${reversalReason}`,
        refType: original.refType,
        refId: original.refId,
        reversesId: original.id,
        reversalReason,
        createdById: userId,
        lines: {
          create: reversedLines.map((l) => {
            const acc = original.lines.find((ol) => ol.account.code === l.accountCode);
            return {
              accountId: acc!.accountId,
              debit: l.debit as Decimal,
              credit: l.credit as Decimal,
              memberId: l.memberId,
            };
          }),
        },
      },
      include: { lines: true },
    });

    return reversalJournal;
  };

  if (externalTx) {
    return runner(externalTx);
  } else {
    return prisma.$transaction(runner);
  }
}

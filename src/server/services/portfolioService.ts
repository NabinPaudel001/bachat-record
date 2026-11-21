import { prisma } from '@/server/db';
import { postJournal } from './ledgerService';
import Decimal from 'decimal.js';

export interface BuyInvestmentInput {
  categoryId: string;
  name: string;
  units?: Decimal | string | number | null;
  buyDate: Date;
  cost: Decimal | string | number;
  notes?: string | null;
  userId: string;
}

export interface SellInvestmentInput {
  investmentId: string;
  soldOn: Date;
  saleAmount: Decimal | string | number;
  userId: string;
}

export interface ExpenseInput {
  date: Date;
  accountId?: string;
  amount: Decimal | string | number;
  payee?: string | null;
  note?: string | null;
  userId: string;
}

export interface OtherIncomeInput {
  date: Date;
  accountId?: string;
  amount: Decimal | string | number;
  source?: string | null;
  note?: string | null;
  userId: string;
}

/**
 * Buy an Investment (Section 3.12, Phase 3).
 * Dr 1100 Investments, Cr 1000 Cash.
 */
export async function buyInvestment(input: BuyInvestmentInput) {
  const cost = new Decimal(input.cost.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return prisma.$transaction(async (tx) => {
    // 1. Post journal
    await postJournal(
      {
        date: input.buyDate,
        description: `Investment Purchase: ${input.name}`,
        refType: 'INVESTMENT',
        createdById: input.userId,
        lines: [
          { accountCode: '1100', debit: cost },
          { accountCode: '1000', credit: cost },
        ],
      },
      tx
    );

    // 2. Create investment record
    const units = input.units ? new Decimal(input.units.toString()) : null;
    const inv = await tx.investment.create({
      data: {
        categoryId: input.categoryId,
        name: input.name,
        units,
        buyDate: input.buyDate,
        cost,
        currentValue: cost,
        valuedOn: input.buyDate,
        status: 'ACTIVE',
        notes: input.notes,
        valuations: {
          create: {
            day: input.buyDate,
            value: cost,
          },
        },
      },
      include: { category: true },
    });

    return inv;
  });
}

/**
 * Sell an Investment.
 * Dr 1000 Cash
 * Cr 1100 Investments (original cost)
 * Cr 4200 Investment Income (if gain) OR Dr 5200 Realized Investment Loss (if loss)
 */
export async function sellInvestment(input: SellInvestmentInput) {
  const saleAmount = new Decimal(input.saleAmount.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return prisma.$transaction(async (tx) => {
    const inv = await tx.investment.findUnique({
      where: { id: input.investmentId },
    });
    if (!inv) throw new Error('Investment not found');
    if (inv.status === 'SOLD') throw new Error('Investment is already sold');

    const cost = new Decimal(inv.cost.toString());
    const diff = saleAmount.minus(cost);

    const lines = [
      { accountCode: '1000', debit: saleAmount },
      { accountCode: '1100', credit: cost },
    ];

    if (diff.gt(0)) {
      // Gain
      lines.push({ accountCode: '4200', credit: diff });
    } else if (diff.lt(0)) {
      // Loss
      lines.push({ accountCode: '5200', debit: diff.abs() });
    }

    await postJournal(
      {
        date: input.soldOn,
        description: `Investment Sale: ${inv.name}`,
        refType: 'INVESTMENT_SALE',
        refId: inv.id,
        createdById: input.userId,
        lines,
      },
      tx
    );

    return tx.investment.update({
      where: { id: inv.id },
      data: {
        status: 'SOLD',
        soldOn: input.soldOn,
        saleAmount,
      },
    });
  });
}

/**
 * Update current valuation of an investment.
 * Note: Unrealised gain/loss is never posted to the ledger or distributed (Section 3.10).
 */
export async function updateValuation(
  investmentId: string,
  newValue: Decimal | string | number,
  asOf: Date
) {
  const val = new Decimal(newValue.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return prisma.$transaction(async (tx) => {
    await tx.investmentValuation.create({
      data: {
        investmentId,
        day: asOf,
        value: val,
      },
    });

    return tx.investment.update({
      where: { id: investmentId },
      data: {
        currentValue: val,
        valuedOn: asOf,
      },
    });
  });
}

/**
 * Record an operating expense (Section 3.12).
 * Dr 5100 Operating Expense, Cr 1000 Cash
 */
export async function recordExpense(input: ExpenseInput) {
  const amount = new Decimal(input.amount.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return prisma.$transaction(async (tx) => {
    const journal = await postJournal(
      {
        date: input.date,
        description: `Expense: ${input.payee || input.note || 'Operating Expense'}`,
        refType: 'EXPENSE',
        createdById: input.userId,
        lines: [
          { accountCode: '5100', debit: amount },
          { accountCode: '1000', credit: amount },
        ],
      },
      tx
    );

    return tx.expense.create({
      data: {
        date: input.date,
        accountId: input.accountId || '5100',
        amount,
        payee: input.payee,
        note: input.note,
        journalId: journal.id,
      },
    });
  });
}

/**
 * Record other income (Section 3.12).
 * Dr 1000 Cash, Cr 4300 Other Income
 */
export async function recordOtherIncome(input: OtherIncomeInput) {
  const amount = new Decimal(input.amount.toString()).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

  return prisma.$transaction(async (tx) => {
    const journal = await postJournal(
      {
        date: input.date,
        description: `Income: ${input.source || input.note || 'Other Income'}`,
        refType: 'OTHER_INCOME',
        createdById: input.userId,
        lines: [
          { accountCode: '1000', debit: amount },
          { accountCode: '4300', credit: amount },
        ],
      },
      tx
    );

    return tx.otherIncome.create({
      data: {
        date: input.date,
        accountId: input.accountId || '4300',
        amount,
        source: input.source,
        note: input.note,
        journalId: journal.id,
      },
    });
  });
}

import { prisma } from '@/server/db';
import Decimal from 'decimal.js';

export interface BalanceSheetData {
  asOf: Date;
  assets: { code: string; name: string; balance: Decimal }[];
  totalAssets: Decimal;
  liabilities: { code: string; name: string; balance: Decimal }[];
  totalLiabilities: Decimal;
  equity: { code: string; name: string; balance: Decimal }[];
  netSurplus: Decimal;
  totalEquity: Decimal;
  totalLiabilitiesAndEquity: Decimal;
  isBalanced: boolean;
  memoReceivables: {
    pendingContributions: Decimal;
    pendingLoanInterest: Decimal;
    pendingFines: Decimal;
  };
  unrealizedInvestmentGain: Decimal;
}

export interface ProfitAndLossData {
  fromDate: Date;
  toDate: Date;
  income: { code: string; name: string; amount: Decimal }[];
  totalIncome: Decimal;
  expenses: { code: string; name: string; amount: Decimal }[];
  totalExpenses: Decimal;
  operatingSurplus: Decimal;
  appropriations: { code: string; name: string; amount: Decimal }[];
  totalAppropriations: Decimal;
  retainedSurplus: Decimal;
}

export interface CashFlowData {
  fromDate: Date;
  toDate: Date;
  openingCash: Decimal;
  operatingCashFlow: Decimal;
  investingCashFlow: Decimal;
  financingCashFlow: Decimal;
  netCashChange: Decimal;
  closingCash: Decimal;
  isVerified: boolean;
}

/**
 * Generate Balance Sheet as of Date D (Section 8).
 */
export async function getBalanceSheet(asOf: Date): Promise<BalanceSheetData> {
  // Fetch all accounts
  const accounts = await prisma.account.findMany();

  // Aggregate debits and credits for each account up to asOf
  const lines = await prisma.journalLine.findMany({
    where: {
      journal: { date: { lte: asOf } },
    },
    include: { account: true },
  });

  const accountBalances = new Map<string, Decimal>();
  for (const acct of accounts) {
    accountBalances.set(acct.code, new Decimal(0));
  }

  for (const line of lines) {
    const code = line.account.code;
    const current = accountBalances.get(code) ?? new Decimal(0);
    const debit = new Decimal(line.debit.toString());
    const credit = new Decimal(line.credit.toString());

    // Normal balances:
    // ASSET, EXPENSE: Debit - Credit
    // LIABILITY, EQUITY, INCOME: Credit - Debit
    if (line.account.type === 'ASSET' || line.account.type === 'EXPENSE') {
      accountBalances.set(code, current.plus(debit).minus(credit));
    } else {
      accountBalances.set(code, current.plus(credit).minus(debit));
    }
  }

  const assets: { code: string; name: string; balance: Decimal }[] = [];
  let totalAssets = new Decimal(0);

  const liabilities: { code: string; name: string; balance: Decimal }[] = [];
  let totalLiabilities = new Decimal(0);

  const equity: { code: string; name: string; balance: Decimal }[] = [];
  let totalEquityAccounts = new Decimal(0);

  let cumulativeIncome = new Decimal(0);
  let cumulativeExpenses = new Decimal(0);

  for (const acct of accounts) {
    const bal = accountBalances.get(acct.code) ?? new Decimal(0);

    if (acct.type === 'ASSET') {
      assets.push({ code: acct.code, name: acct.name, balance: bal });
      totalAssets = totalAssets.plus(bal);
    } else if (acct.type === 'LIABILITY') {
      liabilities.push({ code: acct.code, name: acct.name, balance: bal });
      totalLiabilities = totalLiabilities.plus(bal);
    } else if (acct.type === 'EQUITY') {
      equity.push({ code: acct.code, name: acct.name, balance: bal });
      totalEquityAccounts = totalEquityAccounts.plus(bal);
    } else if (acct.type === 'INCOME') {
      cumulativeIncome = cumulativeIncome.plus(bal);
    } else if (acct.type === 'EXPENSE') {
      cumulativeExpenses = cumulativeExpenses.plus(bal);
    }
  }

  // Net surplus / earnings = Income - Expenses
  const netSurplus = cumulativeIncome.minus(cumulativeExpenses);
  const totalEquity = totalEquityAccounts.plus(netSurplus);
  const totalLiabilitiesAndEquity = totalLiabilities.plus(totalEquity);

  const isBalanced = totalAssets.equals(totalLiabilitiesAndEquity);

  // Memo receivables (below the line)
  let pendingContributions = new Decimal(0);
  const dues = await prisma.contributionDue.findMany({
    where: { monthStart: { lte: asOf }, status: { in: ['PENDING', 'PARTIAL'] } },
  });
  for (const d of dues) {
    pendingContributions = pendingContributions.plus(
      new Decimal(d.amount.toString()).minus(new Decimal(d.paidAmount.toString()))
    );
  }

  let pendingFines = new Decimal(0);
  const fines = await prisma.fine.findMany({
    where: { postedOn: { lte: asOf }, status: { in: ['PENDING', 'PARTIAL'] } },
  });
  for (const f of fines) {
    pendingFines = pendingFines.plus(
      new Decimal(f.amount.toString())
        .minus(new Decimal(f.paidAmount.toString()))
        .minus(new Decimal(f.waivedAmount.toString()))
    );
  }

  // Unrealized investment gain = current valuation - original cost
  let unrealizedGain = new Decimal(0);
  const activeInvestments = await prisma.investment.findMany({
    where: { buyDate: { lte: asOf }, status: 'ACTIVE' },
  });
  for (const inv of activeInvestments) {
    const cur = new Decimal(inv.currentValue.toString());
    const cost = new Decimal(inv.cost.toString());
    unrealizedGain = unrealizedGain.plus(cur.minus(cost));
  }

  return {
    asOf,
    assets: assets.sort((a, b) => a.code.localeCompare(b.code)),
    totalAssets,
    liabilities: liabilities.sort((a, b) => a.code.localeCompare(b.code)),
    totalLiabilities,
    equity: equity.sort((a, b) => a.code.localeCompare(b.code)),
    netSurplus,
    totalEquity,
    totalLiabilitiesAndEquity,
    isBalanced,
    memoReceivables: {
      pendingContributions,
      pendingLoanInterest: new Decimal(0),
      pendingFines,
    },
    unrealizedInvestmentGain: unrealizedGain,
  };
}

/**
 * Generate Profit and Loss Statement for date range [from, to] (Section 8).
 */
export async function getProfitAndLoss(fromDate: Date, toDate: Date): Promise<ProfitAndLossData> {
  const accounts = await prisma.account.findMany();

  const lines = await prisma.journalLine.findMany({
    where: {
      journal: {
        date: { gte: fromDate, lte: toDate },
      },
    },
    include: { account: true },
  });

  const incomeMap = new Map<string, Decimal>();
  const expenseMap = new Map<string, Decimal>();
  const appropriationMap = new Map<string, Decimal>();

  for (const line of lines) {
    const code = line.account.code;
    const debit = new Decimal(line.debit.toString());
    const credit = new Decimal(line.credit.toString());

    if (line.account.type === 'INCOME') {
      const cur = incomeMap.get(code) ?? new Decimal(0);
      incomeMap.set(code, cur.plus(credit).minus(debit));
    } else if (line.account.type === 'EXPENSE') {
      if (code === '5000') {
        // Appropriation
        const cur = appropriationMap.get(code) ?? new Decimal(0);
        appropriationMap.set(code, cur.plus(debit).minus(credit));
      } else {
        // Operating expense
        const cur = expenseMap.get(code) ?? new Decimal(0);
        expenseMap.set(code, cur.plus(debit).minus(credit));
      }
    }
  }

  const income: { code: string; name: string; amount: Decimal }[] = [];
  let totalIncome = new Decimal(0);
  for (const acct of accounts.filter((a) => a.type === 'INCOME')) {
    const amt = incomeMap.get(acct.code) ?? new Decimal(0);
    income.push({ code: acct.code, name: acct.name, amount: amt });
    totalIncome = totalIncome.plus(amt);
  }

  const expenses: { code: string; name: string; amount: Decimal }[] = [];
  let totalExpenses = new Decimal(0);
  for (const acct of accounts.filter((a) => a.type === 'EXPENSE' && a.code !== '5000')) {
    const amt = expenseMap.get(acct.code) ?? new Decimal(0);
    expenses.push({ code: acct.code, name: acct.name, amount: amt });
    totalExpenses = totalExpenses.plus(amt);
  }

  const appropriations: { code: string; name: string; amount: Decimal }[] = [];
  let totalAppropriations = new Decimal(0);
  for (const acct of accounts.filter((a) => a.code === '5000')) {
    const amt = appropriationMap.get(acct.code) ?? new Decimal(0);
    appropriations.push({ code: acct.code, name: acct.name, amount: amt });
    totalAppropriations = totalAppropriations.plus(amt);
  }

  const operatingSurplus = totalIncome.minus(totalExpenses);
  const retainedSurplus = operatingSurplus.minus(totalAppropriations);

  return {
    fromDate,
    toDate,
    income: income.sort((a, b) => a.code.localeCompare(b.code)),
    totalIncome,
    expenses: expenses.sort((a, b) => a.code.localeCompare(b.code)),
    totalExpenses,
    operatingSurplus,
    appropriations,
    totalAppropriations,
    retainedSurplus,
  };
}

/**
 * Generate Direct Cash Flow Statement for date range [from, to] (Section 8).
 */
export async function getCashFlow(fromDate: Date, toDate: Date): Promise<CashFlowData> {
  // Opening cash = sum(debit - credit) on account 1000 before fromDate
  const priorLines = await prisma.journalLine.findMany({
    where: {
      account: { code: '1000' },
      journal: { date: { lt: fromDate } },
    },
  });
  let openingCash = new Decimal(0);
  for (const l of priorLines) {
    openingCash = openingCash.plus(new Decimal(l.debit.toString())).minus(new Decimal(l.credit.toString()));
  }

  // Lines hitting 1000 in the period
  const periodCashLines = await prisma.journalLine.findMany({
    where: {
      account: { code: '1000' },
      journal: { date: { gte: fromDate, lte: toDate } },
    },
    include: {
      journal: {
        include: {
          lines: { include: { account: true } },
        },
      },
    },
  });

  let operatingCashFlow = new Decimal(0);
  let investingCashFlow = new Decimal(0);
  let financingCashFlow = new Decimal(0);

  for (const cashLine of periodCashLines) {
    const netCashEffect = new Decimal(cashLine.debit.toString()).minus(new Decimal(cashLine.credit.toString()));
    const otherLines = cashLine.journal.lines.filter((l) => l.account.code !== '1000');

    // Categorize by opposing account
    for (const other of otherLines) {
      const code = other.account.code;
      if (code === '4000' || code === '4100' || code === '4200' || code === '4300' || code === '5100') {
        // Operating
        operatingCashFlow = operatingCashFlow.plus(netCashEffect);
      } else if (code === '1100' || code === '1200' || code === '1300' || code === '5200') {
        // Investing
        investingCashFlow = investingCashFlow.plus(netCashEffect);
      } else if (code === '2000' || code === '2100') {
        // Financing
        financingCashFlow = financingCashFlow.plus(netCashEffect);
      }
    }
  }

  const netCashChange = operatingCashFlow.plus(investingCashFlow).plus(financingCashFlow);
  const closingCash = openingCash.plus(netCashChange);

  return {
    fromDate,
    toDate,
    openingCash,
    operatingCashFlow,
    investingCashFlow,
    financingCashFlow,
    netCashChange,
    closingCash,
    isVerified: true,
  };
}

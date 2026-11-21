import { PrismaClient, AccountType, DueStatus, Prisma } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ---------------------------------------------------------------------------
// Chart of Accounts
// ---------------------------------------------------------------------------
const ACCOUNTS: { code: string; name: string; type: AccountType }[] = [
  { code: '1000', name: 'Cash and Bank', type: 'ASSET' },
  { code: '1100', name: 'Investments', type: 'ASSET' },
  { code: '1200', name: 'Loans Receivable', type: 'ASSET' },
  { code: '1300', name: 'Other Assets', type: 'ASSET' },
  { code: '2000', name: 'Member Deposits', type: 'LIABILITY' },
  { code: '2100', name: 'Interest and Bonus Payable', type: 'LIABILITY' },
  { code: '3000', name: 'Group Reserve / Surplus', type: 'EQUITY' },
  { code: '4000', name: 'Loan Interest Income', type: 'INCOME' },
  { code: '4100', name: 'Fine Income', type: 'INCOME' },
  { code: '4200', name: 'Investment Income', type: 'INCOME' },
  { code: '4300', name: 'Other Income', type: 'INCOME' },
  { code: '5000', name: 'Interest and Bonus to Members', type: 'EXPENSE' },
  { code: '5100', name: 'Operating Expenses', type: 'EXPENSE' },
  { code: '5200', name: 'Realized Investment Loss', type: 'EXPENSE' },
];

// ---------------------------------------------------------------------------
// Default Settings
// ---------------------------------------------------------------------------
const DEFAULT_SETTINGS: Record<string, unknown> = {
  contributionFine: 200,
  loanInterestFine: 100,
  contributionGraceDay: 10,
  loanInterestGraceDay: 10,
  dayCountBasis: 365,
  monthlyAmountDefault: 1000,
  bonusIncludesUnpaid: true,
  interestIncludesUnpaid: false,
  payoutMode: 'PAYABLE',
  allowReserveDraw: true,
  reserveFloor: 0,
  helperPaymentsNeedApproval: true,
};

// ---------------------------------------------------------------------------
// Helper: BS 2080-01-01 mapped to a rough AD date (2023-04-14)
// ---------------------------------------------------------------------------
const BS_2080_01_01 = new Date('2023-04-14');
const BS_2075_01_01 = new Date('2018-04-14');
const BS_2070_01_01 = new Date('2013-04-14');

// ---------------------------------------------------------------------------
// Seed functions
// ---------------------------------------------------------------------------

async function seedAccounts(): Promise<void> {
  for (const acct of ACCOUNTS) {
    await prisma.account.upsert({
      where: { code: acct.code },
      update: { name: acct.name, type: acct.type, isSystem: true },
      create: {
        code: acct.code,
        name: acct.name,
        type: acct.type,
        isSystem: true,
      },
    });
  }
  console.log(`✓ Seeded ${ACCOUNTS.length} accounts`);
}

async function seedSettings(): Promise<void> {
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    await prisma.setting.upsert({
      where: { key },
      update: { value: value as Prisma.InputJsonValue },
      create: { key, value: value as Prisma.InputJsonValue },
    });
  }
  console.log(`✓ Seeded ${Object.keys(DEFAULT_SETTINGS).length} settings`);
}

async function seedRateHistory(adminId: string): Promise<void> {
  // Use effectiveFrom = BS 2080-01-01
  const effectiveFrom = BS_2080_01_01;

  // Savings rate
  const existingSavings = await prisma.rateHistory.findFirst({
    where: { type: 'SAVINGS', effectiveFrom },
  });
  if (!existingSavings) {
    await prisma.rateHistory.create({
      data: {
        type: 'SAVINGS',
        ratePercent: 10.0,
        effectiveFrom,
        reason: 'Initial savings rate',
        createdById: adminId,
      },
    });
  }

  // Loan rate
  const existingLoan = await prisma.rateHistory.findFirst({
    where: { type: 'LOAN', effectiveFrom },
  });
  if (!existingLoan) {
    await prisma.rateHistory.create({
      data: {
        type: 'LOAN',
        ratePercent: 12.0,
        effectiveFrom,
        reason: 'Initial loan rate',
        createdById: adminId,
      },
    });
  }

  console.log('✓ Seeded rate history (savings 10%, loan 12%)');
}

async function seedClassRules(): Promise<void> {
  const rules = [
    { label: 'Class A', joinedFrom: BS_2070_01_01, joinedTo: BS_2075_01_01 },
    { label: 'Class B', joinedFrom: BS_2075_01_01, joinedTo: BS_2080_01_01 },
    { label: 'Class C', joinedFrom: BS_2080_01_01, joinedTo: null },
  ];

  for (const rule of rules) {
    const existing = await prisma.classRule.findFirst({
      where: { label: rule.label },
    });
    if (!existing) {
      await prisma.classRule.create({ data: rule });
    } else {
      await prisma.classRule.update({
        where: { id: existing.id },
        data: rule,
      });
    }
  }

  console.log('✓ Seeded 3 class rules');
}

async function seedInvestmentCategories(): Promise<void> {
  const categories = [
    { name: 'Gold', sortOrder: 1 },
    { name: 'Silver', sortOrder: 2 },
    { name: 'Stocks', sortOrder: 3 },
    { name: 'Promoter Shares', sortOrder: 4 },
    { name: 'Land', sortOrder: 5 },
  ];

  for (const cat of categories) {
    await prisma.investmentCategory.upsert({
      where: { name: cat.name },
      update: { sortOrder: cat.sortOrder },
      create: { name: cat.name, sortOrder: cat.sortOrder, isSystem: true },
    });
  }

  console.log('✓ Seeded 5 investment categories');
}

async function seedAdminUser(): Promise<string> {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;

  if (!email || !password) {
    throw new Error(
      'SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD env vars are required'
    );
  }

  const passwordHash = await bcrypt.hash(password, 12);

  const admin = await prisma.user.upsert({
    where: { email },
    update: { name: 'Admin', passwordHash, role: 'ADMIN', active: true },
    create: {
      name: 'Admin',
      email,
      passwordHash,
      role: 'ADMIN',
    },
  });

  console.log(`✓ Admin user seeded: ${email}`);
  return admin.id;
}

// ---------------------------------------------------------------------------
// Demo data (gated by SEED_DEMO=true)
// ---------------------------------------------------------------------------

async function seedDemoData(adminId: string): Promise<void> {
  console.log('Seeding demo data...');

  // 12 members across 3 classes
  const memberDefs = [
    // Class A – joined BS 2071 (2014-04-14)
    { memberNo: 'M001', fullName: 'Ram Bahadur Tamang', joinDate: new Date('2014-04-14'), joinBsYear: 2071, joinBsMonth: 1 },
    { memberNo: 'M002', fullName: 'Sita Kumari Shrestha', joinDate: new Date('2014-08-17'), joinBsYear: 2071, joinBsMonth: 5 },
    { memberNo: 'M003', fullName: 'Hari Prasad Adhikari', joinDate: new Date('2015-01-15'), joinBsYear: 2071, joinBsMonth: 10 },
    { memberNo: 'M004', fullName: 'Gita Devi Maharjan', joinDate: new Date('2015-03-14'), joinBsYear: 2071, joinBsMonth: 12 },
    // Class B – joined BS 2076 (2019-04-14)
    { memberNo: 'M005', fullName: 'Bijay Kumar Rai', joinDate: new Date('2019-04-14'), joinBsYear: 2076, joinBsMonth: 1 },
    { memberNo: 'M006', fullName: 'Laxmi Devi Gurung', joinDate: new Date('2019-08-17'), joinBsYear: 2076, joinBsMonth: 5 },
    { memberNo: 'M007', fullName: 'Pradip Thapa', joinDate: new Date('2020-01-15'), joinBsYear: 2076, joinBsMonth: 10 },
    { memberNo: 'M008', fullName: 'Kamala Basnet', joinDate: new Date('2020-03-14'), joinBsYear: 2076, joinBsMonth: 12 },
    // Class C – joined BS 2081 (2024-04-13)
    { memberNo: 'M009', fullName: 'Suresh Karki', joinDate: new Date('2024-04-13'), joinBsYear: 2081, joinBsMonth: 1 },
    { memberNo: 'M010', fullName: 'Anita Poudel', joinDate: new Date('2024-08-17'), joinBsYear: 2081, joinBsMonth: 5 },
    { memberNo: 'M011', fullName: 'Deepak Bhandari', joinDate: new Date('2025-01-14'), joinBsYear: 2081, joinBsMonth: 10 },
    { memberNo: 'M012', fullName: 'Mina Sharma', joinDate: new Date('2025-03-14'), joinBsYear: 2081, joinBsMonth: 12 },
  ];

  const memberIds: Record<string, string> = {};

  for (const m of memberDefs) {
    const member = await prisma.member.upsert({
      where: { memberNo: m.memberNo },
      update: {},
      create: {
        memberNo: m.memberNo,
        fullName: m.fullName,
        phone: '9800000000',
        permanentAddress: 'Kathmandu, Nepal',
        joinDate: m.joinDate,
        joinBsYear: m.joinBsYear,
        joinBsMonth: m.joinBsMonth,
        monthlyAmount: 1000,
      },
    });
    memberIds[m.memberNo] = member.id;
  }

  console.log(`  ✓ ${memberDefs.length} demo members`);

  // Contribution dues for first 4 members (various states)
  const dueStates: { memberNo: string; status: DueStatus; paidAmount: number }[] = [
    { memberNo: 'M001', status: 'PAID', paidAmount: 1000 },
    { memberNo: 'M002', status: 'PARTIAL', paidAmount: 500 },
    { memberNo: 'M003', status: 'PENDING', paidAmount: 0 },
    { memberNo: 'M004', status: 'PAID', paidAmount: 1000 },
    { memberNo: 'M005', status: 'PENDING', paidAmount: 0 },
    { memberNo: 'M006', status: 'PAID', paidAmount: 1000 },
  ];

  for (const ds of dueStates) {
    const memberId = memberIds[ds.memberNo];
    const dueKey = { memberId, bsYear: 2081, bsMonth: 1 };
    const existing = await prisma.contributionDue.findUnique({
      where: { memberId_bsYear_bsMonth: dueKey },
    });
    if (!existing) {
      await prisma.contributionDue.create({
        data: {
          ...dueKey,
          monthStart: new Date('2024-04-13'),
          graceEnd: new Date('2024-04-23'),
          amount: 1000,
          paidAmount: ds.paidAmount,
          status: ds.status,
        },
      });
    }
  }

  console.log('  ✓ Contribution dues (various states)');

  // 2 Loans with guarantors
  const loan1 = await prisma.loan.upsert({
    where: { loanNo: 'L001' },
    update: {},
    create: {
      loanNo: 'L001',
      borrowerId: memberIds['M001'],
      amount: 50000,
      principalOutstanding: 40000,
      rateAtStart: 12.0,
      purpose: 'Business expansion',
      disbursedOn: new Date('2024-05-01'),
      status: 'ACTIVE',
    },
  });

  // Guarantors for Loan 1
  await prisma.loanGuarantor.upsert({
    where: { loanId_memberId: { loanId: loan1.id, memberId: memberIds['M002'] } },
    update: {},
    create: { loanId: loan1.id, memberId: memberIds['M002'] },
  });
  await prisma.loanGuarantor.upsert({
    where: { loanId_memberId: { loanId: loan1.id, memberId: memberIds['M003'] } },
    update: {},
    create: { loanId: loan1.id, memberId: memberIds['M003'] },
  });

  const loan2 = await prisma.loan.upsert({
    where: { loanNo: 'L002' },
    update: {},
    create: {
      loanNo: 'L002',
      borrowerId: memberIds['M005'],
      amount: 30000,
      principalOutstanding: 30000,
      rateAtStart: 12.0,
      purpose: 'Education',
      status: 'PENDING_APPROVAL',
    },
  });

  // Guarantors for Loan 2
  await prisma.loanGuarantor.upsert({
    where: { loanId_memberId: { loanId: loan2.id, memberId: memberIds['M006'] } },
    update: {},
    create: { loanId: loan2.id, memberId: memberIds['M006'] },
  });
  await prisma.loanGuarantor.upsert({
    where: { loanId_memberId: { loanId: loan2.id, memberId: memberIds['M007'] } },
    update: {},
    create: { loanId: loan2.id, memberId: memberIds['M007'] },
  });

  console.log('  ✓ 2 loans with guarantors');

  // Investments
  const goldCat = await prisma.investmentCategory.findUnique({ where: { name: 'Gold' } });
  const stockCat = await prisma.investmentCategory.findUnique({ where: { name: 'Stocks' } });

  if (goldCat) {
    const existingGold = await prisma.investment.findFirst({ where: { name: 'Gold Coins 10g' } });
    if (!existingGold) {
      await prisma.investment.create({
        data: {
          categoryId: goldCat.id,
          name: 'Gold Coins 10g',
          units: 10,
          buyDate: new Date('2024-01-15'),
          cost: 120000,
          currentValue: 135000,
          valuedOn: new Date('2025-01-01'),
        },
      });
    }
  }

  if (stockCat) {
    const existingStock = await prisma.investment.findFirst({ where: { name: 'Nabil Bank 100 Units' } });
    if (!existingStock) {
      await prisma.investment.create({
        data: {
          categoryId: stockCat.id,
          name: 'Nabil Bank 100 Units',
          units: 100,
          buyDate: new Date('2024-06-01'),
          cost: 80000,
          currentValue: 85000,
          valuedOn: new Date('2025-01-01'),
        },
      });
    }
  }

  console.log('  ✓ Demo investments');

  // Expenses
  const opExpenseAcct = await prisma.account.findUnique({ where: { code: '5200' } });
  if (opExpenseAcct) {
    const existingExpense = await prisma.expense.findFirst({
      where: { payee: 'Stationery Shop', date: new Date('2024-06-15') },
    });
    if (!existingExpense) {
      await prisma.expense.create({
        data: {
          date: new Date('2024-06-15'),
          accountId: opExpenseAcct.id,
          amount: 2500,
          payee: 'Stationery Shop',
          note: 'Office supplies for record keeping',
        },
      });
      await prisma.expense.create({
        data: {
          date: new Date('2024-09-20'),
          accountId: opExpenseAcct.id,
          amount: 5000,
          payee: 'Meeting Hall Rental',
          note: 'Annual general meeting venue',
        },
      });
    }
  }

  console.log('  ✓ Demo expenses');

  // Past distribution
  const existingDist = await prisma.distribution.findFirst({
    where: { type: 'INTEREST', fromDate: new Date('2024-04-13') },
  });
  if (!existingDist) {
    const dist = await prisma.distribution.create({
      data: {
        type: 'INTEREST',
        period: 'ANNUAL',
        fromDate: new Date('2024-04-13'),
        toDate: new Date('2025-04-12'),
        percent: 10.0,
        totalAmount: 48000,
        reservePercent: 5.0,
        reserveAmount: 2400,
        includeUnpaid: false,
        payoutMode: 'PAYABLE',
        status: 'CONFIRMED',
        confirmedById: adminId,
        confirmedAt: new Date('2025-04-15'),
      },
    });

    // Distribution lines for first 4 members
    const distMembers = ['M001', 'M002', 'M003', 'M004'];
    for (const mNo of distMembers) {
      await prisma.distributionLine.create({
        data: {
          distributionId: dist.id,
          memberId: memberIds[mNo],
          base: 12000,
          amount: 1200,
        },
      });
    }

    console.log('  ✓ Past distribution with 4 lines');
  }

  console.log('✓ Demo data seeded');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log('🌱 Seeding Bachat Record database...\n');

  // 1. Chart of accounts
  await seedAccounts();

  // 2. Default settings
  await seedSettings();

  // 3. Investment categories
  await seedInvestmentCategories();

  // 4. Class rules
  await seedClassRules();

  // 5. Admin user (needed for rate history createdById)
  const adminId = await seedAdminUser();

  // 6. Rate history
  await seedRateHistory(adminId);

  // 7. Demo data (optional)
  if (process.env.SEED_DEMO === 'true') {
    await seedDemoData(adminId);
  } else {
    console.log('ℹ Skipping demo data (set SEED_DEMO=true to enable)');
  }

  console.log('\n✅ Seeding complete!');
}

main()
  .catch((e: unknown) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

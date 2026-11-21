# Bachat Record (बचत रेकर्ड)
### Group Savings, Loan & Investment Tracker

A web-based accounting and book-keeping system designed for Nepali savings groups (20 to 300 members).
Built with **Next.js 15 (App Router)**, **TypeScript Strict**, **Prisma ORM**, **Auth.js (NextAuth v5)**, **Tailwind CSS**, and **decimal.js** for exact double-entry monetary math.

---

## 🔑 Default Admin Login Credentials

When the database is seeded, the default administrator account is:

- **Email**: `admin@bachatrecord.com`
- **Password**: `changeme123`
- **Role**: `ADMIN` (Full Group Leader permissions)

> You can customize these before running the seed script by editing `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in your `.env` file.

---

## 🚀 Quick Start Guide (How to Run the Project)

### 1. Prerequisites
- **Node.js**: v20 or higher
- **pnpm**: v9 or v10 (`npm install -g pnpm`)
- **PostgreSQL Database**:
  - Local PostgreSQL instance (e.g. Docker, Postgres app), OR
  - Free **[Supabase](https://supabase.com)** Postgres database (recommended for deployment)

---

### 2. Install Dependencies

Navigate into the project directory:

```bash
cd bachat-record
pnpm install
```

---

### 3. Setup Environment Variables

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

Ensure the variables are set in `.env`:

```env
# Database Connections (For Supabase or local Postgres)
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bachat?schema=public"
DIRECT_URL="postgresql://postgres:postgres@localhost:5432/bachat?schema=public"

# Auth.js Secret (generate with: openssl rand -base64 32)
AUTH_SECRET="f6c8d4e2b0a84c6e9d2f4b6a8c0e2d4f6b8a0c2e4d6f8a0b2c4d6e8f0a2b4c6e"
AUTH_URL="http://localhost:3000"

# Field Encryption Key (32 bytes base64 for ID numbers)
FIELD_ENCRYPTION_KEY="MDEyMzQ1Njc4OTAxMjM0NTY3ODkwMTIzNDU2Nzg5MDE="

# Cron Secret for Vercel Cron / API trigger
CRON_SECRET="b6c8d4e2b0a84c6e9d2f4b6a8c0e2d4f"

# Default Seed Credentials
SEED_ADMIN_EMAIL="admin@bachatrecord.com"
SEED_ADMIN_PASSWORD="changeme123"
SEED_DEMO="true"

# Timezone
TiZ="Asia/Kathmandu"
```

---

### 4. Push Database Schema & Run Migrations

To apply the schema to your PostgreSQL database:

```bash
# Generate Prisma Client
pnpm prisma generate

# Push database schema directly to PostgreSQL
pnpm prisma db push
```

If connecting to Supabase or running production migrations:

```bash
pnpm prisma migrate deploy
```

---

### 5. Seed the Database

Seed the Chart of Accounts, default settings, global interest rates, investment categories, the Admin user, and 12 demo members:

```bash
pnpm seed
```

---

### 6. Start the Development Server

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.
Log in with:
- **Email**: `admin@bachatrecord.com`
- **Password**: `changeme123`

---

## 🧪 Testing and Verification

Run the test suite and quality checks:

```bash
# Run 17 unit tests verifying all business rules (fines, interest, loans, bonus planner)
pnpm test

# Run TypeScript strict typecheck
pnpm typecheck

# Run ESLint
pnpm lint
```

---

## ⚙️ Daily Scheduled Job (Cron)

The system includes a daily catch-up cron job that:
1. Generates monthly contribution dues for active members.
2. Posts late contribution fines (NPR 200) for unpaid dues past day 10 of the next BS month.
3. Finalizes BS monthly loan interest periods and posts loan interest fines (NPR 100).
4. Records daily audit logs in `CronRun`.

### Triggering the Cron
You can test the cron locally or in production via HTTP GET:

```bash
curl -X GET http://localhost:3000/api/cron/daily \
  -H "Authorization: Bearer b6c8d4e2b0a84c6e9d2f4b6a8c0e2d4f"
```

In production, Vercel Cron automatically triggers this at 18:30 UTC (00:15 Nepal Time) via `vercel.json`.

---

## 🚢 Deploying to Vercel + Supabase

1. **Supabase Setup**:
   - Create a free project on [Supabase](https://supabase.com).
   - In Settings > Database, copy:
     - **Transaction Connection Pooler URL** (port 6543) -> `DATABASE_URL`
     - **Direct Connection URL** (port 5432) -> `DIRECT_URL`
2. **Vercel Setup**:
   - Import the repository in [Vercel](https://vercel.com).
   - Add all environment variables from `.env.example`.
   - Set Build Command: `prisma migrate deploy && next build`
   - Deploy!

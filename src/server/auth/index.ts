import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import bcrypt from 'bcryptjs';
import { prisma } from '@/server/db';
import { authConfig } from './auth.config';

const MAX_FAILED_LOGINS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        const email = credentials?.email as string | undefined;
        const password = credentials?.password as string | undefined;

        if (!email || !password) return null;

        const user = await prisma.user.findUnique({
          where: { email },
        });

        if (!user || !user.passwordHash) return null;

        // Check if account is locked
        if (user.lockedUntil && user.lockedUntil > new Date()) {
          throw new Error('ACCOUNT_LOCKED');
        }

        const isValid = await bcrypt.compare(password, user.passwordHash);

        if (!isValid) {
          const newFailedLogins = (user.failedLogins ?? 0) + 1;

          const updateData: { failedLogins: number; lockedUntil?: Date } = {
            failedLogins: newFailedLogins,
          };

          // Lock after MAX_FAILED_LOGINS failures
          if (newFailedLogins >= MAX_FAILED_LOGINS) {
            updateData.lockedUntil = new Date(Date.now() + LOCK_DURATION_MS);
          }

          await prisma.user.update({
            where: { id: user.id },
            data: updateData,
          });

          return null;
        }

        // Successful login — reset failed login counters
        if (user.failedLogins > 0 || user.lockedUntil) {
          await prisma.user.update({
            where: { id: user.id },
            data: { failedLogins: 0, lockedUntil: null },
          });
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        };
      },
    }),
  ],
});

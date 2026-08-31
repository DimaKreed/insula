import { DrizzleAdapter } from '@auth/drizzle-adapter';
import NextAuth from 'next-auth';
import { redirect } from 'next/navigation';
import Google from 'next-auth/providers/google';
import Resend from 'next-auth/providers/resend';

import { getDb } from '@/db';
import { accounts, sessions, users, verificationTokens } from '@/db/schema';
import { env } from '@/env';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      email: string;
      name?: string | null;
      image?: string | null;
      role: string;
      tier: string;
      timezone: string;
    };
  }
}

declare module '@auth/core/jwt' {
  interface JWT {
    role?: string;
    tier?: string;
    timezone?: string;
  }
}

/**
 * Auth.js v5 — Google OAuth plus a Resend magic link, both against the Drizzle
 * adapter. Sessions are JWTs carrying role/tier/timezone so quota checks and
 * the admin gate need no extra query per request.
 */
export const { handlers, auth, signIn, signOut } = NextAuth(() => ({
  adapter: DrizzleAdapter(getDb(), {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: 'jwt' },
  pages: { signIn: '/login', verifyRequest: '/login/check-email' },
  providers: [
    Google,
    Resend({
      apiKey: env.RESEND_API_KEY,
      from: env.AUTH_EMAIL_FROM ?? 'Insula <login@insula.app>',
    }),
  ],
  callbacks: {
    async jwt({ token, user, trigger }) {
      // On sign-in `user` is the adapter row; afterwards read it again only
      // when the client asked for an update.
      if (user?.id) {
        token.sub = user.id;
      }
      if (token.sub && (user || trigger === 'update' || !token.role)) {
        const db = getDb();
        const row = await db.query.users.findFirst({
          where: (u, { eq }) => eq(u.id, token.sub!),
          columns: { role: true, tier: true, timezone: true },
        });
        token.role = row?.role ?? 'user';
        token.tier = row?.tier ?? 'free';
        token.timezone = row?.timezone ?? 'UTC';
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.sub ?? '';
      session.user.role = token.role ?? 'user';
      session.user.tier = token.tier ?? 'free';
      session.user.timezone = token.timezone ?? 'UTC';
      return session;
    },
  },
}));

export interface SessionUser {
  id: string;
  email: string;
  role: string;
  tier: string;
  timezone: string;
}

/**
 * Session user for server components and actions. Redirects rather than
 * throwing: a page and its layout render concurrently, so a page that threw
 * here would log an error before the layout's own redirect landed.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session?.user?.id) {
    redirect('/login');
  }
  const { id, email, role, tier, timezone } = session.user;
  return { id, email, role, tier, timezone };
}

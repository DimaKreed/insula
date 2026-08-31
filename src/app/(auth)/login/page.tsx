import { redirect } from 'next/navigation';

import { auth } from '@/auth';
import { LoginForm } from '@/components/auth/login-form';

export const metadata = { title: 'Sign in · Insula' };

/** The Login artboard: contour lines, wordmark, tagline, then the two paths in. */
export default async function LoginPage() {
  const session = await auth();
  if (session?.user?.id) redirect('/islands');

  return (
    <main className="relative flex min-h-dvh flex-col overflow-hidden bg-bg text-ink">
      <svg
        width="390"
        height="300"
        viewBox="0 0 390 300"
        fill="none"
        aria-hidden
        className="pointer-events-none absolute top-0 left-0 opacity-55"
      >
        <path
          d="M-30 250C50 190 140 165 230 190s150 85 190 60"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <path
          d="M-30 215C60 150 160 125 250 155s130 95 170 75"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <path
          d="M-30 180C70 110 180 90 270 125s110 100 150 85"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
        <path
          d="M-30 145C80 70 200 55 290 95s90 105 130 95"
          stroke="var(--line)"
          strokeWidth="1.5"
        />
      </svg>

      <div className="relative mx-auto flex w-full max-w-[440px] flex-1 flex-col">
        <div className="relative flex flex-col items-center gap-3.5 px-8 pt-[148px]">
          <div className="font-serif text-[46px] leading-none font-medium tracking-[-0.5px]">
            Insula
          </div>
          <svg
            width="56"
            height="10"
            viewBox="0 0 56 10"
            fill="none"
            stroke="var(--sand)"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden
          >
            <path d="M4 6c3-4 6-4 9 0s6 4 9 0 6-4 9 0 6 4 9 0 6-4 9 0" />
          </svg>
          <p className="text-center text-base text-ink2">
            Your daily life, in Romanian.
          </p>
        </div>

        <div className="flex-1" />

        <LoginForm />
      </div>
    </main>
  );
}

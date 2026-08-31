'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';

import { signInWithEmail, signInWithGoogle } from '@/actions/auth';

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

function SubmitButton({
  className,
  icon,
  label,
  pendingLabel,
}: {
  className: string;
  icon?: React.ReactNode;
  label: string;
  pendingLabel: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {icon}
      {pending ? pendingLabel : label}
    </button>
  );
}

export function LoginForm() {
  const [error, sendLink] = useActionState(signInWithEmail, null);

  return (
    <div className="relative flex flex-col gap-3.5 px-6 pb-6">
      <form action={signInWithGoogle}>
        <SubmitButton
          className="flex h-[52px] w-full items-center justify-center gap-2.5 rounded-[14px] border border-line bg-surface text-[15px] font-semibold shadow-card transition-colors hover:bg-surface2 disabled:opacity-60"
          icon={<GoogleMark />}
          label="Continue with Google"
          pendingLabel="Opening Google…"
        />
      </form>

      <div className="flex items-center gap-3 py-1">
        <div className="h-px flex-1 bg-line" />
        <span className="text-xs text-ink3">or</span>
        <div className="h-px flex-1 bg-line" />
      </div>

      <form action={sendLink} className="flex flex-col gap-3.5">
        <input
          type="email"
          name="email"
          required
          autoComplete="email"
          placeholder="you@work.com"
          aria-label="Email address"
          className="h-[52px] rounded-[14px] border border-line bg-surface px-[18px] text-[15px] text-ink outline-none placeholder:text-ink3 focus-visible:border-teal"
        />
        <SubmitButton
          className="flex h-[52px] items-center justify-center rounded-[14px] bg-primary text-[15px] font-semibold text-on-primary transition-opacity hover:opacity-90 disabled:opacity-60"
          label="Send magic link"
          pendingLabel="Sending…"
        />
      </form>

      {error ? (
        <p className="rounded-xl bg-err-soft px-3 py-2 text-center text-[13px] text-err">
          {error}
        </p>
      ) : null}

      <p className="pt-0.5 text-center text-[12.5px] text-ink3">
        No password — we email you a sign-in link.
      </p>
    </div>
  );
}

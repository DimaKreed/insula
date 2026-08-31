import Link from 'next/link';

export const metadata = { title: 'Check your email · Insula' };

export default function CheckEmailPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-bg px-8 text-center text-ink">
      <div className="font-serif text-[34px] leading-none font-medium">
        Check your email
      </div>
      <p className="max-w-[320px] text-[15px] leading-relaxed text-ink2">
        We sent you a sign-in link. Open it on this device and you&apos;re in —
        the link works once and expires in 24 hours.
      </p>
      <Link
        href="/login"
        className="text-[14.5px] font-semibold text-teal hover:underline"
      >
        Use a different email
      </Link>
    </main>
  );
}

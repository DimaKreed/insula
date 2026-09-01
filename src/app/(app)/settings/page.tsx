import { requireUser } from '@/auth';
import { ListenHintControl } from '@/components/settings/listen-hint-control';
import { userSettings } from '@/db/queries/users';
import { listenHintMode } from '@/lib/player/listen-hints';

export const metadata = { title: 'Settings · Insula' };

/**
 * The Settings artboard, so far only the part that has something to configure.
 * Voice, daily new cards, usage meter and appearance arrive with the phases
 * that own them; a row that cannot change anything yet is not shipped.
 */
export default async function SettingsPage() {
  const user = await requireUser();
  const settings = await userSettings(user.id);

  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-3 px-5 pt-14 pb-8">
      <h1 className="px-1 text-[28px] font-bold tracking-[-0.4px]">Settings</h1>

      <div className="flex items-center gap-3 rounded-[16px] border border-line bg-surface px-3.5 py-3 shadow-card">
        <div className="flex size-11 items-center justify-center rounded-full bg-sand-soft text-[15px] font-bold text-sand-ink">
          {user.email.slice(0, 2).toUpperCase()}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-px">
          <span className="truncate text-[15.5px] font-semibold">
            {user.email}
          </span>
          <span className="text-[12.5px] text-ink3">
            {user.tier === 'pro' ? 'Pro plan' : 'Free plan'}
          </span>
        </div>
      </div>

      <div className="px-1 pt-2 text-xs font-bold tracking-[1.2px] text-ink3 uppercase">
        Learning
      </div>
      <div className="rounded-[16px] border border-line bg-surface px-3.5 py-3.5 shadow-card">
        <ListenHintControl value={listenHintMode(settings)} />
      </div>
    </div>
  );
}

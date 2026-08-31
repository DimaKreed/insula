/**
 * Voice resolution for the bake-off.
 *
 * Two providers can't be judged from a hardcoded list:
 *
 * - **ElevenLabs** has no ro-RO catalog. The good Romanian voices live in the
 *   community Voice Library and must be added to the account before use, so we
 *   look for Romanian voices already on the account, otherwise pull the top two
 *   from the library, otherwise fall back to premade multilingual voices.
 * - **Google's** ro-RO voice ids differ by project and change between voice
 *   generations, so we ask the API which ones exist and prefer the newest tier.
 *
 * Azure and OpenAI have small, stable catalogs — their adapters' lists stand.
 */
import type { TtsProvider, Voice } from '../src/lib/tts/provider';
import { listGoogleVoices } from '../src/lib/tts/google';

const MAX_VOICES = 2;

export async function resolveVoices(
  provider: TtsProvider,
  lang: string,
): Promise<Voice[]> {
  try {
    if (provider.name === 'elevenlabs') return await elevenlabsVoices(provider, lang);
    if (provider.name === 'google') return await googleVoices(provider, lang);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.log(
      `  ! ${provider.name}: voice discovery failed (${message}) — using built-in list`,
    );
  }
  return provider.voices().slice(0, MAX_VOICES);
}

async function googleVoices(
  provider: TtsProvider,
  lang: string,
): Promise<Voice[]> {
  const available = await listGoogleVoices(lang);
  if (!available.length) return provider.voices().slice(0, MAX_VOICES);

  // Best tier first: Chirp 3 HD > Neural2 > Wavenet > Standard.
  const rank = (id: string) =>
    id.includes('Chirp3-HD') ? 0
    : id.includes('Neural2') ? 1
    : id.includes('Wavenet') ? 2
    : 3;

  const picked: Voice[] = [];
  const seenTiers = new Set<number>();
  for (const voice of [...available].sort((a, b) => rank(a.id) - rank(b.id))) {
    // One voice per tier, so the two samples aren't near-identical.
    if (seenTiers.has(rank(voice.id))) continue;
    seenTiers.add(rank(voice.id));
    picked.push(voice);
    if (picked.length === MAX_VOICES) break;
  }
  return picked;
}

type ElevenVoice = { voice_id: string; name: string };

async function elevenlabsVoices(
  provider: TtsProvider,
  lang: string,
): Promise<Voice[]> {
  const code = lang.split('-')[0];
  const headers = { 'xi-api-key': process.env.ELEVENLABS_API_KEY! };

  const onAccount = await fetchJson<{ voices?: ElevenVoice[] }>(
    `https://api.elevenlabs.io/v2/voices?language=${code}&page_size=${MAX_VOICES}`,
    { headers },
  );
  const existing = (onAccount.voices ?? []).slice(0, MAX_VOICES);
  if (existing.length) {
    return existing.map((v) => ({
      id: v.voice_id,
      label: `${v.name} (account)`,
      lang,
    }));
  }

  const library = await fetchJson<{
    voices?: (ElevenVoice & { public_owner_id: string })[];
  }>(
    `https://api.elevenlabs.io/v1/shared-voices?language=${code}&page_size=${MAX_VOICES}&sort=trending`,
    { headers },
  );

  const added: Voice[] = [];
  for (const shared of (library.voices ?? []).slice(0, MAX_VOICES)) {
    const result = await fetchJson<{ voice_id: string }>(
      `https://api.elevenlabs.io/v1/voices/add/${shared.public_owner_id}/${shared.voice_id}`,
      {
        method: 'POST',
        headers: { ...headers, 'content-type': 'application/json' },
        body: JSON.stringify({ new_name: `${shared.name} (RO)` }),
      },
    );
    added.push({ id: result.voice_id, label: `${shared.name} (library)`, lang });
    console.log(`  + added library voice "${shared.name}" to the account`);
  }

  if (added.length) return added;

  console.log(
    '  ! elevenlabs: no Romanian voices found — falling back to premade multilingual voices',
  );
  return provider.voices().slice(0, MAX_VOICES);
}

async function fetchJson<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} on ${url}: ${(await res.text()).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

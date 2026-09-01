import { createSign } from 'node:crypto';

import {
  assertConfigured,
  fetchRetrying,
  requestFailed,
  type ConfigCheck,
  type SynthesizeInput,
  type SynthesizeResult,
  type TtsProvider,
  type Voice,
} from './provider';

/**
 * Google Cloud Text-to-Speech (v1).
 *
 * Canonical-format deviation: v1's `MP3` encoding is 32 kbps CBR — the only MP3
 * bitrate v1 offers (v1beta1 adds 64 kbps; higher needs LINEAR16 + local
 * re-encoding). `sampleRateHertz: 44100` and mono do match the canonical
 * format, so byte-concatenation of same-voice segments still works.
 *
 * Auth: self-signed service-account JWT sent directly as a bearer token
 * (Google's "service account authorization without OAuth" flow) — no token
 * exchange round-trip, no google-auth-library dependency.
 */
const ENDPOINT = 'https://texttospeech.googleapis.com/v1/text:synthesize';
const AUDIENCE = 'https://texttospeech.googleapis.com/';

type ServiceAccount = {
  client_email: string;
  private_key: string;
  private_key_id?: string;
};

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/** `GOOGLE_TTS_CREDENTIALS` holds the service-account JSON, base64-encoded. */
function readServiceAccount(): ServiceAccount {
  const raw = Buffer.from(
    process.env.GOOGLE_TTS_CREDENTIALS!,
    'base64',
  ).toString('utf8');

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      'GOOGLE_TTS_CREDENTIALS is not base64-encoded service-account JSON',
    );
  }

  const sa = parsed as Partial<ServiceAccount>;
  if (!sa.client_email || !sa.private_key) {
    throw new Error(
      'GOOGLE_TTS_CREDENTIALS is missing client_email or private_key',
    );
  }
  return sa as ServiceAccount;
}

function signJwt(sa: ServiceAccount): string {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(
    JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: sa.private_key_id }),
  );
  const claims = base64url(
    JSON.stringify({
      iss: sa.client_email,
      sub: sa.client_email,
      aud: AUDIENCE,
      iat: now,
      exp: now + 3600,
    }),
  );
  const signature = createSign('RSA-SHA256')
    .update(`${header}.${claims}`)
    .sign(sa.private_key);

  return `${header}.${claims}.${base64url(signature)}`;
}

export const google: TtsProvider = {
  name: 'google',
  // Neural2/Studio list price ≈ $16 per 1M characters.
  costMicrosPerChar: 16,

  isConfigured(): ConfigCheck {
    return process.env.GOOGLE_TTS_CREDENTIALS
      ? { ok: true }
      : { ok: false, missing: ['GOOGLE_TTS_CREDENTIALS'] };
  },

  voices(): Voice[] {
    return [
      { id: 'ro-RO-Chirp3-HD-Kore', label: 'Kore (Chirp 3 HD)', lang: 'ro-RO' },
      { id: 'ro-RO-Wavenet-A', label: 'Wavenet A', lang: 'ro-RO' },
      // English, for the hint audio Listen and Recall play before the Romanian.
      { id: 'en-US-Neural2-F', label: 'Neural2 F', lang: 'en-US' },
    ];
  },

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    assertConfigured(google);

    const res = await fetchRetrying(ENDPOINT, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${signJwt(readServiceAccount())}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        input: { text: input.text },
        voice: { languageCode: input.lang, name: input.voiceId },
        audioConfig: { audioEncoding: 'MP3', sampleRateHertz: 44100 },
      }),
    });

    if (!res.ok) {
      throw requestFailed('google', res.status, await res.text());
    }

    const body = (await res.json()) as { audioContent?: string };
    if (!body.audioContent) {
      throw new Error('google TTS response contained no audioContent');
    }

    return {
      audio: Buffer.from(body.audioContent, 'base64'),
      format: 'mp3',
      charCount: input.text.length,
    };
  },
};

/** Romanian voices actually available to this project. Used by the bake-off. */
export async function listGoogleVoices(lang: string): Promise<Voice[]> {
  assertConfigured(google);

  const url = new URL('https://texttospeech.googleapis.com/v1/voices');
  url.searchParams.set('languageCode', lang);

  const res = await fetch(url, {
    headers: { authorization: `Bearer ${signJwt(readServiceAccount())}` },
  });
  if (!res.ok) {
    throw requestFailed('google', res.status, await res.text());
  }

  const body = (await res.json()) as { voices?: { name: string }[] };
  return (body.voices ?? []).map((v) => ({
    id: v.name,
    label: v.name.replace(`${lang}-`, ''),
    lang,
  }));
}

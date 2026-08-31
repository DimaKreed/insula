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
 * OpenAI TTS.
 *
 * Canonical-format deviation: neither sample rate nor bitrate is configurable —
 * `response_format: 'mp3'` returns whatever the model emits (documented as
 * fixed, rate unspecified). Same-voice concatenation still works because every
 * segment comes out of the same encoder.
 *
 * OpenAI has no dedicated Romanian voice; these are general voices steered
 * toward Romanian via `instructions`, which is what makes this provider worth
 * hearing at all in the bake-off.
 */
const MODEL = 'gpt-4o-mini-tts';

const INSTRUCTIONS: Record<string, string> = {
  ro: 'Speak in fluent, natural Romanian with a native Bucharest accent, at a normal conversational pace.',
};

export const openai: TtsProvider = {
  name: 'openai',
  // gpt-4o-mini-tts list price ≈ $15 per 1M characters.
  costMicrosPerChar: 15,

  isConfigured(): ConfigCheck {
    return process.env.OPENAI_API_KEY
      ? { ok: true }
      : { ok: false, missing: ['OPENAI_API_KEY'] };
  },

  voices(): Voice[] {
    return [
      { id: 'nova', label: 'Nova', lang: 'ro-RO' },
      { id: 'marin', label: 'Marin', lang: 'ro-RO' },
    ];
  },

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    assertConfigured(openai);

    const res = await fetchRetrying('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        input: input.text,
        voice: input.voiceId,
        response_format: 'mp3',
        instructions: INSTRUCTIONS[input.lang.split('-')[0]],
      }),
    });

    if (!res.ok) {
      throw requestFailed('openai', res.status, await res.text());
    }

    return {
      audio: Buffer.from(await res.arrayBuffer()),
      format: 'mp3',
      charCount: input.text.length,
    };
  },
};

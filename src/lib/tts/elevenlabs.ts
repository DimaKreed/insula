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
 * ElevenLabs. The only provider that natively emits the canonical format:
 * `mp3_44100_128` = MP3, 44.1 kHz, 128 kbps CBR, mono.
 *
 * Voices: ElevenLabs has no fixed `ro-RO` catalog — the multilingual model
 * speaks Romanian with any voice, and the good Romanian voices live in the
 * community Voice Library and must be added to the account first. The two
 * listed here are premade multilingual voices that always exist; the bake-off
 * script discovers account/library Romanian voices at runtime.
 */
const MODEL_ID = 'eleven_multilingual_v2';
const OUTPUT_FORMAT = 'mp3_44100_128';

export const elevenlabs: TtsProvider = {
  name: 'elevenlabs',
  // Creator tier ≈ $22 per 100k characters.
  costMicrosPerChar: 220,

  isConfigured(): ConfigCheck {
    return process.env.ELEVENLABS_API_KEY
      ? { ok: true }
      : { ok: false, missing: ['ELEVENLABS_API_KEY'] };
  },

  voices(): Voice[] {
    return [
      { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda (multilingual)', lang: 'ro-RO' },
      { id: 'onwK4e9ZLuTAKqWW03F9', label: 'Daniel (multilingual)', lang: 'ro-RO' },
      // English, for the hint audio Listen and Recall play before the Romanian
      // — the same multilingual model, asked for a different language.
      { id: 'XrExE9yKIg1WjnnlVkGX', label: 'Matilda (multilingual)', lang: 'en-US' },
    ];
  },

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    assertConfigured(elevenlabs);

    const url = new URL(
      `https://api.elevenlabs.io/v1/text-to-speech/${input.voiceId}`,
    );
    url.searchParams.set('output_format', OUTPUT_FORMAT);

    const res = await fetchRetrying(url, {
      method: 'POST',
      headers: {
        'xi-api-key': process.env.ELEVENLABS_API_KEY!,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: input.text,
        model_id: MODEL_ID,
        // ElevenLabs wants the bare language code, not the full BCP-47 tag.
        language_code: input.lang.split('-')[0],
      }),
    });

    if (!res.ok) {
      throw requestFailed('elevenlabs', res.status, await res.text());
    }

    return {
      audio: Buffer.from(await res.arrayBuffer()),
      format: 'mp3',
      charCount: input.text.length,
    };
  },
};

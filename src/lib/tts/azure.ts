import {
  assertConfigured,
  requestFailed,
  type ConfigCheck,
  type SynthesizeInput,
  type SynthesizeResult,
  type TtsProvider,
  type Voice,
} from './provider';

/**
 * Azure AI Speech.
 *
 * Canonical-format deviation: Azure offers no 44.1 kHz MP3 at all — its MP3
 * ladder is 16/24/48 kHz. We take the top of it, 48 kHz 192 kbps CBR mono,
 * which also selects Azure's high-fidelity 48 kHz voice model. Mono + CBR hold,
 * so same-voice byte-concatenation still works.
 */
const OUTPUT_FORMAT = 'audio-48khz-192kbitrate-mono-mp3';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export const azure: TtsProvider = {
  name: 'azure',

  isConfigured(): ConfigCheck {
    const missing = (
      ['AZURE_SPEECH_KEY', 'AZURE_SPEECH_REGION'] as const
    ).filter((key) => !process.env[key]);
    return missing.length === 0 ? { ok: true } : { ok: false, missing };
  },

  voices(): Voice[] {
    return [
      { id: 'ro-RO-AlinaNeural', label: 'Alina (neural)', lang: 'ro-RO' },
      { id: 'ro-RO-EmilNeural', label: 'Emil (neural)', lang: 'ro-RO' },
    ];
  },

  async synthesize(input: SynthesizeInput): Promise<SynthesizeResult> {
    assertConfigured(azure);

    const ssml =
      `<speak version='1.0' xml:lang='${input.lang}'>` +
      `<voice name='${input.voiceId}'>${escapeXml(input.text)}</voice>` +
      `</speak>`;

    const res = await fetch(
      `https://${process.env.AZURE_SPEECH_REGION}.tts.speech.microsoft.com/cognitiveservices/v1`,
      {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': process.env.AZURE_SPEECH_KEY!,
          'content-type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': OUTPUT_FORMAT,
          // Azure documents User-Agent as required.
          'user-agent': 'insula',
        },
        body: ssml,
      },
    );

    if (!res.ok) {
      throw requestFailed('azure', res.status, await res.text());
    }

    return {
      audio: Buffer.from(await res.arrayBuffer()),
      format: 'mp3',
      charCount: input.text.length,
    };
  },
};

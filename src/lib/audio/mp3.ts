/**
 * Duration of a constant-bitrate MP3, read from its first frame header.
 *
 * Every TTS adapter emits CBR by contract (`src/lib/tts/provider.ts`), which is
 * what makes Phase 4's byte-concatenation work — and it also makes duration
 * plain arithmetic: payload bytes ÷ bitrate. Cheaper and more predictable than
 * shipping a decoder, and the player needs the number server-side to size
 * Shadow-mode gaps before any audio has loaded.
 *
 * Returns null rather than guessing when no frame header can be found.
 */

// kbps by bitrate index, Layer III.
const BITRATES_V1 = [
  0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
];
const BITRATES_V2 = [
  0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160,
];
// Hz by sample-rate index, per MPEG version.
const SAMPLE_RATES: Record<number, number[]> = {
  3: [44100, 48000, 32000], // MPEG 1
  2: [22050, 24000, 16000], // MPEG 2
  0: [11025, 12000, 8000], // MPEG 2.5
};

/** Byte offset of the audio data, skipping an ID3v2 tag if the file has one. */
function audioStart(buffer: Buffer): number {
  if (buffer.length < 10 || buffer.toString('latin1', 0, 3) !== 'ID3') return 0;
  // Syncsafe 28-bit size, excluding the 10-byte header itself.
  const size =
    (buffer[6] << 21) | (buffer[7] << 14) | (buffer[8] << 7) | buffer[9];
  return Math.min(10 + size, buffer.length);
}

export function mp3DurationMs(buffer: Buffer): number | null {
  const start = audioStart(buffer);

  for (let i = start; i + 3 < buffer.length; i++) {
    if (buffer[i] !== 0xff || (buffer[i + 1] & 0xe0) !== 0xe0) continue;

    const version = (buffer[i + 1] >> 3) & 0x03; // 3 = MPEG1, 2 = MPEG2, 0 = 2.5
    const layer = (buffer[i + 1] >> 1) & 0x03; // 1 = Layer III
    const bitrateIndex = (buffer[i + 2] >> 4) & 0x0f;
    const sampleRateIndex = (buffer[i + 2] >> 2) & 0x03;

    const rates = SAMPLE_RATES[version];
    if (layer !== 1 || !rates || sampleRateIndex === 3) continue;
    if (bitrateIndex === 0 || bitrateIndex === 0x0f) continue;

    const kbps = (version === 3 ? BITRATES_V1 : BITRATES_V2)[bitrateIndex];
    if (!kbps) continue;

    return Math.round(((buffer.length - i) * 8) / kbps);
  }

  return null;
}

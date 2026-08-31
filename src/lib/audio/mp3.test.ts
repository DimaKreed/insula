import { describe, expect, it } from 'vitest';

import { mp3DurationMs } from './mp3';

/**
 * Builds a fake CBR MP3: an optional ID3v2 tag, one frame header, then padding.
 * Duration is payload ÷ bitrate, so the byte count is the expected answer.
 */
function fakeMp3({
  bytes,
  kbps = 192,
  id3Bytes = 0,
}: {
  bytes: number;
  kbps?: number;
  id3Bytes?: number;
}): Buffer {
  const bitrateIndex = [
    0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320,
  ].indexOf(kbps);

  const id3 = Buffer.alloc(id3Bytes);
  if (id3Bytes > 0) {
    id3.write('ID3', 0, 'latin1');
    const size = id3Bytes - 10;
    id3[6] = (size >> 21) & 0x7f;
    id3[7] = (size >> 14) & 0x7f;
    id3[8] = (size >> 7) & 0x7f;
    id3[9] = size & 0x7f;
  }

  const audio = Buffer.alloc(bytes);
  audio[0] = 0xff;
  audio[1] = 0xfb; // MPEG 1, Layer III, no CRC
  audio[2] = (bitrateIndex << 4) | (0 << 2); // 44.1 kHz
  audio[3] = 0xc0; // mono

  return Buffer.concat([id3, audio]);
}

describe('mp3DurationMs', () => {
  it('derives duration from payload size and bitrate', () => {
    // 48 000 bytes at 192 kbps = 2 000 ms.
    expect(mp3DurationMs(fakeMp3({ bytes: 48_000 }))).toBe(2000);
    expect(mp3DurationMs(fakeMp3({ bytes: 48_000, kbps: 96 }))).toBe(4000);
  });

  it('skips an ID3v2 tag rather than counting it as audio', () => {
    const withTag = fakeMp3({ bytes: 48_000, id3Bytes: 4_096 });
    expect(mp3DurationMs(withTag)).toBe(2000);
  });

  it('returns null when there is no frame header to read', () => {
    expect(mp3DurationMs(Buffer.alloc(2048))).toBeNull();
    expect(mp3DurationMs(Buffer.alloc(0))).toBeNull();
  });
});

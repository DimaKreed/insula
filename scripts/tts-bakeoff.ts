/**
 * Phase 0 TTS bake-off — run with `npm run bakeoff`.
 *
 * Synthesizes the three fixed Romanian test sentences from `TTS Bake-off.md`
 * with every CONFIGURED provider × 1–2 Romanian voices, writes the MP3s to
 * bakeoff-output/, and generates a self-contained blind A/B listening page.
 *
 * Unconfigured providers are skipped and reported, never fatal.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { TtsProvider, Voice } from '../src/lib/tts/provider';

// tsx does not load .env files; do it before importing anything that reads env.
for (const file of ['.env.local', '.env']) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Absent file is fine — providers report their own missing vars.
  }
}

const LANG = 'ro-RO';
const OUT_DIR = path.resolve('bakeoff-output');

/** Verbatim from `TTS Bake-off.md` — stress ă/î/â/ș/ț, question intonation, everyday register. */
const SENTENCES = [
  'Bună dimineața! Aș vrea o cafea cu lapte și un croissant, vă rog.',
  'Îmi pare rău, nu înțeleg. Puteți să vorbiți puțin mai rar?',
  'Astăzi lucrez de acasă, iar seara merg la alergat în parc.',
];

type Sample = {
  provider: string;
  voiceId: string;
  voiceLabel: string;
  sentenceIndex: number;
  file: string;
};

async function main() {
  const { ttsProviders } = await import('../src/lib/tts/index');
  const { resolveVoices } = await import('./bakeoff-voices');

  await mkdir(OUT_DIR, { recursive: true });

  const samples: Sample[] = [];
  const skipped: { provider: string; reason: string }[] = [];
  const failures: string[] = [];

  for (const provider of Object.values(ttsProviders)) {
    const config = provider.isConfigured();
    if (!config.ok) {
      skipped.push({
        provider: provider.name,
        reason: `missing ${config.missing.join(', ')}`,
      });
      continue;
    }

    const voices = await resolveVoices(provider, LANG);
    console.log(
      `\n${provider.name}: ${voices.map((v) => v.label).join(', ')}`,
    );

    const wrote = await synthesizeVoices(provider, voices, samples, failures);

    // ElevenLabs' free plan rejects library voices via API (HTTP 402,
    // paid_plan_required). Premade voices still work there, so retry with
    // the adapter's built-in list rather than leaving the provider empty.
    if (wrote === 0 && failures.some((f) => f.includes('paid_plan_required'))) {
      const fallback = provider
        .voices()
        .filter((v) => !voices.some((x) => x.id === v.id))
        .slice(0, 2);
      if (fallback.length) {
        console.log(
          `  ! ${provider.name}: these voices need a paid plan — retrying with built-in premade voices`,
        );
        await synthesizeVoices(provider, fallback, samples, failures);
      }
    }
  }

  await writeFile(
    path.join(OUT_DIR, 'index.html'),
    renderPage(samples, skipped, failures),
    'utf8',
  );

  console.log(`\n${samples.length} clip(s) written to bakeoff-output/`);
  if (skipped.length) {
    console.log('\nSkipped providers:');
    for (const s of skipped) console.log(`  - ${s.provider}: ${s.reason}`);
    console.log('  Add the keys to .env.local and re-run `npm run bakeoff`.');
  }
  if (failures.length) {
    console.log('\nFailures:');
    for (const f of failures) console.log(`  - ${f}`);
  }
  console.log(`\nOpen ${path.join(OUT_DIR, 'index.html')} to listen.`);
}

/** Synthesize every sentence with each voice; returns how many clips succeeded. */
async function synthesizeVoices(
  provider: TtsProvider,
  voices: Voice[],
  samples: Sample[],
  failures: string[],
): Promise<number> {
  let wrote = 0;
  for (const voice of voices) {
    for (const [index, text] of SENTENCES.entries()) {
      const slug = voice.id.replace(/[^a-zA-Z0-9-]/g, '_');
      const file = `${provider.name}-${slug}-${index + 1}.mp3`;
      try {
        const result = await provider.synthesize({
          text,
          lang: LANG,
          voiceId: voice.id,
        });
        await writeFile(path.join(OUT_DIR, file), result.audio);
        samples.push({
          provider: provider.name,
          voiceId: voice.id,
          voiceLabel: voice.label,
          sentenceIndex: index,
          file,
        });
        wrote++;
        console.log(`  ✓ ${file} (${result.audio.length} bytes)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        failures.push(`${provider.name}/${voice.label} #${index + 1}: ${message}`);
        console.log(`  ✗ ${file} — ${message}`);
      }
    }
  }
  return wrote;
}

/** Deterministic shuffle so blind-mode ordering doesn't leak provider order. */
function shuffle<T>(items: T[], seed: number): T[] {
  const out = [...items];
  let state = seed * 2654435761 + 1;
  for (let i = out.length - 1; i > 0; i--) {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderPage(
  samples: Sample[],
  skipped: { provider: string; reason: string }[],
  failures: string[],
): string {
  const sections = SENTENCES.map((text, index) => {
    const rows = shuffle(
      samples.filter((s) => s.sentenceIndex === index),
      index + 1,
    );

    if (!rows.length) {
      return `<section><h2>Sentence ${index + 1}</h2>
      <p class="ro">${escapeHtml(text)}</p>
      <p class="empty">No audio generated for this sentence.</p></section>`;
    }

    const items = rows
      .map(
        (s, i) => `        <li>
          <div class="label">
            <span class="blind">Sample ${String.fromCharCode(65 + i)}</span>
            <span class="reveal">${escapeHtml(s.provider)} — ${escapeHtml(s.voiceLabel)}</span>
          </div>
          <audio controls preload="none" src="${escapeHtml(s.file)}"></audio>
        </li>`,
      )
      .join('\n');

    return `<section>
      <h2>Sentence ${index + 1}</h2>
      <p class="ro">${escapeHtml(text)}</p>
      <ol class="samples">
${items}
      </ol>
    </section>`;
  }).join('\n');

  const notes = [
    skipped.length
      ? `<div class="note"><strong>Skipped providers</strong><ul>${skipped
          .map(
            (s) =>
              `<li>${escapeHtml(s.provider)} — ${escapeHtml(s.reason)}</li>`,
          )
          .join('')}</ul>Add the keys to <code>.env.local</code> and re-run <code>npm run bakeoff</code>.</div>`
      : '',
    failures.length
      ? `<div class="note error"><strong>Failures</strong><ul>${failures
          .map((f) => `<li>${escapeHtml(f)}</li>`)
          .join('')}</ul></div>`
      : '',
    samples.length === 0
      ? `<div class="note error"><strong>No audio was generated.</strong> No TTS provider is configured yet.</div>`
      : '',
  ]
    .filter(Boolean)
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Insula — Romanian TTS bake-off</title>
<style>
  :root { color-scheme: light dark; }
  body { font: 16px/1.5 system-ui, sans-serif; max-width: 46rem; margin: 0 auto; padding: 2rem 1rem 4rem; }
  h1 { margin-bottom: .25rem; }
  .sub { color: #666; margin-top: 0; }
  .toolbar { position: sticky; top: 0; background: Canvas; padding: .75rem 0; border-bottom: 1px solid #8884; margin-bottom: 1rem; }
  label.toggle { display: flex; gap: .5rem; align-items: center; font-weight: 600; cursor: pointer; }
  section { margin: 2rem 0; }
  h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: .05em; color: #888; margin-bottom: .25rem; }
  .ro { font-size: 1.15rem; margin: .25rem 0 1rem; }
  ol.samples { list-style: none; padding: 0; margin: 0; display: grid; gap: .75rem; }
  ol.samples li { display: grid; gap: .35rem; padding: .75rem; border: 1px solid #8884; border-radius: .5rem; }
  .label { font-weight: 600; font-variant-numeric: tabular-nums; }
  audio { width: 100%; }
  .reveal { display: none; }
  body.revealed .blind { display: none; }
  body.revealed .reveal { display: inline; }
  .note { border: 1px solid #8884; border-left: 4px solid #999; padding: .75rem 1rem; border-radius: .25rem; margin: 1rem 0; }
  .note.error { border-left-color: #c33; }
  .note ul { margin: .5rem 0 0; padding-left: 1.25rem; }
  .empty { color: #888; font-style: italic; }
  code { background: #8882; padding: .1rem .3rem; border-radius: .2rem; }
</style>
</head>
<body>
<h1>Romanian TTS bake-off</h1>
<p class="sub">Judge by ear first: naturalness, pronunciation of ă/î/â/ș/ț, question intonation, pace. Reveal the labels only after you have a favourite.</p>
<div class="toolbar">
  <label class="toggle"><input type="checkbox" id="reveal"> Show provider labels</label>
</div>
${notes}
${sections}
<script>
  document.getElementById('reveal').addEventListener('change', (e) => {
    document.body.classList.toggle('revealed', e.target.checked);
  });
  // Only one clip plays at a time.
  document.addEventListener('play', (e) => {
    for (const a of document.querySelectorAll('audio')) {
      if (a !== e.target) a.pause();
    }
  }, true);
</script>
</body>
</html>
`;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

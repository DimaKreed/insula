import { azure } from './azure';
import { elevenlabs } from './elevenlabs';
import { google } from './google';
import { openai } from './openai';
import type { TtsProvider, TtsProviderName } from './provider';

export const ttsProviders: Record<TtsProviderName, TtsProvider> = {
  elevenlabs,
  google,
  azure,
  openai,
};

/** The provider the app synthesizes with, selected by the TTS_PROVIDER env var. */
export function getTtsProvider(name?: TtsProviderName): TtsProvider {
  const selected = name ?? (process.env.TTS_PROVIDER as TtsProviderName | undefined);
  if (!selected) {
    throw new Error(
      'TTS_PROVIDER is not set — use elevenlabs | google | azure | openai',
    );
  }
  const provider = ttsProviders[selected];
  if (!provider) {
    throw new Error(`Unknown TTS_PROVIDER "${selected}"`);
  }
  return provider;
}

export * from './provider';

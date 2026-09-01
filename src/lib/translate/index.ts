import { claude } from './claude';
import { gemini } from './gemini';
import type { TranslationProvider, TranslationProviderName } from './provider';

export const translationProviders: Record<
  TranslationProviderName,
  TranslationProvider
> = {
  gemini,
  claude,
};

/**
 * The provider the app calls the model through, selected by TRANSLATION_PROVIDER.
 * Defaults to Gemini: its free tier is what lets the app run without a paid key.
 */
export function getTranslationProvider(
  name?: TranslationProviderName,
): TranslationProvider {
  const selected =
    name ??
    (process.env.TRANSLATION_PROVIDER as TranslationProviderName | undefined) ??
    'gemini';
  const provider = translationProviders[selected];
  if (!provider) {
    throw new Error(
      `Unknown TRANSLATION_PROVIDER "${selected}" — use gemini | claude`,
    );
  }
  return provider;
}

export * from './provider';
export * from './translate';

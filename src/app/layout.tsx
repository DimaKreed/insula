import { SerwistProvider } from '@serwist/next/react';
import type { Metadata, Viewport } from 'next';
import { Newsreader, Schibsted_Grotesk } from 'next/font/google';
import { Toaster } from 'sonner';

import './globals.css';

// The design's two faces: UI in Schibsted Grotesk, Romanian always in the serif.
const schibsted = Schibsted_Grotesk({
  variable: '--font-schibsted',
  subsets: ['latin'],
  display: 'swap',
});

const newsreader = Newsreader({
  variable: '--font-newsreader',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Insula',
  description: 'Your daily life, in Romanian.',
  // Installed-app metadata; the manifest itself comes from src/app/manifest.ts.
  applicationName: 'Insula',
  appleWebApp: { capable: true, title: 'Insula', statusBarStyle: 'default' },
  icons: { icon: '/icon-192.png', apple: '/apple-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  // Matches the palette in globals.css, so the status bar blends into the app.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f9f6ef' },
    { media: '(prefers-color-scheme: dark)', color: '#1b2431' },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${schibsted.variable} ${newsreader.variable}`}>
        {/* Registers public/sw.js, which `serwist build` writes after
            `next build`. Off in development, where the file does not exist and
            caching a recompiling app only produces confusing staleness. The
            bundle esbuild emits is a classic script, not an ES module. */}
        <SerwistProvider
          swUrl="/sw.js"
          disable={process.env.NODE_ENV === 'development'}
          options={{ type: 'classic' }}
        >
          {children}
        </SerwistProvider>
        <Toaster position="top-center" />
      </body>
    </html>
  );
}

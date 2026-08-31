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
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className={`${schibsted.variable} ${newsreader.variable}`}>
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}

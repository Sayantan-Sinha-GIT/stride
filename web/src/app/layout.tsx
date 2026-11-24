import type { Metadata } from 'next';
import {
  JetBrains_Mono,
  Noto_Sans_Devanagari,
  Plus_Jakarta_Sans,
  Space_Grotesk,
  Syne,
} from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/components/AuthProvider';
import { SmoothScrollProvider } from '@/components/SmoothScrollProvider';
import { ThemeProvider } from '@/components/ThemeProvider';

const fontEditorial = Syne({
  subsets: ['latin'],
  weight: ['600', '700', '800'],
  variable: '--font-editorial',
});

const fontDisplay = Space_Grotesk({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-display',
});

const fontBody = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-body',
});

const fontMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono',
});

const fontDevanagari = Noto_Sans_Devanagari({
  subsets: ['devanagari'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-devanagari',
});

export const metadata: Metadata = {
  title: 'Stride — GPS Activity Tracker & Athletic Competition',
  description:
    'Deterministic GPS tracking, Hausdorff segment leaderboards, clubs, challenges, and privacy-zone protection in English and Hindi.',
};

const THEME_INIT_SCRIPT = `
(function() {
  try {
    var saved = localStorage.getItem('stride-theme') || 'system';
    var resolved = saved;
    if (saved === 'system') {
      resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', resolved);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${fontEditorial.variable} ${fontDisplay.variable} ${fontBody.variable} ${fontMono.variable} ${fontDevanagari.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="min-h-screen antialiased selection:bg-[var(--stride-accent)] selection:text-white">
        <ThemeProvider>
          <AuthProvider>
            <SmoothScrollProvider>{children}</SmoothScrollProvider>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}

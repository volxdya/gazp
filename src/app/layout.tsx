import type { Metadata, Viewport } from 'next';
import { Onest, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const onest = Onest({ subsets: ['latin', 'cyrillic'], variable: '--font-onest', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin', 'cyrillic'], variable: '--font-mono', display: 'swap', weight: ['500', '700'] });

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://neftebaza-twin.example';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'Цифровой двойник отгрузки бензина', template: '%s · Цифровой двойник отгрузки бензина' },
  description:
    'Цифровой двойник и 3D-тур отгрузки бензина: месячный план, резервуарный парк, анализ и налив автоцистерн. Поиск узких мест и сравнение сценариев.',
  keywords: ['цифровой двойник', 'бензин', 'резервуарный парк', 'налив автоцистерн', 'план производства', '3D-тур', 'мнемосхема', 'хакатон'],
  applicationName: 'Цифровой двойник отгрузки бензина',
  authors: [{ name: 'Команда хакатона' }],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/',
    siteName: 'Цифровой двойник отгрузки бензина',
    title: 'Бензин без затаривания и очередей',
    description: 'Интерактивная 3D-модель и мнемосхема отгрузки бензина: проверьте решение до внедрения.'
  },
  robots: { index: true, follow: true },
  icons: { icon: '/favicon.svg' },
  formatDetection: { telephone: false }
};

export const viewport: Viewport = {
  themeColor: '#1d5bff',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${onest.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

import type { Metadata, Viewport } from 'next';
import { Onest, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const onest = Onest({ subsets: ['latin', 'cyrillic'], variable: '--font-onest', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin', 'cyrillic'], variable: '--font-mono', display: 'swap', weight: ['500', '700'] });

const SITE = process.env.NEXT_PUBLIC_SITE_URL || 'https://neftebaza-twin.example';

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
  title: { default: 'Цифровой двойник участка технических масел', template: '%s · Цифровой двойник участка масел' },
  description:
    'Цифровой двойник и 3D-тур участка технических масел: приём автоцистерн, резервуары, смешивание, контроль качества и фасовка. Поиск узких мест и сравнение сценариев.',
  keywords: ['цифровой двойник', 'технические масла', 'приём автоцистерн', 'смешивание', 'фасовка', '3D-тур', 'мнемосхема', 'хакатон'],
  applicationName: 'Цифровой двойник участка масел',
  authors: [{ name: 'Команда хакатона' }],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'ru_RU',
    url: '/',
    siteName: 'Цифровой двойник участка масел',
    title: 'От автоцистерны до бочки — без простоев',
    description: 'Интерактивная 3D-модель и мнемосхема участка масел: проверьте решение до внедрения.'
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

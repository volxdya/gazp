import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Контур — цифровой двойник участка',
  icons: { icon: '/favicon.svg' },
  description: 'Учебный участок технических масел: интерактивная карта, экскурсия по семи точкам и воспроизводимая симуляция производства.'
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ru"><body>{children}</body></html>;
}

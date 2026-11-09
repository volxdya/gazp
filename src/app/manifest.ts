import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Цифровой двойник отгрузки бензина',
    short_name: 'Двойник бензина',
    start_url: '/app',
    display: 'standalone',
    background_color: '#edf1f7',
    theme_color: '#1d5bff',
    lang: 'ru',
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }]
  };
}

import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Цифровой двойник участка технических масел',
    short_name: 'Двойник масел',
    start_url: '/app',
    display: 'standalone',
    background_color: '#edf1f7',
    theme_color: '#1d5bff',
    lang: 'ru',
    icons: [{ src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' }]
  };
}

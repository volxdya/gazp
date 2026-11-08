import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import HeroScene from '@/components/landing/HeroScene';
import GuestButton from '@/components/landing/GuestButton';
import { simulate } from '@/lib/twin/sim';
import { SCENARIOS } from '@/lib/twin/scenarios';
import { fmt } from '@/lib/twin/derive';
import './landing.css';

export const dynamic = 'force-static';

export default function Home() {
  const runs = SCENARIOS.map((s) => ({ s, r: simulate(s.params) }));
  const asIs = runs[0].r.metrics, smart = runs[3].r.metrics;
  const cut = Math.round((1 - smart.avgTurnaround / asIs.avgTurnaround) * 100);

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Цифровой двойник участка технических масел',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'ru',
    description: 'Моделирование приёма автоцистерн, резервуаров, смешивания и фасовки масел; 3D-тур и сравнение сценариев.',
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB' }
  };

  return (
    <div className="ld">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, '\\u003c') }} />
      <header className="ld-nav">
        <Link href="/" aria-label="На главную"><Logo /></Link>
        <Link href="/login" className="btn btn-primary btn-sm">Войти</Link>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <h1>Цифровой двойник участка масел</h1>
            <p className="lead">Приём, смешивание и фасовка — в одной модели и в 3D.</p>
            <div className="hero-cta">
              <Link href="/login" className="btn btn-primary btn-lg">Открыть <ArrowRight size={17} /></Link>
              <GuestButton className="btn btn-ghost btn-lg" label="Как гость" />
            </div>
          </div>
          <div className="hero-scene"><HeroScene /></div>
        </section>

        <section className="facts" aria-label="Эффект">
          <div><b className="num">−{cut}%</b><span>оборот цистерны</span></div>
          <div><b className="num">{Math.round(asIs.planDone * 100)} → {Math.round(smart.planDone * 100)}%</b><span>план выпуска</span></div>
          <div><b className="num">+{fmt.rub(smart.margin - asIs.margin)} ₽</b><span>маржа смены</span></div>
        </section>

        <section className="scen" aria-label="Сценарии">
          {runs.map(({ s, r }, i) => (
            <article key={s.id} className={i === 3 ? 'best' : ''}>
              <h3>{s.name}</h3>
              <dl>
                <div><dt>Оборот</dt><dd className="num">{fmt.int(r.metrics.avgTurnaround)} мин</dd></div>
                <div><dt>План</dt><dd className="num">{Math.round(r.metrics.planDone * 100)}%</dd></div>
                <div><dt>Маржа</dt><dd className="num">{fmt.rub(r.metrics.margin)}</dd></div>
              </dl>
            </article>
          ))}
        </section>
      </main>

      <footer className="ld-foot">
        <span>Учебный проект · синтетические данные</span>
        <nav><Link href="/privacy">Персональные данные</Link><a href="/api/v1">API</a></nav>
      </footer>
    </div>
  );
}

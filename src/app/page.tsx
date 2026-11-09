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

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Цифровой двойник отгрузки бензина',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    inLanguage: 'ru',
    description: 'Месячный план приготовления АИ-92 и АИ-95, резервуарный парк и налив автоцистерн; 3D-тур и сравнение сценариев.',
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
            <h1>Бензин без затаривания и очередей</h1>
            <p className="lead">План месяца, резервуарный парк и налив автоцистерн — в одной модели и в 3D.</p>
            <div className="hero-cta">
              <Link href="/login" className="btn btn-primary btn-lg">Открыть <ArrowRight size={17} /></Link>
              <GuestButton className="btn btn-ghost btn-lg" label="Как гость" />
            </div>
          </div>
          <div className="hero-scene"><HeroScene /></div>
        </section>

        <section className="facts" aria-label="План месяца">
          <div><b className="num">{fmt.t(asIs.planT)} т</b><span>бензина за месяц</span></div>
          <div><b className="num">{fmt.int(asIs.arrived)}</b><span>автоцистерн</span></div>
          <div><b className="num">{fmt.min(asIs.avgWait)} → {fmt.min(smart.avgWait)} мин</b><span>ожидание налива со слотами</span></div>
        </section>

        <section className="scen" aria-label="Сценарии">
          {runs.map(({ s, r }, i) => (
            <article key={s.id} className={i === 3 ? 'best' : ''}>
              <h3>{s.name}</h3>
              <dl>
                <div><dt>Ожидание</dt><dd className="num">{fmt.min(r.metrics.avgWait)} мин</dd></div>
                <div><dt>Очередь</dt><dd className="num">до {r.metrics.maxQueue}</dd></div>
                <div><dt>Затаривание</dt><dd className="num">{fmt.h(r.metrics.blockedHours)} ч</dd></div>
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

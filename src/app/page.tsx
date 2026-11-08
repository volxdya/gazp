import Link from 'next/link';
import {
  ArrowRight, Braces, Clock, Cpu, FileClock, Gauge, Globe, Lock, RefreshCw, Rocket, ScrollText, Package, Cylinder, Blend, Warehouse,
  ShieldCheck, Smartphone, Truck, Users, FlaskConical, Building2, Hourglass, TrendingDown
} from 'lucide-react';
import { Logo } from '@/components/ui/Logo';
import HeroScene from '@/components/landing/HeroScene';
import GuestButton from '@/components/landing/GuestButton';
import { simulate } from '@/lib/twin/sim';
import { SCENARIOS } from '@/lib/twin/scenarios';
import { fmt, plural } from '@/lib/twin/derive';
import './landing.css';

export const dynamic = 'force-static';

export default function Home() {
  const runs = SCENARIOS.map((s) => ({ s, r: simulate(s.params) }));
  const asIs = runs[0].r.metrics, smart = runs[3].r.metrics, bay = runs[1].r.metrics;
  const maxTurn = Math.max(...runs.map((x) => x.r.metrics.avgTurnaround));
  const maxMargin = Math.max(...runs.map((x) => x.r.metrics.margin));
  const lab = runs[0].r.resources.find((x) => x.id === 'lab')!;
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
        <nav aria-label="Разделы страницы">
          <a href="#problem">Проблема</a>
          <a href="#process">Процессы</a>
          <a href="#scenarios">Сценарии</a>
          <a href="#platform">Платформа</a>
        </nav>
        <Link href="/login" className="btn btn-primary btn-sm">Войти <ArrowRight size={15} /></Link>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="chip chip-blue rise">Хакатон «Цифровой двойник предприятия и 3D-туры»</span>
            <h1 className="rise" style={{ animationDelay: '.05s' }}>
              От автоцистерны до&nbsp;бочки — <em>без простоев</em>
            </h1>
            <p className="lead rise" style={{ animationDelay: '.1s' }}>
              Цифровой двойник участка технических масел: приём сырья, резервуары, смешивание, контроль качества и фасовка
              в&nbsp;одной модели. Найдите узкое место и проверьте решение в&nbsp;3D до того, как тратить деньги.
            </p>
            <div className="hero-cta rise" style={{ animationDelay: '.15s' }}>
              <Link href="/login" className="btn btn-primary btn-lg">Открыть двойник <ArrowRight size={18} /></Link>
              <GuestButton />
            </div>
            <dl className="hero-stats rise" style={{ animationDelay: '.2s' }}>
              <div><dt>оборот цистерны</dt><dd className="num">−{cut}%</dd></div>
              <div><dt>план выпуска</dt><dd className="num">{Math.round(asIs.planDone * 100)}→{Math.round(smart.planDone * 100)}%</dd></div>
              <div><dt>маржа смены</dt><dd className="num">+{fmt.rub(smart.margin - asIs.margin)} ₽</dd></div>
            </dl>
          </div>
          <div className="hero-visual rise" style={{ animationDelay: '.1s' }}>
            <div className="hero-scene"><HeroScene /></div>
            <div className="float f1"><Truck size={16} /><div><span>Приём сырья</span><b>цистерны A и B</b></div></div>
            <div className="float f2"><Clock size={16} /><div><span>Оборот цистерны</span><b className="num">{fmt.int(asIs.avgTurnaround)} → {fmt.int(smart.avgTurnaround)} мин</b></div></div>
            <div className="float f3"><span className="dot" /> 3D · WebGL · живая симуляция</div>
          </div>
        </section>

        <section id="problem" className="sec">
          <div className="sec-intro">
            <span className="kicker">Проблема</span>
            <h2>Цех не успевает, цистерны стоят, а&nbsp;хочется строить ещё пост</h2>
            <p>Мы смоделировали смену участка: {runs[0].r.metrics.arrived} автоцистерн с компонентами A и B и план из {runs[0].r.params.batches} партий смеси.</p>
          </div>
          <div className="problems">
            <article className="pcard">
              <span className="pc-ic orange"><Hourglass size={22} /></span>
              <b className="num">{fmt.min(asIs.avgWait)} мин</b>
              <h3>простоя на каждую цистерну</h3>
              <p>Из {fmt.int(asIs.avgTurnaround)} минут на базе цистерна меньше половины времени реально обслуживается: ждёт документы, пробу сырья и место в резервуаре.</p>
            </article>
            <article className="pcard">
              <span className="pc-ic blue"><Blend size={22} /></span>
              <b className="num">{Math.round(asIs.planDone * 100)}% плана</b>
              <h3>выпуска за смену</h3>
              <p>Смеситель держит партию, пока лаборатория не даст заключение. Один смеситель — и цех стоит, а резервуары переполняются.</p>
            </article>
            <article className="pcard">
              <span className="pc-ic teal"><FlaskConical size={22} /></span>
              <b className="num">{fmt.pct(lab.utilization)}% загрузка</b>
              <h3>одной лаборатории на два процесса</h3>
              <p>Проба каждой цистерны и контроль каждой партии — в одной очереди. Третий пост слива ничего не даст: {fmt.int(bay.avgTurnaround)} мин вместо {fmt.int(asIs.avgTurnaround)}.</p>
            </article>
          </div>
        </section>

        <section id="process" className="sec sec-alt">
          <div className="sec-intro">
            <span className="kicker">Путь масла — одна модель</span>
            <h2>Снаружи принимаем сырьё, внутри производим</h2>
            <p>Резервуары связывают процессы: полный — цистерна ждёт, пустой — цех стоит. Лаборатория и насосная общие.</p>
          </div>
          <div className="flows">
            <div className="flow external">
              <div className="flow-head"><span>Внешний</span> Приём автоцистерн</div>
              <ol>
                <li><ShieldCheck size={18} /><b>КПП</b><span>документы, допуск</span></li>
                <li><Gauge size={18} /><b>Весы</b><span>брутто</span></li>
                <li><FlaskConical size={18} /><b>Входной контроль</b><span>проба сырья</span></li>
                <li><Truck size={18} /><b>Слив</b><span>в резервуар A или B</span></li>
                <li><Gauge size={18} /><b>Весы</b><span>тара</span></li>
                <li><ScrollText size={18} /><b>Выезд</b><span>документы</span></li>
              </ol>
            </div>
            <div className="flow-join"><span><Cylinder size={14} /> резервуары A и B</span></div>
            <div className="flow internal">
              <div className="flow-head"><span>Внутренний</span> Производство</div>
              <ol>
                <li><Gauge size={18} /><b>Подача в цех</b><span>A и B по рецептуре</span></li>
                <li><Blend size={18} /><b>Смешивание</b><span>~30 мин</span></li>
                <li><FlaskConical size={18} /><b>Контроль качества</b><span>паспорт партии</span></li>
                <li><Package size={18} /><b>Фасовка</b><span>бочки 216 л</span></li>
                <li><Warehouse size={18} /><b>Склад</b><span>готовая продукция</span></li>
              </ol>
            </div>
          </div>
        </section>

        <section id="scenarios" className="sec">
          <div className="sec-intro">
            <span className="kicker">Решение</span>
            <h2>Четыре гипотезы, одна и та же смена</h2>
            <p>Детерминированная симуляция: каждая гипотеза проверяется на одинаковом потоке цистерн и одинаковом плане — честное сравнение «до/после».</p>
          </div>
          <div className="scen">
            {runs.map(({ s, r }, i) => (
              <article key={s.id} className={`scard ${i === 3 ? 'best' : ''}`}>
                {i === 3 && <span className="scard-badge"><Rocket size={13} /> Рекомендуем</span>}
                <span className="scard-k">{s.short}</span>
                <h3>{s.name}</h3>
                <p>{s.hypothesis}</p>
                <div className="sbar"><span>Оборот</span><div><i style={{ width: `${(r.metrics.avgTurnaround / maxTurn) * 100}%` }} /></div><b className="num">{fmt.int(r.metrics.avgTurnaround)} мин</b></div>
                <div className="sbar"><span>План</span><div><i className="c" style={{ width: `${r.metrics.planDone * 100}%` }} /></div><b className="num">{Math.round(r.metrics.planDone * 100)}%</b></div>
                <div className="sbar"><span>Маржа</span><div><i className="c" style={{ width: `${(Math.max(0, r.metrics.margin) / maxMargin) * 100}%` }} /></div><b className="num">{fmt.rub(r.metrics.margin)} ₽</b></div>
              </article>
            ))}
          </div>
          <p className="note"><TrendingDown size={16} /> Цифровой приём + второй смеситель: оборот −{cut}%, план {Math.round(smart.planDone * 100)}%, маржа +{fmt.rub(smart.margin - asIs.margin)} ₽ за смену. Третий пост слива не нужен.</p>
        </section>

        <section id="platform" className="sec sec-alt">
          <div className="sec-intro">
            <span className="kicker">Платформа</span>
            <h2>Готово к реальной эксплуатации</h2>
            <p>Не только красивая сцена: безопасность, нагрузка, данные и права доступа заложены в архитектуру.</p>
          </div>
          <div className="feats">
            {[
              [Lock, 'Только HTTPS', 'Редирект HTTP → HTTPS, HSTS, защитные заголовки, cookie сессии HttpOnly + Secure.'],
              [Cpu, 'Высокие нагрузки', 'Ограничение частоты запросов, кэш CDN для типовых расчётов, ядро модели считает смену за миллисекунды.'],
              [Globe, 'Корректный HTML', 'Семантическая разметка, метаданные, Open Graph, JSON-LD, sitemap и robots.'],
              [Rocket, 'Актуальная задача', 'Электронные документы, слоты поставок и поточные анализаторы — то, что внедряют маслозаводы сейчас.'],
              [Braces, 'API продукта', 'REST v1: расчёт сценариев, журнал, сценарии — для портала перевозчика и BI.'],
              [Users, 'Вход и роли', 'Руководитель, диспетчер, экскурсант: права проверяются на сервере для каждого метода.'],
              [RefreshCw, 'Восстановление при сбоях', 'Атомарный снапшот состояния на диске, автосохранение сессии, локальный расчёт при недоступности сервера.'],
              [FileClock, 'Журнал событий', 'Входы, расчёты, ошибки интерфейса и события процесса — с фильтрами и выгрузкой в CSV.'],
              [ShieldCheck, '152-ФЗ при регистрации', 'Отдельное явное согласие, версия политики и время согласия сохраняются, пароли — только хеш.'],
              [Smartphone, 'Любые устройства', 'Адаптивный интерфейс: компьютер, планшет, телефон; облегчённый рендер 3D для мобильных.']
            ].map(([Icon, t, d], i) => {
              const I = Icon as typeof Lock;
              return (
                <article key={i} className="feat">
                  <span className="feat-n num">{String(i + 1).padStart(2, '0')}</span>
                  <I size={22} />
                  <h3>{t as string}</h3>
                  <p>{d as string}</p>
                </article>
              );
            })}
          </div>
        </section>

        <section className="cta">
          <div>
            <h2>Пройдите по базе сами</h2>
            <p>12 точек по пути масла, живая мнемосхема и переход из тура прямо к этапу процесса в двойнике.</p>
          </div>
          <div className="hero-cta">
            <Link href="/login" className="btn btn-lg cta-btn">Войти в систему <ArrowRight size={18} /></Link>
            <GuestButton className="btn btn-lg cta-ghost" />
          </div>
        </section>
      </main>

      <footer className="ld-foot">
        <Logo />
        <p>Учебный проект для хакатона. Участок вымышлен, данные синтетические. Без интеграций с ERP/MES/1С.</p>
        <nav><Link href="/privacy">Политика обработки персональных данных</Link><a href="/api/v1">API</a><a href="/api/health">Статус</a></nav>
      </footer>
    </div>
  );
}

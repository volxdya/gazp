'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUpRight, BarChart3, Camera, Check, CheckCircle2, ChevronDown, Clock3, Copy, Droplets, Factory, FlaskConical, Info, Layers3, Map, PackageCheck, Pause, Play, RotateCcw, Save, Settings2, SlidersHorizontal, Truck, X } from 'lucide-react';
import FactoryMap from './FactoryMap';
import IndustrialViewer from './IndustrialViewer';
import { EQUIPMENT, TOUR_POINTS } from '@/lib/site';
import { DEFAULT_PARAMETERS, getResults, simulate, validateParameters, viscosityFactor, type Parameters, type SimulationSnapshot } from '@/lib/simulation';
import { DEFAULT_SCENARIOS, readScenarios, STORAGE_KEY, type Scenario } from '@/lib/scenarios';

const number = (n: number, digits = 0) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(n);
const percent = (n: number) => `${number(n * 100)}%`;
const clock = (t: number) => `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const stageNames: Record<string, string> = { idle: 'Ожидание', waiting: 'Ожидание', preparation: 'Подготовка', preparing: 'Подготовка', transfer: 'Перекачка', transferring: 'Перекачка', pumping: 'Перекачка', finishing: 'Завершение', mixing: 'Смешивание', quality: 'Проверка', checking: 'Проверка', awaiting_filling: 'Ожидание фасовки', 'waiting-filling': 'Ожидание фасовки', waiting_filling: 'Ожидание фасовки', filling: 'Фасовка', done: 'Готово', completed: 'Готово', blocked: 'Ожидание' };
const stage = (s: string | undefined) => s ? stageNames[s] || s : 'Ожидание';
const iconMap = [Truck, Droplets, Settings2, Layers3, FlaskConical, PackageCheck, Truck];
type Metric = { label: string; value: string; detail?: string };

function processMetrics(id: string, s: SimulationSnapshot): Metric[] {
  const p = s.parameters;
  const r = getResults(s);
  switch (id) {
    case 'receiving': return [
      { label: 'Состояние поста', value: stage(s.activeTruck?.stage), detail: s.resources.receiving.reason || 'Один пост обслуживания' },
      { label: 'Машин в очереди', value: number(s.queue.length), detail: `Обслужено: ${r.completedTrucks}` },
      { label: 'Время на посту', value: s.activeTruck?.startedAt !== undefined ? `${number(s.time - s.activeTruck.startedAt, 1)} мин` : '—', detail: `Среднее ожидание обслуженных: ${number(r.averageWaitMinutes, 1)} мин` },
    ];
    case 'storage': return [
      { label: 'Компонент A', value: `${number(s.stocks.A)} л`, detail: `${percent(s.stocks.A / p.capacityA)} · свободно ${number(p.capacityA - s.stocks.A)} л` },
      { label: 'Компонент B', value: `${number(s.stocks.B)} л`, detail: `${percent(s.stocks.B / p.capacityB)} · свободно ${number(p.capacityB - s.stocks.B)} л` },
    ];
    case 'pumps': return [
      { label: 'Расход приёма A / B', value: `${number(p.receivingRate * viscosityFactor(p.viscosityA))} / ${number(p.receivingRate * viscosityFactor(p.viscosityB))}`, detail: 'л/мин · с поправкой на вязкость' },
      { label: 'Состояние приёмного насоса', value: stage(s.activeTruck?.stage), detail: 'Подача в цех — отдельная линия' },
      { label: 'Загрузка поста', value: percent(s.resources.receiving.utilization) },
    ];
    case 'blending': return [
      { label: 'Текущая партия', value: s.mixer ? `№ ${s.mixer.id} · ${stage(s.mixer.stage)}` : 'Ожидание', detail: s.mixer ? s.resources.mixing.reason || 'Ёмкость занята до передачи партии на фасовку' : s.blockedReason || 'Ёмкость свободна' },
      { label: 'Объём партии', value: `${number(p.batchVolume)} л` },
      { label: 'Рецептура A / B', value: `${number((1 - p.fractionB) * 100)} / ${number(p.fractionB * 100)}%`, detail: 'Объёмные доли' },
    ];
    case 'quality': return [
      { label: 'Лаборатория', value: stage(s.resources.quality.state), detail: s.resources.quality.reason || 'Все корректные партии проходят контроль' },
      { label: 'Длительность проверки', value: `${number(p.qualityMinutes)} мин` },
      { label: 'Проба', value: s.mixer?.stage === 'quality' ? `Партия № ${s.mixer.id}` : 'Нет ожидающих проб' },
    ];
    case 'filling': return [
      { label: 'Линия фасовки', value: s.filler ? `Партия № ${s.filler.id}` : 'Ожидание', detail: s.resources.filling.reason || (s.filler ? 'Фасовка в промышленную тару' : 'Линия свободна') },
      { label: 'Производительность', value: `${number(p.fillingRate)} л/мин`, detail: `${number(p.batchVolume / p.fillingRate, 1)} мин на партию` },
      { label: 'Готовый объём', value: `${number(r.readyVolume)} л`, detail: `${r.completedBatches} завершённых партий` },
    ];
    default: return [
      { label: 'Готовая продукция', value: `${number(r.readyVolume)} л`, detail: `${r.completedBatches} партий на складе` },
      { label: 'Незавершённые партии', value: number(r.unfinishedBatches) },
      { label: 'Стоимость готового литра', value: r.costPerLiter ? `${number(r.costPerLiter, 2)} ₽` : '—', detail: 'Условные демонстрационные цены' },
    ];
  }
}

function MetricList({ metrics }: { metrics: Metric[] }) {
  return <dl className="detail-metrics">{metrics.map(m => <div key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd>{m.detail && <small>{m.detail}</small>}</div>)}</dl>;
}

export default function FactoryApp() {
  const [view, setView] = useState<'map' | 'comparison'>('map');
  const [selected, setSelected] = useState('receiving');
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [pointId, setPointId] = useState<string | null>(null);
  const [parametersOpen, setParametersOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [route, setRoute] = useState(false);
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [time, setTime] = useState(0);
  const [activeParameters, setActiveParameters] = useState<Parameters>({ ...DEFAULT_PARAMETERS });
  const [draft, setDraft] = useState<Parameters>({ ...DEFAULT_PARAMETERS });
  const [scenarios, setScenarios] = useState<Scenario[]>(DEFAULT_SCENARIOS);
  const [scenarioId, setScenarioId] = useState('baseline');
  const [message, setMessage] = useState('');
  const [scenarioName, setScenarioName] = useState('Базовый режим');
  const [ready, setReady] = useState(false);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const focusBefore = useRef<HTMLElement | null>(null);
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => { const stored = readScenarios(); const initial = stored.find(s => s.id === 'baseline') || stored[0]; setScenarios(stored); setScenarioId(initial.id); setScenarioName(initial.name); setActiveParameters({ ...initial.parameters }); setDraft({ ...initial.parameters }); setReady(true); }, []);
  useEffect(() => { if (ready) { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(scenarios)); } catch { setMessage('Хранилище браузера недоступно. Сценарии сохраняются только до закрытия страницы.'); } } }, [scenarios, ready]);
  useEffect(() => { if (!message) return; const timer = setTimeout(() => setMessage(''), 6000); return () => clearTimeout(timer); }, [message]);
  useEffect(() => {
    if (!running) return;
    let previous = performance.now();
    const timer = setInterval(() => {
      const now = performance.now(); const delta = (now - previous) / 1000; previous = now;
      setTime(t => Math.min(activeParameters.shiftMinutes, t + delta * speed * 4));
    }, 200);
    return () => clearInterval(timer);
  }, [running, speed, activeParameters.shiftMinutes]);
  useEffect(() => { if (time >= activeParameters.shiftMinutes) setRunning(false); }, [time, activeParameters.shiftMinutes]);

  const modalOpen = !!pointId || parametersOpen || aboutOpen;
  const closeModal = () => { setPointId(null); setParametersOpen(false); setAboutOpen(false);  };
  useLayoutEffect(() => {
    if (!modalOpen) { focusBefore.current?.focus(); return; }
    const previous = document.activeElement as HTMLElement;
    focusBefore.current = pointId ? document.getElementById(`map-point-${pointId}`) || previous : previous;
    modalRef.current?.querySelector<HTMLElement>('button,input,select')?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(); }
      if (e.key === 'Tab' && modalRef.current) {
        const list = Array.from(modalRef.current.querySelectorAll<HTMLElement>('button:not(:disabled),input,select,[tabindex="0"]'));
        const first = list[0], last = list[list.length - 1];
        if (!modalRef.current.contains(document.activeElement)) { e.preventDefault(); (e.shiftKey ? last : first)?.focus(); return; }
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    document.addEventListener('keydown', key); const before = document.body.style.overflow; document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', key); document.body.style.overflow = before; };
  }, [modalOpen]); // Switching viewpoints retains the focus origin and the dialog.

  const snapshot = useMemo(() => simulate(activeParameters, time), [activeParameters, time]);
  const results = useMemo(() => getResults(snapshot), [snapshot]);
  const comparisons = useMemo(() => scenarios.map(s => ({ ...s, result: getResults(simulate(s.parameters, s.parameters.shiftMinutes)) })), [scenarios]);
  const equipment = EQUIPMENT.find(e => e.id === selected) || EQUIPMENT[0];
  const point = TOUR_POINTS.find(p => p.id === pointId);
  const previewPoint = TOUR_POINTS.find(p => p.id === equipment.pointId)!;
  const pointIndex = TOUR_POINTS.findIndex(p => p.id === pointId);
  const metrics = processMetrics(selected, snapshot);
  const resourceId = ({ receiving: 'receiving', pumps: 'receiving', blending: 'mixing', quality: 'quality', filling: 'filling' } as const)[selected as 'receiving' | 'pumps' | 'blending' | 'quality' | 'filling'];
  const utilization = resourceId ? snapshot.resources[resourceId].utilization : 0;
  const errors = useMemo(() => validateParameters(draft), [draft]);
  const changed = JSON.stringify(draft) !== JSON.stringify(activeParameters);

  const openPoint = (id: string) => { if (pointId) focusBefore.current = document.getElementById(`map-point-${id}`); setMobilePanelOpen(false); const p = TOUR_POINTS.find(p => p.id === id)!; setSelected(p.processId); setPointId(id); };
  const reset = () => { setRunning(false); setTime(0); };
  const apply = () => { if (errors.length) return; setActiveParameters({ ...draft }); setTime(0); setRunning(false); setParametersOpen(false); setMessage('Параметры применены. Новый прогон готов к запуску.');  };
  const loadScenario = (id: string) => {
    const s = scenarios.find(s => s.id === id); if (!s) return;
    setScenarioId(id); setScenarioName(s.name); setDraft({ ...s.parameters }); setActiveParameters({ ...s.parameters }); reset();
  };
  const saveScenario = () => {
    if (errors.length) { setMessage(errors[0]); return; }
    setScenarios(ss => ss.map(s => s.id === scenarioId ? { ...s, name: scenarioName.trim() || s.name, parameters: { ...draft }, ...(changed ? { savedResult: undefined, observedMinutes: undefined } : { savedResult: results, observedMinutes: time }) } : s));
    setMessage(changed ? 'Черновик сценария сохранён. Примените его для нового прогона.' : `Сценарий и результат на ${clock(time)} сохранены в браузере.`);
  };
  const copyScenario = () => {
    if (errors.length) { setMessage(errors[0]); return; }
    if (scenarios.length >= 20) { setMessage('Можно хранить до 20 сценариев.'); return; }
    const id = `scenario-${Date.now()}`; const name = `${scenarioName} · копия`;
    setScenarios(ss => [...ss, { id, name, parameters: { ...draft } }]); setScenarioId(id); setScenarioName(name); setMessage('Копия создана. Параметры можно изменить.'); setParametersOpen(true);
  };
  const highlight = (id: string) => { setSelected(id); setHighlighted(id); setView('map'); setMobilePanelOpen(true); };
  const sameConditions = comparisons.every(s => ['shiftMinutes', 'arrivalInterval', 'deliveryVolume', 'deliveryPattern'].every(k => s.parameters[k as keyof Parameters] === comparisons[0].parameters[k as keyof Parameters]));

  return <div className="app-shell">
    <aside className="rail" aria-label="Навигация">
      <a className="brand-mark" href="/" aria-label="Контур — главная"><Layers3 size={25} strokeWidth={1.7} /></a>
      <div className="rail-nav">
        <button className={view === 'map' ? 'rail-button active' : 'rail-button'} aria-label="Карта участка" onClick={() => setView('map')}><Map size={21} /></button>
        <button className={view === 'comparison' ? 'rail-button active' : 'rail-button'} aria-label="Сравнение сценариев" onClick={() => setView('comparison')}><BarChart3 size={21} /></button>
        <button className="rail-button" aria-label="Параметры запуска" onClick={() => setParametersOpen(true)}><SlidersHorizontal size={21} /></button>
      </div>
      <button className="rail-button rail-info" aria-label="О модели" onClick={() => setAboutOpen(true)}><Info size={21} /></button>
      <span className="rail-avatar" title="Демонстрационный доступ">Д</span>
    </aside>

    <div className="app-content">
      <header className="topbar">
        <div className="brand"><strong>контур<span>.</span></strong><span className="brand-divider" /><div>Цифровой двойник<span>Участок технических масел</span></div></div>
        <nav className="view-tabs" aria-label="Основные разделы"><button className={view === 'map' ? 'active' : ''} onClick={() => setView('map')}><Map size={15} />Карта</button><button className={view === 'comparison' ? 'active' : ''} onClick={() => setView('comparison')}><BarChart3 size={15} />Сравнение</button></nav>
        <span className="demo-badge"><span />Учебный прототип</span>
      </header>

      <main>
        <section className="workspace-heading">
          <div><div className="eyebrow">ПРОИЗВОДСТВО / УЧАСТОК 01</div><h1>{view === 'map' ? 'Весь процесс — перед вами' : 'Два сценария. Видимый результат.'}</h1><p>{view === 'map' ? 'Участок большого завода: процессы на карте, оборудование — вблизи.' : 'Сравните выпуск, время и загрузку ресурсов на одной модельной смене.'}</p></div>
          <button className="secondary settings-button" onClick={() => setParametersOpen(true)}><SlidersHorizontal size={16} />Параметры{changed && <span className="draft-dot" />}</button>
        </section>

        <section className="simulation-toolbar" aria-label="Управление симуляцией">
          <div className="scenario-selector"><span>СЦЕНАРИЙ</span><select aria-label="Текущий сценарий" value={scenarioId} onChange={e => loadScenario(e.target.value)}>{scenarios.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select><ChevronDown size={14} /></div>
          <div className="sim-status"><i className={running ? 'status-dot running' : 'status-dot'} /><span>{time >= activeParameters.shiftMinutes ? 'Смена завершена' : running ? 'Симуляция идёт' : time > 0 ? 'На паузе' : 'Готов к запуску'}</span></div>
          <div className="time-display"><Clock3 size={15} /><strong>{clock(time)}</strong><span>/ {clock(activeParameters.shiftMinutes)}</span></div>
          <div className="sim-actions"><select aria-label="Скорость воспроизведения" value={speed} onChange={e => setSpeed(Number(e.target.value))}>{[1,2,4,8].map(v => <option key={v} value={v}>×{v}</option>)}</select><button className="icon-button reset-button" onClick={reset} aria-label="Сбросить текущий прогон" title="Сбросить"><RotateCcw size={17} /></button><button className="primary play-button" onClick={() => { if (time >= activeParameters.shiftMinutes) setTime(0); setRunning(v => !v); }}>{running ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" />}{running ? 'Пауза' : time > 0 && time < activeParameters.shiftMinutes ? 'Продолжить' : 'Запустить'}</button></div>
        </section>
        <div className="shift-progress"><div style={{ width: `${time / activeParameters.shiftMinutes * 100}%` }} /></div>

        {view === 'map' ? <>
          <div className="map-workspace">
            <section className="map-card" aria-label="Интерактивная карта предприятия">
              <div className="map-card-heading"><div><span className="map-title">Карта участка</span><span className="small-badge">ВИД СВЕРХУ</span></div><button className={route ? 'route-toggle active' : 'route-toggle'} onClick={() => setRoute(v => !v)} aria-pressed={route}><Camera size={15} />Маршрут<span>7 точек</span></button></div>
              <FactoryMap onSelectEquipment={id => { setSelected(id); setHighlighted(null); setMobilePanelOpen(true); }} onSelectPoint={openPoint} selectedEquipment={selected} highlightedEquipment={highlighted} showRoute={route} playing={running} snapshot={{ stockA: snapshot.stocks.A, stockB: snapshot.stocks.B, capacityA: activeParameters.capacityA, capacityB: activeParameters.capacityB, receivingActive: !!snapshot.activeTruck, receivingTransferring: snapshot.activeTruck?.stage === 'transfer', mixingActive: snapshot.mixer?.stage === 'mixing', mixerActive: !!snapshot.mixer, fillerActive: !!snapshot.filler, queueLength: snapshot.queue.length }} />
              <div className="mobile-point-list"><span>Виды участка</span>{TOUR_POINTS.map((p,i) => <button key={p.id} aria-label={`Открыть вид ${p.id}: ${p.title}`} onClick={() => openPoint(p.id)}><Camera size={12} />{String(i+1).padStart(2,'0')}</button>)}</div>
              <div className="map-legend"><span><i className="legend-oil" />Поток масла</span><span><i className="legend-walk" />Пешеходный путь</span><span><Camera size={13} />Точка осмотра</span><span className="legend-scale">Условная схема · север сверху</span></div>
            </section>

            {mobilePanelOpen && <button className="mobile-panel-shade" onClick={() => setMobilePanelOpen(false)} aria-label="Закрыть карточку объекта" />}
            <aside className={`object-panel ${mobilePanelOpen ? 'mobile-open' : ''}`} aria-label="Выбранный объект">
              <div className="mobile-sheet-header"><span /><button className="icon-button" aria-label="Закрыть карточку объекта" onClick={() => setMobilePanelOpen(false)}><X size={18} /></button></div>
              <div className="panel-overline"><span>ВЫБРАННЫЙ ОБЪЕКТ</span><span className="live-tag"><i />Текущий прогон</span></div>
              <div className="object-title"><div className="object-icon">{(() => { const Icon = iconMap[EQUIPMENT.findIndex(e => e.id === selected)] || Factory; return <Icon size={23} strokeWidth={1.6} />; })()}</div><div><h2>{equipment.title}</h2><p>{equipment.subtitle}</p></div></div>
              <MetricList metrics={metrics} />
              {resourceId && <div className="utilization"><div><span>Загрузка ресурса</span><strong>{percent(utilization)}</strong></div><div className="utilization-track"><div style={{ width: percent(utilization) }} /></div><small>Занятое время / время наблюдения</small></div>}
              {selected === 'storage' && <div className="stock-bars">{(['A','B'] as const).map(c => <div key={c}><span>Резервуар {c}</span><div className="utilization-track"><div style={{width: percent(snapshot.stocks[c] / (c === 'A' ? activeParameters.capacityA : activeParameters.capacityB))}} /></div></div>)}</div>}
              <div className="tour-preview"><div className="preview-photo"><img src={previewPoint.image} width={640} height={360} alt={`Иллюстративный вид: ${previewPoint.title}`} loading="lazy" /><span><Camera size={12} />{previewPoint.id}</span></div><div className="preview-content"><div><strong>Посмотреть на месте</strong><small>Общий вид · интерактивный осмотр</small></div><button className="icon-button" aria-label={`Открыть вид ${previewPoint.id}`} onClick={() => openPoint(previewPoint.id)}><ArrowUpRight size={20} /></button></div><button className="preview-hit" aria-label={`Открыть точку ${previewPoint.id}: ${previewPoint.title}`} onClick={() => openPoint(previewPoint.id)} /></div>
              <button className="text-button process-link" onClick={() => setAboutOpen(true)}><Info size={14} />Как устроена модель<ArrowRight size={14} /></button>
            </aside>
          </div>

          <section className="kpi-grid" aria-label="Результаты текущего прогона">
            {[
              { icon: Truck, label: 'Обслужено автоцистерн', value: number(results.completedTrucks), unit: 'машин', detail: `${snapshot.queue.length} в очереди`, target: 'receiving' },
              { icon: Clock3, label: 'Среднее ожидание', value: number(results.averageWaitMinutes, 1), unit: 'мин', detail: 'обслуженные машины', target: 'receiving' },
              { icon: PackageCheck, label: 'Готовая продукция', value: number(results.readyVolume), unit: 'л', detail: `${results.completedBatches} завершённых партий`, target: 'dispatch' },
              { icon: BarChart3, label: 'Загрузка фасовки', value: number(snapshot.resources.filling.utilization * 100), unit: '%', detail: 'за время наблюдения', target: 'filling' },
            ].map(m => <button key={m.label} className="kpi-card" onClick={() => highlight(m.target)}><div className="kpi-label"><span>{m.label}</span><m.icon size={17} /></div><div className="kpi-value">{m.value}<span>{m.unit}</span><ArrowUpRight size={15} /></div><small>{m.detail}</small></button>)}
          </section>

          <section className="process-strip"><div><span className="eyebrow">ПРОИЗВОДСТВЕННАЯ ЦЕПОЧКА</span><span>От сырья до готовой партии</span></div><div className="process-steps">{EQUIPMENT.filter(e => e.id !== 'pumps').map((e,i) => <button key={e.id} onClick={() => { setSelected(e.id); setHighlighted(e.id); setMobilePanelOpen(true); }} className={selected === e.id ? 'active' : ''}><span>{String(i + 1).padStart(2, '0')}</span>{({receiving:'Приём',storage:'Хранение',blending:'Смешивание',quality:'Контроль',filling:'Фасовка',dispatch:'Склад'})[e.id as 'receiving']}<ArrowRight size={13} /></button>)}</div></section>
          <div className="timeline-control"><span>Модельное время</span><input aria-label="Модельное время, минуты" type="range" min="0" max={activeParameters.shiftMinutes} step="1" value={Math.floor(time)} onChange={e => { setRunning(false); setTime(Number(e.target.value)); }} /><span>{clock(time)}</span><button className="text-button" onClick={() => { setRunning(false); setTime(activeParameters.shiftMinutes); }}>Рассчитать смену<ArrowRight size={13} /></button></div>
        </> : <section className="comparison-view">
          <div className="comparison-heading"><div><h2>Результаты за полную смену</h2><p>Каждый столбец рассчитан симуляцией с сохранёнными параметрами сценария.</p></div><div className="button-row"><button className="secondary" onClick={saveScenario}><Save size={15} />Сохранить сценарий</button><button className="secondary" onClick={copyScenario}><Copy size={15} />Создать копию</button></div></div>
          <div className={sameConditions ? 'comparison-note' : 'comparison-note caution'}><Info size={16} />{sameConditions ? `Одинаковые поставки и период наблюдения: ${comparisons[0]?.parameters.shiftMinutes} минут. Стоимости — демонстрационные.` : 'У сценариев различаются поставки или длительность смены. Для корректного эксперимента выровняйте эти параметры.'}</div>
          <div className="comparison-scroll"><table className="comparison-table"><thead><tr><th>Показатель</th>{comparisons.map((s,i) => <th key={s.id}><span className="scenario-tag">СЦЕНАРИЙ {String(i+1).padStart(2,'0')}</span><strong>{s.name}</strong><small>Фасовка {number(s.parameters.fillingRate)} л/мин · {s.parameters.shiftMinutes} мин</small><button className="text-button" onClick={() => { loadScenario(s.id); setParametersOpen(true); }}>Изменить<Settings2 size={12} /></button></th>)}</tr></thead><tbody>{[
            { label: 'Готовая продукция', get: (r: ReturnType<typeof getResults>) => `${number(r.readyVolume)} л`, target: 'dispatch', main: true },
            { label: 'Завершённые партии', get: (r: ReturnType<typeof getResults>) => number(r.completedBatches), target: 'dispatch' },
            { label: 'Обслуженные автоцистерны', get: (r: ReturnType<typeof getResults>) => number(r.completedTrucks), target: 'receiving' },
            { label: 'Среднее ожидание машины', get: (r: ReturnType<typeof getResults>) => `${number(r.averageWaitMinutes,1)} мин`, target: 'receiving' },
            { label: 'Машин в очереди к концу', get: (r: ReturnType<typeof getResults>) => number(r.queueAtEnd), target: 'receiving' },
            { label: 'Средний цикл готовой партии', get: (r: ReturnType<typeof getResults>) => `${number(r.averageBatchMinutes,1)} мин`, target: 'blending' },
            { label: 'Незавершённые партии', get: (r: ReturnType<typeof getResults>) => number(r.unfinishedBatches), target: 'blending' },
            { label: 'Загрузка приёма', get: (r: ReturnType<typeof getResults>) => percent(r.utilization.receiving), target: 'receiving' },
            { label: 'Загрузка смесителя', get: (r: ReturnType<typeof getResults>) => percent(r.utilization.mixing), target: 'blending' },
            { label: 'Загрузка лаборатории', get: (r: ReturnType<typeof getResults>) => percent(r.utilization.quality), target: 'quality' },
            { label: 'Загрузка фасовки', get: (r: ReturnType<typeof getResults>) => percent(r.utilization.filling), target: 'filling' },
            { label: 'Стоимость готового литра', get: (r: ReturnType<typeof getResults>) => r.costPerLiter ? `${number(r.costPerLiter,2)} ₽/л` : '—', target: 'dispatch' },
            { label: 'Стоимость завершённых партий', get: (r: ReturnType<typeof getResults>) => `${number(r.totalCost)} ₽`, target: 'dispatch' },
          ].map(row => <tr key={row.label} className={row.main ? 'primary-row' : ''}><th><button onClick={() => highlight(row.target)}>{row.label}<ArrowUpRight size={13} /></button></th>{comparisons.map(s => <td key={s.id}>{row.get(s.result)}</td>)}</tr>)}</tbody></table></div>
          {comparisons.length >= 2 && <div className="comparison-insight"><div className="insight-icon"><BarChart3 size={24} /></div><div><span className="eyebrow">ЧТО ПОКАЗАЛ РАСЧЁТ</span><h3>{comparisons[1].result.readyVolume >= comparisons[0].result.readyVolume ? '+' : ''}{number(comparisons[1].result.readyVolume - comparisons[0].result.readyVolume)} л готового продукта</h3><p>«{comparisons[1].name}» относительно «{comparisons[0].name}». Рост выпуска {comparisons[0].result.readyVolume ? `${number((comparisons[1].result.readyVolume / comparisons[0].result.readyVolume - 1) * 100,1)}%` : 'не определён: базовый выпуск равен нулю'}. Смеситель занят {percent(comparisons[1].result.utilization.mixing)} времени во втором сценарии.</p></div><button className="secondary" onClick={() => highlight('filling')}>Показать фасовку<ArrowRight size={15} /></button></div>}
          <div className="saved-results"><h3>Сохранённые результаты текущих прогонов</h3>{scenarios.some(s => s.savedResult) ? scenarios.filter(s => s.savedResult).map(s => <p key={s.id}><strong>{s.name}</strong> · {clock(s.observedMinutes || 0)} · {number(s.savedResult!.readyVolume)} л · {s.savedResult!.completedTrucks} автоцистерн</p>) : <p>Нажмите «Сохранить сценарий», чтобы сохранить его параметры и результат текущего прогона на выбранном модельном времени.</p>}<small>Стоимость = компоненты A по 80 ₽/л и B по 120 ₽/л + время ресурсов по условным ставкам. Подробнее — в описании модели.</small></div>
        </section>}

        <footer className="app-footer"><span><span className="footer-dot" />Синтетические данные · фрагмент предприятия</span><button onClick={() => setAboutOpen(true)}>О модели и допущениях<ArrowUpRight size={12} /></button><span>КОНТУР / 2026</span></footer>
      </main>
    </div>
    {message && <div className="toast" role="status"><CheckCircle2 size={18} />{message}<button onClick={() => setMessage('')} aria-label="Закрыть уведомление"><X size={15} /></button></div>}

    {modalOpen && <div className="modal-backdrop" onClick={e => { if (e.target === e.currentTarget) closeModal(); }}><div className={`modal ${point ? 'tour-modal' : parametersOpen ? 'parameters-modal' : 'about-modal'}`} ref={modalRef} role="dialog" aria-modal="true" aria-labelledby="modal-title">
      <div className="modal-heading"><div><span className="eyebrow">{point ? `ЭКСКУРСИЯ ПО ТОЧКАМ / ${point.id}` : parametersOpen ? 'НАСТРОЙКА СЦЕНАРИЯ' : 'ОБ УЧЕБНОМ ПРОТОТИПЕ'}</span><h2 id="modal-title">{point ? point.title : parametersOpen ? 'Параметры следующего запуска' : 'Модель, которую можно объяснить'}</h2></div><button className="icon-button" aria-label="Закрыть панель" onClick={closeModal}><X size={21} /></button></div>
      {point ? <>
        <IndustrialViewer key={point.id} point={point} snapshot={snapshot} draft={draft} errors={errors} getMetrics={id=>processMetrics(id,snapshot)} onDraftChange={changes=>setDraft(p=>({...p,...changes}))} onApplyAndRestart={()=>{if(errors.length)return;setActiveParameters({...draft});setTime(0);setRunning(true);setMessage('Параметры узла применены. Начат новый прогон.');}} running={running} onTogglePlayback={()=>{if(time>=activeParameters.shiftMinutes)setTime(0);setRunning(v=>!v);}} /><div className="tour-caption">{point.description}</div><div className="tour-navigation"><button className="secondary" onClick={() => { setSelected(point.processId); closeModal(); setView('map'); }}><Map size={15} />На карту</button><div className="point-dots">{TOUR_POINTS.map((p,i) => <button key={p.id} aria-label={`Точка ${p.id}: ${p.title}`} aria-current={p.id === pointId ? 'step' : undefined} className={p.id === pointId ? 'active' : ''} onClick={() => openPoint(p.id)}>{String(i+1).padStart(2,'0')}</button>)}</div><div className="button-row"><button className="secondary tour-prev" disabled={pointIndex === 0} onClick={() => openPoint(TOUR_POINTS[pointIndex-1].id)}><ArrowLeft size={15} />Предыдущая</button><button className="primary" disabled={pointIndex === TOUR_POINTS.length-1} onClick={() => openPoint(TOUR_POINTS[pointIndex+1].id)}>Следующая<ArrowRight size={15} /></button></div></div>
      </> : parametersOpen ? <>
        <div className="parameters-body"><div className="draft-note"><Info size={16} /><span>Изменения — черновик следующего запуска. Кнопка внизу применит параметры и сбросит текущую симуляцию.</span></div><label className="scenario-name-label">Название сценария<input value={scenarioName} maxLength={70} onChange={e => setScenarioName(e.target.value)} /></label>
          {([
            { title:'Поставки и приём', fields:[['arrivalInterval','Интервал прибытия','мин',1,480,1],['deliveryVolume','Объём поставки','л',100,200000,100],['receivingRate','Номинальный расход насоса','л/мин',1,10000,10],['viscosityA','Вязкость компонента A','сСт',40,300,1],['viscosityB','Вязкость компонента B','сСт',40,300,1]] },
            { title:'Запасы сырья', fields:[['capacityA','Вместимость резервуара A','л',100,1000000,1000],['initialA','Начальный остаток A','л',0,1000000,1000],['capacityB','Вместимость резервуара B','л',100,1000000,1000],['initialB','Начальный остаток B','л',0,1000000,1000]] },
            { title:'Смешивание и фасовка', fields:[['batchVolume','Размер партии','л',100,200000,100],['mixingMinutes','Смешивание','мин',1,480,1],['qualityMinutes','Проверка качества','мин',1,480,1],['fillingRate','Производительность фасовки','л/мин',1,10000,10]] },
          ] as {title:string;fields:[keyof Parameters,string,string,number,number,number][]}[]).map(group => <fieldset key={group.title}><legend>{group.title}</legend><div className="fields-grid">{group.fields.map(([key,label,unit,min,max,step]) => <label key={key}>{label}<div className="input-unit"><input type="number" min={min} max={max} step={step} value={draft[key]} onChange={e => setDraft(p => ({...p,[key]:Number(e.target.value)}))} /><span>{unit}</span></div></label>)}</div>{group.title === 'Поставки и приём' && <label className="pattern-label">Повторяющееся расписание поставок<select value={draft.deliveryPattern} onChange={e => setDraft(p => ({...p,deliveryPattern:e.target.value}))}>{['AB','AAB','ABB','A','B'].map(v => <option key={v} value={v}>{v.split('').join(' → ')} → повтор</option>)}</select><small>Первая автоцистерна прибывает в минуту 0.</small></label>}{group.title === 'Смешивание и фасовка' && <div className="recipe-control"><div><span>Объёмная доля B</span><strong>{number(draft.fractionB*100)}%<small>A: {number((1-draft.fractionB)*100)}%</small></strong></div><input aria-label="Доля B в процентах" type="range" min="0" max="100" step="1" value={draft.fractionB*100} onChange={e => setDraft(p => ({...p,fractionB:Number(e.target.value)/100}))} /></div>}</fieldset>)}
          <label className="shift-label">Длительность смены<div className="input-unit"><input type="number" min="30" max="1440" step="30" value={draft.shiftMinutes} onChange={e => setDraft(p => ({...p,shiftMinutes:Number(e.target.value)}))} /><span>мин</span></div></label>{errors.length > 0 && <div className="validation-errors" role="alert">{errors.map(e => <p key={e}>{e}</p>)}</div>}
        </div><div className="parameters-footer"><div className="button-row"><button className="secondary" onClick={saveScenario}><Save size={15} />Сохранить</button><button className="icon-button" onClick={copyScenario} aria-label="Создать копию сценария"><Copy size={17} /></button></div><button className="primary" disabled={errors.length>0} onClick={apply}><RotateCcw size={15} />Применить и сбросить</button></div>
      </> : <div className="about-content"><p className="lead-text">«Контур» связывает место, производственный процесс и его показатели. Карта — точная программная схема, экскурсия — семь видов участка и четыре фронтальных вида механизмов с интерактивными узлами, результаты — вычисления на синтетических данных.</p><h3>Как идёт производство</h3><p>Автоцистерны привозят компоненты A и B. На единственном посту проходят подготовку, перекачку в соответствующий резервуар и завершение разгрузки. Партия списывает оба компонента при запуске смешивания. Смеситель занят до передачи проверенной партии на свободную фасовку. После полного завершения фасовки партия поступает на склад.</p><h3>Что рассчитывается</h3><p>Время перекачки = объём / скорректированный расход. Вязкость входящего компонента меняет номинальный расход по условной таблице: 40, 100, 200, 300 сСт → 1,0; 0,8; 0,6; 0,45 с линейной интерполяцией. Это демонстрационная зависимость. Запасы ограничены вместимостью; при её нехватке машина ждёт на посту. Показатель загрузки смесителя включает проверку и ожидание фасовки.</p><h3>Учебные допущения</h3><p>Все объёмы в литрах, доли — объёмные; объёмы аддитивны, потерь нет. Температура фиксирована. Заполнение смесителя включено во время смешивания. Подача в цех независима от приёмного насоса. Все корректные партии проходят контроль. Свойства и вязкость готовой смеси не предсказываются. Отгрузка и возврат тары не моделируются.</p><h3>Условная стоимость</h3><p>Компонент A — 80 ₽/л, B — 120 ₽/л. Занятость смесителя — 6 ₽/мин, лаборатории — 10 ₽/мин, фасовки — 8 ₽/мин. Для завершённой партии учитываются её компоненты, всё время удержания смесителя, проверка и фасовка. Приём отдельно не тарифицируется. Стоимость литра вычисляется по завершённым партиям. Это демонстрационные цены, а не экономическая оценка предприятия.</p><h3>Границы прототипа</h3><p>Планировка не является инженерным проектом. Изображения иллюстрируют небольшой участок внутри большого завода и не меняются вместе с запасами. Метки на изображениях открывают осмотр узлов; значения и настройки поступают из модели. Цветовая гамма вдохновлена промышленными объектами Газпрома; объект остаётся вымышленным. Это экскурсия по точкам, а не 360°-панорамы или WebGL-сцена. Авторизация, ERP/MES/1С и серверное хранение не реализованы; сценарии сохраняются в браузере. Данные текущего прогона и сохранённые результаты помечены отдельно.</p><p><a href="/model/" className="public-model-link">Открыть полное описание и результаты по ссылке →</a></p><h3>Дальнейшее развитие</h3><p>Компонент просмотра принимает точку осмотра с координатами и связями процесса: вместо изображения можно подключить панорамный проигрыватель или Three.js. Независимый TypeScript-симулятор можно заменить API на Rust + Axum, сохранив контракт состояния. Публикация использует HTTPS; показатели высокой нагрузки требуют отдельных измерений.</p></div>}
    </div></div>}
  </div>;
}

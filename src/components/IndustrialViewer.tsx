'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Camera, ChevronRight, CircleHelp, Crosshair, Droplets, Gauge, Layers3, Pause, Play, RotateCcw, Settings2, X } from 'lucide-react';
import { DETAIL_VIEWS, OVERVIEW_TARGETS, type DetailViewId, type InspectionTarget } from '@/lib/inspection';
import { EQUIPMENT, type TourPoint } from '@/lib/site';
import { viscosityFactor, type Parameters, type SimulationSnapshot } from '@/lib/simulation';
import './IndustrialViewer.css';

type Metric = { label: string; value: string; detail?: string };
type Props = {
  point: TourPoint;
  snapshot: SimulationSnapshot;
  draft: Parameters;
  errors: string[];
  getMetrics: (equipmentId: string) => Metric[];
  onDraftChange: (changes: Partial<Parameters>) => void;
  onApplyAndRestart: () => void;
  running: boolean;
  onTogglePlayback: () => void;
};
const fmt = (n: number, digits = 0) => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: digits }).format(n);
const time = (minutes: number) => `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(Math.floor(minutes%60)).padStart(2,'0')}`;

function ResourceControl({ label, unit, value, min, max, step = 1, onChange }: { label:string;unit:string;value:number;min:number;max:number;step?:number;onChange:(value:number)=>void }) {
  return <label className="inspection-control"><span>{label}<strong>{fmt(value)} <small>{unit}</small></strong></span><input type="range" aria-label={label} min={Math.min(min,value)} max={Math.max(max,value)} step={step} value={value} onChange={e=>onChange(Number(e.target.value))} /></label>;
}

export default function IndustrialViewer({ point, snapshot, draft, errors, getMetrics, onDraftChange, onApplyAndRestart, running, onTogglePlayback }: Props) {
  const [detailId, setDetailId] = useState<DetailViewId|null>(null);
  const [selectedId, setSelectedId] = useState<string|null>(null);
  const [showTargets, setShowTargets] = useState(true);
  const [panelTab, setPanelTab] = useState<'status'|'controls'>('status');
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [reloadId, setReloadId] = useState(0);
  const sceneRef = useRef<HTMLDivElement>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const lastOverviewTarget = useRef<string|null>(null);
  useLayoutEffect(()=>{if(detailId)sceneRef.current?.querySelector<HTMLButtonElement>('.photo-back')?.focus();else if(lastOverviewTarget.current)sceneRef.current?.querySelector<HTMLButtonElement>(`[data-target-id="${lastOverviewTarget.current}"]`)?.focus();},[detailId]);
  useEffect(()=>{setDetailId(null);setSelectedId(null);setPanelTab('status');},[point.id]);
  const detail = detailId ? DETAIL_VIEWS[detailId] : null;
  const image = detail?.image || point.image;
  useEffect(()=>{setImageLoaded(false);setImageFailed(false);},[image]);
  const targets = detail?.targets || OVERVIEW_TARGETS[point.id] || [];
  const selected = targets.find(t=>t.id===selectedId);
  const equipmentId = selected?.equipmentId || detail?.equipmentId || point.processId;
  const equipment = EQUIPMENT.find(e=>e.id===equipmentId)!;
  useLayoutEffect(()=>{if(panelTab==='controls'&&selected?.action==='show-controls')sidebarRef.current?.querySelector<HTMLInputElement>('input')?.focus();},[selectedId,panelTab]);
  const metrics = getMetrics(equipmentId);
  const p = snapshot.parameters;
  const changed = JSON.stringify(draft)!==JSON.stringify(p);
  const liveFlow = snapshot.activeTruck?.stage==='transfer' ? p.receivingRate*viscosityFactor(snapshot.activeTruck.component==='A'?p.viscosityA:p.viscosityB) : 0;
  const liveValue = equipmentId==='storage' ? `${fmt(snapshot.stocks.A+snapshot.stocks.B)} л` : equipmentId==='blending' ? snapshot.mixer ? `${fmt(snapshot.mixer.volume)} л` : 'Ожидание' : equipmentId==='filling' ? `${fmt(snapshot.filler ? p.fillingRate : 0)} л/мин` : equipmentId==='quality' ? snapshot.resources.quality.state : equipmentId==='dispatch' ? `${fmt(snapshot.completedBatches.length*p.batchVolume)} л` : `${fmt(liveFlow)} л/мин`;
  const liveLabel = equipmentId==='storage'?'Суммарный запас':equipmentId==='blending'?'Партия в ёмкости':equipmentId==='quality'?'Контроль пробы':equipmentId==='dispatch'?'Готовый продукт':'Текущий расход';
  const selectTarget = (target: InspectionTarget) => {
    if(target.detailView){lastOverviewTarget.current=target.id;setDetailId(target.detailView);setSelectedId(null);setPanelTab('status');}
    else {setSelectedId(target.id);setPanelTab(target.action==='show-controls'?'controls':'status');if(target.action==='toggle-playback')onTogglePlayback();}
  };
  const returnOverview = () => {setDetailId(null);setSelectedId(null);};

  return <div className="industrial-viewer">
    <div className="inspection-context"><span><span className="context-dot" />УЧАСТОК 01</span><ChevronRight size={11}/><span>{point.title}</span>{detail && <><ChevronRight size={11}/><strong>{detail.title.split(' · ')[0]}</strong></>}<span className="context-outside">Фрагмент большого предприятия</span></div>
    <div className="inspection-layout">
      <div className="inspection-main">
        <div className={`inspection-photo ${imageLoaded?'is-loaded':''}`} ref={sceneRef}>
          <img key={`${image}-${reloadId}`} src={reloadId?`${image}?retry=${reloadId}`:image} alt={detail ? `${detail.title}. Камера перпендикулярна передней плоскости оборудования.` : `${point.title}. ${point.description}`} width={1672} height={941} onLoad={()=>setImageLoaded(true)} onError={()=>setImageFailed(true)} />
          {imageFailed && <div className="image-load-error"><Camera size={24}/><span>Вид временно не загрузился.</span><button className="secondary" onClick={()=>{setImageFailed(false);setImageLoaded(false);if(detail)setDetailId(null);else setReloadId(v=>v+1);}}>{detail?'Вернуться к точке':'Повторить загрузку'}</button></div>}
          <div className="inspection-photo-toolbar">{detail ? <button className="photo-back" onClick={returnOverview}><ArrowLeft size={14}/>Общий вид</button> : <span className="photo-view-label"><Camera size={13}/>{point.id} · Общий вид</span>}<button className={`scene-target-toggle ${showTargets?'active':''}`} aria-label={showTargets?'Скрыть интерактивные узлы':'Показать интерактивные узлы'} aria-pressed={showTargets} onClick={()=>setShowTargets(v=>!v)}><Crosshair size={15}/><span>Узлы</span><small>{targets.length}</small></button></div>
          {showTargets && !imageFailed && <div className="photo-targets" aria-label="Интерактивные узлы на изображении">{targets.map((target,i)=><button key={`${detailId||point.id}-${target.id}`} data-target-id={target.id} className={`photo-hotspot ${selectedId===target.id?'is-selected':''}`} style={{left:`${target.x}%`,top:`${target.y}%`}} aria-label={`${target.detailView?'Осмотреть':target.action==='toggle-playback'?'Действие':'Выбрать'}: ${target.title}`} aria-pressed={selectedId===target.id} onClick={()=>selectTarget(target)}><span className="hotspot-circle">{target.detailView?<Crosshair size={15}/>:target.action==='toggle-playback'?(running?<Pause size={14}/>:<Play size={14}/>):String(i+1).padStart(2,'0')}</span><span className="hotspot-caption">{target.title}{target.detailView&&<ArrowRight size={10}/>}</span></button>)}</div>}
          <div className="photo-live-readout"><div className="readout-indicator"><Gauge size={18}/></div><div><span>{liveLabel}</span><strong>{liveValue}</strong></div><span className="readout-live"><i/>МОДЕЛЬ</span></div>
          <span className="photo-perspective">{detail?'ФРОНТАЛЬНО · 90°':'УРОВЕНЬ ГЛАЗ · 1,7 М'}</span>
        </div>
        <div className="photo-subbar"><span><Crosshair size={13}/>{detail?'Выберите деталь на фронтальном виде':'Нажмите на отмеченный узел, чтобы осмотреть его'}</span><small>Сгенерированный статичный вид · показатели из симуляции</small></div>
        <div className="inspection-parts" aria-label="Список узлов">{targets.map((target,i)=><button key={target.id} className={selectedId===target.id?'active':''} onClick={()=>selectTarget(target)}><span>{String(i+1).padStart(2,'0')}</span>{target.title}{target.detailView?<ArrowRight size={12}/>:<Crosshair size={12}/>}</button>)}</div>
        {detail && <div className="inspection-explanation"><Camera size={16}/><p>Камера стоит прямо перед узлом: плоскость управления видна без косого ракурса. Детали и переключатели на фотографии — иллюстрация; интерактивные значения и действия выведены интерфейсом.</p></div>}
      </div>

      <aside ref={sidebarRef} className="inspection-sidebar" aria-label="Данные выбранного узла">
        <div className="inspection-status"><span className="live-tag"><i/>{running?'Симуляция идёт':'Пауза'} · {time(snapshot.time)}</span><button className="inspection-pause" onClick={onTogglePlayback} aria-label={running?'Приостановить симуляцию в экскурсии':'Запустить симуляцию в экскурсии'}>{running?<Pause size={14}/>:<Play size={14}/>}</button></div>
        <span className="inspection-equipment-tag">{detail?'КРУПНЫЙ ПЛАН ОБОРУДОВАНИЯ':selected?'ВЫБРАННЫЙ УЗЕЛ':'ПРОЦЕСС УЧАСТКА'}</span>
        <h3>{selected?.title||detail?.title.split(' · ')[0]||equipment.title}</h3>
        <div className="inspection-tabs" aria-label="Панель узла"><button aria-pressed={panelTab==='status'} className={panelTab==='status'?'active':''} onClick={()=>setPanelTab('status')}>Состояние</button><button aria-pressed={panelTab==='controls'} className={panelTab==='controls'?'active':''} onClick={()=>setPanelTab('controls')}><Settings2 size={12}/>Настройки{changed&&<i/>}</button></div>
        {panelTab==='status'?<div className="inspection-tab-content" aria-label="Состояние узла"><dl className="detail-metrics">{metrics.map(m=><div key={m.label}><dt>{m.label}</dt><dd>{m.value}</dd>{m.detail&&<small>{m.detail}</small>}</div>)}</dl><p className="inspection-description">{selected?.description||equipment.process}</p>{equipmentId!=='dispatch'&&<button className="inspection-settings-link" onClick={()=>setPanelTab('controls')}>Изменить параметры этого узла<ArrowRight size={13}/></button>}</div>:<div className="inspection-tab-content inspection-settings" aria-label="Настройки нового прогона">
          <p className="inspector-draft-note">Параметры нового прогона. Применение перезапустит всю модель.</p>
          {(equipmentId==='pumps'||equipmentId==='receiving')&&<><ResourceControl label="Номинальный расход" unit="л/мин" min={50} max={1200} step={10} value={draft.receivingRate} onChange={value=>onDraftChange({receivingRate:value})}/><ResourceControl label="Вязкость A" unit="сСт" min={40} max={300} value={draft.viscosityA} onChange={value=>onDraftChange({viscosityA:value})}/><ResourceControl label="Вязкость B" unit="сСт" min={40} max={300} value={draft.viscosityB} onChange={value=>onDraftChange({viscosityB:value})}/><div className="inspection-formula"><Droplets size={14}/><span>12 000 л при 600 л/мин и 40 сСт: <strong>20 мин</strong> чистой перекачки.</span></div></>}
          {equipmentId==='blending'&&<><ResourceControl label="Доля компонента B" unit="%" min={0} max={100} value={draft.fractionB*100} onChange={value=>onDraftChange({fractionB:value/100})}/><div className="inspection-composition"><span>A {fmt((1-draft.fractionB)*100)}%</span><div><i style={{width:`${(1-draft.fractionB)*100}%`}}/></div><span>B {fmt(draft.fractionB*100)}%</span></div><ResourceControl label="Объём партии" unit="л" min={500} max={12000} step={100} value={draft.batchVolume} onChange={value=>onDraftChange({batchVolume:value})}/><ResourceControl label="Время смешивания" unit="мин" min={1} max={60} value={draft.mixingMinutes} onChange={value=>onDraftChange({mixingMinutes:value})}/></>}
          {equipmentId==='quality'&&<><ResourceControl label="Время проверки пробы" unit="мин" min={1} max={60} value={draft.qualityMinutes} onChange={value=>onDraftChange({qualityMinutes:value})}/><p className="inspection-description">В этой версии все корректные партии проходят проверку. Изменение длительности влияет на занятость лаборатории и смесителя.</p></>}
          {equipmentId==='filling'&&<><ResourceControl label="Производительность фасовки" unit="л/мин" min={50} max={800} step={10} value={draft.fillingRate} onChange={value=>onDraftChange({fillingRate:value})}/><div className="filling-presets"><button className={draft.fillingRate===200?'active':''} onClick={()=>onDraftChange({fillingRate:200})}>200<span>Базовый режим</span></button><button className={draft.fillingRate===400?'active':''} onClick={()=>onDraftChange({fillingRate:400})}>400<span>Ускоренная фасовка</span></button></div><div className="inspection-formula"><Gauge size={14}/><span>На партию {fmt(draft.batchVolume)} л потребуется <strong>{fmt(draft.batchVolume/draft.fillingRate,1)} мин</strong>.</span></div></>}
          {equipmentId==='storage'&&<><ResourceControl label="Начальный остаток A" unit="л" min={0} max={draft.capacityA} step={1000} value={draft.initialA} onChange={value=>onDraftChange({initialA:value})}/><ResourceControl label="Начальный остаток B" unit="л" min={0} max={draft.capacityB} step={1000} value={draft.initialB} onChange={value=>onDraftChange({initialB:value})}/><p className="inspection-description">Текущие запасы показаны на вкладке «Состояние». Эти значения задают исходные остатки нового прогона.</p></>}
          {equipmentId==='dispatch'&&<p className="inspection-description">У склада в этой модели нет регулируемой производительности. Выпуск зависит от смешивания, контроля и фасовки.</p>}
          {errors.length>0&&<p className="inspection-validation" role="alert">{errors[0]}</p>}
          {equipmentId!=='dispatch'&&<button className="primary inspection-apply" disabled={errors.length>0||!changed} onClick={onApplyAndRestart}><RotateCcw size={14}/>Применить и перезапустить</button>}
          {!changed&&equipmentId!=='dispatch'&&<small className="no-draft-changes">Измените значение, чтобы применить новый режим.</small>}
        </div>}
      </aside>
    </div>
  </div>;
}

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, X } from 'lucide-react';
import SceneView from '@/components/scene/SceneView';
import { RESOURCE_LABEL, type TwinResult } from '@/lib/twin/sim';
import { PHOTOS, POIS, PROCESS_LABEL, TOUR_ORDER, type PoiId } from '@/lib/twin/pois';
import { fmt, liveAt, pinStatuses } from '@/lib/twin/derive';

type Media = 'photo' | 'detail' | '3d';

interface Props {
  id: PoiId;
  result: TwinResult;
  time: number;
  clock: React.RefObject<{ t: number; speed: number }>;
  onClose: () => void;
  onNav: (id: PoiId) => void;
  onTour?: (id: PoiId) => void;
  /** показывать ли вкладку живого 3D-вида (в самом туре не нужна) */
  allow3d?: boolean;
}

export default function PoiModal({ id, result, time, clock, onClose, onNav, onTour, allow3d = true }: Props) {
  const poi = POIS.find((p) => p.id === id)!;
  const photo = PHOTOS[id];
  const [media, setMedia] = useState<Media>(photo ? 'photo' : allow3d ? '3d' : 'photo');
  const live = useMemo(() => liveAt(result, time), [result, time]);
  const st = useMemo(() => pinStatuses(result, live), [result, live]);
  const res = poi.resource ? result.resources.find((r) => r.id === poi.resource) : null;
  const closeRef = useRef<HTMLButtonElement>(null);
  const idx = TOUR_ORDER.indexOf(id);
  const go = (d: number) => onNav(TOUR_ORDER[(idx + d + TOUR_ORDER.length) % TOUR_ORDER.length]);

  useEffect(() => { setMedia(PHOTOS[id] ? 'photo' : allow3d ? '3d' : 'photo'); }, [id, allow3d]);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowRight') go(1);
      if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const tabs: { k: Media; label: string }[] = [
    ...(photo ? [{ k: 'photo' as Media, label: 'Фото' }] : []),
    ...(photo?.detail ? [{ k: 'detail' as Media, label: 'Деталь' }] : []),
    ...(allow3d ? [{ k: '3d' as Media, label: '3D-вид' }] : [])
  ];

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="poi-title" onClick={(e) => e.stopPropagation()}>
        <div className="modal-media">
          {media === 'photo' && photo && <img src={photo.main} alt={poi.title} />}
          {media === 'photo' && !photo && <div className="modal-nophoto">Фото появится с данными организаторов</div>}
          {media === 'detail' && photo?.detail && <img src={photo.detail} alt={photo.detailCaption ?? poi.title} />}
          {media === '3d' && (
            <SceneView className="modal-scene" result={result} clock={clock} selected={id} eye showPins={false} interactive={false} />
          )}
          {tabs.length > 1 && (
            <div className="modal-tabs" role="tablist">
              {tabs.map((t) => <button key={t.k} role="tab" aria-selected={media === t.k} className={media === t.k ? 'on' : ''} onClick={() => setMedia(t.k)}>{t.label}</button>)}
            </div>
          )}
          <button ref={closeRef} className="modal-x" onClick={onClose} aria-label="Закрыть"><X size={18} /></button>
          {media === 'detail' && photo?.detailCaption && <span className="modal-cap">{photo.detailCaption}</span>}
        </div>

        <div className="modal-body">
          <span className={`modal-kicker p-${poi.process}`}><i />{String(poi.n).padStart(2, '0')} · {PROCESS_LABEL[poi.process]}</span>
          <h2 id="poi-title">{poi.title}</h2>
          <p>{poi.about}</p>
          <dl className="modal-facts">
            <div><dt>Сейчас</dt><dd>{st[id].text}</dd></div>
            {res && <div><dt>Загрузка</dt><dd className="num">{fmt.pct(res.utilization)}%</dd></div>}
            {res && <div><dt>Ресурс</dt><dd>{RESOURCE_LABEL[res.id]}</dd></div>}
          </dl>
          <p className="modal-practice"><b>{poi.practice.title}.</b> {poi.practice.text}</p>
          <footer>
            <button className="icon-btn" onClick={() => go(-1)} aria-label="Предыдущая точка"><ChevronLeft size={16} /></button>
            <button className="icon-btn" onClick={() => go(1)} aria-label="Следующая точка"><ChevronRight size={16} /></button>
            {onTour && <button className="btn btn-primary" onClick={() => onTour(id)}>В 3D-тур <ArrowRight size={15} /></button>}
          </footer>
        </div>
      </div>
    </div>
  );
}

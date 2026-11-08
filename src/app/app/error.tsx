'use client';

import { useEffect } from 'react';
import { RotateCcw } from 'lucide-react';
import { report } from '@/components/app/report';

// Восстановление при сбое: ошибка фиксируется в журнале, пользователь возвращается в рабочее состояние без потери сессии
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { report('error', 'ui.crash', `${error.message}${error.digest ? ` (${error.digest})` : ''}`); }, [error]);
  return (
    <div style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <div className="card" style={{ maxWidth: 460, padding: 32, textAlign: 'center', display: 'grid', gap: 14 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800 }}>Что-то пошло не так</h1>
        <p style={{ color: 'var(--muted)' }}>Сбой записан в журнал событий. Ваш сценарий и прогресс сохранены — их можно восстановить.</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
          <button className="btn btn-primary" onClick={reset}><RotateCcw size={16} /> Восстановить</button>
          <button className="btn btn-ghost" onClick={() => { try { localStorage.removeItem('twin.workspace.v3'); } catch {} location.reload(); }}>Начать с чистого листа</button>
        </div>
      </div>
    </div>
  );
}

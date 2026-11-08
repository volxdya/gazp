'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { fmtClock, type TwinResult } from '@/lib/twin/sim';

interface Entry { id: number; at: string; level: string; actor: string; action: string; detail: string }
interface UserRow { id: string; email: string; name: string; role: string; createdAt: string; consent: { version: string; acceptedAt: string } | null }

const LEVELS = [
  { v: '', l: 'Все' }, { v: 'info', l: 'Инфо' }, { v: 'warn', l: 'Предупр.' }, { v: 'error', l: 'Ошибки' }, { v: 'security', l: 'Безопасность' }
];

function csv(rows: string[][]) {
  return '﻿' + rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\n');
}
function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function JournalView({ result, isAdmin }: { result: TwinResult; isAdmin: boolean }) {
  const [mode, setMode] = useState<'system' | 'process' | 'users'>('system');
  const [level, setLevel] = useState('');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [proc, setProc] = useState<'all' | 'internal' | 'external'>('all');

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const sp = new URLSearchParams({ limit: '300' });
      if (level) sp.set('level', level);
      if (q) sp.set('q', q);
      const r = await fetch(`/api/v1/journal?${sp}`);
      if (!r.ok) throw new Error();
      setItems(((await r.json()) as { items: Entry[] }).items);
    } catch { setErr('Журнал временно недоступен. Повторите попытку.'); }
    finally { setLoading(false); }
  }, [level, q]);

  useEffect(() => { if (mode === 'system') { const id = setTimeout(load, 250); return () => clearTimeout(id); } }, [mode, load]);
  useEffect(() => { if (mode === 'users' && isAdmin) fetch('/api/v1/users').then((r) => r.json()).then((d: { items: UserRow[] }) => setUsers(d.items)).catch(() => null); }, [mode, isAdmin]);

  const events = useMemo(() => result.events.filter((e) => (proc === 'all' || e.process === proc) && (!q || e.text.toLowerCase().includes(q.toLowerCase()))), [result, proc, q]);

  return (
    <div className="jr card">
      <header className="sec-head">
        <div><h2>Журнал событий</h2><p>Аудит действий пользователей, безопасности и событий модели</p></div>
        <div className="seg seg-sm">
          <button className={mode === 'system' ? 'on' : ''} onClick={() => setMode('system')}>Системный</button>
          <button className={mode === 'process' ? 'on' : ''} onClick={() => setMode('process')}>События процесса</button>
          {isAdmin && <button className={mode === 'users' ? 'on' : ''} onClick={() => setMode('users')}>Пользователи</button>}
        </div>
      </header>

      {mode !== 'users' && (
        <div className="jr-tools">
          <div className="input-wrap jr-search"><Search size={16} className="jr-search-ic" /><input className="input" placeholder="Поиск по журналу" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {mode === 'system' ? (
            <div className="seg seg-sm">{LEVELS.map((l) => <button key={l.v} className={level === l.v ? 'on' : ''} onClick={() => setLevel(l.v)}>{l.l}</button>)}</div>
          ) : (
            <div className="seg seg-sm">
              <button className={proc === 'all' ? 'on' : ''} onClick={() => setProc('all')}>Все</button>
              <button className={proc === 'external' ? 'on' : ''} onClick={() => setProc('external')}>Приём</button>
              <button className={proc === 'internal' ? 'on' : ''} onClick={() => setProc('internal')}>Производство</button>
            </div>
          )}
          {mode === 'system' && <button className="icon-btn" onClick={load} aria-label="Обновить"><RefreshCw size={16} className={loading ? 'spin' : ''} /></button>}
          <button className="btn btn-ghost btn-sm" onClick={() => mode === 'system'
            ? download('journal.csv', csv([['ID', 'Время', 'Уровень', 'Пользователь', 'Действие', 'Описание'], ...items.map((e) => [String(e.id), e.at, e.level, e.actor, e.action, e.detail])]))
            : download('process-events.csv', csv([['Время', 'Процесс', 'Событие'], ...events.map((e) => [fmtClock(e.t), e.process === 'internal' ? 'Производство' : 'Приём', e.text])]))}>
            <Download size={15} /> CSV
          </button>
        </div>
      )}

      {err && <p className="err" style={{ padding: '0 24px' }}>{err}</p>}

      {mode === 'system' && (
        <ol className="log">
          {items.length === 0 && !loading && <li className="muted-p">Нет записей по фильтру.</li>}
          {items.map((e) => (
            <li key={e.id} className={e.level === 'warn' || e.level === 'error' ? `row-${e.level}` : ''}>
              <time className="num">{new Date(e.at).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
              <span className={`lv lv-${e.level}`}>{LEVELS.find((l) => l.v === e.level)?.l ?? e.level}</span>
              <span className="log-actor">{e.actor}</span>
              <code>{e.action}</code>
              <span className="log-detail">{e.detail}</span>
            </li>
          ))}
        </ol>
      )}

      {mode === 'process' && (
        <ol className="log">
          {events.slice(0, 400).map((e, i) => (
            <li key={i} className={e.kind === 'alert' ? 'row-warn' : ''}>
              <time className="num">{fmtClock(e.t)}</time>
              <span className={`lv ${e.process === 'internal' ? 'lv-int' : 'lv-ext'}`}>{e.process === 'internal' ? 'Производство' : 'Приём'}</span>
              <span className="log-detail">{e.text}</span>
            </li>
          ))}
        </ol>
      )}

      {mode === 'users' && isAdmin && (
        <div className="table-wrap">
          <table className="cmp-table users">
            <thead><tr><th>Пользователь</th><th>Роль</th><th>Зарегистрирован</th><th>Согласие 152-ФЗ</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <th scope="row"><b>{u.name}</b><br /><small>{u.email}</small></th>
                  <td><span className={`role role-${u.role}`}>{u.role === 'admin' ? 'Руководитель' : u.role === 'operator' ? 'Диспетчер' : 'Экскурсант'}</span></td>
                  <td className="num">{new Date(u.createdAt).toLocaleDateString('ru-RU')}</td>
                  <td>{u.consent ? <span className="chip"><ShieldCheck size={13} /> ред. {u.consent.version}, {new Date(u.consent.acceptedAt).toLocaleDateString('ru-RU')}</span> : <span className="chip chip-red">нет</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

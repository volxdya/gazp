import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { hashPassword, type Role } from './crypto';

/**
 * Хранилище демонстрационного стенда: пользователи, согласия 152-ФЗ, журнал событий, сценарии.
 * Держится в памяти и атомарно сбрасывается на диск (.data/state.json): после сбоя или перезапуска
 * процесс поднимает последнее состояние. В промышленной версии заменяется на PostgreSQL.
 */

export interface UserRecord {
  id: string;
  email: string;
  name: string;
  role: Role;
  password: string;
  createdAt: string;
  consent: { version: string; acceptedAt: string; ip: string } | null;
}

export type Level = 'info' | 'warn' | 'error' | 'security';

export interface JournalEntry {
  id: number;
  at: string;
  level: Level;
  actor: string;
  action: string;
  detail: string;
}

export interface SavedScenario {
  id: string;
  name: string;
  owner: string;
  createdAt: string;
  params: Record<string, unknown>;
}

interface State {
  users: UserRecord[];
  journal: JournalEntry[];
  scenarios: SavedScenario[];
  seq: number;
  bootCount: number;
}

import { CONSENT_VERSION } from '../consent';
export { CONSENT_VERSION };
// На Vercel и других бессерверных платформах писать можно только во временный каталог
const DIR = process.env.TWIN_DATA_DIR || (process.env.VERCEL ? '/tmp/twin-data' : join(process.cwd(), '.data'));
const FILE = join(DIR, 'state.json');
const JOURNAL_LIMIT = 5000;

const g = globalThis as unknown as { __twinStore?: Promise<State>; __twinFlush?: ReturnType<typeof setTimeout> };

async function seed(): Promise<State> {
  const now = new Date().toISOString();
  const demo: [string, string, Role, string][] = [
    ['admin@neftebaza.demo', 'Ирина Руководитель', 'admin', 'Admin#2026'],
    ['operator@neftebaza.demo', 'Павел Диспетчер', 'operator', 'Oper#2026'],
    ['guest@neftebaza.demo', 'Гость экскурсии', 'guest', 'Guest#2026']
  ];
  const users: UserRecord[] = [];
  for (const [email, name, role, pw] of demo) {
    // постоянный ID: на бессерверной платформе каждая функция поднимает своё хранилище,
    // и сессия должна оставаться валидной в любой из них
    users.push({ id: `demo-${role}`, email, name, role, password: await hashPassword(pw), createdAt: now, consent: { version: CONSENT_VERSION, acceptedAt: now, ip: 'seed' } });
  }
  return { users, journal: [], scenarios: [], seq: 0, bootCount: 0 };
}

async function load(): Promise<State> {
  let state: State;
  let recovered = false;
  try {
    state = JSON.parse(await readFile(FILE, 'utf8')) as State;
    recovered = true;
  } catch {
    state = await seed();
  }
  state.bootCount = (state.bootCount ?? 0) + 1;
  pushRaw(state, 'info', 'system', 'boot', recovered ? `Состояние восстановлено с диска, запуск №${state.bootCount}` : 'Первичная инициализация стенда');
  schedule(state);
  return state;
}

export function store() {
  g.__twinStore ??= load();
  return g.__twinStore;
}

function schedule(state: State) {
  if (g.__twinFlush) return;
  g.__twinFlush = setTimeout(async () => {
    g.__twinFlush = undefined;
    try {
      await mkdir(DIR, { recursive: true });
      const tmp = `${FILE}.${process.pid}.tmp`;
      await writeFile(tmp, JSON.stringify(state));
      await rename(tmp, FILE); // атомарная замена: файл не бывает «полузаписанным»
    } catch (e) {
      console.error('[store] flush failed', e);
    }
  }, 400);
}

function pushRaw(state: State, level: Level, actor: string, action: string, detail: string) {
  state.seq += 1;
  state.journal.push({ id: state.seq, at: new Date().toISOString(), level, actor, action, detail });
  if (state.journal.length > JOURNAL_LIMIT) state.journal.splice(0, state.journal.length - JOURNAL_LIMIT);
}

export async function audit(level: Level, actor: string, action: string, detail: string) {
  const s = await store();
  pushRaw(s, level, actor, action, detail);
  schedule(s);
}

export async function mutate<T>(fn: (s: State) => T | Promise<T>) {
  const s = await store();
  const out = await fn(s);
  schedule(s);
  return out;
}

export const publicUser = (u: UserRecord) => ({ id: u.id, email: u.email, name: u.name, role: u.role, createdAt: u.createdAt, consent: u.consent });

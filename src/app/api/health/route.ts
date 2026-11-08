import { json } from '@/lib/server/http';
import { store } from '@/lib/server/store';

const started = Date.now();

export async function GET() {
  const s = await store();
  return json(
    { status: 'ok', uptimeSec: Math.round((Date.now() - started) / 1000), boots: s.bootCount, journal: s.journal.length, memoryMb: Math.round(process.memoryUsage().rss / 1e6), at: new Date().toISOString() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

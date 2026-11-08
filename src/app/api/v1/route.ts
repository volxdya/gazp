import { json } from '@/lib/server/http';
import { API_ENDPOINTS } from '@/lib/api-spec';

export const dynamic = 'force-static';

export function GET() {
  return json({ name: 'Участок технических масел — API цифрового двойника', version: '1.0.0', endpoints: API_ENDPOINTS });
}

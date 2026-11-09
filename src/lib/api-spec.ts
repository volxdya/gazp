export interface Endpoint { method: 'GET' | 'POST' | 'DELETE'; path: string; access: string; summary: string; example?: string }

export const API_ENDPOINTS: Endpoint[] = [
  { method: 'GET', path: '/api/health', access: 'публично', summary: 'Состояние сервиса: аптайм, число перезапусков, память', example: 'curl -s https://HOST/api/health' },
  { method: 'GET', path: '/api/v1/simulate?scenario=smart', access: 'публично · кэш CDN', summary: 'Метрики предустановленного сценария (as-is, short, tanks, slots)' },
  { method: 'POST', path: '/api/v1/simulate', access: 'Диспетчер, Руководитель', summary: 'Расчёт пользовательского сценария. Тело: { params, includeTrace? }', example: `curl -X POST https://HOST/api/v1/simulate \\\n  -H 'Authorization: Bearer <token>' \\\n  -H 'Content-Type: application/json' \\\n  -d '{"params":{"plan92":40000,"plan95":30000,"posts":3,"profile":"slots"}}'` },
  { method: 'GET', path: '/api/v1/scenarios', access: 'публично / владелец', summary: 'Пресеты и сохранённые сценарии пользователя' },
  { method: 'POST', path: '/api/v1/scenarios', access: 'Диспетчер, Руководитель', summary: 'Сохранить сценарий: { name, params }' },
  { method: 'DELETE', path: '/api/v1/scenarios?id=…', access: 'владелец, Руководитель', summary: 'Удалить сохранённый сценарий' },
  { method: 'GET', path: '/api/v1/journal?level=security&q=…', access: 'Диспетчер, Руководитель', summary: 'Журнал событий с фильтрами' },
  { method: 'POST', path: '/api/v1/journal', access: 'любой вошедший', summary: 'Записать событие клиента: { level, action, detail }' },
  { method: 'GET', path: '/api/v1/users', access: 'Руководитель', summary: 'Пользователи и отметки согласия 152-ФЗ' },
  { method: 'POST', path: '/api/auth/login', access: 'публично', summary: 'Вход: { email, password } → cookie сессии (HttpOnly, Secure)' },
  { method: 'POST', path: '/api/auth/register', access: 'публично', summary: 'Регистрация: { name, email, password, consent: true }' },
  { method: 'POST', path: '/api/auth/logout', access: 'вошедший', summary: 'Завершить сессию' }
];

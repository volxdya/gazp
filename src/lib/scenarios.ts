import { DEFAULT_PARAMETERS, type Parameters, type SimulationResults, validateParameters } from './simulation';
export type Scenario = { id: string; name: string; parameters: Parameters; savedResult?: SimulationResults; observedMinutes?: number };
export const DEFAULT_SCENARIOS: Scenario[] = [
  { id: 'baseline', name: 'Базовый режим', parameters: { ...DEFAULT_PARAMETERS } },
  { id: 'faster', name: 'Ускоренная фасовка', parameters: { ...DEFAULT_PARAMETERS, fillingRate: DEFAULT_PARAMETERS.fillingRate * 2 } },
];
export const STORAGE_KEY = 'kontur.scenarios.v1';
export function readScenarios(): Scenario[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (Array.isArray(raw) && raw.length > 0 && raw.length <= 20 && raw.every(s => s && typeof s.id === 'string' && typeof s.name === 'string' && s.parameters && validateParameters(s.parameters).length === 0)) return raw;
  } catch { /* A blocked or malformed browser store does not prevent a demonstration. */ }
  return DEFAULT_SCENARIOS;
}

import { DEFAULT_PARAMS, type TwinParams } from './sim';

export interface ScenarioPreset {
  id: string;
  name: string;
  short: string;
  hypothesis: string;
  params: TwinParams;
}

export const SCENARIOS: ScenarioPreset[] = [
  {
    id: 'as-is',
    name: 'Как есть',
    short: 'Машины едут днём, ночью и в выходные — пусто',
    hypothesis: 'Подъезд неравномерный: днём очередь, ночью и в выходные парк наполняется.',
    params: { ...DEFAULT_PARAMS }
  },
  {
    id: 'short',
    name: 'Машин на 10% меньше',
    short: 'Коммерция недообеспечила подъезд',
    hypothesis: 'Наливать некуда — парк затаривается, установка снижает выпуск.',
    params: { ...DEFAULT_PARAMS, supply: 0.9 }
  },
  {
    id: 'tanks',
    name: '+1 резервуар каждой марки',
    short: 'Больше ёмкости в парке',
    hypothesis: 'Запас на выходные, но очередь днём остаётся.',
    params: { ...DEFAULT_PARAMS, tanks92: 4, tanks95: 4 }
  },
  {
    id: 'slots',
    name: 'Слоты подъезда 24/7',
    short: 'Ровный график машин',
    hypothesis: 'Машины приезжают ровно столько и тогда, сколько и когда нужно заводу.',
    params: { ...DEFAULT_PARAMS, profile: 'slots' }
  }
];

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];

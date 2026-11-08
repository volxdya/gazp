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
    short: 'Текущая работа участка',
    hypothesis: 'Два поста слива, один смеситель, ручной приём: документы и проба сырья — только когда цистерна уже на базе.',
    params: { ...DEFAULT_PARAMS }
  },
  {
    id: 'extra-bay',
    name: '+1 пост слива',
    short: 'Капитальное решение',
    hypothesis: 'Третий пост приёма. Интуитивно — меньше очередь, но если цистерны ждут места в резервуаре, стройка не поможет.',
    params: { ...DEFAULT_PARAMS, bays: 3 }
  },
  {
    id: 'blender',
    name: 'Второй смеситель',
    short: 'Ускорение цеха',
    hypothesis: 'Цех быстрее забирает компоненты из резервуаров: появляется место для слива, выпуск растёт.',
    params: { ...DEFAULT_PARAMS, blenders: 2 }
  },
  {
    id: 'smart',
    name: 'Цифровой приём + 2-й смеситель',
    short: 'Комплексное решение',
    hypothesis: 'Предзапись поставок, поточный анализатор и электронные документы на приёме плюс второй смеситель в цехе.',
    params: { ...DEFAULT_PARAMS, prepMode: 'prebooked', automation: true, blenders: 2 }
  }
];

export const scenarioById = (id: string) => SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];

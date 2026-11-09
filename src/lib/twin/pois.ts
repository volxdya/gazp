import type { ResourceId } from './sim';

export type PoiId = 'blend' | 'tanks' | 'lab' | 'pumps' | 'bays' | 'gate' | 'lot' | 'control' | 'exit';
export type StageId = 'I1' | 'I2' | 'I3' | 'I4' | 'E1' | 'E2' | 'E3' | 'E4';
export type ProcessKind = 'internal' | 'external' | 'shared';

export interface Poi {
  id: PoiId;
  n: number;
  title: string;
  process: ProcessKind;
  stages: StageId[];
  resource?: ResourceId;
  about: string;
  practice: { title: string; text: string };
  /** точка привязки метки в координатах сцены */
  anchor: [number, number, number];
  /** прямоугольник подсветки зоны: x0, z0, x1, z1 */
  zone: [number, number, number, number];
}

/** Точка осмотра «от первого лица»: где стоит человек (x, z) и куда смотрит (x, y, z). Высота глаз 1,7 м. */
export const EYE: Record<PoiId, { pos: [number, number]; look: [number, number, number] }> = {
  blend: { pos: [27, 33.5], look: [14.5, 2.2, 39] },
  tanks: { pos: [16, -21], look: [18, 6.5, -38] },
  lab: { pos: [-24, 7], look: [-36, 4, 1] },
  pumps: { pos: [37, -18], look: [50, 2.2, -31] },
  bays: { pos: [-13, 25], look: [8, 2.6, 3] },
  gate: { pos: [-50, 31], look: [-66, 2.4, 19] },
  lot: { pos: [6, 29], look: [-16, 1.6, 42] },
  control: { pos: [-28, 15], look: [-46, 4.5, 1] },
  exit: { pos: [-58, -27], look: [-78, 2, -18] }
};

export const PROCESS_LABEL: Record<ProcessKind, string> = {
  internal: 'Приготовление и хранение',
  external: 'Налив автоцистерн',
  shared: 'Общее для двух процессов'
};

export const POIS: Poi[] = [
  {
    id: 'blend', n: 1, title: 'Установка', process: 'internal', stages: ['I1'],
    about: 'Непрерывно готовит бензин АИ-92 и АИ-95 класса 5 по месячному плану. Остановить её нельзя.',
    practice: { title: 'План на месяц', text: 'Скорость выпуска задаётся планом: сколько тонн каждой марки нужно за месяц.' },
    anchor: [14.5, 9, 35], zone: [10, 29, 40, 51]
  },
  {
    id: 'tanks', n: 2, title: 'Резервуарный парк', process: 'internal', stages: ['I2', 'I4'],
    about: 'Резервуары по ~3000 м³. Один наполняется, другой на анализе, третий на наливе — по кругу.',
    practice: { title: 'Без затаривания', text: 'Если все резервуары марки полны, а машин нет — установка вынуждена снижать выпуск.' },
    anchor: [18, 18, -38], zone: [-6, -50, 42, -26]
  },
  {
    id: 'lab', n: 3, title: 'Лаборатория', process: 'internal', stages: ['I3'],
    about: 'Проба из наполненного резервуара. Только после допуска резервуар открывают на налив.',
    practice: { title: 'Экспресс-анализ', text: 'Короче анализ — быстрее резервуар уходит на отгрузку.' },
    anchor: [-36, 12, 4], zone: [-40, -2, -32, 8]
  },
  {
    id: 'pumps', n: 4, title: 'Насосная', process: 'shared', stages: ['E3'],
    about: 'Подаёт бензин из открытого резервуара на посты налива.',
    practice: { title: 'Маршруты из операторной', text: 'Переключение резервуаров без выхода на объект.' },
    anchor: [49, 8, -30], zone: [43, -36, 56, -24]
  },
  {
    id: 'bays', n: 7, title: 'Посты налива', process: 'external', stages: ['E3'], resource: 'posts',
    about: 'Автоцистерна встаёт под налив: заземление, 20 т бензина, пломба.',
    practice: { title: 'Свободный пост — сразу следующая', text: 'Как только пост освободился, наливают первую подходящую машину из очереди.' },
    anchor: [9, 13, 4], zone: [-9, -12, 27, 20]
  },
  {
    id: 'gate', n: 5, title: 'КПП', process: 'external', stages: ['E1'], resource: 'gate',
    about: 'Проверка водителя, документов и допуска на опасный груз.',
    practice: { title: 'Слот вместо очереди', text: 'Машина приезжает к своему времени — без толпы у ворот.' },
    anchor: [-62, 7, 22], zone: [-72, 15, -52, 29]
  },
  {
    id: 'lot', n: 6, title: 'Ожидание', process: 'external', stages: ['E2'],
    about: 'Машина ждёт свободный пост и продукт своей марки.',
    practice: { title: 'Очередь — сигнал', text: 'Длинная очередь днём и пустая площадка ночью — подъезд неравномерный.' },
    anchor: [-13, 5, 39], zone: [-32, 27, 4, 52]
  },
  {
    id: 'control', n: 8, title: 'Операторная', process: 'shared', stages: ['E1', 'E4'],
    about: 'Оформление налива и контроль парка: какие резервуары наполняются, на анализе, на наливе.',
    practice: { title: 'Двойник в операторной', text: 'Видно заранее, когда парк заполнится и сколько машин нужно.' },
    anchor: [-46, 12, -2], zone: [-58, -10, -32, 8]
  },
  {
    id: 'exit', n: 9, title: 'Выезд', process: 'external', stages: ['E4'],
    about: 'Налитая машина уезжает. Дальше её путь заводу не важен.',
    practice: { title: 'Отгружено — значит выполнено', text: 'План считается выполненным, когда бензин уехал.' },
    anchor: [-74, 5, -18], zone: [-84, -24, -62, -12]
  }
];

/** Маршрут экскурсии: путь бензина от установки до автоцистерны */
export const TOUR_ORDER: PoiId[] = ['blend', 'tanks', 'lab', 'pumps', 'gate', 'lot', 'bays', 'control', 'exit'];

export const STAGES: Record<StageId, { title: string; lane: 'internal' | 'external'; resource?: ResourceId; poi: PoiId }> = {
  I1: { title: 'Приготовление', lane: 'internal', poi: 'blend' },
  I2: { title: 'Наполнение резервуара', lane: 'internal', poi: 'tanks' },
  I3: { title: 'Анализ качества', lane: 'internal', poi: 'lab' },
  I4: { title: 'Резервуар на наливе', lane: 'internal', poi: 'tanks' },
  E1: { title: 'КПП и документы', lane: 'external', resource: 'gate', poi: 'gate' },
  E2: { title: 'Ожидание поста', lane: 'external', poi: 'lot' },
  E3: { title: 'Налив 20 т', lane: 'external', resource: 'posts', poi: 'bays' },
  E4: { title: 'Выезд', lane: 'external', poi: 'exit' }
};

/** Фото точек (виды из первой версии проекта). Где фото нет — показывается живой 3D-вид. */
export const PHOTOS: Partial<Record<PoiId, { main: string; detail?: string; detailCaption?: string }>> = {
  bays: { main: '/views/p01-receiving.webp', detail: '/views/detail-valve.webp', detailCaption: 'Задвижка на линии налива' },
  tanks: { main: '/views/p02-storage.webp' },
  pumps: { main: '/views/p03-pumps.webp', detail: '/views/detail-pump.webp', detailCaption: 'Насос' },
  blend: { main: '/views/p04-blending.webp', detail: '/views/detail-mixer-control.webp', detailCaption: 'Пульт установки' },
  lab: { main: '/views/p05-quality.webp' }
};

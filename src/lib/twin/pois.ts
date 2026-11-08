import type { ResourceId } from './sim';

export type PoiId = 'gate' | 'scales' | 'lot' | 'control' | 'bays' | 'pumps' | 'tanks' | 'blend' | 'lab' | 'filling' | 'warehouse' | 'exit';
export type StageId = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'I1' | 'I2' | 'I3' | 'I4' | 'I5';
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
  gate: { pos: [-50, 31], look: [-66, 2.4, 19] },
  scales: { pos: [-50, 30.5], look: [-38, 0.6, 21] },
  lot: { pos: [6, 29], look: [-16, 1.6, 42] },
  control: { pos: [-28, 15], look: [-46, 4.5, 1] },
  bays: { pos: [-13, 25], look: [8, 2.6, 3] },
  pumps: { pos: [37, -18], look: [50, 2.2, -31] },
  tanks: { pos: [16, -21], look: [18, 6.5, -38] },
  blend: { pos: [27, 33.5], look: [14.5, 2.2, 39] },
  lab: { pos: [-24, 7], look: [-36, 4, 1] },
  filling: { pos: [17.5, 44.5], look: [31, 1.4, 40] },
  warehouse: { pos: [37.5, 42.5], look: [55, 1.6, 41.5] },
  exit: { pos: [-58, -27], look: [-78, 2, -18] }
};

export const PROCESS_LABEL: Record<ProcessKind, string> = {
  external: 'Внешний процесс · приём автоцистерн',
  internal: 'Внутренний процесс · производство',
  shared: 'Общий ресурс обоих процессов'
};

export const POIS: Poi[] = [
  {
    id: 'gate', n: 1, title: 'КПП', process: 'external', stages: ['E1'], resource: 'gate',
    about: 'Автоцистерна с компонентом A или B прибывает на базу: проверка водителя, пропуска и допуска ДОПОГ.',
    practice: { title: 'Электронный пропуск', text: 'QR-код из предзаписи поставки открывает шлагбаум: проверка — с ~6 до ~2,5 мин.' },
    anchor: [-62, 7, 22], zone: [-72, 15, -52, 29]
  },
  {
    id: 'scales', n: 2, title: 'Автовесы', process: 'external', stages: ['E2', 'E5'], resource: 'scales',
    about: 'Взвешивание гружёной цистерны на въезде и пустой на выезде. Разница — фактически принятое сырьё.',
    practice: { title: 'Весы без оператора', text: 'Распознавание номера и автоматическая запись веса в документ поставки.' },
    anchor: [-40, 5, 22], zone: [-48, 16, -32, 28]
  },
  {
    id: 'lot', n: 3, title: 'Площадка ожидания', process: 'external', stages: ['E3'],
    about: 'Цистерна ждёт результата входного контроля, свободного поста и места в резервуаре. Здесь копится простой.',
    practice: { title: 'Слоты поставок', text: 'Предзапись выравнивает поток: машины приезжают к своему окну, когда в резервуаре есть место.' },
    anchor: [-13, 5, 39], zone: [-32, 27, 4, 52]
  },
  {
    id: 'control', n: 4, title: 'Диспетчерская', process: 'external', stages: ['E3', 'E6'], resource: 'dispatcher',
    about: 'Диспетчер принимает документы поставки (ТТН, сертификат) и оформляет приёмку при выезде.',
    practice: { title: 'Электронные документы', text: 'ЭТрН и сертификат поставщика приходят до приезда машины — водитель не идёт в окно.' },
    anchor: [-46, 12, -2], zone: [-58, -10, -32, 8]
  },
  {
    id: 'bays', n: 5, title: 'Посты слива', process: 'external', stages: ['E4'], resource: 'bays',
    about: 'Нижний слив сырья из цистерны: заземление, подключение рукава, перекачка в резервуар своего компонента.',
    practice: { title: 'Автоматизация приёма', text: 'Автоподключение, контроль заземления и массовый расходомер вместо ручных замеров.' },
    anchor: [9, 13, 4], zone: [-9, -12, 27, 20]
  },
  {
    id: 'pumps', n: 6, title: 'Насосная', process: 'shared', stages: ['E4', 'I1'], resource: 'operator',
    about: 'Оператор открывает маршрут слива в резервуары и маршрут подачи компонентов A и B в цех.',
    practice: { title: 'Дистанционные задвижки', text: 'Электроприводы и маршрутизация продукта из диспетчерской — 2–3 мин вместо 10.' },
    anchor: [49, 8, -30], zone: [43, -36, 56, -24]
  },
  {
    id: 'tanks', n: 7, title: 'Резервуары A и B', process: 'shared', stages: ['E4', 'I1'],
    about: 'Два компонента по двум резервуарам. Слив пополняет запас, цех его расходует. Полный резервуар — цистерна ждёт, пустой — цех стоит.',
    practice: { title: 'Учёт в реальном времени', text: 'Уровнемеры в двойнике: видно, когда звать следующую поставку и хватит ли сырья на план.' },
    anchor: [18, 18, -38], zone: [-6, -50, 42, -26]
  },
  {
    id: 'blend', n: 8, title: 'Смешивание', process: 'internal', stages: ['I1', 'I2'], resource: 'blender',
    about: 'Компоненты A и B подаются в смесительную ёмкость по рецептуре (60/40) и перемешиваются ~30 мин. Партия ждёт в ёмкости решения лаборатории.',
    practice: { title: 'Второй смеситель', text: 'Пока одна партия на контроле, вторая уже смешивается — цех не простаивает.' },
    anchor: [14.5, 9, 35], zone: [10, 29, 19, 51]
  },
  {
    id: 'lab', n: 9, title: 'Лаборатория', process: 'shared', stages: ['E3', 'I3'], resource: 'lab',
    about: 'Входной контроль каждой цистерны и контроль качества каждой партии смеси — одна лаборатория на оба процесса.',
    practice: { title: 'Поточный анализатор', text: 'Пробу сырья анализирует прибор на посту слива — лаборатория занята только партиями.' },
    anchor: [-36, 12, 4], zone: [-40, -2, -32, 8]
  },
  {
    id: 'filling', n: 10, title: 'Фасовка', process: 'internal', stages: ['I4'], resource: 'line',
    about: 'Линия фасовки в бочки 216 л: дозирование, укупорка, маркировка. Около 110 бочек в час.',
    practice: { title: 'Маркировка на линии', text: 'Коды наносятся при фасовке, склад принимает паллету одним сканированием.' },
    anchor: [28, 8, 40], zone: [19, 29, 39, 51]
  },
  {
    id: 'warehouse', n: 11, title: 'Склад', process: 'internal', stages: ['I5'],
    about: 'Готовая продукция на паллетах ждёт отгрузки клиентам.',
    practice: { title: 'Адресное хранение', text: 'Каждая паллета привязана к ячейке и паспорту партии — прослеживаемость до цистерны сырья.' },
    anchor: [49, 8, 40], zone: [40, 29, 58, 51]
  },
  {
    id: 'exit', n: 12, title: 'Выезд', process: 'external', stages: ['E6'],
    about: 'Пустая цистерна с документами приёмки покидает базу. Время оборота фиксируется здесь.',
    practice: { title: 'Оборот как KPI', text: 'Время от въезда до выезда — главный показатель для поставщика и базы.' },
    anchor: [-74, 5, -18], zone: [-84, -24, -62, -12]
  }
];

/** Маршрут экскурсии повторяет путь масла: от цистерны до склада */
export const TOUR_ORDER: PoiId[] = ['gate', 'scales', 'lot', 'control', 'bays', 'pumps', 'tanks', 'blend', 'lab', 'filling', 'warehouse', 'exit'];

export const STAGES: Record<StageId, { title: string; lane: 'internal' | 'external'; resource?: ResourceId; poi: PoiId; shared?: boolean }> = {
  E1: { title: 'КПП: документы и допуск', lane: 'external', resource: 'gate', poi: 'gate' },
  E2: { title: 'Взвешивание брутто', lane: 'external', resource: 'scales', poi: 'scales' },
  E3: { title: 'Входной контроль и ожидание', lane: 'external', resource: 'lab', poi: 'lot', shared: true },
  E4: { title: 'Слив в резервуар', lane: 'external', resource: 'bays', poi: 'bays' },
  E5: { title: 'Взвешивание тары', lane: 'external', resource: 'scales', poi: 'scales' },
  E6: { title: 'Документы и выезд', lane: 'external', resource: 'dispatcher', poi: 'exit' },
  I1: { title: 'Подача A и B в цех', lane: 'internal', resource: 'operator', poi: 'pumps', shared: true },
  I2: { title: 'Смешивание', lane: 'internal', resource: 'blender', poi: 'blend' },
  I3: { title: 'Контроль качества партии', lane: 'internal', resource: 'lab', poi: 'lab', shared: true },
  I4: { title: 'Фасовка в бочки', lane: 'internal', resource: 'line', poi: 'filling' },
  I5: { title: 'Склад готовой продукции', lane: 'internal', poi: 'warehouse' }
};

/** Фото точек (виды из первой версии проекта). Где фото нет — в карточке показывается живой 3D-вид. */
export const PHOTOS: Partial<Record<PoiId, { main: string; detail?: string; detailCaption?: string }>> = {
  bays: { main: '/views/p01-receiving.webp', detail: '/views/detail-valve.webp', detailCaption: 'Задвижка на линии слива' },
  tanks: { main: '/views/p02-storage.webp' },
  pumps: { main: '/views/p03-pumps.webp', detail: '/views/detail-pump.webp', detailCaption: 'Насос подачи' },
  blend: { main: '/views/p04-blending.webp', detail: '/views/detail-mixer-control.webp', detailCaption: 'Пульт смесителя' },
  lab: { main: '/views/p05-quality.webp' },
  filling: { main: '/views/p06-filling.webp', detail: '/views/detail-filling-control.webp', detailCaption: 'Налив в бочку' },
  warehouse: { main: '/views/p07-dispatch.webp' }
};

import type { EquipmentId } from './site';

export type DetailViewId = 'pump' | 'valve' | 'mixer-control' | 'filling-control';
export type InspectionTarget = {
  id: string;
  title: string;
  x: number;
  y: number;
  equipmentId: EquipmentId;
  description: string;
  detailView?: DetailViewId;
  action?: 'toggle-playback' | 'show-controls';
};
export type DetailView = { id: DetailViewId; title: string; image: string; equipmentId: EquipmentId; targets: InspectionTarget[] };

// Positions are percentages of the uncropped image; every marker belongs to a visible part.
export const OVERVIEW_TARGETS: Record<string, InspectionTarget[]> = {
  P01: [
    { id: 'receiving-hose', title: 'Приёмная линия', x: 60, y: 70, equipmentId: 'receiving', description: 'Пост обслуживает одну автоцистерну. Фактический расход зависит от компонента и его вязкости.' },
    { id: 'receiving-meter', title: 'Приёмная арматура', x: 72, y: 50, equipmentId: 'pumps', description: 'Приёмный насос и линия подачи в цех учитываются раздельно. Здесь можно изменить номинальный расход следующего прогона.', detailView: 'valve' },
  ],
  P02: [
    { id: 'tank-a', title: 'Резервуар A', x: 25.4, y: 64, equipmentId: 'storage', description: 'Запас компонента A пополняется при разгрузке и списывается при запуске партии. Вместимость ограничена.' },
    { id: 'tank-b', title: 'Резервуар B', x: 54.2, y: 64, equipmentId: 'storage', description: 'Запас компонента B входит в тот же материальный баланс. Статичная фотография не изображает текущий уровень.' },
  ],
  P03: [
    { id: 'pump-motor', title: 'Приёмный насос', x: 28, y: 65, equipmentId: 'pumps', description: 'Электродвигатель приводит приёмный насос. Расход в интерфейсе вычисляется из состояния разгрузки и поправки на вязкость.', detailView: 'pump' },
    { id: 'pump-valve', title: 'Арматура и трубы', x: 48, y: 43, equipmentId: 'pumps', description: 'Фланцевые соединения и запорная арматура приёмного узла. Откройте фронтальный ракурс для осмотра линии.', detailView: 'valve' },
    { id: 'pump-gauge', title: 'Манометр', x: 56, y: 44, equipmentId: 'pumps', description: 'Механический прибор показан как часть оборудования. Числовое давление модель не рассчитывает; справа доступны расход и занятость линии.' },
  ],
  P04: [
    { id: 'mixer-vessel', title: 'Привод смесителя', x: 48, y: 13, equipmentId: 'blending', description: 'Одна ёмкость удерживает партию во время смешивания, проверки и ожидания фасовки.' },
    { id: 'mixer-cabinet', title: 'Шкаф управления', x: 68, y: 60, equipmentId: 'blending', description: 'Состав партии и длительность смешивания можно изменить в настройках этого узла.', detailView: 'mixer-control' },
  ],
  P05: [
    { id: 'lab-instrument', title: 'Прибор контроля', x: 61.5, y: 50, equipmentId: 'quality', description: 'После смешивания лаборатория проверяет пробу. Время проверки — параметр модели; все корректные партии проходят контроль.' },
    { id: 'lab-samples', title: 'Пробы масла', x: 75, y: 52, equipmentId: 'quality', description: 'Проба связана с партией в смесителе. Передача пробы не считается транспортировкой всего объёма масла.' },
  ],
  P06: [
    { id: 'filling-head', title: 'Фасовочный узел', x: 44.5, y: 43, equipmentId: 'filling', description: 'Линия получает проверенную партию только после освобождения. Выпуск учитывается после завершения всей партии.', detailView: 'filling-control' },
    { id: 'filling-panel', title: 'Пульт фасовки', x: 69.5, y: 52, equipmentId: 'filling', description: 'Производительность этой линии действительно ограничивает базовый выпуск. Настройка изменит расчёт следующего прогона.', detailView: 'filling-control' },
  ],
  P07: [
    { id: 'warehouse', title: 'Готовые партии', x: 52, y: 58, equipmentId: 'dispatch', description: 'На складе учитываются полностью расфасованные партии. Вывоз за территорию в этой демонстрации не моделируется.' },
  ],
};

export const DETAIL_VIEWS: Record<DetailViewId, DetailView> = {
  pump: { id: 'pump', title: 'Приёмный насос · фронтальный вид', image: '/views/v2/detail-pump.webp', equipmentId: 'pumps', targets: [
    { id: 'motor', title: 'Электродвигатель', x: 27, y: 52, equipmentId: 'pumps', description: 'Привод приёмного насоса. Его загрузка связана с обслуживанием автоцистерн; расход зависит от номинала и вязкости компонента.' },
    { id: 'coupling', title: 'Кожух муфты', x: 52, y: 58, equipmentId: 'pumps', description: 'Защитный кожух соединения двигателя и насоса. Отдельные механические неисправности в учебной модели не вводятся.' },
    { id: 'pump-body', title: 'Корпус насоса', x: 72, y: 54, action: 'show-controls', equipmentId: 'pumps', description: 'Здесь связаны входная и выходная линии перекачки. Настройте номинальную производительность справа и примените её к новому прогону.' },
    { id: 'pump-meter', title: 'Прибор контроля', x: 83, y: 17, equipmentId: 'pumps', description: 'Иллюстративный механический прибор. Измеряемая в этой модели величина — расход в литрах в минуту, а не давление.' },
  ] },
  valve: { id: 'valve', title: 'Запорная арматура · фронтальный вид', image: '/views/v2/detail-valve.webp', equipmentId: 'pumps', targets: [
    { id: 'handwheel', title: 'Маховик', x: 50, y: 24, action: 'show-controls', equipmentId: 'pumps', description: 'Фронтальный осмотр маховика и штока. Угол открытия не подменяет расход: гидравлическая характеристика арматуры здесь не моделируется.' },
    { id: 'valve-body', title: 'Корпус и фланцы', x: 35, y: 68, equipmentId: 'pumps', description: 'Фланцевое соединение технологической линии. Доступные настройки относятся к условному расходу приёмки и вязкости входящего компонента.' },
  ] },
  'mixer-control': { id: 'mixer-control', title: 'Пульт смесителя · фронтальный вид', image: '/views/v2/detail-mixer-control.webp', equipmentId: 'blending', targets: [
    { id: 'mixer-screen', title: 'Сигнальный индикатор', x: 60, y: 29, equipmentId: 'blending', description: 'Текущие данные поступают из симуляции. Доля B изменяет расход запасов и стоимость, доля A дополняет её до 100%.' },
    { id: 'mixer-selector', title: 'Переключатель режима', x: 45, y: 29, action: 'show-controls', equipmentId: 'blending', description: 'Настройки партии применяются явным перезапуском. Смеситель остаётся занятым, пока партия не передана на фасовку.' },
    { id: 'mixer-stop', title: 'Пауза симуляции', x: 52, y: 54, equipmentId: 'blending', action: 'toggle-playback', description: 'Кнопка ставит на паузу или продолжает воспроизведение всей учебной модели. Состояние запасов и ресурсов сохраняется.' },
  ] },
  'filling-control': { id: 'filling-control', title: 'Фасовочная станция · фронтальный вид', image: '/views/v2/detail-filling-control.webp', equipmentId: 'filling', targets: [
    { id: 'nozzle', title: 'Фасовочная головка', x: 39, y: 43, equipmentId: 'filling', description: 'Время фасовки = объём партии / производительность. Ускорение этой стадии может перенести ограничение на смешивание и контроль.' },
    { id: 'filling-selector', title: 'Переключатель режима', x: 74, y: 38, action: 'show-controls', equipmentId: 'filling', description: 'Измените производительность и запустите новый прогон прямо из фотоинтерфейса. Результат пересчитается моделью.' },
    { id: 'filling-stop', title: 'Пауза симуляции', x: 74, y: 53, equipmentId: 'filling', action: 'toggle-playback', description: 'Пауза воспроизведения всей модели. Технологические параметры и накопленный результат сохраняются.' },
  ] },
};

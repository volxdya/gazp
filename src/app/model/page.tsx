import type { Metadata } from 'next';
import Link from 'next/link';
import { EQUIPMENT, TOUR_POINTS } from '@/lib/site';
import { DEFAULT_PARAMETERS, DEMO_COSTS, getResults, simulate } from '@/lib/simulation';

export const metadata: Metadata = {
  title: 'Модель участка и результаты — Контур',
  description: 'Открытое HTML-описание учебного участка технических масел, модели процессов, семи точек экскурсии и вычисленного сравнения двух демонстрационных сценариев.',
};

const number = (value: number, digits = 0) => value.toLocaleString('ru-RU', { maximumFractionDigits: digits, minimumFractionDigits: digits });
const baseline = getResults(simulate(DEFAULT_PARAMETERS));
const acceleratedParameters = { ...DEFAULT_PARAMETERS, fillingRate: DEFAULT_PARAMETERS.fillingRate * 2 };
const accelerated = getResults(simulate(acceleratedParameters));

const comparisonRows: { label: string; base: string; fast: string }[] = [
  { label: 'Производительность фасовки, л/мин', base: number(DEFAULT_PARAMETERS.fillingRate), fast: number(acceleratedParameters.fillingRate) },
  { label: 'Обслужено автоцистерн', base: number(baseline.completedTrucks), fast: number(accelerated.completedTrucks) },
  { label: 'Среднее ожидание обслуженных машин, мин', base: number(baseline.averageWaitMinutes, 2), fast: number(accelerated.averageWaitMinutes, 2) },
  { label: 'Машин в очереди в конце смены', base: number(baseline.queueAtEnd), fast: number(accelerated.queueAtEnd) },
  { label: 'Готовый объём, л', base: number(baseline.readyVolume), fast: number(accelerated.readyVolume) },
  { label: 'Завершено партий', base: number(baseline.completedBatches), fast: number(accelerated.completedBatches) },
  { label: 'Незавершённых партий', base: number(baseline.unfinishedBatches), fast: number(accelerated.unfinishedBatches) },
  { label: 'Средняя длительность завершённой партии, мин', base: number(baseline.averageBatchMinutes, 2), fast: number(accelerated.averageBatchMinutes, 2) },
  { label: 'Загрузка поста приёма, %', base: number(baseline.utilization.receiving * 100, 2), fast: number(accelerated.utilization.receiving * 100, 2) },
  { label: 'Загрузка ёмкости смешивания, %', base: number(baseline.utilization.mixing * 100, 2), fast: number(accelerated.utilization.mixing * 100, 2) },
  { label: 'Загрузка лаборатории, %', base: number(baseline.utilization.quality * 100, 2), fast: number(accelerated.utilization.quality * 100, 2) },
  { label: 'Загрузка фасовки, %', base: number(baseline.utilization.filling * 100, 2), fast: number(accelerated.utilization.filling * 100, 2) },
  { label: 'Демонстрационная стоимость завершённых партий, ₽', base: number(baseline.totalCost, 2), fast: number(accelerated.totalCost, 2) },
  { label: 'Демонстрационная стоимость готового литра, ₽/л', base: number(baseline.costPerLiter, 3), fast: number(accelerated.costPerLiter, 3) },
];

export default function ModelPage() {
  const p = DEFAULT_PARAMETERS;
  return (
    <main className="public-model" style={{ maxWidth: 960, margin: '0 auto', padding: '40px 24px 80px', color: '#25382f', fontSize: 15, lineHeight: 1.75 }}>
      <style>{'.public-model h1{margin:14px 0 22px}.public-model h2{font-size:23px;line-height:1.35;margin:0 0 18px}.public-model p{margin:12px 0}.public-model li{margin-bottom:10px}.public-model dd{margin:5px 0 18px}.public-model a:hover{text-decoration:underline}.public-model a:focus-visible{outline-offset:4px}'}</style>
      <Link href="/" style={{ color: '#2c6750', fontWeight: 650 }}>← Карта участка и симуляция</Link>
      <header style={{ padding: '30px 0 22px' }}>
        <p style={{ fontSize: 12, letterSpacing: 2, fontWeight: 700 }}>КОНТУР · УЧЕБНЫЙ ПРОТОТИП</p>
        <h1 style={{ fontSize: 'clamp(28px, 5vw, 44px)', lineHeight: 1.2 }}>Модель участка и результаты</h1>
        <p>Небольшой вымышленный участок приёма, хранения, смешивания и фасовки технических масел из двух совместимых готовых компонентов A и B. Это демонстрация пользовательского опыта для студенческого хакатона «Цифровой двойник предприятия и 3D-туры по производству».</p>
        <p>Описания и результаты представлены обычным HTML-текстом и доступны без выполнения клиентского JavaScript. Это иллюстративный учебный объект; план не является инженерным проектом.</p>
      </header>

      <section aria-labelledby="layout">
        <h2 id="layout">Планировка и производственная последовательность</h2>
        <p>Север расположен сверху. SVG-карта использует координаты 1200 × 800. Пост приёма автоцистерн находится в северо-западном углу, X 60–340, Y 0–180, и примыкает непосредственно к верхнему краю. Ожидание машин расположено южнее поста. Два наружных резервуара A/B находятся слева от производственного корпуса; между ними и западной стеной корпуса расположен насосный узел.</p>
        <p>Внутри корпуса: смешивание на северо-западе, лаборатория на северо-востоке, фасовка на юго-западе, готовая продукция на юго-востоке. Площадка отгрузки находится снаружи у южных ворот. Автомобильный проезд и пешеходные проходы разделены. Через западный вход предусмотрен проход в общий внутренний коридор.</p>
        <ol>
          {EQUIPMENT.map((item) => <li key={item.id}><strong>{item.title}.</strong> {item.process}</li>)}
        </ol>
        <p>Масло идёт от приёма к резервуарам, затем по отдельным линиям A/B через насосный узел к смесителю и из него к фасовке. В лабораторию движется проба, а между фасовкой и складом — тара. Эти связи не представлены как магистральные трубопроводы.</p>
      </section>

      <section aria-labelledby="tour" style={{ marginTop: 36 }}>
        <h2 id="tour">Семь точек экскурсии</h2>
        <p>Виды участка — семь отдельных статичных изображений с высоты глаз около 1,7 м. Они созданы встроенным генератором с общими стилевыми референсами. Это не 360°-панорамы и не интерактивная 3D-сцена. Изображение показывает обстановку; состояния и показатели рядом с ним берутся из текущей симуляции.</p>
        <ol>
          {TOUR_POINTS.map((point) => (
            <li key={point.id} style={{ marginBottom: 14 }}>
              <strong>{point.id} — {point.title}.</strong> Координаты камеры ({point.x}, {point.y}), взгляд: {point.direction.toLowerCase()}. {point.description}
              <br /><span>Показатели: {point.metrics.join(', ').toLowerCase()}. </span><a href={point.image} style={{ color: '#2c6750' }}>Открыть иллюстрацию</a>
            </li>
          ))}
        </ol>
        <p>Выбор оборудования показывает его параметры. Вид открывается только камерой или явной кнопкой просмотра. Маршрут переключает выбранные точки последовательно P01 → P07; произвольная прогулка не моделируется.</p>
      </section>

      <section aria-labelledby="assumptions" style={{ marginTop: 36 }}>
        <h2 id="assumptions">Вычислительная модель и допущения</h2>
        <p>Детерминированный симулятор продвигает модельное время между событиями. Изменение частоты кадров или скорости воспроизведения не меняет расчёт. Технологические параметры — черновик следующего запуска; к текущему прогону они применяются явным перезапуском.</p>
        <ul>
          <li>Один пост приёма обслуживает одну автоцистерну. При недостатке вместимости разгрузка ждёт освобождения резервуара, сохраняя занятость поста. Обслуживание включает ожидание, подготовку, перекачку и завершение.</li>
          <li>Компоненты списываются из запасов ровно один раз, при запуске партии. Запас не может стать отрицательным или превысить вместимость.</li>
          <li>Одна смешивающая ёмкость удерживает партию во время смешивания, контроля и ожидания фасовки. Освобождение происходит только при передаче на свободную линию фасовки. Лаборатория и фасовка — ограниченные ресурсы.</li>
          <li>Заполнение смесителя включено в длительность смешивания. Приёмный насос и условные линии подачи в цех — разные ресурсы.</li>
          <li>Все доли объёмные, единица материала — литр. Объёмы аддитивны, потери отсутствуют. Материал учитывается в запасах, незавершённых партиях и готовой продукции.</li>
          <li>Все корректно приготовленные партии проходят проверку. В лабораторию передаётся проба без моделирования её отдельного расхода.</li>
          <li>Температура фиксирована; нагрев, давление, турбулентность, свойства молекул и вязкость готовой смеси не рассчитываются.</li>
          <li>Готовый объём учитывается после полного завершения фасовки партии. Вывоз со склада и ограниченная вместимость склада в этой версии не моделируются.</li>
        </ul>
        <p><strong>Перекачка:</strong> t = V / (Q × k(ν)). Условная таблица поправок: 40 сСт → 1,00; 100 → 0,80; 200 → 0,60; 300 → 0,45. Между точками используется линейная интерполяция; допустимый ввод — 40–300 сСт. Это синтетическая демонстрационная зависимость, не характеристика реального насоса. Контрольный пример: 12 000 л / 600 л/мин при k = 1 даёт 20 минут перекачки.</p>
        <p><strong>Рецептура:</strong> V<sub>A</sub> = V<sub>партии</sub> × (1 − доля B); V<sub>B</sub> = V<sub>партии</sub> × доля B. <strong>Загрузка:</strong> занятое время ресурса / длительность наблюдения. Для смесителя занятость включает удержание партии при контроле и ожидании передачи.</p>
      </section>

      <section aria-labelledby="parameters" style={{ marginTop: 36 }}>
        <h2 id="parameters">Начальные демонстрационные параметры</h2>
        <dl>
          <dt><strong>Поставки и смена</strong></dt><dd>Смена {p.shiftMinutes} мин; первое прибытие в момент 0, далее каждые {p.arrivalInterval} мин; повторяющееся расписание {p.deliveryPattern}; каждая автоцистерна {number(p.deliveryVolume)} л. Подготовка {p.preparationMinutes} мин, завершение {p.finishingMinutes} мин.</dd>
          <dt><strong>Приём и хранение</strong></dt><dd>Номинальный расход {p.receivingRate} л/мин. Вязкость A {p.viscosityA} сСт, B {p.viscosityB} сСт. Вместимость A {number(p.capacityA)} л, B {number(p.capacityB)} л; начальные остатки A {number(p.initialA)} л, B {number(p.initialB)} л.</dd>
          <dt><strong>Производство</strong></dt><dd>Партия {number(p.batchVolume)} л, доля B {number(p.fractionB * 100)}%, A {number((1 - p.fractionB) * 100)}%. Смешивание {p.mixingMinutes} мин, контроль {p.qualityMinutes} мин; базовая фасовка {p.fillingRate} л/мин.</dd>
        </dl>
        <p><strong>Демонстрационная стоимость:</strong> компонент A {DEMO_COSTS.componentA} ₽/л, B {DEMO_COSTS.componentB} ₽/л; удержание смесителя {DEMO_COSTS.mixingPerMinute} ₽/мин, работа лаборатории {DEMO_COSTS.qualityPerMinute} ₽/мин, фасовка {DEMO_COSTS.fillingPerMinute} ₽/мин. Стоимость завершённой партии = стоимость её компонентов + фактическая занятость смесителя × тариф + время проверки × тариф + время фасовки × тариф. Стоимость литра = сумма стоимости завершённых партий / готовый объём. Приём, здания, транспорт, налоги и прочие расходы не включены. Цены условные, это не финансовый прогноз.</p>
      </section>

      <section aria-labelledby="comparison" style={{ marginTop: 36 }}>
        <h2 id="comparison">Вычисленное сравнение за полную смену</h2>
        <p>Два демонстрационных результата получены из той же функции симуляции при сборке страницы. Это фиксированное сравнение начального набора за {p.shiftMinutes} минут, не текущий прогон и не сохранённые пользовательские результаты браузера. Начальные запасы и расписание поставок одинаковы. Во втором сценарии изменена только номинальная фасовка: {p.fillingRate} → {acceleratedParameters.fillingRate} л/мин.</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 540, fontSize: 14 }}>
            <caption style={{ textAlign: 'left', paddingBottom: 10 }}>Синтетические данные · длительность наблюдения {p.shiftMinutes} мин</caption>
            <thead><tr>{['Показатель', 'Базовый режим', 'Ускоренная фасовка'].map((title) => <th key={title} scope="col" style={{ textAlign: 'left', borderBottom: '2px solid #9cad9f', padding: '10px 12px' }}>{title}</th>)}</tr></thead>
            <tbody>{comparisonRows.map((row) => <tr key={row.label}><th scope="row" style={{ textAlign: 'left', fontWeight: 500, padding: '10px 12px', borderBottom: '1px solid #dbe2db' }}>{row.label}</th><td style={{ padding: '10px 12px', borderBottom: '1px solid #dbe2db' }}>{row.base}</td><td style={{ padding: '10px 12px', borderBottom: '1px solid #dbe2db' }}>{row.fast}</td></tr>)}</tbody>
          </table>
        </div>
        <p>Расчётная разница выпуска: {number(accelerated.readyVolume - baseline.readyVolume)} л ({number((accelerated.readyVolume / baseline.readyVolume - 1) * 100, 1)}%). Удвоение скорости фасовки не означает удвоение выпуска: на результат влияют смешивание, проверка, удержание ёмкости и запасы. Очередь в конце не включает машину, которая уже занимает пост приёма. Незавершённые партии показаны отдельно от готовой продукции.</p>
      </section>

      <section aria-labelledby="boundaries" style={{ marginTop: 36 }}>
        <h2 id="boundaries">Ограничения и дальнейшее развитие</h2>
        <p>Прототип работает на синтетических данных, без обязательной регистрации и без интеграций ERP/MES/1С. Базовая авторизация пока отсутствует и не считается выполненным требованием полного хакатонного решения. Пользовательские сценарии хранятся только в localStorage текущего браузера. Метрики производительности под нагрузкой не измерялись и не заявляются.</p>
        <p>Описание точки отделено от компонента просмотра: её изображение можно заменить панорамой с направлением обзора или WebGL-сценой Three.js/React Three Fiber. Независимую функцию симуляции можно заменить серверным API, сохранив параметры и снимок состояния как контракт; возможный стек — Rust/Axum/Tokio и PostgreSQL. Для публикации полного приложения нужен HTTPS. Расширение инфраструктуры следует обосновывать требованиями и измерениями.</p>
      </section>
      <footer style={{ marginTop: 40, paddingTop: 20, borderTop: '1px solid #dbe2db' }}><Link href="/" style={{ color: '#2c6750', fontWeight: 650 }}>Вернуться к карте →</Link></footer>
    </main>
  );
}


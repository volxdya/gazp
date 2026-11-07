# Виды участка v2: действующее производство

Семь новых отдельных иллюстраций созданы встроенным `image_gen.imagegen`; CLI/API-ключ не использовались. Это сгенерированные статичные виды вымышленного участка, не фотографии объектов Газпрома, не 360° и не интерактивная 3D-сцена. Предыдущие виды сохранены без замены в `public/views/` и `assets/source-views/`.

## Облик и согласованность

Участок представлен небольшой частью большого промышленного комплекса. Вне его моделируемых границ видны трубные эстакады, соседние корпуса и дальние колонны. Два местных резервуара, один смеситель, приёмная автоцистерна, лаборатория, фасовка и склад сохраняют состав исходной карты. Основная палитра — промышленный синий, белый, холодный серый и потёртая жёлтая разметка. Бетон и окраска имеют следы эксплуатации; фланцы, болты, кабельные трассы и опоры придают оборудованию рабочий характер. В помещении лаборатории приборы и пробы чистые, износ относится к мебели и окружающему помещению.

Камеры на высоте глаз около 1,7 м, нормальный объектив около 35 мм, горизонтальный кадр 1672 × 941. Ракурсы оборудования преимущественно фронтальные и перпендикулярные его лицевой стороне: маховики, приборы и шкафы доступны для разметки интерактивными точками.

Сначала создан P03. Он стал стилевым референсом P01/P02/P04. Для P05/P06/P07 использованы P03 и P04. Все семь результатов просмотрены: местных наружных резервуаров два, в смесительном помещении одна ёмкость, корпус справа от резервуаров, южные ворота склада без резервуаров перед ними. Это условная пространственная согласованность, не фотограмметрическая реконструкция.

Веб-версии: `public/views/v2/*.webp`, Pillow quality=88/method=6. Исходники: `assets/source-views-v2/*.png`. Геометрия изображения при оптимизации не менялась. Соответствие точек ниже дано в процентах от левого верхнего угла полного изображения.

## Визуальное направление

В качестве направления использованы индустриальные мотивы действующих российских производств, в том числе больших объектов Газпрома/Газпром нефти: синие металлоконструкции и оборудование, серые коммуникации, трубные эстакады и протяжённые заводские корпуса. Ориентиры, предоставленные основным агентом: [Газпром нефть — фото на Commons](https://commons.wikimedia.org/wiki/Category:Gazprom_Neft), [Амурский ГПЗ](https://www.gazprom.ru/projects/amur-gpp/). Эти фотографии не вставлены в приложение; новые изображения созданы генератором по описанию и общему P03-референсу.

## P01 — p01-receiving.webp

Use case: photorealistic-natural. Asset type: NEW landscape16:9 industrial tour photograph, NOT UI. Reference image is the photographic appearance/materials/palette of the SAME fictional technical-oil facility inside a much larger Russian petrochemical enterprise inspired by real Gazprom plants. Make a NEW viewpoint, not a copy of reference composition. Documentary industrial photograph, eye-level1.7m normal35mm lens. Gazprom-inspired industrial BLUE motors/doors/structures, light-grey metal panels and pipes, yellow worn floor markings. Flat cool overcast outdoors, unglamorous neutral fluorescent lighting indoors. Believable maintained USED production: scuffed blue paint, old grey concrete with damp patches outside, slight grime at fasteners, dusty cable trays and brackets, meaningful flanges/insulation/conduit. Not ruined, no spills/leaks, no unsafe disaster. Not idealized showroom, not shiny CGI, not cinematic. No logos, no watermark, no generated readable text, no people blocking controls, no labels/arrows/UI. Important objects should face the camera square-on, camera optical axis perpendicular to the front of the equipment for later clickable hotspots. View P01. Stand southeast of the receiving bay at the northwestern boundary of our small block, look northwest towards a silver road tanker parked nose north under a simple weathered blue steel receiving canopy. Show tanker left and center. At RIGHT FOREGROUND show receiving hose coupling, silver unloading pipe manifold with large visible blue isolation valve handwheel and a small blue receiving control box, all front-facing and unobstructed. Pedestrian position outside traffic lane. Truck looks used but maintained. Canopy sits at north edge of the modeled block; access road continues north beyond it. IMPORTANT: beyond this little bay the MUCH LARGER factory stretches into the distance with pipe racks on blue supports, adjacent grey industrial halls and distant stacks; do not place our two local tanks in foreground or block route. Ordinary wet cracked concrete, worn yellow aisle marking, puddles and grey sky, authentic workday.

### Привязки интерактивных точек

| Объект | X, % | Y, % |
| --- | ---: | ---: |
| Соединение разгрузочного рукава | 60 | 70 |
| Маховик приёмной задвижки | 72 | 50 |
| Манометр приёма | 80.5 | 52 |
| Шкаф приёма | 91 | 57 |

## P02 — p02-storage.webp

Use case: photorealistic-natural. Asset type: NEW landscape16:9 industrial tour photograph, NOT UI. Reference image is the photographic appearance/materials/palette of the SAME fictional technical-oil facility inside a much larger Russian petrochemical enterprise inspired by real Gazprom plants. Make a NEW viewpoint, not a copy of reference composition. Documentary industrial photograph, eye-level1.7m normal35mm lens. Gazprom-inspired industrial BLUE motors/doors/structures, light-grey metal panels and pipes, yellow worn floor markings. Flat cool overcast outdoors, unglamorous neutral fluorescent lighting indoors. Believable maintained USED production: scuffed blue paint, old grey concrete with damp patches outside, slight grime at fasteners, dusty cable trays and brackets, meaningful flanges/insulation/conduit. Not ruined, no spills/leaks, no unsafe disaster. Not idealized showroom, not shiny CGI, not cinematic. No logos, no watermark, no generated readable text, no people blocking controls, no labels/arrows/UI. Important objects should face the camera square-on, camera optical axis perpendicular to the front of the equipment for later clickable hotspots. View P02. Stand southwest of the local tank area looking northeast. EXACTLY TWO cylindrical raw-oil storage tanks, each4mwide5mtall, the SAME two scuffed matte silver tanks and blue/yellow staircase details from reference. They occupy left and center, both fully countable, on shared low weathered concrete bund with outlets. Front-facing blue handwheel outlet valves clear at base, each a plausible hotspot. A compact blue pump manifold lies in depth toward RIGHT, not dominating. Low light-grey blue-trim production building EAST on FAR RIGHT. Beyond our small block, elevated pipe racks on blue supports, adjoining industrial halls, far narrow process towers imply huge active plant stretching outside image; distinguish the two local tanks from any distant machinery, no extra foreground tanks. Wide normal eye-level documentary shot, unswept damp concrete and restrained worn yellow paint.

### Привязки интерактивных точек

| Объект | X, % | Y, % |
| --- | ---: | ---: |
| Выход резервуара A | 25.4 | 64 |
| Выход резервуара B | 54.2 | 64 |
| Насосный узел справа | 77 | 65 |

## P03 — p03-pumps.webp

Use case: photorealistic-natural. Asset type: landscape 16:9 industrial tour photograph, overview P03, NOT a user interface. A documentary photograph inside a large operating Russian petrochemical enterprise, inspired by real Gazprom industrial sites. We only show a small technical-oil receiving/blending block belonging to the much larger factory visible beyond. Human eye-level 1.7 m, normal 35 mm lens, camera square-on and perpendicular to the FACE of a compact pump manifold, not an oblique dramatic view. Foreground: two practical industrial-blue electric pump motors on a low weathered concrete plinth, connected silver/grey steel pipe manifold, physical flanges, elbows, handwheel isolation valves, pressure gauge, small blue control cabinet on right. The main motor and valve handwheel must be clearly visible to attach separate clickable hotspots later. Exactly TWO matching cylindrical metal raw-oil tanks sit behind and to the LEFT, same tank series, about 4m wide and 5m high. A grey panel production building edge at far RIGHT. Outside this compact modeled block, in the far background beyond the two tanks, tall pipe racks, blue structural steel, adjoining grey factory halls and a few distant process towers imply a much larger plant, they are background context and not extra local tanks. Cool overcast flat daylight. Used, believable place: dusty weathered concrete, small damp patches, worn yellow aisle paint, chipped blue paint on motors and railings, grease around couplings, mild oxidation on bolts, scuffed pipe insulation cladding, cable trays, supports and conduit. Maintain safe maintained equipment, no leaks, no disaster, not derelict. Gazprom-inspired blue, white, cold grey, restrained amber/yellow safety accents. Natural photographic exposure, slight lens texture, NO glossy architectural showroom, NO spotless perfect floor, NO cinematic teal grading. No people blocking equipment, no logos, no watermark, no legible generated text or UI, no arrows or labels. Full frame horizontal16:9.

### Привязки интерактивных точек

| Объект | X, % | Y, % |
| --- | ---: | ---: |
| Передний электродвигатель | 28 | 65 |
| Большой фронтальный маховик | 48 | 43 |
| Манометр | 56 | 44 |
| Шкаф управления | 89 | 53 |

## P04 — p04-blending.webp

Use case: photorealistic-natural. Asset type: NEW landscape16:9 industrial tour photograph, NOT UI. Reference image is the photographic appearance/materials/palette of the SAME fictional technical-oil facility inside a much larger Russian petrochemical enterprise inspired by real Gazprom plants. Make a NEW viewpoint, not a copy of reference composition. Documentary industrial photograph, eye-level1.7m normal35mm lens. Gazprom-inspired industrial BLUE motors/doors/structures, light-grey metal panels and pipes, yellow worn floor markings. Flat cool overcast outdoors, unglamorous neutral fluorescent lighting indoors. Believable maintained USED production: scuffed blue paint, old grey concrete with damp patches outside, slight grime at fasteners, dusty cable trays and brackets, meaningful flanges/insulation/conduit. Not ruined, no spills/leaks, no unsafe disaster. Not idealized showroom, not shiny CGI, not cinematic. No logos, no watermark, no generated readable text, no people blocking controls, no labels/arrows/UI. Important objects should face the camera square-on, camera optical axis perpendicular to the front of the equipment for later clickable hotspots. View P04 interior. Camera inside southwest doorway of modest technical-oil mixing room looking northeast, square-on to front face of ONE main cylindrical metal mixing vessel about2mwide3mtall, with BLUE agitator motor on top. Vessel occupies center-left with scuffed brushed metal, fittings and low access platform; exactly TWO component supply lines enter from WEST WALL LEFT and connect to vessel. Visible two blue inlet handwheel valves along these lines. A small tall industrial BLUE control cabinet immediately RIGHT of vessel with front door facing camera perfectly perpendicular: few small physical buttons/switches but no readable text. Concrete floor worn from work, yellow pedestrian aisle marking, conduits/cable trays overhead, realistic shop clutter limited to a hose reel and maintenance trolley off aisle. Right background shows interior corridor opening with deep continuation into adjacent factory hall, making this feel one room in larger plant, NOT an exterior doorway to the street. Grey panel walls, modest high window, low practical ceiling. Exactly ONE vessel, no extra mixing tanks, no refinery column inside. Neutral fluorescent/LED exposure, no showroom polish.

### Привязки интерактивных точек

| Объект | X, % | Y, % |
| --- | ---: | ---: |
| Верхняя подача A | 26 | 34 |
| Нижняя подача B | 25.5 | 49 |
| Привод мешалки | 48 | 13 |
| Шкаф смесителя | 68 | 60 |

## P05 — p05-quality.webp

Use case: photorealistic-natural. Asset type: NEW landscape16:9 industrial tour photograph, NOT UI. Reference image is the photographic appearance/materials/palette of the SAME fictional technical-oil facility inside a much larger Russian petrochemical enterprise inspired by real Gazprom plants. Make a NEW viewpoint, not a copy of reference composition. Documentary industrial photograph, eye-level1.7m normal35mm lens. Gazprom-inspired industrial BLUE motors/doors/structures, light-grey metal panels and pipes, yellow worn floor markings. Flat cool overcast outdoors, unglamorous neutral fluorescent lighting indoors. Believable maintained USED production: scuffed blue paint, old grey concrete with damp patches outside, slight grime at fasteners, dusty cable trays and brackets, meaningful flanges/insulation/conduit. Not ruined, no spills/leaks, no unsafe disaster. Not idealized showroom, not shiny CGI, not cinematic. No logos, no watermark, no generated readable text, no people blocking controls, no labels/arrows/UI. Important objects should face the camera square-on, camera optical axis perpendicular to the front of the equipment for later clickable hotspots. View P05. A modest real quality-control laboratory ROOM inside the same production complex, front-on perpendicular view of a practical grey WORKBENCH, from standing eye-level1.7m at its southwest entry looking northeast. Bench spans image center with scuffed laminate, functional blue base cabinets and normal laboratory instruments. On the workbench CENTER a compact rotational oil viscometer with a small plain control display and probe suspended into an amber sample beaker, to its RIGHT a compact bench instrument and capped sample bottles in a metal rack. A few paper logs/labels not readable. Grey electrical conduit along wall, used but clean equipment. High industrial window above-left shows out-of-focus BLUE pipe racks and grey industrial halls of larger factory, NOT landscaped greenery. Noticeable ordinary wear at cabinet handles and floor, but laboratory hygiene preserved: no grime on samples, no rust in analytical instruments, no hospitalsetting. Front faces of instruments square to camera, targets clearly visible. Neutral plain ceiling lighting, not glossy pristine showroom; only one small laboratory, no mixing tank in this room.

### Привязки интерактивных точек

| Объект | X, % | Y, % |
| --- | ---: | ---: |
| Прибор контроля пробы | 49 | 35 |
| Янтарная проба масла | 49 | 49 |
| Настольный анализатор | 61.5 | 50 |
| Стойка образцов | 75 | 52 |

## P06 — p06-filling.webp

Use case: photorealistic-natural. Asset type: NEW landscape16:9 industrial tour photograph, NOT UI. Reference image is the photographic appearance/materials/palette of the SAME fictional technical-oil facility inside a much larger Russian petrochemical enterprise inspired by real Gazprom plants. Make a NEW viewpoint, not a copy of reference composition. Documentary industrial photograph, eye-level1.7m normal35mm lens. Gazprom-inspired industrial BLUE motors/doors/structures, light-grey metal panels and pipes, yellow worn floor markings. Flat cool overcast outdoors, unglamorous neutral fluorescent lighting indoors. Believable maintained USED production: scuffed blue paint, old grey concrete with damp patches outside, slight grime at fasteners, dusty cable trays and brackets, meaningful flanges/insulation/conduit. Not ruined, no spills/leaks, no unsafe disaster. Not idealized showroom, not shiny CGI, not cinematic. No logos, no watermark, no generated readable text, no people blocking controls, no labels/arrows/UI. Important objects should face the camera square-on, camera optical axis perpendicular to the front of the equipment for later clickable hotspots. View P06. Interior of the same modest oil filling room, camera at southwest entrance looking northeast, camera square-on perpendicular to FRONT of a short practical industrial filling machine. Machine frame BLUE, silver short roller/conveyor, three visible cylindrical metal industrial drums under filling nozzles, a clear FRONT-facing BLUE control cabinet on RIGHT of machine with a few small physical buttons/switches but no readable generated text. One empty IBC container further RIGHT beside opening to finished-goods hall, pallets and capped drums in right depth. This is a compact local filling line, not giant modern automated showroom. Show worn concrete, restrained yellow aisle painted with scuffs, used blue paint, motor coupling shield, real hoses/cables/brackets/flanges, a hose reel stored off aisle. Large adjoining factory hall visible through right inner opening with repeated blue columns, pipe racks and neutral overhead lights establishes this tiny room is part of vast plant. One continuous process line; no people blocking controls, realistic machine scale, no external tanks inside, no spilledoil. No harsh cinematic lighting.

### Привязки интерактивных точек

| Объект | X, % | Y, % |
| --- | ---: | ---: |
| Привод фасовки | 49 | 23 |
| Разливочные сопла | 44.5 | 43 |
| Шкаф фасовки | 69.5 | 52 |
| Промышленная тара IBC | 83 | 65 |

## P07 — p07-dispatch.webp

Use case: photorealistic-natural. Asset type: NEW landscape16:9 industrial tour photograph, NOT UI. Reference image is the photographic appearance/materials/palette of the SAME fictional technical-oil facility inside a much larger Russian petrochemical enterprise inspired by real Gazprom plants. Make a NEW viewpoint, not a copy of reference composition. Documentary industrial photograph, eye-level1.7m normal35mm lens. Gazprom-inspired industrial BLUE motors/doors/structures, light-grey metal panels and pipes, yellow worn floor markings. Flat cool overcast outdoors, unglamorous neutral fluorescent lighting indoors. Believable maintained USED production: scuffed blue paint, old grey concrete with damp patches outside, slight grime at fasteners, dusty cable trays and brackets, meaningful flanges/insulation/conduit. Not ruined, no spills/leaks, no unsafe disaster. Not idealized showroom, not shiny CGI, not cinematic. No logos, no watermark, no generated readable text, no people blocking controls, no labels/arrows/UI. Important objects should face the camera square-on, camera optical axis perpendicular to the front of the equipment for later clickable hotspots. View P07. Exterior loading apron SOUTH of same low grey panel production building, camera looking due NORTH perpendicular to its south facade. The main warehouse opening centered, large INDUSTRIAL BLUE sliding doors partially open. Through doorway show stored IBC totes and capped drums on pallets, straight concrete passage to finished stock. Adjacent blue steel docking bollards, modest metal pallet loading platform and one spare pallet outside. Building continues beyond LEFT and RIGHT, and behind/above its far corners glimpses of much larger connected factory halls, elevated pipe racks and distant industrial chimneys establish our little warehouse a small zone in a huge plant. No local oil tanks in FRONT of warehouse, no tanker here, no invented refinery equipment blocking apron. Ordinary old loading concrete with shallow damp patches, faded yellow traffic paint, slight wear on door loweredges/bollards and panel seams, safe maintained setting. Front-facing gate motor/control box on right jamb must be unobstructed for clickable hotspot; stock containers visible. Flat cloudy daylight, no marketingarchitecturalrender, no people blockingview, no logos/generatedwriting.

### Привязки интерактивных точек

| Объект | X, % | Y, % |
| --- | ---: | ---: |
| Привод ворот | 80 | 31 |
| Пост управления воротами | 81.5 | 54 |
| Готовые партии на складе | 52 | 58 |



// observatory.js — Обсерватория (B-02): второе небо на месте игрового поля
//
// Холст, который не заполняется никогда: звёзды приходят сами по мере игры
// (1 на каждые OBSERVATORY_STAR_COST ✦ за всё время), игрок их перемещает,
// соединяет и красит. Ни распознавания, ни очков, ни ночи, ни завершения.
//
// Главное свойство: обсерватория ПЕРЕЖИВАЕТ СМЕНУ ДНЯ. Игровое поле стирается
// каждую ночь (isSavedSkyDateStale в save.js), поэтому у холста свой ключ
// хранения, а не поле в дневном сейве.
//
// Ни одно действие здесь не начисляет и не списывает ✦ и не трогает ни одну
// цепочку достижений — экономика от обсерватории не зависит вообще.

// =============================================================================
// СОСТОЯНИЕ
// =============================================================================

/** Звёзды холста: {id, x, y, colorValue}. Координаты — мировые (FIELD_WIDTH × FIELD_HEIGHT). */
let observatoryStars = [];
/** Связи: {startId, endId}. Граф без правил — ни фигур, ни лимитов, ни запрета пересечений. */
let observatoryLines = [];
/**
 * U-12: имена созвездий холста — {stars:[id…], nameId, custom, dx, dy}.
 * Созвездие здесь — связная компонента из двух и более звёзд; имени вне
 * компоненты не существует. `dx`/`dy` — смещение подписи от центра компоненты.
 */
let observatoryNames = [];
/** Фоновая россыпь: своя, детерминированная по playerId (в сейв не пишется). */
let observatoryBackgroundStars = [];
/** 'connect' — соединять (по умолчанию), 'move' — перемещать. */
let observatoryMode = 'connect';
/**
 * K-13: «когда лист начат» — подпись под оттиском. Ночь первой звезды, а не
 * текущая: лист подписывают один раз. null — ещё не начат либо старый сейв,
 * доберётся при загрузке (см. loadObservatory).
 */
let observatoryBeganNight = null;

let observatoryNextStarId = 0;

const OBSERVATORY_SAVE_KEY = 'starsReborn_observatory_v01';
const OBSERVATORY_SAVE_DEBOUNCE_MS = 500;

/** Порог «тап или протяжка»: ниже обоих — тап. Настраивается на устройстве. */
const OBSERVATORY_TAP_MAX_PX = 8;
const OBSERVATORY_TAP_MAX_MS = 250;

/** Сколько раз пробуем положить новую звезду с min-distance, прежде чем класть куда легло. */
const OBSERVATORY_PLACE_ATTEMPTS = 60;

// U-12: подписи. Числа этого блока настраиваются на устройстве — держим их
// рядом с порогами тапа, а не в constants.js: класс один и тот же.

/** Дальше этого подпись от центра созвездия не уходит; у мелкого — минимум столько. */
const OBSERVATORY_LABEL_RADIUS_MIN = 120;
/** Запас вокруг текстового прямоугольника подписи при попадании пальцем (экранные px). */
const OBSERVATORY_LABEL_HIT_PAD = 10;
/** Звезда строго под пальцем выигрывает у подписи, накрывшей её (мировые ед.). */
const OBSERVATORY_LABEL_STAR_PRIORITY = STAR_SIZE * 1.5;

// =============================================================================
// ХРАНЕНИЕ
// =============================================================================
//
// Позиции нормируются в 0..1 (как PICTURE_FIELDS): холст переживает смену
// размера экрана и любое будущее изменение FIELD_WIDTH/FIELD_HEIGHT.

let observatorySaveTimer = null;

function saveObservatoryNow() {
    if (observatorySaveTimer !== null) {
        clearTimeout(observatorySaveTimer);
        observatorySaveTimer = null;
    }
    try {
        const state = {
            stars: observatoryStars.map(s => ({
                id: s.id,
                nx: s.x / FIELD_WIDTH,
                ny: s.y / FIELD_HEIGHT,
                c: s.colorValue
            })),
            lines: observatoryLines.map(l => [l.startId, l.endId]),
            mode: observatoryMode,
            // U-12: имена — величина, не выводимая из холста, поэтому лежат
            // в ЭТОМ же ключе. Второй ключ = второй момент записи = рассинхрон
            // (урок B-02, там он выдавал звёзды дважды). Поле аддитивное:
            // старый сейв без него читается как холст без имён, миграции нет.
            names: observatoryNames.map(e => ({
                stars: e.stars.slice(),
                nameId: e.nameId || null,
                custom: e.custom || null,
                dnx: (e.dx || 0) / FIELD_WIDTH,
                dny: (e.dy || 0) / FIELD_HEIGHT
            })),
            // K-13: поле аддитивное, как names — старый сейв читается без него.
            beganNight: observatoryBeganNight || null
        };
        localStorage.setItem(OBSERVATORY_SAVE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Observatory save failed:', e);
    }
}

/** Дебаунс после действия; переключение режима и visibilitychange пишут безусловно. */
function scheduleObservatorySave() {
    if (observatorySaveTimer !== null) clearTimeout(observatorySaveTimer);
    observatorySaveTimer = setTimeout(() => {
        observatorySaveTimer = null;
        saveObservatoryNow();
    }, OBSERVATORY_SAVE_DEBOUNCE_MS);
}

function loadObservatory() {
    observatoryStars = [];
    observatoryLines = [];
    observatoryNames = [];
    observatoryNextStarId = 0;
    observatoryBeganNight = null;
    try {
        const raw = localStorage.getItem(OBSERVATORY_SAVE_KEY);
        if (!raw) return false;
        const state = JSON.parse(raw);

        const seenIds = new Set();
        for (const s of Array.isArray(state.stars) ? state.stars : []) {
            if (!s) continue;
            const id = Math.floor(Number(s.id));
            if (!Number.isFinite(id) || seenIds.has(id)) continue;
            seenIds.add(id);
            observatoryStars.push({
                id,
                x: constrain(Number(s.nx) * FIELD_WIDTH, 0, FIELD_WIDTH),
                y: constrain(Number(s.ny) * FIELD_HEIGHT, 0, FIELD_HEIGHT),
                colorValue: normalizeStarColorValue(Number(s.c))
            });
            if (id >= observatoryNextStarId) observatoryNextStarId = id + 1;
        }

        for (const pair of Array.isArray(state.lines) ? state.lines : []) {
            if (!Array.isArray(pair) || pair.length !== 2) continue;
            const a = Math.floor(Number(pair[0]));
            const b = Math.floor(Number(pair[1]));
            // Битая связь (звезды нет) молча выбрасывается: холст важнее целостности файла
            if (a === b || !seenIds.has(a) || !seenIds.has(b)) continue;
            if (hasObservatoryLine(a, b)) continue;
            observatoryLines.push({ startId: a, endId: b });
        }

        // U-12: имя привязано к НАБОРУ звёзд, а не к своему порядковому номеру.
        // Дальше syncObservatoryNames() сведёт эти записи с фактическими
        // компонентами — тем же правилом, что работает при слиянии и распаде.
        for (const n of Array.isArray(state.names) ? state.names : []) {
            if (!n || !Array.isArray(n.stars)) continue;
            const ids = n.stars
                .map(v => Math.floor(Number(v)))
                .filter(v => Number.isFinite(v) && seenIds.has(v));
            if (ids.length < 2) continue;
            observatoryNames.push({
                stars: ids.sort((a, b) => a - b),
                nameId: typeof n.nameId === 'string' ? n.nameId : null,
                custom: (typeof n.custom === 'string' && n.custom) ? n.custom : null,
                dx: Number(n.dnx) * FIELD_WIDTH || 0,
                dy: Number(n.dny) * FIELD_HEIGHT || 0
            });
        }

        if (state.mode === 'move' || state.mode === 'connect') observatoryMode = state.mode;

        const beganNight = Math.floor(Number(state.beganNight));
        observatoryBeganNight = Number.isFinite(beganNight) && beganNight > 0 ? beganNight : null;
        // K-13: сейв без поля (до этой задачи) — лист уже начат, но ночь потеряна.
        // Лучшее доступное приближение: текущая ночь на первой загрузке после
        // обновления. Точный номер не восстановить, а пустая подпись хуже.
        if (observatoryBeganNight === null && observatoryStars.length > 0) {
            observatoryBeganNight = getObservatoryCurrentNightNumber();
        }

        syncObservatoryNames();
        return true;
    } catch (e) {
        console.warn('Observatory load failed:', e);
        return false;
    }
}

function clearObservatorySave() {
    if (observatorySaveTimer !== null) {
        clearTimeout(observatorySaveTimer);
        observatorySaveTimer = null;
    }
    try {
        localStorage.removeItem(OBSERVATORY_SAVE_KEY);
    } catch (e) { /* ignore */ }
}

/** Полный сброс — вайп: холст стирается вместе с остальным прогрессом. */
function resetObservatoryForFullReset() {
    observatoryStars = [];
    observatoryLines = [];
    observatoryNames = [];
    observatoryNextStarId = 0;
    observatoryMode = 'connect';
    observatoryBeganNight = null;
    resetObservatoryDragState();
    clearObservatorySave();
}

// =============================================================================
// ФОН
// =============================================================================

/**
 * Своя россыпь фоновых звёзд. Собственный LCG вместо p5 random(): глобальный
 * генератор засеян под небо дня (seedSkyRandomForToday), и трогать его выдачей
 * фона обсерватории нельзя — поедет раскладка поля.
 */
function generateObservatoryBackgroundStars() {
    const seedSource = (typeof playerId === 'string' && playerId) ? playerId : 'observatory';
    let s = 2166136261;
    for (let i = 0; i < seedSource.length; i++) {
        s = ((s ^ seedSource.charCodeAt(i)) * 16777619) >>> 0;
    }
    const rnd = () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 4294967296;
    };

    observatoryBackgroundStars = [];
    for (let i = 0; i < BACKGROUND_STAR_COUNT; i++) {
        observatoryBackgroundStars.push({
            x: rnd() * FIELD_WIDTH,
            y: rnd() * FIELD_HEIGHT,
            size: 1 + rnd() * 1.5,
            alpha: 40 + rnd() * 80,
            phase: rnd() * Math.PI * 2
        });
    }
}

// =============================================================================
// ВЫДАЧА ЗВЁЗД
// =============================================================================

function getObservatoryStarById(id) {
    for (const s of observatoryStars) {
        if (s.id === id) return s;
    }
    return null;
}

/**
 * Случайная точка в центральной трети мира с min-distance от соседей.
 * Попыток ограниченное число: на плотном холсте (к году набегает ~150 звёзд)
 * цикл обязан завершиться — кладём в самое просторное из опробованных мест.
 */
function pickObservatoryStarPosition() {
    const minX = FIELD_WIDTH / 3;
    const maxX = FIELD_WIDTH * 2 / 3;
    const minY = FIELD_HEIGHT / 3;
    const maxY = FIELD_HEIGHT * 2 / 3;

    let best = null;
    let bestDist = -1;
    for (let attempt = 0; attempt < OBSERVATORY_PLACE_ATTEMPTS; attempt++) {
        const x = minX + Math.random() * (maxX - minX);
        const y = minY + Math.random() * (maxY - minY);
        let nearest = Infinity;
        for (const s of observatoryStars) {
            const d = Math.hypot(s.x - x, s.y - y);
            if (d < nearest) nearest = d;
        }
        if (nearest >= MIN_STAR_DISTANCE) return { x, y };
        if (nearest > bestDist) {
            bestDist = nearest;
            best = { x, y };
        }
    }
    return best || { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2 };
}

/**
 * «Ночь», которую увидит подпись под оттиском (K-13). Та же нумерация,
 * что в шапке книги на «Сегодня» (K-09) — текущая, ещё не завершённая.
 */
function getObservatoryCurrentNightNumber() {
    return (typeof achievementCounters !== 'undefined' && achievementCounters
        ? achievementCounters.levelsCompleted : 0) + 1;
}

/** Новая звезда приходит жёлтой (colorValue = 0) — цвет дальше задаёт игрок. */
function addObservatoryStar() {
    // K-13: лист подписывают один раз — в ночь самой первой звезды холста.
    if (observatoryBeganNight === null && observatoryStars.length === 0) {
        observatoryBeganNight = getObservatoryCurrentNightNumber();
    }
    const pos = pickObservatoryStarPosition();
    const star = {
        id: observatoryNextStarId++,
        x: pos.x,
        y: pos.y,
        colorValue: 0
    };
    observatoryStars.push(star);
    return star;
}

function getObservatoryBeganNight() {
    return observatoryBeganNight;
}

/**
 * Сколько звёзд холст уже получил. Это и есть счётчик выданного: звёзды
 * отсюда не исчезают никогда, поэтому их количество — точный ответ.
 * Отдельного поля в сейве прогрессии нет намеренно (см. getObservatoryStarsDue).
 */
function getObservatoryGrantedStarCount() {
    return observatoryStars.length;
}

/**
 * Догон выдачи: вызывается при загрузке и при каждом awardMetaScore.
 *
 * Пишем ОБА ключа немедленно, а не дебаунсом: холст и накопитель обязаны
 * лечь на диск одной операцией. Разъехавшаяся запись — ровно тот сценарий,
 * который раньше давал двойную выдачу.
 *
 * @returns {number} сколько звёзд выдано за этот вызов
 */
function grantObservatoryStarsDue() {
    const due = typeof getObservatoryStarsDue === 'function' ? getObservatoryStarsDue() : 0;
    if (due <= 0) return 0;
    for (let i = 0; i < due; i++) addObservatoryStar();
    saveObservatoryNow();
    if (typeof saveProgression === 'function') saveProgression();
    return due;
}

// =============================================================================
// ГРАФ СВЯЗЕЙ
// =============================================================================

function hasObservatoryLine(a, b) {
    return observatoryLines.some(l =>
        (l.startId === a && l.endId === b) || (l.startId === b && l.endId === a));
}

function removeObservatoryLine(a, b) {
    const before = observatoryLines.length;
    observatoryLines = observatoryLines.filter(l =>
        !((l.startId === a && l.endId === b) || (l.startId === b && l.endId === a)));
    return observatoryLines.length !== before;
}

/** Единственное ограничение холста: длина связи ≤ getMaxEdgeLength(). */
function isObservatoryEdgeLengthValid(a, b) {
    const sa = getObservatoryStarById(a);
    const sb = getObservatoryStarById(b);
    if (!sa || !sb) return false;
    return Math.hypot(sa.x - sb.x, sa.y - sb.y) <= getMaxEdgeLength() + 1e-6;
}

/** Связи звезды, растянутые дальше радиуса, — «обречённые»: рвутся на отпускании. */
function getObservatoryDoomedLines() {
    if (!observatoryDragStar) return [];
    const maxEdge = getMaxEdgeLength();
    const out = [];
    for (const l of observatoryLines) {
        if (l.startId !== observatoryDragStar.id && l.endId !== observatoryDragStar.id) continue;
        const a = getObservatoryStarById(l.startId);
        const b = getObservatoryStarById(l.endId);
        if (!a || !b) continue;
        if (Math.hypot(a.x - b.x, a.y - b.y) > maxEdge + 1e-6) out.push(l);
    }
    return out;
}

// =============================================================================
// ИМЕНА СОЗВЕЗДИЙ (U-12)
// =============================================================================
//
// Созвездие холста — связная компонента графа связей из двух и более звёзд.
// Коммита здесь нет: компоненты пересчитываются по observatoryLines, и имя
// живёт ровно столько, сколько живёт компонента. Одинокая звезда — не созвездие.
//
// Пересчёт делается ПРИ ИЗМЕНЕНИИ ГРАФА (связь добавили/убрали, звезду отпустили,
// холст загрузили), а не в draw(): на сотне звёзд покадровый обход — лишняя работа.
// Центр подписи при этом всё равно едет за звёздами — он считается на отрисовке.

/** Связные компоненты из ≥2 звёзд; каждая — отсортированный массив id. */
function getObservatoryComponents() {
    const adj = new Map();
    for (const l of observatoryLines) {
        if (!adj.has(l.startId)) adj.set(l.startId, []);
        if (!adj.has(l.endId)) adj.set(l.endId, []);
        adj.get(l.startId).push(l.endId);
        adj.get(l.endId).push(l.startId);
    }

    const seen = new Set();
    const out = [];
    for (const startId of adj.keys()) {
        if (seen.has(startId)) continue;
        seen.add(startId);
        const stack = [startId];
        const group = [];
        while (stack.length > 0) {
            const id = stack.pop();
            group.push(id);
            for (const next of adj.get(id) || []) {
                if (seen.has(next)) continue;
                seen.add(next);
                stack.push(next);
            }
        }
        if (group.length >= 2) out.push(group.sort((a, b) => a - b));
    }
    return out;
}

/**
 * Свободное имя из пула fallback-имён. Пул кончился — берём случайное с
 * повтором (решение заказчика, развилка 4а): уникальность имён на холсте
 * ничего не значит, а sentinel «Фигура» посреди своего неба выглядит поломкой.
 */
function pickObservatoryNameId(usedIds) {
    const id = pickFallbackName(usedIds);
    if (id !== SHAPE_UNRECOGNIZED) return id;
    return FALLBACK_NAME_IDS[Math.floor(Math.random() * FALLBACK_NAME_IDS.length)];
}

function observatoryStarSetKey(ids) {
    return ids.join(',');
}

/**
 * Сверка реестра имён с фактическими компонентами. Одно правило на все события:
 *
 *   - состав компоненты не изменился → запись сохраняется целиком (имя + смещение);
 *   - состав изменился (слияние или распад) → случайное имя пропадает, а СВОЁ имя
 *     претендует на компоненту с наибольшим пересечением; при споре двух своих
 *     выигрывает то, чья прежняя компонента была больше (развилки 1а и 2а);
 *   - компонента без имени получает случайное.
 *
 * Она же восстанавливает привязку после загрузки — по тому же пересечению.
 */
function syncObservatoryNames() {
    const components = getObservatoryComponents();
    const next = new Array(components.length).fill(null);

    const byKey = new Map();
    components.forEach((ids, i) => byKey.set(observatoryStarSetKey(ids), i));

    const leftovers = [];
    for (const entry of observatoryNames) {
        const i = byKey.get(observatoryStarSetKey(entry.stars));
        if (i !== undefined && next[i] === null) {
            next[i] = entry;
        } else {
            leftovers.push(entry);
        }
    }

    // Бо́льшая прежняя компонента выбирает первой — так «своё имя достаётся
    // куску, где больше звёзд» работает и при слиянии, и при распаде
    const claims = leftovers
        .filter(e => e.custom)
        .sort((a, b) => b.stars.length - a.stars.length);

    for (const entry of claims) {
        const own = new Set(entry.stars);
        let best = -1;
        let bestOverlap = 0;
        for (let i = 0; i < components.length; i++) {
            if (next[i] !== null) continue;
            let overlap = 0;
            for (const id of components[i]) {
                if (own.has(id)) overlap++;
            }
            if (overlap === 0) continue;
            // Равное пересечение — за бо́льшим куском
            if (overlap > bestOverlap ||
                (overlap === bestOverlap && components[i].length > components[best].length)) {
                bestOverlap = overlap;
                best = i;
            }
        }
        if (best >= 0) {
            next[best] = {
                stars: components[best],
                nameId: entry.nameId,
                custom: entry.custom,
                dx: entry.dx,
                dy: entry.dy
            };
        }
    }

    const used = [];
    for (const entry of next) {
        if (entry && entry.nameId) used.push(entry.nameId);
    }
    for (let i = 0; i < components.length; i++) {
        if (next[i] !== null) {
            next[i].stars = components[i];
            continue;
        }
        const nameId = pickObservatoryNameId(used);
        used.push(nameId);
        next[i] = { stars: components[i], nameId, custom: null, dx: 0, dy: 0 };
    }

    observatoryNames = next;
}

/** Имя на экран: своё не переводится, случайное достаётся из словаря. */
function getObservatoryLabelText(entry) {
    if (!entry) return '';
    if (entry.custom) return entry.custom;
    if (typeof shapeLabel === 'function') return shapeLabel(entry.nameId || '');
    return entry.nameId || '';
}

/**
 * Геометрия подписи: центр компоненты, её радиус, зажатое смещение и итоговая
 * точка. Смещение зажимается ЗДЕСЬ, а не при записи, — тогда подпись сама
 * подтягивается, когда игрок стягивает созвездие в точку.
 */
function getObservatoryLabelGeometry(entry) {
    if (!entry || !Array.isArray(entry.stars)) return null;

    let sumX = 0;
    let sumY = 0;
    let count = 0;
    for (const id of entry.stars) {
        const s = getObservatoryStarById(id);
        if (!s) continue;
        sumX += s.x;
        sumY += s.y;
        count++;
    }
    if (count === 0) return null;

    const cx = sumX / count;
    const cy = sumY / count;

    let radius = 0;
    for (const id of entry.stars) {
        const s = getObservatoryStarById(id);
        if (!s) continue;
        radius = Math.max(radius, Math.hypot(s.x - cx, s.y - cy));
    }
    const limit = Math.max(radius, OBSERVATORY_LABEL_RADIUS_MIN);

    let dx = Number(entry.dx) || 0;
    let dy = Number(entry.dy) || 0;
    const dist = Math.hypot(dx, dy);
    if (dist > limit && dist > 1e-9) {
        dx *= limit / dist;
        dy *= limit / dist;
    }

    return { cx, cy, limit, dx, dy, x: cx + dx, y: cy + dy };
}

/** Цвет подписи — средний цвет звёзд компоненты, как у связей. */
function observatoryLabelRgb(entry) {
    let sum = 0;
    let count = 0;
    for (const id of entry.stars) {
        const s = getObservatoryStarById(id);
        if (!s) continue;
        sum += s.colorValue;
        count++;
    }
    return colorValueToRgb(count > 0 ? sum / count : 0);
}

/**
 * Подпись под пальцем. Хит-бокс — текстовый прямоугольник с запасом, а не радиус:
 * подпись лежит у центра созвездия, то есть ровно там, где на плотном холсте
 * стоят звёзды (риск №1 задачи). На дальнем зуме подписей нет — и попадать не во что.
 */
function getObservatoryLabelAt(fieldX, fieldY) {
    const zoomAlpha = typeof getLabelZoomAlphaFactor === 'function'
        ? getLabelZoomAlphaFactor() : 1;
    if (zoomAlpha <= 0) return null;

    const labelSize = COLLECTED_ATLAS_LABEL_SIZE / zoomLevel;
    const pad = OBSERVATORY_LABEL_HIT_PAD / zoomLevel;

    push();
    textSize(labelSize);
    let best = null;
    let bestDist = Infinity;
    for (const entry of observatoryNames) {
        const g = getObservatoryLabelGeometry(entry);
        if (!g) continue;
        const halfW = textWidth(getObservatoryLabelText(entry)) / 2 + pad;
        const halfH = labelSize / 2 + pad;
        if (Math.abs(fieldX - g.x) > halfW || Math.abs(fieldY - g.y) > halfH) continue;
        const d = Math.hypot(fieldX - g.x, fieldY - g.y);
        if (d < bestDist) {
            bestDist = d;
            best = entry;
        }
    }
    pop();
    return best;
}

/** U-04 на холсте: тем же промптом, теми же правилами перевода. */
function openObservatoryRenamePrompt(entry) {
    if (!entry) return false;
    const current = getObservatoryLabelText(entry);
    // Промпт переводится, введённое игроком имя — нет (решение исполнителя L-01)
    const result = prompt(t('observatory.renamePrompt'), current);
    if (result === null || result.trim() === '') return false;
    entry.custom = result.trim();
    saveObservatoryNow();
    return true;
}

/** Сдвинуть подпись в мировые координаты (x, y); возвращает зажатое смещение. */
function setObservatoryLabelPosition(entry, x, y) {
    const g = getObservatoryLabelGeometry(entry);
    if (!g) return null;
    let dx = x - g.cx;
    let dy = y - g.cy;
    const dist = Math.hypot(dx, dy);
    if (dist > g.limit && dist > 1e-9) {
        dx *= g.limit / dist;
        dy *= g.limit / dist;
    }
    entry.dx = dx;
    entry.dy = dy;
    return { dx, dy, limit: g.limit };
}

// =============================================================================
// РЕЖИМ ХОЛСТА
// =============================================================================

function getObservatoryMode() {
    return observatoryMode;
}

function setObservatoryMode(mode) {
    if (mode !== 'connect' && mode !== 'move') return;
    if (observatoryMode === mode) return;
    observatoryMode = mode;
    resetObservatoryDragState();
    saveObservatoryNow(); // переключение режима пишем безусловно
    if (typeof updateObservatoryUI === 'function') updateObservatoryUI();
}

// =============================================================================
// ВВОД
// =============================================================================

let observatoryDragStar = null;      // режим «перемещать»: тащим эту звезду
let observatoryConnectAnchor = null; // режим «соединять»: якорь протяжки
let observatoryPressStar = null;     // звезда под пальцем на нажатии (кандидат в тап)
let observatoryDragLabel = null;     // U-12: подпись под пальцем (тап → переименование)
let observatoryLabelGrabDx = 0;      // чтобы подпись не прыгала центром под палец
let observatoryLabelGrabDy = 0;
let observatoryPressScreenX = 0;
let observatoryPressScreenY = 0;
let observatoryPressMs = 0;
let observatoryPressMovedOut = false;

function resetObservatoryDragState() {
    observatoryDragStar = null;
    observatoryConnectAnchor = null;
    observatoryPressStar = null;
    observatoryDragLabel = null;
    observatoryPressMovedOut = false;
}

function getObservatoryStarAt(fieldX, fieldY) {
    const hitRadius = STAR_SIZE * STAR_HIT_RADIUS_MULT;
    let best = null;
    let bestD = hitRadius;
    for (const s of observatoryStars) {
        const d = Math.hypot(fieldX - s.x, fieldY - s.y);
        if (d < bestD) {
            bestD = d;
            best = s;
        }
    }
    return best;
}

/** Следующий цвет по кругу из STAR_COLOR_TIERS (красный→…→голубой→красный). */
function cycleObservatoryStarColor(star) {
    if (!star) return;
    const values = STAR_COLOR_VALUES;
    let index = values.indexOf(normalizeStarColorValue(star.colorValue));
    if (index < 0) index = values.indexOf(0);
    star.colorValue = values[(index + 1) % values.length];
    scheduleObservatorySave();
}

function observatoryMousePressed() {
    const fx = mouseX / zoomLevel + camX;
    const fy = mouseY / zoomLevel + camY;
    const star = getObservatoryStarAt(fx, fy);

    observatoryPressStar = star;
    observatoryPressScreenX = mouseX;
    observatoryPressScreenY = mouseY;
    observatoryPressMs = millis();
    observatoryPressMovedOut = false;
    observatoryDragLabel = null;

    // U-12: подпись перехватывает нажатие только в режиме «двигать» и только если под пальцем
    // нет звезды вплотную. Иначе подпись, накрывшая звезду, отнимала бы у неё
    // перекраску — а красят здесь куда чаще, чем переименовывают.
    if (observatoryMode === 'move' &&
        !(star && Math.hypot(star.x - fx, star.y - fy) <= OBSERVATORY_LABEL_STAR_PRIORITY)) {
        const label = getObservatoryLabelAt(fx, fy);
        if (label) {
            const g = getObservatoryLabelGeometry(label);
            observatoryDragLabel = label;
            observatoryLabelGrabDx = g ? fx - g.x : 0;
            observatoryLabelGrabDy = g ? fy - g.y : 0;
            return; // ни панорамы, ни перетаскивания звезды
        }
    }

    if (!star) {
        isPanning = true;
        panStartMouseX = mouseX;
        panStartMouseY = mouseY;
        panStartCamX = camX;
        panStartCamY = camY;
        return;
    }

    if (observatoryMode === 'move') {
        observatoryDragStar = star;
    } else {
        observatoryConnectAnchor = star;
    }
}

function observatoryMouseDragged() {
    if (isPanning) {
        camX = panStartCamX - (mouseX - panStartMouseX) / zoomLevel;
        camY = panStartCamY - (mouseY - panStartMouseY) / zoomLevel;
        clampCamera();
        return;
    }

    if (Math.hypot(mouseX - observatoryPressScreenX, mouseY - observatoryPressScreenY)
        > OBSERVATORY_TAP_MAX_PX) {
        observatoryPressMovedOut = true;
    }

    const fx = mouseX / zoomLevel + camX;
    const fy = mouseY / zoomLevel + camY;

    // U-12: подпись ходит в пределах радиуса своего созвездия
    if (observatoryDragLabel) {
        setObservatoryLabelPosition(observatoryDragLabel,
            fx - observatoryLabelGrabDx, fy - observatoryLabelGrabDy);
        return;
    }

    if (observatoryMode === 'move') {
        if (!observatoryDragStar) return;
        // Звезда следует за пальцем; связи тянутся сами, обречённые подсвечиваются
        observatoryDragStar.x = constrain(fx, 0, FIELD_WIDTH);
        observatoryDragStar.y = constrain(fy, 0, FIELD_HEIGHT);
        return;
    }

    // Режим «соединять»: тот же жест, что на поле, — якорь переезжает по звёздам
    if (!observatoryConnectAnchor) return;
    const star = getObservatoryStarAt(fx, fy);
    if (!star || star.id === observatoryConnectAnchor.id) return;

    const a = observatoryConnectAnchor.id;
    const b = star.id;
    if (hasObservatoryLine(a, b)) {
        // Протяжка по существующей связи её убирает
        removeObservatoryLine(a, b);
        syncObservatoryNames();
        scheduleObservatorySave();
    } else if (isObservatoryEdgeLengthValid(a, b)) {
        observatoryLines.push({ startId: a, endId: b });
        if (typeof playEdgeSnap === 'function') playEdgeSnap(2);
        syncObservatoryNames();
        scheduleObservatorySave();
    }
    observatoryConnectAnchor = star;
}

function observatoryMouseReleased() {
    if (isPanning) {
        isPanning = false;
        resetObservatoryDragState();
        return;
    }

    const heldMs = millis() - observatoryPressMs;
    const isTap = !observatoryPressMovedOut && heldMs <= OBSERVATORY_TAP_MAX_MS;

    // U-12: тап по подписи переименовывает, протяжка её просто оставляет на месте
    if (observatoryDragLabel) {
        const label = observatoryDragLabel;
        resetObservatoryDragState();
        if (isTap) openObservatoryRenamePrompt(label);
        else scheduleObservatorySave();
        return;
    }

    if (observatoryMode === 'move') {
        if (isTap && observatoryPressStar) {
            // Тап красит звезду — только в «перемещать»; в «соединять» тап молчит
            cycleObservatoryStarColor(observatoryPressStar);
        } else if (observatoryDragStar) {
            // Обречённые связи рвутся именно здесь: пока палец держит, ничего
            // не потеряно — вернул звезду в радиус, связь уцелела
            const doomed = getObservatoryDoomedLines();
            for (const l of doomed) removeObservatoryLine(l.startId, l.endId);
            if (doomed.length > 0) syncObservatoryNames();
            scheduleObservatorySave();
        }
    }

    resetObservatoryDragState();
}

// =============================================================================
// ОТРИСОВКА
// =============================================================================

function observatoryLineRgb(a, b) {
    return colorValueToRgb((a.colorValue + b.colorValue) / 2);
}

function drawObservatoryBackgroundStars() {
    const viewW = width / zoomLevel;
    const viewH = height / zoomLevel;
    noStroke();
    for (const s of observatoryBackgroundStars) {
        if (s.x < camX - 10 || s.x > camX + viewW + 10 ||
            s.y < camY - 10 || s.y > camY + viewH + 10) continue;
        // K-03: пыль неподвижна и здесь — у двух небес игры одни правила.
        fill(255, 255, 255, s.alpha);
        circle(s.x, s.y, Math.max(s.size, BG_STAR_MIN_SCREEN_DIAM / zoomLevel));
    }
}

function drawObservatoryLines() {
    const doomed = new Set(getObservatoryDoomedLines());
    const gap = getLineStarGapWorld();

    for (const l of observatoryLines) {
        const a = getObservatoryStarById(l.startId);
        const b = getObservatoryStarById(l.endId);
        if (!a || !b) continue;
        const trimmed = trimSegmentEndsWorld(a.x, a.y, b.x, b.y, gap, gap);
        if (!trimmed) continue;

        if (doomed.has(l)) {
            // Обречённая связь: пунктир сургучом, исчезнет на отпускании
            // (K-01: системного красного в палитре книги нет).
            stroke(WAX_RGB[0], WAX_RGB[1], WAX_RGB[2], 210);
            strokeWeight(2 / zoomLevel);
            drawingContext.setLineDash([8 / zoomLevel, 6 / zoomLevel]);
            line(trimmed.ax, trimmed.ay, trimmed.bx, trimmed.by);
            drawingContext.setLineDash([]);
        } else {
            const rgb = observatoryLineRgb(a, b);
            stroke(rgb[0], rgb[1], rgb[2], 210);
            strokeWeight(2 / zoomLevel);
            line(trimmed.ax, trimmed.ay, trimmed.bx, trimmed.by);
        }
    }
}

function drawObservatoryStars() {
    const viewW = width / zoomLevel;
    const viewH = height / zoomLevel;
    const baseDiam = Math.max(STAR_SIZE, STAR_SIZE / zoomLevel * 0.5);
    noStroke();

    for (const s of observatoryStars) {
        if (s.x < camX - 60 || s.x > camX + viewW + 60 ||
            s.y < camY - 60 || s.y > camY + viewH + 60) continue;

        const rgb = colorValueToRgb(s.colorValue);
        const isHeld = observatoryDragStar && observatoryDragStar.id === s.id;
        const scale = isHeld ? 1.25 : 1;

        fill(rgb[0], rgb[1], rgb[2], 46);
        drawSparkleShape(s.x, s.y, baseDiam * 2.1 * scale, 1);
        fill(rgb[0], rgb[1], rgb[2], 255);
        drawSparkleShape(s.x, s.y, baseDiam * scale, 1);
    }
}

/** Резиновая линия от якоря к курсору — как при рисовании на поле. */
function drawObservatoryDraftLine() {
    if (observatoryMode !== 'connect' || !observatoryConnectAnchor) return;
    const fx = mouseX / zoomLevel + camX;
    const fy = mouseY / zoomLevel + camY;
    const rgb = colorValueToRgb(observatoryConnectAnchor.colorValue);

    let ex = fx;
    let ey = fy;
    const dx = ex - observatoryConnectAnchor.x;
    const dy = ey - observatoryConnectAnchor.y;
    const len = Math.hypot(dx, dy);
    const maxLen = getMaxEdgeLength();
    if (len > maxLen && len > 1e-9) {
        ex = observatoryConnectAnchor.x + dx * (maxLen / len);
        ey = observatoryConnectAnchor.y + dy * (maxLen / len);
    }

    stroke(rgb[0], rgb[1], rgb[2], 180);
    strokeWeight(2 / zoomLevel);
    const trimmed = trimSegmentEndsWorld(
        observatoryConnectAnchor.x, observatoryConnectAnchor.y, ex, ey,
        getLineStarGapWorld(), 0
    );
    if (trimmed) line(trimmed.ax, trimmed.ay, trimmed.bx, trimmed.by);
}

/**
 * U-12: подписи созвездий. Центр берётся на отрисовке, поэтому подпись едет
 * за звёздами прямо во время перетаскивания, сохраняя своё смещение.
 * Гаснут на дальнем зуме вместе с полевыми (V-11).
 */
function drawObservatoryLabels() {
    const zoomAlpha = typeof getLabelZoomAlphaFactor === 'function'
        ? getLabelZoomAlphaFactor() : 1;
    if (zoomAlpha <= 0) return;

    push();
    noStroke();
    textAlign(CENTER, CENTER);
    textSize(COLLECTED_ATLAS_LABEL_SIZE / zoomLevel);
    for (const entry of observatoryNames) {
        const g = getObservatoryLabelGeometry(entry);
        if (!g) continue;
        const rgb = observatoryLabelRgb(entry);
        fill(rgb[0], rgb[1], rgb[2], 255 * zoomAlpha);
        text(getObservatoryLabelText(entry), g.x, g.y);
    }
    pop();
}

function drawObservatoryMode() {
    push();
    scale(zoomLevel);
    translate(-camX, -camY);

    drawObservatoryBackgroundStars();
    drawObservatoryLines();
    drawObservatoryDraftLine();
    drawObservatoryStars();
    drawObservatoryLabels();

    pop();
}

// =============================================================================
// ИНИЦИАЛИЗАЦИЯ
// =============================================================================

function initObservatory() {
    generateObservatoryBackgroundStars();
    loadObservatory();
    // Догон: ✦ могли накопиться в сессиях, когда обсерватории ещё не было
    grantObservatoryStarsDue();
    // U-12: битый/пустой сейв тоже обязан прийти к согласованному реестру имён
    syncObservatoryNames();

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') saveObservatoryNow();
        });
    }
}

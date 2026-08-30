// recognition.js — Shape recognition (каталог-29, топологический режим)
//
// R-02: геометрический (legacy) слой выведен целиком. До вывода файл держал два
// распознавателя — геометрический с пер-фигурными валидаторами и гибридным
// ранжированием и топологический — при том, что живым был только второй:
// `RECOGNITION_MODE = 'topology'` уводил `recognizeShapeDetailed` в топоветку
// первой же строкой, и legacy-ядро не исполнялось ни разу. Ушли 37 функций,
// пер-фигурные пороги и сам переключатель режима.
//
// Осталось три вещи:
//   1. Геометрические хелперы — их держит НЕ распознаватель, а customTypes.js
//      (пользовательские виды): angleBetweenPoints, getOrderedStarsForClosedShape,
//      getOrderedStarsForChain, getEdgeLengthsClosed, getInternalAngles,
//      getChainAngles, meanAbsDiff. Выглядят как остаток legacy — не трогать.
//   2. Топологическое распознавание — точка входа для drawing.js и testApi.js.
//   3. Выбор fallback-имени.

// =============================================================================
// ГЕОМЕТРИЧЕСКИЕ ХЕЛПЕРЫ (потребитель — customTypes.js)
// =============================================================================

function angleBetweenPoints(a, b, c) {
    const abx = a.x - b.x;
    const aby = a.y - b.y;
    const cbx = c.x - b.x;
    const cby = c.y - b.y;
    const dot = abx * cbx + aby * cby;
    const cross = abx * cby - aby * cbx;
    let angle = Math.atan2(Math.abs(cross), dot);
    return degrees(angle);
}

function getOrderedStarsForClosedShape(lines, starIds) {
    const adj = {};
    for (let id of starIds) adj[id] = [];
    for (let seg of lines) {
        adj[seg.startId].push(seg.endId);
        adj[seg.endId].push(seg.startId);
    }

    const ordered = [];
    const startId = [...starIds][0];
    ordered.push(startId);
    let prev = null;
    let current = startId;

    for (let i = 1; i < starIds.size; i++) {
        const neighbors = adj[current];
        let next = null;
        for (let n of neighbors) {
            if (n !== prev) {
                next = n;
                break;
            }
        }
        prev = current;
        current = next;
        ordered.push(current);
    }

    return ordered;
}

function getOrderedStarsForChain(lines, starIds) {
    const adj = {};
    for (let id of starIds) adj[id] = [];
    for (let seg of lines) {
        adj[seg.startId].push(seg.endId);
        adj[seg.endId].push(seg.startId);
    }

    // Find chain endpoint (degree 1)
    let startId = null;
    for (let id of starIds) {
        if (adj[id].length === 1) {
            startId = id;
            break;
        }
    }
    if (startId === null) startId = [...starIds][0];

    const ordered = [startId];
    let prev = null;
    let current = startId;

    for (let i = 1; i < starIds.size; i++) {
        const neighbors = adj[current];
        let next = null;
        for (let n of neighbors) {
            if (n !== prev) {
                next = n;
                break;
            }
        }
        prev = current;
        current = next;
        ordered.push(current);
    }

    return ordered;
}

function getEdgeLengthsClosed(orderedStarIds) {
    const lengths = [];
    const n = orderedStarIds.length;
    for (let i = 0; i < n; i++) {
        const a = getStarById(orderedStarIds[i]);
        const b = getStarById(orderedStarIds[(i + 1) % n]);
        if (a && b) {
            lengths.push(dist(a.x, a.y, b.x, b.y));
        }
    }
    return lengths;
}

function getInternalAngles(orderedStarIds) {
    const n = orderedStarIds.length;
    const angles = [];
    for (let i = 0; i < n; i++) {
        const prev = getStarById(orderedStarIds[(i - 1 + n) % n]);
        const curr = getStarById(orderedStarIds[i]);
        const next = getStarById(orderedStarIds[(i + 1) % n]);
        if (prev && curr && next) {
            angles.push(angleBetweenPoints(prev, curr, next));
        }
    }
    return angles;
}

function getChainAngles(orderedStarIds) {
    const angles = [];
    for (let i = 1; i < orderedStarIds.length - 1; i++) {
        const prev = getStarById(orderedStarIds[i - 1]);
        const curr = getStarById(orderedStarIds[i]);
        const next = getStarById(orderedStarIds[i + 1]);
        if (prev && curr && next) {
            angles.push(angleBetweenPoints(prev, curr, next));
        }
    }
    return angles;
}

function meanAbsDiff(a, b) {
    if (!a || !b || a.length === 0 || b.length === 0) return 1;
    const n = Math.min(a.length, b.length);
    let sum = 0;
    for (let i = 0; i < n; i++) {
        sum += Math.abs(a[i] - b[i]);
    }
    sum += Math.abs(a.length - b.length);
    return sum / Math.max(1, Math.max(a.length, b.length));
}

// =============================================================================
// РАСПОЗНАВАНИЕ (каталог-29): изоморфизм графа + ограничения §4
// =============================================================================

function makeFallbackRecognition(legacyLabel) {
    return {
        label: SHAPE_UNRECOGNIZED,
        confidence: 0,
        secondBest: null,
        delta: 0,
        state: 'fallback',
        candidates: [],
        legacyLabel: legacyLabel || SHAPE_UNRECOGNIZED,
        details: null
    };
}

/**
 * Топологическое распознавание.
 * Бинарно: граф изоморфен фигуре каталога-29 И проходит ограничения §4 → имя,
 * иначе fallback. Принимает от 2 звёзд (Зубочистка). 6+ звёзд → fallback
 * (каталог до 5).
 *
 * ⚠ Поле `legacyLabel` в результате осталось после вывода legacy-слоя (R-02):
 * распознаватель один, и `legacyLabel` теперь всегда равен `label` либо
 * несёт имя выключенной фигуры. Формат не менялся — его читают
 * `drawing.js` и `testApi.js`.
 */
function recognizeShapeTopologyDetailed(lines, starIds) {
    const ids = starIds ? [...starIds] : [];
    if (ids.length < 2 || ids.length > 5) return makeFallbackRecognition(SHAPE_UNRECOGNIZED);
    if (typeof topologyRecognizeName !== 'function') return makeFallbackRecognition(SHAPE_UNRECOGNIZED);

    const name = topologyRecognizeName(ids, lines, (id) => getStarById(id));
    if (!name) return makeFallbackRecognition(SHAPE_UNRECOGNIZED);

    // Гейт активности: наружу отдаём только встроенные включённые фигуры.
    // B-04: 24 из 29 фигур каталога-29 включены (страницы атласа 0–3) — 5 плотных
    // графов в резерве (DEMO_ACTIVE_BUILTIN_SHAPES) гасятся здесь и уходят
    // в fallback-имя. Видимость страниц атласа и запрет дублей доигрываются
    // в commit-пути (clampShapeToAtlasVisibility и т.п.) — фигура с закрытой
    // страницы → «Фигура».
    const enabled = typeof isBuiltinShapeName === 'function' && isBuiltinShapeName(name) &&
        typeof isBuiltinShapeEnabled === 'function' && isBuiltinShapeEnabled(name);
    if (!enabled) return makeFallbackRecognition(name);

    return {
        label: name,
        confidence: 1,
        secondBest: null,
        delta: 1,
        state: 'accept',
        candidates: [{ label: name, score: 1 }],
        legacyLabel: name,
        details: null
    };
}

/**
 * Точка входа распознавания. R-02: распознаватель один, ветвления по
 * RECOGNITION_MODE больше нет. Обёртка оставлена — её имя зовут
 * `drawing.js` и `testApi.js`.
 */
function recognizeShapeDetailed(lines, starIds) {
    return recognizeShapeTopologyDetailed(lines, starIds);
}

// =============================================================================
// FALLBACK NAME PICKER
// =============================================================================

/**
 * L-01: возвращает ID fallback-имени (`fb12`), а не само слово — на экран оно
 * попадёт через shapeLabel(). Индекс один на все локали.
 * @param {string[]} usedNames - текущие constellation.name на поле (тоже ID)
 * @returns {string} свободный ID из пула, либо SHAPE_UNRECOGNIZED, если пул исчерпан
 */
function pickFallbackName(usedNames) {
    const usedSet = new Set(usedNames);
    const available = FALLBACK_NAME_IDS.filter(id => !usedSet.has(id));
    if (available.length === 0) return SHAPE_UNRECOGNIZED;
    return available[Math.floor(Math.random() * available.length)];
}

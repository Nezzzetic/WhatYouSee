// recognition.js — Shape recognition (каталог-29, топологический режим)
//
// R-02: геометрический (legacy) слой выведен целиком. До вывода файл держал два
// распознавателя — геометрический с пер-фигурными валидаторами и гибридным
// ранжированием и топологический — при том, что живым был только второй:
// `RECOGNITION_MODE = 'topology'` уводил `recognizeShapeDetailed` в топоветку
// первой же строкой, и legacy-ядро не исполнялось ни разу. Ушли 37 функций,
// пер-фигурные пороги и сам переключатель режима.
//
// Осталось две вещи:
//   1. Топологическое распознавание — точка входа для drawing.js и testApi.js.
//   2. Выбор fallback-имени.
//
// R-03: геометрические хелперы (angleBetweenPoints, getOrderedStarsFor*,
// getEdgeLengthsClosed, getInternalAngles, getChainAngles, meanAbsDiff) ушли
// вместе с единственным потребителем — пользовательскими видами (customTypes.js).

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

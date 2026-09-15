// skyEffects.js — сцены неба во времени: волна коммита V-12, корректорская
// пометка K-04, финал ночи V-13 — состояние, старт/отмена и чистые расчёты (R-05).

// =============================================================================
// V-12 — ВОЛНА СОЗДАНИЯ СОЗВЕЗДИЯ
// =============================================================================
// Слот один: одновременно анимируется только последнее закоммиченное созвездие.
// Состояние живёт ВНЕ сейва (как atlasCollectedStarColors): после перезагрузки
// волна не проигрывается заново, версия сейва не поднимается.

let commitWave = null;  // { constellation, startMs, stepMs, edgeCount, starArrivalMs: Map }

/**
 * Шаг между стартами соседних рёбер. Длинное созвездие не растягивает волну —
 * шаг ужимается так, чтобы вся она уложилась в COMMIT_WAVE_TOTAL_MAX_MS.
 * Чистая функция: проверяется статикой без p5 и глобалов.
 */
function computeCommitWaveStep(edgeCount, edgeMs, stepMs, totalMaxMs) {
    if (edgeCount <= 1) return stepMs;
    const room = (totalMaxMs - edgeMs) / (edgeCount - 1);
    return Math.max(0, Math.min(stepMs, room));
}

/** Прогресс ребра с индексом i: 0 — ещё не начато, 1 — дочерчено. */
function computeCommitWaveEdgeProgress(elapsed, edgeIndex, stepMs, edgeMs) {
    if (edgeMs <= 0) return 1;
    const local = elapsed - edgeIndex * stepMs;
    if (local <= 0) return 0;
    if (local >= edgeMs) return 1;
    return local / edgeMs;
}

/** Вспышка звезды: 0 → 1 → 0 за flashMs от момента прихода волны. */
function computeCommitWaveFlash(elapsed, arrivalMs, flashMs) {
    if (flashMs <= 0) return 0;
    const local = elapsed - arrivalMs;
    if (local < 0 || local >= flashMs) return 0;
    return Math.sin((local / flashMs) * Math.PI);
}

/**
 * Общая длительность волны: последнее ребро дочерчено + хвост.
 * Хвост — максимум из вспышки последней звезды и проявления подписи, иначе
 * состояние гасло бы раньше, чем подпись доехала до полной яркости.
 */
function computeCommitWaveTotal(edgeCount, stepMs, edgeMs, tailMs) {
    if (edgeCount <= 0) return 0;
    return (edgeCount - 1) * stepMs + edgeMs + tailMs;
}

/**
 * Запускает волну по только что закоммиченному созвездию.
 * Порядок рёбер = порядок соединения игроком (currentLines пушится по ребру
 * за жест; харнесс отдаёт рёбра в порядке переданного списка).
 */
function startCommitWave(constellation) {
    if (!constellation || !Array.isArray(constellation.lines) || constellation.lines.length === 0) {
        commitWave = null;
        return;
    }
    const edgeCount = constellation.lines.length;
    const stepMs = computeCommitWaveStep(
        edgeCount, COMMIT_WAVE_EDGE_MS, COMMIT_WAVE_STEP_MS, COMMIT_WAVE_TOTAL_MAX_MS
    );

    // Звезда — конец нескольких рёбер вспыхивает один раз, по самому раннему приходу.
    const starArrivalMs = new Map();
    const arrive = (id, ms) => {
        const prev = starArrivalMs.get(id);
        if (prev === undefined || ms < prev) starArrivalMs.set(id, ms);
    };
    for (let i = 0; i < edgeCount; i++) {
        const seg = constellation.lines[i];
        if (!seg) continue;
        arrive(seg.startId, i * stepMs);
        arrive(seg.endId, i * stepMs + COMMIT_WAVE_EDGE_MS);
    }

    commitWave = {
        constellation,
        startMs: millis(),
        stepMs,
        edgeCount,
        starArrivalMs
    };
}

function cancelCommitWave() {
    commitWave = null;
}

/** Прошедшее время волны, или -1 если волны нет / она уже отыграла. */
function getCommitWaveElapsed() {
    if (!commitWave) return -1;
    const elapsed = millis() - commitWave.startMs;
    const tailMs = Math.max(COMMIT_WAVE_STAR_FLASH_MS, COMMIT_WAVE_LABEL_FADE_MS);
    const total = computeCommitWaveTotal(
        commitWave.edgeCount, commitWave.stepMs, COMMIT_WAVE_EDGE_MS, tailMs
    );
    if (elapsed < 0 || elapsed >= total) {
        commitWave = null;
        return -1;
    }
    return elapsed;
}

/** Полная длительность текущей волны: пометка K-04 ждёт, пока доедет имя. */
function getCommitWaveTotalMs() {
    if (!commitWave) return 0;
    const tailMs = Math.max(COMMIT_WAVE_STAR_FLASH_MS, COMMIT_WAVE_LABEL_FADE_MS);
    return computeCommitWaveTotal(
        commitWave.edgeCount, commitWave.stepMs, COMMIT_WAVE_EDGE_MS, tailMs
    );
}

/** Прогресс ребра волнового созвездия; для всех прочих созвездий — 1. */
function getCommitWaveEdgeProgress(constellation, edgeIndex) {
    if (!commitWave || commitWave.constellation !== constellation) return 1;
    const elapsed = getCommitWaveElapsed();
    if (elapsed < 0) return 1;
    return computeCommitWaveEdgeProgress(elapsed, edgeIndex, commitWave.stepMs, COMMIT_WAVE_EDGE_MS);
}

/** true, если волна ещё не дошла до звезды — locked-вид пока не применяем. */
function isCommitWavePending(starId) {
    if (!commitWave) return false;
    const arrival = commitWave.starArrivalMs.get(starId);
    if (arrival === undefined) return false;
    const elapsed = getCommitWaveElapsed();
    if (elapsed < 0) return false;
    return elapsed < arrival;
}

/** Сила вспышки звезды в момент прихода волны: 0..1. */
function getCommitWaveStarFlash(starId) {
    if (!commitWave) return 0;
    const arrival = commitWave.starArrivalMs.get(starId);
    if (arrival === undefined) return 0;
    const elapsed = getCommitWaveElapsed();
    if (elapsed < 0) return 0;
    return computeCommitWaveFlash(elapsed, arrival, COMMIT_WAVE_STAR_FLASH_MS);
}

/**
 * Проявление подписи атласного созвездия: отсчитывается от конца волны, чтобы
 * имя не выскакивало вместе с коммитом. Для всех прочих созвездий — 1.
 */
function getCommitWaveLabelAlpha(constellation) {
    if (!commitWave || commitWave.constellation !== constellation) return 1;
    const elapsed = getCommitWaveElapsed();
    if (elapsed < 0) return 1;
    const waveEnd = (commitWave.edgeCount - 1) * commitWave.stepMs + COMMIT_WAVE_EDGE_MS;
    if (COMMIT_WAVE_LABEL_FADE_MS <= 0) return elapsed >= waveEnd ? 1 : 0;
    return Math.max(0, Math.min(1, (elapsed - waveEnd) / COMMIT_WAVE_LABEL_FADE_MS));
}

// =============================================================================
// K-04 — КОРРЕКТОРСКАЯ ПОМЕТКА
// =============================================================================
// Единственный вход в отмену: постоянной кнопки на небе нет. Слот один — пометка
// всегда про последнее созвездие. Состояние живёт ВНЕ сейва (как волна V-12):
// после перезагрузки окна отмены нет, версия сейва не поднимается.
//
// Живость проверяется КАЖДЫМ КАДРОМ, а не событиями: пометка есть, пока её
// созвездие последнее и `constellations.length > undoFloor`. Поэтому мгновенный
// клейм шага 1 (S-01), забор награды и открытие страницы атласа гасят её сами —
// поднимать `undoFloor` и помнить про пометку не нужно.

let undoMark = null;  // { constellation, startMs }

/**
 * Ставит пометку на только что закоммиченное созвездие. Отсчёт начинается не
 * сразу: сперва волна V-12 дочерчивает фигуру и проявляет имя, и только под
 * готовым именем всплывает пометка.
 */
function startUndoMark(constellation) {
    if (!constellation) {
        undoMark = null;
        return;
    }
    undoMark = {
        constellation,
        startMs: millis() + (typeof getCommitWaveTotalMs === 'function' ? getCommitWaveTotalMs() : 0)
    };
}

function cancelUndoMark() {
    undoMark = null;
}

/** Откат возможен: есть что снимать выше пола необратимости. */
function canUndoLastConstellation() {
    return Array.isArray(constellations) && constellations.length > undoFloor;
}

/**
 * Пометка, если она сейчас имеет право быть: её созвездие ещё последнее,
 * откат ещё возможен и небу не мешает сцена финала. Протухшую снимает тут же.
 */
function getLiveUndoMark() {
    if (!undoMark) return null;
    const last = constellations[constellations.length - 1];
    if (last !== undoMark.constellation || !canUndoLastConstellation()) {
        undoMark = null;
        return null;
    }
    if (typeof isLevelFinaleActive === 'function' && isLevelFinaleActive()) return null;
    return undoMark;
}

/**
 * Прозрачность пометки: всплытие → покой → таяние. Отдельная чистая функция —
 * тайминги проверяются статикой, без p5 и глобалов.
 */
function computeUndoMarkAlpha(elapsed, inMs, holdMs, outMs) {
    if (elapsed < 0 || elapsed >= inMs + holdMs + outMs) return 0;
    if (elapsed < inMs) return inMs > 0 ? elapsed / inMs : 1;
    const held = elapsed - inMs;
    if (held < holdMs) return 1;
    return outMs > 0 ? 1 - (held - holdMs) / outMs : 0;
}

/**
 * Экранная геометрия пометки — одна на отрисовку и на попадание пальцем.
 * Разъехались бы они, и тап уезжал бы от того, что видно.
 *
 * U-19 (правка после проверки на устройстве): пометка стоящая рядом с подписью
 * фигуры читалась хуже, чем прежняя — заказчик попросил зафиксировать её в
 * левом нижнем углу экрана, вне мира (не идёт за фигурой при зуме и панораме).
 * Угол левый, а не правый, — там уже лента-закладка (K-05). Следующая правка
 * увеличила знак и зону касания вдвое и увела угол к самому краю экрана —
 * невидимая зона тройного тапа дев-панели (`#devToggleBtn`), которая раньше
 * делила этот угол, переехала в левый верхний по тому же фидбеку.
 */
function computeUndoMarkLayout() {
    const mark = getLiveUndoMark();
    if (!mark) return null;

    const elapsed = millis() - mark.startMs;
    if (elapsed < 0) return null;   // ещё идёт волна V-12
    const reduced = typeof prefersReducedMotion === 'function' && prefersReducedMotion();
    const inMs = reduced ? 0 : UNDO_MARK_IN_MS;
    const outMs = reduced ? 0 : UNDO_MARK_OUT_MS;
    const alpha = computeUndoMarkAlpha(elapsed, inMs, UNDO_MARK_HOLD_MS, outMs);
    if (alpha <= 0) {
        if (elapsed >= inMs + UNDO_MARK_HOLD_MS + outMs) undoMark = null;
        return null;
    }

    const w = UNDO_MARK_SIGN_PX;
    const h = UNDO_MARK_SIGN_PX;
    // P-02: тот же приём, что резервирует камеру над лентой (K-05) — меряет
    // настоящий инсет по ленте, а не читает --safe-bottom (кастомное
    // свойство с env() из JS не разворачивается).
    const bottomInset = typeof getBottomUIHeight === 'function' ? getBottomUIHeight() : 0;
    const rise = (1 - Math.min(1, inMs > 0 ? elapsed / inMs : 1)) * UNDO_MARK_RISE_PX;

    // U-19 (найдено на живом Redmi): канвас p5 (`height`) может быть выше, чем
    // реально видимая область мобильного браузера (`window.innerHeight`) —
    // канвас сразу подстроен под «полный» размер, а тулбар браузера ещё не
    // свернулся и физически перекрывает низ. Лента (DOM, `position: fixed`)
    // от этого не страдает — её позицию относительно видимой области считает
    // сам браузер; канвасной пометке то же ограничение нужно вручную, иначе
    // она рисуется ниже настоящего низа экрана и невидима, хотя с точки
    // зрения кода «на месте».
    const visibleH = (typeof window !== 'undefined' && window.innerHeight)
        ? Math.min(height, window.innerHeight)
        : height;

    const cx = UNDO_MARK_CORNER_LEFT_PX + w / 2;
    const cy = visibleH - bottomInset - UNDO_MARK_CORNER_BOTTOM_PX - h / 2 + rise;

    return {
        alpha, w, h,
        left: cx - w / 2,
        top: cy - h / 2,
        cx,
        cy
    };
}

/** Попал ли тап в пометку. Зона касания шире знака — как у ленты K-05. */
function hitUndoMark(screenX, screenY) {
    const m = computeUndoMarkLayout();
    if (!m) return false;
    const pad = UNDO_MARK_HIT_PAD_PX;
    return screenX >= m.left - pad && screenX <= m.left + m.w + pad
        && screenY >= m.top - pad && screenY <= m.top + m.h + pad;
}

// =============================================================================
// V-13 — ФИНАЛ НОЧИ: ОТЗУМ И ПОСЛЕДОВАТЕЛЬНОЕ РОЖДЕНИЕ СОЗВЕЗДИЙ
// =============================================================================
// Сцена из двух движений: небо гаснет и камера едет к обзору всего поля, а следом
// созвездия рождаются заново по одному, в порядке создания игроком. Слот один,
// состояние живёт ВНЕ сейва (как commitWave): после F5 сцена не проигрывается,
// версия сейва не поднимается.
//
// Единица анимации — созвездие целиком, фейдом: на min-зуме, куда приезжает
// камера, отдельные рёбра не читаются, и волна по рёбрам (V-12) там пропала бы
// зря, а 30 × 300 мс в потолок не влезают.

let levelFinale = null; // { startMs, camFrom, stepMs, count, totalMs, order, starBirthMs }

/** Сглаживание отзума: кривая книги (K-01) — камера трогается сразу и мягко
 *  встаёт, без рывка на старте и на остановке. Кривая в игре одна: та же
 *  `--ease` в CSS и тот же `easeBook` во всех сценах канваса. */
function computeFinaleEase(t) {
    return easeBook(t);
}

/** Занавес в начале сцены: 1 → 0 за hideMs. Дальше созвездий не видно вовсе. */
function computeFinaleHideAlpha(elapsed, hideMs) {
    if (hideMs <= 0) return 0;
    if (elapsed <= 0) return 1;
    if (elapsed >= hideMs) return 0;
    return 1 - elapsed / hideMs;
}

/**
 * Проявление созвездия с индексом i: 0 — ещё не родилось, 1 — на полной яркости.
 * elapsed отсчитывается от НАЧАЛА ВОЛНЫ, а не от начала сцены.
 */
function computeFinaleBirthProgress(elapsed, index, stepMs, fadeMs) {
    const local = elapsed - index * stepMs;
    if (fadeMs <= 0) return local >= 0 ? 1 : 0;
    if (local <= 0) return 0;
    if (local >= fadeMs) return 1;
    return local / fadeMs;
}

/**
 * Полная длительность сцены: дольше всех живёт та фаза, что кончается позже.
 * minMs — пол от затемнения и отзума (на пустом небе волны нет вовсе).
 */
function computeFinaleTotal(count, stepMs, fadeMs, delayMs, minMs) {
    const wave = count > 0 ? delayMs + (count - 1) * stepMs + fadeMs : 0;
    return Math.max(minMs, wave);
}

/**
 * Запускает финал ночи. Порядок рождения = порядок создания игроком:
 * `constellations` уже лежит в нём, сортировать нечего.
 */
function startLevelFinale() {
    const list = Array.isArray(constellations) ? constellations : [];
    const count = list.length;
    // Шаг ужимается под потолок той же чистой функцией, что у волны создания:
    // «уложить count событий длиной fadeMs в отведённое время» — задача общая.
    const stepMs = computeCommitWaveStep(
        count, LEVEL_FINALE_FADE_MS, LEVEL_FINALE_STEP_MS,
        LEVEL_FINALE_TOTAL_MAX_MS - LEVEL_FINALE_WAVE_DELAY_MS
    );

    const order = new Map();        // созвездие → его индекс (без indexOf на каждом кадре)
    const starBirthMs = new Map();  // звезда → момент рождения её созвездия
    for (let i = 0; i < count; i++) {
        const c = list[i];
        if (!c) continue;
        order.set(c, i);
        const birthMs = LEVEL_FINALE_WAVE_DELAY_MS + i * stepMs;
        for (const id of collectStarIdsFromLines(c.lines)) {
            const prev = starBirthMs.get(id);
            if (prev === undefined || birthMs < prev) starBirthMs.set(id, birthMs);
        }
    }

    levelFinale = {
        startMs: millis(),
        camFrom: { camX, camY, zoom: zoomLevel },
        stepMs,
        count,
        order,
        starBirthMs,
        totalMs: computeFinaleTotal(
            count, stepMs, LEVEL_FINALE_FADE_MS, LEVEL_FINALE_WAVE_DELAY_MS,
            Math.max(LEVEL_FINALE_ZOOM_MS, LEVEL_FINALE_HIDE_MS)
        )
    };
}

/** Снять сцену без доигрывания (смена неба, откат) — камеру не трогаем. */
function cancelLevelFinale() {
    levelFinale = null;
}

/**
 * Тап посреди сцены: доигрываем мгновенно. Альфы обязаны вернуться в 1 —
 * иначе тап на 150-й мс погасил бы небо навсегда; это даёт снятие слота.
 * Камера доезжает туда же, куда ехала.
 */
function finishLevelFinaleNow() {
    if (!levelFinale) return;
    levelFinale = null;
    if (typeof centerCamera === 'function') centerCamera();
}

/** Прошедшее время сцены, или -1 если её нет / она уже отыграла. */
function getLevelFinaleElapsed() {
    if (!levelFinale) return -1;
    const elapsed = millis() - levelFinale.startMs;
    if (elapsed < 0 || elapsed >= levelFinale.totalMs) {
        levelFinale = null;
        return -1;
    }
    return elapsed;
}

function isLevelFinaleActive() {
    return getLevelFinaleElapsed() >= 0;
}

/** Видимость созвездия в сцене: гаснет, потом рождается. Вне сцены — 1. */
function getFinaleConstellationAlpha(constellation) {
    const elapsed = getLevelFinaleElapsed();
    if (elapsed < 0) return 1;
    const index = levelFinale.order.get(constellation);
    if (index === undefined) return 1; // созвездия в сцене нет — не наше дело
    if (elapsed < LEVEL_FINALE_HIDE_MS) {
        return computeFinaleHideAlpha(elapsed, LEVEL_FINALE_HIDE_MS);
    }
    return computeFinaleBirthProgress(
        elapsed - LEVEL_FINALE_WAVE_DELAY_MS, index, levelFinale.stepMs, LEVEL_FINALE_FADE_MS
    );
}

/**
 * Видимость ЗВЕЗДЫ в сцене — та же кривая, что у её созвездия: занавес гасит
 * созвездие целиком, рождение возвращает его целиком (правка заказчика).
 *
 * Звезда вне созвездий (свободная, подавленная, погасшая) возвращает 1 на всех
 * фазах: она не часть сцены. Гасить её вместе со всеми нельзя — вернуть её
 * потом было бы нечем, и в конце занавеса она скакнула бы из нуля в единицу.
 *
 * `star.locked` при этом выставлен как обычно: игровая логика (хит-тесты,
 * распознавание, откат) сцену не ждёт ни кадра — тот же инвариант, что в V-12.
 */
function getFinaleStarAlpha(starId) {
    const elapsed = getLevelFinaleElapsed();
    if (elapsed < 0) return 1;
    const birthMs = levelFinale.starBirthMs.get(starId);
    if (birthMs === undefined) return 1;
    if (elapsed < LEVEL_FINALE_HIDE_MS) {
        return computeFinaleHideAlpha(elapsed, LEVEL_FINALE_HIDE_MS);
    }
    // birthMs уже содержит лид-ин волны, поэтому индекс здесь нулевой.
    return computeFinaleBirthProgress(elapsed - birthMs, 0, levelFinale.stepMs, LEVEL_FINALE_FADE_MS);
}

/** Вспышка звезды в момент рождения её созвездия: 0..1 (огибающая V-12). */
function getFinaleStarFlash(starId) {
    const elapsed = getLevelFinaleElapsed();
    if (elapsed < 0) return 0;
    const birthMs = levelFinale.starBirthMs.get(starId);
    if (birthMs === undefined) return 0;
    return computeCommitWaveFlash(elapsed, birthMs, LEVEL_FINALE_STAR_FLASH_MS);
}

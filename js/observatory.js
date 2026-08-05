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
/** Фоновая россыпь: своя, детерминированная по playerId (в сейв не пишется). */
let observatoryBackgroundStars = [];
/** 'connect' — соединять 🔗 (по умолчанию), 'move' — перемещать ✋. */
let observatoryMode = 'connect';

let observatoryNextStarId = 0;

const OBSERVATORY_SAVE_KEY = 'starsReborn_observatory_v01';
const OBSERVATORY_SAVE_DEBOUNCE_MS = 500;

/** Порог «тап или протяжка»: ниже обоих — тап. Настраивается на устройстве. */
const OBSERVATORY_TAP_MAX_PX = 8;
const OBSERVATORY_TAP_MAX_MS = 250;

/** Сколько раз пробуем положить новую звезду с min-distance, прежде чем класть куда легло. */
const OBSERVATORY_PLACE_ATTEMPTS = 60;

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
            mode: observatoryMode
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
    observatoryNextStarId = 0;
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

        if (state.mode === 'move' || state.mode === 'connect') observatoryMode = state.mode;
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
    observatoryNextStarId = 0;
    observatoryMode = 'connect';
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

/** Новая звезда приходит жёлтой (colorValue = 0) — цвет дальше задаёт игрок. */
function addObservatoryStar() {
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
let observatoryPressScreenX = 0;
let observatoryPressScreenY = 0;
let observatoryPressMs = 0;
let observatoryPressMovedOut = false;

function resetObservatoryDragState() {
    observatoryDragStar = null;
    observatoryConnectAnchor = null;
    observatoryPressStar = null;
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
        scheduleObservatorySave();
    } else if (isObservatoryEdgeLengthValid(a, b)) {
        observatoryLines.push({ startId: a, endId: b });
        if (typeof playEdgeSnap === 'function') playEdgeSnap(2);
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

    if (observatoryMode === 'move') {
        if (isTap && observatoryPressStar) {
            // Тап красит звезду — только в «перемещать»; в «соединять» тап молчит
            cycleObservatoryStarColor(observatoryPressStar);
        } else if (observatoryDragStar) {
            // Обречённые связи рвутся именно здесь: пока палец держит, ничего
            // не потеряно — вернул звезду в радиус, связь уцелела
            const doomed = getObservatoryDoomedLines();
            for (const l of doomed) removeObservatoryLine(l.startId, l.endId);
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
        const twinkle = 0.7 + 0.3 * Math.sin(frameCount * 0.02 + s.phase);
        fill(255, 255, 255, s.alpha * twinkle);
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
            // Обречённая связь: красный пунктир, исчезнет на отпускании
            stroke(255, 90, 90, 210);
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
        drawSparkleShape(s.x, s.y, baseDiam * 2.1 * scale, 1, 0);
        fill(rgb[0], rgb[1], rgb[2], 255);
        drawSparkleShape(s.x, s.y, baseDiam * scale, 1, 0);
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

function drawObservatoryMode() {
    push();
    scale(zoomLevel);
    translate(-camX, -camY);

    drawObservatoryBackgroundStars();
    drawObservatoryLines();
    drawObservatoryDraftLine();
    drawObservatoryStars();

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

    if (typeof document !== 'undefined') {
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'hidden') saveObservatoryNow();
        });
    }
}

// constellations.js — созвездия: правила рёбер, сборка и коммит, откат,
// память имён M-10, якорь подписи (R-05).

// =============================================================================
// ПОЛ ОТКАТА, ПАМЯТЬ ИМЁН (M-10), СОБРАННЫЕ АТЛАСНЫЕ
// =============================================================================

let undoFloor = 0; // min constellations count below which undo is blocked

/**
 * M-10: память имён отменённых созвездий на текущую ночь.
 * Ключ — набор рёбер (см. `constellationEdgeKey`), значение — ID поэтичного
 * имени из пула (`fb12`). Собрал те же звёзды теми же линиями после отката —
 * получил то же имя, в каком бы порядке ни рисовал.
 *
 * Живёт ночь: сбрасывается в `resetFieldSessionState()` вместе с полем и едет
 * в сейве (`save.js`), который сам протухает по `skyDate`. В отличие от
 * `commitWave`/`undoMark` персист здесь нужен — F5 посреди ночи обычное дело,
 * и без него откат + перезагрузка снова превращали бы имя в лотерею.
 */
let undoneNameMemory = new Map();

function resetUndoneNameMemory() {
    undoneNameMemory = new Map();
}

/**
 * Канонический ключ набора рёбер: каждое ребро — `min-max` (направление
 * рисования не важно), рёбра отсортированы (порядок рисования не важен).
 * Ключом взят именно набор рёбер, а не набор звёзд: те же звёзды, соединённые
 * иначе, — другая фигура, и имя у неё своё.
 */
function constellationEdgeKey(lines) {
    if (!Array.isArray(lines) || lines.length === 0) return '';
    const parts = [];
    for (const seg of lines) {
        if (!seg) continue;
        const a = Number(seg.startId);
        const b = Number(seg.endId);
        if (!Number.isFinite(a) || !Number.isFinite(b)) return '';
        parts.push(Math.min(a, b) + '-' + Math.max(a, b));
    }
    if (parts.length === 0) return '';
    parts.sort();
    return parts.join('|');
}

/**
 * Запомнить имя отменённого созвездия. Только поэтичные имена пула: у фигуры
 * каталога имя — это её ID, оно вернётся после отката само, а подменять его
 * запомненным нельзя (за ночь могла открыться страница атласа, и та же связка
 * теперь законно называется иначе).
 */
function rememberUndoneConstellationName(constellation) {
    if (!constellation || !isFallbackNameId(constellation.name)) return;
    const key = constellationEdgeKey(constellation.lines);
    if (!key) return;
    // Перевставка держит запись свежей в порядке вытеснения.
    undoneNameMemory.delete(key);
    undoneNameMemory.set(key, constellation.name);
    while (undoneNameMemory.size > UNDONE_NAME_MEMORY_MAX) {
        undoneNameMemory.delete(undoneNameMemory.keys().next().value);
    }
}

/**
 * Имя для нераспознанного созвездия: запомненное за этим набором рёбер, если
 * оно свободно, иначе обычная лотерея пула. Занятое имя не переиспользуется —
 * между откатом и повтором мог случиться коммит, которому пул выдал именно его,
 * а два одинаковых имени на одном небе игрок видит, в отличие от лотереи.
 *
 * T-09: свежее имя (не «запомненное этой связкой») обходит и живые созвездия,
 * и весь undoneNameMemory — иначе игрок, вернувшийся к отменённой связке ПОСЛЕ
 * того, как её имя случайно досталось другому набору рёбер, видел бы у себя
 * не «то же имя», а лотерею (ровно баг M-10 п.4, ≈1/44 на прогон). Если так
 * не осталось ни одного имени — единственный запасной путь: как раньше, без
 * памяти, просто чтобы вообще выдать имя.
 */
function pickConstellationFallbackName(lines) {
    const used = constellations.map(c => c.name);
    const remembered = undoneNameMemory.get(constellationEdgeKey(lines));
    if (remembered && !used.includes(remembered)) return remembered;
    const usedOrRemembered = used.concat([...undoneNameMemory.values()]);
    const fresh = pickFallbackName(usedOrRemembered);
    if (fresh !== SHAPE_UNRECOGNIZED) return fresh;
    return pickFallbackName(used);
}

/** Для сейва: `[[key, name], …]`. JSON `Map` не умеет. */
function dumpUndoneNameMemory() {
    return [...undoneNameMemory];
}

function restoreUndoneNameMemory(pairs) {
    undoneNameMemory = new Map();
    if (!Array.isArray(pairs)) return;
    for (const pair of pairs) {
        if (!Array.isArray(pair) || pair.length !== 2) continue;
        const [key, name] = pair;
        if (typeof key !== 'string' || key.length === 0) continue;
        if (!isFallbackNameId(name)) continue;
        undoneNameMemory.set(key, name);
    }
}

/** starId → RGB для вершин собранных атласных созвездий (до конца уровня). */
let atlasCollectedStarColors = new Map();

/** Уже есть созвездие с этой атласной фигурой (ignoreConstellation — не считать, напр. текущий коммит). */
function isAtlasShapeAlreadyOnField(shapeName, ignoreConstellation = null) {
    const normalized = normalizeShapeName(shapeName);
    if (!normalized || normalized === SHAPE_UNRECOGNIZED) return false;
    if (typeof isShapeOnAtlas === 'function' && !isShapeOnAtlas(normalized)) return false;

    const committed = Array.isArray(constellations) ? constellations : [];
    for (const c of committed) {
        if (!c || c === ignoreConstellation) continue;
        const cn = normalizeShapeName(c.shape || c.name);
        if (cn !== normalized) continue;
        if (typeof isShapeVisibleInAtlas === 'function' && !isShapeVisibleInAtlas(cn)) continue;
        return true;
    }
    return false;
}

/** Каталожное на поле: открытая страница атласа, форма «создана», ещё нет такой же на поле. */
function canCollectAtlasShapeOnField(shapeName) {
    const normalized = normalizeShapeName(shapeName);
    if (!normalized || !isShapeOnAtlas(normalized)) return false;
    if (!isShapeVisibleInAtlas(normalized)) return false;
    if (!isShapeCreated(normalized)) return false;
    return !isAtlasShapeAlreadyOnField(normalized);
}

/** Не больше одного atlasCollected на каждое имя (первое в порядке создания сохраняется). */
function normalizeAtlasCollectedOnField() {
    const keptNames = new Set();
    for (const c of constellations) {
        if (!c || !c.atlasCollected) continue;
        const shapeName = normalizeShapeName(c.shape || c.name);
        if (!isShapeCreated(shapeName)) {
            c.atlasCollected = false;
            continue;
        }
        if (keptNames.has(shapeName)) {
            c.atlasCollected = false;
        } else {
            keptNames.add(shapeName);
        }
    }
}

function recomputeAtlasCollectedStarColors() {
    const next = new Map();
    for (const c of constellations) {
        if (!c || !c.atlasCollected) continue;
        const shapeInfo = SHAPES[c.shape] || SHAPES[c.name] || SHAPES[SHAPE_UNRECOGNIZED];
        const color = shapeInfo.color;
        for (const seg of c.lines || []) {
            if (!seg) continue;
            next.set(seg.startId, color);
            next.set(seg.endId, color);
        }
    }
    atlasCollectedStarColors = next;
}

// =============================================================================
// EDGE RULES (max length, no crossings)
// =============================================================================

const EDGE_ENDPOINT_EPS = 0.5;

function getSegmentEndpointsWorld(startStar, endStar) {
    const wb = nearestHorizontalCopy(endStar.x, endStar.y, startStar.x, startStar.y);
    return { ax: startStar.x, ay: startStar.y, bx: wb.x, by: wb.y };
}

function endpointsSharePoint(ax, ay, bx, by, cx, cy, dx, dy) {
    const pairs = [
        [ax, ay, cx, cy], [ax, ay, dx, dy],
        [bx, by, cx, cy], [bx, by, dx, dy]
    ];
    for (const [x1, y1, x2, y2] of pairs) {
        if (Math.hypot(x1 - x2, y1 - y2) <= EDGE_ENDPOINT_EPS) return true;
    }
    return false;
}

function segmentsProperlyIntersect(seg1, seg2) {
    if (endpointsSharePoint(seg1.ax, seg1.ay, seg1.bx, seg1.by, seg2.ax, seg2.ay, seg2.bx, seg2.by)) {
        return false;
    }
    return segmentsIntersect(seg1.ax, seg1.ay, seg1.bx, seg1.by, seg2.ax, seg2.ay, seg2.bx, seg2.by);
}

function collectCommittedSegmentEndpoints() {
    const segments = [];
    const committed = Array.isArray(constellations) ? constellations : [];
    for (const constellation of committed) {
        segments.push(...getConstellationSegments(constellation.lines));
    }
    return segments;
}

function wouldEdgeCrossExisting(startId, endId, draftLines) {
    const start = getStarById(startId);
    const end = getStarById(endId);
    if (!start || !end) return true;

    const newSeg = getSegmentEndpointsWorld(start, end);
    const existing = collectCommittedSegmentEndpoints();

    for (const seg of draftLines || []) {
        if (!seg) continue;
        if ((seg.startId === startId && seg.endId === endId) ||
            (seg.startId === endId && seg.endId === startId)) {
            continue;
        }
        const ds = getStarById(seg.startId);
        const de = getStarById(seg.endId);
        if (!ds || !de) continue;
        existing.push(getSegmentEndpointsWorld(ds, de));
    }

    for (const seg of existing) {
        if (segmentsProperlyIntersect(newSeg, seg)) return true;
    }
    return false;
}

function isEdgeLengthValid(startStar, endStar) {
    return horizontalWrapDist(startStar.x, startStar.y, endStar.x, endStar.y) <= getMaxEdgeLength() + 1e-6;
}

/** Конец резиновой линии: не дальше maxEdge от якоря, поворачивается по направлению курсора. */
function getClampedDragEndpointWorld(anchorStar, fieldMouseX, fieldMouseY) {
    const anchor = nearestHorizontalCopy(anchorStar.x, anchorStar.y, fieldMouseX, fieldMouseY);
    let ex = fieldMouseX;
    let ey = fieldMouseY;
    const dx = ex - anchor.x;
    const dy = ey - anchor.y;
    const len = Math.hypot(dx, dy);
    const maxLen = getMaxEdgeLength();
    if (len > maxLen && len > 1e-9) {
        const scale = maxLen / len;
        ex = anchor.x + dx * scale;
        ey = anchor.y + dy * scale;
    }
    return { ax: anchor.x, ay: anchor.y, bx: ex, by: ey };
}

function canAddConstellationEdge(startId, endId, draftLines) {
    const start = getStarById(startId);
    const end = getStarById(endId);
    if (!start || !end) return false;
    // O-04: шаг 1 тутора — ребро мимо его пары нельзя провести и в обход
    // пиксельного хит-теста (__test.connect() идёт этим же путём).
    if (typeof isTutorialAllowedStar === 'function'
        && (!isTutorialAllowedStar(startId) || !isTutorialAllowedStar(endId))) return false;
    if (!isEdgeLengthValid(start, end)) return false;
    if (wouldEdgeCrossExisting(startId, endId, draftLines)) return false;
    return true;
}

function isValidEdgeBetweenStars(starA, starB) {
    if (!starA || !starB || starA.id === starB.id) return false;
    return canAddConstellationEdge(starA.id, starB.id, []);
}

function hasConnectablePair() {
    const playable = getPlayableStars();
    for (let i = 0; i < playable.length; i++) {
        for (let j = i + 1; j < playable.length; j++) {
            if (isValidEdgeBetweenStars(playable[i], playable[j])) return true;
        }
    }
    return false;
}

/**
 * O-11: id играбельных звёзд, у которых есть хотя бы один валидный партнёр —
 * «соединимые» звёзды. Кормит счёт «N stars left» на «Сегодня» (`bookToday.js`) —
 * подсветку этих же звёзд на небе задача тоже заводила, но заказчик её не
 * заметил на устройстве и попросил переделать иначе; подсветка снята тем же
 * прогоном, кеш остался под счётчиком. Кеш **не** пересчитывается каждый
 * кадр: сбрасывается событиями поля (`invalidateConnectableStarIdsCache`),
 * сам пересчёт ленивый, при первом запросе после сброса.
 *
 * Перебор — все пары `i < j` ровно по разу (тот же порядок, что у
 * `hasConnectablePair`), без пропуска уже найденных `i`: звезда, чей
 * единственный партнёр стоит раньше нее по списку, не будет обнаружена,
 * если её собственный проход пропустить, — обратный перебор здесь не короче
 * прямого. `isValidEdgeBetweenStars` сама сначала проверяет длину ребра
 * (дёшево) и только потом пересечения с уже собранными (дорого, O(рёбер)) —
 * короткое замыкание внутри `canAddConstellationEdge` даёт нужный порядок
 * отсева без отдельного прохода.
 */
let connectableStarIdsCache = null;

function invalidateConnectableStarIdsCache() {
    connectableStarIdsCache = null;
}

function getConnectableStarIds() {
    if (connectableStarIdsCache) return connectableStarIdsCache;
    // Сандбоксы верификаторов рендера (verify-commit-wave.js и т.п.) дают свой
    // fieldStars/getStarById, но не полный field.js — getPlayableStars там нет.
    const playable = typeof getPlayableStars === 'function' ? getPlayableStars() : [];
    const connectable = new Set();
    for (let i = 0; i < playable.length; i++) {
        const a = playable[i];
        for (let j = i + 1; j < playable.length; j++) {
            const b = playable[j];
            if (isValidEdgeBetweenStars(a, b)) {
                connectable.add(a.id);
                connectable.add(b.id);
            }
        }
    }
    connectableStarIdsCache = connectable;
    return connectableStarIdsCache;
}

function isDraftConstellationValid(lines) {
    if (!lines || lines.length < 1) return false;
    for (const seg of lines) {
        const start = getStarById(seg.startId);
        const end = getStarById(seg.endId);
        if (!start || !end || !isEdgeLengthValid(start, end)) return false;
    }
    const draftSegs = getConstellationSegments(lines);
    for (let i = 0; i < draftSegs.length; i++) {
        for (let j = i + 1; j < draftSegs.length; j++) {
            if (segmentsProperlyIntersect(draftSegs[i], draftSegs[j])) return false;
        }
    }
    for (const seg of lines) {
        if (wouldEdgeCrossExisting(seg.startId, seg.endId, lines)) return false;
    }
    return true;
}

// =============================================================================
// CONSTELLATION BUILD + COMMIT
// =============================================================================

/** @returns {{ lines, center, starIds, starCount, shape, recognizedClass } | null} */
function buildConstellationCommitPayload(lines) {
    const starIds = new Set();
    for (const seg of lines) {
        starIds.add(seg.startId);
        starIds.add(seg.endId);
    }

    let sumX = 0, sumY = 0, count = 0;
    for (const id of starIds) {
        const s = getStarById(id);
        if (s) { sumX += s.x; sumY += s.y; count++; }
    }
    if (count === 0) return null;

    const center = { x: sumX / count, y: sumY / count };
    const recognitionResult = recognizeShapeDetailed(lines, starIds);
    let shape = recognitionResult.label;
    let recognizedState = recognitionResult.state;
    const recognizedConfidence = recognitionResult.confidence || 0;
    let recognizedCandidates = Array.isArray(recognitionResult.candidates) ? [...recognitionResult.candidates] : [];

    recognizedCandidates = recognizedCandidates.filter(candidate => {
        if (!candidate || !candidate.label) return false;
        if (!isBuiltinShapeName(candidate.label)) return false;
        return isBuiltinShapeEnabled(candidate.label);
    });

    if (isBuiltinShapeName(shape) && !isBuiltinShapeEnabled(shape)) {
        shape = SHAPE_UNRECOGNIZED;
        recognizedState = 'fallback';
        recognizedCandidates = [];
    }
    const recognizedClass = shape;

    return {
        lines: [...lines],
        center,
        starIds,
        starCount: starIds.size,
        shape,
        recognizedClass,
        recognizedState,
        recognizedCandidates,
        recognizedConfidence
    };
}

function commitConstellationFromPayload(payload) {
    playCommit();
    const { lines, center, starIds, starCount, shape, recognizedClass } = payload;
    let finalShape = typeof clampShapeToAtlasVisibility === 'function'
        ? clampShapeToAtlasVisibility(shape)
        : shape;
    // M-02: запрет дублирующихся атласных имён на одном поле
    if (finalShape !== SHAPE_UNRECOGNIZED && isAtlasShapeAlreadyOnField(finalShape)) {
        finalShape = SHAPE_UNRECOGNIZED;
    }
    const scoreClass = typeof clampShapeToAtlasVisibility === 'function'
        ? clampShapeToAtlasVisibility(recognizedClass || shape)
        : (recognizedClass || shape);

    for (const id of starIds) {
        const s = getStarById(id);
        if (s) s.locked = true;
    }

    // S-01: первое создание фигуры фиксируется на коммите (сюрприз-имя,
    // первая копия сразу становится atlas-collected)
    if (finalShape !== SHAPE_UNRECOGNIZED && isShapeVisibleInAtlas(finalShape) && !isShapeCreated(finalShape)) {
        markShapeCreated(finalShape);
    }

    const labelAnchor = computeConstellationLabelAnchor(lines, starIds, finalShape);
    const isAtlasCollect = canCollectAtlasShapeOnField(finalShape);
    const { isSpecial: isFirstStarCountOnField } = registerStarCountOnCommit(starCount);
    // M-10: у поэтичного имени есть память на ночь — тот же набор рёбер после
    // отката получает то же имя. У фигуры каталога имя детерминировано и памяти
    // не требует.
    const displayName = finalShape === SHAPE_UNRECOGNIZED
        ? pickConstellationFallbackName(lines)
        : finalShape;
    // V-28: colorValue — среднее звёзд созвездия, хранится отдельно от lineColor
    // (бакета палитры CONSTELLATION_LINE_TIERS, концепт C) на случай, если её
    // формулу ещё раз поправят — не гонять звёзды заново.
    const colorValue = getMeanColorValue([...starIds]);
    const constellation = {
        lines,
        name: displayName,
        customName: null,   // всегда null на новых созвездиях — поле живо только ради старых сейвов (U-27 сняла ввод)
        center,
        labelAnchor,
        starCount,
        shape: finalShape,
        recognizedClass: scoreClass,
        isFirstStarCountOnField,
        atlasCollected: isAtlasCollect,
        lineColor: colorValueToConstellationLineRgb(colorValue),
        colorValue
    };
    constellations.push(constellation);

    // V-12: волна создания. Ставится до пересчётов и раскрытия — если этот же
    // коммит завершает уровень, revealConstellationArt её ниже отменит.
    startCommitWave(constellation);
    // K-04: окно отмены. Стартует после волны и гаснет само, если откат окажется
    // невозможен (мгновенный клейм шага 1, финал ночи) — проверка живая, покадровая.
    startUndoMark(constellation);

    const floaterAnchor = labelAnchor || center;
    if (floaterAnchor) {
        pushConstellationSizeCommitFloater(
            floaterAnchor.x,
            floaterAnchor.y,
            starCount,
            isFirstStarCountOnField
        );
    }
    recomputeSuppressedStars();
    // M-07: звёзды, которых после этого коммита больше не с кем соединить.
    constellation.orphanExtinguishedIds = extinguishOrphanStars();
    recomputeAtlasCollectedStarColors();
    // O-11: состав соединимых звёзд сменился — кеш протух.
    invalidateConnectableStarIdsCache();

    updateScoreUI();
    updateProgressionUI();
    onConstellationCreated(finalShape);

    if (typeof recordAchievementCommit === 'function') recordAchievementCommit(constellation);

    // O-01: первое созвездие переводит тутор со шага «соединение» на «отзум».
    // Сам шаг выводится из constellations.length — здесь только досылаем это
    // в строку на небе, чтобы текст сменился в тот же момент, что и состояние.
    if (typeof updateTutorialUI === 'function') updateTutorialUI();

    // O-04: у самого первого созвездия игры (тьюторное соединение) окна отмены
    // нет вовсе — тем же приёмом, что мгновенный клейм шага 1 цепочки (S-01,
    // achievements.js:1209). undoFloor поднят раньше, чем getLiveUndoMark()
    // успеет отрисовать пометку живым тиком, поэтому она не мелькает и гаснет.
    if (typeof isTutorialNight === 'function' && isTutorialNight() && constellations.length === 1
        && typeof raiseUndoFloor === 'function') {
        raiseUndoFloor();
    }

    autoSave();

    tryRevealConstellationArtIfComplete();
}

function collectStarIdsFromLines(lines) {
    const ids = new Set();
    for (const seg of lines || []) {
        if (!seg) continue;
        ids.add(seg.startId);
        ids.add(seg.endId);
    }
    return ids;
}

function raiseUndoFloor() {
    undoFloor = Math.max(undoFloor, constellations.length);
}

function undoLastConstellation() {
    if (constellations.length <= undoFloor) return;
    const last = constellations.pop();

    // M-10: имя остаётся за набором рёбер до конца ночи — собранная заново
    // та же связка звёзд назовётся так же.
    rememberUndoneConstellationName(last);

    // V-12: иначе волна продолжила бы бежать по созвездию, которого уже нет.
    cancelCommitWave();
    // K-04: окно отмены закрылось вместе с созвездием, которое оно называло.
    cancelUndoMark();
    // V-13: защитно. `undoFloor` поднят раскрытием, так что до сюда с активной
    // сценой не дойти, но сцена держит ссылки на созвездия — пусть падает первой.
    cancelLevelFinale();

    for (const id of collectStarIdsFromLines(last.lines)) {
        const s = getStarById(id);
        if (s) s.locked = false;
    }

    // M-07: звёзды, погашенные как сироты именно этим коммитом, — обратно.
    for (const id of (last.orphanExtinguishedIds || [])) {
        const s = getStarById(id);
        if (s) s.extinguished = false;
    }

    if (typeof recordAchievementUndo === 'function') recordAchievementUndo(last);

    normalizeAtlasCollectedOnField();
    rebuildStarCountStateFromConstellations();
    recomputeSuppressedStars();
    recomputeAtlasCollectedStarColors();
    // O-11: состав соединимых звёзд сменился — кеш протух.
    invalidateConnectableStarIdsCache();

    // S-01: откат первого коммита фигуры невозможен (undoFloor поднят при
    // мгновенном клейме шага 1) — createdShapes здесь не трогаем; ночной
    // счётчик цепочки откатывается в recordAchievementUndo.

    const canContinue = !isLevelComplete();

    if (canContinue) {
        if (constellationArtRevealed) {
            constellationArtRevealed = false;
            // V-32: ночь снова не раскрыта — чертёж закладки возвращается.
            if (typeof renderSkyBookmark === 'function') renderSkyBookmark();
        }
    } else {
        tryRevealConstellationArtIfComplete();
    }

    updateScoreUI();
    updateProgressionUI();
    // O-01: снял единственное созвездие тьюторной ночи — вернулись на шаг
    // «соединение». Тутор пройденный этим не воскрешается: у него свой флаг.
    if (typeof updateTutorialUI === 'function') updateTutorialUI();
    if (typeof refreshBookIfOpen === 'function') refreshBookIfOpen();
    autoSave();
}

/**
 * V-13: `animate = false` — раскрытие без сцены финала. Так его зовёт загрузка
 * сохранения: сцена принадлежит МОМЕНТУ завершения ночи, а не её состоянию,
 * и после F5 играться не должна. До V-13 на это работал только персист
 * `constellationArtRevealed` с ранним `return` — со сценой полагаться на него
 * нельзя, потому что путь «сейв на завершённом небе с revealed: false» существует.
 */
function tryRevealConstellationArtIfComplete(animate = true) {
    if (constellationArtRevealed) return;
    if (!isLevelComplete()) return;
    revealConstellationArt(animate);
}

function revealConstellationArt(animate = true) {
    if (constellationArtRevealed) return;
    playLevelComplete();
    // V-12: у раскрытия своя волна имён и свой стиль линий — волна создания
    // последнего созвездия отменяется, чтобы они не дрались за одни и те же рёбра.
    cancelCommitWave();
    constellationArtRevealed = true;
    revealTime = millis();
    raiseUndoFloor();

    for (const c of constellations) {
        const fallbackStarIds = collectStarIdsFromLines(c.lines);
        c.labelAnchor = computeConstellationLabelAnchor(c.lines, fallbackStarIds, c.name || c.shape);
    }
    recomputeAtlasCollectedStarColors();
    // V-29: раскладка подписей раскрытой ночи — все созвездия разом, с учётом
    // друг друга и чужих линий. Считается один раз здесь (не на каждом кадре
    // и не на ресайзе) — c.revealedLabelAnchor дальше живёт в сейве.
    if (typeof layoutAndStoreRevealedLabels === 'function') layoutAndStoreRevealedLabels();

    // V-13: сцена ставится ПОСЛЕ raiseUndoFloor и пересчёта якорей — окна
    // «сцена идёт, откат ещё жив» не возникает, а рождаться созвездия будут
    // уже с финальными подписями (они в сцене не видны, но считаются один раз).
    if (animate) startLevelFinale();

    // M-05: прямой выплаты за небо больше нет — раскрытие только взводит
    // защёлку суточного квеста, ✦ приходят обычным забором в Наградах.
    if (typeof recordAchievementReveal === 'function') recordAchievementReveal();

    updateScoreUI();
    updateProgressionUI();
    if (typeof refreshBookIfOpen === 'function') refreshBookIfOpen();
    // V-32: раскрытая ночь прячет чертёж закладки — и без сцены (загрузка сейва).
    if (typeof renderSkyBookmark === 'function') renderSkyBookmark();
    // V-13: тоста завершения ночи больше нет — он висел ровно в центре кадра,
    // куда приезжает камера, а роль сообщения забрала сама сцена.
    autoSave();
}

function getConstellationStars(lines, starIds) {
    const stars = [];
    const visitedIds = new Set();

    if (starIds && typeof starIds[Symbol.iterator] === 'function') {
        for (const id of starIds) {
            if (visitedIds.has(id)) continue;
            const s = getStarById(id);
            if (!s) continue;
            visitedIds.add(id);
            stars.push(s);
        }
    } else {
        for (const seg of lines || []) {
            if (!seg) continue;
            if (!visitedIds.has(seg.startId)) {
                const start = getStarById(seg.startId);
                if (start) {
                    visitedIds.add(seg.startId);
                    stars.push(start);
                }
            }
            if (!visitedIds.has(seg.endId)) {
                const end = getStarById(seg.endId);
                if (end) {
                    visitedIds.add(seg.endId);
                    stars.push(end);
                }
            }
        }
    }

    return stars;
}

/**
 * Сегменты созвездия между фактическими позициями звёзд. R-03: до P-01 рядом
 * жил двойник …HorizWrap, учитывавший wrap, — копия поля одна, двойник снят.
 */
function getConstellationSegments(lines) {
    const segments = [];
    for (const seg of lines || []) {
        if (!seg) continue;
        const start = getStarById(seg.startId);
        const end = getStarById(seg.endId);
        if (!start || !end) continue;
        segments.push({ ax: start.x, ay: start.y, bx: end.x, by: end.y });
    }
    return segments;
}

function pointInRect(px, py, rect) {
    return px >= rect.left && px <= rect.right && py >= rect.top && py <= rect.bottom;
}

function ccw(ax, ay, bx, by, cx, cy) {
    return (cy - ay) * (bx - ax) > (by - ay) * (cx - ax);
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
    return ccw(ax, ay, cx, cy, dx, dy) !== ccw(bx, by, cx, cy, dx, dy) &&
           ccw(ax, ay, bx, by, cx, cy) !== ccw(ax, ay, bx, by, dx, dy);
}

function segmentIntersectsRect(ax, ay, bx, by, rect) {
    if (pointInRect(ax, ay, rect) || pointInRect(bx, by, rect)) return true;
    return segmentsIntersect(ax, ay, bx, by, rect.left, rect.top, rect.right, rect.top) ||
           segmentsIntersect(ax, ay, bx, by, rect.right, rect.top, rect.right, rect.bottom) ||
           segmentsIntersect(ax, ay, bx, by, rect.right, rect.bottom, rect.left, rect.bottom) ||
           segmentsIntersect(ax, ay, bx, by, rect.left, rect.bottom, rect.left, rect.top);
}

function evaluateLabelCandidate(cx, y, labelHalfW, labelHalfH, segments) {
    const rect = {
        left: cx - labelHalfW,
        right: cx + labelHalfW,
        top: y - labelHalfH,
        bottom: y + labelHalfH
    };

    let intersections = 0;
    let minDistance = Infinity;
    for (const segment of segments) {
        if (segmentIntersectsRect(segment.ax, segment.ay, segment.bx, segment.by, rect)) {
            intersections++;
        }
        const d = distancePointToSegment(cx, y, segment.ax, segment.ay, segment.bx, segment.by);
        if (d < minDistance) minDistance = d;
    }

    return { intersections, minDistance };
}

/**
 * V-29: bbox фигуры — по рёбрам, а при их отсутствии по звёздам. Общий для
 * computeConstellationLabelAnchor (вслепую, только своя фигура) и
 * layoutRevealedLabels (все фигуры разом, ниже).
 */
function computeConstellationBBox(segments, stars) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    if (segments.length > 0) {
        for (const seg of segments) {
            minX = Math.min(minX, seg.ax, seg.bx);
            minY = Math.min(minY, seg.ay, seg.by);
            maxX = Math.max(maxX, seg.ax, seg.bx);
            maxY = Math.max(maxY, seg.ay, seg.by);
        }
    }
    if (!Number.isFinite(minX)) {
        for (const star of stars || []) {
            minX = Math.min(minX, star.x);
            minY = Math.min(minY, star.y);
            maxX = Math.max(maxX, star.x);
            maxY = Math.max(maxY, star.y);
        }
    }
    return { minX, minY, maxX, maxY };
}

function computeConstellationLabelAnchor(lines, starIds, shapeName) {
    const stars = getConstellationStars(lines, starIds);
    if (stars.length === 0) return null;

    const segments = getConstellationSegments(lines);
    const { minX, minY, maxX, maxY } = computeConstellationBBox(segments, stars);

    const safeMargin = 18;
    const cx = constrain((minX + maxX) / 2, safeMargin, FIELD_WIDTH - safeMargin);
    // L-01: ширину прикидываем по локализованной подписи — длина строк разная.
    const labelText = typeof shapeName === 'string' && shapeName.trim().length > 0
        ? shapeLabel(shapeName.trim())
        : t('field.constellation');
    const estimatedLabelWidth = Math.max(72, labelText.length * 9);
    const labelHalfW = estimatedLabelWidth / 2;
    const labelHalfH = 11;

    const baseOffset = 36;
    const stepOffset = 22;
    const maxAttempts = 8;

    const candidates = [
        { side: 'above', direction: -1, startY: minY - baseOffset },
        { side: 'below', direction: 1, startY: maxY + baseOffset }
    ];

    const evaluated = [];
    for (const candidate of candidates) {
        let best = null;
        let y = candidate.startY;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            const clampedY = constrain(y, safeMargin, FIELD_HEIGHT - safeMargin);
            const metrics = evaluateLabelCandidate(cx, clampedY, labelHalfW, labelHalfH, segments);
            const isCorrectSide = candidate.side === 'above' ? clampedY < minY : clampedY > maxY;
            const score = {
                side: candidate.side,
                x: cx,
                y: clampedY,
                intersections: metrics.intersections + (isCorrectSide ? 0 : 1000),
                minDistance: metrics.minDistance
            };
            if (!best ||
                score.intersections < best.intersections ||
                (score.intersections === best.intersections && score.minDistance > best.minDistance)) {
                best = score;
            }
            if (score.intersections === 0) break;
            y += candidate.direction * stepOffset;
        }
        if (best) evaluated.push(best);
    }

    if (evaluated.length === 0) {
        const yFall = constrain(minY - baseOffset, safeMargin, FIELD_HEIGHT - safeMargin);
        return { x: cx, y: yFall, side: 'above' };
    }
    evaluated.sort((a, b) => {
        if (a.intersections !== b.intersections) return a.intersections - b.intersections;
        return b.minDistance - a.minDistance;
    });
    const chosen = evaluated[0];
    return { x: chosen.x, y: chosen.y, side: chosen.side };
}

// =============================================================================
// V-29: РАСКЛАДКА ПОДПИСЕЙ РАСКРЫТОЙ НОЧИ — ВСЕ РАЗОМ
// =============================================================================
//
// computeConstellationLabelAnchor() выше выбирает место вслепую — глядя только
// на рёбра СВОЕЙ фигуры, в момент коммита, когда остальное небо ещё не готово.
// На итоговом кадре (все фигуры видны разом) так расставленные подписи могут
// наложиться друг на друга или на чужие линии — заметно на плотных полях-картинках.
// layoutRevealedLabels() считается один раз при раскрытии (revealConstellationArt)
// и раскладывает подписи ВСЕХ созвездий разом: крупные фигуры — первыми, дальше
// в свободное место с учётом уже поставленных подписей и чужих линий. Итог живёт
// в `constellation.revealedLabelAnchor` (сейв, save.js) — посчитан один раз,
// дальше не пересчитывается.

const LABEL_LAYOUT_OVERLAP_WEIGHT = 10;
const LABEL_LAYOUT_FOREIGN_EDGE_WEIGHT = 3;
const LABEL_LAYOUT_OWN_EDGE_WEIGHT = 1;

function distToBBoxCenter(point, bbox) {
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    return Math.hypot(point.x - cx, point.y - cy);
}

function rectsOverlapArea(a, b) {
    const w = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const h = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    if (w <= 0 || h <= 0) return 0;
    return w * h;
}

function circleIntersectsRect(cx, cy, r, rect) {
    const nearestX = constrain(cx, rect.left, rect.right);
    const nearestY = constrain(cy, rect.top, rect.bottom);
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return dx * dx + dy * dy <= r * r;
}

/**
 * 8 позиций вокруг bbox фигуры (над/под/слева/справа + четыре угла) на двух
 * отступах — 16 кандидатов; первым в общем списке идёт `anchorCandidate` —
 * место, которое выбрала бы computeConstellationLabelAnchor (подпись не
 * прыгает без нужды, если ей и так никто не мешает).
 */
function buildLabelLayoutCandidates(bbox, anchorCandidate, halfW, halfH, pad) {
    const cx = (bbox.minX + bbox.maxX) / 2;
    const cy = (bbox.minY + bbox.maxY) / 2;
    const nearAboveY = bbox.minY - halfH - pad;
    const farAboveY = nearAboveY - (halfH * 2 + pad);
    const nearBelowY = bbox.maxY + halfH + pad;
    const farBelowY = nearBelowY + (halfH * 2 + pad);
    const nearLeftX = bbox.minX - halfW - pad;
    const farLeftX = nearLeftX - (halfW * 2 + pad);
    const nearRightX = bbox.maxX + halfW + pad;
    const farRightX = nearRightX + (halfW * 2 + pad);

    const grid = [
        { x: cx, y: nearAboveY }, { x: cx, y: farAboveY },
        { x: cx, y: nearBelowY }, { x: cx, y: farBelowY },
        { x: nearLeftX, y: cy }, { x: farLeftX, y: cy },
        { x: nearRightX, y: cy }, { x: farRightX, y: cy },
        { x: nearRightX, y: nearAboveY }, { x: farRightX, y: farAboveY },
        { x: nearLeftX, y: nearAboveY }, { x: farLeftX, y: farAboveY },
        { x: nearRightX, y: nearBelowY }, { x: farRightX, y: farBelowY },
        { x: nearLeftX, y: nearBelowY }, { x: farLeftX, y: farBelowY }
    ];

    const list = [];
    if (anchorCandidate) list.push({ x: anchorCandidate.x, y: anchorCandidate.y });
    for (const g of grid) list.push(g);
    return list;
}

function clampLabelCandidateToRect(candidate, halfW, halfH, bounds) {
    return {
        x: constrain(candidate.x, bounds.left + halfW, bounds.right - halfW),
        y: constrain(candidate.y, bounds.top + halfH, bounds.bottom - halfH)
    };
}

/**
 * Раскладывает подписи ВСЕХ созвездий разом — учитывает чужие рёбра, все
 * звёзды и уже поставленные подписи, а не только рёбра своей фигуры.
 * Чистая функция — своя копия геометрии, но не своя копия правил распознавания:
 * решает только «где нарисовать текст», ничего игрового не знает.
 *
 * @param items      [{ key, name, candidateAnchor, bbox, starCount, isCatalog, order }]
 * @param obstacles  { edges: [{ax,ay,bx,by,ownerKey}], stars: [{x,y,r,ownerKey}] }
 * @param opts       { pad, labelHalfH, bounds:{left,top,right,bottom}, measureWidth(name) => world-ширина }
 * @returns Map key -> {x, y}
 */
function layoutRevealedLabels(items, obstacles, opts) {
    const pad = opts.pad || 0;
    const halfH = opts.labelHalfH;
    const bounds = opts.bounds;
    const measureWidth = opts.measureWidth;

    // Больше звёзд — раньше; при равенстве фигура каталога раньше поэтичного
    // имени (fb*); дальше порядок создания. Крупные фигуры получают лучшие места.
    const ordered = items.slice().sort((a, b) => {
        if (b.starCount !== a.starCount) return b.starCount - a.starCount;
        if (a.isCatalog !== b.isCatalog) return a.isCatalog ? -1 : 1;
        return a.order - b.order;
    });

    const placedRects = [];
    const result = new Map();

    for (const item of ordered) {
        const halfW = Math.max(1, measureWidth(item.name)) / 2 + pad / 2;
        const candidates = buildLabelLayoutCandidates(item.bbox, item.candidateAnchor, halfW, halfH, pad)
            .map(c => clampLabelCandidateToRect(c, halfW, halfH, bounds));

        let bestClean = null;
        let bestAny = null;
        let bestAnyCost = Infinity;

        for (const c of candidates) {
            const rect = { left: c.x - halfW, right: c.x + halfW, top: c.y - halfH, bottom: c.y + halfH };

            let overlapArea = 0;
            for (const pr of placedRects) overlapArea += rectsOverlapArea(rect, pr);

            let ownHits = 0;
            let foreignHits = 0;
            for (const e of obstacles.edges) {
                if (!segmentIntersectsRect(e.ax, e.ay, e.bx, e.by, rect)) continue;
                if (e.ownerKey === item.key) ownHits++; else foreignHits++;
            }
            for (const s of obstacles.stars) {
                if (!circleIntersectsRect(s.x, s.y, s.r, rect)) continue;
                if (s.ownerKey === item.key) ownHits++; else foreignHits++;
            }

            const isClean = overlapArea === 0 && ownHits === 0 && foreignHits === 0;
            if (isClean) {
                // Связь «имя ↔ фигура»: чистый кандидат ближе к чужой фигуре,
                // чем к своей, — штраф, берём следующий чистый, если он есть.
                const ownDist = distToBBoxCenter(c, item.bbox);
                let closerToForeign = false;
                for (const other of ordered) {
                    if (other === item) continue;
                    if (distToBBoxCenter(c, other.bbox) < ownDist) { closerToForeign = true; break; }
                }
                if (!bestClean) bestClean = c; // запасной — вдруг лучшего не найдётся
                if (!closerToForeign) { bestClean = c; break; }
                continue;
            }

            const cost = overlapArea * LABEL_LAYOUT_OVERLAP_WEIGHT
                + foreignHits * LABEL_LAYOUT_FOREIGN_EDGE_WEIGHT
                + ownHits * LABEL_LAYOUT_OWN_EDGE_WEIGHT;
            if (cost < bestAnyCost || (cost === bestAnyCost && bestAny
                && distToBBoxCenter(c, item.bbox) < distToBBoxCenter(bestAny, item.bbox))) {
                bestAnyCost = cost;
                bestAny = c;
            }
        }

        // Подпись не прячется никогда — при отсутствии чистого места берём
        // минимальную цену, а не пустоту.
        const chosen = bestClean || bestAny || candidates[0];
        result.set(item.key, chosen);
        placedRects.push({ left: chosen.x - halfW, right: chosen.x + halfW, top: chosen.y - halfH, bottom: chosen.y + halfH });
    }

    return result;
}

/** Мировой радиус звезды-препятствия на мин-зуме — тот же расчёт, что в
 *  drawVisibleStars() (skyRender.js), без зависимости от текущего zoomLevel. */
function getFinaleObstacleStarRadius(star, minZoom) {
    const sizeFactor = typeof star.sizeFactor === 'number' ? star.sizeFactor : 1;
    const baseStarDrawSize = Math.max(STAR_SIZE, STAR_SIZE / minZoom * 0.5) * sizeFactor;
    return baseStarDrawSize * STAR_BASE_DIAM_MULT / 2;
}

/**
 * Собирает items/obstacles по текущему `constellations` и пишет
 * `c.revealedLabelAnchor` каждому. Считается один раз — из revealConstellationArt()
 * сразу после пересчёта c.labelAnchor, и из save.js при миграции старого сейва
 * раскрытой ночи. Работает на мин-зуме ПОЛНОЭКРАННОГО неба (getFinaleLayoutMinZoom) —
 * худший случай: на приближении подпись (постоянного экранного размера) в мире
 * только мельчает, новых наложений не возникает.
 */
function layoutAndStoreRevealedLabels() {
    if (!Array.isArray(constellations) || constellations.length === 0) return;

    const minZoom = typeof getFinaleLayoutMinZoom === 'function'
        ? getFinaleLayoutMinZoom()
        : getMinZoomLevel();
    const bounds = typeof getFinaleLayoutVisibleRect === 'function'
        ? getFinaleLayoutVisibleRect(minZoom)
        : { left: 0, top: 0, right: FIELD_WIDTH, bottom: FIELD_HEIGHT };

    const worldLabelSize = REVEALED_CONSTELLATION_LABEL_SIZE / minZoom;
    const pad = LABEL_LAYOUT_PAD_PX / minZoom;
    const labelHalfH = worldLabelSize / 2;

    const items = [];
    const edges = [];
    const stars = [];

    constellations.forEach((c, index) => {
        if (!Array.isArray(c.lines) || c.lines.length === 0) return;

        const segments = getConstellationSegments(c.lines);
        for (const seg of segments) edges.push({ ax: seg.ax, ay: seg.ay, bx: seg.bx, by: seg.by, ownerKey: index });

        const fallbackStarIds = collectStarIdsFromLines(c.lines);
        const constellationStars = getConstellationStars(c.lines, fallbackStarIds);
        for (const s of constellationStars) {
            stars.push({ x: s.x, y: s.y, r: getFinaleObstacleStarRadius(s, minZoom), ownerKey: index });
        }

        const bbox = computeConstellationBBox(segments, constellationStars);
        items.push({
            key: index,
            name: getConstellationDisplayName(c),
            candidateAnchor: c.labelAnchor,
            bbox,
            starCount: c.starCount || constellationStars.length,
            isCatalog: c.shape !== SHAPE_UNRECOGNIZED,
            order: index
        });
    });

    if (items.length === 0) return;

    const placement = layoutRevealedLabels(items, { edges, stars }, {
        pad,
        labelHalfH,
        bounds,
        measureWidth: name => measureSmallCapsWidth(name, worldLabelSize)
    });

    for (const item of items) {
        const p = placement.get(item.key);
        if (p) constellations[item.key].revealedLabelAnchor = { x: p.x, y: p.y };
    }
}

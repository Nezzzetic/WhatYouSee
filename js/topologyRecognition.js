// topologyRecognition.js — топологический распознаватель (каталог-29)
//
// Принцип (docs/Созвездия-29-графов.md §2): имя фигуры выбирается по
// ИЗОМОРФИЗМУ графа — инвариант (звёзды, линии, сорт. степени, треугольники)
// полон для связных графов до 5 вершин, коллизий в каталоге-29 нет.
// Отдельно работает ВАЛИДАТОР ограничений углов (§4) — он только проверяет
// аккуратность начертания (не выбирает между фигурами). Нарушение → null
// (созвездие остаётся обычным / fallback).
//
// Функции чистые (без p5-глобалей) — используются и в игре, и в node-проверке.
// В браузере читают глобальный CATALOG_29 (constants.js); в node CATALOG_29
// передаётся через global перед загрузкой файла.

// =============================================================================
// ГЕОМЕТРИЯ
// =============================================================================

function _tpDist(a, b) {
    return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Угол при вершине q (в градусах) между лучами q→p и q→r. */
function _tpAngleAt(p, q, r) {
    const v1x = p.x - q.x, v1y = p.y - q.y;
    const v2x = r.x - q.x, v2y = r.y - q.y;
    const dot = v1x * v2x + v1y * v2y;
    const cross = v1x * v2y - v1y * v2x;
    return Math.atan2(Math.abs(cross), dot) * 180 / Math.PI;
}

/** Точка внутри многоугольника (ray casting). poly — [{x,y}]. */
function _tpPointInPolygon(pt, poly) {
    if (!poly || poly.length < 3) return false;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = ((yi > pt.y) !== (yj > pt.y)) &&
            (pt.x < (xj - xi) * (pt.y - yi) / ((yj - yi) || 1e-12) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// =============================================================================
// ГРАФ
// =============================================================================

/** Нормализует список линий к массиву {a,b} (принимает {startId,endId} или {a,b}). */
function _tpEdges(lines) {
    const edges = [];
    for (const seg of (lines || [])) {
        const a = seg.startId !== undefined ? seg.startId : seg.a;
        const b = seg.endId !== undefined ? seg.endId : seg.b;
        if (a === undefined || b === undefined || a === b) continue;
        edges.push({ a, b });
    }
    return edges;
}

function _tpAdjacency(ids, edges) {
    const adj = {};
    for (const id of ids) adj[id] = [];
    for (const e of edges) {
        if (adj[e.a] && adj[e.b]) {
            if (!adj[e.a].includes(e.b)) adj[e.a].push(e.b);
            if (!adj[e.b].includes(e.a)) adj[e.b].push(e.a);
        }
    }
    return adj;
}

function _tpDegrees(ids, adj) {
    return ids.map(id => (adj[id] || []).length);
}

/** Число треугольников (троек попарно связанных вершин). */
function _tpTriangleCount(ids, adj) {
    let count = 0;
    for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
            if (!(adj[ids[i]] || []).includes(ids[j])) continue;
            for (let k = j + 1; k < ids.length; k++) {
                if ((adj[ids[i]] || []).includes(ids[k]) &&
                    (adj[ids[j]] || []).includes(ids[k])) count++;
            }
        }
    }
    return count;
}

/** Связен ли граф (BFS от первой вершины). */
function _tpIsConnected(ids, adj) {
    if (ids.length === 0) return false;
    const seen = new Set([ids[0]]);
    const stack = [ids[0]];
    while (stack.length) {
        const v = stack.pop();
        for (const n of (adj[v] || [])) {
            if (!seen.has(n)) { seen.add(n); stack.push(n); }
        }
    }
    return seen.size === ids.length;
}

/** Инвариант изоморфизма: "n|m|deg1-deg2-…|triangles". */
function topologyInvariant(ids, edges) {
    const adj = _tpAdjacency(ids, edges);
    const degs = _tpDegrees(ids, adj).sort((x, y) => x - y);
    const tri = _tpTriangleCount(ids, adj);
    return `${ids.length}|${edges.length}|${degs.join('-')}|${tri}`;
}

// =============================================================================
// ИНДЕКС КАТАЛОГА (инвариант → имя)
// =============================================================================

let _tpCatalogIndex = null;

function _tpGetCatalog() {
    if (typeof CATALOG_29 !== 'undefined') return CATALOG_29;
    if (typeof global !== 'undefined' && global.CATALOG_29) return global.CATALOG_29;
    return null;
}

function buildTopologyCatalogIndex() {
    const catalog = _tpGetCatalog();
    const index = {};
    const collisions = [];
    if (!catalog) return { index, collisions };
    for (const name of Object.keys(catalog)) {
        const pat = catalog[name];
        const ids = pat.stars.map((_, i) => i);
        const edges = pat.lines.map(([a, b]) => ({ a, b }));
        const inv = topologyInvariant(ids, edges);
        if (index[inv]) collisions.push([index[inv], name, inv]);
        else index[inv] = name;
    }
    return { index, collisions };
}

function _tpIndex() {
    if (!_tpCatalogIndex) _tpCatalogIndex = buildTopologyCatalogIndex().index;
    return _tpCatalogIndex;
}

// =============================================================================
// ТОПОЛОГИЧЕСКИЕ ХЕЛПЕРЫ ДЛЯ ВАЛИДАТОРА
// =============================================================================

/** 2-ядро: последовательно снимаем листья (степень ≤1). Возвращает id ядра. */
function _tpTwoCore(ids, adj) {
    const deg = {};
    for (const id of ids) deg[id] = (adj[id] || []).length;
    const alive = new Set(ids);
    let changed = true;
    while (changed) {
        changed = false;
        for (const id of [...alive]) {
            if (deg[id] <= 1) {
                alive.delete(id);
                for (const n of (adj[id] || [])) {
                    if (alive.has(n)) deg[n]--;
                }
                changed = true;
            }
        }
    }
    return [...alive];
}

/** Если ядро — простой цикл (каждая вершина ровно 2 соседа в ядре), вернуть его
 *  упорядоченным; иначе null. */
function _tpOrderSimpleCycle(coreIds, adj) {
    if (coreIds.length < 3) return null;
    const coreSet = new Set(coreIds);
    const coreAdj = {};
    for (const id of coreIds) {
        coreAdj[id] = (adj[id] || []).filter(n => coreSet.has(n));
        if (coreAdj[id].length !== 2) return null;
    }
    const ordered = [coreIds[0]];
    let prev = null, cur = coreIds[0];
    for (let i = 1; i < coreIds.length; i++) {
        const next = coreAdj[cur].find(n => n !== prev);
        if (next === undefined) return null;
        ordered.push(next);
        prev = cur; cur = next;
    }
    return ordered;
}

/** Упорядочить цепочку (2 конца степени 1). */
function _tpOrderChain(ids, adj) {
    let start = ids.find(id => (adj[id] || []).length === 1);
    if (start === undefined) start = ids[0];
    const ordered = [start];
    let prev = null, cur = start;
    for (let i = 1; i < ids.length; i++) {
        const next = (adj[cur] || []).find(n => n !== prev);
        if (next === undefined) break;
        ordered.push(next);
        prev = cur; cur = next;
    }
    return ordered;
}

function _tpMaxDegreeVertex(ids, adj) {
    let best = null, bestDeg = -1, tie = false;
    for (const id of ids) {
        const d = (adj[id] || []).length;
        if (d > bestDeg) { bestDeg = d; best = id; tie = false; }
        else if (d === bestDeg) tie = true;
    }
    return tie ? null : best; // null если максимум не единственный
}

// =============================================================================
// ВАЛИДАТОР ОГРАНИЧЕНИЙ УГЛОВ (§4)
// =============================================================================
//
// Стратегия: базовое правило (≥20° в каждой звезде) применяется всегда, кроме
// плотных фигур с пер-фигурным baseMin. Остальные примитивы декларативны
// (CATALOG_29[name].c). Там, где структура фигуры не позволяет однозначно
// вычислить примитив, валидатор ЛЕНИВ (пропускает) — это соответствует
// «принципу упрощения» §4 и гарантирует, что каноническое начертание любой
// фигуры проходит свой валидатор. Демо-фигуры используют только строго
// реализованные примитивы (base, chainAngle, arc, cycleAngleMin, convex).

const TP_BASE_MIN_ANGLE = 20;

function _tpBaseAngleOk(ids, adj, pts, minAngle) {
    const thr = typeof minAngle === 'number' ? minAngle : TP_BASE_MIN_ANGLE;
    if (thr <= 0) return true;
    for (const id of ids) {
        const nb = adj[id] || [];
        if (nb.length < 2) continue;
        for (let i = 0; i < nb.length; i++) {
            for (let j = i + 1; j < nb.length; j++) {
                const a = pts[nb[i]], q = pts[id], b = pts[nb[j]];
                if (!a || !q || !b) continue;
                if (_tpAngleAt(a, q, b) < thr) return false;
            }
        }
    }
    return true;
}

function _tpChainAngleOk(ids, adj, pts, range) {
    const ordered = _tpOrderChain(ids, adj);
    for (let i = 1; i < ordered.length - 1; i++) {
        const p = pts[ordered[i - 1]], q = pts[ordered[i]], r = pts[ordered[i + 1]];
        if (!p || !q || !r) continue;
        const ang = _tpAngleAt(p, q, r);
        if (ang < range[0] || ang > range[1]) return false;
    }
    return true;
}

function _tpArcOk(ids, adj, pts) {
    const ordered = _tpOrderChain(ids, adj);
    let sign = 0;
    for (let i = 1; i < ordered.length - 1; i++) {
        const p = pts[ordered[i - 1]], q = pts[ordered[i]], r = pts[ordered[i + 1]];
        if (!p || !q || !r) continue;
        const cross = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
        if (cross > 1e-9) { if (sign < 0) return false; sign = 1; }
        else if (cross < -1e-9) { if (sign > 0) return false; sign = -1; }
    }
    return true;
}

function _tpCycleAngleMinOk(ids, adj, pts, minAngle) {
    const core = _tpTwoCore(ids, adj);
    const cycle = _tpOrderSimpleCycle(core, adj);
    if (!cycle) return true; // не простой цикл — ленивый пропуск
    const n = cycle.length;
    for (let i = 0; i < n; i++) {
        const p = pts[cycle[(i - 1 + n) % n]], q = pts[cycle[i]], r = pts[cycle[(i + 1) % n]];
        if (!p || !q || !r) continue;
        if (_tpAngleAt(p, q, r) < minAngle) return false;
    }
    return true;
}

function _tpConvexOk(ids, adj, pts) {
    const core = _tpTwoCore(ids, adj);
    const cycle = _tpOrderSimpleCycle(core, adj);
    if (!cycle) return true; // не простой цикл — ленивый пропуск
    let sign = 0;
    const n = cycle.length;
    for (let i = 0; i < n; i++) {
        const p = pts[cycle[i]], q = pts[cycle[(i + 1) % n]], r = pts[cycle[(i + 2) % n]];
        if (!p || !q || !r) continue;
        const cross = (q.x - p.x) * (r.y - q.y) - (q.y - p.y) * (r.x - q.x);
        if (cross > 1e-9) { if (sign < 0) return false; sign = 1; }
        else if (cross < -1e-9) { if (sign > 0) return false; sign = -1; }
    }
    return true;
}

function _tpCyclePolygon(ids, adj, pts) {
    const core = _tpTwoCore(ids, adj);
    const cycle = _tpOrderSimpleCycle(core, adj);
    if (!cycle) return null;
    return cycle.map(id => pts[id]).filter(Boolean);
}

function _tpCenterInsideOk(ids, adj, pts) {
    const hub = _tpMaxDegreeVertex(ids, adj);
    if (hub === null) return true; // центр не выделен степенью — ленивый пропуск
    const rim = (adj[hub] || []).map(id => pts[id]).filter(Boolean);
    if (rim.length < 3) return true;
    // упорядочить обод по углу вокруг центра
    const c = pts[hub];
    if (!c) return true;
    rim.sort((a, b) => Math.atan2(a.y - c.y, a.x - c.x) - Math.atan2(b.y - c.y, b.x - c.x));
    return _tpPointInPolygon(c, rim);
}

function _tpOutwardTailOk(ids, adj, pts) {
    const poly = _tpCyclePolygon(ids, adj, pts);
    if (!poly || poly.length < 3) return true; // нет чёткого контура — ленивый пропуск
    const core = new Set(_tpTwoCore(ids, adj));
    for (const id of ids) {
        if (core.has(id)) continue;
        if ((adj[id] || []).length !== 1) continue; // конец хвоста
        const p = pts[id];
        if (p && _tpPointInPolygon(p, poly)) return false; // хвост внутрь цикла
    }
    return true;
}

function _tpRayAnglesAroundHub(ids, adj, pts) {
    const hub = _tpMaxDegreeVertex(ids, adj);
    if (hub === null) return null;
    const c = pts[hub];
    if (!c) return null;
    const angs = (adj[hub] || []).map(id => {
        const p = pts[id];
        return p ? Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI : null;
    }).filter(a => a !== null).sort((a, b) => a - b);
    return angs;
}

function _tpSpreadMinOk(ids, adj, pts, minDeg) {
    const angs = _tpRayAnglesAroundHub(ids, adj, pts);
    if (!angs || angs.length < 2) return true;
    for (let i = 0; i < angs.length; i++) {
        const next = angs[(i + 1) % angs.length];
        let gap = next - angs[i];
        if (i === angs.length - 1) gap += 360;
        if (gap < minDeg) return false;
    }
    return true;
}

function _tpFanMaxOk(ids, adj, pts, maxDeg) {
    const angs = _tpRayAnglesAroundHub(ids, adj, pts);
    if (!angs || angs.length < 2) return true;
    // максимальный «пустой» сектор → спицы укладываются в 360 минус он
    let maxGap = 0;
    for (let i = 0; i < angs.length; i++) {
        const next = angs[(i + 1) % angs.length];
        let gap = next - angs[i];
        if (i === angs.length - 1) gap += 360;
        if (gap > maxGap) maxGap = gap;
    }
    return (360 - maxGap) <= maxDeg;
}

function _tpEarsBetweenOk(ids, adj, pts, range) {
    // вершина с двумя листовыми соседями → угол между ушами в диапазоне
    for (const id of ids) {
        const leaves = (adj[id] || []).filter(n => (adj[n] || []).length === 1);
        if (leaves.length >= 2) {
            const q = pts[id], a = pts[leaves[0]], b = pts[leaves[1]];
            if (!q || !a || !b) return true;
            const ang = _tpAngleAt(a, q, b);
            return ang >= range[0] && ang <= range[1];
        }
    }
    return true;
}

/** Проверить ограничения §4 для распознанного имени. */
function validateTopologyConstraints(name, ids, edges, pointResolver) {
    const catalog = _tpGetCatalog();
    const entry = catalog && catalog[name];
    const c = (entry && entry.c) || {};
    const adj = _tpAdjacency(ids, edges);
    const pts = {};
    for (const id of ids) {
        const p = pointResolver(id);
        if (!p) return true; // нет координат — не заваливаем распознавание
        pts[id] = { x: p.x, y: p.y };
    }

    const baseMin = typeof c.baseMin === 'number' ? c.baseMin : TP_BASE_MIN_ANGLE;
    if (!_tpBaseAngleOk(ids, adj, pts, baseMin)) return false;
    if (c.chainAngle && !_tpChainAngleOk(ids, adj, pts, c.chainAngle)) return false;
    if (c.arc && !_tpArcOk(ids, adj, pts)) return false;
    if (typeof c.cycleAngleMin === 'number' && !_tpCycleAngleMinOk(ids, adj, pts, c.cycleAngleMin)) return false;
    if (c.convex && !_tpConvexOk(ids, adj, pts)) return false;
    if (c.centerInside && !_tpCenterInsideOk(ids, adj, pts)) return false;
    if (c.outwardTail && !_tpOutwardTailOk(ids, adj, pts)) return false;
    if (typeof c.spreadMin === 'number' && !_tpSpreadMinOk(ids, adj, pts, c.spreadMin)) return false;
    if (typeof c.fanMax === 'number' && !_tpFanMaxOk(ids, adj, pts, c.fanMax)) return false;
    if (c.earsBetween && !_tpEarsBetweenOk(ids, adj, pts, c.earsBetween)) return false;

    return true;
}

// =============================================================================
// ПУБЛИЧНОЕ API
// =============================================================================

/**
 * Возвращает имя фигуры каталога-29 или null.
 * @param {Iterable} starIds  идентификаторы звёзд
 * @param {Array}    lines    рёбра ({startId,endId} или {a,b})
 * @param {Function} pointResolver  id → {x,y}
 */
function topologyRecognizeName(starIds, lines, pointResolver) {
    const ids = [...starIds];
    if (ids.length < 2 || ids.length > 5) return null; // каталог до 5 звёзд
    const edges = _tpEdges(lines);
    const adj = _tpAdjacency(ids, edges);
    if (!_tpIsConnected(ids, adj)) return null;

    const inv = topologyInvariant(ids, edges);
    const name = _tpIndex()[inv];
    if (!name) return null;

    if (!validateTopologyConstraints(name, ids, edges, pointResolver)) return null;
    return name;
}

// Экспорт для node-проверки.
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        topologyInvariant,
        buildTopologyCatalogIndex,
        topologyRecognizeName,
        validateTopologyConstraints,
        _tpAdjacency,
        _tpTwoCore,
        _tpEdges
    };
}

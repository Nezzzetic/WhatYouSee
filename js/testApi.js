// testApi.js — тестовый харнесс (T-01)
//
// Подключён всегда, активен только при `?test=1`. Без флага модуль выходит на
// первой строке: `window.__test` не создаётся, консоль не перехватывается,
// поведение игры не меняется.
//
// Зачем: проверить сценарий «создать Банан жёлтым → загорелась грань → цепочка
// сдвинулась» руками можно только натыкав звёзды по экранным координатам, а они
// зависят от зума, камеры и раскладки поля. Харнесс даёт программный доступ к
// той же механике через штатный commit-путь
// (`buildConstellationCommitPayload` → `commitConstellationFromPayload`),
// поэтому проверяет игру, а не свою копию правил.
//
// ⚠️ `__test.reset()` — это полный сброс: он стирает локальный прогресс
// (`starsReborn_v03`, `starsReborn_progression`) и, если передан `seed`,
// подменяет playerId. Открывать `?test=1` на профиле, где играют, не стоит.
//
// Эталонный сценарий — `dev/docs/tools/smoke.js`.

(function () {
    'use strict';

    function isTestModeEnabled() {
        try {
            if (typeof window === 'undefined' || !window.location) return false;
            return new URLSearchParams(window.location.search).get('test') === '1';
        } catch (e) {
            return false;
        }
    }

    if (!isTestModeEnabled()) return;

    // =========================================================================
    // ОШИБКИ (перехват ставится до загрузки остальных файлов игры)
    // =========================================================================

    const capturedErrors = [];

    function formatErrorArg(arg) {
        if (arg instanceof Error) return arg.message;
        if (typeof arg === 'string') return arg;
        try {
            return JSON.stringify(arg);
        } catch (e) {
            return String(arg);
        }
    }

    function pushError(kind, message, stack) {
        capturedErrors.push({
            kind,
            message: String(message),
            stack: stack || null,
            atMs: Date.now()
        });
    }

    const nativeConsoleError = console.error.bind(console);
    console.error = function () {
        const args = Array.prototype.slice.call(arguments);
        pushError('console.error', args.map(formatErrorArg).join(' '));
        nativeConsoleError.apply(null, args);
    };

    window.addEventListener('error', function (e) {
        pushError('window.onerror', e.message, e.error && e.error.stack);
    });
    window.addEventListener('unhandledrejection', function (e) {
        const reason = e.reason;
        pushError('unhandledrejection',
            reason instanceof Error ? reason.message : formatErrorArg(reason),
            reason instanceof Error ? reason.stack : null);
    });

    // =========================================================================
    // ХЕЛПЕРЫ
    // =========================================================================

    function fail(message) {
        throw new Error('[__test] ' + message);
    }

    /** Дата: 20260802 | '2026-08-02' | null. */
    function parseDateInput(value) {
        if (value === undefined || value === null || value === '') return null;
        if (typeof value === 'number' && Number.isFinite(value)) return Math.floor(value);
        const s = String(value).trim();
        const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
        if (m) return Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3]);
        const n = Number(s);
        return Number.isFinite(n) ? Math.floor(n) : null;
    }

    function colorBucketOfStar(star) {
        if (!star || typeof constellationColorBucket !== 'function') return null;
        return constellationColorBucket([star.id]);
    }

    function starView(star) {
        return {
            id: star.id,
            x: star.x,
            y: star.y,
            colorValue: star.colorValue,
            color: colorBucketOfStar(star),
            locked: !!star.locked,
            suppressed: !!star.suppressed,
            extinguished: !!star.extinguished,
            free: !star.locked && !star.suppressed && !star.extinguished
        };
    }

    function isFreeStar(star) {
        return !!star && !star.locked && !star.suppressed && !star.extinguished;
    }

    // =========================================================================
    // RESET
    // =========================================================================

    /**
     * @param {{seed?, date?, picture?, pages?}} [options]
     *   seed    — подменяет playerId (раскладка поля, воскресная картинка, цели);
     *   date    — эффективная дата неба (число 20260802 или '2026-08-02');
     *   picture — id поля-картинки (перебивает обычную генерацию), null снимает;
     *   pages   — сколько первых страниц атласа открыть бесплатно (по умолчанию 0,
     *             как у нового игрока: до 80 ✦ имён у фигур нет).
     */
    function reset(options) {
        const o = options || {};

        if (o.seed !== undefined && o.seed !== null) {
            playerId = String(o.seed);
            try {
                localStorage.setItem('starsReborn_playerId', playerId);
            } catch (e) { /* ignore */ }
        }

        setTestSkyDateOverride(parseDateInput(o.date));

        if (typeof setDevPictureFieldId === 'function') {
            setDevPictureFieldId(o.picture ? String(o.picture) : null);
        }

        const requestedPages = Math.floor(Number(o.pages) || 0);
        const pages = Math.max(0, Math.min(ATLAS_PAGE_COUNT, requestedPages));

        performFullReset({
            beforeFieldRegen: function () {
                for (let i = 0; i < pages; i++) unlockedPageIndices.add(i);
            }
        });

        return state();
    }

    // =========================================================================
    // ЗВЁЗДЫ
    // =========================================================================

    /**
     * @param {{free?, color?, near?}} [filter]
     *   free  — только доступные для рисования (не locked/suppressed/extinguished);
     *   color — цветовой бакет ('red' | 'orange' | 'yellow' | 'white' | 'blue');
     *   near  — {x, y, r} или {id, r}: круг вокруг точки/звезды (r по умолчанию maxEdge).
     */
    function stars(filter) {
        const f = filter || {};
        const list = Array.isArray(fieldStars) ? fieldStars : [];

        let center = null;
        let radius = Infinity;
        if (f.near) {
            radius = Number.isFinite(Number(f.near.r)) ? Number(f.near.r) : getMaxEdgeLength();
            if (f.near.id !== undefined) {
                const anchor = getStarById(f.near.id);
                if (!anchor) fail('near.id: звезды ' + f.near.id + ' нет на поле');
                center = { x: anchor.x, y: anchor.y };
            } else {
                center = { x: Number(f.near.x), y: Number(f.near.y) };
            }
        }

        const out = [];
        for (const star of list) {
            if (!star) continue;
            if (f.free && !isFreeStar(star)) continue;
            if (f.color && colorBucketOfStar(star) !== f.color) continue;
            if (center && Math.hypot(star.x - center.x, star.y - center.y) > radius) continue;
            out.push(starView(star));
        }
        return out;
    }

    // =========================================================================
    // КОММИТ СОЗВЕЗДИЯ
    // =========================================================================

    /** spec: [1,2,3] — цепочка (1-2, 2-3), либо [[1,2],[2,3]] — явные рёбра. */
    function specToEdges(spec) {
        if (!Array.isArray(spec) || spec.length === 0) fail('connect: нужен массив id или рёбер');

        if (Array.isArray(spec[0])) {
            return spec.map(pair => {
                if (!Array.isArray(pair) || pair.length !== 2) fail('connect: ребро — это пара [a, b]');
                return [Number(pair[0]), Number(pair[1])];
            });
        }

        if (spec.length < 2) fail('connect: в цепочке нужно минимум 2 звезды');
        const edges = [];
        for (let i = 1; i < spec.length; i++) {
            edges.push([Number(spec[i - 1]), Number(spec[i])]);
        }
        return edges;
    }

    /**
     * Собирает lines и коммитит их штатным путём (те же правила рёбер, что у пальца:
     * длина ≤ maxEdge, без пересечений). Возвращает сводку по созданному созвездию.
     */
    function connect(spec) {
        const edges = specToEdges(spec);
        const lines = [];

        for (const [a, b] of edges) {
            const starA = getStarById(a);
            const starB = getStarById(b);
            if (!starA || !starB) fail('connect: нет звезды ' + (starA ? b : a));
            if (!isFreeStar(starA)) fail('connect: звезда ' + a + ' недоступна (locked/suppressed/extinguished)');
            if (!isFreeStar(starB)) fail('connect: звезда ' + b + ' недоступна (locked/suppressed/extinguished)');
            if (!canAddConstellationEdge(a, b, lines)) {
                fail('connect: ребро ' + a + '-' + b + ' нельзя провести (длина или пересечение)');
            }
            lines.push({ startId: a, endId: b });
        }

        const payload = buildConstellationCommitPayload(lines);
        if (!payload) fail('connect: не удалось собрать payload');
        commitConstellationFromPayload(payload);

        const created = constellations[constellations.length - 1];
        const ids = [...collectStarIdsFromLines(created.lines)];
        return {
            shape: created.shape,
            name: created.name,
            starCount: created.starCount,
            atlasCollected: !!created.atlasCollected,
            color: constellationColorBucket(ids),
            starIds: ids,
            recognizedClass: created.recognizedClass
        };
    }

    function undo() {
        const before = constellations.length;
        undoLastConstellation();
        return { undone: constellations.length < before, constellations: constellations.length };
    }

    // =========================================================================
    // ПОИСК ФИГУРЫ НА ПОЛЕ
    // =========================================================================
    //
    // Сценарий не должен зависеть от раскладки: вместо «соедини 12-47-89» он
    // просит фигуру по имени. Ищем вложение графа фигуры в поле перебором с
    // отсечениями (каждая следующая вершина берётся из соседей уже размещённой),
    // а найденное подтверждаем штатным распознавателем — так ограничения углов §4
    // проверяет игра, а не харнесс.

    const FIND_SHAPE_STEP_BUDGET = 200000;

    /** Порядок обхода вершин паттерна: каждая следующая связана с уже размещёнными. */
    function buildSearchOrder(patternAdj, vertexCount) {
        const degree = i => patternAdj[i].length;
        const order = [];
        const placed = new Set();

        let first = 0;
        for (let i = 1; i < vertexCount; i++) {
            if (degree(i) > degree(first)) first = i;
        }
        order.push(first);
        placed.add(first);

        while (order.length < vertexCount) {
            let best = -1;
            let bestAnchors = -1;
            for (let i = 0; i < vertexCount; i++) {
                if (placed.has(i)) continue;
                const anchors = patternAdj[i].filter(u => placed.has(u)).length;
                if (anchors > bestAnchors || (anchors === bestAnchors && best >= 0 && degree(i) > degree(best))) {
                    best = i;
                    bestAnchors = anchors;
                }
            }
            order.push(best);
            placed.add(best);
        }
        return order;
    }

    /**
     * L-01: принимает **только ASCII-ID** фигуры ('banana'), не локализованное
     * имя. Тест не должен зависеть от языка: со сменой локали ID не меняется,
     * а «Банан»/«Banana» — меняется.
     *
     * @param {string} name ID фигуры каталога-29
     * @returns {{name, starIds, edges, visibleInAtlas, duplicateOnField} | null}
     */
    function findShape(name) {
        const pattern = typeof CATALOG_29 !== 'undefined' ? CATALOG_29[name] : null;
        if (!pattern) fail('findShape: ID «' + name + '» нет в каталоге-29 (нужен ASCII-ID, не имя)');

        const vertexCount = pattern.stars.length;
        const patternAdj = [];
        for (let i = 0; i < vertexCount; i++) patternAdj.push([]);
        for (const [a, b] of pattern.lines) {
            patternAdj[a].push(b);
            patternAdj[b].push(a);
        }

        const free = (Array.isArray(fieldStars) ? fieldStars : []).filter(isFreeStar);
        if (free.length < vertexCount) return null;

        const maxEdge = getMaxEdgeLength();
        const neighborsCache = new Map();
        function neighborsOf(starId) {
            if (neighborsCache.has(starId)) return neighborsCache.get(starId);
            const anchor = getStarById(starId);
            const list = free.filter(s => s.id !== starId
                && Math.hypot(s.x - anchor.x, s.y - anchor.y) <= maxEdge + 1e-6);
            neighborsCache.set(starId, list);
            return list;
        }

        const order = buildSearchOrder(patternAdj, vertexCount);
        const mapping = new Array(vertexCount).fill(-1);
        const used = new Set();
        let steps = 0;
        let found = null;

        function verifyFullMapping() {
            const lines = pattern.lines.map(([a, b]) => ({ startId: mapping[a], endId: mapping[b] }));
            const ids = new Set(mapping);
            const recognition = recognizeShapeDetailed(lines, ids);
            if (!recognition || recognition.label !== name) return false;
            found = {
                name,
                starIds: [...ids],
                edges: pattern.lines.map(([a, b]) => [mapping[a], mapping[b]]),
                visibleInAtlas: typeof isShapeVisibleInAtlas === 'function' && isShapeVisibleInAtlas(name),
                duplicateOnField: typeof isAtlasShapeAlreadyOnField === 'function' && isAtlasShapeAlreadyOnField(name)
            };
            return true;
        }

        function search(position, draftLines) {
            if (found) return true;
            if (position === order.length) return verifyFullMapping();

            const vertex = order[position];
            const anchors = patternAdj[vertex].filter(u => mapping[u] >= 0);
            const candidates = anchors.length > 0 ? neighborsOf(mapping[anchors[0]]) : free;

            for (const candidate of candidates) {
                if (steps++ > FIND_SHAPE_STEP_BUDGET) return false;
                if (used.has(candidate.id)) continue;

                const newLines = [];
                let ok = true;
                for (const anchor of anchors) {
                    if (!canAddConstellationEdge(mapping[anchor], candidate.id, draftLines.concat(newLines))) {
                        ok = false;
                        break;
                    }
                    newLines.push({ startId: mapping[anchor], endId: candidate.id });
                }
                if (!ok) continue;

                mapping[vertex] = candidate.id;
                used.add(candidate.id);
                if (search(position + 1, draftLines.concat(newLines))) return true;
                used.delete(candidate.id);
                mapping[vertex] = -1;
            }
            return false;
        }

        search(0, []);
        return found;
    }

    // =========================================================================
    // СОСТОЯНИЕ
    // =========================================================================

    function chainsDump() {
        const out = {};
        for (const chain of ACHIEVEMENT_CHAINS) {
            const progress = achievementProgress[chain.id];
            if (!progress) continue;
            const stepIndex = progress.stepIndex;
            const step = chain.steps[stepIndex] || null;
            out[chain.id] = {
                stepIndex,
                total: chain.steps.length,
                claimable: !!progress.claimable,
                progress: step ? getAchievementStepProgress(step.check) : null,
                reward: step ? getAchievementChainStepReward(chain, stepIndex) : 0
            };
        }
        return out;
    }

    function shapeColorsDump() {
        const raw = (achievementCounters && achievementCounters.shapeColors) || {};
        const out = {};
        for (const shapeName of Object.keys(raw)) {
            out[shapeName] = {
                counts: Object.assign({}, raw[shapeName]),
                facets: shapeFacetCount(shapeName),
                faceted: isShapeFaceted(shapeName)
            };
        }
        return out;
    }

    function state() {
        return {
            score: getMetaScore(),
            fieldScore: typeof getFieldScore === 'function' ? getFieldScore() : 0,
            skyDate: getEffectiveSkyDateInt(),
            playerId,
            pictureFieldId: typeof getActivePictureFieldId === 'function' ? getActivePictureFieldId() : null,
            dailyTargets: getDailyTargetShapes(),
            starCount: Array.isArray(fieldStars) ? fieldStars.length : 0,
            freeStarCount: getPlayableStars().length,
            levelComplete: !!constellationArtRevealed,
            constellations: constellations.map(c => ({
                shape: c.shape,
                name: c.name,
                starCount: c.starCount,
                atlasCollected: !!c.atlasCollected
            })),
            createdShapes: [...createdShapes].sort(),
            createdAtlasShapeCount: getCreatedAtlasShapeCount(),
            facetedShapeCount: getFacetedShapeCount(),
            shapeColors: shapeColorsDump(),
            atlasPagesOpen: [...unlockedPageIndices].sort((a, b) => a - b),
            chains: chainsDump(),
            undoFloor,
            // L-01: язык рядом с версиями сейва — сценарий должен видеть, в какой
            // локали он прогнался, не разбирая URL сам.
            locale: typeof getLocale === 'function' ? getLocale() : null,
            saveVersion: {
                achievements: ACHIEVEMENTS_SAVE_VERSION,
                catalog: CATALOG_SAVE_VERSION
            }
        };
    }

    function claim(chainId) {
        const before = getMetaScore();
        const ok = claimAchievementStep(chainId);
        return { claimed: !!ok, scoreBefore: before, scoreAfter: getMetaScore() };
    }

    function ui() {
        const badge = document.getElementById('peekRewardsBadge');
        return {
            sheetOpen,
            section: sheetSection,
            page: getSheetPageIndex(),
            pageCount: getSheetPageCount(sheetSection),
            rewardsBadge: !!(badge && !badge.hidden),
            hasClaimable: hasClaimableAchievements()
        };
    }

    function errors() {
        return capturedErrors.map(e => Object.assign({}, e));
    }

    function clearErrors() {
        capturedErrors.length = 0;
    }

    // =========================================================================
    // ЭКСПОРТ
    // =========================================================================

    window.__test = {
        version: 'T-01',
        reset,
        stars,
        connect,
        findShape,
        undo,
        state,
        claim,
        ui,
        errors,
        clearErrors,
        // Служебное: открыть/закрыть шторку без жеста (жесты — уровень MobAI).
        openSheet: section => { openSheet(section); return ui(); },
        closeSheet: () => { closeSheet(); return ui(); }
    };

    console.info('[test] Харнесс активен: window.__test. reset() стирает локальный прогресс.');
}());

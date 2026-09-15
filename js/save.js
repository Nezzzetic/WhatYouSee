// save.js — Save/load game state via localStorage

// L-01: v02 → v03. В сохранённом небе лежат `constellations[].shape/name`
// русскими именами — после перехода на ASCII-ID они не резолвятся ни в SHAPES,
// ни в атласе. Новый ключ означает чистое небо.
// R-04: чистка старого ключа `starsReborn_v02` при загрузке снята — после L-01
// прошло полтора месяца, а забытый ключ ни на что не влияет.
const SAVE_KEY = 'starsReborn_v03';

// =============================================================================
// SAVE
// =============================================================================

function saveGame() {
    try {
        // R-03: totalScore, bestScore, uniqueShapesFound, bonusAwardedClasses
        // и customTypes из сейва неба сняты вместе со старым счётом. Версия не
        // поднимается: сейв прошлой версии с этими полями читается как раньше,
        // поля просто игнорируются и умирают со сменой суток.
        const state = {
            constellations,
            fieldStars,
            fieldBackgroundStars,
            constellationArtRevealed,
            skyDate: getEffectiveSkyDateInt(),
            // R-04: `dailyTargetShapes` снят вместе с якорями M-03. Сейв тех же
            // суток с этим полем читается как раньше — поле просто игнорируется.
            // M-10: память имён отменённых созвездий. Поле необязательное —
            // версия сейва из-за него не поднимается: сохранение без него
            // читается как ночь, в которой ещё ничего не отменяли.
            undoneConstellationNames: typeof dumpUndoneNameMemory === 'function'
                ? dumpUndoneNameMemory()
                : []
            // M-05: `levelCompletePointsAwarded` убран вместе с выплатой за ночь.
            // «Ночь уже оплачена» теперь живёт в блоке суток достижений и привязано
            // к дате, а не к сессии поля: дев-сброс неба больше не позволяет
            // забрать награду за те же сутки второй раз.
        };
        localStorage.setItem(SAVE_KEY, JSON.stringify(state));
    } catch (e) {
        console.warn('Save failed:', e);
    }
}

function autoSave() {
    saveGame();
}

// =============================================================================
// LOAD
// =============================================================================

function isSavedSkyDateStale(savedSkyDate) {
    if (typeof savedSkyDate !== 'number') return true;
    return savedSkyDate !== getEffectiveSkyDateInt();
}

function loadGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;

        const state = JSON.parse(raw);

        if (isSavedSkyDateStale(state.skyDate)) {
            return false;
        }

        constellations = state.constellations || [];
        fieldStars = state.fieldStars || [];
        fieldBackgroundStars = (state.fieldBackgroundStars || []).map(s =>
            s.phase !== undefined ? s : { ...s, phase: Math.random() * Math.PI * 2 }
        );
        constellationArtRevealed =
            state.constellationArtRevealed !== undefined ? !!state.constellationArtRevealed : true;

        // M-10: память имён отменённых созвездий переживает F5 — сейв тех же
        // суток, значит и поле, и id звёзд те же, и ключи всё ещё указывают
        // на настоящие связки.
        if (typeof restoreUndoneNameMemory === 'function') {
            restoreUndoneNameMemory(state.undoneConstellationNames);
        }

        rebuildStarCountStateFromConstellations();

        for (const star of fieldStars) {
            if (!star) continue;
            if (typeof star.extinguished !== 'boolean') star.extinguished = false;
            if (typeof star.sizeFactor !== 'number') star.sizeFactor = 1;
            if (typeof star.colorValue !== 'number' || !Number.isFinite(star.colorValue)) {
                star.colorValue = pickRandomStarColorValue();
            }
            // Совместимость со старыми сохранениями: назначить случайный appearDelay
            if (typeof star.appearDelay !== 'number') {
                star.appearDelay = Math.random() * STAR_APPEAR_DELAY_MAX;
            }
            // K-03: то же для дыхания. Параметры считаются от места звезды,
            // так что старое небо задышит ровно так же, как если бы его
            // сгенерировали сегодня. Версия сейва не поднимается.
            if (typeof star.twinklePeriodMs !== 'number') {
                assignStarTwinkleTo(star);
            }
        }

        normalizeAtlasCollectedOnField();

        for (const c of constellations) {
            if (constellationArtRevealed && Array.isArray(c.lines) && c.lines.length > 0) {
                const fallbackStarIds = new Set();
                for (const seg of c.lines) {
                    if (!seg) continue;
                    fallbackStarIds.add(seg.startId);
                    fallbackStarIds.add(seg.endId);
                }
                c.labelAnchor = computeConstellationLabelAnchor(c.lines, fallbackStarIds, c.name || c.shape);
            }
            // V-03: lineColor не сохраняется — пересчитываем при загрузке
            if (Array.isArray(c.lines) && c.lines.length > 0) {
                const ids = collectStarIdsFromLines(c.lines);
                c.lineColor = colorValueToRgb(getMeanColorValue([...ids]));
            }
        }

        recomputeAtlasCollectedStarColors();
        recomputeSuppressedStars();

        // V-13: без сцены финала — она принадлежит моменту завершения ночи,
        // а не её состоянию, и после перезагрузки играться не должна.
        tryRevealConstellationArtIfComplete(false);

        return true;
    } catch (e) {
        console.warn('Load failed:', e);
        return false;
    }
}

// =============================================================================
// UTILITIES
// =============================================================================

function hasSavedGame() {
    try {
        const raw = localStorage.getItem(SAVE_KEY);
        if (!raw) return false;
        const state = JSON.parse(raw);
        return !isSavedSkyDateStale(state.skyDate);
    } catch (e) {
        return false;
    }
}

function clearSave() {
    localStorage.removeItem(SAVE_KEY);
}

// save.js — Save/load game state via localStorage

const SAVE_KEY = 'starsReborn_v02';

// =============================================================================
// SAVE
// =============================================================================

function saveGame() {
    try {
        const state = {
            totalScore,
            uniqueShapesFound: [...uniqueShapesFound],
            bonusAwardedClasses: [...bonusAwardedClasses],
            constellations,
            fieldStars,
            fieldBackgroundStars,
            customTypes,
            fieldGoalsAchieved,
            fieldGoalRewardsClaimed,
            bestScore,
            constellationArtRevealed,
            skyDate: getEffectiveSkyDateInt(),
            dailyTargetShapes: getDailyTargetShapes(),
            levelCompletePointsAwarded,
            shapesOpenedThisLevel: [...shapesOpenedThisLevel]
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

        totalScore = state.totalScore || 0;
        constellations = state.constellations || [];
        uniqueShapesFound = new Set(
            constellations.map(c => c.recognizedClass || c.shape).filter(Boolean)
        );
        bonusAwardedClasses = new Set(state.bonusAwardedClasses || []);
        if (bonusAwardedClasses.size === 0) {
            bonusAwardedClasses = new Set(
                constellations
                    .map(c => c.recognizedClass || c.shape)
                    .filter(Boolean)
            );
        }
        fieldStars = state.fieldStars || [];
        fieldBackgroundStars = (state.fieldBackgroundStars || []).map(s =>
            s.phase !== undefined ? s : { ...s, phase: Math.random() * Math.PI * 2 }
        );
        constellationArtRevealed =
            state.constellationArtRevealed !== undefined ? !!state.constellationArtRevealed : true;
        customTypes = state.customTypes || [];
        fieldGoalsAchieved = Array.isArray(state.fieldGoalsAchieved)
            ? state.fieldGoalsAchieved
            : [false, false, false];
        fieldGoalRewardsClaimed = Array.isArray(state.fieldGoalRewardsClaimed)
            ? state.fieldGoalRewardsClaimed
            : [false, false, false];
        bestScore = Math.max(state.bestScore || 0, getFieldScore());
        resetRecordScoreBadge();
        levelCompletePointsAwarded = !!state.levelCompletePointsAwarded;
        shapesOpenedThisLevel = Array.isArray(state.shapesOpenedThisLevel)
            ? state.shapesOpenedThisLevel.slice()
            : [];
        if (typeof sanitizeShapesOpenedThisLevel === 'function') {
            sanitizeShapesOpenedThisLevel();
        }

        rebuildStarCountStateFromConstellations();

        dailyTargetShapes = Array.isArray(state.dailyTargetShapes)
            ? state.dailyTargetShapes.slice()
            : [];
        if (dailyTargetShapes.length === 0) {
            pickDailyTargets();
        }

        for (const ct of customTypes) {
            registerCustomType(ct.name, ct.color, ct.signature, ct.patternSnapshot || null);
        }

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
        }

        normalizeAtlasCollectedOnField();

        for (const c of constellations) {
            const shapeName = c.shape || c.name;
            if (c.atlasCollected || constellationArtRevealed) {
                assignConstellationImageTransform(c);
            } else {
                c.imageTransform = null;
            }
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

        tryRevealConstellationArtIfComplete();

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

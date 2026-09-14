// scoring.js — Scoring system, points calculation, game state

// =============================================================================
// GLOBAL GAME STATE
// =============================================================================

// R-03: старый подсчёт очков (totalScore, bestScore и значок рекорда,
// uniqueShapesFound, bonusAwardedClasses) снят — после S-01/M-05 он только
// пополнялся и уменьшался при откате, но ни во что не превращался.
let floatingScores = [];
let constellations = [];
let claimedStarCounts = new Set();

function resetStarCountBonusState() {
    claimedStarCounts = new Set();
}

function rebuildStarCountStateFromConstellations() {
    const seenForSpecial = new Set();
    claimedStarCounts = new Set();

    for (const c of constellations) {
        const n = typeof c.starCount === 'number' ? c.starCount : 0;
        const isSpecial = n > 1 && !seenForSpecial.has(n);
        if (n > 1) {
            seenForSpecial.add(n);
            claimedStarCounts.add(n);
        }
        c.isFirstStarCountOnField = isSpecial;
    }
}

function pushConstellationSizeCommitFloater(worldX, worldY, starCount, isSpecial) {
    const n = typeof starCount === 'number' ? starCount : 0;
    if (n < 1 || typeof worldX !== 'number' || typeof worldY !== 'number') return;

    const text = isSpecial ? `✦ ${n}★` : `${n}★`;
    floatingScores.push({
        x: worldX,
        y: worldY,
        text,
        startTime: millis(),
        color: isSpecial ? [255, 220, 140] : [210, 220, 240]
    });
}

function registerStarCountOnCommit(starCount) {
    const n = typeof starCount === 'number' ? starCount : 0;
    const isSpecial = n > 1 && !claimedStarCounts.has(n);
    if (n > 1) claimedStarCounts.add(n);
    return { isSpecial };
}

// S-01: очки за атласные фигуры ночи убраны — первое создание фигуры
// вознаграждается шагом 1 её цепочки достижений прямо на коммите.
// M-05: последняя прямая выплата за небо (`awardEndOfLevelPoints` /
// `awardLevelCompletePointsIfNeeded` и золотой флоатер «+30» в центре поля)
// тоже убрана. Закрытая ночь теперь взводит защёлку суточного квеста
// «Ночь закрыта», а ✦ игрок забирает кнопкой в Наградах.

/** Созвездий на поле. Живёт ради харнесса (`__test.state().fieldScore`). */
function getFieldScore() {
    return constellations.length;
}

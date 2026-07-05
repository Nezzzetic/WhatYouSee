// scoring.js — Scoring system, points calculation, game state

// =============================================================================
// GLOBAL GAME STATE
// =============================================================================

let totalScore = 0;
let uniqueShapesFound = new Set();
let bonusAwardedClasses = new Set();
let floatingScores = [];
let constellations = [];
let fieldGoalsAchieved = [false, false, false];
let fieldGoalRewardsClaimed = [false, false, false];
let bestScore = 0;
let recordScoreBadgeActive = false;
let levelCompletePointsAwarded = false;
let shapesOpenedThisLevel = [];
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

function resetShapesOpenedThisLevel() {
    shapesOpenedThisLevel = [];
}

function sanitizeShapesOpenedThisLevel() {
    if (!Array.isArray(shapesOpenedThisLevel) || shapesOpenedThisLevel.length === 0) return;
    shapesOpenedThisLevel = shapesOpenedThisLevel.filter(name => {
        const normalized = typeof name === 'string' ? name.trim() : '';
        if (!normalized) return false;
        return typeof isShapeVisibleInAtlas === 'function' && isShapeVisibleInAtlas(normalized);
    });
}

function trackShapeOpenedThisLevel(shapeName) {
    const normalized = typeof shapeName === 'string' ? shapeName.trim() : '';
    if (!normalized) return;
    if (typeof isShapeVisibleInAtlas !== 'function' || !isShapeVisibleInAtlas(normalized)) return;
    if (isShapeCreated(normalized)) return;
    if (shapesOpenedThisLevel.includes(normalized)) return;
    shapesOpenedThisLevel.push(normalized);
}

function untrackShapeOpenedThisLevel(shapeName) {
    const normalized = typeof shapeName === 'string' ? shapeName.trim() : '';
    if (!normalized) return;
    const stillOnField = constellations.some(c => {
        const sc = c.recognizedClass || c.shape;
        return sc === normalized;
    });
    if (stillOnField) return;
    shapesOpenedThisLevel = shapesOpenedThisLevel.filter(n => n !== normalized);
}

function awardShapeOpenPointsForLevel() {
    sanitizeShapesOpenedThisLevel();
    const perShape = typeof SHAPE_OPEN_POINTS === 'number' ? SHAPE_OPEN_POINTS : 25;
    let total = 0;

    for (const name of shapesOpenedThisLevel) {
        if (typeof isShapeVisibleInAtlas === 'function' && !isShapeVisibleInAtlas(name)) continue;
        total += perShape;
        markShapeCreated(name);
    }
    shapesOpenedThisLevel = [];

    if (total > 0) {
        awardMetaScore(total);
        const cx = FIELD_WIDTH / 2;
        const cy = FIELD_HEIGHT / 2 - 40;
        floatingScores.push({
            x: cx,
            y: cy,
            text: `+${total}`,
            startTime: millis(),
            color: [180, 220, 255]
        });
    }

    return total;
}

function awardEndOfLevelPoints() {
    const shapePts = awardShapeOpenPointsForLevel();
    const levelPts = awardLevelCompletePointsIfNeeded();
    return {
        shapePts,
        levelPts,
        total: shapePts + levelPts
    };
}

function getFieldScore() {
    return constellations.length;
}

function awardLevelCompletePointsIfNeeded() {
    if (levelCompletePointsAwarded) return 0;
    levelCompletePointsAwarded = true;
    const amount = typeof LEVEL_COMPLETE_POINTS === 'number' ? LEVEL_COMPLETE_POINTS : 25;
    const awarded = awardMetaScore(amount);
    if (awarded > 0) {
        const cx = FIELD_WIDTH / 2;
        const cy = FIELD_HEIGHT / 2;
        floatingScores.push({
            x: cx,
            y: cy,
            text: `+${awarded}`,
            startTime: millis(),
            color: [255, 215, 0]
        });
    }
    return awarded;
}

function updateBestScoreFromFieldScore() {
    const fieldScore = getFieldScore();
    if (fieldScore > bestScore) {
        bestScore = fieldScore;
        recordScoreBadgeActive = true;
        return true;
    }
    return false;
}

function resetRecordScoreBadge() {
    recordScoreBadgeActive = false;
}

function checkFieldGoals() {
    const fieldScore = getFieldScore();
    const result = { newlyAchievedGoals: [] };

    for (let i = 0; i < FIELD_GOAL_THRESHOLDS.length; i++) {
        if (fieldScore >= FIELD_GOAL_THRESHOLDS[i] && !fieldGoalsAchieved[i]) {
            fieldGoalsAchieved[i] = true;
            result.newlyAchievedGoals.push(i);
        }
    }

    return result;
}

function getFieldGoalRewardXP(goalIndex) {
    return FIELD_GOAL_XP_REWARDS[goalIndex] || 0;
}

function canClaimFieldGoalReward(goalIndex) {
    if (goalIndex < 0 || goalIndex >= FIELD_GOAL_THRESHOLDS.length) return false;
    return !!fieldGoalsAchieved[goalIndex] && !fieldGoalRewardsClaimed[goalIndex];
}

function claimFieldGoalReward(goalIndex) {
    const result = { xpGained: 0, goalIndex, leveledUp: false, newLevel: playerLevel };
    if (!canClaimFieldGoalReward(goalIndex)) return result;

    const rewardXP = getFieldGoalRewardXP(goalIndex);
    if (rewardXP <= 0) return result;

    const xpResult = awardXPForFieldGoal(rewardXP);
    fieldGoalRewardsClaimed[goalIndex] = true;
    result.xpGained = xpResult.xpGained;
    result.leveledUp = xpResult.leveledUp;
    result.newLevel = xpResult.newLevel;
    return result;
}

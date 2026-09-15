// bookStamps.js — страница штампов K-12: главы сцепок и замок главы (R-05).
// Данные глав (REWARD_PAGES) — в achievements.js, строки сцепок — в ui.js.

/** K-12: неразрезанная глава штампов — тот же нож и та же заглушка, что у атласа. */
function createRewardPageLockedNotice(pageIndex) {
    const locked = document.createElement('div');
    locked.className = 'atlas-page-locked';
    const cost = getRewardPageUnlockCost(pageIndex);

    const lockedText = document.createElement('p');
    lockedText.textContent = t('stamps.chapterLocked', { n: getRewardPageUnlockLevel(pageIndex) });
    locked.appendChild(lockedText);

    const progressText = document.createElement('p');
    progressText.className = 'atlas-page-locked-progress';
    progressText.textContent = t('stamps.chapterLockedProgress', {
        current: Math.min(getLifetimeMetaEarned(), cost),
        target: cost
    });
    locked.appendChild(progressText);

    return locked;
}

function renderAchievementsList() {
    const list = document.getElementById('achievementsList');
    if (!list) return;
    list.innerHTML = '';
    const pageIndex = getBookPageIndex('rewards');
    if (!isRewardPageUnlocked(pageIndex)) {
        list.appendChild(createRewardPageLockedNotice(pageIndex));
        return;
    }
    for (const chain of getRewardPageChains(pageIndex)) {
        list.appendChild(createAchievementRow(chain));
    }
}

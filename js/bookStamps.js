// bookStamps.js — страница штампов K-12: главы сцепок и замок главы (R-05).
// Данные глав (REWARD_PAGES) — в achievements.js, строки сцепок — в ui.js.

/** K-12: неразрезанная глава штампов — тот же нож и та же заглушка, что у атласа. */
function createRewardPageLockedNotice(pageIndex) {
    const locked = document.createElement('div');
    locked.className = 'atlas-page-locked';

    const lockedText = document.createElement('p');
    fillLevelLockText(lockedText, 'stamps.chapterLocked', getRewardPageUnlockLevel(pageIndex));
    locked.appendChild(lockedText);

    return locked;
}

/**
 * O-13: пока первое небо не пройдено, печатей нет ни в одной главе — тот же
 * вид заглушки, что у главы под уровнем, но без уровня: «Opens later.»
 * (решение заказчика — ни слова про «первое небо»).
 */
function createFirstSkyLockedNotice() {
    const locked = document.createElement('div');
    locked.className = 'atlas-page-locked';
    const lockedText = document.createElement('p');
    lockedText.textContent = t('stamps.firstSkyLocked');
    locked.appendChild(lockedText);
    return locked;
}

function renderAchievementsList() {
    const list = bookPart('achievementsList');
    if (!list) return;
    list.innerHTML = '';
    const pageIndex = getBookPageIndex('rewards');
    if (areSealsLocked()) {
        list.appendChild(createFirstSkyLockedNotice());
        return;
    }
    if (!isRewardPageUnlocked(pageIndex)) {
        list.appendChild(createRewardPageLockedNotice(pageIndex));
        return;
    }
    for (const chain of getRewardPageChains(pageIndex)) {
        list.appendChild(createAchievementRow(chain));
    }
}

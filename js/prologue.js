// prologue.js — Пролог (S-07): уровни-небеса рядом с небом дня.
//
// Небес два рода: небо дня `day:<дата>` (общее, M-14) и уровни Пролога
// `prologue:<n>` (слоты S-05). Поле есть у двух уровней — 1 «Кот», 2 «Близнецы»;
// 3–7 — «coming soon», слотов у них нет и не заводится. Пролог от даты не
// зависит: поле уровня засевается `prologue:<n>`, одинаково у всех игроков.
//
// Что на экране, живёт в прогрессии: `achievementCounters.activeSky` — 'day' или
// 'prologue:<n>'; пройденные уровни — `achievementCounters.prologuePassed`.
// Пройден = раскрыт (`revealConstellationArt`), то же событие, что закрывает
// небо дня. Пройденный уровень не переигрывается: его слот живёт, пока он на
// экране (финальный кадр после F5), и стирается при уходе.
//
// ⚠ Инвариант «слот под небом»: род неба на экране и активный слот S-05 всегда
// одного рода — autoSave пишет в активный слот. Небо дня появляется на экране
// только через selectSky(день), startNewDailySky (первым делом снимает
// закрепление) и запуск при activeSky = 'day'.

const PROLOGUE_LEVEL_COUNT = SKY_SLOT_PROLOGUE_MAX;
// Уровни с полем: индекс = n − 1. Порядок — часть содержания Пролога.
// O-12: уровень 1 нового игрока — маленькое обучающее небо «Голова кота».
const PROLOGUE_PICTURE_IDS = ['cat-head', 'gemini'];
// O-12: старый игрок (тутор пройден) остаётся на полном Коте — нового неба
// для него не существует (решение заказчика, вариант A). Выбор — в момент
// генерации; сохранённый слот грузится как есть, какая бы раскладка в нём ни была.
const PROLOGUE_LEGACY_LEVEL1_PICTURE_ID = 'cat';
// Раскладки, на которых живёт тутор: пара берётся по раскладке на экране.
const PROLOGUE_TUTOR_PICTURE_IDS = ['cat-head', PROLOGUE_LEGACY_LEVEL1_PICTURE_ID];
// Первые ночи O-02 — историческая пара картинок, которую сверяет миграция
// wipeUnfinishedFirstNight. Не PROLOGUE_PICTURE_IDS: тот с O-12 другой.
const O02_FIRST_NIGHT_PICTURE_IDS = ['cat', 'gemini'];

// Тип неба последнего раскрытия — читает аналитика (`night_completed`, `k`).
// Вне сейва: событие шлётся опросом в той же сессии, что и раскрытие.
let lastRevealedSkyKind = null;

function getLastRevealedSkyKind() {
    return lastRevealedSkyKind;
}

function sanitizeProloguePassed(raw) {
    if (!Array.isArray(raw)) return [];
    const out = [];
    for (const v of raw) {
        if (typeof v !== 'number' || !Number.isInteger(v)) continue;
        if (v < 1 || v > PROLOGUE_LEVEL_COUNT) continue;
        if (out.indexOf(v) === -1) out.push(v);
    }
    return out.sort((a, b) => a - b);
}

function parsePrologueSkyId(sky) {
    if (typeof sky !== 'string') return 0;
    const m = /^prologue:(\d)$/.exec(sky);
    if (!m) return 0;
    const n = Number(m[1]);
    return n >= 1 && n <= PROLOGUE_LEVEL_COUNT ? n : 0;
}

function getProloguePassed() {
    const ac = typeof achievementCounters !== 'undefined' ? achievementCounters : null;
    return ac && Array.isArray(ac.prologuePassed) ? ac.prologuePassed.slice() : [];
}

function isPrologueLevelPassed(n) {
    return getProloguePassed().indexOf(n) !== -1;
}

/** 'passed' | 'available' | 'locked' | 'soon'; null — нет такого уровня. */
function getPrologueLevelState(n) {
    if (!Number.isInteger(n) || n < 1 || n > PROLOGUE_LEVEL_COUNT) return null;
    if (n > PROLOGUE_PICTURE_IDS.length) return 'soon';
    if (isPrologueLevelPassed(n)) return 'passed';
    if (n === 1 || isPrologueLevelPassed(n - 1)) return 'available';
    return 'locked';
}

/**
 * Значение activeSky, пригодное к показу, или 'day'. Уровень Пролога годится,
 * если он доступен или пройден (пройденный на экране — финальный кадр);
 * есть ли у пройденного слот, решает запуск (resolveLaunchSky).
 */
function sanitizeActiveSky(raw, passed) {
    if (raw === 'day') return 'day';
    const n = parsePrologueSkyId(raw);
    if (!n || n > PROLOGUE_PICTURE_IDS.length) return 'day';
    const done = Array.isArray(passed) ? passed : [];
    if (done.indexOf(n) !== -1) return raw;
    if (n === 1 || done.indexOf(n - 1) !== -1) return raw;
    return 'day';
}

/** 'day' | 'prologue:<n>' — небо на экране (по прогрессии). */
function getActiveSky() {
    const ac = typeof achievementCounters !== 'undefined' ? achievementCounters : null;
    return ac && typeof ac.activeSky === 'string' ? ac.activeSky : 'day';
}

function getActivePrologueLevel() {
    return parsePrologueSkyId(getActiveSky());
}

/** 'day' | 'prologue' — род неба на экране. */
function getActiveSkyKind() {
    return getActivePrologueLevel() ? 'prologue' : 'day';
}

function setActiveSkyValue(sky) {
    if (typeof achievementCounters === 'undefined' || !achievementCounters) return;
    achievementCounters.activeSky = sky;
}

/**
 * Раскрытие неба: на дне — тип для аналитики, на Прологе — ещё и «пройден».
 * Зовётся из recordAchievementReveal (achievements.js) в тот же момент.
 */
function notePrologueOrDayRevealed() {
    const n = getActivePrologueLevel();
    lastRevealedSkyKind = n ? 'prologue' : 'day';
    if (!n || typeof achievementCounters === 'undefined' || !achievementCounters) return;
    const passed = sanitizeProloguePassed(achievementCounters.prologuePassed);
    if (passed.indexOf(n) === -1) passed.push(n);
    achievementCounters.prologuePassed = passed.sort((a, b) => a - b);
}

// =============================================================================
// ПОЛЕ УРОВНЯ
// =============================================================================

/**
 * Поле уровня n: раскладка картинки, засеянная `prologue:<n>` — размеры звёзд,
 * задержки появления и пыль одинаковы у всех и не зависят от даты.
 */
function generatePrologueField(n) {
    const id = getPrologueLevelPictureId(n);
    randomSeed(hashStringToSeed('prologue:' + n));
    generatePictureField(id);
    assignStarAppearDelays();
    generateBackgroundStars();
}

/**
 * id картинки, которую строит генерация уровня n. O-12: уровень 1 — по биту
 * тутора: пройден (старый игрок) → полный Кот, иначе → «Голова кота».
 */
function getPrologueLevelPictureId(n) {
    if (n === 1 && typeof isTutorialDone === 'function' && isTutorialDone()) {
        return PROLOGUE_LEGACY_LEVEL1_PICTURE_ID;
    }
    return PROLOGUE_PICTURE_IDS[n - 1];
}

/** Звёзды раскладки картинки — те же координаты, что строит generatePictureField. */
function getPictureFieldLayoutPoints(pictureId) {
    const pic = typeof getPictureFieldById === 'function' ? getPictureFieldById(pictureId) : null;
    if (!pic || !Array.isArray(pic.stars)) return null;
    const usableW = FIELD_WIDTH - 2 * STAR_EDGE_MARGIN;
    const usableH = FIELD_HEIGHT - 2 * STAR_EDGE_MARGIN;
    return pic.stars.map(p => ({
        x: STAR_EDGE_MARGIN + Math.max(0, Math.min(1, p.x)) * usableW,
        y: STAR_EDGE_MARGIN + Math.max(0, Math.min(1, p.y)) * usableH
    }));
}

function isFieldOfPictureLayout(stars, pictureId) {
    const pts = getPictureFieldLayoutPoints(pictureId);
    if (!pts || !Array.isArray(stars) || stars.length !== pts.length) return false;
    for (let i = 0; i < pts.length; i++) {
        const s = stars[i];
        if (!s || Math.abs(s.x - pts[i].x) > 1e-6 || Math.abs(s.y - pts[i].y) > 1e-6) return false;
    }
    return true;
}

// =============================================================================
// МИГРАЦИЯ O-02 → ПРОЛОГ (разовая, в запуск, где у прогрессии нет prologuePassed)
// =============================================================================

// Выставляет applyAchievementSaveData, когда переводит onboardingFieldsShown в
// пройденные уровни; читает и гасит wipeUnfinishedFirstNight. null — не было.
let pendingPrologueMigration = null;

function notePrologueMigration(shown) {
    pendingPrologueMigration = { shown: Math.max(0, Math.floor(Number(shown) || 0)) };
}

/**
 * Недоигранная «первая ночь» O-02 стирается (решение заказчика, развилка 2):
 * слот сегодняшнего дня с раскладкой Кота (shown = 1) или Близнецов (shown = 2)
 * и не раскрытый. Строго после migrateLegacySkySave и до первого loadGame().
 * Миграция записывается в сейв прогрессии здесь же — второй раз не сработает.
 */
function wipeUnfinishedFirstNight() {
    const pending = pendingPrologueMigration;
    pendingPrologueMigration = null;
    if (!pending) return false;
    let wiped = false;
    const shown = pending.shown;
    if (shown === 1 || shown === 2) {
        const slotId = getTodaySkySlotId();
        const slot = loadSkySlot(slotId);
        if (slot && !slot.constellationArtRevealed
            && isFieldOfPictureLayout(slot.fieldStars, O02_FIRST_NIGHT_PICTURE_IDS[shown - 1])) {
            clearSkySlot(slotId);
            wiped = true;
            if (typeof console !== 'undefined' && console.info) {
                console.info('[prologue] Недоигранная первая ночь O-02 стёрта:', O02_FIRST_NIGHT_PICTURE_IDS[shown - 1]);
            }
        }
    }
    if (typeof saveProgression === 'function') saveProgression();
    return wiped;
}

// =============================================================================
// ЗАПУСК И ВЫБОР НЕБА
// =============================================================================

/**
 * Запуск: activeSky, пригодный к показу. Уровень, который нельзя показать
 * (не доступен; пройден, но слота нет), — откат к небу дня.
 * Зовётся сразу после loadProgression(), до аналитики (night_start читает род).
 */
function resolveLaunchSky() {
    const sky = getActiveSky();
    const n = parsePrologueSkyId(sky);
    if (!n) return 'day';
    const state = getPrologueLevelState(n);
    const ok = state === 'available' || (state === 'passed' && hasSkySlot('prologue:' + n));
    if (ok) return sky;
    setActiveSkyValue('day');
    if (typeof saveProgression === 'function') saveProgression();
    return 'day';
}

/** Активный слот S-05 под небо из прогрессии — до любого clearSave()/autoSave(). */
function pinActiveSkySlotFromProgression() {
    const n = getActivePrologueLevel();
    setActiveSkySlot(n ? 'prologue:' + n : null);
}

/**
 * Новое поле уровня Пролога в активный (уже закреплённый) слот. Сессию поля
 * сбрасывает вызывающий; камера, интерфейс и сейв — здесь.
 */
function startNewPrologueSky(n) {
    activeFieldPictureId = null;
    regenerateFieldStarsAfterReset();
    skyStartTime = millis();
    skyFadeScale = 1.0;
    saveGame('prologue:' + n);
}

function selectSkyRefusal(reason) {
    return { ok: false, reason };
}

/**
 * Выбор неба — календарь (S-06) и харнесс. Отказ ничего не меняет.
 * @param {string} slotId — 'day:<сегодня>' или 'prologue:<n>'
 * @param {{animate?: boolean}} [options] — animate: книга закрывается доводом (тап в календаре)
 * @returns {{ok: true}|{ok: false, reason: string}}
 */
function selectSky(slotId, options) {
    const opts = options || {};
    const parsed = parseSkySlotId(slotId);
    if (!parsed) return selectSkyRefusal('bad-id');
    let target;
    if (parsed.kind === 'day') {
        // Прошлые дни не выбираются никогда (решение 1 S-04).
        if (parsed.date !== getEffectiveSkyDateInt()) return selectSkyRefusal('past-day');
        target = 'day';
    } else {
        const state = getPrologueLevelState(parsed.n);
        if (state !== 'available') return selectSkyRefusal(state || 'bad-id');
        target = 'prologue:' + parsed.n;
    }

    const closeBookNow = () => {
        if (typeof isBookOpen === 'function' && !isBookOpen()) return;
        if (opts.animate && typeof closeBookAnimated === 'function') closeBookAnimated();
        else closeBook();
    };

    // То же небо — не переключение: книга закрывается (контракт S-06).
    if (target === getActiveSky()) {
        closeBookNow();
        return { ok: true };
    }

    // Уходящее небо — в свой слот (с ночными флагами).
    const leavingN = getActivePrologueLevel();
    saveGame();
    if (leavingN && isPrologueLevelPassed(leavingN)) clearSkySlot('prologue:' + leavingN);

    resetFieldSessionState();
    activeFieldPictureId = null;
    const targetN = parsePrologueSkyId(target);
    setActiveSkySlot(targetN ? target : null);
    setActiveSkyValue(target);
    saveProgression();

    if (loadGame()) {
        skyStartTime = millis();
        skyFadeScale = 0.25;
    } else if (targetN) {
        startNewPrologueSky(targetN);
    } else {
        // Штатное новое небо дня: квесты суток, чистка day:*, поле по расписанию.
        startNewDailySky({ saveAfter: true });
    }

    centerCamera();
    if (typeof applyTutorialOpeningCamera === 'function') applyTutorialOpeningCamera();
    resetDragState();
    isPanning = false;

    updateScoreUI();
    updateProgressionUI();
    recomputeAchievementsClaimable();
    updateRibbonSignal();
    if (typeof updateTutorialUI === 'function') updateTutorialUI();
    if (typeof updateDevSkyNumber === 'function') updateDevSkyNumber();
    closeBookNow();
    return { ok: true };
}

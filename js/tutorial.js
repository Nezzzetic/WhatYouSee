// tutorial.js — O-01: тутор первых жестов
//
// Два шага на первой ночи новичка, оба жёсткие (решение заказчика на плановом
// шаге; исходное предложение исполнителя было мягким — подсказка, которая просто
// не уходит, — и оно отклонено):
//
//   Шаг 1 «соединение» — камера прибита к паре звёзд, зум и пан не работают,
//     лента (книга) погашена. Доступно только одно: провести линию.
//   Шаг 2 «отзум» — зум И ПАН свободны, лента ещё погашена, текст держится,
//     пока небо не отдалили хотя бы на TUTORIAL_ZOOM_EXIT_FACTOR.
//
// Почему пан свободен на шаге 2, хотя заказчик сказал «UI разблокируется» только
// в конце: в тьюторном кадре 275×595 world-units пары кончаются за несколько
// созвездий, а isLevelComplete() считает по ВСЕМУ полю. Игрок, который упрямо
// соединяет и не зумит, при заблокированном пане оказался бы заперт без единой
// доступной пары и без способа закончить ночь — прямое нарушение критерия
// «ни один шаг не запирает игру насмерть».
//
// ЧТО ЛЕЖИТ В СЕЙВЕ: один бит `achievementCounters.tutorial.done`. Шаг
// соединения не хранится вовсе — он выводится из `constellations.length`.
//
// ⚠ Открывающий кадр НЕ зашит в centerCamera(): её же зовёт
// updateLevelFinaleCamera() (camera.js) как цель отъезда финала V-13 — камера
// финала уехала бы в тот же close-up, и раскрытие кота было бы потеряно.
//
// O-04 (правка постановки после первого показа): на шаге 1 играбельна только
// пара тутора — остальные звёзды гашены (camera.js, тем же видом, что suppressed)
// и не берутся ни пальцем (field.js getStarAt), ни ребром (drawing.js
// canAddConstellationEdge — тот же путь у __test.connect()). И первое созвездие
// тутора необратимо: undoFloor поднимается сразу на его коммите, поэтому окно
// отмены (K-04) для него не встаёт, а откат созвездия на шаг 1 (прежнее
// поведение O-01) больше не работает — это единственный коммит игры, который
// нельзя откатить кнопкой.

const TUTOR_STEP_NONE = 0;
const TUTOR_STEP_CONNECT = 1;
const TUTOR_STEP_ZOOM = 2;

// Зум, с которого началась тьюторная ночь. Живёт в памяти сессии, не в сейве:
// после перезагрузки кадр выставляется заново тем же applyTutorialOpeningCamera().
let tutorialStartZoom = 0;
// Последний отрисованный шаг — чтобы не трогать DOM каждый кадр.
let tutorialRenderedStep = -1;
// Начало текущего круга призрачного ребра.
let tutorialGhostStartMs = 0;

// =============================================================================
// СОСТОЯНИЕ
// =============================================================================

function getTutorialState() {
    if (typeof achievementCounters === 'undefined' || !achievementCounters) return null;
    if (!achievementCounters.tutorial) {
        achievementCounters.tutorial = typeof makeDefaultTutorialState === 'function'
            ? makeDefaultTutorialState()
            : { done: false };
    }
    return achievementCounters.tutorial;
}

function isTutorialDone() {
    const state = getTutorialState();
    return !state || !!state.done;
}

/**
 * Ночь тутора — небо Пролога · Кот (`prologue:1`, S-07) и только оно.
 *
 * Признак лежит в сейве прогрессии — `activeSky`; пройденный Кот тутор не
 * возвращает (финальный кадр после F5). Ручной override картинки (`?picture=`,
 * dev-дропдаун) тутор не поднимает — см. правило про известный id ниже.
 *
 * ⚠ `activeFieldPictureId` в это условие ВХОДИТЬ НЕ МОЖЕТ, хотя и просится.
 * Он живёт только в памяти вкладки: после F5 небо поднимается из сейва
 * (`loadGame`), `generateDailyField()` не зовётся, и id остаётся `null` —
 * тутор пропадал на первой же перезагрузке посреди себя. Поэтому id проверяется
 * только когда он ИЗВЕСТЕН: это отсекает подменённую картинку в дев-панели,
 * не ломая перезагрузку. Что на поле действительно та пара, за которую тутор
 * ручается, проверяет `ensureTutorialViable()` по самим звёздам.
 */
function isTutorialNight() {
    if (typeof achievementCounters === 'undefined' || !achievementCounters) return false;
    if (typeof getActivePrologueLevel !== 'function' || getActivePrologueLevel() !== 1) return false;
    if (isPrologueLevelPassed(1)) return false;
    const activeId = typeof getActiveFieldPictureId === 'function' ? getActiveFieldPictureId() : null;
    return activeId === null || PROLOGUE_TUTOR_PICTURE_IDS.indexOf(activeId) !== -1;
}

// O-12: раскладка уровня 1, узнанная по звёздам на экране, — кеш на массив
// fieldStars (новое небо — новый массив). getTutorialPair зовётся каждый кадр.
let tutorialLayoutCacheStars = null;
let tutorialLayoutCacheLen = -1;
let tutorialLayoutCacheId = null;

/**
 * id раскладки тутора на экране. Известный activeFieldPictureId — он и есть;
 * после F5 (id = null) раскладка узнаётся по звёздам: слот уровня 1 может
 * хранить и «Голову кота», и полный Кот (игрок, начавший до O-12). Брать пару
 * по PROLOGUE_PICTURE_IDS[0] вслепую нельзя — на старой раскладке её индексы
 * попали бы на посторонние звёзды.
 */
function getTutorialPictureId() {
    const activeId = typeof getActiveFieldPictureId === 'function' ? getActiveFieldPictureId() : null;
    if (activeId !== null) return activeId;
    if (typeof fieldStars === 'undefined') return null;
    if (tutorialLayoutCacheStars === fieldStars && tutorialLayoutCacheLen === fieldStars.length) {
        return tutorialLayoutCacheId;
    }
    let found = null;
    if (typeof isFieldOfPictureLayout === 'function') {
        for (const id of PROLOGUE_TUTOR_PICTURE_IDS) {
            if (isFieldOfPictureLayout(fieldStars, id)) { found = id; break; }
        }
    }
    tutorialLayoutCacheStars = fieldStars;
    tutorialLayoutCacheLen = fieldStars.length;
    tutorialLayoutCacheId = found;
    return found;
}

/**
 * Пара звёзд тьюторной ночи, либо null.
 *
 * Картинка — по раскладке на экране (getTutorialPictureId): после F5 сейв неба
 * поднимается без `activeFieldPictureId` (см. isTutorialNight). Спросить id и
 * сдаться значило бы уронить тутор в аварийное снятие на каждой перезагрузке —
 * то есть молча объявить его пройденным. Звёзды всё равно проверяются по факту,
 * ниже и в ensureTutorialViable.
 */
function getTutorialPair() {
    if (typeof getPictureFieldTutorPair !== 'function') return null;
    const pictureId = getTutorialPictureId();
    if (pictureId === null) return null;
    const pair = getPictureFieldTutorPair(pictureId);
    if (!pair) return null;
    const a = getStarById(pair[0]);
    const b = getStarById(pair[1]);
    if (!a || !b) return null;
    return [a, b];
}

/**
 * Аварийный выход. Тутор обязан уметь не встать: если пары нет или ребро между
 * ней невалидно, шаг 1 стал бы невыполнимым и запер бы игру.
 *
 * Ребро может не пройти по длине на низком канвасе: maxEdgeLength = canvasH·2/5
 * в world-units, то есть при высоте канваса меньше ~363 px пара в 145 world
 * перестаёт соединяться. Тогда тутор молча объявляет себя пройденным.
 *
 * O-05: проверка ребра писалась под шаг 1, когда пара ещё не соединена. На
 * шаге 2 пара уже в первом созвездии тутора и обе звезды locked по построению
 * (коммит необратим, O-04) — тем же условием «locked» она читалась как
 * недоступная, и перезагрузка посреди шага 2 аварийно снимала тутор на каждом
 * F5. Соединять на шаге 2 уже нечего, поэтому там проверяется только то, что
 * сама пара нашлась.
 */
function ensureTutorialViable() {
    if (isTutorialDone() || !isTutorialNight()) return false;
    const pair = getTutorialPair();
    if (!pair) {
        finishTutorial();
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[tutor] Пара недоступна или ребро невалидно — тутор снят, чтобы не запереть игру.');
        }
        return false;
    }
    if (getTutorialStep() === TUTOR_STEP_ZOOM) return true;

    const ok = !pair[0].locked && !pair[0].suppressed && !pair[0].extinguished
        && !pair[1].locked && !pair[1].suppressed && !pair[1].extinguished
        && typeof isValidEdgeBetweenStars === 'function'
        && isValidEdgeBetweenStars(pair[0], pair[1]);
    if (!ok) {
        finishTutorial();
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[tutor] Пара недоступна или ребро невалидно — тутор снят, чтобы не запереть игру.');
        }
        return false;
    }
    return true;
}

/**
 * Текущий шаг. Шаг 1 — пока на поле нет ни одного созвездия; дальше — шаг 2.
 * Ничего не пишет: состояние двигают commit-путь и тик зума.
 */
function getTutorialStep() {
    if (isTutorialDone() || !isTutorialNight()) return TUTOR_STEP_NONE;
    if (!getTutorialPair()) return TUTOR_STEP_NONE;
    const built = Array.isArray(constellations) ? constellations.length : 0;
    return built === 0 ? TUTOR_STEP_CONNECT : TUTOR_STEP_ZOOM;
}

function isTutorialActive() {
    return getTutorialStep() !== TUTOR_STEP_NONE;
}

/** Шаг 1: камера прибита намертво — ни зума, ни пана. */
function isTutorialCameraLocked() {
    return getTutorialStep() === TUTOR_STEP_CONNECT;
}

/** Оба шага: ленты (входа в книгу) на небе нет. */
function isTutorialBookLocked() {
    return isTutorialActive();
}

/**
 * O-04: на шаге «соединение» играбельна только пара тутора — остальные звёзды
 * не берутся ни касанием (getStarAt, field.js), ни ребром (canAddConstellationEdge,
 * drawing.js), ни харнессом (оба пути ведут в canAddConstellationEdge). На шаге
 * «отзум» ограничения уже нет: игра открыта, звезда просто отдельно взятая.
 */
function isTutorialAllowedStar(starId) {
    if (getTutorialStep() !== TUTOR_STEP_CONNECT) return true;
    const pair = getTutorialPair();
    if (!pair) return true; // аварийный случай — не запираем игру своей же блокировкой
    return starId === pair[0].id || starId === pair[1].id;
}

// =============================================================================
// O-13: ШАГИ 3–4 — ПОСЛЕ ПЕРВОГО НЕБА КНИГА ВЕДЁТ К ПЕРВОЙ ПЕЧАТИ
// =============================================================================
//
// Сменило зов O-10 посреди неба (решение заказчика 1: зов один, в конце неба).
// Пока Кот не пройден, печати заперты (areSealsLocked, achievements.js). Как
// только он пройден, а новый игрок ещё ничего не забирал, тутор продолжается:
//
//   Шаг 3 «открой книгу → Stamps» — через BOOK_CALL_DELAY_MS после конца сцены
//     V-13 лента зовёт (`ribbon-invite` на body), небо не принимает ввод
//     (`book-gate`, isBookGateActive), строка просит открыть книгу. Внутри
//     книги работает только высечка Stamps (isFirstSkyAllowedTarget, book.js).
//   Шаг 4 «забери печать» — книга на Штампах: работает только одна печать.
//
// Конец — первый забор (lifetimeMetaEarned > 0). Своего поля в сейве нет:
// подшаг выводится из того, что на экране, поэтому перезапуск посреди шага 4
// возвращает на шаг 3. tutorial.done в условие НЕ входит — Кота можно пройти,
// так и не отзумив. Замок книги действует с момента прохождения Кота (книгу,
// открытую рукой во время сцены, он тоже держит); таймер — только для неба.
//
// ⚠ Звёзды при book-gate НЕ гасятся: погашенные выпадали из проверки «остались
// ли пары», и ночь засчитывалась пройденной (O-10, фидбек заказчика, круг 3).

const FIRST_SKY_STEP_NONE = 0;
const FIRST_SKY_STEP_BOOK = 3;
const FIRST_SKY_STEP_PRESS = 4;

// Последнее отрисованное состояние шагов 3–4 — DOM трогается только на смене.
let firstSkyRenderedKey = '';
// AC 14: предупреждение «готовой печати нет» — раз за сессию.
let firstSkyNoTargetWarned = false;

/** Кот пройден, игрок новый и ничего не забирал — без оглядки на готовую печать. */
function isFirstSkyRewardDue() {
    if (typeof achievementCounters === 'undefined' || !achievementCounters) return false;
    if (achievementCounters.sealLockExempt) return false;
    if (typeof isPrologueLevelPassed !== 'function' || !isPrologueLevelPassed(1)) return false;
    return typeof getLifetimeMetaEarned === 'function' && getLifetimeMetaEarned() === 0;
}

/**
 * Печать шагов 3–4 ({chainId, pageIndex}) или null — тогда шагов нет вовсе.
 *
 * Страховка (AC 14): если готовой печати в открытой главе нет, ни замка книги,
 * ни закрытого неба — иначе игрок застрял бы без единого выхода. Тот же приём,
 * что ensureTutorialViable у шагов 1–2.
 */
function getFirstSkyTarget() {
    if (!isFirstSkyRewardDue()) return null;
    let target = getFirstSkyRewardTarget();
    if (!target && typeof recomputeAchievementsClaimable === 'function') {
        // claimable мог ещё не пересчитаться на этом пути — проверяем честно.
        recomputeAchievementsClaimable();
        target = getFirstSkyRewardTarget();
    }
    if (!target && !firstSkyNoTargetWarned) {
        firstSkyNoTargetWarned = true;
        if (typeof console !== 'undefined' && console.warn) {
            console.warn('[tutor] Первое небо пройдено, а готовой печати нет — зов в книгу не включается, чтобы не запереть игру.');
        }
    }
    return target;
}

/** Замок ввода внутри книги — с момента прохождения Кота до первого забора. */
function isFirstSkyBookLocked() {
    return getFirstSkyTarget() !== null;
}

/** 0 — шагов нет; 3 — открой книгу и найди Stamps; 4 — книга на Штампах. */
function getFirstSkyStep() {
    if (!isFirstSkyBookLocked()) return FIRST_SKY_STEP_NONE;
    const onStamps = typeof isBookOpen === 'function' && isBookOpen()
        && typeof bookCut !== 'undefined' && bookCut === 'stamps';
    return onStamps ? FIRST_SKY_STEP_PRESS : FIRST_SKY_STEP_BOOK;
}

/**
 * Сколько ещё ждать зова на небе. Отсчёт — от конца сцены V-13
 * (beginFinaleAftermath: естественный конец или пропуск тапом). Пока сцена
 * идёт — полная задержка. Сцены нет вовсе (перезагрузка, другое небо) — 0:
 * зов включается сразу. Таймер живёт в памяти вкладки, не в сейве.
 */
function getFirstSkyCallDelayLeftMs() {
    if (typeof isLevelFinaleActive === 'function' && isLevelFinaleActive()) return BOOK_CALL_DELAY_MS;
    if (typeof isFinaleLabelsRevealed === 'function' && isFinaleLabelsRevealed()
        && typeof finaleAftermathStartMs !== 'undefined') {
        return Math.max(0, BOOK_CALL_DELAY_MS - (millis() - finaleAftermathStartMs));
    }
    return 0;
}

/** Зов на небе: лента пульсирует, небо закрыто, строка просит открыть книгу. */
function isFirstSkyCallActive() {
    return isFirstSkyBookLocked() && getFirstSkyCallDelayLeftMs() === 0;
}

/**
 * Небо не принимает ввод — ни соединения, ни пана, ни зума (mousePressed,
 * updatePinchMode, zoomAtScreenPoint). Лента — DOM поверх канваса, её этот
 * замок не касается.
 */
function isBookGateActive() {
    return isFirstSkyCallActive() || isBookInviteGateActive();
}

/**
 * Единственное, что работает в книге на шагах 3–4: высечка Stamps (шаг 3) или
 * выбранная печать (шаг 4). Остальное съедает перехватчик в book.js.
 */
function isFirstSkyAllowedTarget(target) {
    const step = getFirstSkyStep();
    if (step === FIRST_SKY_STEP_NONE) return true;
    if (!target || typeof target.closest !== 'function') return false;
    if (step === FIRST_SKY_STEP_BOOK) return !!target.closest('.book-tab[data-cut="stamps"]');
    const t = getFirstSkyTarget();
    return !!(t && target.closest('.achv-seal-current-ready[data-chain-id="' + t.chainId + '"]'));
}

/**
 * Мягкий зов O-10, возвращённый правкой O-13 (слова заказчика с телефона:
 * анимация ленты нужна «и между отдалением и атласом, и после конца уровня»).
 * После отзума тутора, пока книгу ни разу не открывали, лента пульсирует —
 * без закрытого неба и без строки. Первое открытие (U-21 — на атласе) снимает
 * зов навсегда. Условие «тутор пройден»: skipOnboarding тутор не проходит.
 */
function isSoftBookInviteActive() {
    if (typeof achievementCounters === 'undefined' || !achievementCounters) return false;
    const state = achievementCounters.tutorial;
    if (!state || !state.done) return false;
    return !achievementCounters.bookFirstOpenDone;
}

/**
 * Жёсткий шаг O-10, возвращённый правкой O-13 (заказчик, круг 3: «как в O-10,
 * после 3-го созвездия»): мягкий зов с BOOK_INVITE_GATE_CONSTELLATIONS
 * созвездий за игру закрывает небо и выводит строку. Первое открытие книги
 * (U-21 — на атласе) снимает его вместе с мягким зовом.
 */
function isBookInviteGateActive() {
    if (!isSoftBookInviteActive()) return false;
    return (achievementCounters.totalConstellations || 0) >= BOOK_INVITE_GATE_CONSTELLATIONS;
}

function getFirstSkyUiKey() {
    const open = typeof isBookOpen === 'function' && isBookOpen();
    return getFirstSkyStep() + '|' + (isFirstSkyCallActive() ? 1 : 0) + '|' + (open ? 1 : 0)
        + '|' + (isSoftBookInviteActive() ? 1 : 0) + '|' + (isBookInviteGateActive() ? 1 : 0);
}

/**
 * Подсветка (`tutor-hint`): высечка Stamps на шаге 3, выбранная печать на
 * шаге 4. Зовётся после каждой отрисовки книги — печать пересоздаётся рендером.
 */
function applyFirstSkyHints() {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('.tutor-hint').forEach(el => el.classList.remove('tutor-hint'));
    const step = getFirstSkyStep();
    if (step === FIRST_SKY_STEP_BOOK) {
        document.querySelectorAll('.book-tab[data-cut="stamps"]').forEach(el => el.classList.add('tutor-hint'));
    } else if (step === FIRST_SKY_STEP_PRESS) {
        const t = getFirstSkyTarget();
        if (!t) return;
        document.querySelectorAll('.achv-seal-current-ready[data-chain-id="' + t.chainId + '"]')
            .forEach(el => el.classList.add('tutor-hint'));
    }
}

function finishTutorial() {
    const state = getTutorialState();
    if (!state || state.done) return false;
    state.done = true;
    if (typeof saveProgression === 'function') saveProgression();
    updateTutorialUI();
    return true;
}

// =============================================================================
// КАМЕРА ТЬЮТОРНОЙ НОЧИ
// =============================================================================

/**
 * Ставит кадр на пару. Зовётся ПОСЛЕ centerCamera() из путей «пришло небо»
 * (setup, новое небо, dev-сброс неба, полный сброс) — и только оттуда.
 *
 * Действует, пока тутор не пройден, а не только на шаге 1: иначе перезагрузка
 * между шагами вернула бы min-зум от centerCamera(), и шаг 2 закрылся бы сам
 * собой, ничему не научив.
 */
function applyTutorialOpeningCamera() {
    tutorialStartZoom = 0;
    tutorialGhostStartMs = 0;
    tutorialRenderedStep = -1;
    if (!ensureTutorialViable()) {
        updateTutorialUI();
        return false;
    }

    const pair = getTutorialPair();
    zoomLevel = TUTORIAL_START_ZOOM;
    clampZoomToField(); // на очень большом экране minZoom может перерасти MAX_ZOOM

    const midX = (pair[0].x + pair[1].x) / 2;
    const midY = (pair[0].y + pair[1].y) / 2;
    const usableH = typeof getUsableViewHeight === 'function' ? getUsableViewHeight() : height;
    camX = midX - (width / zoomLevel) / 2;
    camY = midY - (usableH / zoomLevel) / 2;
    clampCamera();

    // Порог отзума считается от того, что реально получилось после зажатий.
    tutorialStartZoom = zoomLevel;
    updateTutorialUI();
    return true;
}

/**
 * Отдалил небо — тутор закрыт, лента вернулась.
 *
 * Зовётся СИНХРОННО из обеих точек, где зум меняется по воле игрока
 * (zoomAtScreenPoint в camera.js, updatePinchMode в drawing.js), а не опросом
 * из draw(). Разница не косметическая: на тике состояние менялось только к
 * следующему кадру, и всё, что смотрит на тутор сразу после жеста (харнесс —
 * в первую очередь), ловило гонку с порядком requestAnimationFrame.
 */
function checkTutorialZoomStep() {
    if (getTutorialStep() !== TUTOR_STEP_ZOOM) return false;
    if (!(tutorialStartZoom > 0)) return false;
    if (zoomLevel > tutorialStartZoom * TUTORIAL_ZOOM_EXIT_FACTOR) return false;
    return finishTutorial();
}

/**
 * Тик из draw(). Состояния сам не двигает — только досылает в DOM смену шага,
 * которую сделал кто-то другой (коммит созвездия, откат). Проверка зума здесь
 * оставлена страховкой на случай зума мимо обеих штатных точек.
 */
function updateTutorialProgress() {
    const step = getTutorialStep();
    if (step !== tutorialRenderedStep || getFirstSkyUiKey() !== firstSkyRenderedKey) {
        updateTutorialUI();
    }
    checkTutorialZoomStep();
}

// =============================================================================
// ПРИЗРАК РЕБРА (шаг 1)
// =============================================================================

/**
 * Доля прочерченности призрака 0..1 и его альфа. Чистая функция — проверяется
 * статикой без p5. Круг: прочерчивается → держится → тает → пауза.
 */
function computeTutorialGhost(elapsed, drawMs, holdMs, fadeMs, gapMs) {
    const cycle = drawMs + holdMs + fadeMs + gapMs;
    if (!(cycle > 0)) return { progress: 1, alpha: 1 };
    const t = ((elapsed % cycle) + cycle) % cycle;
    if (t < drawMs) return { progress: drawMs > 0 ? t / drawMs : 1, alpha: 1 };
    if (t < drawMs + holdMs) return { progress: 1, alpha: 1 };
    if (t < drawMs + holdMs + fadeMs) {
        const u = (t - drawMs - holdMs) / fadeMs;
        return { progress: 1, alpha: 1 - u };
    }
    return { progress: 0, alpha: 0 };
}

/**
 * Экранная геометрия призрака. Отдельно от отрисовки — по ней же отчитывается
 * харнесс, иначе сценарий утверждал бы про догадку, а не про то, что нарисовано.
 */
function computeTutorialGhostLayout() {
    if (getTutorialStep() !== TUTOR_STEP_CONNECT) return null;
    const pair = getTutorialPair();
    if (!pair) return null;

    const ax = (pair[0].x - camX) * zoomLevel;
    const ay = (pair[0].y - camY) * zoomLevel;
    const bx = (pair[1].x - camX) * zoomLevel;
    const by = (pair[1].y - camY) * zoomLevel;

    const reduced = typeof prefersReducedMotion === 'function' && prefersReducedMotion();
    let progress = 1;
    let alphaFactor = 1;
    if (!reduced) {
        if (tutorialGhostStartMs === 0) tutorialGhostStartMs = millis();
        const g = computeTutorialGhost(
            millis() - tutorialGhostStartMs,
            TUTORIAL_GHOST_DRAW_MS, TUTORIAL_GHOST_HOLD_MS,
            TUTORIAL_GHOST_FADE_MS, TUTORIAL_GHOST_GAP_MS
        );
        progress = g.progress;
        alphaFactor = g.alpha;
    }

    // Зазор у звёзд — тот же приём, что у линий поля (V-10): призрак не должен
    // втыкаться в искру.
    const gap = Math.max(2, STAR_SIZE * zoomLevel * 0.9);
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (!(len > gap * 2 + 1)) return null;
    const ux = dx / len;
    const uy = dy / len;
    const fromX = ax + ux * gap;
    const fromY = ay + uy * gap;
    const fullLen = len - gap * 2;

    return {
        fromX, fromY,
        toX: fromX + ux * fullLen * progress,
        toY: fromY + uy * fullLen * progress,
        endX: fromX + ux * fullLen,
        endY: fromY + uy * fullLen,
        progress,
        alpha: alphaFactor * TUTORIAL_GHOST_ALPHA,
        starIds: [pair[0].id, pair[1].id]
    };
}

/** Рисуется в экранных px поверх поля — как пометка K-04, не в мировом слое. */
function drawTutorialGhostScreen() {
    const g = computeTutorialGhostLayout();
    if (!g || g.alpha <= 0) return;
    push();
    try {
        stroke(INK_FAINT_RGB[0], INK_FAINT_RGB[1], INK_FAINT_RGB[2], g.alpha);
        strokeWeight(2);
        line(g.fromX, g.fromY, g.toX, g.toY);
    } finally {
        pop();
    }
}

// =============================================================================
// СТРОКА ТЕКСТА (DOM поверх канваса, как лента K-05 и чертёж закладки K-11)
// =============================================================================

/**
 * Синхронизирует строку и погашенную ленту с текущим шагом. Зовётся из тика
 * только на СМЕНЕ шага — DOM каждый кадр трогать незачем.
 */
function updateTutorialUI() {
    const step = getTutorialStep();
    const firstSkyStep = getFirstSkyStep();
    const call = firstSkyStep !== FIRST_SKY_STEP_NONE && isFirstSkyCallActive();
    // Жёсткий шаг посреди неба (O-10 → O-13 круг 3): своя строка, тот же вид.
    const inviteGate = !call && isBookInviteGateActive();
    const bookIsOpen = typeof isBookOpen === 'function' && isBookOpen();
    tutorialRenderedStep = step;
    firstSkyRenderedKey = getFirstSkyUiKey();

    if (typeof document === 'undefined' || !document.body) return;
    document.body.classList.toggle('tutor-locked', step !== TUTOR_STEP_NONE);
    // O-13: зов ленты и закрытое небо — шаг 3 после задержки; лента зовёт ещё
    // и мягко — от отзума до первого открытия книги (isSoftBookInviteActive).
    document.body.classList.toggle('ribbon-invite', call || (isSoftBookInviteActive() && !bookIsOpen));
    document.body.classList.toggle('book-gate', call || inviteGate);

    // O-13: строка тутора в книге (шаги 3–4) — свой узел на листе.
    const bookBox = document.getElementById('bookTutor');
    const bookText = document.getElementById('bookTutorText');
    if (bookBox && bookText) {
        const showInBook = bookIsOpen && firstSkyStep !== FIRST_SKY_STEP_NONE;
        bookText.textContent = showInBook && typeof t === 'function'
            ? t(firstSkyStep === FIRST_SKY_STEP_PRESS ? 'tutor.press' : 'tutor.stampsTab')
            : '';
        bookBox.hidden = !showInBook;
        bookBox.classList.toggle('book-tutor-bottom', firstSkyStep === FIRST_SKY_STEP_PRESS);
    }
    applyFirstSkyHints();

    const box = document.getElementById('skyTutor');
    const textEl = document.getElementById('skyTutorText');
    if (!box || !textEl) return;

    if (step === TUTOR_STEP_NONE) {
        // При открытой книге говорит строка на листе — небесная просвечивала
        // бы в полосе неба над ним вторым голосом.
        const gateLine = (call || inviteGate) && !bookIsOpen;
        if (gateLine) {
            textEl.textContent = typeof t === 'function' ? t(call ? 'tutor.bookReward' : 'tutor.book') : '';
            box.hidden = false;
        } else {
            box.hidden = true;
        }
        // Строка шага 3 — по центру экрана на тёмной подложке: вверху она легла
        // бы на картуш итогового кадра (V-32), тексты перекрывались.
        box.classList.toggle('sky-tutor-center', gateLine);
        return;
    }
    box.classList.remove('sky-tutor-center');
    textEl.textContent = typeof t === 'function'
        ? t(step === TUTOR_STEP_CONNECT ? 'tutor.connect' : 'tutor.zoom')
        : '';
    box.hidden = false;
}

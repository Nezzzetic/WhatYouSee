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
// соединения не хранится вовсе — он выводится из `constellations.length`, и
// поэтому откат единственного созвездия корректно возвращает игрока на шаг 1.
//
// ⚠ Открывающий кадр НЕ зашит в centerCamera(): её же зовёт
// updateLevelFinaleCamera() (camera.js) как цель отъезда финала V-13 — камера
// финала уехала бы в тот же close-up, и раскрытие кота было бы потеряно.

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
 * Ночь тутора — ПЕРВАЯ ночь новичка и только она.
 *
 * Единственный признак, которому можно верить, — счётчик показанных картинок
 * O-02: он равен 1 ровно на первой ночи и лежит в сейве прогрессии.
 *
 * Отсюда следует, что игрока с прогрессом тутор не увидит по построению — его
 * счётчик давно израсходован. И ручной override (`?picture=`, dev-дропдаун)
 * тутор не поднимает: он идёт мимо `consumeOnboardingFixedPictureId()` и
 * счётчика не трогает, так что на чистом профиле тот остаётся нулём.
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
    if (typeof ONBOARDING_FIXED_PICTURE_IDS === 'undefined') return false;
    if ((achievementCounters.onboardingFieldsShown || 0) !== 1) return false;
    const activeId = typeof getActiveFieldPictureId === 'function' ? getActiveFieldPictureId() : null;
    return activeId === null || activeId === ONBOARDING_FIXED_PICTURE_IDS[0];
}

/**
 * Пара звёзд тьюторной ночи, либо null.
 *
 * Картинка берётся по её id, а когда он неизвестен — по первой из фиксированных
 * (см. предупреждение в isTutorialNight: после F5 сейв неба поднимается без
 * `activeFieldPictureId`). Спросить id и сдаться значило бы уронить тутор в
 * аварийное снятие на каждой перезагрузке — то есть молча объявить его
 * пройденным. Звёзды всё равно проверяются по факту, ниже и в ensureTutorialViable.
 */
function getTutorialPair() {
    if (typeof getPictureFieldTutorPair !== 'function') return null;
    const activeId = typeof getActiveFieldPictureId === 'function' ? getActiveFieldPictureId() : null;
    const pictureId = activeId === null ? ONBOARDING_FIXED_PICTURE_IDS[0] : activeId;
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
 */
function ensureTutorialViable() {
    if (isTutorialDone() || !isTutorialNight()) return false;
    const pair = getTutorialPair();
    const ok = !!pair
        && !pair[0].locked && !pair[0].suppressed && !pair[0].extinguished
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
    if (step !== tutorialRenderedStep) updateTutorialUI();
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
    tutorialRenderedStep = step;

    if (typeof document === 'undefined' || !document.body) return;
    document.body.classList.toggle('tutor-locked', step !== TUTOR_STEP_NONE);

    const box = document.getElementById('skyTutor');
    const textEl = document.getElementById('skyTutorText');
    if (!box || !textEl) return;

    if (step === TUTOR_STEP_NONE) {
        box.hidden = true;
        return;
    }
    textEl.textContent = typeof t === 'function'
        ? t(step === TUTOR_STEP_CONNECT ? 'tutor.connect' : 'tutor.zoom')
        : '';
    box.hidden = false;
}

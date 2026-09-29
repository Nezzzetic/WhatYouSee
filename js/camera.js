// camera.js — камера неба: положение, зум, клампы, отъезд финала V-13.
// Рисует небо skyRender.js (R-05).

// =============================================================================
// CAMERA STATE
// =============================================================================

let camX = 0;
let camY = 0;
let isPanning = false;
let panStartMouseX = 0;
let panStartMouseY = 0;
let panStartCamX = 0;
let panStartCamY = 0;

// =============================================================================
// ZOOM STATE
// =============================================================================

let zoomLevel = DEFAULT_ZOOM;

// =============================================================================
// CAMERA UTILITIES
// =============================================================================

/**
 * Smallest zoom (most zoomed out). Wrap убран по обеим осям, поэтому берём
 * min(), а не max(): на минимальном зуме видно ВСЁ поле целиком (по короткой
 * оси может остаться пустой отступ — это ок, camera.js уже центрирует по этой
 * оси в clampCamera()).
 */
function getMinZoomLevel() {
    const w = Math.max(width, 1);
    // U-09: считаем от высоты, не перекрытой свёрнутой шторкой, — на минимальном
    // зуме поле должно целиком помещаться НАД нижним UI, а не под ним.
    const h = typeof getUsableViewHeight === 'function'
        ? Math.max(getUsableViewHeight(), 1)
        : Math.max(height, 1);
    return Math.min(w / FIELD_WIDTH, h / FIELD_HEIGHT);
}

function clampZoomToField() {
    zoomLevel = constrain(zoomLevel, getMinZoomLevel(), MAX_ZOOM);
}

/**
 * V-29: размеры ПОЛНОЭКРАННОГО неба для раскладки подписей раскрытой ночи —
 * не текущего канваса. Раскрытие может случиться, пока холст вклеен в рамку
 * Ex Libris (K-13, меньше экрана): раскладка вслепую по этому размеру была бы
 * теснее, чем реально увидит игрок, открыв небо целиком. `#app` всегда
 * 100vw×100vh независимо от встраивания — оно двигает только `#canvas-container`
 * внутри него (sketch.js). Резерв под лентой — последний ненулевой замер
 * `lastBottomInset` (sketch.js), тот же, что держит getBottomUIHeight() для
 * полноэкранного вида.
 */
function getFinaleLayoutFullScreenSize() {
    const app = typeof document !== 'undefined' ? document.getElementById('app') : null;
    const w = Math.max(app ? app.clientWidth : width, 1);
    const h = Math.max(app ? app.clientHeight : height, 1);
    const bottomInset = typeof lastBottomInset === 'number' ? lastBottomInset : 0;
    return { w, h: Math.max(h - bottomInset, 1) };
}

/** V-29: мин-зум полноэкранного неба — см. getFinaleLayoutFullScreenSize(). */
function getFinaleLayoutMinZoom() {
    const { w, h } = getFinaleLayoutFullScreenSize();
    return Math.min(w / FIELD_WIDTH, h / FIELD_HEIGHT);
}

/**
 * V-29: видимый мировой прямоугольник на этом мин-зуме — включает
 * letterbox-полосы (V-24), в которые тоже можно ставить подписи. Та же
 * формула центрирования, что clampCamera(), просто без обращения к текущим
 * camX/camY/zoomLevel.
 */
function getFinaleLayoutVisibleRect(minZoom) {
    const { w, h } = getFinaleLayoutFullScreenSize();
    const viewW = w / minZoom;
    const viewH = h / minZoom;
    const left = (FIELD_WIDTH - viewW) / 2;
    const top = (FIELD_HEIGHT - viewH) / 2;
    return { left, top, right: left + viewW, bottom: top + viewH };
}

/**
 * D-01/U-05: зум с якорем — мировая точка под экранной (sx, sy) остаётся на месте.
 * Общая логика для колеса мыши, кнопок «+»/«−» и pinch.
 */
function zoomAtScreenPoint(sx, sy, newZoom) {
    // O-01: шаг 1 тутора держит кадр намертво. Гейт стоит здесь, а не в
    // обработчиках, потому что это общая точка колеса и кнопок «+»/«−»; пинч
    // считает зум сам (updatePinchMode в drawing.js) и заперт отдельно.
    // centerCamera() и камера финала V-13 пишут zoomLevel напрямую и гейта
    // не касаются — это намеренно, тутор не должен мешать сценам.
    if (typeof isTutorialCameraLocked === 'function' && isTutorialCameraLocked()) return;
    if (typeof isBookGateActive === 'function' && isBookGateActive()) return; // O-10: жёсткий шаг
    const worldX = sx / zoomLevel + camX;
    const worldY = sy / zoomLevel + camY;
    zoomLevel = constrain(newZoom, getMinZoomLevel(), MAX_ZOOM);
    camX = worldX - sx / zoomLevel;
    camY = worldY - sy / zoomLevel;
    clampCamera();
    // O-01: шаг «отзум» закрывается здесь же, синхронно с жестом, а не тиком
    // следующего кадра.
    if (typeof checkTutorialZoomStep === 'function') checkTutorialZoomStep();
}

/** D-01: шаг зума кнопками — мультипликативный, якорь — центр экрана. dir: +1 / −1. */
function zoomByStep(dir) {
    const factor = Math.pow(ZOOM_BUTTON_FACTOR, dir);
    zoomAtScreenPoint(width / 2, height / 2, zoomLevel * factor);
}

/** P-01: поле ограничено по обеим осям (X и Y), wrap убран — камера упирается в край. */
function clampCamera() {
    const viewW = width / zoomLevel;
    if (viewW >= FIELD_WIDTH) {
        camX = (FIELD_WIDTH - viewW) / 2;
    } else {
        camX = constrain(camX, 0, FIELD_WIDTH - viewW);
    }

    // U-09: по вертикали ограничиваем не по всей высоте канваса, а по «рабочей»
    // полосе над свёрнутой шторкой. Тогда камера уезжает ниже ровно настолько,
    // чтобы нижний край поля вышел из-под UI и до его звёзд можно было дотянуться.
    const usableH = typeof getUsableViewHeight === 'function' ? getUsableViewHeight() : height;
    const usableViewH = usableH / zoomLevel;
    if (usableViewH >= FIELD_HEIGHT) {
        camY = (FIELD_HEIGHT - usableViewH) / 2;
    } else {
        camY = constrain(camY, 0, FIELD_HEIGHT - usableViewH);
    }
}

/**
 * V-13: отзум финала ночи. Зовётся из draw() каждый кадр, пока идёт сцена.
 *
 * Цель НЕ запоминается на старте, а пересчитывается каждый кадр через штатную
 * centerCamera() (снимок → цель → восстановление): иначе открытие шторки,
 * поворот экрана или resize посреди сцены оставили бы камеру ехать в устаревшую
 * точку. Резерв полосы под свёрнутой шторкой (getUsableViewHeight) приезжает
 * сюда даром — он уже внутри centerCamera() и getMinZoomLevel().
 */
function updateLevelFinaleCamera() {
    if (typeof getLevelFinaleElapsed !== 'function') return;
    const elapsed = getLevelFinaleElapsed();
    if (elapsed < 0) return;

    const from = levelFinale.camFrom;
    const snapX = camX;
    const snapY = camY;
    const snapZoom = zoomLevel;
    centerCamera();
    const toX = camX;
    const toY = camY;
    const toZoom = zoomLevel;
    camX = snapX;
    camY = snapY;
    zoomLevel = snapZoom;

    const t = LEVEL_FINALE_ZOOM_MS > 0 ? Math.min(1, elapsed / LEVEL_FINALE_ZOOM_MS) : 1;
    const e = computeFinaleEase(t);
    zoomLevel = from.zoom + (toZoom - from.zoom) * e;
    camX = from.camX + (toX - from.camX) * e;
    camY = from.camY + (toY - from.camY) * e;
    clampCamera();
}

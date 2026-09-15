// bookExLibris.js — страница «Ex Libris»: обсерватория в книге K-13,
// книжное переименование K-21 (R-05).

// =============================================================================
// B-02/K-13: ОБСЕРВАТОРИЯ В КНИГЕ — страница «Ex Libris»
// =============================================================================
//
// K-13: страница и обсерватория — одно состояние, отдельного входа/выхода
// больше нет. Открыл высечку «Ex Libris» (и обсерватория уже разряжена) —
// холст ожил прямо в рамке страницы; ушёл на другую высечку или закрыл книгу —
// вернулся на поле. Синхронизирует это syncExLibrisAppMode().

function renderBookExLibris() {
    const unlocked = typeof isObservatoryUnlocked === 'function' && isObservatoryUnlocked();
    const lockedEl = document.getElementById('exLibrisLocked');
    const plateEl = document.getElementById('exLibrisPlate');
    if (lockedEl) lockedEl.hidden = unlocked;
    if (plateEl) plateEl.hidden = !unlocked;

    if (!unlocked) {
        closeObservatoryRenameField();
        const titleEl = document.getElementById('exLibrisLockTitle');
        const progressEl = document.getElementById('exLibrisLockProgress');
        if (titleEl) titleEl.textContent = t('observatory.lockedTitle');
        // S-03 (правка заказчика 2026-09-10): как и на атласе — только уровень,
        // ни полосы, ни чисел ✦; сколько осталось, показывает шкала у корешка.
        if (progressEl) fillLevelLockText(progressEl, 'observatory.lockedLevel', OBSERVATORY_UNLOCK_LEVEL);
    }
}

// =============================================================================
// K-21: КНИЖНОЕ ПЕРЕИМЕНОВАНИЕ НА ЭКСЛИБРИСЕ (замена openObservatoryRenamePrompt)
// =============================================================================
//
// Тап по подписи созвездия на холсте (или по знаку пера рядом с ней) больше не
// зовёт системный prompt() — открывается эта строка на бумаге, рядом с
// подписью «ex libris». Отмены нет: пустой ввод и Esc имя не меняют, Enter и
// потеря фокуса коммитят непустое значение.

/** Запись обсерватории (observatory.js), которую сейчас редактирует строка ввода. */
let observatoryRenameEntry = null;

function openObservatoryRenameField(entry) {
    if (!entry) return false;
    const row = document.getElementById('exLibrisRenameRow');
    const input = document.getElementById('exLibrisRenameInput');
    if (!row || !input) return false;
    observatoryRenameEntry = entry;
    input.value = typeof getObservatoryLabelText === 'function' ? getObservatoryLabelText(entry) : '';
    row.hidden = false;
    input.focus();
    input.select();
    return true;
}

function closeObservatoryRenameField() {
    const row = document.getElementById('exLibrisRenameRow');
    if (row) row.hidden = true;
    observatoryRenameEntry = null;
}

/** Непустое значение уходит в entry.custom; пустое — имя остаётся прежним. */
function commitObservatoryRenameField() {
    const entry = observatoryRenameEntry;
    const input = document.getElementById('exLibrisRenameInput');
    if (!entry || !input) return;
    const value = input.value.trim();
    if (value !== '') {
        entry.custom = value;
        if (typeof saveObservatoryNow === 'function') saveObservatoryNow();
    }
}

/**
 * K-13: держит appMode в паре с высечкой «Ex Libris» — единственное место,
 * где что-то решает, быть ли сейчас обсерватории. Вызывается после каждого
 * изменения состояния книги (открыть/закрыть/переключить высечку).
 */
function syncExLibrisAppMode() {
    const shouldBeObservatory = bookOpen && bookCut === 'exlibris'
        && typeof isObservatoryUnlocked === 'function' && isObservatoryUnlocked();
    const inObservatory = typeof isObservatoryMode === 'function' && isObservatoryMode();
    if (shouldBeObservatory !== inObservatory) {
        // setAppMode() сам зовёт updateObservatoryUI() → updateExLibrisEmbedding()
        setAppMode(shouldBeObservatory ? 'observatory' : 'field');
    } else if (typeof updateExLibrisEmbedding === 'function') {
        // Режим не поменялся, но резервированный прямоугольник мог протухнуть
        // (resize, смена высечки туда-обратно) — освежаем его на всякий случай.
        updateExLibrisEmbedding();
    }
}

/** Тумблер «соединять»/«двигать»; красить — тапом в «двигать» (без смены). */
function updateObservatoryUI() {
    const inObservatory = typeof isObservatoryMode === 'function' && isObservatoryMode();

    const seg = document.getElementById('observatoryModeSeg');
    if (seg) seg.hidden = !inObservatory;

    if (inObservatory) {
        const mode = typeof getObservatoryMode === 'function' ? getObservatoryMode() : 'connect';
        const connectBtn = document.getElementById('obsModeConnectBtn');
        const moveBtn = document.getElementById('obsModeMoveBtn');
        // Активное положение подсвечено всегда: в «перемещать» тап красит звезду,
        // а в «соединять» нет, и перепутать это дорого.
        if (connectBtn) connectBtn.classList.toggle('seg-btn-on', mode === 'connect');
        if (moveBtn) moveBtn.classList.toggle('seg-btn-on', mode === 'move');
    }

    if (bookOpen && bookCut === 'exlibris') renderBookExLibris();

    // K-11: обсерватория — не то небо, для которого закладывают фигуру.
    renderSkyBookmark();

    if (typeof updateExLibrisEmbedding === 'function') updateExLibrisEmbedding();
}

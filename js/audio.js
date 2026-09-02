// audio.js — Web Audio API sound effects + A-05 хаптик (navigator.vibrate).
// All functions are global. Safe to call before initAudio() — they silently no-op.

let _audioCtx = null;
let _lastEdgeSnapTime = 0;

// A-05: жест игрока уже был. Ставится initAudio() — она зовётся ровно из точек
// жеста (mousePressed/touchStarted, забор, dev-кнопка) и служит игре хуком
// «первое касание». Нужен свой признак, а не _audioCtx: как только у звука
// появится выключатель, initAudio() может перестать создавать контекст —
// вибро на загрузке завершённой ночи (save.js, revealConstellationArt(false))
// не должно проснуться вместе с этим.
let _interacted = false;

// K-14: первая настоящая настройка — звук вкл/выкл. Свой ключ, отдельный от
// SAVE_KEY и от прогрессии: настройка переживает и сброс прогресса, и смену
// неба (риск 1 дока). A-05 добавила сюда `haptic` вторым полем на готовое
// место, не заводя второй ключ.
const SETTINGS_SAVE_KEY = 'starsReborn_settings_v01';

let _soundEnabled = true;
let _hapticEnabled = true; // A-05: своя настройка, гасится независимо от звука

function loadSoundSetting() {
    try {
        const raw = localStorage.getItem(SETTINGS_SAVE_KEY);
        if (!raw) return;
        const data = JSON.parse(raw);
        if (typeof data.sound === 'boolean') _soundEnabled = data.sound;
        if (typeof data.haptic === 'boolean') _hapticEnabled = data.haptic;
    } catch (e) { /* ignore */ }
}

function saveSoundSetting() {
    try {
        localStorage.setItem(SETTINGS_SAVE_KEY, JSON.stringify({ sound: _soundEnabled, haptic: _hapticEnabled }));
    } catch (e) { /* ignore */ }
}

loadSoundSetting();

function isSoundEnabled() {
    return _soundEnabled;
}

function setSoundEnabled(on) {
    _soundEnabled = !!on;
    saveSoundSetting();
}

// A-05: гейт звука в play*-функциях — техническая возможность (_audioCtx)
// и желание игрока (_soundEnabled) в одной точке.
function isSoundOn() {
    return _soundEnabled && !!_audioCtx;
}

function isHapticEnabled() {
    return _hapticEnabled;
}

function setHapticEnabled(on) {
    _hapticEnabled = !!on;
    saveSoundSetting();
    if (!_hapticEnabled) {
        // выключатель обязан оборвать уже идущий паттерн, а не ждать его конца
        try {
            if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(0);
        } catch (e) {}
    }
}

// A-05: длительности вибро — рядом со звуком, который они сопровождают.
// 0 и [] штатно значат «это событие без вибро», а не ошибку.
const HAPTIC_SNAP_MS = 10;              // соединение звезды — самый короткий тик
const HAPTIC_CLAIM_MS = 15;             // забор награды — лёгкое «взял»
const HAPTIC_COMMIT_MS = 25;            // коммит созвездия — самое весомое одиночное событие
const HAPTIC_NIGHT_END_MS = [30, 70, 30]; // конец ночи — единственный паттерн, не импульс
const HAPTIC_TOGGLE_MS = 15;            // U-14: включил тумблер вибро — почувствовал, что именно он включил

/**
 * A-05: единственная точка, где игра вообще касается navigator.vibrate.
 * `pattern` — число мс или паттерн [мс...]; 0/[] — штатное «без вибро».
 */
function hapticPulse(pattern) {
    if (!_hapticEnabled) return;
    if (!_interacted) return;
    if (!pattern || (Array.isArray(pattern) && pattern.length === 0)) return;
    if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
    try {
        navigator.vibrate(pattern);
    } catch (e) {}
}

function initAudio() {
    _interacted = true;
    if (_audioCtx) return;
    try {
        _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
}

// A-02: восходящая лестница цепочки — заметно 1→10 звёзд, слабо 10→20, плато дальше
const CHAIN_PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21]; // пентатоника, ~2 октавы на 10 нот
const CHAIN_BASE_FREQ = 330; // E4

function chainSemitones(n) {
    const i = Math.max(0, n - 2); // первая нота при n=2 (второй звезде цепочки)
    if (i < 10) return CHAIN_PENTA[i];
    if (i < 20) return 21 + (i - 9) * 0.5;
    return 26;
}

function chainStepFreq(n) {
    return CHAIN_BASE_FREQ * Math.pow(2, chainSemitones(n) / 12);
}

// Короткий щелчок: соединение звезды в черновик.
// A-06: chainEdgeCount — номер ребра в черновике (currentLines.length), считая
// только что добавленное, плюс 1 — так первое ребро звучит той же нотой, что
// раньше первая пара звёзд (chainSemitones калиброван под n=2 у первой ноты).
function playEdgeSnap(chainEdgeCount) {
    const now = Date.now();
    if (now - _lastEdgeSnapTime < 50) return; // debounce — общий для звука и вибро
    _lastEdgeSnapTime = now;
    hapticPulse(HAPTIC_SNAP_MS);
    if (!isSoundOn()) return;
    try {
        const n = typeof chainEdgeCount === 'number' && isFinite(chainEdgeCount) ? chainEdgeCount : 2;
        const freq = chainStepFreq(n);
        const t = _audioCtx.currentTime;
        const osc = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, t);
        osc.frequency.exponentialRampToValueAtTime(freq * 0.85, t + 0.06); // лёгкий спад — характер «щелчка»
        gain.gain.setValueAtTime(0.18, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
        osc.start(t);
        osc.stop(t + 0.06);
    } catch (e) {}
}

// Мягкий аккорд: коммит созвездия
function playCommit() {
    hapticPulse(HAPTIC_COMMIT_MS);
    if (!isSoundOn()) return;
    try {
        const t = _audioCtx.currentTime;
        [[400, 0.14], [600, 0.10]].forEach(([freq, vol]) => {
            const osc = _audioCtx.createOscillator();
            const gain = _audioCtx.createGain();
            osc.connect(gain);
            gain.connect(_audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, t);
            gain.gain.setValueAtTime(vol, t);
            gain.gain.exponentialRampToValueAtTime(0.001, t + 0.30);
            osc.start(t);
            osc.stop(t + 0.30);
        });
    } catch (e) {}
}

// A-03: ЗАБОР НАГРАДЫ
//
// Тёплая синусоида с суб-слоем на октаву ниже корня — звук именно жеста забора,
// не оповещения (K-15 сняла тост «шаг выполнен» вместе с его отдельным перезвоном).
//
// Корень — E4 (`CHAIN_BASE_FREQ`), тональность общая с лестницей цепочки A-02.
const CLAIM_ROOT_FREQ = CHAIN_BASE_FREQ;      // E4, 330 Гц
const CLAIM_NOTES = [0, 7, 12, 19];           // E4 · B4 · E5 · B5 (квинты пентатоники)
const CLAIM_NOTE_STEP = 0.05;                 // задержка между нотами, с
const CLAIM_NOTE_TAIL = 0.25;                 // хвост ноты, с
const CLAIM_SUB_TAIL = 0.35;                  // хвост суб-слоя, с

const CLAIM_DEBOUNCE_MS = 80;                 // жёсткий пол: быстрее — просто молчим
const CLAIM_SERIES_WINDOW_MS = 800;           // внутри окна забор считается частью серии
const CLAIM_SERIES_STEP = 2;                  // полутонов вверх за каждый забор серии
const CLAIM_SERIES_MAX = 6;                   // потолок транспонирования

let _lastClaimTime = 0;
let _claimSeriesShift = 0;

/** Сколько нот дать за награду: 10 ✦ и 315 ✦ не должны звучать одинаково. */
function claimNoteCount(reward) {
    const n = typeof reward === 'number' && isFinite(reward) ? reward : 0;
    if (n <= CLAIM_SOUND_TIER_SMALL) return 2;
    if (n <= CLAIM_SOUND_TIER_MID) return 3;
    return 4;
}

/**
 * Забор награды цепочки. `reward` — начисляемые ✦ (влияет только на число нот).
 *
 * Серия заборов (следующий шаг бывает выполнен сразу) поднимается по полутонам,
 * а не повторяет одну и ту же фразу: пять заборов подряд звучат восходящим
 * пробегом, а не кашей из пяти одинаковых арпеджио.
 */
function playClaim(reward) {
    const now = Date.now();
    if (now - _lastClaimTime < CLAIM_DEBOUNCE_MS) return; // общий пол для звука и вибро
    _claimSeriesShift = (now - _lastClaimTime < CLAIM_SERIES_WINDOW_MS)
        ? Math.min(CLAIM_SERIES_MAX, _claimSeriesShift + CLAIM_SERIES_STEP)
        : 0;
    _lastClaimTime = now;

    hapticPulse(HAPTIC_CLAIM_MS);
    if (!isSoundOn()) return;

    try {
        const t = _audioCtx.currentTime;
        const shift = Math.pow(2, _claimSeriesShift / 12);
        const root = CLAIM_ROOT_FREQ * shift;
        const count = claimNoteCount(reward);

        // Суб-слой: октава вниз от корня. Именно его нет у звука «выполнено».
        const sub = _audioCtx.createOscillator();
        const subGain = _audioCtx.createGain();
        sub.connect(subGain);
        subGain.connect(_audioCtx.destination);
        sub.type = 'sine';
        sub.frequency.setValueAtTime(root / 2, t);
        subGain.gain.setValueAtTime(0.0001, t);
        subGain.gain.exponentialRampToValueAtTime(0.12, t + 0.02); // мягкая атака, без щелчка
        subGain.gain.exponentialRampToValueAtTime(0.001, t + CLAIM_SUB_TAIL);
        sub.start(t);
        sub.stop(t + CLAIM_SUB_TAIL);

        for (let i = 0; i < count; i++) {
            const osc = _audioCtx.createOscillator();
            const gain = _audioCtx.createGain();
            osc.connect(gain);
            gain.connect(_audioCtx.destination);
            osc.type = 'sine';
            const start = t + i * CLAIM_NOTE_STEP;
            osc.frequency.setValueAtTime(root * Math.pow(2, CLAIM_NOTES[i] / 12), start);
            gain.gain.setValueAtTime(0.0001, start);
            gain.gain.exponentialRampToValueAtTime(0.15, start + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.001, start + CLAIM_NOTE_TAIL);
            osc.start(start);
            osc.stop(start + CLAIM_NOTE_TAIL);
        }
    } catch (e) {}
}

// Восходящий арпеджио: конец уровня
function playLevelComplete() {
    hapticPulse(HAPTIC_NIGHT_END_MS);
    if (!isSoundOn()) return;
    try {
        const t = _audioCtx.currentTime;
        [523, 659, 784].forEach((freq, i) => {
            const osc = _audioCtx.createOscillator();
            const gain = _audioCtx.createGain();
            osc.connect(gain);
            gain.connect(_audioCtx.destination);
            osc.type = 'sine';
            const start = t + i * 0.15;
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.15, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.35);
            osc.start(start);
            osc.stop(start + 0.35);
        });
    } catch (e) {}
}

// audio.js — Web Audio API sound effects (vanilla JS, no modules)
// All functions are global. Safe to call before initAudio() — they silently no-op.

let _audioCtx = null;
let _lastEdgeSnapTime = 0;

function initAudio() {
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
// chainStarCount — число звёзд в цепочке (visitedStars) с учётом присоединяемой.
function playEdgeSnap(chainStarCount) {
    if (!_audioCtx) return;
    const now = Date.now();
    if (now - _lastEdgeSnapTime < 50) return; // debounce
    _lastEdgeSnapTime = now;
    try {
        const n = typeof chainStarCount === 'number' && isFinite(chainStarCount) ? chainStarCount : 2;
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
    if (!_audioCtx) return;
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

// Яркий перезвон: получено достижение
function playAchievementGet() {
    if (!_audioCtx) return;
    try {
        const t = _audioCtx.currentTime;
        [784, 1047, 1319].forEach((freq, i) => {
            const osc = _audioCtx.createOscillator();
            const gain = _audioCtx.createGain();
            osc.connect(gain);
            gain.connect(_audioCtx.destination);
            osc.type = 'triangle';
            const start = t + i * 0.07;
            osc.frequency.setValueAtTime(freq, start);
            gain.gain.setValueAtTime(0.16, start);
            gain.gain.exponentialRampToValueAtTime(0.001, start + 0.28);
            osc.start(start);
            osc.stop(start + 0.28);
        });
    } catch (e) {}
}

// Восходящий арпеджио: конец уровня
function playLevelComplete() {
    if (!_audioCtx) return;
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

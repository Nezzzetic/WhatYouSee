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

// Короткий щелчок: soединение звезды в черновик
function playEdgeSnap() {
    if (!_audioCtx) return;
    const now = Date.now();
    if (now - _lastEdgeSnapTime < 50) return; // debounce
    _lastEdgeSnapTime = now;
    try {
        const osc = _audioCtx.createOscillator();
        const gain = _audioCtx.createGain();
        osc.connect(gain);
        gain.connect(_audioCtx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, _audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(400, _audioCtx.currentTime + 0.06);
        gain.gain.setValueAtTime(0.18, _audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, _audioCtx.currentTime + 0.06);
        osc.start(_audioCtx.currentTime);
        osc.stop(_audioCtx.currentTime + 0.06);
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

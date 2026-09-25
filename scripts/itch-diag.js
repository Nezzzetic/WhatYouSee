// itch-diag.js — P-12: диагностика ввода внутри iframe itch (iOS Safari).
//
// В игру и в репозиторий игры как код НЕ входит: лежит в `scripts/`, в архив
// попадает только сборкой `node scripts/build-itch.js --diag` (как
// `js/itch-diag.js`, подключается в <head> сразу после p5 — раньше игры, чтобы
// слушатели захвата стояли первыми).
//
// Что показывает плашка поверх игры (сама касаний не ловит, кроме кнопок):
//   • сколько touch/pointer/mouse-событий дошло до окна iframe и сколько из них
//     целилось в холст; цель последнего касания и elementFromPoint в его точке —
//     не перекрыт ли холст чужим слоем; погасил ли кто-то событие (defaultPrevented);
//   • координаты касания, mouseX/mouseY от p5, прямоугольник холста; кольцо на
//     экране там, где касание пришло, — видно, совпадает ли с пальцем;
//   • размеры окна, visualViewport, DPR, включилась ли рамка itch-frame.css
//     (min-aspect-ratio: 3/4), в iframe ли мы, fullscreen;
//   • тип загрузки страницы (navigate / reload / back_forward), номер загрузки
//     и журнал событий жизненного цикла, ПЕРЕЖИВАЮЩИЙ перезагрузку (localStorage)
//     — видно, что происходило перед тем, как iframe загрузился заново;
//   • состояние игры: книга открыта, замок камеры тутора, isDragging/isPanning.
//
// Кнопки: «рамка» — снять/вернуть itch-frame.css на лету (подозрение 2),
// «▼/▲» — плашку вниз/вверх, «–» — свернуть, «×» — сбросить счётчики и журнал.

(function () {
    'use strict';

    const LS_LOG = 'itchDiag_log';
    const LS_LOADS = 'itchDiag_loads';
    const SS_LOADS = 'itchDiag_loadsSession';
    const LOG_MAX = 14;
    const t0 = Date.now();

    function lsGet(store, key) { try { return store.getItem(key); } catch (e) { return null; } }
    function lsSet(store, key, v) { try { store.setItem(key, v); return true; } catch (e) { return false; } }

    function stamp() {
        const d = new Date();
        const p = n => String(n).padStart(2, '0');
        return p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
    }

    let log = [];
    try { log = JSON.parse(lsGet(localStorage, LS_LOG) || '[]') || []; } catch (e) { log = []; }
    function note(msg) {
        log.push(stamp() + ' ' + msg);
        if (log.length > LOG_MAX) log = log.slice(-LOG_MAX);
        lsSet(localStorage, LS_LOG, JSON.stringify(log));
    }

    // --- загрузки ---------------------------------------------------------
    const loads = (Number(lsGet(localStorage, LS_LOADS)) || 0) + 1;
    const lsOk = lsSet(localStorage, LS_LOADS, String(loads));
    const sessLoads = (Number(lsGet(sessionStorage, SS_LOADS)) || 0) + 1;
    const ssOk = lsSet(sessionStorage, SS_LOADS, String(sessLoads));
    let navType = 'n/a';
    try {
        const nav = performance.getEntriesByType('navigation')[0];
        if (nav) navType = nav.type;
    } catch (e) { /* ignore */ }
    note('LOAD #' + loads + ' nav=' + navType + ' ' + innerWidth + 'x' + innerHeight);

    // --- счётчики ввода ----------------------------------------------------
    const TYPES = ['touchstart', 'touchmove', 'touchend', 'touchcancel', 'pointerdown', 'mousedown', 'click'];
    const cnt = {};
    const onCanvas = {};
    const prevented = {};
    TYPES.forEach(t => { cnt[t] = 0; onCanvas[t] = 0; prevented[t] = 0; });
    let last = null; // { type, x, y, target, underFinger, touches }
    let firstInputNoted = false;

    function describe(el) {
        if (!el) return 'null';
        if (el === document) return 'document';
        if (el === window) return 'window';
        let s = (el.tagName || '?').toLowerCase();
        if (el.id) s += '#' + el.id;
        else if (el.className && typeof el.className === 'string') s += '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.');
        return s;
    }

    function pointOf(e) {
        const t = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]) || e;
        return { x: t.clientX, y: t.clientY };
    }

    function onCapture(e) {
        const t = e.type;
        cnt[t]++;
        const isCanvas = !!(e.target && e.target.tagName === 'CANVAS');
        if (isCanvas) onCanvas[t]++;
        if (t === 'touchmove' && last && last.type === 'touchmove') {
            // ход пальца — только координата, без elementFromPoint на каждый кадр
            const p = pointOf(e);
            last.x = p.x; last.y = p.y;
        } else if (t !== 'touchend' && t !== 'touchcancel' && t !== 'click') {
            const p = pointOf(e);
            let under = null;
            try { under = document.elementFromPoint(p.x, p.y); } catch (err) { /* ignore */ }
            last = {
                type: t, x: p.x, y: p.y,
                target: describe(e.target),
                underFinger: describe(under),
                touches: e.touches ? e.touches.length : 0,
            };
            showRing(p.x, p.y, isCanvas);
        }
        if (!firstInputNoted) {
            firstInputNoted = true;
            note('first input: ' + t + ' → ' + describe(e.target));
        }
        // defaultPrevented видно только после всех обработчиков — смотрим в
        // следующей задаче.
        setTimeout(() => { if (e.defaultPrevented) prevented[t]++; }, 0);
    }
    TYPES.forEach(t => window.addEventListener(t, onCapture, { capture: true, passive: true }));

    // --- жизненный цикл: пишется в журнал, переживающий перезагрузку -------
    document.addEventListener('visibilitychange', () => note('visibility=' + document.visibilityState));
    window.addEventListener('pagehide', e => note('pagehide persisted=' + e.persisted));
    window.addEventListener('pageshow', e => { if (e.persisted) note('pageshow from bfcache'); });
    window.addEventListener('beforeunload', () => note('beforeunload'));
    window.addEventListener('blur', () => note('blur'));
    window.addEventListener('focus', () => note('focus'));
    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => note('resize ' + innerWidth + 'x' + innerHeight), 250);
    });
    window.addEventListener('orientationchange', () => note('orientationchange'));
    document.addEventListener('fullscreenchange', () => note('fullscreen=' + !!document.fullscreenElement));
    window.addEventListener('error', e => note('ERR ' + String(e.message || e).slice(0, 80)));

    // --- плашка -------------------------------------------------------------
    let panel, text, ring, frameBtn;
    let collapsed = false;
    let atBottom = false;

    function frameLink() {
        return document.querySelector('link[href*="itch-frame.css"]');
    }

    function button(label, onTap) {
        const b = document.createElement('button');
        b.textContent = label;
        b.style.cssText = 'pointer-events:auto;font:12px monospace;margin-left:4px;padding:4px 8px;' +
            'background:#223;color:#dfd;border:1px solid #6a6;border-radius:4px;';
        // click приходит на iOS и после touch — одного обработчика достаточно
        b.addEventListener('click', ev => { ev.stopPropagation(); onTap(); });
        return b;
    }

    function place() {
        panel.style.top = atBottom ? '' : '0';
        panel.style.bottom = atBottom ? '0' : '';
    }

    function build() {
        panel = document.createElement('div');
        panel.id = 'itch-diag';
        panel.style.cssText = 'position:fixed;left:0;right:0;z-index:2147483647;pointer-events:none;' +
            'background:rgba(0,0,0,0.62);color:#bfe;font:10px/1.3 monospace;padding:4px 6px;' +
            'max-height:48vh;overflow:hidden;white-space:pre-wrap;word-break:break-all;';
        const bar = document.createElement('div');
        bar.style.cssText = 'text-align:right;';
        frameBtn = button('рамка', () => {
            const l = frameLink();
            if (!l) return;
            l.disabled = !l.disabled;
            note('itch-frame.css ' + (l.disabled ? 'OFF' : 'ON'));
            if (typeof windowResized === 'function') { try { windowResized(); } catch (e) { /* ignore */ } }
        });
        bar.appendChild(frameBtn);
        bar.appendChild(button('▼▲', () => { atBottom = !atBottom; place(); }));
        bar.appendChild(button('–', () => { collapsed = !collapsed; render(); }));
        bar.appendChild(button('×', () => {
            TYPES.forEach(t => { cnt[t] = 0; onCanvas[t] = 0; prevented[t] = 0; });
            log = []; lsSet(localStorage, LS_LOG, '[]');
            last = null; render();
        }));
        text = document.createElement('div');
        panel.appendChild(bar);
        panel.appendChild(text);
        document.body.appendChild(panel);
        place();

        ring = document.createElement('div');
        ring.style.cssText = 'position:fixed;width:36px;height:36px;margin:-18px 0 0 -18px;border-radius:50%;' +
            'border:2px solid #f5a;z-index:2147483646;pointer-events:none;display:none;';
        document.body.appendChild(ring);
        render();
        setInterval(render, 250);
    }

    function showRing(x, y, isCanvas) {
        if (!ring) return;
        ring.style.left = x + 'px';
        ring.style.top = y + 'px';
        ring.style.borderColor = isCanvas ? '#5f8' : '#f5a';
        ring.style.display = 'block';
    }

    function safe(fn) { try { return fn(); } catch (e) { return '?'; } }

    function render() {
        if (!text) return;
        if (collapsed) { text.textContent = 'P-12 diag · ts ' + cnt.touchstart + '/' + onCanvas.touchstart; return; }
        const c = document.querySelector('#canvas-container canvas');
        const r = c ? c.getBoundingClientRect() : null;
        const vv = window.visualViewport;
        const fl = frameLink();
        const lines = [];
        lines.push('P-12 diag  up ' + Math.round((Date.now() - t0) / 1000) + 's  load #' + loads +
            (lsOk ? '' : '(LS n/a)') + '  sess #' + (ssOk ? sessLoads : 'n/a') + '  nav=' + navType);
        lines.push('win ' + innerWidth + 'x' + innerHeight +
            '  vv ' + (vv ? Math.round(vv.width) + 'x' + Math.round(vv.height) + ' s' + vv.scale.toFixed(2) : 'n/a') +
            '  dpr ' + devicePixelRatio + '  scr ' + screen.width + 'x' + screen.height);
        lines.push('frame-mq(3/4) ' + matchMedia('(min-aspect-ratio: 3/4)').matches +
            '  css ' + (fl ? (fl.disabled ? 'OFF' : 'on') : 'нет') +
            '  iframe ' + safe(() => window.top !== window.self) +
            '  fs ' + !!document.fullscreenElement + '  vis ' + document.visibilityState);
        lines.push('canvas ' + (r ? Math.round(r.left) + ',' + Math.round(r.top) + ' ' +
            Math.round(r.width) + 'x' + Math.round(r.height) : 'нет') +
            '  p5 ' + safe(() => width + 'x' + height) + '  mouse ' + safe(() => Math.round(mouseX) + ',' + Math.round(mouseY)));
        lines.push('ввод  всего / на холсте / prevented:');
        TYPES.forEach(t => {
            if (cnt[t] || t.indexOf('touch') === 0) lines.push('  ' + t.padEnd(11) + ' ' + cnt[t] + ' / ' + onCanvas[t] + ' / ' + prevented[t]);
        });
        if (last) {
            lines.push('last ' + last.type + ' @' + Math.round(last.x) + ',' + Math.round(last.y) +
                ' fingers ' + last.touches + '  target ' + last.target + '  под пальцем ' + last.underFinger);
        }
        lines.push('game: book ' + safe(() => isBookOpen()) + '  camLock ' + safe(() => isTutorialCameraLocked()) +
            '  drag ' + safe(() => isDragging) + '  pan ' + safe(() => isPanning) + '  mode ' + safe(() => appMode));
        lines.push('--- журнал (переживает перезагрузку) ---');
        log.slice(-8).forEach(l => lines.push(l));
        text.textContent = lines.join('\n');
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
    else build();
})();

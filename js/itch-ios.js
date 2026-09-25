// itch-ios.js — P-12 (только ветка `itch`, в `main` не мёржится).
//
// Safari на iPhone/iPad не пропускает касания в игру, встроенную iframe'ом
// страницы itch: ни touch-, ни pointer-события до документа игры не доходят,
// в каком бы виде itch ни показывал фрейм (развёрнутый «Run game», восстановленный
// после перезагрузки, отдельное окно `embed-upload`). Chrome на iOS — через раз.
// Та же игра, открытая адресом iframe напрямую (без страницы-хозяина), в Safari
// играется сразу. Разбор и замеры — dev/docs/tasks/P-12.
//
// Поэтому на iOS внутри iframe игра не пытается играть, а сразу показывает
// карточку со ссылкой на саму себя в отдельной вкладке. Ссылка — настоящий
// <a target="_blank">: синтетический click, который iOS шлёт после тапа по
// кликабельному элементу, в iframe доходит (проверено кнопками плашки
// диагностики), а переход по ссылке не режется блокировщиком всплывающих окон.
//
// Прогресс в отдельной вкладке живёт в хранилище `*.itch.zone` верхнего уровня,
// а не в разделённом хранилище iframe. Игрокам iOS терять нечего: во фрейме они
// не могли провести ни одной линии, а следующий заход через страницу itch ведёт
// в ту же вкладку-адрес (домен один на все заливки, путь меняется — хранилищу
// всё равно).
//
// `?iosframe=1` — считать устройство iOS (проверка на компьютере во фрейме).

(function () {
    'use strict';

    function inFrame() {
        try { return window.top !== window.self; } catch (e) { return true; }
    }

    function isIOS() {
        const ua = navigator.userAgent || '';
        if (/iPhone|iPad|iPod/.test(ua)) return true;
        // iPadOS представляется Mac'ом — выдаёт его сенсорный экран.
        return /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
    }

    function forced() {
        try { return new URLSearchParams(location.search).get('iosframe') === '1'; } catch (e) { return false; }
    }

    if (!inFrame() || !(isIOS() || forced())) return;

    function selfUrl() {
        try {
            const u = new URL(location.href);
            u.searchParams.delete('iosframe');
            return u.toString();
        } catch (e) {
            return location.href;
        }
    }

    function show() {
        const card = document.createElement('div');
        card.className = 'itch-ios-escape';
        card.innerHTML =
            '<div class="itch-ios-escape-card">' +
            '<h2>Play in a new tab</h2>' +
            '<p>On iPhone and iPad this game only responds to touch in its own tab.</p>' +
            '<a class="itch-ios-escape-btn" target="_blank" rel="noopener">Play</a>' +
            '<p class="itch-ios-escape-note">Your progress is saved there — ' +
            'come back through this page next time.</p>' +
            '</div>';
        card.querySelector('a').href = selfUrl();
        document.body.appendChild(card);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
    else show();
})();

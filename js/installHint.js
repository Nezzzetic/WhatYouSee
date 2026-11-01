// installHint.js — P-20: строка установки на релизном сайте и её условия.
//
// Строка живёт только в сборке релизного сайта (`<org>.github.io`, P-20):
// флаг SITE_BUILD ставит dev/docs/tools/build-site.js. На `main` — то есть
// на стенде Pages, на itch и в APK — флаг ложный, модуль не слушает ни одного
// события и строки нет. Стенду установка ни к чему: туда уходит каждая
// правка, а установленной копии нужен адрес, который меняется только релизом.
//
// Два вида строки (getInstallHintKind):
//   • 'prompt' — браузер отдал `beforeinstallprompt` (Android Chrome):
//     кнопка, тап зовёт системный диалог. Событие одноразовое — после тапа
//     строка прячется до следующего события, принятие прячет её насовсем.
//   • 'ios'    — iPhone/iPad: события там нет, только инструкция
//     «Share → Add to Home Screen», без кнопки.
// Уже установленная копия (display-mode: standalone / navigator.standalone)
// и событие `appinstalled` строку гасят.

// >>> P-20 SITE — строка подменяется dev/docs/tools/build-site.js. Маркеры не трогать.
const SITE_BUILD = false;
// <<< P-20 SITE

let installPromptEvent = null;
let installDone = false;

function isSiteBuild() {
    return SITE_BUILD === true;
}

function isStandaloneDisplay() {
    try {
        if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
    } catch (e) { /* старый движок без matchMedia */ }
    return navigator.standalone === true;
}

/** iPhone/iPad, включая iPad, который в Safari притворяется Mac (выдаёт касание). */
function isIosDevice() {
    const ua = navigator.userAgent || '';
    if (/iPhone|iPad|iPod/.test(ua)) return true;
    return /Macintosh/.test(ua) && (navigator.maxTouchPoints || 0) > 1;
}

/** 'prompt' | 'ios' | null — какую строку показать в «Настройках». */
function getInstallHintKind() {
    if (!isSiteBuild() || installDone || isStandaloneDisplay()) return null;
    if (installPromptEvent) return 'prompt';
    if (isIosDevice()) return 'ios';
    return null;
}

/** Тап по «Install»: системный диалог, событие тратится сразу. */
function promptInstall() {
    const ev = installPromptEvent;
    if (!ev) return;
    installPromptEvent = null;
    try {
        ev.prompt();
    } catch (e) { /* событие уже потрачено браузером */ }
    Promise.resolve(ev.userChoice).then(choice => {
        if (choice && choice.outcome === 'accepted') installDone = true;
        refreshInstallHint();
    }).catch(() => {});
    refreshInstallHint();
}

/** Перерисовать «Настройки», если они на экране, — без сброса прокрутки. */
function refreshInstallHint() {
    if (typeof bookOpen === 'undefined' || !bookOpen || bookCut !== 'settings') return;
    if (typeof rerenderVisibleBookPages === 'function') rerenderVisibleBookPages('settings');
}

if (isSiteBuild()) {
    window.addEventListener('beforeinstallprompt', ev => {
        // Без preventDefault Chrome показал бы свою плашку поверх неба (K-15:
        // всплывающего в игре нет) — зов остаётся строкой в «Настройках».
        ev.preventDefault();
        installPromptEvent = ev;
        refreshInstallHint();
    });
    window.addEventListener('appinstalled', () => {
        installDone = true;
        installPromptEvent = null;
        refreshInstallHint();
    });
}

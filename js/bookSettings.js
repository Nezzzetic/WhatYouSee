// bookSettings.js — страница настроек K-14: тумблеры и колофон (R-05).

// =============================================================================
// K-14: НАСТРОЙКИ — страница книги, первый тумблер (звук)
// =============================================================================
//
// Вход только строкой из «Index» (BOOK_CUT_LIST выше) — своей высечки нет.
// Тумблер книжный: пустая клетка / оттиск, как марка K-08 (`.achv-tile`),
// а не системный чекбокс (риск 2 дока). Список рассчитан на второй тумблер —
// вибро приедет с A-05/U-14 такой же строкой, без переверстки страницы.

function createSettingsToggleRow(labelKey, getOn, onToggle) {
    const row = document.createElement('div');
    row.className = 'settings-row';

    const label = document.createElement('span');
    label.className = 'settings-row-label';
    label.textContent = t(labelKey);
    row.appendChild(label);

    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'settings-toggle achv-tile';

    // «press» (K-02, до сих пор нигде не занят) — оттиск в буквальном смысле:
    // прижатая марка. Пустая клетка обходится вовсе без знака, как и у
    // неиспользованных клеток сцепки K-08 (achv-tile-empty).
    const sync = () => {
        const on = getOn();
        tile.classList.toggle('achv-tile-lit', on);
        tile.classList.toggle('achv-tile-empty', !on);
        tile.innerHTML = '';
        if (on) tile.appendChild(glyphSign('press', 16));
        tile.setAttribute('aria-pressed', String(on));
        tile.setAttribute('aria-label', `${t(labelKey)}: ${t(on ? 'settings.toggleOn' : 'settings.toggleOff')}`);
    };
    sync();

    tile.addEventListener('click', () => {
        onToggle(!getOn());
        sync();
    });

    row.appendChild(tile);
    return row;
}

function renderBookSettings() {
    const el = bookPart('bookSettingsList');
    if (!el) return;
    el.innerHTML = '';
    el.appendChild(createSettingsToggleRow('settings.sound', isSoundEnabled, setSoundEnabled));
    // U-14: второй тумблер на готовое место — раздельно от звука (требование
    // заказчика 2026-08-23), тем же конструктором строки.
    el.appendChild(createSettingsToggleRow('settings.haptic', isHapticEnabled, toggleHapticSetting));
    // A-07: третий тумблер тем же конструктором. Музыка гасится отдельно от
    // звука по той же причине, по которой U-14 отделила вибро: её глушат,
    // чтобы слушать своё, не трогая отклик интерфейса.
    el.appendChild(createSettingsToggleRow('settings.music', isMusicEnabled, toggleMusicSetting));
    // P-20: строка установки — только на релизном сайте (installHint.js).
    const installRow = createSettingsInstallRow();
    if (installRow) el.appendChild(installRow);
    const credits = createSettingsCredits();
    if (typeof isSiteBuild === 'function' && isSiteBuild()) credits.appendChild(createSettingsPolicyLine());
    el.appendChild(credits);
}

/**
 * P-20: строка установки на главный экран. Android — кнопка, тап зовёт
 * системный диалог (`beforeinstallprompt`); iPhone — только инструкция.
 * Нет повода (не сайт, уже установлено, браузер молчит) — строки нет.
 */
function createSettingsInstallRow() {
    const kind = typeof getInstallHintKind === 'function' ? getInstallHintKind() : null;
    if (!kind) return null;

    const row = document.createElement('div');
    row.className = 'settings-row settings-install';
    row.dataset.install = kind;

    const text = document.createElement('span');
    text.className = 'settings-row-label';
    text.textContent = t(kind === 'ios' ? 'settings.installIos' : 'settings.install');
    row.appendChild(text);

    if (kind === 'prompt') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'settings-install-btn';
        btn.textContent = t('settings.installBtn');
        btn.addEventListener('click', () => promptInstall());
        row.appendChild(btn);
    }
    return row;
}

/**
 * P-20: ссылка на страницу политики — одна, относительным путём и только на
 * релизном сайте. В APK её нет по той же причине, что адрес авторства ниже
 * остаётся текстом: в WebView ссылка увела бы из приложения без пути назад.
 */
function createSettingsPolicyLine() {
    const line = document.createElement('div');
    line.className = 'settings-policy';
    const link = document.createElement('a');
    link.href = 'privacy-policy.html';
    link.textContent = t('settings.privacy');
    line.appendChild(link);
    return line;
}

/**
 * A-07: указание авторства музыки — требование лицензии CC BY 4.0, под которой
 * отданы оба трека. Страница настроек выбрана как место, где кредит найдут,
 * не ища: другого экрана «о программе» в книге нет.
 *
 * Адрес остаётся текстом, а не ссылкой: в WebView нативной сборки (P-02)
 * внешний href открылся бы в том же окне, и вернуться в игру было бы нечем.
 * CC-BY требует указать адрес, а не сделать его кликабельным.
 */
function createSettingsCredits() {
    const box = document.createElement('div');
    box.className = 'settings-credits';

    const head = document.createElement('div');
    head.className = 'settings-credits-head';
    head.textContent = t('settings.credits');
    box.appendChild(head);

    (typeof MUSIC_CREDITS !== 'undefined' ? MUSIC_CREDITS : []).forEach(line => {
        const row = document.createElement('div');
        row.className = 'settings-credits-line';
        row.textContent = line;
        box.appendChild(row);
    });

    return box;
}

// U-14: включение тумблера вибро обязано само себя подтвердить — короткий
// импульс, чтобы игрок почувствовал, что включил именно вибро (риск дока).
// Выключение молчит: setHapticEnabled(false) само гасит уже идущий паттерн.
// Клик — по DOM-кнопке, не по канвасу p5, жест туда не долетает сам по себе —
// initAudio() зовётся здесь явно, как у claimAchievementStep (A-03), иначе
// самый первый в жизни игрока тап по этой кнопке был бы холостым.
function toggleHapticSetting(on) {
    if (typeof initAudio === 'function') initAudio();
    setHapticEnabled(on);
    if (on && typeof hapticPulse === 'function') hapticPulse(HAPTIC_TOGGLE_MS);
}

// A-07: та же оговорка, что у вибро, и по той же причине — клик по DOM-кнопке
// мимо канваса p5, `_interacted` сам по себе не встанет. Без `initAudio()`
// первый в жизни игрока тап по этому тумблеру включил бы настройку, но не
// музыку: `startMusic()` молчит, пока жеста не было.
function toggleMusicSetting(on) {
    if (typeof initAudio === 'function') initAudio();
    setMusicEnabled(on);
}

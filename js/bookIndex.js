// bookIndex.js — оглавление книги K-10/K-19 (R-05), U-41 дала Ex Libris и
// Настройкам собственные заголовки категорий.

/** K-19: строка оглавления — «Ch. <римская> · <имя>», одна форма для атласа и штампов. */
function formatChapterIndexTitle(chapterNo, name) {
    return t('book.indexChapterTitle', { n: toRoman(chapterNo), name });
}

/**
 * «Оглавление»: временный плоский список вместо разворота-определителя (K-10).
 * Строка тапабельна — прыгает сразу на нужную главу, это и есть «объём решают
 * главы, а не длина свитка» из концепта.
 */
/**
 * K-10: строка главы — имя с линейкой из точек (как в сцепке K-08), счёт и
 * колонцифра. Неразрезанная глава несёт знак замка (K-24, был нож — эта роль
 * ножа осталась только за разрезанием страниц) и порог в ✦ вместо счёта, но
 * с той же колонцифрой, что у разрезанной (страница недостижима постранично,
 * но пейджер её уже показывает заглушкой `atlas.pageLocked` — сюда ведёт тот
 * же тап). Сургучная точка — только там, где есть настоящее «взять» (Штампы);
 * у атласа нет кнопки забора, поэтому просто вести не при чём.
 */
function createBookIndexRow(title, folioN, countText, opts) {
    const o = opts || {};
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'book-index-row';

    // K-23: жёлоб держит место у ЛЮБОЙ строки оглавления — не только затем,
    // чтобы разрезанная и запертая глава не отличались геометрией, но и
    // чтобы заголовки всех строк (включая Ex Libris и Настройки, ни замка,
    // ни точки не знающие) лежали на одной вертикали, а не рвали список
    // вразнобой (фидбек с телефона 2026-08-31). K-24: замок и сургучная точка
    // на одной строке никогда не встречаются (замок — атлас/штампы взаперти,
    // точка — только разрезанные штампы с чем взять) — жёлоб на двоих один,
    // не два: второй пустой слот только раздвигал бы список зазором без смысла.
    const icon = document.createElement('span');
    icon.className = 'book-index-row-icon';
    if (o.locked) {
        icon.classList.add('achv-row-icon-uncut');
        icon.appendChild(glyphSign('lock', 16));
    } else if (o.wax) {
        const wax = document.createElement('span');
        wax.className = 'book-index-row-wax book-index-row-wax-lit';
        icon.appendChild(wax);
    }
    row.appendChild(icon);

    const head = document.createElement('span');
    head.className = 'book-index-row-head';

    const label = document.createElement('span');
    label.className = 'book-index-row-title';
    label.textContent = title;
    head.appendChild(label);

    const dots = document.createElement('span');
    dots.className = 'book-index-row-dots';
    head.appendChild(dots);

    const count = document.createElement('span');
    count.className = 'book-index-row-status';
    // K-16: в статусе строки может стоять не число, а знак кассы (K-02) — эмодзи
    // в игре нет ни одного, а «открыто» у Ex Libris нечем считать.
    if (o.countSign) count.appendChild(glyphSign(o.countSign, 16));
    else count.textContent = countText;
    head.appendChild(count);

    row.appendChild(head);

    if (folioN !== null) {
        const folio = document.createElement('span');
        folio.className = 'book-index-row-folio';
        folio.textContent = t('book.folio', { n: folioN });
        row.appendChild(folio);
    }

    return row;
}

function renderBookIndex() {
    const el = document.getElementById('bookIndex');
    if (!el) return;
    el.innerHTML = '';

    const atlasSec = document.createElement('div');
    atlasSec.className = 'book-index-sec';
    const atlasTitle = document.createElement('div');
    atlasTitle.className = 'book-index-sec-title';
    atlasTitle.textContent = t('book.cutAtlas');
    atlasSec.appendChild(atlasTitle);
    for (let i = 0; i < ATLAS_PAGE_COUNT; i++) {
        const unlocked = isAtlasPageUnlocked(i);
        // K-19: неразрезанная глава не раскрывает литературное имя — «?».
        const title = formatChapterIndexTitle(i + 1, unlocked ? t('atlas.chapterTitle' + i) : '?');
        const row = unlocked
            ? createBookIndexRow(
                title,
                getAtlasChapterFolio(i),
                `${ATLAS_PAGES[i].filter(isShapeCreated).length} / ${ATLAS_PAGES[i].length}`
            )
            : createBookIndexRow(
                title,
                getAtlasChapterFolio(i),
                // V-17 / S-03: тот же уровень, что и на самой запертой странице
                // атласа (atlas.pageLocked) — иначе оглавление и разворот
                // называют разные пороги для одной главы.
                t('book.indexOpensAtLevel', { n: getAtlasChapterLevel(i) }),
                { locked: true }
            );
        row.addEventListener('click', () => {
            setBookPageIndex('atlas', i);
            switchBookCut('atlas');
        });
        atlasSec.appendChild(row);
    }
    el.appendChild(atlasSec);

    const stampsSec = document.createElement('div');
    stampsSec.className = 'book-index-sec';
    const stampsTitle = document.createElement('div');
    stampsTitle.className = 'book-index-sec-title';
    stampsTitle.textContent = t('book.cutStamps');
    stampsSec.appendChild(stampsTitle);
    for (let i = 1; i < REWARD_PAGE_COUNT; i++) {
        const page = REWARD_PAGES[i];
        const unlocked = isRewardPageUnlocked(i);
        // K-19: неразрезанная глава не раскрывает литературное имя — «?».
        const title = formatChapterIndexTitle(i, unlocked ? page.title : '?');

        let row;
        if (unlocked) {
            // K-19: счёт главы — прижатые марки (сумма stepIndex) из общего
            // числа марок главы, а не пройденные цепочки целиком.
            const { pressed, total } = getRewardPagePressedStamps(i);
            row = createBookIndexRow(
                title,
                getStampsChapterFolio(i),
                `${pressed} / ${total}`,
                { wax: rewardPageHasClaimable(i) }
            );
        } else {
            row = createBookIndexRow(
                title,
                getStampsChapterFolio(i),
                t('book.indexOpensAtLevel', { n: getRewardPageUnlockLevel(i) }),
                { locked: true }
            );
        }
        row.addEventListener('click', () => {
            setBookPageIndex('rewards', i);
            switchBookCut('stamps');
        });
        stampsSec.appendChild(row);
    }
    el.appendChild(stampsSec);

    const exSec = document.createElement('div');
    exSec.className = 'book-index-sec';
    const exTitle = document.createElement('div');
    exTitle.className = 'book-index-sec-title';
    exTitle.textContent = t('book.cutExLibris');
    exSec.appendChild(exTitle);
    const exUnlocked = typeof isObservatoryUnlocked === 'function' && isObservatoryUnlocked();
    const exRow = createBookIndexRow(
        t('book.cutExLibris'),
        getExLibrisFolio(),
        exUnlocked ? '' : t('book.indexOpensAtLevel', { n: OBSERVATORY_UNLOCK_LEVEL }),
        exUnlocked ? { countSign: 'crescent' } : undefined
    );
    exRow.addEventListener('click', () => switchBookCut('exlibris'));
    exSec.appendChild(exRow);
    el.appendChild(exSec);

    // K-14: настройки — строкой в конце оглавления, единственный вход
    // (страница не висит на своей высечке). Ни счёта, ни замка — доступна
    // всегда, у неё нет условия открытия. U-41: собственная категория
    // «Прочее» — без неё строка молча читалась продолжением Ex Libris.
    const settingsSec = document.createElement('div');
    settingsSec.className = 'book-index-sec';
    const settingsTitle = document.createElement('div');
    settingsTitle.className = 'book-index-sec-title';
    settingsTitle.textContent = t('book.indexOther');
    settingsSec.appendChild(settingsTitle);
    const settingsRow = createBookIndexRow(t('book.cutSettings'), getSettingsFolio(), '');
    settingsRow.addEventListener('click', () => switchBookCut('settings'));
    settingsSec.appendChild(settingsRow);
    el.appendChild(settingsSec);
}

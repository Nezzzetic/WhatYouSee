# Музыка · A-07

Оба трека — **Scott Buckley**, лицензия **CC BY 4.0**. Коммерческое использование
разрешено лицензией, включая публикацию в магазинах приложений; единственное
обязательство — указание авторства, оно живёт на странице настроек книги
(`js/constants.js` → `MUSIC_CREDITS`, `js/ui.js` → `createSettingsCredits`).

Скачано 2026-09-05 с `https://www.scottbuckley.com.au/library/`.

| Файл | Вещь | Длительность | Источник |
|---|---|---|---|
| `in-this-moment.mp3` | In This Moment | 3:20 | https://www.scottbuckley.com.au/library/in-this-moment/ |
| `unraveling.mp3` | Unraveling | 7:24 | https://www.scottbuckley.com.au/library/unraveling/ |

Прямые адреса мастеров (320 kbps), если понадобится пережать заново:

```
https://www.scottbuckley.com.au/library/wp-content/uploads/2026/05/Unraveling.mp3
```

`In This Moment` качается со своей страницы кнопкой — прямой адрес не записан,
потому что путь у него другого года выпуска и угадывать его незачем.

## Строка авторства

Лицензия требует четырёх вещей: название, автор, код лицензии, адрес. Автор
предлагает свою формулу — «[Track Title] by Scott Buckley — released under
CC-BY 4.0» построчно на каждую вещь. Дословно она не влезла в ширину книги на
телефоне и рвалась по дефису внутри «CC-BY», поэтому в игре стоит колофон той же
полноты — вещь с автором построчно, лицензия и адрес общей строкой:

```
In This Moment — Scott Buckley
Unraveling — Scott Buckley
Released under CC-BY 4.0 · www.scottbuckley.com.au
```

Лицензия отдельно запрещает перезаливать сами треки как музыку (в стриминг,
в фонотеки) и регистрировать их в системах вроде YouTube Content ID. Использование
внутри игры этого не касается.

## Что лежит в репозитории

- `in-this-moment.mp3`, `unraveling.mp3` — **96 kbps стерео**, выровненные к общим
  −18,4 LUFS (пики −2,1 и −2,9 dBFS). 7,4 МБ на двоих. Это то, что едет на Pages
  и в APK.
- `masters/` — оригиналы 320 kbps, 25,7 МБ. Под `.gitignore`: в публичном
  репозитории им делать нечего, а игра без них собирается. Нужны только чтобы
  пережать заново, если громкость или битрейт придётся менять.

## Как пережималось

`ffmpeg` в проекте не установлен — бинарь брался разово (`npm i ffmpeg-static`)
и в репозиторий не попал. Замер громкости:

```
ffmpeg -i masters/<файл> -af ebur128=peak=true -f null -
```

Пережатие (числа `-0.9` и `-1.5` дБ — разница между измеренными −17,1 / −16,5 LUFS
и общей целью −18,4):

```
ffmpeg -i masters/InThisMoment.mp3 -af "volume=-0.9dB" \
  -c:a libmp3lame -b:a 96k -ar 44100 -ac 2 -map_metadata 0 -id3v2_version 3 in-this-moment.mp3
ffmpeg -i masters/Unraveling.mp3 -af "volume=-1.5dB" \
  -c:a libmp3lame -b:a 96k -ar 44100 -ac 2 -map_metadata 0 -id3v2_version 3 unraveling.mp3
```

⚠️ Пережимать **не в ту же папку под тем же именем в другом регистре**: Windows
не различает `Unraveling.mp3` и `unraveling.mp3`, и ffmpeg с `-y` уничтожит
исходник, открыв его как выход. Отсюда и разделение на `masters/` и корень.

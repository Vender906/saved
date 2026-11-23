# Saved

PWA для збереження постів і відео з TikTok, YouTube, Threads, Instagram, Telegram, X, Reddit та будь-яких сайтів в одному місці: папки, теги, нотатки, пошук.

Дані зберігаються локально в браузері (IndexedDB), сервер не потрібен. Для резервної копії та перенесення між пристроями є експорт та імпорт у JSON (⚙ → Налаштування).

## Запуск

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # збірка в dist/
npm run preview   # перевірка зібраної версії (з service worker)
```

## Як додавати

- **Android**: встанови застосунок на головний екран. Він з'явиться в меню «Поділитися» (Web Share Target).
- **iPhone**: «Копіювати посилання» в соцмережі, потім у Saved натисни «＋ Додати»: посилання вставиться з буфера обміну.
- **Комп'ютер**: кнопка-закладка в налаштуваннях відкриває Saved з поточною сторінкою.

## Превʼю

Назва, картинка та автор підтягуються автоматично через власний сервіс на Cloudflare Workers ([worker/](worker/), адреса задана в [src/config.ts](src/config.ts)):

- розгортає короткі посилання TikTok (`vm.tiktok.com`) і дістає підпис, автора, обкладинку;
- дістає текст і фото постів Threads (їх видно лише краулерам);
- віддає картинки, щоб застосунок зберігав їхні копії (посилання соцмереж на картинки живуть кілька днів);
- користуватись ним можуть лише сайти зі списку `ALLOWED_ORIGINS` у [worker/wrangler.toml](worker/wrangler.toml).

Запасні варіанти: YouTube через noembed.com, решта через microlink.io (~50 запитів на день). Instagram блокує сервери дата-центрів, тому для нього превʼю є не завжди.

Оновити сервіс: `cd worker && npx wrangler deploy`.

## Хостинг

Сайт викладається на **GitHub Pages** автоматично після кожного push у `main` (див. [.github/workflows/deploy.yml](.github/workflows/deploy.yml)): https://vender906.github.io/saved/

Одноразове налаштування: Settings → Pages → Source: **GitHub Actions**.

Підійде й будь-який інший статичний хостинг (Vercel, Netlify, Cloudflare Pages): там сайт живе в корені, тож `BASE_PATH` задавати не треба.

## Структура

- `src/db.ts`: модель даних (Dexie / IndexedDB)
- `src/platforms.ts`: розпізнавання платформ і очищення посилань від трекінгу
- `src/metadata.ts`: завантаження превʼю
- `src/search.ts`: пошук (`#тег` шукає лише по тегах)
- `src/components/`: інтерфейс

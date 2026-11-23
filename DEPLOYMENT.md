# Выпуск SwissCourt

Основной репозиторий — `infom/swisscourt` на GitHub. Готовый выпуск включает ZIP для локального запуска и `SHA256SUMS.txt`.

1. Согласовать версию в `package.json`, `package-lock.json`, `app/app.js`, `README.md` и `CHANGELOG.md`.
2. Собрать и проверить приложение командами `npm ci`, `npm run build`, `npm test`.
3. Собрать архив командой `python scripts/package-release.py`.
4. Отправить коммит и тег выпуска на GitHub и прикрепить оба файла из `artifacts/` к релизу.

Сборка также содержит Worker ES-модуль `dist/server/index.js` со встроенными статическими ресурсами. Данные рабочего турнира хранятся в браузере и не входят в архив.

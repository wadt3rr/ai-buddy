# Avito AI Buddy

Фронтенд чат-помощника для адаптации стажёров. В приложении есть вход по почте и паролю, история переписки, отправка сообщений и переключение темы.

Проект написан на React и TypeScript. Для сборки используется Vite, для стилей — Tailwind CSS, для запросов — Axios. Ответы ассистента отображаются в Markdown.

## Локальный запуск

Нужны Node.js 24, npm и запущенный backend с PostgreSQL.

Команды из каталога `frontend` для PowerShell

```powershell
npm.cmd install
Copy-Item .env.example .env.local
npm.cmd run dev
```

Адрес приложения выводится в терминале. По умолчанию — http://localhost:5173/.

## Переменные окружения

Настройки фронтенда задаются в `.env.local`.

| Переменная | Значение по умолчанию | Назначение |
| --- | --- | --- |
| `VITE_API_URL` | `/api/v1` | Базовый путь API |
| `BACKEND_URL` | `http://localhost:8080` | Адрес backend для Vite proxy |

После изменения настроек нужно перезапустить Vite.

## Команды

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run test
npm.cmd run test:coverage
npm.cmd run build
```

Сборка сохраняется в `dist/`. Подробности тестирования — в [TESTING.md](TESTING.md).

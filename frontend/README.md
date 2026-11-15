# Avito AI Buddy

## Установка и запуск

Нужны Node.js 24 и npm. Выполняйте команды в каталоге с `package.json`:

```sh
npm install
cp .env.example .env.local
npm run dev
```

Откройте адрес из терминала — обычно http://localhost:5173.

## Переменные окружения и запуск с моками

Локальные настройки задаются в `.env.local`. Для запуска без backend оставьте:

```dotenv
VITE_API_URL=/api
VITE_ENABLE_MOCKS=true
```

`VITE_API_URL` — базовый адрес API с префиксом `/api`. `VITE_ENABLE_MOCKS` включает MSW только при значении `true`. В режиме разработки моки также включены по умолчанию через `.env.development`.

Данные для входа: **intern@avito.ru** / **password123**. MSW запускается автоматически; отдельный сервер не нужен.

## Запуск с настоящим backend

В `.env.local` отключите моки и укажите адрес своего API вместо примера:

```dotenv
VITE_API_URL=http://localhost:8000/api
VITE_ENABLE_MOCKS=false
```

После изменения переменных перезапустите frontend:

```sh
npm run dev
```

Для API на другом origin backend должен разрешать CORS с cookies для адреса frontend. Vite proxy в проекте не настроен.

## Тестирование

```sh
npm test                   # Все тесты
npm run test:watch         # Повтор при изменении файлов
npm run test:coverage      # Покрытие
```

HTML-отчёт: `coverage/index.html`. Порог покрытия строк — 80,01%.

## Дополнительные команды

```sh
npm run build             # Сборка в dist/
npm run preview           # Просмотр готовой сборки
npm run typecheck         # Проверка TypeScript
npm run lint              # Проверка ESLint
```

Если PowerShell блокирует `npm.ps1`, используйте `npm.cmd` вместо `npm`:

```powershell
npm.cmd run dev
```

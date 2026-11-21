# Пепел звезд — Web Portal & Ticket System

Веб-портал и тикет-система приема обращений для экосистемы Telegram-бота поддержки `@ashesstars_bot`. Проект решает задачу быстрого перенаправления трафика из социальных сетей в нативные приложения и автоматической маршрутизации обращений пользователей в администраторскую супергруппу.

🔗 **Живой сайт (Production):** [pepel-zvezd-v2.vercel.app](https://vercel.app)

---

## Ключевой функционал

* **Система тикетов с категоризацией:** Пользователи могут отправить обращение прямо с сайта без перехода в мессенджер, выбрав категорию (**«Отзывы»** или **«Вызов админа»**).
* **Автоматическая маршрутизация в Telegram:** При отправке обращения сервер автоматически генерирует уникальный 7-значный ID, создает изолированную форум-ветку (`createForumTopic`) с соответствующим тегом (`#отзыв_ID` или `#админ_ID`) и публикует туда сообщение.
* **Кроссплатформенный диплинкинг:** Прямой запуск нативных приложений Telegram (`tg://resolve`) и TikTok (Universal Links) на iOS и Android в обход промежуточных веб-заглушек.
* **Защита от спама и инъекций:**
  * Клиентский rate-limiting (блокировка кнопки на 30 секунд с сохранением таймера в `localStorage` даже при перезагрузке страницы).
  * Серверная валидация длины текста и экранирование HTML-спецсимволов (`escapeHTML`) для защиты разметки Telegram API.
  * Сокрытие токена бота и ID чата в защищенных переменных окружения (`Environment Variables`).
* **Адаптивный UI & Web Audio:** Космический интерфейс в стиле Glassmorphism с GPU-ускоренной CSS-анимацией и фоновым эмбиентом, адаптированным под политики автовоспроизведения мобильных браузеров.
* **Аналитика трафика:** Интегрирована система мониторинга посещений **Vercel Web Analytics**.

---

## Стек технологий и архитектура

Проект спроектирован с разделением на облачную (Serverless) и нативную (C++17) архитектуру:

* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6+), Web Audio API, `localStorage`.
* **Backend (Production):** Node.js (Vercel Serverless Functions, нативный модуль `https` по IPv4) для обхода сетевых ограничений и проксирования запросов к Telegram Bot API.
* **Client-Side Security (C++ / WebAssembly):** Модуль `security_engine.cpp` на 64-битном алгоритме хэширования FNV-1a для вычисления Proof-of-Work (криптографическая защита от ботов) и генерации ID обращений.
* **Backend (High-Load C++17 Alternative):** Многопоточный HTTP-сервер на C++17 (`cpp-httplib`, `nlohmann/json`, `libcurl`) с верификацией Proof-of-Work подписей и поддержкой категорий тикетов.

---

## Структура репозитория

```text
├── index.html                           # Адаптивный интерфейс, диплинки и клиентская защита от спама
├── api/
│   └── send.js                          # Serverless-обработчик (Node.js) для Vercel
├── cpp_modules/
│   ├── wasm_security/
│   │   └── security_engine.cpp          # C++ модуль Proof-of-Work и генерации ID (под Emscripten/Wasm)
│   └── backend_server/
│       ├── server.cpp                   # Многопоточный C++17 HTTP-сервер (cpp-httplib + libcurl)
│       └── CMakeLists.txt               # Конфигурация сборки CMake
└── README.md                            # Документация проекта
```

---

## Локальная сборка C++ бэкенда (Linux)

Для запуска высоконагруженной версии сервера на C++17 требуются компилятор с поддержкой C++17, `CMake` и библиотека `libcurl`:

```bash
# Установка зависимостей (Ubuntu/Debian)
sudo apt update && sudo apt install g++ cmake libcurl4-openssl-dev -y

# Сборка проекта
cd cpp_modules/backend_server
mkdir build && cd build
cmake ..
make -j\$(nproc)

# Запуск с передачей переменных окружения
TG_BOT_TOKEN="your_bot_token" TG_CHAT_ID="-100xxxxxxxxxx" ./ticket_server
```

# Пепел звезд — Web Portal & Ticket System

Веб-портал и тикет-система приема обращений для экосистемы Telegram-бота поддержки `@ashesstars_bot`.

🔗 **Живой сайт (Production):** [pepel-zvezd-v2.vercel.app](https://vercel.app)

## Архитектура и стек технологий

Проект реализован с разделением на облачную (Serverless) и нативную (C++17) архитектуру:

* **Frontend:** HTML5, CSS3 (Glassmorphism, GPU-ускоренные CSS-анимации), Vanilla JavaScript (ES6+), Web Audio API, Deep Linking (iOS URI Schemes / Android Intents).
* **Client-Side Security (C++ / WebAssembly):** Модуль `security_engine.cpp` на 64-битном алгоритме хэширования FNV-1a для вычисления Proof-of-Work (защита от автоматического спама) и генерации уникальных 7-значных ID обращений.
* **Backend (Production):** Node.js (Vercel Serverless Functions) с изоляцией секретов через Environment Variables, клиентским rate-limiting и HTML-экранированием ввода.
* **Backend (High-Load C++ Alternative):** Многопоточный HTTP-сервер на C++17 (`cpp-httplib`, `nlohmann/json`, `libcurl`) с криптографической верификацией Proof-of-Work подписей.
* **Telegram Bot API:** Автоматическое создание изолированных форум-топиков (`createForumTopic`) в супергруппе администраторов под каждое обращение.

## Структура репозитория

```text
├── index.html                           # Адаптивный интерфейс и клиентская логика
├── api/
│   └── send.js                          # Serverless-обработчик (Node.js) для Vercel
└── cpp_modules/
    ├── wasm_security/
    │   └── security_engine.cpp          # C++ модуль Proof-of-Work и генерации ID (под Emscripten/Wasm)
    └── backend_server/
        ├── server.cpp                   # Многопоточный C++17 HTTP-сервер (cpp-httplib + libcurl)
        └── CMakeLists.txt               # Конфигурация сборки CMake
```

## Сборка C++ бэкенда (Linux)

```bash
cd cpp_modules/backend_server
mkdir build && cd build
cmake ..
make -j\$(nproc)
TG_BOT_TOKEN="your_token" TG_CHAT_ID="-100xxxxxxxxxx" ./ticket_server
```

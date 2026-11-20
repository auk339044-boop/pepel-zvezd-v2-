# Пепел звезд — Web Portal & Ticket System

Веб-портал и система приема обращений для экосистемы Telegram-бота поддержки `@ashesstars_bot`.

## Стек технологий
- **Frontend:** HTML5, CSS3 (Glassmorphism, CSS Animations), Vanilla JavaScript (ES6+)
- **Backend:** Node.js (Vercel Serverless Functions)
- **API & Интеграции:** Telegram Bot API (`createForumTopic`, `sendMessage`), Deep Linking (iOS/Android URI Schemes)

## Реализованные задачи
- Адаптивный интерфейс с динамическим фоном и управлением Web Audio API с учетом политик автовоспроизведения мобильных браузеров.
- Кроссплатформенный диплинкинг для прямого запуска нативных приложений Telegram и TikTok на iOS и Android.
- Безопасная отправка обращений через прокси-функцию на Node.js (сокрытие токена бота через Environment Variables и защита от CORS/блокировок).
- Автоматическая генерация уникальных тикетов (`#ID`) и создание изолированных топиков (форум-веток) в супергруппе администраторов.

import https from 'https';

// Хранилище в оперативной памяти сервера для отслеживания частоты запросов по IP
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // Окно времени: 1 минута
const MAX_REQUESTS_PER_WINDOW = 2;      // Максимум 2 обращения в минуту с одного IP
const MIN_INTERVAL_MS = 20 * 1000;      // Минимум 20 секунд между запросами

let lastMessageText = '';

function tgRequest(token, method, payload) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(payload);
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${token}/${method}`,
            method: 'POST',
            family: 4,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Invalid Telegram response'));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.write(postData);
        req.end();
    });
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
       const origin = req.headers.origin || '';
const referer = req.headers.referer || '';
const currentHost = req.headers.host || 'pepel-zvezd-v2.vercel.app';

if ((origin && !origin.includes(currentHost)) && (referer && !referer.includes(currentHost))) {
    return res.status(403).json({ ok: false, description: 'Доступ запрещен (Invalid Origin)' });
}

export default async function handler(req, res) {
    // 1. Разрешаем только POST-запросы
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, description: 'Method not allowed' });
    }

    // 2. Проверка Origin/Referer (отсекаем прямые скрипты и curl-запросы)
    const origin = req.headers.origin || '';
    const referer = req.headers.referer || '';
    const allowedDomain = 'pepel-zvezd-v2.vercel.app';
    
    if (!origin.includes(allowedDomain) && !referer.includes(allowedDomain)) {
        return res.status(403).json({ ok: false, description: 'Доступ запрещен (Invalid Origin)' });
    }

    // 3. Серверный Rate Limiting по IP-адресу (защита от L7 DDoS и флуда)
    const clientIp = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const now = Date.now();

    // Очищаем старые записи, чтобы не забивать оперативную память при атаке с разных IP
    if (rateLimitMap.size > 1000) {
        rateLimitMap.clear();
    }

    const userRecord = rateLimitMap.get(clientIp) || { count: 0, firstRequestTime: now, lastRequestTime: 0 };

    if (now - userRecord.lastRequestTime < MIN_INTERVAL_MS) {
        return res.status(429).json({ ok: false, description: 'Слишком частые запросы. Подождите 20 секунд.' });
    }

    if (now - userRecord.firstRequestTime > RATE_LIMIT_WINDOW_MS) {
        // Сбрасываем счетчик, если прошла минута
        userRecord.count = 1;
        userRecord.firstRequestTime = now;
    } else {
        userRecord.count += 1;
        if (userRecord.count > MAX_REQUESTS_PER_WINDOW) {
            return res.status(429).json({ ok: false, description: 'Превышен лимит обращений (макс. 2 в минуту).' });
        }
    }
    userRecord.lastRequestTime = now;
    rateLimitMap.set(clientIp, userRecord);

    // 4. Проверка переменных окружения
    const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
    const TG_CHAT_ID = process.env.TG_CHAT_ID;

    if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
        return res.status(500).json({ ok: false, description: 'Ошибка конфигурации сервера' });
    }

    // 5. Валидация тела запроса и защита от дубликатов
    const { text, category } = req.body || {};

    if (!text || typeof text !== 'string' || text.trim().length < 2) {
        return res.status(400).json({ ok: false, description: 'Сообщение слишком короткое' });
    }

    const cleanText = text.trim();
    if (cleanText === lastMessageText) {
        return res.status(400).json({ ok: false, description: 'Дубликат сообщения отклонен' });
    }

    try {
        const ticketId = Math.floor(1000000 + Math.random() * 9000000);
        const isAdminCall = category === 'admin';
        const tagPrefix = isAdminCall ? 'админ' : 'отзыв';
        const categoryLabel = isAdminCall ? '🚨 Вызов админа' : '⭐️ Отзыв';
        
        const topicTitle = `#${tagPrefix}_${ticketId}`;
        const safeText = escapeHTML(cleanText.slice(0, 1000));

        const topicRes = await tgRequest(TG_BOT_TOKEN, 'createForumTopic', {
            chat_id: TG_CHAT_ID,
            name: topicTitle
        });

        if (!topicRes.ok) {
            return res.status(200).json(topicRes);
        }

        const threadId = topicRes.result.message_thread_id;
        const msgRes = await tgRequest(TG_BOT_TOKEN, 'sendMessage', {
            chat_id: TG_CHAT_ID,
            message_thread_id: threadId,
            text: `📬 <b>Обращение ${topicTitle}</b>\n📌 <b>Категория:</b> ${categoryLabel}\n\n${safeText}`,
            parse_mode: 'HTML'
        });

        if (msgRes.ok) {
            lastMessageText = cleanText;
        }

        return res.status(200).json(msgRes);
    } catch (error) {
        return res.status(500).json({ ok: false, description: error.message });
    }
}

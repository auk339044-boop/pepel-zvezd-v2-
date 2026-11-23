import https from 'https';

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const MAX_REQUESTS_PER_WINDOW = 2;
const MIN_INTERVAL_MS = 20 * 1000;

let lastMessageText = '';

function httpsRequest(options, payloadStr = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: data ? JSON.parse(data) : {} });
                } catch (e) {
                    resolve({ status: res.statusCode, data: {} });
                }
            });
        });
        req.on('error', (err) => reject(err));
        if (payloadStr) req.write(payloadStr);
        req.end();
    });
}

function tgRequest(token, method, payload) {
    const postData = JSON.stringify(payload);
    return httpsRequest({
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/${method}`,
        method: 'POST',
        family: 4,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    }, postData).then(r => r.data);
}

async function checkDeviceBan(supabaseUrl, supabaseKey, deviceHash) {
    if (!supabaseUrl || !supabaseKey || !deviceHash || deviceHash === 'fp_fallback') return null;
    try {
        const baseOrigin = new URL(supabaseUrl.trim()).origin;
        const cleanHash = String(deviceHash).trim();
        const path = `/rest/v1/banned_devices?device_hash=eq.${encodeURIComponent(cleanHash)}&select=reason`;
        
        const res = await httpsRequest({
            hostname: new URL(baseOrigin).hostname,
            port: 443,
            path: path,
            method: 'GET',
            family: 4,
            headers: { 'apikey': supabaseKey.trim() }
        });

        if (Array.isArray(res.data) && res.data.length > 0) {
            const first = res.data.shift();
            return first.reason || 'Доступ ограничен';
        }
    } catch (e) {
        console.error('Ban check error:', e.message);
    }
    return null;
}

async function banDeviceImmediately(supabaseUrl, supabaseKey, deviceHash, reason) {
    if (!supabaseUrl || !supabaseKey || !deviceHash || deviceHash === 'fp_fallback') return;
    try {
        const baseOrigin = new URL(supabaseUrl.trim()).origin;
        const payload = JSON.stringify({
            device_hash: String(deviceHash).trim(),
            reason: reason
        });

        await httpsRequest({
            hostname: new URL(baseOrigin).hostname,
            port: 443,
            path: '/rest/v1/banned_devices',
            method: 'POST',
            family: 4,
            headers: {
                'Content-Type': 'application/json',
                'apikey': supabaseKey.trim(),
                'Prefer': 'resolution=ignore-duplicates',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, payload);
    } catch (e) {}
}

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        "'": '&#39;',
        '"': '&quot;'
    }[tag]));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, description: 'Method not allowed' });
    }

    // 1. Защита периметра: проверяем Origin и наличие кастомного заголовка от нашего клиента
    const origin = req.headers.origin || '';
    const clientSig = req.headers['x-portal-client'] || '';
    if ((origin && !origin.includes('.vercel.app') && !origin.includes('localhost')) || clientSig !== 'pepel-v2-verified') {
        return res.status(403).json({ ok: false, description: 'Доступ запрещен (Security Perimeter)' });
    }

    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const clientIp = String(rawIp).split(',').shift().trim();
    const now = Date.now();

    if (rateLimitMap.size > 1000) rateLimitMap.clear();

    const userRecord = rateLimitMap.get(clientIp) || { count: 0, firstRequestTime: now, lastRequestTime: 0 };
    if (now - userRecord.lastRequestTime < MIN_INTERVAL_MS) {
        return res.status(429).json({ ok: false, description: 'Слишком частые запросы. Подождите 20 секунд.' });
    }
    if (now - userRecord.firstRequestTime > RATE_LIMIT_WINDOW_MS) {
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

    const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
    const TG_CHAT_ID = process.env.TG_CHAT_ID;
    const OWNER_TG_ID = process.env.OWNER_TG_ID;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
        return res.status(500).json({ ok: false, description: 'Ошибка конфигурации сервера' });
    }

    const { text, category, deviceHash, honeypot } = req.body || {};

    // 2. ЛОВУШКА HONEYPOT: Если скрытое поле заполнено — это 100% спам-бот
    if (honeypot && String(honeypot).trim().length > 0) {
        await banDeviceImmediately(SUPABASE_URL, SUPABASE_KEY, deviceHash, 'Авто-бан: сработала Honeypot-ловушка (Спам-бот)');
        if (OWNER_TG_ID) {
            await tgRequest(TG_BOT_TOKEN, 'sendMessage', {
                chat_id: OWNER_TG_ID.trim(),
                text: `🍯 <b>Сработала Honeypot-ловушка!</b>\nБот заблокирован по железу: <code>${escapeHTML(deviceHash || 'unknown')}</code>\n🌐 IP: <code>${clientIp}</code>`,
                parse_mode: 'HTML'
            }).catch(() => {});
        }
        // Возвращаем фейковый успех, чтобы бот думал, что сообщение прошло
        return res.status(200).json({ ok: true });
    }

    // 3. Проверка черного списка по железу
    const banReason = await checkDeviceBan(SUPABASE_URL, SUPABASE_KEY, deviceHash);
    if (banReason) {
        return res.status(403).json({ ok: false, description: `⛔️ Устройство заблокировано (${banReason})` });
    }

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
            chat_id: TG_CHAT_ID.trim(),
            name: topicTitle
        });

        if (!topicRes.ok) {
            return res.status(200).json(topicRes);
        }

        const threadId = topicRes.result.message_thread_id;
        const msgRes = await tgRequest(TG_BOT_TOKEN, 'sendMessage', {
            chat_id: TG_CHAT_ID.trim(),
            message_thread_id: threadId,
            text: `📬 <b>Обращение ${topicTitle}</b>\n📌 <b>Категория:</b> ${categoryLabel}\n\n${safeText}`,
            parse_mode: 'HTML'
        });

        if (msgRes.ok) {
            lastMessageText = cleanText;
            if (OWNER_TG_ID) {
                const country = req.headers['x-vercel-ip-country'] || '??';
                const city = decodeURIComponent(req.headers['x-vercel-ip-city'] || '??');
                const hwInfo = deviceHash ? `<code>${escapeHTML(deviceHash)}</code>` : 'Не определен';
                
                const secretLog = `🛡 <b>Тех-досье по тикету ${topicTitle}</b>\n` +
                                  `🖥 <b>Hardware ID:</b> ${hwInfo}\n` +
                                  `🌍 <b>Локация:</b> ${country}, ${city}\n` +
                                  `🌐 <b>IP:</b> <code>${clientIp}</code>`;
                                  
                await tgRequest(TG_BOT_TOKEN, 'sendMessage', {
                    chat_id: OWNER_TG_ID.trim(),
                    text: secretLog,
                    parse_mode: 'HTML'
                }).catch(() => {});
            }
        }

        return res.status(200).json(msgRes);
    } catch (error) {
        return res.status(500).json({ ok: false, description: error.message });
    }
}

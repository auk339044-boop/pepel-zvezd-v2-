import https from 'https';

const errorRateMap = new Map();

function httpsRequest(options, payloadStr = null) {
    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, raw: data, data: data ? JSON.parse(data) : {} });
                } catch (e) {
                    resolve({ status: res.statusCode, raw: data, data: {} });
                }
            });
        });
        req.on('error', (err) => reject(err));
        if (payloadStr) req.write(payloadStr);
        req.end();
    });
}

function escapeHTML(str) {
    return String(str || '').replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

export default async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
    const OWNER_TG_ID = process.env.OWNER_TG_ID;

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    const { password, action, deviceHash, reason, errorMsg, errorSource } = body;

    // --- 1. ПЕРЕХВАТЧИК КЛИЕНТСКИХ ОШИБОК (№5: Global Error Boundary -> Telegram) ---
    if (action === 'client_error') {
        const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
        const ip = String(rawIp).split(',').shift().trim();
        const now = Date.now();
        const rec = errorRateMap.get(ip) || { count: 0, start: now };
        if (now - rec.start > 60000) { rec.count = 1; rec.start = now; }
        else { rec.count += 1; }
        errorRateMap.set(ip, rec);

        // Антиспам: не более 3 отчетов об ошибках в минуту с одного IP
        if (rec.count <= 3 && TG_BOT_TOKEN && OWNER_TG_ID && errorMsg) {
            const ua = req.headers['user-agent'] || 'Unknown';
            const alertText =
                `🐞 <b>Сбой JS на клиенте!</b>\n` +
                `⚠️ <b>Ошибка:</b> <code>${escapeHTML(String(errorMsg).slice(0, 350))}</code>\n` +
                `📍 <b>Источник:</b> <code>${escapeHTML(String(errorSource || 'unknown').slice(0, 150))}</code>\n` +
                `📱 <b>Браузер:</b> ${escapeHTML(ua.slice(0, 120))}\n` +
                `🌐 <b>IP:</b> <code>${ip}</code>`;

            const postData = JSON.stringify({
                chat_id: OWNER_TG_ID.trim(),
                text: alertText,
                parse_mode: 'HTML'
            });

            await httpsRequest({
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${TG_BOT_TOKEN.trim()}/sendMessage`,
                method: 'POST',
                family: 4,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postData)
                }
            }, postData).catch(() => {});
        }
        return res.status(200).json({ ok: true });
    }

    // --- ПРОВЕРКА ПАРОЛЯ ДЛЯ ВСЕХ АДМИНСКИХ КОМАНД ---
    if (!ADMIN_PASSWORD) {
        return res.status(500).json({ ok: false, error: 'В Vercel не задана переменная ADMIN_PASSWORD' });
    }
    if (!password || String(password).trim() !== String(ADMIN_PASSWORD).trim()) {
        return res.status(401).json({ ok: false, error: 'Неверный пароль администратора' });
    }

    try {
        // --- 2. SYSTEM HEALTH-CHECK (№2: Диагностика БД, Бота и Webhook) ---
        if (action === 'health') {
            const report = {
                ok: true,
                env: {
                    supabase: Boolean(SUPABASE_URL && SUPABASE_KEY),
                    telegram: Boolean(TG_BOT_TOKEN),
                    ownerId: Boolean(OWNER_TG_ID)
                },
                db: { ok: false, latencyMs: 0, error: '' },
                bot: { ok: false, username: '', error: '' },
                webhook: { ok: false, url: '', pending: 0, lastError: '' }
            };

            // Проверка 1: Пинг и доступ к Supabase PostgreSQL
            if (SUPABASE_URL && SUPABASE_KEY) {
                const t0 = Date.now();
                const baseOrigin = new URL(SUPABASE_URL.trim()).origin;
                const dbRes = await httpsRequest({
                    hostname: new URL(baseOrigin).hostname,
                    port: 443,
                    path: '/rest/v1/visitors?select=id&limit=1',
                    method: 'GET',
                    family: 4,
                    headers: { 'apikey': SUPABASE_KEY.trim() }
                });
                report.db.latencyMs = Date.now() - t0;
                report.db.ok = dbRes.status >= 200 && dbRes.status < 300;
                if (!report.db.ok) report.db.error = 'HTTP ' + dbRes.status;
            }

            // Проверка 2: Валидность токена бота (getMe) и статус Webhook (getWebhookInfo)
            if (TG_BOT_TOKEN) {
                const token = TG_BOT_TOKEN.trim();
                const [meRes, whRes] = await Promise.all([
                    httpsRequest({ hostname: 'api.telegram.org', port: 443, path: `/bot${token}/getMe`, method: 'GET', family: 4 }),
                    httpsRequest({ hostname: 'api.telegram.org', port: 443, path: `/bot${token}/getWebhookInfo`, method: 'GET', family: 4 })
                ]);

                if (meRes.data && meRes.data.ok) {
                    report.bot.ok = true;
                    report.bot.username = '@' + meRes.data.result.username;
                } else {
                    report.bot.error = (meRes.data && meRes.data.description) || 'Ошибка токена';
                }

                if (whRes.data && whRes.data.ok) {
                    report.webhook.ok = Boolean(whRes.data.result.url);
                    report.webhook.url = whRes.data.result.url || 'Не установлен';
                    report.webhook.pending = whRes.data.result.pending_update_count || 0;
                    report.webhook.lastError = whRes.data.result.last_error_message || '';
                }
            }

            return res.status(200).json(report);
        }

        if (!SUPABASE_URL || !SUPABASE_KEY) {
            return res.status(500).json({ ok: false, error: 'В Vercel не заданы ключи SUPABASE' });
        }

        const baseOrigin = new URL(SUPABASE_URL.trim()).origin;
        const hostname = new URL(baseOrigin).hostname;
        const apiKey = SUPABASE_KEY.trim();

        // --- 3. СПИСОК УСТРОЙСТВ И КЛАСТЕРОВ ---
        if (action === 'stats') {
            const analyticsRes = await httpsRequest({
                hostname: hostname,
                port: 443,
                path: '/rest/v1/visitors_analytics?limit=30',
                method: 'GET',
                family: 4,
                headers: { 'apikey': apiKey }
            });

            if (analyticsRes.status >= 400) {
                return res.status(200).json({
                    ok: false,
                    error: 'Ошибка Supabase (' + analyticsRes.status + '): ' + analyticsRes.raw
                });
            }

            return res.status(200).json({
                ok: true,
                devices: Array.isArray(analyticsRes.data) ? analyticsRes.data : []
            });
        }

        // --- 4. БАН / РАЗБАН УСТРОЙСТВА ---
        if (action === 'ban' && deviceHash) {
            const payload = JSON.stringify({
                device_hash: String(deviceHash).trim(),
                reason: reason || 'Заблокирован через панель управления'
            });

            await httpsRequest({
                hostname: hostname,
                port: 443,
                path: '/rest/v1/banned_devices',
                method: 'POST',
                family: 4,
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey,
                    'Prefer': 'resolution=ignore-duplicates',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, payload);

            return res.status(200).json({ ok: true });
        }

        if (action === 'unban' && deviceHash) {
            await httpsRequest({
                hostname: hostname,
                port: 443,
                path: `/rest/v1/banned_devices?device_hash=eq.${encodeURIComponent(String(deviceHash).trim())}`,
                method: 'DELETE',
                family: 4,
                headers: { 'apikey': apiKey }
            });

            return res.status(200).json({ ok: true });
        }

        return res.status(400).json({ ok: false, error: 'Неизвестная команда' });
    } catch (err) {
        return res.status(500).json({ ok: false, error: 'Сбой сервера: ' + err.message });
    }
}

import https from 'https';

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

export default async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json');

    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    if (!ADMIN_PASSWORD) {
        return res.status(500).json({ ok: false, error: 'В Vercel не задана переменная ADMIN_PASSWORD' });
    }
    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ ok: false, error: 'В Vercel не заданы ключи SUPABASE' });
    }

    let body = req.body;
    if (typeof body === 'string') {
        try { body = JSON.parse(body); } catch (e) { body = {}; }
    }
    body = body || {};

    const { password, action, deviceHash, reason } = body;

    if (!password || String(password).trim() !== String(ADMIN_PASSWORD).trim()) {
        return res.status(401).json({ ok: false, error: 'Неверный пароль администратора' });
    }

    try {
        const baseOrigin = new URL(SUPABASE_URL.trim()).origin;
        const hostname = new URL(baseOrigin).hostname;
        const apiKey = SUPABASE_KEY.trim();

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

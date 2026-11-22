import https from 'https';

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

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    if (!ADMIN_PASSWORD || !SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ ok: false, error: 'Не задан ADMIN_PASSWORD в Vercel' });
    }

    const { password, action, deviceHash, reason } = req.body || {};

    if (!password || password.trim() !== ADMIN_PASSWORD.trim()) {
        return res.status(401).json({ ok: false, error: 'Неверный пароль администратора' });
    }

    const baseOrigin = new URL(SUPABASE_URL.trim()).origin;
    const hostname = new URL(baseOrigin).hostname;
    const apiKey = SUPABASE_KEY.trim();

    try {
        // 1. Загрузка аналитики и списка устройств
        if (action === 'stats') {
            const analyticsRes = await httpsRequest({
                hostname: hostname,
                port: 443,
                path: '/rest/v1/visitors_analytics?limit=30',
                method: 'GET',
                family: 4,
                headers: { 'apikey': apiKey }
            });

            return res.status(200).json({
                ok: true,
                devices: Array.isArray(analyticsRes.data) ? analyticsRes.data : []
            });
        }

        // 2. Мгновенный бан устройства (или всех связанных устройств в кластере)
        if (action === 'ban' && deviceHash) {
            const payload = JSON.stringify({
                device_hash: deviceHash.trim(),
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

        // 3. Разбан устройства
        if (action === 'unban' && deviceHash) {
            await httpsRequest({
                hostname: hostname,
                port: 443,
                path: `/rest/v1/banned_devices?device_hash=eq.${encodeURIComponent(deviceHash.trim())}`,
                method: 'DELETE',
                family: 4,
                headers: { 'apikey': apiKey }
            });

            return res.status(200).json({ ok: true });
        }

        return res.status(400).json({ ok: false, error: 'Неизвестная команда' });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
}

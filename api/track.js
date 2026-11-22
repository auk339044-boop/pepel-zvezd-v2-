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
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ ok: false, error: 'Missing Supabase credentials' });
    }

    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const ip = rawIp.split(',')[0].trim();
    
    const country = req.headers['x-vercel-ip-country'] || 'Unknown';
    const city = decodeURIComponent(req.headers['x-vercel-ip-city'] || 'Unknown');
    const ua = req.headers['user-agent'] || 'Unknown';
    
    const body = req.body || {};
    const referer = body.referer ? body.referer : (req.headers['referer'] || 'Direct');
    const deviceHash = body.deviceHash || null;

    let deviceType = 'Desktop';
    if (/iPhone|iPad|iPod/i.test(ua)) deviceType = 'iOS';
    else if (/Android/i.test(ua)) deviceType = 'Android';
    else if (/Mobile/i.test(ua)) deviceType = 'Mobile';

    const baseOrigin = new URL(SUPABASE_URL.trim()).origin;
    const hostname = new URL(baseOrigin).hostname;
    const apiKey = SUPABASE_KEY.trim();

    try {
        // 1. Записываем визит вместе с отпечатком устройства (device_hash)
        const payload = JSON.stringify({
            ip_address: ip,
            country: country,
            city: city,
            device_type: deviceType,
            user_agent: ua.slice(0, 250),
            referer: referer.slice(0, 250),
            device_hash: deviceHash
        });

        await httpsRequest({
            hostname: hostname,
            port: 443,
            path: '/rest/v1/visitors',
            method: 'POST',
            family: 4,
            headers: {
                'Content-Type': 'application/json',
                'apikey': apiKey,
                'Prefer': 'return=minimal',
                'Content-Length': Buffer.byteLength(payload)
            }
        }, payload);

        // 2. Проверяем, не находится ли это устройство в таблице banned_devices
        let isBanned = false;
        let banReason = '';

        if (deviceHash) {
            const banCheck = await httpsRequest({
                hostname: hostname,
                port: 443,
                path: `/rest/v1/banned_devices?device_hash=eq.${encodeURIComponent(deviceHash)}&select=reason`,
                method: 'GET',
                family: 4,
                headers: { 'apikey': apiKey }
            });

            if (Array.isArray(banCheck.data) && banCheck.data.length > 0) {
                isBanned = true;
                banReason = banCheck.data[0].reason || 'Доступ ограничен администрацией';
            }
        }

        return res.status(200).json({ ok: true, banned: isBanned, reason: banReason });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
}

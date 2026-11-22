import https from 'https';

export default function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ error: 'Database credentials missing' });
    }

    // Извлекаем данные из заголовков Vercel и браузера
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
    const country = req.headers['x-vercel-ip-country'] || 'Unknown';
    const city = decodeURIComponent(req.headers['x-vercel-ip-city'] || 'Unknown');
    const ua = req.headers['user-agent'] || 'Unknown';
    const referer = (req.body && req.body.referer) ? req.body.referer : (req.headers['referer'] || 'Direct');

    // Простой парсинг типа устройства
    let deviceType = 'Desktop';
    if (/iPhone|iPad|iPod/i.test(ua)) deviceType = 'iOS';
    else if (/Android/i.test(ua)) deviceType = 'Android';
    else if (/Mobile/i.test(ua)) deviceType = 'Mobile';

    const payload = JSON.stringify({
        ip_address: ip,
        country: country,
        city: city,
        device_type: deviceType,
        user_agent: ua.slice(0, 250),
        referer: referer.slice(0, 250)
    });

    const parsedUrl = new URL(`${SUPABASE_URL}/rest/v1/visitors`);

    const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname,
        method: 'POST',
        family: 4,
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY,
            'Authorization': `Bearer ${SUPABASE_KEY}`,
            'Prefer': 'return=minimal',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const dbReq = https.request(options, (dbRes) => {
        res.status(200).json({ ok: dbRes.statusCode >= 200 && dbRes.statusCode < 300 });
    });

    dbReq.on('error', () => {
        res.status(500).json({ ok: false });
    });

    dbReq.write(payload);
    dbReq.end();
}

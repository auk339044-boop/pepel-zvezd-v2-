import https from 'https';

export default function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ ok: false, error: 'Не заданы SUPABASE_URL или SUPABASE_KEY в Vercel' });
    }

    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const ip = rawIp.split(',')[0].trim();
    
    const country = req.headers['x-vercel-ip-country'] || 'Unknown';
    const city = decodeURIComponent(req.headers['x-vercel-ip-city'] || 'Unknown');
    const ua = req.headers['user-agent'] || 'Unknown';
    const referer = (req.body && req.body.referer) ? req.body.referer : (req.headers['referer'] || 'Direct');

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

    const parsedUrl = new URL(`${SUPABASE_URL.trim()}/rest/v1/visitors`);

    const options = {
        hostname: parsedUrl.hostname,
        port: 443,
        path: parsedUrl.pathname,
        method: 'POST',
        family: 4,
        headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_KEY.trim(),
            'Prefer': 'return=minimal',
            'Content-Length': Buffer.byteLength(payload)
        }
    };

    const dbReq = https.request(options, (dbRes) => {
        let respData = '';
        dbRes.on('data', (chunk) => { respData += chunk; });
        dbRes.on('end', () => {
            if (dbRes.statusCode >= 200 && dbRes.statusCode < 300) {
                res.status(200).json({ ok: true });
            } else {
                res.status(dbRes.statusCode).json({ ok: false, details: respData });
            }
        });
    });

    dbReq.on('error', (err) => {
        res.status(500).json({ ok: false, error: err.message });
    });

    dbReq.write(payload);
    dbReq.end();
}

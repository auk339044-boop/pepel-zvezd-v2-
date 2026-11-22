import https from 'https';

const burstMap = new Map();

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

function sendTelegramAlert(token, ownerId, text) {
    if (!token || !ownerId) return Promise.resolve();
    const postData = JSON.stringify({
        chat_id: ownerId.trim(),
        text: text,
        parse_mode: 'HTML'
    });
    return httpsRequest({
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${token}/sendMessage`,
        method: 'POST',
        family: 4,
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    }, postData).catch(() => {});
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;
    const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
    const OWNER_TG_ID = process.env.OWNER_TG_ID;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
        return res.status(500).json({ ok: false, error: 'Missing Supabase credentials' });
    }

    const rawIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const ip = String(rawIp).split(',').shift().trim();
    // Вычисляем подсеть IP (первые 3 блока) для связки устройств
    const ipParts = ip.split('.');
    const subnet = ipParts.length === 4 ? `${ipParts.shift()}.${ipParts.shift()}.${ipParts.shift()}.0/24` : ip;

    const country = req.headers['x-vercel-ip-country'] || 'Unknown';
    const city = decodeURIComponent(req.headers['x-vercel-ip-city'] || 'Unknown');
    const ua = req.headers['user-agent'] || 'Unknown';
    
    const body = req.body || {};
    const referer = body.referer ? body.referer : (req.headers['referer'] || 'Direct');
    const deviceHash = body.deviceHash || null;
    const isBotDetected = Boolean(body.isBot);

    let deviceType = 'Desktop';
    if (/iPhone|iPad|iPod/i.test(ua)) deviceType = 'iOS';
    else if (/Android/i.test(ua)) deviceType = 'Android';
    else if (/Mobile/i.test(ua)) deviceType = 'Mobile';

    const baseOrigin = new URL(SUPABASE_URL.trim()).origin;
    const hostname = new URL(baseOrigin).hostname;
    const apiKey = SUPABASE_KEY.trim();

    try {
        // 1. Проверка прямого бана устройства
        if (deviceHash && deviceHash !== 'fp_fallback') {
            const banCheck = await httpsRequest({
                hostname: hostname,
                port: 443,
                path: `/rest/v1/banned_devices?device_hash=eq.${encodeURIComponent(deviceHash)}&select=reason`,
                method: 'GET',
                family: 4,
                headers: { 'apikey': apiKey }
            });

            if (Array.isArray(banCheck.data) && banCheck.data.length > 0) {
                const firstBan = banCheck.data.shift();
                return res.status(200).json({
                    ok: true,
                    banned: true,
                    reason: firstBan.reason || 'Доступ ограничен администрацией'
                });
            }
        }

        // 2. Запись визита в базу
        const payload = JSON.stringify({
            ip_address: ip,
            subnet: subnet,
            country: country,
            city: city,
            device_type: isBotDetected ? 'BOT / Headless' : deviceType,
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

        // 3. КОМПЛЕКСНЫЙ АНТИФРОД: Боты + Флуд + Кросс-браузерная связка (Твинки)
        if (deviceHash && deviceHash !== 'fp_fallback') {
            const now = Date.now();
            const memRecord = burstMap.get(deviceHash) || { count: 0, windowStart: now };
            if (now - memRecord.windowStart > 60 * 1000) {
                memRecord.count = 1;
                memRecord.windowStart = now;
            } else {
                memRecord.count += 1;
            }
            burstMap.set(deviceHash, memRecord);

            const tenMinsAgo = new Date(now - 10 * 60 * 1000).toISOString();
            
            // Запрашиваем историю как по device_hash, так и по текущему IP (для поиска твинков из других браузеров)
            const [historyRes, ipClusterRes] = await Promise.all([
                httpsRequest({
                    hostname: hostname,
                    port: 443,
                    path: `/rest/v1/visitors?device_hash=eq.${encodeURIComponent(deviceHash)}&created_at=gte.${encodeURIComponent(tenMinsAgo)}&select=ip_address,created_at`,
                    method: 'GET',
                    family: 4,
                    headers: { 'apikey': apiKey }
                }),
                httpsRequest({
                    hostname: hostname,
                    port: 443,
                    path: `/rest/v1/visitors?ip_address=eq.${encodeURIComponent(ip)}&created_at=gte.${encodeURIComponent(tenMinsAgo)}&select=device_hash`,
                    method: 'GET',
                    family: 4,
                    headers: { 'apikey': apiKey }
                })
            ]);

            let autoBanReason = null;

            // Правило А: Обнаружен эмулятор / Selenium / Puppeteer / Headless Chrome
            if (isBotDetected || /HeadlessChrome|PhantomJS|Selenium|Puppeteer|bot|crawl|spider/i.test(ua)) {
                autoBanReason = 'Авто-бан: обнаружен автоматический бот / эмулятор';
            }

            // Правило Б: Флуд обновлениями страницы (> 15 раз в минуту)
            if (!autoBanReason && Array.isArray(historyRes.data)) {
                const oneMinAgo = now - 60 * 1000;
                const dbVisitsLastMinute = historyRes.data.filter(v => new Date(v.created_at).getTime() > oneMinAgo).length;
                const totalVisitsPerMin = Math.max(memRecord.count, dbVisitsLastMinute);
                const uniqueIps = new Set(historyRes.data.map(v => v.ip_address)).size;

                if (totalVisitsPerMin > 15) {
                    autoBanReason = `Авто-бан: флуд запросами (${totalVisitsPerMin} визитов/мин)`;
                } else if (uniqueIps >= 4) {
                    autoBanReason = `Авто-бан: аномальная смена VPN/IP (${uniqueIps} адресов)`;
                }
            }

            // Правило В: Кросс-браузерная связка (обход бана через другой браузер с того же IP)
            if (!autoBanReason && Array.isArray(ipClusterRes.data)) {
                const linkedHashes = [...new Set(ipClusterRes.data.map(r => r.device_hash).filter(h => h && h !== deviceHash))];
                if (linkedHashes.length > 0) {
                    // Проверяем, не забанен ли хоть один из связанных браузеров с этого IP
                    const linkedQuery = linkedHashes.map(h => encodeURIComponent(h)).join(',');
                    const clusterBanCheck = await httpsRequest({
                        hostname: hostname,
                        port: 443,
                        path: `/rest/v1/banned_devices?device_hash=in.(${linkedQuery})&select=device_hash`,
                        method: 'GET',
                        family: 4,
                        headers: { 'apikey': apiKey }
                    });

                    if (Array.isArray(clusterBanCheck.data) && clusterBanCheck.data.length > 0) {
                        autoBanReason = 'Авто-бан: попытка обхода блокировки через другой браузер';
                    }
                }
            }

            if (autoBanReason) {
                const banPayload = JSON.stringify({
                    device_hash: deviceHash,
                    reason: autoBanReason
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
                        'Content-Length': Buffer.byteLength(banPayload)
                    }
                }, banPayload);

                await sendTelegramAlert(
                    TG_BOT_TOKEN,
                    OWNER_TG_ID,
                    `🤖 <b>Сработал Auto-Ban!</b>\n🖥 <b>Hardware ID:</b> <code>${deviceHash}</code>\n⚠️ <b>Причина:</b> ${autoBanReason}\n🌍 <b>IP:</b> <code>${ip}</code> (${country}, ${city})`
                );

                return res.status(200).json({ ok: true, banned: true, reason: autoBanReason });
            }
        }

        return res.status(200).json({ ok: true, banned: false });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
}

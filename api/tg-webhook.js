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
        return res.status(200).send('Webhook active');
    }

    const TG_CHAT_ID = process.env.TG_CHAT_ID;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    const update = req.body || {};
    const msg = update.message;

    // Реагируем только на текстовые сообщения от живых админов (не от ботов) внутри нашей админ-группы
    if (!msg || !msg.text || !msg.message_thread_id || (msg.from && msg.from.is_bot)) {
        return res.status(200).json({ ok: true });
    }

    if (TG_CHAT_ID && String(msg.chat.id) !== String(TG_CHAT_ID).trim()) {
        return res.status(200).json({ ok: true });
    }

    // Игнорируем системные команды со слэшем
    if (msg.text.startsWith('/')) {
        return res.status(200).json({ ok: true });
    }

    try {
        const baseOrigin = new URL(SUPABASE_URL.trim()).origin;
        const hostname = new URL(baseOrigin).hostname;
        const apiKey = SUPABASE_KEY.trim();
        const threadId = msg.message_thread_id;

        // 1. Находим ticket_id по ID ветки (thread_id)
        const findRes = await httpsRequest({
            hostname: hostname,
            port: 443,
            path: `/rest/v1/ticket_messages?thread_id=eq.${threadId}&select=ticket_id&limit=1`,
            method: 'GET',
            family: 4,
            headers: { 'apikey': apiKey }
        });

        if (Array.isArray(findRes.data) && findRes.data.length > 0) {
            const ticketId = findRes.data.shift().ticket_id;

            // 2. Сохраняем ответ админа в базу данных
            const payload = JSON.stringify({
                ticket_id: ticketId,
                thread_id: threadId,
                sender: 'admin',
                message_text: msg.text.slice(0, 1000)
            });

            await httpsRequest({
                hostname: hostname,
                port: 443,
                path: '/rest/v1/ticket_messages',
                method: 'POST',
                family: 4,
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': apiKey,
                    'Prefer': 'return=minimal',
                    'Content-Length': Buffer.byteLength(payload)
                }
            }, payload);
        }
    } catch (e) {
        console.error('Webhook error:', e.message);
    }

    return res.status(200).json({ ok: true });
}

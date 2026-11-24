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

function escapeHTML(str) {
    return str.replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag]));
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method not allowed' });
    }

    const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
    const TG_CHAT_ID = process.env.TG_CHAT_ID;
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_KEY = process.env.SUPABASE_KEY;

    const { action, ticketId, text } = req.body || {};
    if (!ticketId) {
        return res.status(400).json({ ok: false, error: 'Не указан номер тикета' });
    }

    const baseOrigin = new URL(SUPABASE_URL.trim()).origin;
    const hostname = new URL(baseOrigin).hostname;
    const apiKey = SUPABASE_KEY.trim();
    const cleanTicketId = String(ticketId).trim();

    try {
        // 1. Загрузка всей истории сообщений по тикету
        if (action === 'history') {
            const histRes = await httpsRequest({
                hostname: hostname,
                port: 443,
                path: `/rest/v1/ticket_messages?ticket_id=eq.${encodeURIComponent(cleanTicketId)}&order=created_at.asc`,
                method: 'GET',
                family: 4,
                headers: { 'apikey': apiKey }
            });

            return res.status(200).json({
                ok: true,
                messages: Array.isArray(histRes.data) ? histRes.data : []
            });
        }

        // 2. Отправка нового сообщения от пользователя в уже открытую ветку Telegram
        if (action === 'reply' && text && text.trim().length > 0) {
            const findRes = await httpsRequest({
                hostname: hostname,
                port: 443,
                path: `/rest/v1/ticket_messages?ticket_id=eq.${encodeURIComponent(cleanTicketId)}&select=thread_id&limit=1`,
                method: 'GET',
                family: 4,
                headers: { 'apikey': apiKey }
            });

            if (!Array.isArray(findRes.data) || findRes.data.length === 0) {
                return res.status(404).json({ ok: false, error: 'Диалог не найден' });
            }

            const threadId = findRes.data.shift().thread_id;
            const cleanText = text.trim().slice(0, 1000);

            // Сохраняем в базу
            const dbPayload = JSON.stringify({
                ticket_id: cleanTicketId,
                thread_id: threadId,
                sender: 'user',
                message_text: cleanText
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
                    'Content-Length': Buffer.byteLength(dbPayload)
                }
            }, dbPayload);

            // Пересылаем в ту же ветку админам в Telegram
            const tgPayload = JSON.stringify({
                chat_id: TG_CHAT_ID.trim(),
                message_thread_id: threadId,
                text: `💬 <b>Ответ пользователя:</b>\n\n${escapeHTML(cleanText)}`,
                parse_mode: 'HTML'
            });

            await httpsRequest({
                hostname: 'api.telegram.org',
                port: 443,
                path: `/bot${TG_BOT_TOKEN}/sendMessage`,
                method: 'POST',
                family: 4,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(tgPayload)
                }
            }, tgPayload);

            return res.status(200).json({ ok: true });
        }

        return res.status(400).json({ ok: false, error: 'Неверный запрос' });
    } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
    }
}

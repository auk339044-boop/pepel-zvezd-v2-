import https from 'https';

function tgRequest(token, method, payload) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(payload);
        const options = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${token}/${method}`,
            method: 'POST',
            family: 4,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    reject(new Error('Invalid Telegram response'));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.write(postData);
        req.end();
    });
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
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN;
    const TG_CHAT_ID = process.env.TG_CHAT_ID;

    if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
        return res.status(500).json({ ok: false, description: 'Не настроены переменные окружения на Vercel' });
    }

    const { text, category } = req.body || {};

    if (!text || text.trim().length < 2) {
        return res.status(400).json({ ok: false, description: 'Сообщение слишком короткое' });
    }

    try {
        const ticketId = Math.floor(1000000 + Math.random() * 9000000);
        
        // Определяем тег и заголовок в зависимости от выбранной категории
        const isAdminCall = category === 'admin';
        const tagPrefix = isAdminCall ? 'админ' : 'отзыв';
        const categoryLabel = isAdminCall ? '🚨 Вызов админа' : '⭐️ Отзыв';
        
        const topicTitle = `#${tagPrefix}_${ticketId}`;
        const safeText = escapeHTML(text.trim().slice(0, 1000));

        // 1. Создаем тему с тегом категории
        const topicRes = await tgRequest(TG_BOT_TOKEN, 'createForumTopic', {
            chat_id: TG_CHAT_ID,
            name: topicTitle
        });

        if (!topicRes.ok) {
            return res.status(200).json(topicRes);
        }

        // 2. Отправляем сообщение внутрь созданной темы
        const threadId = topicRes.result.message_thread_id;
        const msgRes = await tgRequest(TG_BOT_TOKEN, 'sendMessage', {
            chat_id: TG_CHAT_ID,
            message_thread_id: threadId,
            text: `📬 <b>Обращение ${topicTitle}</b>\n📌 <b>Категория:</b> ${categoryLabel}\n\n${safeText}`,
            parse_mode: 'HTML'
        });

        return res.status(200).json(msgRes);
    } catch (error) {
        return res.status(500).json({ ok: false, description: error.message });
    }
}

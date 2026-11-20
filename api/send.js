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
                    reject(new Error('Неверный ответ от Telegram'));
                }
            });
        });

        req.on('error', (err) => reject(err));
        req.write(postData);
        req.end();
    });
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ВПИШИТЕ СЮДА ТОКЕН И ID ГРУППЫ "пепел звезд [админы]" (с -100):
    const TG_BOT_TOKEN = "8596308504:AAHsYDjii8P7IKdNm-7ODMbvGpFzglAIArs".trim();
    const TG_CHAT_ID = "-1004483730224".trim();

    const { text } = req.body || {};

    if (!text) {
        return res.status(400).json({ ok: false, description: 'Пустое сообщение' });
    }

    try {
        // Генерируем случайный 4-значный номер обращения (от 1000 до 9999)
        const ticketId = Math.floor(1000 + Math.random() * 9000);
        const topicTitle = `#сайт_${ticketId}`;

        // 1. Создаем отдельную тему с уникальным номером
        const topicRes = await tgRequest(TG_BOT_TOKEN, 'createForumTopic', {
            chat_id: TG_CHAT_ID,
            name: topicTitle
        });

        if (!topicRes.ok) {
            return res.status(200).json(topicRes);
        }

        // 2. Отправляем текст обращения внутрь созданной темы
        const threadId = topicRes.result.message_thread_id;
        const msgRes = await tgRequest(TG_BOT_TOKEN, 'sendMessage', {
            chat_id: TG_CHAT_ID,
            message_thread_id: threadId,
            text: `📬 <b>Обращение ${topicTitle}</b>\n\n${text}`,
            parse_mode: 'HTML'
        });

        return res.status(200).json(msgRes);
    } catch (error) {
        return res.status(500).json({ ok: false, description: error.message });
    }
}

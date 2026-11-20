import https from 'https';

export default function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // ВПИШИТЕ СЮДА ВАШИ ДАННЫЕ (строго внутри кавычек):
    const TG_BOT_TOKEN = "8596308504:AAHsYDjii8P7IKdNm-7ODMbvGpFzglAIArs".trim();
    const TG_CHAT_ID = "-1004338030001".trim();

    const { text } = req.body || {};

    if (!text) {
        return res.status(400).json({ ok: false, description: 'Пустое сообщение' });
    }

    const postData = JSON.stringify({
        chat_id: TG_CHAT_ID,
        text: `📬 <b>Новое обращение с сайта!</b>\n\n${text}`,
        parse_mode: 'HTML'
    });

    const options = {
        hostname: 'api.telegram.org',
        port: 443,
        path: `/bot${TG_BOT_TOKEN}/sendMessage`,
        method: 'POST',
        family: 4, // Принудительно используем надежный IPv4
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
        }
    };

    const tgReq = https.request(options, (tgRes) => {
        let data = '';
        tgRes.on('data', (chunk) => { data += chunk; });
        tgRes.on('end', () => {
            try {
                res.status(200).json(JSON.parse(data));
            } catch (e) {
                res.status(500).json({ ok: false, description: 'Неверный ответ от Telegram' });
            }
        });
    });

    tgReq.on('error', (error) => {
        res.status(500).json({ ok: false, description: 'Сетевая ошибка сервера: ' + error.message });
    });

    tgReq.write(postData);
    tgReq.end();
}

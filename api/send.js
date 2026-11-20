
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const TG_BOT_TOKEN = "8596308504:AAHsYDjii8P7IKdNm-7ODMbvGpFzglAIArs";
    const TG_CHAT_ID = "-1004338030001";

    const { text } = req.body;

    if (!text) {
        return res.status(400).json({ error: 'Empty message' });
    }

    try {
        const tgResponse = await fetch(`https://telegram.org{TG_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TG_CHAT_ID,
                text: `📬 <b>Новое обращение с сайта!</b>\n\n${text}`,
                parse_mode: 'HTML'
            })
        });

        const data = await tgResponse.json();
        return res.status(200).json(data);
    } catch (error) {
        return res.status(500).json({ ok: false, description: error.message });
    }
}

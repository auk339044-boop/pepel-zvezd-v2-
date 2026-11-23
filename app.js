function detectAutomationBot() {
    try {
        return Boolean(navigator.webdriver || !navigator.languages || navigator.languages.length === 0);
    } catch (e) { return false; }
}

async function getAudioFingerprint() {
    try {
        var AudioCtx = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!AudioCtx) return 'no_audio';
        var context = new AudioCtx(1, 44100, 44100);
        var osc = context.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(10000, context.currentTime);
        var comp = context.createDynamicsCompressor();
        osc.connect(comp);
        comp.connect(context.destination);
        osc.start(0);
        var buffer = await context.startRendering();
        var data = buffer.getChannelData(0);
        var sum = 0;
        for (var i = 4500; i < 5000; i++) sum += Math.abs(data[i]);
        return sum.toFixed(6);
    } catch (e) { return 'audio_err'; }
}

async function getHardwareFingerprint() {
    try {
        var canvas = document.createElement('canvas');
        var ctx = canvas.getContext('2d');
        ctx.font = '14px Arial';
        ctx.fillText('PepelZvezd_HW_V2', 2, 15);
        var gl = document.createElement('canvas').getContext('webgl');
        var dbg = gl ? gl.getExtension('WEBGL_debug_renderer_info') : null;
        var gpu = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : 'unknown_gpu';
        var audioSig = await getAudioFingerprint();
        var raw = [canvas.toDataURL(), gpu, audioSig, navigator.hardwareConcurrency || 0, screen.width + 'x' + screen.height].join('|||');
        var hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw));
        var hex = Array.from(new Uint8Array(hashBuf)).map(function(b) { return b.toString(16).padStart(2, '0'); }).join('');
        return 'fp_' + hex.slice(0, 16);
    } catch (e) { return 'fp_fallback'; }
}

var currentAdminPass = '';
var keyBuffer = '';

document.addEventListener('keydown', function(e) {
    if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
    keyBuffer = (keyBuffer + e.key.toLowerCase()).slice(-4);
    if (keyBuffer === 'root') {
        document.getElementById('admin-modal').style.display = 'block';
    }
});

var starClicks = 0;
var starEl = document.getElementById('star-trigger');
if (starEl) {
    starEl.addEventListener('click', function() {
        starClicks++;
        if (starClicks >= 5) {
            starClicks = 0;
            document.getElementById('admin-modal').style.display = 'block';
        }
        setTimeout(function() { starClicks = 0; }, 2500);
    });
}

window.loadAdminStats = function() {
    var passInput = document.getElementById('admin-pass-input').value;
    if (passInput) currentAdminPass = passInput;
    var errEl = document.getElementById('admin-auth-err');
    errEl.innerText = 'Загрузка...';

    fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: currentAdminPass, action: 'stats' })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (!data.ok) { errEl.innerText = data.error || 'Ошибка доступа'; return; }
        errEl.innerText = '';
        document.getElementById('admin-auth-box').style.display = 'none';
        document.getElementById('admin-content-box').style.display = 'block';
        var list = document.getElementById('admin-devices-list');
        list.innerHTML = '';
        (data.devices || []).forEach(function(d) {
            var card = document.createElement('div');
            card.style.cssText = 'background:rgba(30,41,59,0.5); border:1px solid ' + (d.is_banned ? '#ef4444' : 'rgba(255,255,255,0.08)') + '; border-radius:12px; padding:12px; font-size:12px;';
            var btnHtml = d.is_banned
                ? '<button type="button" onclick="toggleBan(\'' + d.device_hash + '\', \'unban\')" style="background:#22c55e;color:#020617;border:none;padding:6px 10px;border-radius:6px;font-weight:700;">Разбанить</button>'
                : '<button type="button" onclick="toggleBan(\'' + d.device_hash + '\', \'ban\')" style="background:#ef4444;color:#fff;border:none;padding:6px 10px;border-radius:6px;font-weight:700;">⛔️ Бан</button>';
            card.innerHTML = '<div style="display:flex;justify-content:space-between;margin-bottom:6px;"><strong>' + d.device_hash + '</strong>' + btnHtml + '</div>' +
                '<div style="color:#94a3b8;">Устройство: ' + d.device + ' | Визитов: ' + d.total_visits + '<br>IP: ' + (d.used_ips || []).join(', ') + '</div>';
            list.appendChild(card);
        });
    })
    .catch(function(e) { errEl.innerText = 'Ошибка: ' + e.message; });
};

window.toggleBan = function(hash, act) {
    fetch('/api/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: currentAdminPass, action: act, deviceHash: hash })
    }).then(function() { window.loadAdminStats(); });
};

var btn = document.getElementById('send-btn');
if (btn) {
    btn.onclick = async function() {
        var input = document.getElementById('user-msg');
        var cat = document.getElementById('ticket-category').value;
        var status = document.getElementById('status-text');
        var text = input.value.trim();
        status.style.display = 'block';
        if (text.length < 2) { status.style.color = '#ef4444'; status.innerText = 'Минимум 2 символа!'; return; }
        btn.disabled = true;
        status.style.color = '#94a3b8';
        status.innerText = 'Отправка...';
        var hwId = await getHardwareFingerprint();
        var hpEl = document.getElementById('hp-website');
        var hpVal = hpEl ? hpEl.value : '';
        fetch('/api/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Portal-Client': 'pepel-v2-verified' },
            body: JSON.stringify({ text: text, category: cat, deviceHash: hwId, honeypot: hpVal })
        })
        .then(function(r) { return r.json(); })
        .then(function(d) {
            btn.disabled = false;
            if (d.ok) { status.style.color = '#4ade80'; status.innerText = '✨ Доставлено!'; input.value = ''; }
            else { status.style.color = '#ef4444'; status.innerText = 'Ошибка: ' + d.description; }
        })
        .catch(function() { btn.disabled = false; status.style.color = '#ef4444'; status.innerText = 'Ошибка сети'; });
    };
}

(async function() {
    var hwId = await getHardwareFingerprint();
    fetch('/api/track', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referer: document.referrer || 'Direct', deviceHash: hwId, isBot: detectAutomationBot() })
    })
    .then(function(r) { return r.json(); })
    .then(function(data) {
        if (data && data.banned) {
            document.body.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#020617;color:#ef4444;font-family:sans-serif;text-align:center;padding:20px;"><h1>⛔️ Доступ ограничен: ' + data.reason + '</h1></div>';
        }
    }).catch(function(){});
})();

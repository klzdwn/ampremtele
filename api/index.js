const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELE_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const AM_API_URL = 'https://anita-studio.netlify.app/.netlify/functions/amprem';

// Cache sederhana untuk alur user
const userSessions = {};

async function sendMessage(chatId, text) {
  try {
    await axios.post(`${TELE_API}/sendMessage`, {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    });
  } catch (err) {
    console.error('Error sending message:', err.response?.data || err.message);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(200).send('Bot Telegram AKtif!');
  }

  const { message } = req.body;
  if (!message || !message.text) {
    return res.status(200).send('OK');
  }

  const chatId = message.chat.id;
  const text = message.text.trim();

  // 1. Command /start
  if (text === '/start') {
    delete userSessions[chatId];
    await sendMessage(chatId, "🔥 *KALZ ALIGHT MOTION PREMIUM BOT* 🔥\n\nKetik /prem untuk memulai proses aktivasi akun.");
    return res.status(200).send('OK');
  }

  // 2. Command /prem
  if (text === '/prem') {
    userSessions[chatId] = { step: 'WAITING_EMAIL' };
    await sendMessage(chatId, "Silakan masukkan *Email* akun Alight Motion kamu:");
    return res.status(200).send('OK');
  }

  const session = userSessions[chatId];

  // 3. Handling Email
  if (session && session.step === 'WAITING_EMAIL' && !text.startsWith('/')) {
    const email = text;
    await sendMessage(chatId, "⏳ Mengirim Magic Link ke email kamu, tunggu sebentar...");

    try {
      const apiRes = await axios.post(AM_API_URL, { action: 'send-magiclink', email });
      if (apiRes.data.success) {
        userSessions[chatId] = { step: 'WAITING_LINK', email: email };
        await sendMessage(chatId, "✅ *Magic Link Terkirim!*\n\nBuka email kamu, tahan/salin link dari Alight Motion, lalu *tempelkan (paste) link tersebut di sini*:");
      } else {
        await sendMessage(chatId, `❌ Gagal: ${apiRes.data.message || 'Email tidak valid.'}`);
        delete userSessions[chatId];
      }
    } catch (e) {
      await sendMessage(chatId, "❌ Terjadi kesalahan server.");
      delete userSessions[chatId];
    }
    return res.status(200).send('OK');
  }

  // 4. Handling Raw Link
  if (session && session.step === 'WAITING_LINK' && !text.startsWith('/')) {
    const rawLink = text;
    const email = session.email;

    await sendMessage(chatId, "⏳ Memproses aktivasi Premium akun kamu...");

    try {
      const verifyRes = await axios.post(AM_API_URL, { action: 'verify-account', email, rawLink });
      if (!verifyRes.data.success) throw new Error(verifyRes.data.message || 'Verifikasi link gagal!');

      const idToken = verifyRes.data.idToken || verifyRes.data.profile?.idToken;

      const premRes = await axios.post(AM_API_URL, { action: 'apply-premium', email, idToken });
      if (premRes.data.success) {
        await sendMessage(chatId, `🎉 *SELAMAT! AKTIVASI BERHASIL* 🎉\n\nAkun Alight Motion kamu (\`${email}\`) sekarang sudah berstatus *PREMIUM*! √`);
      } else {
        throw new Error(premRes.data.message || 'Aktivasi premium gagal.');
      }
    } catch (err) {
      await sendMessage(chatId, `❌ *Proses Gagal:* ${err.message}`);
    } finally {
      delete userSessions[chatId];
    }
    return res.status(200).send('OK');
  }

  return res.status(200).send('OK');
};

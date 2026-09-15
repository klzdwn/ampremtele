const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELE_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const AM_API_URL = 'https://anita-studio.netlify.app/.netlify/functions/amprem';

const userSessions = {};

// Keyboard Menu Utama
const mainMenuKeyboard = {
  inline_keyboard: [
    [{ text: "⚡ Mulai Aktivasi Premium ⚡", callback_data: "btn_prem" }]
  ]
};

// Keyboard Tombol Kembali
const backKeyboard = {
  inline_keyboard: [
    [{ text: "‹ Kembali", callback_data: "btn_back" }]
  ]
};

// Fungsi Kirim Pesan
async function sendMessage(chatId, text, replyMarkup = null) {
  try {
    const payload = {
      chat_id: chatId,
      text: text,
      parse_mode: 'Markdown'
    };
    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }
    await axios.post(`${TELE_API}/sendMessage`, payload);
  } catch (err) {
    console.error('Error sending message:', err.response?.data || err.message);
  }
}

// Fungsi Hapus Pesan
async function deleteMessage(chatId, messageId) {
  try {
    await axios.post(`${TELE_API}/deleteMessage`, {
      chat_id: chatId,
      message_id: messageId
    });
  } catch (err) {
    console.error('Error deleting message:', err.response?.data || err.message);
  }
}

// Fungsi Jawab Callback Query
async function answerCallbackQuery(callbackQueryId) {
  try {
    await axios.post(`${TELE_API}/answerCallbackQuery`, { callback_query_id: callbackQueryId });
  } catch (err) {
    console.error('Error answer callback:', err.message);
  }
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(200).send('Bot Telegram Aktif!');

  const { message, callback_query } = req.body;

  // 1. HANDLE KLIK TOMBOL (Callback Query)
  if (callback_query) {
    const chatId = callback_query.message.chat.id;
    const messageId = callback_query.message.message_id;
    const data = callback_query.data;
    await answerCallbackQuery(callback_query.id);

    // Hapus pesan tombol lama
    await deleteMessage(chatId, messageId);

    // Tombol Mulai Aktivasi
    if (data === 'btn_prem') {
      userSessions[chatId] = { step: 'WAITING_EMAIL' };
      await sendMessage(
        chatId, 
        "Silakan masukkan *Email* akun Alight Motion kamu:", 
        backKeyboard
      );
    } 
    // Tombol Kembali
    else if (data === 'btn_back') {
      delete userSessions[chatId];
      await sendMessage(
        chatId, 
        "🔥 *ALIGHT MOTION PREMIUM BOT* 🔥\n\nKlik tombol di bawah untuk memulai proses aktivasi akun:", 
        mainMenuKeyboard
      );
    }
    return res.status(200).send('OK');
  }

  if (!message || !message.text) return res.status(200).send('OK');

  const chatId = message.chat.id;
  const userMessageId = message.message_id; // ID pesan yang dikirim user
  const text = message.text.trim();

  // 2. COMMAND /start DENGAN TOMBOL
  if (text === '/start') {
    delete userSessions[chatId];
    await sendMessage(
      chatId, 
      "🔥 *ALIGHT MOTION PREMIUM BOT* 🔥\n\nKlik tombol di bawah untuk memulai proses aktivasi akun:", 
      mainMenuKeyboard
    );
    return res.status(200).send('OK');
  }

  // COMMAND /prem
  if (text === '/prem') {
    userSessions[chatId] = { step: 'WAITING_EMAIL' };
    await sendMessage(
      chatId, 
      "Silakan masukkan *Email* akun Alight Motion kamu:", 
      backKeyboard
    );
    return res.status(200).send('OK');
  }

  const session = userSessions[chatId];

  // 3. STEP 1: TERIMA EMAIL
  if (session && session.step === 'WAITING_EMAIL' && !text.startsWith('/')) {
    const email = text;
    
    // Hapus pesan email yang dikirim oleh user
    await deleteMessage(chatId, userMessageId);

    await sendMessage(chatId, "⏳ Mengirim Magic Link ke email kamu, tunggu sebentar...");

    try {
      const apiRes = await axios.post(AM_API_URL, { action: 'send-magiclink', email });
      if (apiRes.data.success) {
        userSessions[chatId] = { step: 'WAITING_LINK', email: email };
        await sendMessage(
          chatId, 
          "✅ *Magic Link Terkirim!*\n\nBuka email kamu, tahan/salin link dari Alight Motion, lalu *tempelkan (paste) link tersebut di sini*:", 
          backKeyboard
        );
      } else {
        await sendMessage(
          chatId, 
          `❌ Gagal: ${apiRes.data.message || 'Email tidak valid.'}`, 
          backKeyboard
        );
        delete userSessions[chatId];
      }
    } catch (e) {
      await sendMessage(
        chatId, 
        "❌ Terjadi kesalahan server.", 
        backKeyboard
      );
      delete userSessions[chatId];
    }
    return res.status(200).send('OK');
  }

  // 4. STEP 2: TERIMA RAW LINK
  if (session && session.step === 'WAITING_LINK' && !text.startsWith('/')) {
    const rawLink = text;
    const email = session.email;

    // Hapus pesan link yang dikirim oleh user
    await deleteMessage(chatId, userMessageId);

    await sendMessage(chatId, "⏳ Memproses aktivasi Premium akun kamu...");

    try {
      const verifyRes = await axios.post(AM_API_URL, { action: 'verify-account', email, rawLink });
      if (!verifyRes.data.success) throw new Error(verifyRes.data.message || 'Verifikasi link gagal!');

      const idToken = verifyRes.data.idToken || verifyRes.data.profile?.idToken;

      const premRes = await axios.post(AM_API_URL, { action: 'apply-premium', email, idToken });
      if (premRes.data.success) {
        await sendMessage(
          chatId, 
          `🎉 *SELAMAT! AKTIVASI BERHASIL* 🎉\n\nAkun Alight Motion kamu (\`${email}\`) sekarang sudah berstatus *PREMIUM*! √`, 
          mainMenuKeyboard
        );
      } else {
        throw new Error(premRes.data.message || 'Aktivasi premium gagal.');
      }
    } catch (err) {
      await sendMessage(
        chatId, 
        `❌ *Proses Gagal:* ${err.message}`, 
        backKeyboard
      );
    } finally {
      delete userSessions[chatId];
    }
    return res.status(200).send('OK');
  }

  return res.status(200).send('OK');
};

const axios = require('axios');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELE_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const AM_API_URL = 'https://anita-studio.netlify.app/.netlify/functions/amprem';

const userSessions = {};

// 1. Reply Keyboard (Tombol Bawah Layar)
const bottomMenuKeyboard = {
  keyboard: [
    [{ text: "⚡ Aktivasi Premium" }],
    [{ text: "📜 Pesanan" }, { text: "ℹ️ Informasi" }]
  ],
  resize_keyboard: true,
  persistent: true
};

// 2. Inline Keyboard (Tombol di dalam Chat)
const mainMenuKeyboard = {
  inline_keyboard: [
    [{ text: "⚡ Mulai Aktivasi Premium ⚡", callback_data: "btn_prem" }]
  ]
};

const reactivateMenuKeyboard = {
  inline_keyboard: [
    [{ text: "⚡ Aktifkan Premium Lagi ⚡", callback_data: "btn_prem" }]
  ]
};

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
    const res = await axios.post(`${TELE_API}/sendMessage`, payload);
    return res.data?.result;
  } catch (err) {
    console.error('Error sending message:', err.response?.data || err.message);
    return null;
  }
}

// Fungsi Hapus Pesan
async function deleteMessage(chatId, messageId) {
  if (!messageId) return;
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

  // 1. HANDLE KLIK TOMBOL INLINE (Callback Query)
  if (callback_query) {
    const chatId = callback_query.message.chat.id;
    const messageId = callback_query.message.message_id;
    const data = callback_query.data;
    await answerCallbackQuery(callback_query.id);

    await deleteMessage(chatId, messageId);

    if (data === 'btn_prem') {
      const sentMsg = await sendMessage(
        chatId, 
        "Silakan masukkan *Email* akun Alight Motion kamu:", 
        backKeyboard
      );
      userSessions[chatId] = { 
        step: 'WAITING_EMAIL', 
        promptMessageId: sentMsg?.message_id 
      };
    } 
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
  const text = message.text.trim();

  // 2. COMMAND /start ATAU PANGGILAN MENU UTAMA
  if (text === '/start') {
    delete userSessions[chatId];
    // Mengirim pesan pembuka sekaligus memunculkan Reply Keyboard di bawah layar
    await sendMessage(
      chatId, 
      "🔥 *ALIGHT MOTION PREMIUM BOT* 🔥\n\nPilih menu di bawah atau klik tombol untuk memulai:", 
      bottomMenuKeyboard
    );
    return res.status(200).send('OK');
  }

  // Handle ketika user menekan tombol menu di bawah layar
  if (text === '⚡ Aktivasi Premium' || text === '/prem') {
    const sentMsg = await sendMessage(
      chatId, 
      "Silakan masukkan *Email* akun Alight Motion kamu:", 
      backKeyboard
    );
    userSessions[chatId] = { 
      step: 'WAITING_EMAIL', 
      promptMessageId: sentMsg?.message_id 
    };
    return res.status(200).send('OK');
  }

  if (text === '📜 Pesanan') {
    await sendMessage(chatId, "Fitur *Pesanan* belum tersedia.", bottomMenuKeyboard);
    return res.status(200).send('OK');
  }

  if (text === 'ℹ️ Informasi') {
    await sendMessage(chatId, "Bot ini digunakan untuk aktivasi Alight Motion Premium secara otomatis.\n\nowner@kaelptra hak cipta ©kalzstore", bottomMenuKeyboard);
    return res.status(200).send('OK');
  }

  const session = userSessions[chatId];

  // 3. STEP 1: TERIMA EMAIL
  if (session && session.step === 'WAITING_EMAIL' && !text.startsWith('/')) {
    const email = text;

    if (session.promptMessageId) {
      await deleteMessage(chatId, session.promptMessageId);
    }

    const loadingMsg = await sendMessage(chatId, "⏳ Mengirim Magic Link ke email kamu, tunggu sebentar...");

    try {
      const apiRes = await axios.post(AM_API_URL, { action: 'send-magiclink', email });

      if (loadingMsg) await deleteMessage(chatId, loadingMsg.message_id);

      if (apiRes.data.success) {
        const sentMsg = await sendMessage(
          chatId, 
          "✅ *Magic Link Terkirim!*\n\nBuka email kamu, tahan/salin link dari Alight Motion, lalu *tempelkan (paste) link tersebut di sini*:", 
          backKeyboard
        );
        userSessions[chatId] = { 
          step: 'WAITING_LINK', 
          email: email, 
          promptMessageId: sentMsg?.message_id 
        };
      } else {
        await sendMessage(
          chatId, 
          `❌ Gagal: ${apiRes.data.message || 'Email tidak valid.'}`, 
          backKeyboard
        );
        delete userSessions[chatId];
      }
    } catch (e) {
      if (loadingMsg) await deleteMessage(chatId, loadingMsg.message_id);
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

    if (session.promptMessageId) {
      await deleteMessage(chatId, session.promptMessageId);
    }

    const loadingMsg = await sendMessage(chatId, "⏳ Memproses aktivasi Premium akun kamu...");

    try {
      const verifyRes = await axios.post(AM_API_URL, { action: 'verify-account', email, rawLink });
      if (!verifyRes.data.success) throw new Error(verifyRes.data.message || 'Verifikasi link gagal!');

      const idToken = verifyRes.data.idToken || verifyRes.data.profile?.idToken;

      const premRes = await axios.post(AM_API_URL, { action: 'apply-premium', email, idToken });

      if (loadingMsg) await deleteMessage(chatId, loadingMsg.message_id);

      if (premRes.data.success) {
        await sendMessage(
          chatId, 
          `🎉 *SELAMAT! AKTIVASI BERHASIL* 🎉\n\nAkun Alight Motion kamu (\`${email}\`) sekarang sudah berstatus *PREMIUM*! √`, 
          reactivateMenuKeyboard
        );
      } else {
        throw new Error(premRes.data.message || 'Aktivasi premium gagal.');
      }
    } catch (err) {
      if (loadingMsg) await deleteMessage(chatId, loadingMsg.message_id);
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

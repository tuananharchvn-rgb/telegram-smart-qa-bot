require('dotenv').config();
const http = require('http');
const { Bot, InlineKeyboard, webhookCallback } = require('grammy');
const db = require('./db');

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('❌ LỖI: Chưa có BOT_TOKEN trong file .env');
  process.exit(1);
}

const bot = new Bot(token);

// ==========================================
// HỆ THỐNG KEEP-ALIVE 24/7 (CHỐNG NGỦ RENDER)
// ==========================================
let RENDER_EXTERNAL_URL = process.env.RENDER_EXTERNAL_URL || 'https://telegram-smart-qa-bot.onrender.com';
if (RENDER_EXTERNAL_URL && !RENDER_EXTERNAL_URL.startsWith('http')) {
  RENDER_EXTERNAL_URL = `https://${RENDER_EXTERNAL_URL}`;
}
let lastPingTime = null;
let lastPingStatus = 'Đang khởi tạo';

function initKeepAlive() {
  console.log(`⏱️ Đã kích hoạt hệ thống Keep-Alive tự động 24/7: ${RENDER_EXTERNAL_URL}`);
  setTimeout(() => pingKeepAlive(), 5000);
  setInterval(() => pingKeepAlive(), 3 * 60 * 1000);
}

async function pingKeepAlive() {
  try {
    const start = Date.now();
    const res = await fetch(`${RENDER_EXTERNAL_URL}/health`);
    const ms = Date.now() - start;
    lastPingTime = Date.now();
    if (res.ok) {
      lastPingStatus = `200 OK (${ms}ms)`;
    } else {
      lastPingStatus = `${res.status} (${ms}ms)`;
    }
  } catch (err) {
    lastPingStatus = `Lỗi: ${err.message}`;
  }
}

// ==========================================
// MÁY CHỦ HTTP CHO RENDER & WEBHOOK
// ==========================================
const PORT = process.env.PORT || 3000;
const USE_WEBHOOK = !process.env.USE_POLLING && !!process.env.RENDER_EXTERNAL_URL;
let webhookHandler = null;

if (USE_WEBHOOK) {
  webhookHandler = webhookCallback(bot, 'http', {
    onTimeout: 'return',
    timeoutMilliseconds: 50000
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  if (req.method === 'POST' && (pathname === '/webhook' || pathname === `/${token}` || pathname === '/')) {
    if (webhookHandler) {
      return webhookHandler(req, res);
    }
  }

  if (pathname === '/debug') {
    res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    return res.end(JSON.stringify({
      messagesCount: db.messages.length,
      topics: db.topics,
      messages: db.messages.slice(-15)
    }, null, 2));
  }

  if (pathname === '/health' || pathname === '/ping') {
    const stats = db.getStats();
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-cache, no-store'
    });
    return res.end(JSON.stringify({
      status: 'ok',
      service: 'Telegram Hashtag & Deep-Link Traceability Bot',
      mode: USE_WEBHOOK ? 'webhook' : 'polling',
      uptime: Math.floor(process.uptime()),
      lastPingTime,
      lastPingStatus,
      messagesIndexed: stats.total,
      chatsMonitored: stats.chats,
      mediaCount: stats.withMedia,
      topicsCount: stats.topicsCount
    }));
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  const stats = db.getStats();
  return res.end(`
<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="UTF-8">
  <title>Nexus Smart Hashtag Bot 24/7</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #f8fafc; padding: 40px 20px; text-align: center; }
    .card { max-width: 650px; margin: 0 auto; background: #1e293b; border-radius: 16px; padding: 30px; box-shadow: 0 10px 30px rgba(0,0,0,0.5); border: 1px solid #334155; }
    h1 { color: #38bdf8; margin-bottom: 8px; font-size: 26px; }
    .badge { display: inline-block; padding: 6px 14px; border-radius: 20px; font-size: 13px; font-weight: 600; margin-bottom: 20px; background: #065f46; color: #34d399; }
    .stats { display: flex; justify-content: space-around; margin: 25px 0; border-top: 1px solid #334155; border-bottom: 1px solid #334155; padding: 15px 0; }
    .stat-val { font-size: 24px; font-weight: bold; color: #38bdf8; }
    .stat-lbl { font-size: 12px; color: #94a3b8; text-transform: uppercase; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🤖 Nexus Hashtag & Topic Traceability Bot</h1>
    <p style="color: #94a3b8; margin: 0 0 15px 0;">Truy xuất chính xác tin nhắn theo Hashtag & Deep Link Topic 24/7</p>
    <div class="badge">● ONLINE 24/7 (${USE_WEBHOOK ? 'Webhook Mode' : 'Polling Mode'})</div>
    <div class="stats">
      <div><div class="stat-val">${stats.total}</div><div class="stat-lbl">Tin nhắn nhóm</div></div>
      <div><div class="stat-val">${stats.chats}</div><div class="stat-lbl">Nhóm dự án</div></div>
      <div><div class="stat-val">${stats.topicsCount}</div><div class="stat-lbl">Topics ghi nhận</div></div>
    </div>
  </div>
</body>
</html>
  `);
});

// ==========================================
// MIDDLEWARE: CHỈ GHI NHỚ TIN NHẮN TỪ NHÓM / KÊNH
// TUYỆT ĐỐI KHÔNG LƯU TIN NHẮN TỪ CHAT RIÊNG (DM)
// ==========================================
bot.use(async (ctx, next) => {
  const msg = ctx.message || ctx.channel_post;
  if (msg && msg.chat && (msg.chat.type === 'supergroup' || msg.chat.type === 'group' || msg.chat.type === 'channel')) {
    db.addMessage(msg);
  }
  await next();
});

// ==========================================
// LỆNH ĐẶT TÊN CHO TOPIC (/settopic, /topic)
// ==========================================
bot.command(['settopic', 'topic', 'nametopic'], async (ctx) => {
  const topicName = ctx.match?.trim();
  const threadId = ctx.message.message_thread_id;

  if (!threadId) {
    return ctx.reply('⚠️ Lệnh này chỉ dùng bên trong một **Topic** cụ thể của nhóm có Topics (Forum Supergroup).', {
      parse_mode: 'Markdown'
    });
  }

  if (!topicName) {
    const current = db.getTopicName(ctx.chat.id, threadId) || `Topic #${threadId}`;
    return ctx.reply(`🏷️ Tên hiện tại của Topic này là: *"${current}"*\n👉 Để đổi tên, gõ: \`/settopic Tên_Mới\` (Ví dụ: \`/settopic Cửa Nhôm & Vật Liệu\`)`, {
      parse_mode: 'Markdown'
    });
  }

  db.saveTopicName(ctx.chat.id, threadId, topicName);
  await ctx.reply(`✅ Đã lưu tên Topic: *"${topicName}"*! Từ bây giờ bot sẽ hiển thị đúng tên Topic này khi bạn tra cứu.`, {
    parse_mode: 'Markdown'
  });
});

// ==========================================
// CÁC LỆNH CƠ BẢN (/start, /help, /stats)
// ==========================================
bot.command(['start', 'help'], async (ctx) => {
  const guide = `🤖 *TRỢ LÝ TRUY XUẤT TIN NHẮN THEO HASHTAG & TOPIC*

Xin chào *${ctx.from.first_name}*! Bot chuyên tìm kiếm và xuất đầy đủ nội dung tin nhắn chứa đúng các Hashtag được yêu cầu.

🎯 *CÁCH TRA CỨU:*
Bạn chỉ cần gõ một hoặc nhiều hashtag cần tìm, ví dụ:
👉 \`#hop\`
👉 \`#cuanhom\`
👉 \`#cuanhom #baogia\`
👉 \`#quyhoach #pheduyet\`

✨ *KẾT QUẢ TRẢ VỀ ĐẦY ĐỦ BAO GỒM:*
1. 📍 *Gửi ở đâu:* Tên Nhóm + Tên Topic cụ thể.
2. ⏰ *Gửi ngày nào:* Giờ và ngày gửi cụ thể.
3. 📝 *Nội dung tin nhắn:* Toàn bộ nội dung cụ thể của tin nhắn gốc.
4. 📎 *Tệp đính kèm:* Tên bản vẽ/ảnh nếu có.
5. 🔗 *Nút Deep Link:* Nhảy thẳng vào đúng tin nhắn trong Topic đó trên Telegram.

*(Đã lược bỏ phần người gửi, bỏ trạng thái và bỏ trích dẫn theo đúng yêu cầu)*.

⚠️ *Lưu ý quan trọng:*
- Để bot ghi nhớ được tin nhắn, hãy **thêm bot vào nhóm và cấp quyền Admin**.
- Telegram chỉ cho phép bot nhận các tin nhắn được gửi *sau khi bot vào nhóm*.
- Trong Topic của nhóm, bạn có thể gõ \`/topic Tên_Topic\` để đặt tên nhận diện cho Topic.`;

  await ctx.reply(guide, { parse_mode: 'Markdown' });
});

bot.command('stats', async (ctx) => {
  const stats = db.getStats();
  await ctx.reply(`📊 *THỐNG KÊ DỮ LIỆU NHÓM ĐÃ GHI NHỚ:*
- 💬 Số tin nhắn nhóm đã lưu: *${stats.total}*
- 👥 Số nhóm theo dõi: *${stats.chats}*
- 🏷️ Số Topic có tên định danh: *${stats.topicsCount}*
- 📁 Số tin nhắn có tệp / hình ảnh: *${stats.withMedia}*`, { parse_mode: 'Markdown' });
});

// ==========================================
// LỆNH HỎI ĐÁP /ask, /hoi, /tim
// ==========================================
bot.command(['ask', 'hoi', 'tim', 'truyxuat'], async (ctx) => {
  const question = ctx.match?.trim();
  if (!question) {
    return ctx.reply('💡 Bạn hãy nhập hashtag hoặc nội dung cần tìm sau lệnh `/ask`. Ví dụ:\n`/ask #hop`\n`/ask #cuanhom #chot`', {
      parse_mode: 'Markdown'
    });
  }
  await handleHashtagSearch(ctx, question);
});

// ==========================================
// BẮT SỰ KIỆN CHAT RIÊNG (DM) HOẶC MENTION TRONG NHÓM
// ==========================================
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const botUsername = bot.botInfo.username;

  // 1. Nhắn tin trong Chat Riêng 1-1 với Bot
  if (ctx.chat.type === 'private' && !text.startsWith('/')) {
    return handleHashtagSearch(ctx, text);
  }

  // 2. Mention @bot trong nhóm
  const mentionPattern = new RegExp(`@${botUsername}\\b`, 'i');
  if (mentionPattern.test(text)) {
    const cleanedQuestion = text.replace(mentionPattern, '').trim();
    if (cleanedQuestion) {
      return handleHashtagSearch(ctx, cleanedQuestion);
    } else {
      return ctx.reply(`Dạ tôi nghe! Hãy gửi hashtag bạn cần tra cứu (ví dụ: \`#hop\` hoặc \`#cuanhom\`).`, { parse_mode: 'Markdown' });
    }
  }

  // 3. Reply tin nhắn của bot trong nhóm
  if (ctx.message.reply_to_message?.from?.id === bot.botInfo.id) {
    if (!text.startsWith('/')) {
      return handleHashtagSearch(ctx, text);
    }
  }
});

// ==========================================
// HÀM TRÍCH XUẤT HASHTAG TỪ CÂU HỎI
// ==========================================
function extractHashtags(query) {
  // Tìm các từ có dấu #
  const matched = query.match(/#[\p{L}\p{N}_]+/gu);
  if (matched && matched.length > 0) {
    return [...new Set(matched.map(t => t.toLowerCase()))];
  }

  // Nếu người dùng không gõ dấu #, tách từ khóa và coi như hashtag
  const cleaned = query.replace(/[?.,!:]/g, ' ').trim();
  const stopwords = ['tìm', 'xem', 'hỏi', 'cho', 'có', 'thông', 'tin', 'về', 'liên', 'quan', 'đến', 'nội', 'dung', 'là', 'gì', 'hôm', 'nào', 'ở', 'đâu'];
  const words = cleaned.split(/\s+/).filter(w => w.length > 1 && !stopwords.includes(w.toLowerCase()));

  return [...new Set(words.map(w => w.startsWith('#') ? w.toLowerCase() : `#${w.toLowerCase()}`))];
}

// ==========================================
// HÀM TÌM KIẾM VÀ TRẢ VỀ CHÍNH XÁC THEO HASHTAG
// ==========================================
async function handleHashtagSearch(ctx, query) {
  try {
    await ctx.replyWithChatAction('typing');

    const tags = extractHashtags(query);
    if (!tags || tags.length === 0) {
      return ctx.reply('💡 Vui lòng nhập hashtag bạn muốn tìm kiếm (ví dụ: `#hop`, `#cuanhom`, `#quyhoach`).', {
        parse_mode: 'Markdown',
        reply_to_message_id: ctx.message.message_id
      });
    }

    const isPrivate = ctx.chat.type === 'private';
    // Tìm kiếm trong toàn bộ nhóm nếu đang chat riêng, hoặc trong nhóm hiện tại nếu ở trong nhóm
    const results = db.searchByHashtags(tags, isPrivate ? null : ctx.chat.id);

    // TRƯỜNG HỢP 1: Kho dữ liệu nhóm chưa có tin nhắn nào
    if (db.messages.length === 0) {
      return ctx.reply(`⚠️ *CHƯA CÓ TIN NHẮN TỪ NHÓM NÀO ĐƯỢC GHI NHẬN*

Hiện tại bot chưa ghi nhận được tin nhắn nào từ các nhóm/topic dự án của bạn.

👉 *Để bot có thể tìm kiếm theo hashtag:*
1. Hãy thêm bot \`@${bot.botInfo.username}\` vào nhóm dự án của bạn.
2. Cấp quyền **Admin (Quản trị viên)** cho bot để Telegram cho phép bot đọc tin nhắn nhóm.
3. Khi bạn hoặc thành viên gửi tin nhắn có gắn hashtag (ví dụ: \`#hop\`, \`#cuanhom\`) vào Topic, bot sẽ tự động ghi nhớ ngay lập tức.
4. Sau đó vào đây gõ \`#hop\`, bot sẽ lập tức trả về đầy đủ tin nhắn kèm nút nhảy thẳng vào Topic đó!

*(Lưu ý: Telegram không hỗ trợ bot đọc lại các tin nhắn cũ đã gửi trước khi thêm bot)*.`, {
        parse_mode: 'Markdown',
        reply_to_message_id: ctx.message.message_id
      });
    }

    // TRƯỜNG HỢP 2: Đã có tin nhắn nhóm nhưng không tìm thấy hashtag khớp
    if (results.length === 0) {
      return ctx.reply(`🔍 *KẾT QUẢ TÌM KIẾM HASHTAG*

⚠️ Không tìm thấy tin nhắn nào có đủ các hashtag: \`${tags.join(' ')}\` trong lịch sử nhóm đã ghi nhận (${db.messages.length} tin nhắn).

👉 *Gợi ý:*
• Hãy kiểm tra lại chính tả hashtag (ví dụ: \`#hop\`).
• Đảm bảo tin nhắn mang hashtag đó được gửi vào nhóm *sau khi bot đã vào nhóm và có quyền Admin*.`, {
        parse_mode: 'Markdown',
        reply_to_message_id: ctx.message.message_id
      });
    }

    // TRƯỜNG HỢP 3: TÌM THẤY TIN NHẮN KHỚP ĐỦ HASHTAG
    // Xuất đầy đủ tất cả các nội dung tin nhắn có đủ hashtag
    // Bỏ phần ai là người gửi, bỏ trạng thái, bỏ trích dẫn then chốt theo đúng yêu cầu người dùng
    await ctx.reply(`🎯 *TÌM THẤY ${results.length} TIN NHẮN CÓ ĐỦ HASHTAG:* \`${tags.join(' ')}\``, {
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    });

    // Giới hạn tối đa 6 tin nhắn mới nhất để không spam chat
    const displayList = results.slice(0, 6);

    for (let i = 0; i < displayList.length; i++) {
      const m = displayList[i];

      let msgText = `📌 *KẾT QUẢ ${i + 1}/${results.length}:*\n\n`;

      // 1. GỬI Ở ĐÂU
      msgText += `📍 *GỬI Ở ĐÂU:*\n`;
      msgText += `🏢 *Nhóm:* \`${m.chat_title}\`\n`;
      msgText += `🏷️ *Topic:* \`${m.topic_name}\`\n\n`;

      // 2. GỬI NGÀY NÀO
      msgText += `⏰ *GỬI NGÀY NÀO:*\n`;
      msgText += `📅 \`${m.date_formatted}\`\n\n`;

      // 3. NỘI DUNG TIN NHẮN (Đưa đầy đủ nội dung tin nhắn gốc)
      msgText += `📝 *NỘI DUNG TIN NHẮN:*\n`;
      msgText += `${m.text}\n`;

      if (m.file_name) {
        msgText += `\n📎 *Tệp đính kèm:* \`${m.file_name}\`\n`;
      }

      // Xây dựng nút Deep Link nhảy thẳng vào đúng tin nhắn trong Topic
      const keyboard = new InlineKeyboard();
      if (m.deep_link && m.deep_link.startsWith('http')) {
        keyboard.url('👉 🚀 Mở tin nhắn trong Topic', m.deep_link);
      }

      await ctx.reply(msgText, {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      });
    }

  } catch (err) {
    console.error('Lỗi tìm kiếm hashtag:', err);
    await ctx.reply(`⚠️ Đã xảy ra lỗi: ${err.message}`, {
      reply_to_message_id: ctx.message.message_id
    });
  }
}

// ==========================================
// KHỞI ĐỘNG HỆ THỐNG
// ==========================================
async function startBot() {
  server.listen(PORT, async () => {
    console.log(`🌐 Server HTTP đang lắng nghe trên cổng ${PORT}`);
    initKeepAlive();

    if (USE_WEBHOOK) {
      console.log(`🚀 Cấu hình Webhook: ${RENDER_EXTERNAL_URL}/webhook`);
      try {
        await bot.api.setWebhook(`${RENDER_EXTERNAL_URL}/webhook`, {
          drop_pending_updates: true,
          allowed_updates: ['message', 'edited_message', 'channel_post']
        });
        const webhookInfo = await bot.api.getWebhookInfo();
        console.log('✅ Webhook đăng ký thành công:', webhookInfo.url);
      } catch (err) {
        console.error('⚠️ Lỗi Webhook, chuyển sang Polling:', err.message);
        startPolling();
      }
    } else {
      startPolling();
    }
  });
}

function startPolling() {
  console.log('🤖 Đang khởi chạy bot Polling...');
  bot.start({
    drop_pending_updates: true,
    allowed_updates: ['message', 'edited_message', 'channel_post'],
    onStart: (info) => {
      console.log(`✅ BOT ĐANG CHẠY: @${info.username}`);
    }
  }).catch(async (err) => {
    console.warn('⚠️ Lỗi Polling:', err.message);
    await new Promise(r => setTimeout(r, 5000));
    startPolling();
  });
}

startBot();

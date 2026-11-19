require('dotenv').config();
const http = require('http');
const { Bot, InlineKeyboard, webhookCallback } = require('grammy');
const db = require('./db');
const ai = require('./ai');

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
      console.log(`💓 [Keep-Alive Ping] 200 OK (${ms}ms) lúc ${new Date().toLocaleTimeString('vi-VN')}`);
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
      recentMessages: db.messages.slice(-10)
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
      service: 'Telegram Smart Q&A & Deep-Link Traceability Bot',
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
  <title>Nexus Smart Q&A Bot 24/7</title>
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
    <h1>🤖 Nexus Smart Q&A Bot</h1>
    <p style="color: #94a3b8; margin: 0 0 15px 0;">Trợ lý Truy vấn Nguồn gốc Thông tin & Deep Link Topic 24/7</p>
    <div class="badge">● ONLINE 24/7 (${USE_WEBHOOK ? 'Webhook Mode' : 'Polling Mode'})</div>
    <div class="stats">
      <div><div class="stat-val">${stats.total}</div><div class="stat-lbl">Tin nhắn thực tế</div></div>
      <div><div class="stat-val">${stats.chats}</div><div class="stat-lbl">Nhóm theo dõi</div></div>
      <div><div class="stat-val">${stats.topicsCount}</div><div class="stat-lbl">Topics ghi nhận</div></div>
    </div>
  </div>
</body>
</html>
  `);
});

// ==========================================
// MIDDLEWARE: GHI NHỚ MỌI TIN NHẮN TỪ NHÓM / KÊNH
// ==========================================
bot.use(async (ctx, next) => {
  const msg = ctx.message || ctx.channel_post;
  if (msg) {
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
    return ctx.reply(`🏷️ Tên hiện tại của Topic này là: *"${current}"*\n👉 Để đổi tên, gõ: \`/settopic Tên_Mới\` (Ví dụ: \`/settopic Vật liệu & Hoàn thiện\`)`, {
      parse_mode: 'Markdown'
    });
  }

  db.saveTopicName(ctx.chat.id, threadId, topicName);
  await ctx.reply(`✅ Đã ghi nhận tên Topic: *"${topicName}"* cho luồng này! Từ bây giờ bot sẽ nhận diện chính xác tên Topic này khi truy vấn.`, {
    parse_mode: 'Markdown'
  });
});

// ==========================================
// CÁC LỆNH CƠ BẢN (/start, /help, /stats)
// ==========================================
bot.command(['start', 'help'], async (ctx) => {
  const isPrivate = ctx.chat.type === 'private';

  const guide = isPrivate ? `🤖 *TRỢ LÝ TRUY VẤN NGUỒN GỐC THÔNG TIN (SMART Q&A + DEEP LINK)*

Xin chào *${ctx.from.first_name}*! Đây là *khung chat riêng 1-1* của bạn với Bot.

Bạn có thể vào thẳng đây để hỏi và truy vấn bất kỳ thông tin nào đã được gửi lên các nhóm hoặc Topic. Tôi sẽ trả lời đầy đủ:
• 📍 *Gửi ở đâu:* Nhóm nào, Topic nào cụ thể.
• ⏰ *Gửi ngày nào:* Giờ và ngày gửi cụ thể.
• 👤 *Ai là người gửi:* Sếp, đối tác hay KTS nào.
• 📝 *Nội dung cụ thể thế nào:* Tóm tắt súc tích & phân tích trạng thái (Đã chốt hay Đang đề xuất).
• 🔗 *Deep Link Topic:* Nút bấm nhảy thẳng vào đúng tin nhắn trong Topic để xem lại file/ảnh.

💡 *Lưu ý quan trọng:*
- Để bot ghi nhớ được các tin nhắn trong nhóm, bạn cần **Thêm bot vào nhóm và cấp quyền Admin (Quản trị viên)**.
- Telegram không cho phép bot đọc lại các tin nhắn cũ trước khi bot được thêm vào nhóm.
- Bạn có thể gõ \`/settopic Tên_Topic\` ngay trong Topic của nhóm để đặt tên Topic chuẩn xác.`
: 
`🤖 *TRỢ LÝ TRUY VẤN NGUỒN GỐC (SMART Q&A + DEEP LINK)*

Xin chào cả nhà! Tôi đang ghi nhớ các trao đổi, bản vẽ và quyết định trong nhóm.

🎯 *Cách dùng trong nhóm:*
• \`/topic Tên_Topic\`: Đặt tên định danh cho Topic này (ví dụ: \`/topic Cửa Nhôm & Vật Liệu\`).
• \`@${bot.botInfo.username} <câu hỏi>\`: Hỏi đáp và truy xuất thông tin.
• Hoặc bạn có thể **nhắn tin riêng 1-1 với bot** để tra cứu mọi lúc mọi nơi!`;

  await ctx.reply(guide, { parse_mode: 'Markdown' });
});

bot.command('stats', async (ctx) => {
  const stats = db.getStats();
  await ctx.reply(`📊 *THỐNG KÊ DỮ LIỆU ĐÃ GHI NHỚ THỰC TẾ:*
- 💬 Tổng số tin nhắn đã lưu: *${stats.total}*
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
    return ctx.reply('💡 Bạn hãy nhập câu hỏi sau lệnh `/ask`. Ví dụ:\n`/ask Cửa nhôm kính gửi lên topic nào, ngày nào?`', {
      parse_mode: 'Markdown'
    });
  }
  await handleUserQuestion(ctx, question);
});

// ==========================================
// BẮT SỰ KIỆN CHAT RIÊNG (DM) HOẶC MENTION
// ==========================================
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const botUsername = bot.botInfo.username;

  // 1. Nhắn tin trong Chat Riêng 1-1 với Bot
  if (ctx.chat.type === 'private' && !text.startsWith('/')) {
    return handleUserQuestion(ctx, text);
  }

  // 2. Mention @bot trong nhóm
  const mentionPattern = new RegExp(`@${botUsername}\\b`, 'i');
  if (mentionPattern.test(text)) {
    const cleanedQuestion = text.replace(mentionPattern, '').trim();
    if (cleanedQuestion) {
      return handleUserQuestion(ctx, cleanedQuestion);
    } else {
      return ctx.reply(`Dạ tôi nghe đây! Bạn hãy nhập câu hỏi cần truy vấn nhé.`, { parse_mode: 'Markdown' });
    }
  }

  // 3. Reply tin nhắn của bot trong nhóm
  if (ctx.message.reply_to_message?.from?.id === bot.botInfo.id) {
    if (!text.startsWith('/')) {
      return handleUserQuestion(ctx, text);
    }
  }
});

// ==========================================
// HÀM XỬ LÝ TRUY VẤN NGUỒN GỐC THÔNG TIN
// ==========================================
async function handleUserQuestion(ctx, question) {
  try {
    await ctx.replyWithChatAction('typing');

    const isPrivate = ctx.chat.type === 'private';
    const messages = db.getRecentMessages(isPrivate ? null : ctx.chat.id, 150);

    // Nếu kho tin nhắn thực tế hoàn toàn trống
    if (!messages || messages.length === 0) {
      return ctx.reply(`⚠️ *CHƯA CÓ DỮ LIỆU TIN NHẮN THỰC TẾ TRONG HỆ THỐNG*

Bot chưa ghi nhận tin nhắn nào từ nhóm Telegram của bạn.

👉 *Để bắt đầu ghi nhớ và truy xuất:*
1. Hãy thêm bot \`@${bot.botInfo.username}\` vào nhóm dự án của bạn.
2. Cấp quyền **Admin (Quản trị viên)** cho bot để Telegram cho phép bot đọc tin nhắn.
3. Gửi thử một tin nhắn hoặc tệp bản vẽ vào một Topic bất kỳ.
4. Sau đó quay lại hỏi bot, bot sẽ truy xuất nguồn gốc chính xác 100%!

*(Lưu ý: Telegram không hỗ trợ đọc lại các tin nhắn cũ đã gửi trước khi bot vào nhóm)*.`, {
        parse_mode: 'Markdown',
        reply_to_message_id: ctx.message.message_id
      });
    }

    // Gửi câu hỏi đến Gemini AI
    const aiResult = await ai.answerQuestion(question, messages);

    // Nếu không tìm thấy thông tin phù hợp
    if (!aiResult.found) {
      return ctx.reply(`🔍 *KẾT QUẢ TRUY VẤN NGUỒN GỐC*

⚠️ *Không tìm thấy thông tin phù hợp trong lịch sử tin nhắn đã ghi nhận.*

👉 *Gợi ý:*
• Kiểm tra xem thông tin này có phải được gửi *trước khi thêm bot vào nhóm* không (bot chỉ đọc được tin nhắn từ khi tham gia nhóm).
• Thử hỏi với từ khóa cụ thể hơn (ví dụ: tên người gửi hoặc tên tệp đính kèm).`, {
        parse_mode: 'Markdown',
        reply_to_message_id: ctx.message.message_id
      });
    }

    // Trạng thái đã chốt hay đề xuất
    let statusEmoji = '📌';
    let statusText = aiResult.status || 'Chưa xác định';
    if (statusText.toLowerCase().includes('chốt') || statusText.toLowerCase().includes('approved')) {
      statusEmoji = '✅';
      statusText = 'ĐÃ CHỐT CHÍNH THỨC';
    } else if (statusText.toLowerCase().includes('đề xuất') || statusText.toLowerCase().includes('proposed')) {
      statusEmoji = '💡';
      statusText = 'MỚI CHỈ LÀ ĐỀ XUẤT / ĐANG BÀN THẢO';
    }

    // XUẤT KẾT QUẢ THEO ĐÚNG YÊU CẦU
    let responseMsg = `🎯 *KẾT QUẢ TRUY VẤN NGUỒN GỐC*\n\n`;

    // 1. GỬI Ở ĐÂU
    responseMsg += `📍 *GỬI Ở ĐÂU:*\n`;
    responseMsg += `🏢 *Nhóm:* \`${aiResult.chat_title || 'Nhóm Dự Án'}\`\n`;
    responseMsg += `🏷️ *Topic:* \`${aiResult.topic_name || 'Kênh chung'}\`\n\n`;

    // 2. GỬI NGÀY NÀO
    responseMsg += `⏰ *GỬI NGÀY NÀO:*\n`;
    responseMsg += `📅 \`${aiResult.date_formatted || 'Không xác định'}\`\n\n`;

    // 3. AI LÀ NGƯỜI GỬI
    responseMsg += `👤 *AI LÀ NGƯỜI GỬI:*\n`;
    responseMsg += `*${aiResult.sender_name || 'Không rõ danh tính'}*\n\n`;

    // 4. NỘI DUNG CỤ THỂ THẾ NÀO
    responseMsg += `📝 *NỘI DUNG CỤ THỂ:*\n`;
    responseMsg += `👉 ${aiResult.summary}\n`;
    responseMsg += `${statusEmoji} *Trạng thái:* \`${statusText}\`\n`;

    if (aiResult.file_name) {
      responseMsg += `📎 *Tệp đính kèm:* \`${aiResult.file_name}\`\n`;
    }
    if (aiResult.evidence_quote) {
      responseMsg += `💬 *Trích dẫn then chốt:* _"${aiResult.evidence_quote}"_\n`;
    }

    // Xây dựng Bàn phím Deep Link
    const keyboard = new InlineKeyboard();
    let hasLink = false;

    if (aiResult.deep_link && aiResult.deep_link.startsWith('http')) {
      const topicLabel = aiResult.topic_name ? ` [${aiResult.topic_name}]` : '';
      keyboard.url(`👉 🚀 Mở tin nhắn trong Topic${topicLabel}`, aiResult.deep_link);
      hasLink = true;
    }

    if (aiResult.additional_sources && Array.isArray(aiResult.additional_sources)) {
      for (const src of aiResult.additional_sources) {
        if (src.deep_link && src.deep_link.startsWith('http')) {
          const roleText = src.role || 'Xem tin nhắn liên quan';
          const senderInfo = src.sender_name ? ` - ${src.sender_name}` : '';
          keyboard.row().url(`🔗 ${roleText}${senderInfo}`, src.deep_link);
          hasLink = true;
        }
      }
    }

    const replyOptions = {
      parse_mode: 'Markdown',
      reply_to_message_id: ctx.message.message_id
    };

    if (hasLink) {
      replyOptions.reply_markup = keyboard;
      responseMsg += `\n🔗 *XEM LẠI TIN NHẮN GỐC TRONG TOPIC:*\nNhấn nút bên dưới để nhảy thẳng vào đúng Topic trên Telegram 👇`;
    } else {
      responseMsg += `\n🔗 *Tin nhắn gốc:* _(ID #${aiResult.message_id || 'N/A'})_`;
    }

    await ctx.reply(responseMsg, replyOptions);

  } catch (err) {
    console.error('Lỗi khi truy vấn:', err);
    await ctx.reply(`⚠️ Đã xảy ra lỗi khi truy vấn: ${err.message}`, {
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
      console.log(`🚀 Đang cấu hình Webhook với Render: ${RENDER_EXTERNAL_URL}/webhook`);
      try {
        await bot.api.setWebhook(`${RENDER_EXTERNAL_URL}/webhook`, {
          drop_pending_updates: true,
          allowed_updates: ['message', 'edited_message', 'channel_post']
        });
        const webhookInfo = await bot.api.getWebhookInfo();
        console.log('✅ Webhook đã đăng ký thành công:', webhookInfo.url);
      } catch (err) {
        console.error('⚠️ Đăng ký Webhook thất bại, chuyển sang Polling:', err.message);
        startPolling();
      }
    } else {
      startPolling();
    }
  });
}

function startPolling() {
  console.log('🤖 Đang khởi chạy bot ở chế độ Long Polling...');
  bot.start({
    drop_pending_updates: true,
    allowed_updates: ['message', 'edited_message', 'channel_post'],
    onStart: (info) => {
      console.log(`✅ BOT ĐANG CHẠY (POLLING): @${info.username}`);
    }
  }).catch(async (err) => {
    console.warn('⚠️ Lỗi Polling:', err.message);
    await new Promise(r => setTimeout(r, 5000));
    startPolling();
  });
}

startBot();

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
  console.log(`⏱️ Đã kích hoạt hệ thống Keep-Alive tự động 24/7`);
  console.log(`   URL giám sát: ${RENDER_EXTERNAL_URL}`);

  setTimeout(() => pingKeepAlive(), 5000);
  setInterval(() => pingKeepAlive(), 3 * 60 * 1000); // 3 phút ping 1 lần
}

async function pingKeepAlive() {
  try {
    const start = Date.now();
    const res = await fetch(`${RENDER_EXTERNAL_URL}/health`);
    const ms = Date.now() - start;
    lastPingTime = Date.now();
    if (res.ok) {
      lastPingStatus = `200 OK (${ms}ms)`;
      console.log(`💓 [Keep-Alive Ping] 200 OK (${ms}ms) lúc ${new Date().toLocaleTimeString('vi-VN')} - Duy trì 24/7`);
    } else {
      lastPingStatus = `${res.status} (${ms}ms)`;
      console.warn(`⚠️ [Keep-Alive Ping Warning] Status: ${res.status}`);
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
    .features { text-align: left; background: #0f172a; border-radius: 10px; padding: 18px 20px; margin-top: 20px; }
    .features li { margin-bottom: 10px; color: #cbd5e1; font-size: 14px; line-height: 1.5; }
    .features strong { color: #f1f5f9; }
  </style>
</head>
<body>
  <div class="card">
    <h1>🤖 Nexus Smart Q&A Bot</h1>
    <p style="color: #94a3b8; margin: 0 0 15px 0;">Trợ lý Truy vấn Nguồn gốc Thông tin & Deep Link Topic 24/7</p>
    <div class="badge">● ONLINE 24/7 (${USE_WEBHOOK ? 'Webhook Mode' : 'Polling Mode'})</div>

    <div class="stats">
      <div><div class="stat-val">${stats.total}</div><div class="stat-lbl">Tin nhắn đã lưu</div></div>
      <div><div class="stat-val">${stats.chats}</div><div class="stat-lbl">Nhóm / Hội thoại</div></div>
      <div><div class="stat-val">${stats.topicsCount}</div><div class="stat-lbl">Topics theo dõi</div></div>
      <div><div class="stat-val">${stats.withMedia}</div><div class="stat-lbl">Tệp / Bản vẽ</div></div>
    </div>

    <div class="features">
      <div style="font-weight: 600; color: #38bdf8; margin-bottom: 10px;">✨ Định dạng truy vấn chuẩn xác:</div>
      <ul>
        <li><strong>📍 Gửi ở đâu:</strong> Nhóm nào, Topic nào cụ thể.</li>
        <li><strong>⏰ Ngày nào:</strong> Ngày & giờ chi tiết của tin nhắn.</li>
        <li><strong>👤 Người gửi:</strong> Ai đã gửi thông tin (sếp, đối tác, KTS).</li>
        <li><strong>📝 Nội dung cụ thể:</strong> Tóm tắt chi tiết, tình trạng Đã chốt hay Đề xuất.</li>
        <li><strong>🔗 Deep Link Topic:</strong> Nút bấm 1 chạm nhảy thẳng vào Topic mở xem lại file/ảnh.</li>
      </ul>
    </div>
  </div>
</body>
</html>
  `);
});

// ==========================================
// MIDDLEWARE: TỰ ĐỘNG GHI NHỚ MỌI TIN NHẮN
// ==========================================
bot.use(async (ctx, next) => {
  if (ctx.message) {
    db.addMessage(ctx.message);
  }
  await next();
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
• 📝 *Nội dung cụ thể thế nào:* Tóm tắt chi tiết & trạng thái (Đã chốt hay Đang đề xuất).
• 🔗 *Deep Link Topic:* Nút bấm nhảy thẳng vào tin nhắn gốc trong đúng Topic để mở xem lại file hoặc ảnh đính kèm.

💡 *Bạn có thể gõ câu hỏi ngay tại đây, ví dụ:*
👉 \`Cửa nhôm kính gửi lên topic nào, ngày nào, ai gửi và nội dung cụ thể thế nào?\`
👉 \`Hôm trước ai gửi file quy hoạch lên topic nào thế?\`
👉 \`Mặt bằng tầng 1 và tầng 2 gửi ở đâu, đã chốt chưa?\`
👉 \`Bản vẽ quy hoạch gửi ngày nào, ai gửi?\`` 
: 
`🤖 *TRỢ LÝ TRUY VẤN NGUỒN GỐC (SMART Q&A + DEEP LINK)*

Xin chào cả nhà! Tôi đang theo dõi và ghi nhớ các trao đổi, bản vẽ và quyết định trong nhóm.

🎯 *Cách kích hoạt truy vấn trong nhóm:*
1️⃣ Nhắc tên tôi kèm câu hỏi:
👉 \`@${bot.botInfo.username} Cửa nhôm kính gửi lên topic nào, ngày nào, ai gửi và nội dung thế nào?\`
2️⃣ Dùng lệnh \`/ask\`:
👉 \`/ask Hôm trước ai gửi file quy hoạch lên topic nào thế?\`
3️⃣ Hoặc bạn có thể *nhắn tin riêng trực tiếp cho tôi* để tra cứu bảo mật mà không làm phiền nhóm!`;

  await ctx.reply(guide, { parse_mode: 'Markdown' });
});

bot.command('stats', async (ctx) => {
  const stats = db.getStats();
  await ctx.reply(`📊 *THỐNG KÊ HỆ THỐNG TRUY VẤN:*
- 💬 Tổng số tin nhắn đã lập chỉ mục: *${stats.total}*
- 👥 Số nhóm / hội thoại: *${stats.chats}*
- 🏷️ Số Topic được phân loại: *${stats.topicsCount}*
- 📁 Số tin nhắn có tệp / hình ảnh: *${stats.withMedia}*
- ⏱️ Thời gian hoạt động: *${Math.floor(process.uptime() / 60)} phút*`, { parse_mode: 'Markdown' });
});

// ==========================================
// LỆNH HỎI ĐÁP /ask, /hoi, /tim
// ==========================================
bot.command(['ask', 'hoi', 'tim', 'truyxuat'], async (ctx) => {
  const question = ctx.match?.trim();
  if (!question) {
    return ctx.reply('💡 Bạn hãy nhập câu hỏi sau lệnh `/ask`. Ví dụ:\n`/ask Cửa nhôm kính gửi lên topic nào, ngày nào, ai gửi và nội dung thế nào?`\n`/ask Ai đã gửi file quy hoạch?`', {
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

  // 1. Nếu nhắn tin trực tiếp trong Chat Riêng (DM) với Bot
  if (ctx.chat.type === 'private' && !text.startsWith('/')) {
    return handleUserQuestion(ctx, text);
  }

  // 2. Nếu có mention @bot_username trong nhóm
  const mentionPattern = new RegExp(`@${botUsername}\\b`, 'i');
  if (mentionPattern.test(text)) {
    const cleanedQuestion = text.replace(mentionPattern, '').trim();
    if (cleanedQuestion) {
      return handleUserQuestion(ctx, cleanedQuestion);
    } else {
      return ctx.reply(`Dạ tôi nghe đây! Bạn hãy nhập câu hỏi cần truy vấn (ví dụ: \`@${botUsername} Cửa nhôm kính gửi lên topic nào, ngày nào, nội dung thế nào?\`)`, { parse_mode: 'Markdown' });
    }
  }

  // 3. Nếu reply tin nhắn của bot trong nhóm
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

    // Trong chat riêng: Lấy tin nhắn từ TẤT CẢ các nhóm để tra cứu toàn diện
    // Trong nhóm: Ưu tiên tin nhắn của chính nhóm đó
    const isPrivate = ctx.chat.type === 'private';
    const messages = db.getRecentMessages(isPrivate ? null : ctx.chat.id, 150);

    // Gửi câu hỏi đến Gemini AI
    const aiResult = await ai.answerQuestion(question, messages);

    // Xác định biểu tượng trạng thái
    let statusEmoji = '📌';
    let statusText = aiResult.status || 'Chưa xác định';
    if (statusText.includes('chốt') || statusText.includes('Approved')) {
      statusEmoji = '✅';
      statusText = 'ĐÃ CHỐT CHÍNH THỨC';
    } else if (statusText.includes('đề xuất') || statusText.includes('Proposed')) {
      statusEmoji = '💡';
      statusText = 'MỚI CHỈ LÀ ĐỀ XUẤT / ĐANG BÀN THẢO';
    }

    // XÂY DỰNG NỘI DUNG TRẢ LỜI ĐÁP ỨNG ĐẦY ĐỦ CÁC YẾU TỐ:
    // 1. Gửi ở đâu (Nhóm nào, Topic nào)
    // 2. Gửi ngày nào (Giờ & Ngày cụ thể)
    // 3. Ai là người gửi (Tên đối tác/sếp/KTS/bạn)
    // 4. Nội dung cụ thể thế nào (Tóm tắt + Trạng thái chốt/đề xuất + Tệp đính kèm + Trích dẫn)
    // 5. Nút bấm nhảy thẳng vào Topic

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
    responseMsg += `📝 *NỘI DUNG CỤ THỂ THẾ NÀO:*\n`;
    responseMsg += `👉 ${aiResult.summary}\n`;
    responseMsg += `${statusEmoji} *Trạng thái:* \`${statusText}\`\n`;

    if (aiResult.file_name) {
      responseMsg += `📎 *Tệp đính kèm:* \`${aiResult.file_name}\`\n`;
    }
    if (aiResult.evidence_quote) {
      responseMsg += `💬 *Trích dẫn gốc:* _"${aiResult.evidence_quote}"_\n`;
    }

    // Xây dựng Bàn phím nút Deep Link nhảy thẳng vào tin nhắn trong đúng Topic
    const keyboard = new InlineKeyboard();
    let hasLink = false;

    if (aiResult.deep_link && aiResult.deep_link.startsWith('http')) {
      const topicLabel = aiResult.topic_name ? ` [${aiResult.topic_name}]` : '';
      keyboard.url(`👉 🚀 Mở tin nhắn gốc trong Topic${topicLabel}`, aiResult.deep_link);
      hasLink = true;
    }

    // Nếu có các nguồn liên quan (ví dụ đề xuất ban đầu vs quyết định chốt)
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
      responseMsg += `\n🔗 *Tin nhắn gốc:* _(Mã tin nhắn #${aiResult.message_id || 'N/A'})_`;
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
      console.log(`\n===========================================`);
      console.log(`✅ BOT ĐÃ HOẠT ĐỘNG THÀNH CÔNG!`);
      console.log(`- Tên Bot: ${info.first_name}`);
      console.log(`- Username: @${info.username}`);
      console.log(`- Chế độ: POLLING (Sẵn sàng nhận truy vấn riêng hoặc nhóm)`);
      console.log(`===========================================\n`);
    }
  }).catch(async (err) => {
    console.warn('⚠️ Lỗi kết nối Telegram Polling:', err.message);
    await new Promise(r => setTimeout(r, 5000));
    startPolling();
  });
}

startBot();

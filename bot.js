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
      console.log(`💓 [Keep-Alive Ping] 200 OK (${ms}ms) lúc ${new Date().toLocaleTimeString('vi-VN')} - Bot hoạt động 24/7`);
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

  // Webhook tiếp nhận tin nhắn từ Telegram
  if (req.method === 'POST' && (pathname === '/webhook' || pathname === `/${token}` || pathname === '/')) {
    if (webhookHandler) {
      return webhookHandler(req, res);
    }
  }

  // Health check endpoint cho Render
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
      mediaCount: stats.withMedia
    }));
  }

  // Giao diện Web trạng thái thân thiện
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
    <p style="color: #94a3b8; margin: 0 0 15px 0;">Trợ lý Hỏi đáp & Truy xuất nguồn gốc tin nhắn 24/7</p>
    <div class="badge">● ONLINE 24/7 (${USE_WEBHOOK ? 'Webhook Mode' : 'Polling Mode'})</div>

    <div class="stats">
      <div><div class="stat-val">${stats.total}</div><div class="stat-lbl">Tin nhắn đã ghi nhớ</div></div>
      <div><div class="stat-val">${stats.chats}</div><div class="stat-lbl">Nhóm / Hội thoại</div></div>
      <div><div class="stat-val">${stats.withMedia}</div><div class="stat-lbl">Tệp / Ảnh đính kèm</div></div>
    </div>

    <div class="features">
      <div style="font-weight: 600; color: #38bdf8; margin-bottom: 10px;">✨ 4 Yếu tố xuất chuẩn:</div>
      <ul>
        <li><strong>1. Nội dung tóm tắt:</strong> Đã chốt chính thức hay mới chỉ là đề xuất.</li>
        <li><strong>2. Người gửi:</strong> Định danh rõ ràng sếp, đối tác hay KTS.</li>
        <li><strong>3. Thời gian gửi:</strong> Giờ/ngày chính xác đến từng phút.</li>
        <li><strong>4. Deep Link Topic:</strong> Nút nhảy thẳng về tin nhắn gốc trong đúng Topic để xem file/ảnh tức thì.</li>
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
  const guide = `🤖 *TRỢ LÝ HỎI ĐÁP & TRUY XUẤT NGUỒN GỐC (SMART Q&A + DEEP LINK)*

Xin chào *${ctx.from.first_name}*! Tôi là trợ lý chuyên ghi nhớ và truy xuất thông tin, tài liệu, quyết định trong các nhóm làm việc Telegram.

🎯 *CÁCH SỬ DỤNG TRUY XUẤT:*
1️⃣ *Trong Nhóm/Topic:* Nhắc tên tôi kèm câu hỏi:
👉 \`@${bot.botInfo.username} Có thông tin gì về loại cửa nhôm kính chưa?\`
2️⃣ *Dùng lệnh /ask:*
👉 \`/ask Hôm trước ai gửi file quy hoạch?\`
👉 \`/ask Đã chốt phương án mặt bằng chưa hay mới đề xuất?\`
3️⃣ *Trả lời tin nhắn:* Reply trực tiếp tin nhắn của tôi.
4️⃣ *Chat riêng:* Nhắn tin trực tiếp câu hỏi cho tôi tại đây.

✨ *CẤU TRÚC TRẢ LỜI CHUẨN 4 YẾU TỐ:*
1. 📌 *Nội dung tóm tắt* (Đã chốt hay mới chỉ là đề xuất).
2. 👤 *Người gửi* (Tên đối tác / Sếp / Bạn).
3. ⏰ *Thời gian gửi* (Ngày / giờ cụ thể).
4. 🔗 *Nút Deep Link* nhảy thẳng về tin nhắn gốc trong đúng Topic để mở xem file / ảnh đính kèm ngay lập tức.`;

  await ctx.reply(guide, { parse_mode: 'Markdown' });
});

bot.command('stats', async (ctx) => {
  const stats = db.getStats();
  await ctx.reply(`📊 *THỐNG KÊ HỆ THỐNG GHI NHỚ:*
- 💬 Tổng số tin nhắn đã lập chỉ mục: *${stats.total}*
- 👥 Số nhóm / hội thoại: *${stats.chats}*
- 📁 Số tin nhắn có tệp / hình ảnh: *${stats.withMedia}*
- ⏱️ Thời gian hoạt động: *${Math.floor(process.uptime() / 60)} phút*`, { parse_mode: 'Markdown' });
});

// ==========================================
// LỆNH HỎI ĐÁP /ask, /hoi, /tim
// ==========================================
bot.command(['ask', 'hoi', 'tim', 'truyxuat'], async (ctx) => {
  const question = ctx.match?.trim();
  if (!question) {
    return ctx.reply('💡 Bạn hãy nhập câu hỏi sau lệnh `/ask`. Ví dụ:\n`/ask Có thông tin gì về loại cửa nhôm kính chưa?`\n`/ask Ai đã gửi file quy hoạch?`', {
      parse_mode: 'Markdown'
    });
  }

  await handleUserQuestion(ctx, question);
});

// ==========================================
// BẮT SỰ KIỆN MENTION @bot_name HOẶC CHAT RIÊNG
// ==========================================
bot.on('message:text', async (ctx) => {
  const text = ctx.message.text.trim();
  const botUsername = bot.botInfo.username;

  // 1. Kiểm tra nếu có mention @bot_username
  const mentionPattern = new RegExp(`@${botUsername}\\b`, 'i');
  if (mentionPattern.test(text)) {
    const cleanedQuestion = text.replace(mentionPattern, '').trim();
    if (cleanedQuestion) {
      return handleUserQuestion(ctx, cleanedQuestion);
    } else {
      return ctx.reply(`Dạ tôi nghe đây! Bạn hãy đặt câu hỏi cần truy xuất nhé (ví dụ: \`@${botUsername} Có thông tin gì về cửa nhôm kính chưa?\`)`, { parse_mode: 'Markdown' });
    }
  }

  // 2. Kiểm tra nếu người dùng reply tin nhắn của bot
  if (ctx.message.reply_to_message?.from?.id === bot.botInfo.id) {
    if (!text.startsWith('/')) {
      return handleUserQuestion(ctx, text);
    }
  }

  // 3. Trong chat riêng (Private Chat)
  if (ctx.chat.type === 'private' && !text.startsWith('/')) {
    return handleUserQuestion(ctx, text);
  }
});

// ==========================================
// HÀM XỬ LÝ TRUY XUẤT THÔNG TIN VỚI GEMINI AI
// ==========================================
async function handleUserQuestion(ctx, question) {
  try {
    await ctx.replyWithChatAction('typing');

    // Lấy ngữ cảnh tin nhắn trong nhóm hiện tại (hoặc toàn bộ nếu chat riêng)
    const messages = db.getRecentMessages(ctx.chat.type === 'private' ? null : ctx.chat.id, 80);

    // Gửi câu hỏi đến Gemini AI
    const aiResult = await ai.answerQuestion(question, messages);

    // ĐỊNH DẠNG CÂU TRẢ LỜI CHUẨN 4 YẾU TỐ THEO YÊU CẦU NGƯỜI DÙNG:
    // 1. Nội dung tóm tắt (Đã chốt hay mới chỉ là đề xuất)
    // 2. Ai là người gửi (Tên đối tác/sếp/bạn)
    // 3. Gửi vào lúc nào (Ngày/giờ cụ thể)
    // 4. Nút/Link nhảy thẳng về tin nhắn gốc trong đúng Topic

    let statusEmoji = '📌';
    if (aiResult.status?.includes('chốt') || aiResult.status?.includes('Approved')) {
      statusEmoji = '✅';
    } else if (aiResult.status?.includes('đề xuất') || aiResult.status?.includes('Proposed')) {
      statusEmoji = '💡';
    }

    let responseMsg = `🎯 *KẾT QUẢ TRUY XUẤT NGUỒN GỐC*\n\n`;

    // 1. Nội dung tóm tắt
    responseMsg += `1️⃣ *Nội dung tóm tắt:*\n👉 ${aiResult.summary}\n${statusEmoji} *Trạng thái:* \`${aiResult.status || 'Chưa xác định'}\`\n\n`;

    // 2. Người gửi
    responseMsg += `2️⃣ *Người gửi:*\n👤 *${aiResult.sender_name || 'Không rõ danh tính'}*\n\n`;

    // 3. Gửi vào lúc nào
    responseMsg += `3️⃣ *Gửi vào lúc nào:*\n⏰ \`${aiResult.date_formatted || 'Không xác định'}\``;
    if (aiResult.topic_name) {
      responseMsg += ` _(Topic: ${aiResult.topic_name})_`;
    }
    responseMsg += `\n\n`;

    // 4. Nguồn tin gốc & Bằng chứng
    if (aiResult.file_name) {
      responseMsg += `📎 *Tệp đính kèm:* \`${aiResult.file_name}\`\n`;
    }
    if (aiResult.evidence_quote) {
      responseMsg += `💬 *Trích dẫn:* _"${aiResult.evidence_quote}"_\n`;
    }

    // Xây dựng Bàn phím nút Deep Link nhảy thẳng vào tin nhắn trong đúng Topic
    const keyboard = new InlineKeyboard();

    let hasLink = false;
    if (aiResult.deep_link && aiResult.deep_link.startsWith('http')) {
      keyboard.url('👉 Mở tin nhắn gốc (Deep Link)', aiResult.deep_link);
      hasLink = true;
    }

    // Nếu có các nguồn liên quan (ví dụ đề xuất ban đầu vs quyết định chốt)
    if (aiResult.additional_sources && Array.isArray(aiResult.additional_sources)) {
      for (const src of aiResult.additional_sources) {
        if (src.deep_link && src.deep_link.startsWith('http')) {
          keyboard.row().url(`🔗 ${src.role || 'Nguồn liên quan'} (${src.sender_name})`, src.deep_link);
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
      responseMsg += `\n4️⃣ *Tin nhắn gốc:* Nhấn nút bên dưới để nhảy thẳng vào tin nhắn trong Topic 👇`;
    } else {
      responseMsg += `\n4️⃣ *Tin nhắn gốc:* _(Tin nhắn nội bộ #${aiResult.message_id || 'N/A'})_`;
    }

    await ctx.reply(responseMsg, replyOptions);

  } catch (err) {
    console.error('Lỗi khi trả lời câu hỏi:', err);
    await ctx.reply(`⚠️ Đã xảy ra lỗi trong quá trình phân tích dữ liệu: ${err.message}`, {
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
      console.log(`- Chế độ: POLLING`);
      console.log(`===========================================\n`);
    }
  }).catch(async (err) => {
    console.warn('⚠️ Lỗi kết nối Telegram Polling:', err.message);
    await new Promise(r => setTimeout(r, 5000));
    startPolling();
  });
}

startBot();

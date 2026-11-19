const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'messages.json');
const TOPICS_FILE = path.join(__dirname, 'topics.json');

class MessageDatabase {
  constructor() {
    this.messages = [];
    this.topics = {};
    this.saveTimer = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(TOPICS_FILE)) {
        this.topics = JSON.parse(fs.readFileSync(TOPICS_FILE, 'utf8'));
      }
    } catch (e) {
      this.topics = {};
    }

    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        // LỌC BỎ HOÀN TOÀN TẤT CẢ DỮ LIỆU SEED MẪU GIẢ (is_seed: true hoặc id bắt đầu bằng seed_)
        this.messages = parsed.filter(m => !m.is_seed && !String(m.id).startsWith('seed_'));
        console.log(`📂 [Database] Đã tải ${this.messages.length} tin nhắn thực tế từ messages.json`);
      } else {
        this.messages = [];
        this.saveImmediate();
      }
    } catch (err) {
      console.warn('⚠️ Lỗi đọc messages.json:', err.message);
      this.messages = [];
    }
  }

  saveTopicName(chatId, threadId, name) {
    if (!chatId || !threadId || !name) return;
    const key = `${chatId}_${threadId}`;
    this.topics[key] = name.trim();

    // Cập nhật lại tên topic cho các tin nhắn đã lưu trước đó trong thread này
    for (const m of this.messages) {
      if (String(m.chat_id) === String(chatId) && String(m.message_thread_id) === String(threadId)) {
        m.topic_name = name.trim();
      }
    }
    this.saveDebounced();
  }

  getTopicName(chatId, threadId) {
    if (!threadId) return null;
    const key = `${chatId}_${threadId}`;
    return this.topics[key] || null;
  }

  formatDateVN(dateInput) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 'Vừa xong';
    
    const vnTime = new Date(d.getTime() + (7 * 3600 * 1000) + (d.getTimezoneOffset() * 60 * 1000));
    const pad = n => String(n).padStart(2, '0');
    const hh = pad(vnTime.getHours());
    const mm = pad(vnTime.getMinutes());
    const dd = pad(vnTime.getDate());
    const MM = pad(vnTime.getMonth() + 1);
    const yyyy = vnTime.getFullYear();

    return `${hh}:${mm} ngày ${dd}/${MM}/${yyyy}`;
  }

  /**
   * Tạo Deep Link chuẩn 100% của Telegram để nhảy vào đúng tin nhắn trong Topic
   */
  buildDeepLink(chat, messageId, threadId) {
    if (!chat || !messageId) return '';

    // Trường hợp 1: Nhóm công khai có username (@nhom_du_an)
    if (chat.username) {
      if (threadId && Number(threadId) !== Number(messageId)) {
        return `https://t.me/${chat.username}/${threadId}/${messageId}`;
      }
      return `https://t.me/${chat.username}/${messageId}`;
    }

    // Trường hợp 2: Supergroup riêng tư có ID bắt đầu bằng -100
    const chatIdStr = String(chat.id || '');
    if (chatIdStr.startsWith('-100')) {
      const cleanId = chatIdStr.replace('-100', '');
      // Format chuẩn Telegram Desktop & Mobile cho tin nhắn trong Topic
      if (threadId && Number(threadId) !== Number(messageId)) {
        return `https://t.me/c/${cleanId}/${threadId}/${messageId}`;
      }
      return `https://t.me/c/${cleanId}/${messageId}`;
    }

    return '';
  }

  addMessage(ctxMsg) {
    if (!ctxMsg) return null;

    const chat = ctxMsg.chat;
    const from = ctxMsg.from || {};
    const messageId = ctxMsg.message_id;
    const threadId = ctxMsg.message_thread_id || null;

    // Bỏ qua tin nhắn trong chat riêng nếu là câu hỏi tra cứu
    if (chat.type === 'private' && (ctxMsg.text?.startsWith('/') || ctxMsg.text?.length > 100)) {
      // Tin nhắn tra cứu không cần lưu vào kho dữ liệu dự án
    }

    // Nhận diện tên Topic
    let topicName = this.getTopicName(chat.id, threadId);

    // 1. Từ sự kiện tạo Topic mới
    if (ctxMsg.forum_topic_created?.name) {
      topicName = ctxMsg.forum_topic_created.name;
      this.saveTopicName(chat.id, messageId, topicName);
    } 
    // 2. Từ sự kiện đổi tên Topic
    else if (ctxMsg.forum_topic_edited?.name) {
      topicName = ctxMsg.forum_topic_edited.name;
      this.saveTopicName(chat.id, threadId || messageId, topicName);
    }
    // 3. Từ reply_to_message có chứa forum_topic_created
    else if (ctxMsg.reply_to_message?.forum_topic_created?.name) {
      topicName = ctxMsg.reply_to_message.forum_topic_created.name;
      this.saveTopicName(chat.id, threadId, topicName);
    }

    // Xác định tên người gửi
    let senderName = [from.first_name, from.last_name].filter(Boolean).join(' ').trim();
    if (!senderName) senderName = from.username ? `@${from.username}` : (chat.title || 'Người dùng Telegram');

    let text = ctxMsg.text || ctxMsg.caption || '';

    let hasMedia = false;
    let mediaType = null;
    let fileName = null;

    if (ctxMsg.document) {
      hasMedia = true;
      mediaType = 'document';
      fileName = ctxMsg.document.file_name || 'Tệp tài liệu';
      if (!text) text = `[Tệp đính kèm: ${fileName}]`;
    } else if (ctxMsg.photo && ctxMsg.photo.length > 0) {
      hasMedia = true;
      mediaType = 'photo';
      if (!text) text = '[Hình ảnh đính kèm]';
    } else if (ctxMsg.video) {
      hasMedia = true;
      mediaType = 'video';
      fileName = ctxMsg.video.file_name || 'Video';
      if (!text) text = `[Video: ${fileName}]`;
    } else if (ctxMsg.voice) {
      hasMedia = true;
      mediaType = 'voice';
      if (!text) text = '[Tin nhắn thoại]';
    }

    // Bỏ qua tin nhắn không có nội dung và không có media (ví dụ service messages khác)
    if (!text && !hasMedia) return null;

    // Tạo link nhảy chính xác vào Topic
    const deepLink = this.buildDeepLink(chat, messageId, threadId);
    const dateFormatted = this.formatDateVN((ctxMsg.date || Math.floor(Date.now() / 1000)) * 1000);

    const record = {
      id: `${chat.id}_${messageId}`,
      chat_id: chat.id,
      chat_title: chat.title || 'Tin nhắn riêng',
      chat_username: chat.username || null,
      chat_type: chat.type,
      message_id: messageId,
      message_thread_id: threadId,
      topic_name: topicName || (threadId ? `Topic #${threadId}` : 'Kênh chung'),
      sender_id: from.id,
      sender_name: senderName,
      sender_username: from.username ? `@${from.username}` : null,
      date: new Date((ctxMsg.date || Math.floor(Date.now() / 1000)) * 1000).toISOString(),
      date_formatted: dateFormatted,
      text: text,
      has_media: hasMedia,
      media_type: mediaType,
      file_name: fileName,
      deep_link: deepLink,
      created_at: Date.now()
    };

    const existingIndex = this.messages.findIndex(m => m.id === record.id);
    if (existingIndex >= 0) {
      this.messages[existingIndex] = record;
    } else {
      this.messages.push(record);
    }

    if (this.messages.length > 3000) {
      this.messages = this.messages.slice(this.messages.length - 3000);
    }

    this.saveDebounced();
    return record;
  }

  getRecentMessages(chatId = null, limit = 150) {
    let pool = this.messages.filter(m => !m.is_seed);
    if (chatId) {
      pool = pool.filter(m => String(m.chat_id) === String(chatId));
    }
    return pool.slice(-limit);
  }

  saveDebounced() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveImmediate();
    }, 1500);
  }

  saveImmediate() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.messages, null, 2), 'utf8');
      fs.writeFileSync(TOPICS_FILE, JSON.stringify(this.topics, null, 2), 'utf8');
    } catch (err) {
      console.warn('⚠️ Lỗi lưu database:', err.message);
    }
  }

  getStats() {
    const total = this.messages.length;
    const chats = new Set(this.messages.map(m => m.chat_id)).size;
    const withMedia = this.messages.filter(m => m.has_media).length;
    const topicsCount = Object.keys(this.topics).length;
    return { total, chats, withMedia, topicsCount };
  }
}

module.exports = new MessageDatabase();

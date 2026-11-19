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
        // CHỈ GIỮ LẠI TIN NHẮN TỪ NHÓM/SUPERGROUP/CHANNEL
        // LOẠI BỎ 100% TIN NHẮN TỪ CHAT RIÊNG (private) VÀ SEED DATA CŨ
        this.messages = parsed.filter(m => 
          !m.is_seed && 
          !String(m.id).startsWith('seed_') &&
          m.chat_type !== 'private'
        );
        console.log(`📂 [Database] Đã tải ${this.messages.length} tin nhắn nhóm thực tế từ messages.json`);
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

    // Cập nhật tên topic cho các tin nhắn trong topic này
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
   * Tạo Deep Link chuẩn 100% của Telegram để mở đúng tin nhắn trong Topic của Nhóm
   */
  buildDeepLink(chat, messageId, threadId) {
    if (!chat || !messageId) return '';

    // Nhóm công khai có username (@ten_nhom)
    if (chat.username) {
      if (threadId && Number(threadId) !== Number(messageId)) {
        return `https://t.me/${chat.username}/${threadId}/${messageId}`;
      }
      return `https://t.me/${chat.username}/${messageId}`;
    }

    // Nhóm riêng tư / Supergroup có ID dạng -100xxxxxxxxxx
    const chatIdStr = String(chat.id || '');
    if (chatIdStr.startsWith('-100')) {
      const cleanId = chatIdStr.replace('-100', '');
      // Link chuẩn mở đúng Topic và cuộn đến đúng tin nhắn trên Telegram Desktop & Mobile
      if (threadId && Number(threadId) !== Number(messageId)) {
        return `https://t.me/c/${cleanId}/${threadId}/${messageId}`;
      }
      return `https://t.me/c/${cleanId}/${messageId}`;
    }

    return '';
  }

  addMessage(ctxMsg) {
    if (!ctxMsg || !ctxMsg.chat) return null;

    const chat = ctxMsg.chat;

    // TUYỆT ĐỐI KHÔNG LƯU TIN NHẮN TỪ CHAT RIÊNG (DM) VÀO CƠ SỞ DỮ LIỆU
    if (chat.type === 'private') {
      return null;
    }

    const from = ctxMsg.from || {};
    const messageId = ctxMsg.message_id;
    const threadId = ctxMsg.message_thread_id || null;

    // Lấy tên topic
    let topicName = this.getTopicName(chat.id, threadId);

    if (ctxMsg.forum_topic_created?.name) {
      topicName = ctxMsg.forum_topic_created.name;
      this.saveTopicName(chat.id, messageId, topicName);
    } else if (ctxMsg.forum_topic_edited?.name) {
      topicName = ctxMsg.forum_topic_edited.name;
      this.saveTopicName(chat.id, threadId || messageId, topicName);
    } else if (ctxMsg.reply_to_message?.forum_topic_created?.name) {
      topicName = ctxMsg.reply_to_message.forum_topic_created.name;
      this.saveTopicName(chat.id, threadId, topicName);
    }

    let senderName = [from.first_name, from.last_name].filter(Boolean).join(' ').trim();
    if (!senderName) senderName = from.username ? `@${from.username}` : (chat.title || 'Thành viên');

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

    if (!text && !hasMedia) return null;

    const deepLink = this.buildDeepLink(chat, messageId, threadId);
    const dateFormatted = this.formatDateVN((ctxMsg.date || Math.floor(Date.now() / 1000)) * 1000);

    const record = {
      id: `${chat.id}_${messageId}`,
      chat_id: chat.id,
      chat_title: chat.title || 'Nhóm làm việc',
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

    if (this.messages.length > 5000) {
      this.messages = this.messages.slice(this.messages.length - 5000);
    }

    this.saveDebounced();
    return record;
  }

  /**
   * Tìm kiếm chính xác 100% tất cả các tin nhắn chứa ĐỦ các hashtag yêu cầu
   */
  searchByHashtags(hashtags = [], chatId = null) {
    if (!hashtags || hashtags.length === 0) return [];

    const cleanTags = hashtags.map(t => {
      let clean = t.trim().toLowerCase();
      if (!clean.startsWith('#')) clean = `#${clean}`;
      return clean;
    });

    let pool = this.messages;
    if (chatId) {
      pool = pool.filter(m => String(m.chat_id) === String(chatId));
    }

    const matched = pool.filter(m => {
      const fullText = (m.text + ' ' + (m.file_name || '')).toLowerCase();
      // Bắt buộc tin nhắn phải chứa TẤT CẢ các hashtag yêu cầu
      return cleanTags.every(tag => {
        const rawWord = tag.replace(/^#/, '');
        // Kiểm tra khớp #hashtag hoặc từ khóa
        return fullText.includes(tag) || fullText.includes(`#${rawWord}`);
      });
    });

    // Sắp xếp tin nhắn mới nhất lên trước
    return matched.sort((a, b) => (b.message_id || 0) - (a.message_id || 0));
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

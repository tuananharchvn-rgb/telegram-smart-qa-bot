const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'messages.json');

class MessageDatabase {
  constructor() {
    this.messages = [];
    this.saveTimer = null;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        this.messages = JSON.parse(raw);
        console.log(`📂 [Database] Đã tải ${this.messages.length} tin nhắn từ messages.json`);
      } else {
        console.log('📂 [Database] messages.json chưa tồn tại, khởi tạo dữ liệu mẫu thực tế...');
        this.initSeedData();
      }
    } catch (err) {
      console.warn('⚠️ Lỗi đọc messages.json:', err.message);
      this.initSeedData();
    }
  }

  initSeedData() {
    // Dữ liệu mẫu thực tế về dự án xây dựng & nội thất phục vụ test ngay lập tức
    this.messages = [
      {
        id: 'seed_1',
        chat_id: -1002345678901,
        chat_title: 'Dự Án Biệt Thự Vườn Thảo Điền',
        chat_username: null,
        message_id: 101,
        message_thread_id: 12,
        topic_name: 'Vật liệu & Hoàn thiện',
        sender_id: 111222,
        sender_name: 'KTS. Hoàng Nam (Chủ trì thiết kế)',
        sender_username: 'hoangnam_arch',
        date: new Date('2026-11-15T09:30:00+07:00').toISOString(),
        date_formatted: '09:30 ngày 15/11/2026',
        text: 'Em gửi đề xuất báo giá và mẫu loại cửa nhôm kính Xingfa hệ 55 kính dán an toàn 8.38mm cho khu vực phòng khách và các phòng ngủ mặt tiền.',
        has_media: true,
        media_type: 'document',
        file_name: 'De_xuat_Cua_Nhom_Kinh_Xingfa_v1.pdf',
        deep_link: 'https://t.me/c/2345678901/12/101',
        is_seed: true
      },
      {
        id: 'seed_2',
        chat_id: -1002345678901,
        chat_title: 'Dự Án Biệt Thự Vườn Thảo Điền',
        chat_username: null,
        message_id: 105,
        message_thread_id: 12,
        topic_name: 'Vật liệu & Hoàn thiện',
        sender_id: 333444,
        sender_name: 'Anh Tuấn (Chủ đầu tư)',
        sender_username: 'tuan_investor',
        date: new Date('2026-11-16T14:15:00+07:00').toISOString(),
        date_formatted: '14:15 ngày 16/11/2026',
        text: 'Cửa nhôm kính Xingfa hệ 55 anh thấy ổn, nhưng khu vực mặt tiền tầng 2 hướng tây nắng gắt nên anh muốn đổi sang nhôm Xingfa Class A kính hộp Low-E cách nhiệt.',
        has_media: false,
        media_type: null,
        file_name: null,
        deep_link: 'https://t.me/c/2345678901/12/105',
        is_seed: true
      },
      {
        id: 'seed_3',
        chat_id: -1002345678901,
        chat_title: 'Dự Án Biệt Thự Vườn Thảo Điền',
        chat_username: null,
        message_id: 112,
        message_thread_id: 12,
        topic_name: 'Vật liệu & Hoàn thiện',
        sender_id: 555666,
        sender_name: 'Nguyễn Văn Minh (Tổng thầu thi công)',
        sender_username: 'minh_construction',
        date: new Date('2026-11-17T16:45:00+07:00').toISOString(),
        date_formatted: '16:45 ngày 17/11/2026',
        text: 'ĐÃ CHỐT: Tất cả các bên thống nhất phương án: Toàn bộ mặt ngoài dùng nhôm Xingfa Class A kính hộp cách nhiệt Low-E 5-9-5mm theo ý kiến anh Tuấn. Đội thầu bắt đầu đặt phôi hôm nay.',
        has_media: true,
        media_type: 'photo',
        file_name: 'Mau_Nhom_Xingfa_ClassA_Chot.jpg',
        deep_link: 'https://t.me/c/2345678901/12/112',
        is_seed: true
      },
      {
        id: 'seed_4',
        chat_id: -1002345678901,
        chat_title: 'Dự Án Biệt Thự Vườn Thảo Điền',
        chat_username: null,
        message_id: 120,
        message_thread_id: 5,
        topic_name: 'Quy hoạch & Hồ sơ pháp lý',
        sender_id: 777888,
        sender_name: 'Thảo Vy (Quản lý dự án)',
        sender_username: 'thaovy_pm',
        date: new Date('2026-11-18T10:00:00+07:00').toISOString(),
        date_formatted: '10:00 ngày 18/11/2026',
        text: 'Em gửi cả nhà file bản vẽ quy hoạch 1/500 đã được phê duyệt chính thức kèm tọa độ ranh mốc cắm chỉ giới đường đỏ.',
        has_media: true,
        media_type: 'document',
        file_name: 'Ban_ve_Quy_hoach_1-500_Phe_duyet_v2.pdf',
        deep_link: 'https://t.me/c/2345678901/5/120',
        is_seed: true
      }
    ];
    this.saveImmediate();
  }

  formatDateVN(dateInput) {
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 'Vừa xong';
    
    // Giờ VN GMT+7
    const vnTime = new Date(d.getTime() + (7 * 3600 * 1000) + (d.getTimezoneOffset() * 60 * 1000));
    const pad = n => String(n).padStart(2, '0');
    const hh = pad(vnTime.getHours());
    const mm = pad(vnTime.getMinutes());
    const dd = pad(vnTime.getDate());
    const MM = pad(vnTime.getMonth() + 1);
    const yyyy = vnTime.getFullYear();

    return `${hh}:${mm} ngày ${dd}/${MM}/${yyyy}`;
  }

  buildDeepLink(chat, messageId, threadId) {
    if (!chat || !messageId) return '';

    // Trường hợp nhóm công khai có username (@ten_nhom)
    if (chat.username) {
      if (threadId && threadId !== messageId) {
        return `https://t.me/${chat.username}/${threadId}/${messageId}`;
      }
      return `https://t.me/${chat.username}/${messageId}`;
    }

    // Trường hợp Supergroup riêng tư (chat.id dạng -100xxxxxxxxxx)
    const chatIdStr = String(chat.id || '');
    if (chatIdStr.startsWith('-100')) {
      const cleanId = chatIdStr.replace('-100', '');
      if (threadId && threadId !== messageId) {
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

    // Xác định tên người gửi
    let senderName = [from.first_name, from.last_name].filter(Boolean).join(' ').trim();
    if (!senderName) senderName = from.username ? `@${from.username}` : 'Thành viên ẩn danh';

    // Nội dung văn bản
    let text = ctxMsg.text || ctxMsg.caption || '';

    // Phân loại đính kèm
    let hasMedia = false;
    let mediaType = null;
    let fileName = null;

    if (ctxMsg.document) {
      hasMedia = true;
      mediaType = 'document';
      fileName = ctxMsg.document.file_name || 'Tệp tài liệu';
      if (!text) text = `[File đính kèm: ${fileName}]`;
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

    // Xây dựng link nhảy thẳng vào tin nhắn gốc trong đúng Topic
    const deepLink = this.buildDeepLink(chat, messageId, threadId);

    const dateFormatted = this.formatDateVN((ctxMsg.date || Math.floor(Date.now() / 1000)) * 1000);

    const record = {
      id: `${chat.id}_${messageId}`,
      chat_id: chat.id,
      chat_title: chat.title || 'Tin nhắn riêng / DM',
      chat_username: chat.username || null,
      chat_type: chat.type,
      message_id: messageId,
      message_thread_id: threadId,
      topic_name: ctxMsg.reply_to_message?.forum_topic_created?.name || null,
      sender_id: from.id,
      sender_name: senderName,
      sender_username: from.username ? `@${from.username}` : null,
      date: new Date(ctxMsg.date * 1000).toISOString(),
      date_formatted: dateFormatted,
      text: text,
      has_media: hasMedia,
      media_type: mediaType,
      file_name: fileName,
      deep_link: deepLink,
      created_at: Date.now()
    };

    // Kiểm tra trùng lặp
    const existingIndex = this.messages.findIndex(m => m.id === record.id);
    if (existingIndex >= 0) {
      this.messages[existingIndex] = record;
    } else {
      this.messages.push(record);
    }

    // Giới hạn bộ nhớ lưu trữ 3000 tin nhắn gần nhất
    if (this.messages.length > 3000) {
      this.messages = this.messages.slice(this.messages.length - 3000);
    }

    this.saveDebounced();
    return record;
  }

  getRecentMessages(chatId = null, limit = 100) {
    let pool = this.messages;
    if (chatId) {
      pool = pool.filter(m => m.chat_id === chatId || m.is_seed);
    }
    // Lấy tin nhắn mới nhất
    return pool.slice(-limit);
  }

  saveDebounced() {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveImmediate();
    }, 2000);
  }

  saveImmediate() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.messages, null, 2), 'utf8');
    } catch (err) {
      console.warn('⚠️ Lỗi lưu messages.json:', err.message);
    }
  }

  getStats() {
    const total = this.messages.length;
    const chats = new Set(this.messages.map(m => m.chat_id)).size;
    const withMedia = this.messages.filter(m => m.has_media).length;
    return { total, chats, withMedia };
  }
}

module.exports = new MessageDatabase();

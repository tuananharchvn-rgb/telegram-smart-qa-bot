require('dotenv').config();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const CANDIDATE_MODELS = [
  'gemini-3-flash-preview',
  'gemini-3.8-flash',
  'gemini-flash-latest'
];

class GeminiAIService {
  constructor() {
    this.apiKey = GEMINI_API_KEY;
  }

  async callGemini(prompt, systemInstruction = null) {
    if (!this.apiKey) {
      throw new Error('Chưa cấu hình GEMINI_API_KEY');
    }

    let lastError = null;

    for (const model of CANDIDATE_MODELS) {
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${this.apiKey}`;
        const body = {
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.15,
            responseMimeType: 'application/json'
          }
        };

        if (systemInstruction) {
          body.systemInstruction = {
            parts: [{ text: systemInstruction }]
          };
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 25000);

        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
          const errText = await res.text();
          console.warn(`[Gemini ${model}] Lỗi ${res.status}:`, errText.slice(0, 150));
          lastError = new Error(`Gemini ${model} ${res.status}`);
          continue;
        }

        const data = await res.json();
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return text;
        }
      } catch (err) {
        console.warn(`[Gemini ${model}] Exception:`, err.message);
        lastError = err;
      }
    }

    throw lastError || new Error('Không thể kết nối đến Gemini API sau nhiều lần thử');
  }

  /**
   * Truy xuất và phân tích câu trả lời từ lịch sử tin nhắn thực tế
   */
  async answerQuestion(question, messages = []) {
    if (!messages || messages.length === 0) {
      return {
        found: false,
        summary: 'Chưa ghi nhận tin nhắn hoặc tài liệu nào từ nhóm/topic thực tế của bạn.',
        status: 'Chưa có dữ liệu',
        chat_title: null,
        topic_name: null,
        sender_name: null,
        date_formatted: null,
        deep_link: null,
        instruction: 'Hãy thêm bot vào nhóm dự án, cấp quyền Admin và gửi tin nhắn trao đổi vào Topic để bot ghi nhớ.'
      };
    }

    // Định dạng lịch sử tin nhắn thực tế
    const formattedHistory = messages.map((m) => {
      return `[Tin ID: ${m.message_id}] [Nhóm: ${m.chat_title}] [Topic: ${m.topic_name || (m.message_thread_id ? 'Topic #' + m.message_thread_id : 'Chung')}] [Thời gian: ${m.date_formatted}] [Người gửi: ${m.sender_name}] [Tệp: ${m.file_name || (m.has_media ? m.media_type : 'Không')}]
Nội dung: ${m.text}
Link gốc: ${m.deep_link || ''}
---`;
    }).join('\n');

    const systemInstruction = `Bạn là Trợ lý AI Hỏi đáp & Truy xuất nguồn gốc thông tin (Smart Q&A + Deep Link Traceability) chuyên nghiệp trong Telegram.
Người dùng đang hỏi bạn để truy xuất xem một thông tin/quyết định/tài liệu được gửi ở đâu, topic nào, ngày nào, ai gửi và nội dung cụ thể ra sao.

QUY TẮC CỐT LÕI (TUYỆT ĐỐI TUÂN THỦ):
1. TRẢ LỜI ĐÚNG SỰ THỰC DỰA TRÊN TIN NHẮN THỰC TẾ:
   - Nếu tìm thấy tin nhắn liên quan, trích xuất chính xác ID tin nhắn, nhóm, topic, thời gian và link gốc.
   - NẾU KHÔNG CÓ THÔNG TIN TRONG LỊCH SỬ TIN NHẮN ĐƯỢC CUNG CẤP, TUYỆT ĐỐI KHÔNG ĐƯỢC TỰ BỊA ĐẶT RA DỰ ÁN HOẶC TÊN TOPIC KHÁC! Đặt "found": false.

2. NỘI DUNG CỤ THỂ THẾ NÀO (KHÔNG ĐƯỢC BÊ NGUYÊN VĂN TOÀN BỘ TIN NHẮN SANG):
   - Bạn phải phân tích, tổng hợp và tóm tắt thông minh bằng lời văn rõ ràng: Các bên đã trao đổi gì? Đã quyết định gì? Có yêu cầu gì cụ thể?
   - Phân biệt rõ tình trạng:
     • "Đã chốt" (Approved): nếu đã thống nhất phương án, duyệt, ký kết.
     • "Mới chỉ là đề xuất" (Proposed): nếu mới gửi mẫu, báo giá, xin ý kiến, đang bàn thảo.
   - Trích dẫn chứng minh: Chỉ trích dẫn 1 câu ngắn quan trọng nhất, không copy cả đoạn dài.

3. XÁC ĐỊNH VỊ TRÍ VÀ THỜI GIAN:
   - Gửi ở đâu: Tên Nhóm và Tên Topic cụ thể.
   - Gửi ngày nào: Giờ và ngày cụ thể (định dạng HH:mm ngày DD/MM/YYYY).
   - Ai là người gửi: Tên người gửi.

BẮT BUỘC TRẢ VỀ ĐỊNH DẠNG JSON HỢP LỆ VỚI CẤU TRÚC SAU:
{
  "found": true hoặc false,
  "summary": "Tóm lược súc tích, phân tích rõ ràng nội dung cụ thể của thông tin",
  "status": "Đã chốt" hoặc "Mới chỉ là đề xuất" hoặc "Đang trao đổi",
  "chat_title": "Tên nhóm thực tế",
  "topic_name": "Tên topic thực tế",
  "sender_name": "Tên người gửi",
  "date_formatted": "Thời gian gửi cụ thể",
  "message_id": 123,
  "deep_link": "https://t.me/...",
  "file_name": "Tên tệp bản vẽ/ảnh nếu có",
  "evidence_quote": "Một câu trích dẫn ngắn chứng minh mấu chốt",
  "additional_sources": [
    {
      "message_id": 101,
      "role": "Đề xuất ban đầu",
      "sender_name": "...",
      "date_formatted": "...",
      "topic_name": "...",
      "deep_link": "..."
    }
  ]
}`;

    const userPrompt = `Dưới đây là danh sách các tin nhắn THỰC TẾ đã ghi nhận:
${formattedHistory}

CÂU HỎI TRUY VẤN:
"${question}"

Hãy phân tích kỹ và trả về kết quả JSON.`;

    try {
      const responseText = await this.callGemini(userPrompt, systemInstruction);
      
      let result = null;
      try {
        result = JSON.parse(responseText);
      } catch (jsonErr) {
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
          result = JSON.parse(match[0]);
        } else {
          throw jsonErr;
        }
      }

      // Đối chiếu với tin nhắn thực tế trong database để đảm bảo link và topic chính xác 100%
      if (result && result.message_id) {
        const foundMsg = messages.find(m => Number(m.message_id) === Number(result.message_id));
        if (foundMsg) {
          result.chat_title = foundMsg.chat_title || result.chat_title;
          result.topic_name = foundMsg.topic_name || result.topic_name;
          result.sender_name = foundMsg.sender_name || result.sender_name;
          result.date_formatted = foundMsg.date_formatted || result.date_formatted;
          result.deep_link = foundMsg.deep_link || result.deep_link;
          if (foundMsg.file_name && !result.file_name) {
            result.file_name = foundMsg.file_name;
          }
        }
      }

      return result;
    } catch (err) {
      console.error('Lỗi Gemini:', err);
      return {
        found: false,
        summary: 'Đã xảy ra sự cố khi phân tích câu hỏi với AI.',
        status: 'Lỗi'
      };
    }
  }
}

module.exports = new GeminiAIService();

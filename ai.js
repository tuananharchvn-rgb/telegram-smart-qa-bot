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
            temperature: 0.2,
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
   * Truy xuất và phân tích câu trả lời từ lịch sử tin nhắn
   */
  async answerQuestion(question, messages = []) {
    if (!messages || messages.length === 0) {
      return {
        found: false,
        summary: 'Chưa có dữ liệu tin nhắn nào trong các nhóm được ghi nhận.',
        status: 'Chưa có thông tin',
        chat_title: 'Không xác định',
        topic_name: 'Không xác định',
        sender_name: 'Hệ thống',
        date_formatted: 'Chưa xác định',
        deep_link: null
      };
    }

    // Định dạng lịch sử tin nhắn thành văn bản ngữ cảnh rõ ràng từng nhóm và topic
    const formattedHistory = messages.map((m) => {
      return `[Tin #${m.message_id}] [Nhóm: ${m.chat_title}] [Topic: ${m.topic_name || 'Kênh chung'}] [Thời gian: ${m.date_formatted}] [Người gửi: ${m.sender_name}] [Tệp: ${m.file_name || (m.has_media ? 'Ảnh/Video' : 'Không')}]
Nội dung: ${m.text}
Link: ${m.deep_link || ''}
---`;
    }).join('\n');

    const systemInstruction = `Bạn là Trợ lý AI Hỏi đáp & Truy xuất nguồn gốc thông tin (Smart Q&A + Deep Link Traceability) chuyên nghiệp trong Telegram.
Người dùng có thể hỏi bạn trong nhóm hoặc VÀO TRỰC TIẾP BOT CHAT 1-1 để truy vấn thông tin đã trao đổi ở các nhóm/topic.

KHI TRẢ LỜI, BẠN BẮT BUỘC PHẢI CHỈ RA RÕ CÁC YẾU TỐ:
1. GỬI Ở ĐÂU: Tên nhóm/dự án cụ thể và Tên Topic cụ thể (ví dụ: Nhóm "Dự Án Biệt Thự Thảo Điền", Topic "Vật liệu & Hoàn thiện").
2. GỬI NGÀY NÀO: Ngày giờ cụ thể của tin nhắn (ví dụ: "16:45 ngày 17/11/2026").
3. AI LÀ NGƯỜI GỬI: Tên đối tác/sếp/KTS/bạn đã gửi thông tin.
4. NỘI DUNG CỤ THỂ THẾ NÀO:
   - Tóm tắt chi tiết, rõ ràng nội dung thông tin được gửi.
   - BẮT BUỘC chỉ rõ trạng thái là "Đã chốt" (Approved / Thống nhất) hay "Mới chỉ là đề xuất" (Proposed / Đang bàn thảo).
   - Tên tệp hoặc ảnh đính kèm (nếu có).
   - Trích dẫn câu nói quan trọng chứng minh.
5. LINK/NÚT NHẢY VÀO TOPIC: Link trực tiếp mở đúng tin nhắn đó trong Topic.

BẮT BUỘC TRẢ VỀ ĐỊNH DẠNG JSON HỢP LỆ THEO SCHEMA SAU:
{
  "found": true hoặc false,
  "summary": "Tóm tắt chi tiết và trả lời trực tiếp nội dung cụ thể",
  "status": "Đã chốt" hoặc "Mới chỉ là đề xuất" hoặc "Đang trao đổi" hoặc "Chưa có thông tin",
  "chat_title": "Tên nhóm gửi tin",
  "topic_name": "Tên topic gửi tin",
  "sender_name": "Tên người gửi tin nhắn nguồn",
  "date_formatted": "Ngày giờ cụ thể (VD: 16:45 ngày 17/11/2026)",
  "message_id": 123,
  "deep_link": "https://t.me/...",
  "file_name": "Tên file đính kèm nếu có",
  "evidence_quote": "Câu trích dẫn ngắn từ tin nhắn gốc chứng minh",
  "additional_sources": [
    {
      "message_id": 101,
      "chat_title": "Tên nhóm",
      "topic_name": "Tên topic",
      "sender_name": "Tên người gửi",
      "date_formatted": "Thời gian",
      "role": "Đề xuất ban đầu",
      "deep_link": "https://t.me/..."
    }
  ]
}

Nếu không tìm thấy thông tin nào liên quan, đặt "found": false, "summary": "Không tìm thấy thông tin liên quan trong các tin nhắn gần đây.", "status": "Chưa có thông tin".`;

    const userPrompt = `Dưới đây là danh sách các tin nhắn đã ghi nhận:
${formattedHistory}

CÂU HỎI TRUY VẤN CỦA NGƯỜI DÙNG:
"${question}"

Hãy phân tích và trả về đúng định dạng JSON yêu cầu.`;

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

      // Đối chiếu và hoàn thiện metadata từ database
      if (result && result.message_id) {
        const foundMsg = messages.find(m => m.message_id === Number(result.message_id));
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

      // Bổ sung link cho các nguồn liên quan
      if (result && Array.isArray(result.additional_sources)) {
        for (const src of result.additional_sources) {
          if (src.message_id) {
            const addMsg = messages.find(m => m.message_id === Number(src.message_id));
            if (addMsg) {
              src.chat_title = addMsg.chat_title || src.chat_title;
              src.topic_name = addMsg.topic_name || src.topic_name;
              src.date_formatted = addMsg.date_formatted || src.date_formatted;
              src.deep_link = addMsg.deep_link || src.deep_link;
              src.sender_name = addMsg.sender_name || src.sender_name;
            }
          }
        }
      }

      return result;
    } catch (err) {
      console.error('Lỗi phân tích AI Gemini:', err);
      return this.fallbackKeywordSearch(question, messages);
    }
  }

  fallbackKeywordSearch(question, messages) {
    const qLower = question.toLowerCase();
    const keywords = qLower.split(/\s+/).filter(w => w.length > 2);

    let bestMatch = null;
    let maxScore = 0;

    for (const m of messages) {
      const textLower = (m.text + ' ' + (m.file_name || '') + ' ' + (m.topic_name || '')).toLowerCase();
      let score = 0;
      for (const kw of keywords) {
        if (textLower.includes(kw)) score += 1;
      }
      if (score > maxScore) {
        maxScore = score;
        bestMatch = m;
      }
    }

    if (bestMatch && maxScore > 0) {
      const isChot = bestMatch.text.toLowerCase().includes('chốt') || bestMatch.text.toLowerCase().includes('thống nhất');
      return {
        found: true,
        summary: bestMatch.text,
        status: isChot ? 'Đã chốt' : 'Mới chỉ là đề xuất / trao đổi',
        chat_title: bestMatch.chat_title,
        topic_name: bestMatch.topic_name,
        sender_name: bestMatch.sender_name,
        date_formatted: bestMatch.date_formatted,
        message_id: bestMatch.message_id,
        deep_link: bestMatch.deep_link,
        file_name: bestMatch.file_name,
        evidence_quote: bestMatch.text
      };
    }

    return {
      found: false,
      summary: 'Không tìm thấy thông tin phù hợp với từ khóa trong lịch sử tin nhắn.',
      status: 'Chưa có thông tin',
      chat_title: 'Không có',
      topic_name: 'Không có',
      sender_name: 'Hệ thống',
      date_formatted: 'Không có',
      deep_link: null
    };
  }
}

module.exports = new GeminiAIService();

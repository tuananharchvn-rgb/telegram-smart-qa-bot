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
          continue; // thử model tiếp theo
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
        summary: 'Chưa có dữ liệu tin nhắn nào trong nhóm được ghi nhận.',
        status: 'Chưa có thông tin',
        sender_name: 'Hệ thống',
        date_formatted: 'Chưa xác định',
        deep_link: null
      };
    }

    // Định dạng lịch sử tin nhắn thành văn bản ngữ cảnh
    const formattedHistory = messages.map((m, index) => {
      return `[Tin #${m.message_id}] [Thời gian: ${m.date_formatted}] [Người gửi: ${m.sender_name}] [Topic: ${m.topic_name || 'Chung'}] [Tệp: ${m.file_name || (m.has_media ? 'Ảnh/Video' : 'Không')}]
Nội dung: ${m.text}
Link: ${m.deep_link || ''}
---`;
    }).join('\n');

    const systemInstruction = `Bạn là Trợ lý Hỏi đáp & Truy xuất nguồn gốc thông tin (Smart Q&A + Deep Link) cao cấp trong nhóm làm việc Telegram.
Nhiệm vụ của bạn là đọc các tin nhắn được ghi nhận trong nhóm và trả lời câu hỏi của người dùng.

BẮT BUỘC ĐÁP ỨNG ĐỦ 4 YẾU TỐ SAU TRONG KẾT QUẢ:
1. Nội dung tóm tắt: Nêu câu trả lời rõ ràng, súc tích và BẮT BUỘC chỉ rõ trạng thái là "Đã chốt" (đã thống nhất/duyệt) hay "Mới chỉ là đề xuất" (đang bàn thảo/chưa duyệt).
2. Ai là người gửi: Tên đối tác/sếp/bạn gửi tin nhắn quyết định hoặc đưa ra thông tin.
3. Gửi vào lúc nào: Ngày giờ cụ thể (dựa trên trường [Thời gian]).
4. Nút/Link tin nhắn gốc: Trích xuất chính xác trường Link hoặc ID tin nhắn để tạo deep link nhảy thẳng vào tin nhắn xem file/ảnh.

BẮT BUỘC TRẢ VỀ ĐỊNH DẠNG JSON HỢP LỆ VỚI CẤU TRÚC SAU:
{
  "found": true hoặc false,
  "summary": "Tóm tắt ngắn gọn nội dung trả lời cho câu hỏi",
  "status": "Đã chốt" hoặc "Mới chỉ là đề xuất" hoặc "Đang trao đổi" hoặc "Chưa có thông tin",
  "sender_name": "Tên người gửi tin nhắn nguồn",
  "date_formatted": "Ngày giờ cụ thể của tin nhắn nguồn",
  "message_id": 123,
  "topic_name": "Tên topic nếu có",
  "deep_link": "https://t.me/...",
  "file_name": "Tên file đính kèm nếu có",
  "evidence_quote": "Câu trích dẫn ngắn từ tin nhắn gốc chứng minh",
  "additional_sources": [
    {
      "message_id": 101,
      "sender_name": "...",
      "role": "Đề xuất ban đầu",
      "deep_link": "https://t.me/..."
    }
  ]
}

Nếu không tìm thấy thông tin nào liên quan, đặt "found": false, "summary": "Không tìm thấy thông tin liên quan trong các tin nhắn gần đây.", "status": "Chưa có thông tin".`;

    const userPrompt = `Dưới đây là danh sách các tin nhắn đã ghi nhận trong nhóm:
${formattedHistory}

CÂU HỎI CỦA NGƯỜI DÙNG:
"${question}"

Hãy phân tích và trả về đúng định dạng JSON yêu cầu.`;

    try {
      const responseText = await this.callGemini(userPrompt, systemInstruction);
      
      // Parse JSON
      let result = null;
      try {
        result = JSON.parse(responseText);
      } catch (jsonErr) {
        // Cố gắng lọc regex JSON
        const match = responseText.match(/\{[\s\S]*\}/);
        if (match) {
          result = JSON.parse(match[0]);
        } else {
          throw jsonErr;
        }
      }

      // Đảm bảo deep_link luôn chính xác nếu message_id khớp với tin nhắn trong DB
      if (result && result.message_id) {
        const foundMsg = messages.find(m => m.message_id === Number(result.message_id));
        if (foundMsg) {
          if (!result.deep_link || result.deep_link === '') {
            result.deep_link = foundMsg.deep_link;
          }
          if (!result.sender_name) {
            result.sender_name = foundMsg.sender_name;
          }
          if (!result.date_formatted) {
            result.date_formatted = foundMsg.date_formatted;
          }
          if (foundMsg.file_name && !result.file_name) {
            result.file_name = foundMsg.file_name;
          }
        }
      }

      return result;
    } catch (err) {
      console.error('Lỗi phân tích AI Gemini:', err);
      // Fallback tìm kiếm từ khóa thủ công nếu AI gặp sự cố
      return this.fallbackKeywordSearch(question, messages);
    }
  }

  fallbackKeywordSearch(question, messages) {
    const qLower = question.toLowerCase();
    const keywords = qLower.split(/\s+/).filter(w => w.length > 2);

    let bestMatch = null;
    let maxScore = 0;

    for (const m of messages) {
      const textLower = (m.text + ' ' + (m.file_name || '')).toLowerCase();
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
        sender_name: bestMatch.sender_name,
        date_formatted: bestMatch.date_formatted,
        message_id: bestMatch.message_id,
        topic_name: bestMatch.topic_name,
        deep_link: bestMatch.deep_link,
        file_name: bestMatch.file_name,
        evidence_quote: bestMatch.text
      };
    }

    return {
      found: false,
      summary: 'Không tìm thấy thông tin phù hợp với từ khóa trong lịch sử tin nhắn.',
      status: 'Chưa có thông tin',
      sender_name: 'Hệ thống',
      date_formatted: 'Không có',
      deep_link: null
    };
  }
}

module.exports = new GeminiAIService();

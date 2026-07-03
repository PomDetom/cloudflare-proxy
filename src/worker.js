export default {
  async fetch(request) {
    const url = new URL(request.url);
    // 构造谷歌 Gemini API 的地址
    const geminiUrl = 'https://generativelanguage.googleapis.com' + url.pathname + url.search;
    // 转发请求
    const newRequest = new Request(geminiUrl, {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
    return fetch(newRequest);
  },
};
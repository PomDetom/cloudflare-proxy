// Gemini 透明转发器（推荐版）
// 客户端用 Google 官方方式调用，只需改 baseUrl 即可

const GEMINI_BASE = 'https://generativelanguage.googleapis.com';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // 1. 处理 CORS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': '*',
        },
      });
    }

    // 2. 构建目标 URL（完全保留原路径和查询参数）
    const targetUrl = `${GEMINI_BASE}${url.pathname}${url.search}`;

    // 3. 复制请求头
    const headers = new Headers(request.headers);

    // 4. 自动构造请求参数（核心逻辑）
    // 优先级：
    // - 如果客户端传了 x-goog-api-key 或 key= 参数 → 直接透传
    // - 否则使用 Worker 里配置的 GEMINI_API_KEY（推荐做法，隐藏真实 Key）
    const hasClientKey = 
      headers.has('x-goog-api-key') || 
      url.searchParams.has('key');

    if (!hasClientKey && env.GEMINI_API_KEY) {
      headers.set('x-goog-api-key', env.GEMINI_API_KEY);
    }

    // 删除可能导致问题的 header
    headers.delete('host');
    headers.delete('cf-ray');

    try {
      // 5. 转发请求到 Google
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
        body: request.body,
      });

      // 6. 返回响应（保持原样 + 加 CORS）
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse.headers.set('Access-Control-Expose-Headers', '*');

      return newResponse;

    } catch (error) {
      return new Response(JSON.stringify({
        error: {
          message: error.message,
          type: 'proxy_error'
        }
      }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 判断是否是 OpenAI 兼容路径
    const isOpenAIPath = pathname.includes('/openai/') || pathname.startsWith('/v1/');

    let targetUrl;

    if (isOpenAIPath) {
      // 使用 Google 官方 OpenAI 兼容端点
      targetUrl = 'https://generativelanguage.googleapis.com' + pathname + url.search;
    } else {
      // 原生 Gemini 路径
      targetUrl = 'https://generativelanguage.googleapis.com' + pathname + url.search;
    }

    // 复制并清理请求头
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('cf-ray');
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ipcountry');
    headers.delete('cf-visitor');
    headers.delete('x-forwarded-for');
    headers.delete('x-forwarded-proto');

    let body = request.body;

    // 只对 chat/completions 请求做特殊处理（解决 thinking_config 问题）
    if (pathname.endsWith('/chat/completions') && request.method === 'POST') {
      try {
        const originalBody = await request.text();
        let jsonBody = JSON.parse(originalBody);

        // === 核心修复：thinking_config 参数转换 ===
        if (jsonBody.thinking_config) {
          jsonBody.generationConfig = jsonBody.generationConfig || {};
          jsonBody.generationConfig.thinkingConfig = jsonBody.thinking_config;
          delete jsonBody.thinking_config;
        }

        // 支持 Hermes 常见的 extra_body.google.thinking_config 写法
        if (jsonBody.extra_body?.google?.thinking_config) {
          jsonBody.generationConfig = jsonBody.generationConfig || {};
          jsonBody.generationConfig.thinkingConfig = jsonBody.extra_body.google.thinking_config;
          delete jsonBody.extra_body.google.thinking_config;

          // 如果 extra_body.google 为空则删除
          if (Object.keys(jsonBody.extra_body.google).length === 0) {
            delete jsonBody.extra_body.google;
          }
          if (Object.keys(jsonBody.extra_body).length === 0) {
            delete jsonBody.extra_body;
          }
        }

        body = JSON.stringify(jsonBody);
        headers.set('Content-Type', 'application/json');
      } catch (e) {
        console.error('Body parse error:', e);
        // 解析失败就使用原始 body
      }
    }

    const newRequest = new Request(targetUrl, {
      method: request.method,
      headers: headers,
      body: body,
      redirect: 'follow',
    });

    try {
      const response = await fetch(newRequest);

      // 可选：添加 CORS 头（如果前端需要）
      const newHeaders = new Headers(response.headers);
      newHeaders.set('Access-Control-Allow-Origin', '*');
      newHeaders.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
      newHeaders.set('Access-Control-Allow-Headers', '*');

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: newHeaders,
      });
    } catch (error) {
      return new Response(
        JSON.stringify({ error: 'Proxy error', message: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  },
};
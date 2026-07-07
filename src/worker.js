export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // 判断是否为 OpenAI 兼容路径（你当前用的就是这种）
    const isOpenAIPath = pathname.includes('/openai/') || pathname.startsWith('/v1/');

    // 路径重写：标准 OpenAI SDK 路径 → Google OpenAI 兼容路径
    // 例如 /v1/chat/completions → /v1beta/openai/chat/completions
    let targetPath = pathname;
    if (pathname.startsWith('/v1/') && !pathname.startsWith('/v1beta/')) {
      targetPath = `/v1beta/openai${pathname.slice(3)}`;  // 去掉 /v1 前缀
    }

    // 目标地址
    const targetUrl = `https://generativelanguage.googleapis.com${targetPath}${url.search}`;

    // 清理请求头
    const headers = new Headers(request.headers);
    headers.delete('host');
    headers.delete('cf-ray');
    headers.delete('cf-connecting-ip');
    headers.delete('cf-ipcountry');
    headers.delete('cf-visitor');
    headers.delete('x-forwarded-for');
    headers.delete('x-forwarded-proto');

    let body = request.body;

    // 只处理 chat/completions 请求
    if (pathname.endsWith('/chat/completions') && request.method === 'POST') {
      try {
        const text = await request.text();
        let json = JSON.parse(text);

        // === 核心修复：thinking_config 规范化 ===
        let thinkingConfig = null;

        if (json.thinking_config) {
          thinkingConfig = json.thinking_config;
          delete json.thinking_config;
        } else if (json.extra_body?.google?.thinking_config) {
          thinkingConfig = json.extra_body.google.thinking_config;
          delete json.extra_body.google.thinking_config;

          // 清理空的 extra_body.google
          if (Object.keys(json.extra_body.google || {}).length === 0) {
            delete json.extra_body.google;
          }
          if (json.extra_body && Object.keys(json.extra_body).length === 0) {
            delete json.extra_body;
          }
        }

        // 如果有 thinking_config，统一放到 OpenAI 兼容路径推荐的位置
        if (thinkingConfig) {
          if (isOpenAIPath) {
            // OpenAI 兼容路径推荐结构
            json.extra_body = json.extra_body || {};
            json.extra_body.google = json.extra_body.google || {};
            json.extra_body.google.thinking_config = thinkingConfig;
          } else {
            // 原生 Gemini 路径
            json.generationConfig = json.generationConfig || {};
            json.generationConfig.thinkingConfig = thinkingConfig;
          }
        }

        body = JSON.stringify(json);
        headers.set('Content-Type', 'application/json');
      } catch (e) {
        console.error('Body processing error:', e);
      }
    }

    const newRequest = new Request(targetUrl, {
      method: request.method,
      headers: headers,
      body: body,
    });

    const response = await fetch(newRequest);

    // 添加 CORS（按需保留）
    const newHeaders = new Headers(response.headers);
    newHeaders.set('Access-Control-Allow-Origin', '*');

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: newHeaders,
    });
  },
};
// ============================================
// MoPai 墨排 — LLM 传输层（OpenAI 兼容协议 + SSE 流式）
// 纯传输：不依赖 Vue、不碰 DOM
// ============================================

const aiClient = (() => {

  // ─── 服务商表（全部为 OpenAI 兼容协议，差异只在 base/extraHeaders）──
  // proxy: true 表示国内网络通常需要代理才能连通
  const PROVIDERS = {
    deepseek: {
      name: 'DeepSeek',
      base: 'https://api.deepseek.com',
      defaultModel: 'deepseek-chat',
      keyUrl: 'https://platform.deepseek.com/api_keys',
    },
    glm: {
      name: '智谱 GLM',
      base: 'https://open.bigmodel.cn/api/paas/v4',
      defaultModel: 'glm-4.7-flash',
      keyUrl: 'https://bigmodel.cn/usercenter/apikeys',
    },
    siliconflow: {
      name: 'SiliconFlow',
      base: 'https://api.siliconflow.cn/v1',
      defaultModel: 'Qwen/Qwen3-8B',
      keyUrl: 'https://cloud.siliconflow.cn/account/ak',
    },
    dashscope: {
      name: '通义千问',
      base: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      defaultModel: 'qwen-plus',
      keyUrl: 'https://bailian.console.aliyun.com/?apiKey=1',
    },
    openai: {
      name: 'OpenAI',
      base: 'https://api.openai.com/v1',
      defaultModel: 'gpt-5.4-mini',
      keyUrl: 'https://platform.openai.com/api-keys',
      proxy: true,
    },
    openrouter: {
      name: 'OpenRouter',
      base: 'https://openrouter.ai/api/v1',
      defaultModel: 'deepseek/deepseek-chat',
      keyUrl: 'https://openrouter.ai/keys',
      proxy: true,
      extraHeaders: { 'HTTP-Referer': 'https://mopai-markdown.vercel.app', 'X-Title': 'MoPai' },
    },
  };

  async function httpError(resp, p) {
    let detail = '';
    try { const d = await resp.json(); detail = d.error?.message || d.message || ''; } catch {}
    const tail = detail ? '：' + detail : '';
    if (resp.status === 401 || resp.status === 403) return `${p.name} Key 无效或无权限${tail}`;
    if (resp.status === 404) return `${p.name} 找不到该模型，请检查模型名${tail}`;
    if (resp.status === 429) return `${p.name} 限流或额度不足${tail}`;
    return `${p.name} 返回错误 ${resp.status}${tail}`;
  }

  // 流式对话。onDelta(fullText) 每收到一段增量调用一次；返回 { text, toolCalls }
  async function chatStream({ provider, key, model, messages, tools, onDelta, signal }) {
    const p = PROVIDERS[provider];
    if (!p) throw new Error('未知服务商：' + provider);
    if (!key) throw new Error(`请先在设置中配置 ${p.name} API Key`);

    let resp;
    try {
      resp = await fetch(p.base + '/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key, ...p.extraHeaders },
        body: JSON.stringify({
          model: model || p.defaultModel,
          messages,
          stream: true,
          ...(tools && tools.length ? { tools } : {}),
        }),
        signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      // fetch 抛错 = 网络不可达或跨域被拦，与 HTTP 错误码是两类问题，文案要分开
      throw new Error(`无法连接 ${p.name}${p.proxy ? '，国内网络可能需要代理，可改用 DeepSeek / 智谱 GLM' : '，请检查网络'}`);
    }
    if (!resp.ok) throw new Error(await httpError(resp, p));

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '', text = '';
    const toolCalls = [];

    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop();
      for (const line of lines) {
        const s = line.trim();
        if (!s.startsWith('data:')) continue;
        const payload = s.slice(5).trim();
        if (!payload || payload === '[DONE]') continue;
        let delta;
        try { delta = JSON.parse(payload).choices?.[0]?.delta; } catch { continue; }
        if (!delta) continue;
        if (delta.content) { text += delta.content; onDelta?.(text); }
        // tool_call 在流式下按 index 分片下发，需增量拼装
        for (const tc of delta.tool_calls || []) {
          const slot = toolCalls[tc.index] ??= { id: '', name: '', args: '' };
          if (tc.id) slot.id = tc.id;
          if (tc.function?.name) slot.name += tc.function.name;
          if (tc.function?.arguments) slot.args += tc.function.arguments;
        }
      }
    }
    return { text, toolCalls: toolCalls.filter(Boolean) };
  }

  return { PROVIDERS, chatStream };
})();

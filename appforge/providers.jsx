// Streaming providers for OpenAI + Gemini + Anthropic + demo
// All return AsyncIterable<{delta?: string, usage?: {in, out}}>

export async function* streamAnthropic({ apiKey, model, messages, system, temperature, maxTokens, signal }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({ model, max_tokens: maxTokens, temperature, system, messages, stream: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`Anthropic ${res.status}: ${txt.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let usage = { in: 0, out: 0 };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const evt = JSON.parse(data);
        if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
          yield { delta: evt.delta.text };
        } else if (evt.type === 'message_start' && evt.message?.usage) {
          usage.in = evt.message.usage.input_tokens || 0;
        } else if (evt.type === 'message_delta') {
          if (evt.usage) usage.out = evt.usage.output_tokens || usage.out;
          if (evt.delta?.stop_reason === 'max_tokens') {
            const err = new Error('max_tokens'); err.stopReason = 'max_tokens'; throw err;
          }
        }
      } catch {}
    }
  }
  yield { usage };
}

export async function* streamOpenAI({ apiKey, model, messages, system, temperature, maxTokens, signal }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [{ role: 'system', content: system }, ...messages],
      temperature, max_tokens: maxTokens, stream: true,
      stream_options: { include_usage: true },
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`OpenAI ${res.status}: ${txt.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let usage = { in: 0, out: 0 };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const evt = JSON.parse(data);
        const delta = evt.choices?.[0]?.delta?.content;
        if (delta) yield { delta };
        if (evt.usage) usage = { in: evt.usage.prompt_tokens || 0, out: evt.usage.completion_tokens || 0 };
      } catch {}
    }
  }
  yield { usage };
}

export async function* streamGemini({ apiKey, model, messages, system, temperature, maxTokens, signal }) {
  // Gemini SSE endpoint
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse&key=${encodeURIComponent(apiKey)}`;
  const contents = messages.map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
    signal,
  });
  if (!res.ok || !res.body) {
    const txt = await res.text().catch(() => res.statusText);
    throw new Error(`Gemini ${res.status}: ${txt.slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let usage = { in: 0, out: 0 };
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.startsWith('data:')) continue;
      const data = line.slice(5).trim();
      if (!data) continue;
      try {
        const evt = JSON.parse(data);
        const parts = evt.candidates?.[0]?.content?.parts || [];
        for (const p of parts) if (p.text) yield { delta: p.text };
        if (evt.usageMetadata) usage = {
          in: evt.usageMetadata.promptTokenCount || 0,
          out: evt.usageMetadata.candidatesTokenCount || 0,
        };
      } catch {}
    }
  }
  yield { usage };
}

export async function* streamDemo({ messages, system, signal }) {
  const userMsgs = messages.map(m => `${m.role}: ${m.content}`).join('\n\n');
  const prompt = `${system}\n\n=== Conversation ===\n${userMsgs}\n\nAssistant:`;
  let full = '';
  try {
    full = await window.claude.complete(prompt);
  } catch (e) {
    full = `Here's a starter component:\n\n\`\`\`jsx filename="src/App.jsx"\nfunction App() {\n  const [count, setCount] = useState(0);\n  return (\n    <div className="min-h-screen bg-gradient-to-br from-violet-50 to-pink-50 flex items-center justify-center p-8">\n      <div className="bg-white rounded-2xl shadow-2xl p-10 max-w-md w-full text-center">\n        <h1 className="text-4xl font-bold text-gray-900 mb-3">Hello from AppForge</h1>\n        <p className="text-gray-600 mb-6">Add an API key in Settings for live generation.</p>\n        <button onClick={() => setCount(c => c + 1)} className="px-6 py-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-medium shadow-lg shadow-violet-200 transition">\n          Clicked {count} times\n        </button>\n      </div>\n    </div>\n  );\n}\n\`\`\``;
  }
  const chunks = full.match(/[\s\S]{1,8}/g) || [];
  for (const c of chunks) {
    if (signal?.aborted) return;
    yield { delta: c };
    await new Promise(r => setTimeout(r, 14));
  }
  yield { usage: { in: Math.round(prompt.length / 4), out: Math.round(full.length / 4) } };
}

export const PROVIDER_FOR_MODEL = (id) => {
  if (id.startsWith('claude')) return 'anthropic';
  if (id.startsWith('gpt')) return 'openai';
  if (id.startsWith('gemini')) return 'gemini';
  return 'demo';
};

export function getStreamer(model, settings) {
  const p = PROVIDER_FOR_MODEL(model);
  if (p === 'anthropic' && settings.anthropicKey) return { fn: streamAnthropic, key: settings.anthropicKey };
  if (p === 'openai'    && settings.openaiKey)    return { fn: streamOpenAI,    key: settings.openaiKey };
  if (p === 'gemini'    && settings.geminiKey)    return { fn: streamGemini,    key: settings.geminiKey };
  return { fn: streamDemo, key: null };
}

// Build a fallback chain — Claude → OpenAI → Gemini → demo. The first entry is
// the user's chosen model. Each subsequent entry is a different provider that
// has a key configured, with a sensible default model.
export function buildFallbackChain(model, settings) {
  const chain = [];
  const seen = new Set();
  const push = (entry) => {
    const k = entry.provider + ':' + entry.model;
    if (seen.has(k)) return;
    seen.add(k);
    chain.push(entry);
  };
  const primary = getStreamer(model, settings);
  push({ provider: PROVIDER_FOR_MODEL(model), model, fn: primary.fn, key: primary.key });
  const order = [
    { provider: 'anthropic', model: 'claude-sonnet-4-20250514', fn: streamAnthropic, key: settings.anthropicKey },
    { provider: 'openai',    model: 'gpt-4o',                   fn: streamOpenAI,    key: settings.openaiKey },
    { provider: 'gemini',    model: 'gemini-2.5-pro',           fn: streamGemini,    key: settings.geminiKey },
  ];
  for (const o of order) if (o.key) push(o);
  push({ provider: 'demo', model: 'demo', fn: streamDemo, key: null });
  return chain;
}

// Resilient streamer: yields {delta, usage, providerSwitch}. On any error,
// rotates to the next available provider and resumes by injecting the
// already-accumulated text as an assistant turn + a continuation instruction.
export async function* streamWithFailover({ model, messages, system, settings, temperature, maxTokens, signal, onSwitch }) {
  const chain = buildFallbackChain(model, settings);
  let acc = '';
  let lastError = null;
  for (let i = 0; i < chain.length; i++) {
    const link = chain[i];
    if (i > 0) {
      onSwitch?.({ from: chain[i-1], to: link, reason: lastError?.message || 'fallback' });
      yield { providerSwitch: { from: chain[i-1].provider, to: link.provider, reason: lastError?.message || 'fallback' } };
    }
    // Build messages with continuation context if we already have partial output
    let convo = messages;
    if (acc) {
      convo = [
        ...messages,
        { role: 'assistant', content: acc },
        { role: 'user', content: 'Continue exactly where you left off. Do not repeat any code or text already produced. Continue the response so it ends complete and well-formed (close any open code fences).' },
      ];
    }
    try {
      const stream = link.fn({
        apiKey: link.key, model: link.model, messages: convo, system,
        temperature, maxTokens, signal,
      });
      for await (const part of stream) {
        if (part.delta) acc += part.delta;
        yield part;
      }
      // Verify the response looks complete (no dangling ``` fence)
      const opens = (acc.match(/```/g) || []).length;
      if (opens % 2 === 1) {
        lastError = new Error('truncated mid-fence');
        // retry on SAME provider with continuation; don't switch yet
        i--;
        continue;
      }
      return; // success
    } catch (err) {
      if (signal?.aborted) throw err;
      lastError = err;
      // On max_tokens, retry the same provider with a continuation prompt
      // before falling over to the next one.
      if (err.stopReason === 'max_tokens') {
        i--; // re-run the same link with continuation context
      }
    }
  }
  if (lastError) throw lastError;
}


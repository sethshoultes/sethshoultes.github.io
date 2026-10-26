// Asks three AI assistants, each with live web search, who to hire for a
// service in a city. The business being checked is never put in the question,
// so the answer is not nudged toward it. Keys are Pages secrets.

const TIMEOUT_MS = 28000;

export const ASSISTANTS = [
  { id: 'chatgpt', label: 'ChatGPT', secret: 'OPENAI_API_KEY' },
  { id: 'perplexity', label: 'Perplexity', secret: 'OPENROUTER_API_KEY' },
  { id: 'google', label: 'Google AI (Gemini)', secret: 'GEMINI_API_KEY' },
];

export function buildQuestion(service, city) {
  return `I live in ${city} and need a ${service}. Who are the best ${service} businesses in ${city}? Name up to 5 real local businesses and say briefly why. ` +
    'Then end with one final line in exactly this form, naming only the businesses, with no links: NAMES: Business One | Business Two | Business Three';
}

async function post(url, headers, body) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body), signal: controller.signal });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`answered ${res.status}`);
    return json;
  } finally {
    clearTimeout(timer);
  }
}

const callers = {
  async chatgpt(key, question) {
    const j = await post('https://api.openai.com/v1/responses', { Authorization: `Bearer ${key}` }, {
      model: 'gpt-4.1-mini', tools: [{ type: 'web_search_preview' }], input: question,
    });
    return (j.output || []).filter((o) => o.type === 'message').flatMap((o) => o.content || []).map((c) => c.text || '').join('\n');
  },
  async perplexity(key, question) {
    const j = await post('https://openrouter.ai/api/v1/chat/completions', { Authorization: `Bearer ${key}` }, {
      model: 'perplexity/sonar', messages: [{ role: 'user', content: question }],
    });
    return j.choices?.[0]?.message?.content || '';
  },
  async google(key, question) {
    const j = await post('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent', { 'x-goog-api-key': key }, {
      contents: [{ parts: [{ text: question }] }], tools: [{ google_search: {} }],
    });
    return (j.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
  },
};

// Runs every assistant; one that fails is reported as failed, never filled in.
export async function askAll(env, question) {
  return Promise.all(ASSISTANTS.map(async (a) => {
    if (!env[a.secret]) return { id: a.id, label: a.label, state: 'unavailable', error: 'This assistant is not set up right now.' };
    try {
      const text = (await callers[a.id](env[a.secret], question)).trim();
      if (!text) return { id: a.id, label: a.label, state: 'failed', error: 'It gave no answer.' };
      return { id: a.id, label: a.label, state: 'answered', text };
    } catch (err) {
      return { id: a.id, label: a.label, state: 'failed', error: err.name === 'AbortError' ? 'It took too long to answer.' : 'It could not be reached.' };
    }
  }));
}

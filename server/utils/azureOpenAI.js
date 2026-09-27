// Thin wrapper around the Azure OpenAI Chat Completions REST API.
// Uses Node's built-in fetch — no SDK dependency needed.

const chatCompletion = async ({ systemPrompt, userPrompt, jsonMode }) => {
  const endpoint   = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
  const apiKey     = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !apiVersion || !deployment) {
    throw new Error('Azure OpenAI is not configured on the server.');
  }

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  const body = {
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature: 0,
  };
  if (jsonMode) body.response_format = { type: 'json_object' };

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Azure OpenAI request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Azure OpenAI returned no content.');
  return content;
};

// ── JSON-mode call — used where the caller needs a strict, parseable object back
// (e.g. translating a query into a filter). Never trust the parsed result blindly.
const chatJSON = async ({ systemPrompt, userPrompt }) => {
  const content = await chatCompletion({ systemPrompt, userPrompt, jsonMode: true });
  try {
    return JSON.parse(content);
  } catch {
    throw new Error('Azure OpenAI returned malformed JSON.');
  }
};

// ── Plain-text call — used for free-form natural-language answers (e.g. the
// analytics Q&A feature), where the response is just displayed to the user as-is.
const chatText = async ({ systemPrompt, userPrompt }) => {
  return chatCompletion({ systemPrompt, userPrompt, jsonMode: false });
};

module.exports = { chatJSON, chatText };

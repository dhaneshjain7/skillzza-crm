// Thin wrapper around the Azure OpenAI Chat Completions REST API.
// Uses Node's built-in fetch — no SDK dependency needed.

const chatJSON = async ({ systemPrompt, userPrompt }) => {
  const endpoint   = process.env.AZURE_OPENAI_ENDPOINT?.replace(/\/$/, '');
  const apiKey     = process.env.AZURE_OPENAI_API_KEY;
  const apiVersion = process.env.AZURE_OPENAI_API_VERSION;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;

  if (!endpoint || !apiKey || !apiVersion || !deployment) {
    throw new Error('Azure OpenAI is not configured on the server.');
  }

  const url = `${endpoint}/openai/deployments/${deployment}/chat/completions?api-version=${apiVersion}`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
      temperature: 0,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Azure OpenAI request failed (${res.status}): ${text.slice(0, 300)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error('Azure OpenAI returned no content.');

  try {
    return JSON.parse(content);
  } catch {
    throw new Error('Azure OpenAI returned malformed JSON.');
  }
};

module.exports = { chatJSON };

/**
 * Google Generative Language client.
 *
 * The API key lives only in this runtime — it is set as a Supabase secret and
 * is never sent to, or referenced by, the browser bundle.
 */

const DEFAULT_MODEL = 'gemini-3.6-flash';
const API_ROOT = 'https://generativelanguage.googleapis.com/v1beta/models';

export class GeminiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = 'GeminiError';
  }
}

export function hasGeminiKey(): boolean {
  return Boolean(Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY'));
}

interface GenerateOptions {
  system: string;
  prompt: string;
  /** A JSON schema; when given, the model is asked for structured JSON. */
  schema?: Record<string, unknown>;
  temperature?: number;
  maxOutputTokens?: number;
  /** Prior turns, oldest first. */
  history?: Array<{ role: 'user' | 'model'; text: string }>;
}

interface GeminiCandidate {
  content?: { parts?: Array<{ text?: string }> };
  finishReason?: string;
}

/** Calls Gemini and returns the raw text of the first candidate. */
export async function generateText(options: GenerateOptions): Promise<string> {
  const key = Deno.env.get('GOOGLE_GENERATIVE_AI_API_KEY');
  if (!key) {
    throw new GeminiError(
      'The commentary service is not configured. Set GOOGLE_GENERATIVE_AI_API_KEY as a Supabase secret.',
      503,
    );
  }
  const model = Deno.env.get('GEMINI_MODEL') ?? DEFAULT_MODEL;

  const contents = [
    ...(options.history ?? []).map((turn) => ({ role: turn.role, parts: [{ text: turn.text }] })),
    { role: 'user', parts: [{ text: options.prompt }] },
  ];

  const body: Record<string, unknown> = {
    contents,
    systemInstruction: { parts: [{ text: options.system }] },
    generationConfig: {
      temperature: options.temperature ?? 0.6,
      topP: 0.95,
      maxOutputTokens: options.maxOutputTokens ?? 4096,
      ...(options.schema
        ? { responseMimeType: 'application/json', responseSchema: options.schema }
        : {}),
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  };

  const res = await fetch(`${API_ROOT}/${model}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new GeminiError(
      `The commentary service returned ${res.status}. ${detail.slice(0, 400)}`,
      res.status === 429 ? 429 : 502,
    );
  }

  const payload = (await res.json()) as { candidates?: GeminiCandidate[] };
  const candidate = payload.candidates?.[0];
  const text = candidate?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text.trim()) {
    throw new GeminiError('The commentary service returned an empty response.', 502);
  }
  return text;
}

/** Calls Gemini expecting JSON, and parses it defensively. */
export async function generateJson<T>(options: GenerateOptions & { schema: Record<string, unknown> }): Promise<T> {
  const raw = await generateText(options);
  return parseJson<T>(raw);
}

/** Parses model output that should be JSON, tolerating stray fences. */
export function parseJson<T>(raw: string): T {
  const trimmed = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start !== -1 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as T;
    }
    throw new GeminiError('The commentary service returned malformed JSON.', 502);
  }
}

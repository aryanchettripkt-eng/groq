// ─────────────────────────────────────────────────────────────
// Groq AI client
// Groq is free, fast, and works globally including India.
// Get your key at: https://console.groq.com/keys
// ─────────────────────────────────────────────────────────────

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const MODEL = "llama-3.3-70b-versatile"; // Free, fast, excellent reasoning

export const getGroqKey = (): string => {
  const viteEnvKey = import.meta.env.VITE_GROQ_API_KEY;
  const localStorageKey = typeof window !== 'undefined'
    ? localStorage.getItem('REMINIQ_GROQ_API_KEY')
    : null;

  const cleanKey = (key: any): string | null => {
    if (!key || key === "undefined" || key === "null" || key === "YOUR_GROQ_API_KEY") return null;
    return String(key).trim();
  };

  const apiKey = cleanKey(viteEnvKey) || cleanKey(localStorageKey);

  if (!apiKey) {
    throw new Error(
      "Groq API Key is missing.\n\n" +
      "On Vercel: add VITE_GROQ_API_KEY to your project's Environment Variables.\n" +
      "Locally: add VITE_GROQ_API_KEY=\"your-key\" to a .env file.\n" +
      "Or paste it via the gear icon in the app.\n\n" +
      "Get a free key at: https://console.groq.com/keys"
    );
  }

  return apiKey;
};

// Core fetch wrapper — uses Groq's OpenAI-compatible API
async function groqChat(
  apiKey: string,
  systemPrompt: string,
  userPrompt: string,
  jsonMode = true
): Promise<string> {
  const response = await fetch(GROQ_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
      temperature: 0.4,
      max_tokens: 2048,
    }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    const msg = err?.error?.message || response.statusText;
    const status = response.status;

    if (status === 401) {
      throw new Error("Invalid Groq API key. Please check your key at console.groq.com/keys");
    }
    if (status === 429) {
      throw new Error("Groq rate limit hit. Please wait a moment and try again. (Free tier: 30 req/min)");
    }
    throw new Error(`Groq API error (${status}): ${msg}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from Groq.");
  return text;
}

// ─────────────────────────────────────────────────────────────
// Types (kept identical so App.tsx / components don't change)
// ─────────────────────────────────────────────────────────────

export interface Memory {
  id: string;
  type: 'photo' | 'voice' | 'text' | 'music';
  title: string;
  desc: string;
  mood: string;
  location?: string;
  date: string;
  photoUrl?: string;
  audioUrl?: string;
  musicUrl?: string;
  transcript?: string;
  emotion?: string;
  music?: {
    song: string;
    artist: string;
    albumArt?: string;
  };
}

export interface DayReaction {
  date: string;
  emoji: string;
}

export interface Album {
  id: string;
  title: string;
  memoryIds: string[];
  journalText?: string;
  linkedMemoryIds?: string[];
  voiceNoteUrl?: string;
}

// ─────────────────────────────────────────────────────────────
// sortMemoriesIntoAlbums
// ─────────────────────────────────────────────────────────────

export async function sortMemoriesIntoAlbums(memories: Memory[]): Promise<Album[]> {
  if (memories.length === 0) return [];

  const apiKey = getGroqKey();

  const memorySummary = memories
    .map(m =>
      `ID: ${m.id} | Title: ${m.title} | Desc: ${m.desc} | Location: ${m.location || 'Unknown'} | Date: ${m.date} | Mood: ${m.mood} | Type: ${m.type}`
    )
    .join('\n');

  const systemPrompt = `You are a nostalgic curator who groups personal memories into meaningful albums.
Always respond with valid JSON only — no markdown, no extra text.`;

  const userPrompt = `Group these memories into meaningful albums based on mood, location, and date.

GROUPING PRIORITY:
1. MOOD/EMOTION first (e.g., "Cozy Evenings", "Wild Adventures", "Quiet Mornings")
2. LOCATION second — group nearby places together
3. TIME last — order chronologically within groups

Rules:
- Every memory must belong to exactly one album
- Album titles should be short and poetic (3-5 words)
- Aim for 2-5 albums total

Return a JSON object with this exact structure:
{
  "albums": [
    { "title": "Album Title Here", "memoryIds": ["id1", "id2"] }
  ]
}

Memories to group:
${memorySummary}`;

  try {
    const text = await groqChat(apiKey, systemPrompt, userPrompt, true);

    // Parse — handle both { albums: [...] } and bare [...] responses
    let parsed: any;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Sometimes the model wraps in markdown despite instructions
      const cleaned = text.replace(/```json|```/g, '').trim();
      parsed = JSON.parse(cleaned);
    }

    const albumsData: any[] = Array.isArray(parsed) ? parsed : parsed.albums ?? [];

    if (!albumsData.length) {
      throw new Error("Groq returned no albums. Try adding more descriptive titles or moods to your memories.");
    }

    return albumsData.map((a: any) => ({
      id: Math.random().toString(36).substr(2, 9),
      title: a.title || "Untitled Album",
      memoryIds: a.memoryIds || [],
    }));
  } catch (error: any) {
    console.error("Groq sorting error:", error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// searchMemories
// ─────────────────────────────────────────────────────────────

export async function searchMemories(query: string, memories: Memory[]) {
  if (memories.length === 0) return null;

  const apiKey = getGroqKey();

  const memoryContext = memories.map(m => ({
    id: m.id,
    title: m.title,
    desc: m.desc,
    type: m.type,
    mood: m.mood,
    location: m.location,
  }));

  const systemPrompt = `You are the librarian of "Reminiq", a personal memory journal app.
Always respond with valid JSON only — no markdown, no extra text.`;

  const userPrompt = `A user is searching for a memory with the query: "${query}".

Here are the memories in their vault:
${JSON.stringify(memoryContext, null, 2)}

Find the most relevant memory and return a JSON object:
{
  "intro": "A poetic, nostalgic one-sentence introduction to the memory you found.",
  "memoryId": "the-matching-id"
}

If nothing matches well, return:
{
  "intro": "I couldn't find that specific moment, but your vault is still full of stories.",
  "memoryId": null
}`;

  try {
    const text = await groqChat(apiKey, systemPrompt, userPrompt, true);
    const cleaned = text.replace(/```json|```/g, '').trim();
    return JSON.parse(cleaned);
  } catch (error: any) {
    console.error("Groq search error:", error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────
// chatWithMemories  (used by SmartChat)
// ─────────────────────────────────────────────────────────────

export async function chatWithMemories(
  userMessage: string,
  memories: Memory[]
): Promise<{ action: 'chat' | 'create_album'; message: string; album?: Omit<Album, 'id'> }> {
  const apiKey = getGroqKey();

  const memorySummary = memories.map(m => ({
    id: m.id,
    title: m.title,
    desc: m.desc,
    mood: m.mood,
    date: m.date,
  }));

  const systemPrompt = `You are a helpful AI assistant for a personal memory journal app called Reminiq.
Always respond with valid JSON only — no markdown, no extra text.`;

  const userPrompt = `Current Memories: ${JSON.stringify(memorySummary)}

User Request: "${userMessage}"

If the user wants to sort, group, or create an album, return:
{
  "action": "create_album",
  "album": {
    "title": "Album Title",
    "memoryIds": ["id1", "id2"],
    "journalText": "A short poetic summary of these memories."
  },
  "message": "A friendly message explaining what you did."
}

If just chatting, return:
{
  "action": "chat",
  "message": "Your response message here."
}`;

  const text = await groqChat(apiKey, systemPrompt, userPrompt, true);
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

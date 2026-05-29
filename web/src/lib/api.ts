/**
 * Meow CLI Web - API Client
 * Provides typed functions to interact with the meow-cli backend.
 */

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `HTTP ${res.status}: ${res.statusText}`);
  }

  return res.json();
}

// ─── Health & Info ──────────────────────────────────────────────────

export interface HealthResponse {
  status: string;
  version: string;
  name: string;
}

export interface InfoResponse {
  version: string;
  name: string;
  description: string;
  dataDir: string;
  cwd: string;
}

export const api = {
  health: () => request<HealthResponse>('/health'),
  info: () => request<InfoResponse>('/info'),
  status: () => request<StatusResponse>('/status'),

  // ─── Config ────────────────────────────────────────────────────
  getConfig: () => request<Record<string, any>>('/config'),
  updateConfig: (config: Record<string, any>) =>
    request<{ success: boolean; message: string }>('/config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  getRawConfig: () => request<Record<string, any>>('/config/raw'),

  setApiKey: (key: string) =>
    request<{ success: boolean; message: string }>('/config/api-key', {
      method: 'PUT',
      body: JSON.stringify({ key }),
    }),
  setModel: (model: string) =>
    request<{ success: boolean; message: string }>('/config/model', {
      method: 'PUT',
      body: JSON.stringify({ model }),
    }),
  setApiBase: (api_base: string) =>
    request<{ success: boolean; message: string }>('/config/api-base', {
      method: 'PUT',
      body: JSON.stringify({ api_base }),
    }),
  setProfile: (profile: string) =>
    request<{ success: boolean; message: string }>('/config/profile', {
      method: 'PUT',
      body: JSON.stringify({ profile }),
    }),

  // ─── Profiles ──────────────────────────────────────────────────
  getProfiles: () => request<Record<string, any>>('/profiles'),
  saveProfile: (name: string, data: Record<string, any>) =>
    request<{ success: boolean; message: string }>(`/profiles/${encodeURIComponent(name)}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteProfile: (name: string) =>
    request<{ success: boolean; message: string }>(`/profiles/${encodeURIComponent(name)}`, {
      method: 'DELETE',
    }),

  // ─── Providers ─────────────────────────────────────────────────
  getProviders: () => request<ProvidersResponse>('/providers'),
  createProvider: (id: string, config: Record<string, any>) =>
    request<{ success: boolean; message: string }>('/providers', {
      method: 'POST',
      body: JSON.stringify({ id, ...config }),
    }),
  updateProvider: (id: string, config: Record<string, any>) =>
    request<{ success: boolean; message: string }>(`/providers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(config),
    }),
  deleteProvider: (id: string) =>
    request<{ success: boolean; message: string }>(`/providers/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),
  activateProvider: (id: string) =>
    request<{ success: boolean; message: string }>(`/providers/${encodeURIComponent(id)}/activate`, {
      method: 'PUT',
    }),

  // ─── Sessions ──────────────────────────────────────────────────
  getSessions: () => request<SessionsResponse>('/sessions'),
  createSession: () => request<{ sessionId: string; message: string }>('/sessions', {
    method: 'POST',
  }),
  loadSession: (id: string) => request<SessionData>(`/sessions/${id}`),
  deleteSession: (id: string) =>
    request<{ success: boolean; message: string }>(`/sessions/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    }),

  // ─── Chat ──────────────────────────────────────────────────────
  sendChat: (messages: any[], model?: string) =>
    request<any>('/chat', {
      method: 'POST',
      body: JSON.stringify({ messages, model }),
    }),

  // ─── Cost ──────────────────────────────────────────────────────
  getCost: () => request<CostResponse>('/cost'),
  resetCost: () => request<{ success: boolean; message: string }>('/cost/reset', {
    method: 'POST',
  }),

  // ─── Templates ─────────────────────────────────────────────────
  getTemplates: () => request<Record<string, string>>('/templates'),
  saveTemplates: (templates: Record<string, string>) =>
    request<{ success: boolean; message: string }>('/templates', {
      method: 'PUT',
      body: JSON.stringify(templates),
    }),

  // ─── Theme ─────────────────────────────────────────────────────
  getTheme: () => request<ThemeResponse>('/theme'),
  setTheme: (theme: string) =>
    request<{ success: boolean; message: string }>('/theme', {
      method: 'PUT',
      body: JSON.stringify({ theme }),
    }),

  // ─── Models ────────────────────────────────────────────────────
  getModels: () => request<ModelInfo[]>('/models'),

  // ─── Auth ──────────────────────────────────────────────────────
  getAuthStatus: () => request<AuthStatusResponse>('/auth/status'),
  logout: () => request<{ success: boolean; message: string }>('/auth/logout', {
    method: 'POST',
  }),

  // ─── Context ───────────────────────────────────────────────────
  getContext: () => request<any[]>('/context'),

  // ─── CWD ───────────────────────────────────────────────────────
  getCwd: () => request<{ cwd: string; dataDir: string }>('/cwd'),
  setCwd: (cwd: string) =>
    request<{ success: boolean; cwd: string; message: string }>('/cwd', {
      method: 'PUT',
      body: JSON.stringify({ cwd }),
    }),

  // ─── Files (Tool Bridge) ───────────────────────────────────────
  readFile: (path: string) =>
    request<{ path: string; size: number; content: string; truncated: boolean }>(`/files/read?path=${encodeURIComponent(path)}`),
  writeFile: (path: string, content: string) =>
    request<{ success: boolean; path: string; size: number }>('/files/write', {
      method: 'POST',
      body: JSON.stringify({ path, content }),
    }),
  listFiles: (dirPath?: string) =>
    request<{ path: string; files: Array<{ name: string; isDirectory: boolean; isFile: boolean; size: number }> }>('/files/list', {
      method: 'POST',
      body: JSON.stringify({ path: dirPath || '.' }),
    }),

  // ─── Shell (Tool Bridge) ───────────────────────────────────────
  execShell: (command: string, timeout?: number) =>
    request<{ stdout: string; stderr: string; exitCode: number; error?: string }>('/shell/exec', {
      method: 'POST',
      body: JSON.stringify({ command, timeout }),
    }),

  // ─── Autopilot ─────────────────────────────────────────────────
  executeAutopilot: (task: string, model?: string) =>
    request<{ success: boolean; message: string; task: string; model: string; maxIterations: number }>('/autopilot/execute', {
      method: 'POST',
      body: JSON.stringify({ task, model }),
    }),
  getAutopilotStatus: () =>
    request<{ running: boolean; hasInstance: boolean; phase: string; iterations: number; errors: number }>('/autopilot/status'),
  cancelAutopilot: () =>
    request<{ success: boolean; message: string }>('/autopilot/cancel', {
      method: 'POST',
    }),

  // ─── Session Save ──────────────────────────────────────────────
  saveSession: (id: string, data: { messages?: any[]; model?: string; profile?: string }) =>
    request<{ success: boolean; message: string }>(`/sessions/${encodeURIComponent(id)}/save`, {
      method: 'POST',
      body: JSON.stringify(data),
    }),
};

// ─── Response Types ─────────────────────────────────────────────────

export interface StatusResponse {
  apiKeyConfigured: boolean;
  activeModel: string;
  activeProfile: string;
  activeProvider: string;
  theme: string;
  lang: string;
  sessionsCount: number;
  autopilotMaxIterations: number;
  autoYes: boolean;
  quiet: boolean;
}

export interface ProvidersResponse {
  providers: Record<string, {
    base_url?: string;
    api_key?: string;
    model?: string;
    api_schema?: string;
    [key: string]: any;
  }>;
  active: string;
  api_schema: string;
}

export interface SessionsResponse {
  sessions: SessionMeta[];
  current: string | null;
}

export interface SessionMeta {
  id: string;
  time: number;
  cwd: string;
  model: string;
  profile: string;
  chat: string;
  messagesCount: number;
}

export interface SessionData extends SessionMeta {
  messages: any[];
}

export interface CostResponse {
  session: {
    input_tokens: number;
    output_tokens: number;
    total_usd: number;
    requests: number;
  };
  total: {
    input_tokens: number;
    output_tokens: number;
    total_usd: number;
    requests: number;
    since: number;
  };
  history: Array<{
    time: number;
    model: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
  }>;
  modelPrices: Record<string, { input: number; output: number }>;
}

export interface ThemeResponse {
  current: string;
  themes: Record<string, {
    bg: string;
    surface: string;
    border: string;
    text: string;
    accent: string;
    success: string;
    error: string;
    warning: string;
    info: string;
    muted: string;
  }>;
}

export interface ModelInfo {
  id: string;
  name: string;
  provider: string;
}

export interface AuthStatusResponse {
  authenticated: boolean;
  user: {
    id?: string;
    name?: string;
    email?: string;
  } | null;
}

// ─── SSE Chat (Streaming) ───────────────────────────────────────────

export interface ToolCallEvent {
  id: string;
  name: string;
  args: Record<string, any>;
  toolType: string;
}

export function createChatStream(
  messages: any[],
  model?: string,
  onChunk?: (content: string) => void,
  onDone?: (result: { content: string; tool_calls: any[]; usage: any }) => void,
  onError?: (error: string) => void,
  onToolCall?: (toolCall: ToolCallEvent) => void
): AbortController {
  const controller = new AbortController();
  const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';

  fetch(`${API_BASE}/chat/stream`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages, model }),
    signal: controller.signal,
  }).then(async (response) => {
    if (!response.ok) {
      const err = await response.text();
      onError?.(err || `HTTP ${response.status}`);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      onError?.('No response body');
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const dataStr = line.slice(6);
        try {
          const data = JSON.parse(dataStr);
          if (data.type === 'content') {
            onChunk?.(data.content);
          } else if (data.type === 'done') {
            onDone?.({ content: data.content || '', tool_calls: data.tool_calls || [], usage: data.usage });
          } else if (data.type === 'error') {
            onError?.(data.error);
          }
        } catch {}
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onError?.(err.message);
    }
  });

  return controller;
}

// ─── Models by provider ─────────────────────────────────────────────

export const COMMON_MODELS = [
  { id: 'gpt-4-turbo', name: 'GPT-4 Turbo', provider: 'openai' },
  { id: 'gpt-4o', name: 'GPT-4o', provider: 'openai' },
  { id: 'gpt-4o-mini', name: 'GPT-4o Mini', provider: 'openai' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo', provider: 'openai' },
  { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', provider: 'anthropic' },
  { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', provider: 'anthropic' },
  { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', provider: 'anthropic' },
  { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', provider: 'anthropic' },
  { id: 'deepseek-chat', name: 'DeepSeek Chat', provider: 'deepseek' },
  { id: 'deepseek-coder', name: 'DeepSeek Coder', provider: 'deepseek' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash', provider: 'google' },
  { id: 'gemini-2.0-pro', name: 'Gemini 2.0 Pro', provider: 'google' },
  { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro', provider: 'google' },
];

export const API_SCHEMAS = [
  { id: 'openai', name: 'OpenAI Compatible' },
  { id: 'claude', name: 'Anthropic Claude' },
  { id: 'gemini', name: 'Google Gemini' },
];

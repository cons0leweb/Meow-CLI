export interface ActionDetail {
  title: string;
  summary: string[];
  files: string[];
  tools: string[];
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  isAutopilotCard?: boolean;
  autopilotTitle?: string;
  autopilotStep?: string;
  autopilotTotalSteps?: number;
  autopilotStatus?: 'running' | 'paused' | 'completed';
  actions?: { title: string; sheetKey: string }[];
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

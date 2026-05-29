import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Play, Pause, Check, Sparkles, X, User, Cpu, GitBranch, 
  HelpCircle, ChevronRight, CheckCircle2, ChevronDown, ListTodo, FileCode, Search,
  MessageSquare, Plus, Settings, Eye, FileText, Terminal, ArrowUpRight, Code, Shield, RotateCcw,
  Globe, Key, Zap, Trash2, DollarSign, Clock, RefreshCw, FolderOpen
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api, createChatStream, COMMON_MODELS } from './lib/api';
import { Settings as SettingsPanel } from './components/Settings';
import { VirtualChatList } from './components/VirtualChatList';
import { MarkdownRenderer, MARKDOWN_STYLES } from './components/MarkdownRenderer';
import { AutopilotPanel } from './components/AutopilotPanel';

// ============================================================================
// TYPE DECLARATIONS
// ============================================================================
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

// ============================================================================
// MAIN APPLICATION CORE
// ============================================================================
export default function App() {
  // Current session & interactive state
  const [currentSession, setCurrentSession] = useState<string>('default');
  const [sessions, setSessions] = useState<Array<{id: string; model: string; messagesCount: number; time: number}>>([]);
  const [sessionMessages, setSessionMessages] = useState<Record<string, ChatMessage[]>>({});
  const [sessionTitles, setSessionTitles] = useState<Record<string, string>>({});
  
  // Right sheet system keys: 'changes', 'context', 'action-detail', 'settings', 'cost', null
  const [activeSheet, setActiveSheet] = useState<'changes' | 'context' | 'action-detail' | 'settings' | 'cost' | null>(null);
  const [selectedActionDetail, setSelectedActionDetail] = useState<ActionDetail | null>(null);

  // Simulated global states
  const [composerVal, setComposerVal] = useState<string>('');
  const [thinkingState, setThinkingState] = useState<'idle' | 'thinking' | 'streaming'>('idle');
  const [showNotification, setShowNotification] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState<string>('');

  // Collapsed plan checklists in list
  const [autopilotPaused, setAutopilotPaused] = useState<boolean>(false);
  const [planExpandedId, setPlanExpandedId] = useState<string | null>(null);
  const [workedExpandedId, setWorkedExpandedId] = useState<string | null>(null);

  // Search context
  const [searchQuery, setSearchQuery] = useState<string>('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Autoapprove state
  const [autoApproveActive, setAutoApproveActive] = useState<boolean>(false);

  // Config/status
  const [config, setConfig] = useState<Record<string, any>>({});
  const [status, setStatus] = useState<any>(null);
  const [cost, setCost] = useState<any>(null);
  
  // CWD / PWD state
  const [currentCwd, setCurrentCwd] = useState<string>('');
  const [editingCwd, setEditingCwd] = useState(false);
  const [cwdInput, setCwdInput] = useState('');
  
  // Abort controller for streaming
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Theme from config
  const [themeColors, setThemeColors] = useState({
    accent: '#CC7832',
    text: '#d4d4d8',
    muted: '#52525b',
  });

  const currentTheme = config.theme || 'default';

  // Initialize
  useEffect(() => {
    loadInitialData();
  }, []);

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sessionMessages, streamingContent, thinkingState]);

  const loadInitialData = async () => {
    try {
      const [s, cfg, sess, cst] = await Promise.all([
        api.status().catch(() => null),
        api.getConfig().catch(() => ({})),
        api.getSessions().catch(() => ({ sessions: [], current: null })),
        api.getCost().catch(() => null),
      ]);
      setStatus(s);
      setConfig(cfg);
      setCost(cst);
      
      // Load sessions
      if (sess.sessions) {
        setSessions(sess.sessions);
        if (sess.current && !currentSession) {
          setCurrentSession(sess.current);
        }
      }

      // Load messages for current session
      if (sess.current) {
        const sessionData = await api.loadSession(sess.current).catch(() => null);
        if (sessionData?.messages) {
          const msgs = sessionData.messages.map((m: any, i: number) => ({
            id: `msg-${i}`,
            role: m.role || 'user',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            timestamp: sessionData.time ? new Date(sessionData.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
          }));
          setSessionMessages(prev => ({ ...prev, [sess.current!]: msgs }));
          
          // Set title from first user message
          const firstUser = msgs.find(m => m.role === 'user');
          if (firstUser) {
            setSessionTitles(prev => ({ ...prev, [sess.current!]: firstUser.content.slice(0, 40) }));
          }
        }
      }

      // Load CWD
      try {
        const cwdData = await api.getCwd();
        setCurrentCwd(cwdData.cwd);
        setCwdInput(cwdData.cwd);
      } catch {}
      
      // Try to load theme
      try {
        const themeData = await api.getTheme();
        if (themeData.themes && themeData.themes[cfg.theme || 'default']) {
          const t = themeData.themes[cfg.theme || 'default'];
          setThemeColors({
            accent: t.accent || '#CC7832',
            text: t.text || '#d4d4d8',
            muted: t.muted || '#52525b',
          });
        }
      } catch {}
    } catch (e: any) {
      console.error('Failed to load initial data:', e.message);
    }
  };

  const refreshStatus = useCallback(async () => {
    try {
      const [s, cfg, cst] = await Promise.all([
        api.status().catch(() => null),
        api.getConfig().catch(() => ({})),
        api.getCost().catch(() => null),
      ]);
      setStatus(s);
      setConfig(cfg);
      setCost(cst);
    } catch {}
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const sess = await api.getSessions();
      setSessions(sess.sessions);
    } catch {}
  }, []);

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await api.getConfig();
      setConfig(cfg);
    } catch {}
  }, []);

  // CWD change handler
  const handleCwdChange = useCallback(async () => {
    if (!cwdInput.trim()) return;
    try {
      const result = await api.setCwd(cwdInput.trim());
      setCurrentCwd(result.cwd);
      setEditingCwd(false);
      triggerNotification(`CWD: ${result.message}`);
    } catch (e: any) {
      triggerNotification(`CWD error: ${e.message}`);
    }
  }, [cwdInput, triggerNotification]);

  // Trigger notification
  const triggerNotification = useCallback((msg: string) => {
    setShowNotification(msg);
    setTimeout(() => setShowNotification(null), 3500);
  }, []);

  // Autopilot handlers
  const handleAutopilotStart = useCallback(async (task: string, model?: string) => {
    triggerNotification(`Autopilot started: ${task.slice(0, 40)}...`);
    // Add a chat message showing autopilot started
    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    const autopilotMsg: ChatMessage = {
      id: `autopilot-${Date.now()}`,
      role: 'assistant',
      content: `**Autopilot task:** ${task}\n\nRunning autonomously...`,
      timestamp,
      isAutopilotCard: true,
      autopilotTitle: task,
      autopilotStep: 'Running',
      autopilotTotalSteps: 1,
      autopilotStatus: 'running',
    };
    setSessionMessages(prev => ({
      ...prev,
      [currentSession]: [...(prev[currentSession] || []), autopilotMsg],
    }));
  }, [currentSession, triggerNotification]);

  const handleAutopilotStop = useCallback(() => {
    triggerNotification('Autopilot stopped');
  }, [triggerNotification]);

  // Auto-save session after messages change
  const saveCurrentSession = useCallback(async (msgs: ChatMessage[]) => {
    if (!currentSession || msgs.length === 0) return;
    try {
      await api.saveSession(currentSession, {
        messages: msgs.map(m => ({ role: m.role, content: m.content })),
        model: config.model,
        profile: config.profile,
      });
    } catch (e: any) {
      // Silent fail for save
      console.debug('Session auto-save error:', e.message);
    }
  }, [currentSession, config.model, config.profile]);

  // Helpers
  const getDefaultPrompt = () => {
    if (!config.lang || config.lang === 'ru') {
      return 'Как мне помочь с кодом?';
    }
    return 'How can I help with the code?';
  };

  const getComposerPlaceholder = () => {
    if (!status?.apiKeyConfigured) return '⚠️ Set up your API key in Settings to start chatting...';
    return getDefaultPrompt();
  };

  // Handle creating new chat
  const handleCreateNewChat = async () => {
    try {
      const result = await api.createSession();
      const newId = result.sessionId;
      
      setCurrentSession(newId);
      setSessionMessages(prev => ({
        ...prev,
        [newId]: [{
          id: `init-${newId}`,
          role: 'assistant',
          content: config.lang === 'ru' 
            ? 'Привет. Я подключён и готов. Напиши, что нужно сделать с кодом.'
            : 'Hello. I\'m connected and ready. Tell me what to do with the code.',
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        }]
      }));
      setSessionTitles(prev => ({ ...prev, [newId]: 'New Chat' }));
      
      await refreshSessions();
      triggerNotification('New chat created');
    } catch (e: any) {
      triggerNotification(`Error: ${e.message}`);
    }
  };

  // Switch session
  const handleSwitchSession = async (sessionId: string) => {
    try {
      const data = await api.loadSession(sessionId);
      setCurrentSession(sessionId);
      
      if (data && data.messages) {
        const msgs = data.messages.map((m: any, i: number) => ({
          id: `msg-${sessionId}-${i}`,
          role: m.role || 'user',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
          timestamp: data.time ? new Date(data.time).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }) : '',
        }));
        setSessionMessages(prev => ({ ...prev, [sessionId]: msgs }));
        
        const firstUser = msgs.find(m => m.role === 'user');
        if (firstUser) {
          setSessionTitles(prev => ({ ...prev, [sessionId]: firstUser.content.slice(0, 40) }));
        }
      } else {
        // Empty session
        setSessionMessages(prev => ({
          ...prev,
          [sessionId]: [{
            id: `init-${sessionId}`,
            role: 'assistant',
            content: config.lang === 'ru'
              ? 'Привет. Я подключён и готов. Напиши, что нужно сделать с кодом.'
              : 'Hello. I\'m connected and ready. Tell me what to do with the code.',
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
          }]
        }));
      }
      
      triggerNotification('Switched chat context');
    } catch (e: any) {
      triggerNotification(`Error: ${e.message}`);
    }
  };

  // Handle composer submissions
  const handleComposerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composerVal.trim() || thinkingState !== 'idle') return;

    const typedMsg = composerVal.trim();
    
    // Check if API key is configured
    if (!status?.apiKeyConfigured) {
      triggerNotification('⚠️ Configure your API key in Settings first');
      return;
    }

    const timestamp = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
    
    // 1. Post user message instantly
    const userMsg: ChatMessage = {
      id: `usr-${Date.now()}`,
      role: 'user',
      content: typedMsg,
      timestamp,
    };

    const updatedMessages = [...(sessionMessages[currentSession] || []), userMsg];
    setSessionMessages(prev => ({
      ...prev,
      [currentSession]: updatedMessages,
    }));
    setComposerVal('');
    setThinkingState('thinking');
    setStreamingContent('');

    // Save session title
    if (!sessionTitles[currentSession]) {
      setSessionTitles(prev => ({ ...prev, [currentSession]: typedMsg.slice(0, 40) }));
    }

    // Build messages array for API
    const apiMessages = updatedMessages
      .filter(m => m.role !== 'system' || true)
      .map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

    // Add system prompt
    const systemContent = config.profiles?.[config.profile || 'default']?.system || 
      (config.lang === 'ru' 
        ? 'Ты — опытный инженер-программист. Твои ответы кратки, точны и по существу.'
        : 'You are an experienced software engineer. Your answers are concise, accurate, and to the point.');

    apiMessages.unshift({ role: 'system', content: systemContent });

    // Check if it's an autopilot request
    const isAutopilotRequest = typedMsg.toLowerCase().includes('autopilot') || 
                                typedMsg.toLowerCase().includes('refactor') ||
                                typedMsg.toLowerCase().includes('автопилот');

    try {
      // 2. Stream the response
      let fullResponse = '';
      
      setThinkingState('streaming');

      const controller = createChatStream(
        apiMessages,
        config.model,
        (chunk) => {
          fullResponse += chunk;
          setStreamingContent(fullResponse);
        },
        (result) => {
          // Done
          const assistantMsg: ChatMessage = isAutopilotRequest ? {
            id: `asst-${Date.now()}`,
            role: 'assistant',
            content: fullResponse || 'Task completed.',
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            isAutopilotCard: true,
            autopilotTitle: typedMsg,
            autopilotStep: 'Step 1 of 4',
            autopilotTotalSteps: 4,
            autopilotStatus: 'running',
          } : {
            id: `asst-${Date.now()}`,
            role: 'assistant',
            content: fullResponse || 'No response generated.',
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          };

          setSessionMessages(prev => ({
            ...prev,
            [currentSession]: [...(prev[currentSession] || []), assistantMsg],
          }));
          setStreamingContent('');
          setThinkingState('idle');
          refreshStatus();
          refreshSessions();
          triggerNotification('Response received');
        },
        (error) => {
          // Error
          const errorMsg: ChatMessage = {
            id: `err-${Date.now()}`,
            role: 'assistant',
            content: `⚠️ Error: ${error}`,
            timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          };
          setSessionMessages(prev => ({
            ...prev,
            [currentSession]: [...(prev[currentSession] || []), errorMsg],
          }));
          setStreamingContent('');
          setThinkingState('idle');
          triggerNotification(`Error: ${error}`);
        }
      );

      abortRef.current = controller;
    } catch (e: any) {
      setThinkingState('idle');
      setStreamingContent('');
      triggerNotification(`Error: ${e.message}`);
    }
  };

  // Motion tokens
  const springDefault = { type: 'spring', damping: 30, stiffness: 240 };
  const springQuick = { type: 'spring', damping: 24, stiffness: 350 };

  // Build message display
  const currentMessages = sessionMessages[currentSession] || [];
  const currentTitle = sessionTitles[currentSession] || 'New Chat';
  const accentColor = themeColors.accent;

  return (
    <div className="min-h-screen bg-[#070709] text-[#ced4da] flex flex-col font-sans select-none antialiased relative overflow-hidden">
      
      {/* 1. TOP CONTROL BAR / HEADER */}
      <header className="h-14 border-b border-zinc-900 bg-[#070709] px-6 flex items-center justify-between z-20 shrink-0">
        
        {/* Left branding context */}
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-[11px]" style={{ color: accentColor }}>
            M
          </div>
          <span className="font-semibold text-xs text-white tracking-tight uppercase">Meow Core Client</span>
          <span className="h-3 w-[1px] bg-zinc-800" />
          <div className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full ${status?.apiKeyConfigured ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'} `} />
            <span className="text-[10px] text-zinc-500 font-mono">
              {status?.apiKeyConfigured ? 'Agent Active' : 'No API Key'}
            </span>
          </div>
          {/* Model badge */}
          {status?.activeModel && (
            <>
              <span className="h-3 w-[1px] bg-zinc-800" />
              <span className="text-[10px] font-mono text-zinc-500">{status.activeModel}</span>
            </>
          )}
        </div>

         {/* Dynamic Context Buttons -> Trigger Right Sheet system */}
        <div className="flex items-center gap-2">
          
          <motion.button 
            whileHover={{ scale: 1.02, backgroundColor: 'rgba(24, 24, 31, 0.8)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveSheet(activeSheet === 'cost' ? null : 'cost')}
            className={`text-xs px-2.5 py-1.5 rounded-lg font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
              activeSheet === 'cost' 
                ? 'bg-[#18181f]/60 border-zinc-700 text-white' 
                : 'bg-transparent border-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <DollarSign className="w-3.5 h-3.5 opacity-60" />
            <span>Cost</span>
          </motion.button>

          <motion.button 
            whileHover={{ scale: 1.02, backgroundColor: 'rgba(24, 24, 31, 0.8)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveSheet(activeSheet === 'context' ? null : 'context')}
            className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
              activeSheet === 'context' 
                ? 'bg-[#18181f]/60 border-zinc-700 text-white' 
                : 'bg-transparent border-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <Cpu className="w-3.5 h-3.5 opacity-60" />
            <span>Context</span>
          </motion.button>

          <motion.button 
            whileHover={{ scale: 1.02, backgroundColor: 'rgba(24, 24, 31, 0.8)' }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setActiveSheet(activeSheet === 'settings' ? null : 'settings')}
            className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
              activeSheet === 'settings' 
                ? 'bg-[#18181f]/60 border-zinc-700 text-white' 
                : 'bg-transparent border-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5 opacity-60" />
            <span>Settings</span>
          </motion.button>
        </div>
      </header>

      {/* 2. MAIN LAYOUT DECK (Left Sidebar + Center Chat Grid) */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">

        {/* CLAUDE STYLE SIDEBAR */}
        <aside className="w-64 border-r border-[#141418]/60 bg-[#070709] flex flex-col shrink-0 min-h-0 select-none">
          <div className="p-4 flex flex-col justify-between h-full">
            
            <div className="space-y-6">
              
              {/* Luxury New Chat Button */}
              <motion.button 
                whileHover={{ scale: 1.015 }}
                whileTap={{ scale: 0.985 }}
                onClick={handleCreateNewChat}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-[#111115] border border-zinc-850 hover:border-zinc-750 hover:bg-zinc-900/50 text-xs font-semibold text-zinc-100 transition shadow-soft cursor-pointer group"
              >
                <div className="flex items-center gap-2">
                  <Plus className="w-3.5 h-3.5 text-zinc-400 group-hover:text-amber-500 transition" />
                  <span>New Chat</span>
                </div>
                <span className="text-[10px] font-mono text-zinc-500 bg-zinc-950 px-1 py-0.5 border border-zinc-900 rounded select-none">⌘N</span>
              </motion.button>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-zinc-500" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search chats..."
                  className="w-full bg-zinc-950 border border-zinc-900 rounded-lg pl-7 pr-2 py-1.5 text-[10px] text-zinc-300 placeholder-zinc-600 focus:outline-none focus:border-zinc-700 transition"
                />
              </div>

              {/* Recent Chats */}
              <div className="space-y-1">
                <div className="text-[9px] uppercase font-bold tracking-widest text-zinc-500 mb-2 px-1">
                  Recent Chats
                </div>
                
                {sessions.length === 0 ? (
                  <div className="text-[10px] text-zinc-600 px-3 py-4 text-center">
                    No chats yet. Start a new one!
                  </div>
                ) : (
                  sessions.slice(0, 20).map((sess) => {
                    const title = sessionTitles[sess.id] || sess.id;
                    const isActive = currentSession === sess.id;
                    
                    return (
                      <motion.button 
                        key={sess.id}
                        whileHover={{ x: 2 }}
                        onClick={() => handleSwitchSession(sess.id)}
                        className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition text-xs cursor-pointer ${
                          isActive 
                            ? 'bg-[#111115] text-white font-medium border border-zinc-800/40' 
                            : 'text-zinc-400 hover:bg-zinc-900/20 hover:text-zinc-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 truncate">
                          <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-amber-500' : 'text-zinc-500'}`} />
                          <span className="truncate text-[11px]">{title}</span>
                        </div>
                        {isActive && (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" />
                        )}
                      </motion.button>
                    );
                  })
                )}
              </div>

              {/* System Info */}
              <div className="space-y-1">
                <div className="text-[9px] uppercase font-bold tracking-widest text-[#4f4f5a] mb-2 px-1">
                  System
                </div>
                <div className="space-y-0.5">
                  <div className="text-zinc-400 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-650" />
                    <span className="text-[10px]">
                      {status?.activeModel || 'No model'} 
                      <span className="text-zinc-600 ml-1">| {status?.lang === 'ru' ? 'RU' : 'EN'}</span>
                    </span>
                  </div>
                  <div className="text-zinc-400 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2.5">
                    <span className={`w-1.5 h-1.5 rounded-full ${status?.apiKeyConfigured ? 'bg-emerald-500' : 'bg-red-500'}`} />
                    <span className="text-[10px]">{status?.apiKeyConfigured ? 'API Connected' : 'No API Key'}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Profile settings footer section */}
            <div className="pt-3 border-t border-zinc-900 flex items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/25 flex items-center justify-center font-bold text-xs text-white">
                  A
                </div>
                <div className="truncate">
                  <div className="text-xs font-semibold text-white truncate">Administrator</div>
                  <div className="text-[10px] text-zinc-500 truncate">{config.model || 'no model'}</div>
                </div>
              </div>
              <motion.button 
                whileHover={{ rotate: 15, scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveSheet(activeSheet === 'settings' ? null : 'settings')}
                className="p-1.5 rounded-lg hover:bg-zinc-900 border border-transparent hover:border-zinc-850 text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <Settings className="w-4 h-4" />
              </motion.button>
            </div> 

          </div>
        </aside>

        {/* CENTRAL CHAT CONTAINER */}
        <section className="flex-1 flex flex-col bg-[#070709] min-w-0 relative">
          
          {/* Scrollable message deck */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
            <div className="max-w-2xl mx-auto space-y-6">

              {/* Threads rendered with premium motion choreography */}
              {currentMessages.map((msg) => {
                const isUser = msg.role === 'user';
                
                // If it is regular chat bubble
                if (!msg.isAutopilotCard) {
                  return (
                    <motion.div 
                      key={msg.id} 
                      initial={
                        isUser 
                          ? { opacity: 0, y: 12 } 
                          : { opacity: 0, y: 8, filter: 'blur(6px)' }
                      }
                      animate={{ 
                        opacity: 1, 
                        y: 0, 
                        filter: 'blur(0px)'
                      }}
                      transition={{ 
                        duration: 0.55, 
                        ease: [0.16, 1, 0.3, 1]
                      }}
                      className="group/bubble flex gap-4 justify-start"
                    >
                      
                      {/* Avatar */}
                      {!isUser && (
                        <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                          <Sparkles className="w-4 h-4 text-amber-500" />
                        </div>
                      )}

                      {/* Content block */}
                      <div className={`flex-1 min-w-0 ${isUser ? 'pl-12' : 'pr-12'}`}>
                        <div className={`rounded-xl p-4 text-xs leading-relaxed border ${
                          isUser 
                            ? 'bg-[#111115] border-zinc-800 text-white shadow-soft ml-auto max-w-lg' 
                            : 'bg-transparent border-transparent text-zinc-200'
                        }`}>
                          
                          {/* Bubble Metadata */}
                          <div className="flex items-center gap-2 mb-2">
                            <span className="font-semibold text-xs text-white">
                              {isUser ? 'You' : 'Agent'}
                            </span>
                            <span className="text-[10px] text-zinc-500 font-mono">
                              {msg.timestamp}
                            </span>
                          </div>

                          <div className="font-sans whitespace-pre-wrap selection:bg-zinc-850">
                            {msg.content}
                          </div>
                        </div>
                      </div>

                    </motion.div>
                  );
                }

                // Autopilot Card
                return (
                  <motion.div 
                    key={msg.id} 
                    initial={{ opacity: 0, y: 12, scale: 0.97 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                    className="flex gap-4 justify-start"
                  >
                    
                    <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                      <Cpu className="w-4 h-4 text-[#ff7043]" />
                    </div>

                    <div className="flex-1 max-w-md bg-[#0d0d11] border border-zinc-850 rounded-xl p-4 shadow-soft">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <span className="text-[9px] uppercase tracking-widest font-mono text-zinc-500 font-semibold flex items-center gap-1.5">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            <span>Autopilot executing</span>
                          </span>
                          <h4 className="text-xs font-semibold text-white">{msg.autopilotTitle}</h4>
                          <span className="text-[10px] text-zinc-400 font-mono">
                            {msg.autopilotStep} (Status: {autopilotPaused ? 'Paused' : 'Running'})
                          </span>
                        </div>

                        {/* Tiny pause button */}
                        <button 
                          onClick={() => {
                            setAutopilotPaused(!autopilotPaused);
                            triggerNotification(autopilotPaused ? "Autopilot sequence resumed." : "Autopilot sequence paused.");
                          }}
                          className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-805 text-zinc-300 font-medium text-[10px] rounded transition cursor-pointer flex items-center gap-1"
                        >
                          {autopilotPaused ? <Play className="w-2.5 h-2.5 text-emerald-500" /> : <Pause className="w-2.5 h-2.5" />}
                          <span>{autopilotPaused ? 'Resume' : 'Pause'}</span>
                        </button>
                      </div>

                      {/* Toggle Checklist */}
                      <div className="mt-3.5 pt-3 border-t border-zinc-900">
                        <button 
                          onClick={() => setPlanExpandedId(planExpandedId === msg.id ? null : msg.id)}
                          className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-300 transition flex items-center gap-1 cursor-pointer"
                        >
                          <span>View Plan</span>
                          <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-300 ${planExpandedId === msg.id ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                          {planExpandedId === msg.id && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0 }}
                              animate={{ height: 'auto', opacity: 1, marginTop: 8 }}
                              exit={{ height: 0, opacity: 0 }}
                              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                              className="overflow-hidden space-y-1.5"
                            >
                              {[
                                { label: 'Analyze requirements', status: 'completed' },
                                { label: 'Implement changes', status: 'pending' },
                                { label: 'Run validation', status: 'pending' },
                                { label: 'Verify results', status: 'pending' },
                              ].map((step, idx) => (
                                <motion.div 
                                  key={idx}
                                  initial={{ opacity: 0, x: -6 }}
                                  animate={{ opacity: 1, x: 0 }}
                                  transition={{ delay: idx * 0.04, duration: 0.35 }}
                                  className="flex items-center gap-2 text-xs py-0.5 pl-1 text-zinc-400"
                                >
                                  {step.status === 'completed' ? (
                                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                                  ) : (
                                    <div className="w-3.5 h-3.5 rounded-full border border-zinc-700 shrink-0" />
                                  )}
                                  <span className={step.status === 'completed' ? 'line-through text-zinc-650 font-normal' : 'text-zinc-300 font-medium'}>
                                    {step.label}
                                  </span>
                                </motion.div>
                              ))}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </div>

                  </motion.div>
                );
              })}

              {/* Streaming content bubble */}
              <AnimatePresence>
                {streamingContent && (
                  <motion.div 
                    initial={{ opacity: 0, y: 8, filter: 'blur(6px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className="flex gap-4 justify-start"
                  >
                    <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0 pr-12">
                      <div className="rounded-xl p-4 text-xs leading-relaxed border bg-transparent border-transparent text-zinc-200">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-semibold text-xs text-white">Agent</span>
                          <span className="text-[10px] text-zinc-500 font-mono">streaming...</span>
                        </div>
                        <div className="font-sans whitespace-pre-wrap selection:bg-zinc-850">
                          {streamingContent}
                          <span className="inline-block w-1.5 h-4 bg-amber-500/60 ml-0.5 animate-pulse rounded-sm" />
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* CLAUDE SHIMMER THINKING BUBBLE */}
              <AnimatePresence>
                {thinkingState === 'thinking' && !streamingContent && (
                  <motion.div 
                    initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
                    transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                    className="flex gap-4 justify-start"
                  >
                    <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-zinc-500" />
                    </div>
                    
                    <div className="flex-1 max-w-md bg-[#0d0d11]/40 border border-zinc-900 rounded-xl p-4 space-y-2">
                      <div className="text-xs font-semibold text-zinc-400">
                        <span className="text-shimmer">Thinking...</span>
                      </div>
                      <div className="h-2 bg-zinc-900 rounded w-11/12 animate-pulse" />
                      <div className="h-2 bg-zinc-900 rounded w-8/12 animate-pulse" />
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* COMPOSER FIELD AT BOTTOM */}
          <div className="p-6 border-t border-[#141418]/60 bg-[#070709] shrink-0">
            <div className="max-w-2xl mx-auto w-full">
              <form 
                onSubmit={handleComposerSubmit} 
                className="bg-zinc-900 border border-zinc-850 rounded-xl p-3 focus-within:border-zinc-700/80 transition duration-300 shadow-soft"
              >
                <textarea
                  rows={2}
                  value={composerVal}
                  onChange={(e) => setComposerVal(e.target.value)}
                  placeholder={getComposerPlaceholder()}
                  className="w-full bg-transparent border-0 text-xs text-white placeholder-zinc-500 focus:ring-0 focus:outline-none resize-none px-2 py-1 leading-relaxed"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleComposerSubmit(e);
                    }
                  }}
                  disabled={!status?.apiKeyConfigured}
                />
                
                <div className="flex items-center justify-between border-t border-zinc-950/40 pt-2 px-2 mt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900">
                      Enter
                    </span>
                    <span className="text-[10px] text-zinc-500">to send message</span>
                    {!status?.apiKeyConfigured && (
                      <span className="text-[10px] text-red-400 flex items-center gap-1">
                        <Key className="w-3 h-3" />
                        Set API key in Settings
                      </span>
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={thinkingState !== 'idle' || !composerVal.trim() || !status?.apiKeyConfigured}
                    className="bg-zinc-100 hover:bg-white text-zinc-950 disabled:opacity-20 font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                  >
                    {thinkingState !== 'idle' ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Thinking...</span>
                      </>
                    ) : (
                      <>
                        <span>Send Message</span>
                        <ArrowUpRight className="w-3 h-3" />
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>

        </section>

        {/* 3. RIGHT SHEET SYSTEM */}
        <AnimatePresence>
          {activeSheet && (
            <>
              {/* Overlay background */}
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 0.35 }}
                exit={{ opacity: 0 }}
                onClick={() => setActiveSheet(null)}
                className="fixed inset-0 bg-black/50 z-30 cursor-pointer"
              />

              {/* Sliding sheet container */}
              <motion.aside 
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                className="fixed right-0 top-0 bottom-0 w-full sm:w-[480px] bg-[#09090c] border-l border-zinc-900 shadow-soft z-40 flex flex-col overflow-hidden"
              >
                {/* ── SETTINGS SHEET ── */}
                {activeSheet === 'settings' && (
                  <SettingsPanel 
                    onClose={() => setActiveSheet(null)} 
                    onConfigChange={refreshConfig}
                  />
                )}

                {/* ── COST SHEET ── */}
                {activeSheet === 'cost' && (
                  <>
                    <div className="px-5 py-4 border-b border-zinc-900 bg-[#070709] flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <h4 className="font-semibold text-xs tracking-wider uppercase text-white">Cost & Usage</h4>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button 
                          onClick={async () => {
                            const fresh = await api.getCost().catch(() => null);
                            if (fresh) setCost(fresh);
                          }}
                          className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition cursor-pointer"
                        >
                          <RefreshCw className="w-3.5 h-3.5" />
                        </button>
                        <button 
                          onClick={() => setActiveSheet(null)}
                          className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                      {/* Session Cost */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-emerald-500 font-bold">Session Usage</div>
                        <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-xl space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">Requests</span>
                            <span className="text-zinc-200 font-mono">{cost?.session?.requests || 0}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">Input tokens</span>
                            <span className="text-zinc-200 font-mono">{(cost?.session?.input_tokens || 0).toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">Output tokens</span>
                            <span className="text-zinc-200 font-mono">{(cost?.session?.output_tokens || 0).toLocaleString()}</span>
                          </div>
                          <div className="border-t border-zinc-800 pt-2 flex justify-between text-xs">
                            <span className="text-zinc-400 font-semibold">Estimated cost</span>
                            <span className="text-amber-400 font-mono font-bold">${(cost?.session?.total_usd || 0).toFixed(4)}</span>
                          </div>
                        </div>
                      </div>

                      {/* Total Cost */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">All Time</div>
                        <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-xl space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">Requests</span>
                            <span className="text-zinc-200 font-mono">{cost?.total?.requests || 0}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">Total tokens</span>
                            <span className="text-zinc-200 font-mono">{((cost?.total?.input_tokens || 0) + (cost?.total?.output_tokens || 0)).toLocaleString()}</span>
                          </div>
                          <div className="border-t border-zinc-800 pt-2 flex justify-between text-xs">
                            <span className="text-zinc-400 font-semibold">Total cost</span>
                            <span className="text-amber-400 font-mono font-bold">${(cost?.total?.total_usd || 0).toFixed(4)}</span>
                          </div>
                          {cost?.total?.since && (
                            <div className="flex justify-between text-[10px]">
                              <span className="text-zinc-600">Since</span>
                              <span className="text-zinc-500 font-mono">{new Date(cost.total.since).toLocaleDateString()}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Recent History */}
                      {cost?.history && cost.history.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Recent Requests</div>
                          <div className="space-y-1">
                            {[...cost.history].reverse().slice(0, 10).map((entry: any, i: number) => (
                              <div key={i} className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg text-[10px] font-mono">
                                <div className="flex justify-between text-zinc-400">
                                  <span className="text-zinc-500">{entry.model}</span>
                                  <span className="text-zinc-600">{new Date(entry.time).toLocaleTimeString()}</span>
                                </div>
                                <div className="flex justify-between text-zinc-500 mt-1">
                                  <span>{entry.input_tokens}→{entry.output_tokens} tok</span>
                                  <span className={entry.cost_usd > 0.01 ? 'text-amber-500' : 'text-zinc-500'}>
                                    ${entry.cost_usd.toFixed(4)}
                                  </span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Model Prices */}
                      {cost?.modelPrices && (
                        <div className="space-y-2">
                          <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Model Pricing ($/1M tok)</div>
                          <div className="grid grid-cols-1 gap-1">
                            {Object.entries(cost.modelPrices).filter(([k]) => !k.startsWith('_')).slice(0, 8).map(([model, price]: [string, any]) => (
                              <div key={model} className="flex justify-between px-3 py-1.5 bg-zinc-950 border border-zinc-900 rounded-lg text-[10px] font-mono text-zinc-400">
                                <span>{model}</span>
                                <span className="text-zinc-500">${price.input}/$ {price.output}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <button 
                        onClick={async () => {
                          await api.resetCost();
                          const fresh = await api.getCost();
                          setCost(fresh);
                          triggerNotification('Cost tracking reset');
                        }}
                        className="w-full p-2.5 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 rounded-xl text-xs text-zinc-400 hover:text-white transition cursor-pointer flex items-center justify-center gap-2"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset Cost Tracking
                      </button>
                    </div>
                  </>
                )}

                {/* ── CONTEXT SHEET ── */}
                {activeSheet === 'context' && (
                  <>
                    <div className="px-5 py-4 border-b border-zinc-900 bg-[#070709] flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#ff7043]" />
                        <h4 className="font-semibold text-xs tracking-wider uppercase text-white">System Context</h4>
                      </div>
                      <button 
                        onClick={() => setActiveSheet(null)}
                        className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                      
                      {/* System Prompt */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-[#ff7043] font-bold">Active Profile</div>
                        <div className="p-3.5 bg-zinc-950 border border-zinc-900 rounded-xl">
                          <div className="text-xs text-zinc-300 font-semibold mb-1 capitalize">
                            {config.profile || 'default'}
                          </div>
                          <div className="font-mono text-[10px] text-zinc-400 leading-relaxed max-h-32 overflow-y-auto">
                            {config.profiles?.[config.profile || 'default']?.system || 
                             (config.lang === 'ru'
                               ? 'Ты — опытный инженер-программист. Твои ответы кратки, точны и по существу.'
                               : 'You are an experienced software engineer. Your answers are concise, accurate, and to the point.')}
                          </div>
                        </div>
                      </div>

                      {/* Active Config */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Active Configuration</div>
                        <div className="p-3.5 bg-zinc-950 border border-zinc-900 rounded-xl space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">Model</span>
                            <span className="text-zinc-300 font-mono">{config.model || '—'}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">API Base</span>
                            <span className="text-zinc-300 font-mono text-[10px]">{config.api_base || '—'}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">Temperature</span>
                            <span className="text-zinc-300 font-mono">{config.profiles?.[config.profile || 'default']?.temperature || '0.2'}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">Theme</span>
                            <span className="text-zinc-300 font-mono capitalize">{config.theme || 'default'}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-zinc-500">Language</span>
                            <span className="text-zinc-300 font-mono">{config.lang === 'ru' ? 'Русский' : 'English'}</span>
                          </div>
                        </div>
                      </div>

                      {/* Status */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">System Status</div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="p-3 bg-zinc-950 border border-zinc-900 rounded-xl">
                            <div className="text-[9px] uppercase text-zinc-600 font-bold mb-1">API Key</div>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${status?.apiKeyConfigured ? 'bg-emerald-500' : 'bg-red-500'}`} />
                              <span className="text-xs text-zinc-300">{status?.apiKeyConfigured ? 'Configured' : 'Missing'}</span>
                            </div>
                          </div>
                          <div className="p-3 bg-zinc-950 border border-zinc-900 rounded-xl">
                            <div className="text-[9px] uppercase text-zinc-600 font-bold mb-1">Sessions</div>
                            <span className="text-xs text-zinc-300">{status?.sessionsCount || 0} saved</span>
                          </div>
                        </div>
                      </div>

                      {/* Profile Info */}
                      <div className="space-y-1">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Available Profiles</div>
                        {Object.keys(config.profiles || {}).length > 0 ? (
                          Object.entries(config.profiles as Record<string, any>).map(([name, prof]) => (
                            <div key={name} className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg text-xs flex items-center justify-between">
                              <span className="text-zinc-300 capitalize">{name}</span>
                              <span className="text-zinc-500 text-[10px]">
                                t={prof.temperature || '0.2'}
                              </span>
                            </div>
                          ))
                        ) : (
                          <div className="text-[10px] text-zinc-600 px-1">No custom profiles</div>
                        )}
                      </div>
                    </div>
                  </>
                )}

                {/* ── CHANGES SHEET ── */}
                {activeSheet === 'changes' && (
                  <>
                    <div className="px-5 py-4 border-b border-zinc-900 bg-[#070709] flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-emerald-500" />
                        <h4 className="font-semibold text-xs tracking-wider uppercase text-white">Diff Review</h4>
                      </div>
                      <button 
                        onClick={() => setActiveSheet(null)}
                        className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-5 space-y-4">
                      <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-xl space-y-1">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono font-bold">Staged Changesets</span>
                        <p className="text-xs text-zinc-350 font-medium">Branch: feature/current</p>
                      </div>

                      <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-3.5 space-y-3">
                        <div className="text-[10px] uppercase font-bold text-zinc-550">File System Modifications</div>
                        <div className="flex items-center justify-between text-xs py-1 text-zinc-300">
                          <span className="font-mono">src/core/autopilot.ts</span>
                          <span className="font-mono text-[10px] text-emerald-500">+18 -7 lines</span>
                        </div>
                        <div className="flex items-center justify-between text-xs py-1 text-zinc-300">
                          <span className="font-mono">package.json</span>
                          <span className="font-mono text-[10px] text-emerald-500">+3 -0 lines</span>
                        </div>
                      </div>

                      <div className="rounded-xl border border-zinc-900 bg-zinc-950 overflow-hidden font-mono text-[11px] leading-relaxed">
                        <div className="px-3 py-2 bg-zinc-900/60 border-b border-zinc-900 text-zinc-400 text-[10px] flex justify-between">
                          <span>diff --git a/src/core/autopilot.ts</span>
                          <span className="text-emerald-500">Proposed</span>
                        </div>
                        <div className="p-4 space-y-2 select-text overflow-x-auto">
                          <div className="bg-red-950/20 text-red-400 p-2 border-l border-red-800 rounded">
                            <span className="text-red-600 font-bold select-none mr-2">-</span>
                            <span>const data = fs.readFileSync(path, 'utf8');</span>
                          </div>
                          <div className="bg-emerald-950/20 text-emerald-400 p-2 border-l border-emerald-600 rounded">
                            <span className="text-emerald-500 font-bold select-none mr-2">+</span>
                            <span>const data = await fs.promises.readFile(path, 'utf8');</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* ── ACTION DETAIL SHEET ── */}
                {activeSheet === 'action-detail' && selectedActionDetail && (
                  <>
                    <div className="px-5 py-4 border-b border-zinc-900 bg-[#070709] flex items-center justify-between shrink-0">
                      <div className="flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-[#ff7043]" />
                        <h4 className="font-semibold text-xs tracking-wider uppercase text-white">Action Details</h4>
                      </div>
                      <button 
                        onClick={() => setActiveSheet(null)}
                        className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition cursor-pointer"
                      >
                        ✕
                      </button>
                    </div>
                    
                    <div className="flex-1 overflow-y-auto p-5 space-y-6">
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-white">{selectedActionDetail.title}</h3>
                        <span className="text-[10px] text-zinc-550 uppercase tracking-widest font-mono">Detailed Action Record</span>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-[#ff7043] font-bold">Action Summary</div>
                        <div className="p-4 bg-zinc-950 border border-zinc-900 rounded-xl space-y-2 text-xs">
                          {selectedActionDetail.summary.map((sum, idx) => (
                            <div key={idx} className="flex gap-2 text-zinc-300 leading-relaxed">
                              <span className="text-[#ff7043] font-bold select-none">•</span>
                              <span>{sum}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Files Impacted</div>
                        <div className="space-y-1.5">
                          {selectedActionDetail.files.map((file, idx) => (
                            <div key={idx} className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-xl font-mono text-xs text-zinc-300 flex items-center gap-2">
                              <FileText className="w-3.5 h-3.5 text-zinc-600" />
                              <span>{file}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Associated Tool Actions</div>
                        <div className="space-y-2">
                          {selectedActionDetail.tools.map((tName, idx) => (
                            <div key={idx} className="rounded-xl border border-zinc-905 overflow-hidden text-xs font-mono">
                              <div className="p-2.5 bg-zinc-900 border-b border-zinc-905 flex items-center justify-between">
                                <span className="text-zinc-300">{tName}</span>
                                <span className="text-[9px] text-[#ff7043] font-bold select-none">Executed</span>
                              </div>
                              <div className="p-3 bg-zinc-950 text-zinc-500 text-[10px]">
                                Command executed successfully in local environment.
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}

              </motion.aside>
            </>
          )}
        </AnimatePresence>

      </div>

      {/* 4. PREMIUM FLOATING TOAST NOTIFICATION */}
      <AnimatePresence>
        {showNotification && (
          <motion.div
            key={`notif-${Date.now()}`}
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ type: 'spring', damping: 24, stiffness: 300 }}
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 bg-zinc-900/90 backdrop-blur-sm border border-zinc-800/60 rounded-xl px-5 py-2.5 shadow-2xl flex items-center gap-2.5 text-xs text-zinc-200"
          >
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500" />
            <span>{showNotification}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

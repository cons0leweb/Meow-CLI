import React, { useState, useEffect, useRef } from 'react';
import { 
  Play, Pause, Check, Sparkles, X, User, Cpu, GitBranch, 
  HelpCircle, ChevronRight, CheckCircle2, ChevronDown, ListTodo, FileCode, Search,
  MessageSquare, Plus, Settings, Eye, FileText, Terminal, ArrowUpRight, Code, Shield, RotateCcw
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

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
  const [currentSession, setCurrentSession] = useState<string>('crud-create');
  
  // Right sheet system keys: 'changes', 'context', 'action-detail', null
  const [activeSheet, setActiveSheet] = useState<'changes' | 'context' | 'action-detail' | null>(null);
  const [selectedActionDetail, setSelectedActionDetail] = useState<ActionDetail | null>(null);

  // Simulated global states
  const [composerVal, setComposerVal] = useState<string>('');
  const [thinkingState, setThinkingState] = useState<'idle' | 'thinking' | 'streaming'>('idle');
  const [showNotification, setShowNotification] = useState<string | null>(null);

  // Collapsed plan checklists in list
  const [autopilotPaused, setAutopilotPaused] = useState<boolean>(false);
  const [planExpandedId, setPlanExpandedId] = useState<string | null>(null);
  const [workedExpandedId, setWorkedExpandedId] = useState<string | null>(null);

  // Search context
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Autoapprove state
  const [autoApproveActive, setAutoApproveActive] = useState<boolean>(false);

  // Active threads state dictionary for the three core scenes
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({
    'crud-create': [
      {
        id: 'c1',
        role: 'user',
        content: 'Create CRUD for users',
        timestamp: '19:40:02'
      },
      {
        id: 'c2',
        role: 'assistant',
        content: `I'll create a CRUD implementation for users. I am going to inspect existing schemas in the schema directory, patch the active user.ts entity, and execute a local database migration test suite to verify consistency limits.`,
        timestamp: '19:40:05',
        actions: [
          { title: 'Edited app.tsx', sheetKey: 'edited-app' },
          { title: 'Read users.ts', sheetKey: 'read-users' },
          { title: 'Ran migration tests', sheetKey: 'ran-tests' }
        ]
      }
    ],
    'auth-debug': [
      {
        id: 'd1',
        role: 'user',
        content: 'Identify lock issues with concurrency caches',
        timestamp: '19:41:12'
      },
      {
        id: 'd2',
        role: 'assistant',
        content: `I have isolated three blocking file synchronous calls inside \`src/core/autopilot.ts\`. I am replacing standard synchronous fs files operations with an asynchronous LRU cache wrap secured by a clean mutex locking primitive.`,
        timestamp: '19:41:18',
        actions: [
          { title: 'Patched autopilot.ts', sheetKey: 'patched-autopilot' },
          { title: 'Configured async Lock system', sheetKey: 'async-lock' }
        ]
      }
    ],
    'auth-refactor': [
      {
        id: 'p1',
        role: 'user',
        content: 'Refactor auth middleware caching sequence',
        timestamp: '19:43:00'
      },
      {
        id: 'p2',
        role: 'assistant',
        content: 'Autopilot sequence initiated for auth middleware caching parameter adjustment.',
        timestamp: '19:43:02',
        isAutopilotCard: true,
        autopilotTitle: 'Refactor auth middleware',
        autopilotStep: 'Step 2 of 5',
        autopilotTotalSteps: 5,
        autopilotStatus: 'running'
      }
    ]
  });

  // Action detail dictionary mapping for Right Sheet renders
  const actionDetailMap: Record<string, ActionDetail> = {
    'edited-app': {
      title: 'Edited app.tsx',
      summary: [
        'Added express router initialization for /api/v1/users',
        'Registered body-parser schema validator middleware',
        'Injected error middleware handling for duplicate database records'
      ],
      files: ['src/App.tsx', 'src/server.ts'],
      tools: ['patch_file', 'lint_applet']
    },
    'read-users': {
      title: 'Read users.ts',
      summary: [
        'Inspected relational schemas defined inside schema directory',
        'Found and validated Type constraints for UserPayload attributes',
        'Isolated database stream query indexes to align speed constraints'
      ],
      files: ['src/core/users.ts'],
      tools: ['view_file', 'grep']
    },
    'ran-tests': {
      title: 'Ran migration tests',
      summary: [
        'Spawned child process validator running local DB mocks',
        'All 14 integration test scripts finished successfully',
        'Zero schema migration overlap detected under stress parameter checks'
      ],
      files: ['tests/migration.spec.ts'],
      tools: ['run_shell', 'compile_applet']
    },
    'patched-autopilot': {
      title: 'Patched autopilot.ts',
      summary: [
        'Replaced fs.readFileSync with async fs.promises.readFile',
        'Eliminated active main single loop blocking spikes under concurrent stress cycles',
        'Optimized critical throughput path'
      ],
      files: ['src/core/autopilot.ts'],
      tools: ['patch_file']
    },
    'async-lock': {
      title: 'Configured async Lock system',
      summary: [
        'Introduced non-blocking atomic Mutex queue primitive',
        'Prevented duplicate write overlaps when concurrent sessions execute together',
        'Verified lock lifecycle release timeout intervals'
      ],
      files: ['src/core/locks.ts'],
      tools: ['create_file', 'run_shell']
    }
  };

  // Helper notice notification
  const triggerNotification = (msg: string) => {
    setShowNotification(msg);
    setTimeout(() => {
      setShowNotification(null);
    }, 3500);
  };

  // Motion specifications tokens for premium feel
  const springDefault = { type: 'spring', damping: 30, stiffness: 240 };
  const springQuick = { type: 'spring', damping: 24, stiffness: 350 };
  const cubicEaseApple = [0.16, 1, 0.3, 1]; // [duration handles are embedded automatically]

  // Handle composer submissions
  const handleComposerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!composerVal.trim()) return;

    const typedMsg = composerVal;
    
    // 1. Post user message instantly
    const userMsg: ChatMessage = {
      id: `m-usr-${Date.now()}`,
      role: 'user',
      content: typedMsg,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    };

    setThreads(prev => ({
      ...prev,
      [currentSession]: [...(prev[currentSession] || []), userMsg]
    }));
    setComposerVal('');
    setThinkingState('thinking');

    // 2. Beautiful Claude Desktop style Shimmer Thinking timing
    setTimeout(() => {
      setThinkingState('streaming');

      // 3. Apple/Claude style Blur-up enter flow
      setTimeout(() => {
        // Detect if user is talking about autopilot to auto-initiate a small card
        const isAutopilotRequest = typedMsg.toLowerCase().includes('autopilot') || typedMsg.toLowerCase().includes('refactor');
        
        const assistantResult: ChatMessage = isAutopilotRequest ? {
          id: `m-asst-${Date.now()}`,
          role: 'assistant',
          content: 'I have started Autopilot to address your caching request.',
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          isAutopilotCard: true,
          autopilotTitle: typedMsg,
          autopilotStep: 'Step 1 of 4',
          autopilotTotalSteps: 4,
          autopilotStatus: 'running'
        } : {
          id: `m-asst-${Date.now()}`,
          role: 'assistant',
          content: `I have thoroughly updated components matching: "${typedMsg}". Standard local validations were resolved smoothly, ensuring clean runtime conditions.`,
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          actions: [
            { title: 'Edited app.tsx', sheetKey: 'edited-app' },
            { title: 'Ran integration suite', sheetKey: 'ran-tests' }
          ]
        };

        setThreads(prev => ({
          ...prev,
          [currentSession]: [...(prev[currentSession] || []), assistantResult]
        }));
        setThinkingState('idle');
        triggerNotification("Response received completely.");
      }, 1500);

    }, 2000);
  };

  const handleCreateNewChat = () => {
    const newSessionId = `custom-chat-${Date.now()}`;
    setThreads(prev => ({
      ...prev,
      [newSessionId]: [
        {
          id: 'init-one',
          role: 'assistant',
          content: 'Hello. I am connected and ready. Instruct Autopilot on specific code modifications or query workspace parameters.',
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
        }
      ]
    }));
    setCurrentSession(newSessionId);
    triggerNotification("New chat context initialized.");
  };

  // Pre-configured planned steps for Scenario 3
  const preConfiguredPlanSteps = [
    { label: 'Inspect middleware files', status: 'completed' },
    { label: 'Patch authorization token verify blocks', status: 'completed' },
    { label: 'Run validation test suite', status: 'pending' },
    { label: 'Verify cache locks in local environment', status: 'pending' }
  ];

  return (
    <div className="min-h-screen bg-[#070709] text-[#ced4da] flex flex-col font-sans select-none antialiased relative overflow-hidden">
      
      {/* 1. TOP CONTROL BAR / HEADER */}
      <header className="h-14 border-b border-zinc-900 bg-[#070709] px-6 flex items-center justify-between z-20 shrink-0">
        
        {/* Left branding context */}
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center font-bold text-[11px] text-[#ff7043]">
            M
          </div>
          <span className="font-semibold text-xs text-white tracking-tight uppercase">Meow Core Client</span>
          <span className="h-3 w-[1px] bg-zinc-800" />
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] text-zinc-500 font-mono">Agent Active</span>
          </div>
        </div>

         {/* Dynamic Context Buttons -> Trigger Right Sheet system */}
        <div className="flex items-center gap-2">
          
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
            onClick={() => setActiveSheet(activeSheet === 'changes' ? null : 'changes')}
            className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
              activeSheet === 'changes' 
                ? 'bg-[#18181f]/60 border-zinc-700 text-white' 
                : 'bg-transparent border-zinc-900 text-zinc-400 hover:text-white'
            }`}
          >
            <Code className="w-3.5 h-3.5 opacity-60" />
            <span>Changes</span>
          </motion.button>
        </div>
      </header>

      {/* 2. MAIN LAYOUT DECK (Left Sidebar + Center Chat Grid) */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">

        {/* CLAUDE STYLE SIDEBAR */}
        <aside className="w-64 border-r border-[#141418]/60 bg-[#070709] flex flex-col shrink-0 min-h-0 select-none">
          <div className="p-4 flex flex-col justify-between h-full">
            
            <div className="space-y-6">
              
              {/* Luxury Claude New Chat Button */}
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

              {/* Recent Chats */}
              <div className="space-y-1">
                <div className="text-[9px] uppercase font-bold tracking-widest text-zinc-500 mb-2 px-1">
                  Recent Chats
                </div>
                
                <motion.button 
                  whileHover={{ x: 2 }}
                  onClick={() => {
                    setCurrentSession('crud-create');
                    triggerNotification("Switched to Users CRUD context.");
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition text-xs cursor-pointer ${
                    currentSession === 'crud-create' 
                      ? 'bg-[#111115] text-white font-medium border border-zinc-800/40' 
                      : 'text-zinc-400 hover:bg-zinc-900/20 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <MessageSquare className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                    <span className="truncate">Create CRUD for users</span>
                  </div>
                </motion.button>

                <motion.button 
                  whileHover={{ x: 2 }}
                  onClick={() => {
                    setCurrentSession('auth-debug');
                    triggerNotification("Switched to Cache Lock debug sequence.");
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition text-xs cursor-pointer ${
                    currentSession === 'auth-debug' 
                      ? 'bg-[#111115] text-white font-medium border border-zinc-800/40' 
                      : 'text-zinc-400 hover:bg-zinc-900/20 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <MessageSquare className="w-3.5 h-3.5 text-cyan-500 shrink-0" />
                    <span className="truncate">Identify cache locks</span>
                  </div>
                </motion.button>

                <motion.button 
                  whileHover={{ x: 2 }}
                  onClick={() => {
                    setCurrentSession('auth-refactor');
                    triggerNotification("Switched to Auth Middleware refactoring stream.");
                  }}
                  className={`w-full text-left px-3 py-2 rounded-xl flex items-center justify-between transition text-xs cursor-pointer ${
                    currentSession === 'auth-refactor' 
                      ? 'bg-[#111115] text-white font-medium border border-zinc-800/40' 
                      : 'text-zinc-400 hover:bg-zinc-900/20 hover:text-zinc-200'
                  }`}
                >
                  <div className="flex items-center gap-2 truncate">
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-505 shrink-0" />
                    <span className="truncate">Refactor auth middleware</span>
                  </div>
                </motion.button>
              </div>

              {/* Projects */}
              <div className="space-y-1">
                <div className="text-[9px] uppercase font-bold tracking-widest text-[#4f4f5a] mb-2 px-1">
                  Projects
                </div>
                <div className="space-y-0.5">
                  <motion.div 
                    whileHover={{ x: 2 }}
                    className="text-zinc-400 hover:text-zinc-200 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2.5 cursor-pointer transition"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-650" />
                    <span>Core Daemon</span>
                  </motion.div>
                  <motion.div 
                    whileHover={{ x: 2 }}
                    className="text-zinc-400 hover:text-zinc-200 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2.5 cursor-pointer transition"
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-zinc-650" />
                    <span>Mobile Interface</span>
                  </motion.div>
                </div>
              </div>

              {/* Assistants */}
              <div className="space-y-1">
                <div className="text-[9px] uppercase font-bold tracking-widest text-[#4f4f5a] mb-2 px-1">
                  Assistants
                </div>
                <div className="space-y-0.5">
                  <motion.div 
                    whileHover={{ x: 2 }}
                    className="text-zinc-400 hover:text-zinc-200 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2.5 cursor-pointer transition"
                  >
                    <span className="text-sm">🤖</span>
                    <span>Autopilot Architect</span>
                  </motion.div>
                  <motion.div 
                    whileHover={{ x: 2 }}
                    className="text-zinc-400 hover:text-zinc-200 text-xs px-3 py-1.5 rounded-lg flex items-center gap-2.5 cursor-pointer transition"
                  >
                    <span className="text-sm">⚙</span>
                    <span>Spec Validator</span>
                  </motion.div>
                </div>
              </div>

            </div>

            {/* Profile settings footer section */}
            <div className="pt-3 border-t border-zinc-900 flex items-center justify-between">
              <div className="flex items-center gap-2 truncate">
                <div className="w-7 h-7 rounded-full bg-[#ff7043]/15 border border-[#ff7043]/25 flex items-center justify-center font-bold text-xs text-white">
                  A
                </div>
                <div className="truncate">
                  <div className="text-xs font-semibold text-white truncate">Administrator</div>
                  <div className="text-[10px] text-zinc-500 truncate">active-user@domain</div>
                </div>
              </div>
              <motion.button 
                whileHover={{ rotate: 15, scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => {
                  setActiveSheet(activeSheet === 'context' ? null : 'context');
                  triggerNotification("Accessing system parameters.");
                }} 
                className="p-1.5 rounded-lg hover:bg-zinc-900 border border-transparent hover:border-zinc-850 text-zinc-400 hover:text-white transition cursor-pointer"
              >
                <Settings className="w-4 h-4" />
              </motion.button>
            </div> 

          </div>
        </aside>

        {/* CENTRAL CHAT CONTAINER (No metric-dashboards, pure chat experience) */}
        <section className="flex-1 flex flex-col bg-[#070709] min-w-0 relative">
          
          {/* Scrollable message deck */}
          <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
            <div className="max-w-2xl mx-auto space-y-6">

              {/* Threads rendered with premium motion choreography */}
              {(threads[currentSession] || []).map((msg) => {
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
                        ease: [0.16, 1, 0.3, 1] // Apple Standard Ease Out
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

                        {/* COMPACT ACTIVITY ROW (Scenario 2) */}
                        {!isUser && msg.actions && msg.actions.length > 0 && (
                          <div className="mt-2.5 pl-4">
                            <button 
                              onClick={() => setWorkedExpandedId(workedExpandedId === msg.id ? null : msg.id)}
                              className="text-xs text-zinc-450 hover:text-white flex items-center gap-1.5 transition cursor-pointer"
                            >
                              <span>⚙ Worked ({msg.actions.length} actions)</span>
                              <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${workedExpandedId === msg.id ? 'rotate-180' : ''}`} />
                            </button>

                            {/* Collapsible Action list (Zero logs/JSON noise) */}
                            <AnimatePresence>
                              {workedExpandedId === msg.id && (
                                <motion.div 
                                  initial={{ height: 0, opacity: 0, scale: 0.98 }}
                                  animate={{ height: 'auto', opacity: 1, scale: 1, marginTop: 10 }}
                                  exit={{ height: 0, opacity: 0, scale: 0.98 }}
                                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                                  className="overflow-hidden bg-[#0d0d11]/80 rounded-xl border border-zinc-900/80 p-2 max-w-md space-y-1"
                                >
                                  {msg.actions.map((act, idx) => (
                                    <motion.div 
                                      key={idx}
                                      initial={{ opacity: 0, x: -4 }}
                                      animate={{ opacity: 1, x: 0 }}
                                      transition={{ delay: idx * 0.05, duration: 0.3 }}
                                      className="flex items-center justify-between px-3 py-1.5 rounded-lg hover:bg-zinc-900 text-xs transition transition duration-150"
                                    >
                                      <span className="text-zinc-300">{act.title}</span>
                                      
                                      <button 
                                        onClick={() => {
                                          const details = actionDetailMap[act.sheetKey];
                                          if (details) {
                                            setSelectedActionDetail(details);
                                            setActiveSheet('action-detail');
                                            triggerNotification(`Pulled ${act.title} detail log representation`);
                                          }
                                        }}
                                        className="text-zinc-500 hover:text-amber-500 flex items-center gap-0.5 transition cursor-pointer"
                                      >
                                        <span className="text-[10px]">Inspect</span>
                                        <ChevronRight className="w-3.5 h-3.5" />
                                      </button>
                                    </motion.div>
                                  ))}
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                        )}
                      </div>

                    </motion.div>
                  );
                }

                // ELSE IF IT IS INTERACTIVE AUTOPILOT CARD
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

                        {/* Tiny pause button inside the card */}
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
                              {preConfiguredPlanSteps.map((step, idx) => (
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

              {/* CLAUDE SHIMMER THINKING BUBBLE (Scenario 1) */}
              <AnimatePresence>
                {thinkingState === 'thinking' && (
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

              {/* APPLE / CLAUDE LUXURY BLUR STREAMING RESPONSE */}
              <AnimatePresence>
                {thinkingState === 'streaming' && (
                  <motion.div 
                    initial={{ opacity: 0, y: 12, filter: 'blur(8px)' }}
                    animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                    exit={{ opacity: 0, y: -4, filter: 'blur(6px)' }}
                    transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                    className="flex gap-4 justify-start"
                  >
                    <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-805 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-[#ff7043]" />
                    </div>

                    <div className="flex-1 max-w-md bg-[#0d0d11]/80 border border-zinc-900 rounded-xl p-4">
                      <span className="text-xs text-zinc-450 font-medium">Resolving workspace parameters files...</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
          </div>

          {/* COMPOSER FIELD AT BOTTOM (Minimal, central) */}
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
                  placeholder={currentSession === 'auth-refactor' ? 'Send guidance to the agent...' : 'How should Meow adjust the codebase?'}
                  className="w-full bg-transparent border-0 text-xs text-white placeholder-zinc-500 focus:ring-0 focus:outline-none resize-none px-2 py-1 leading-relaxed"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleComposerSubmit(e);
                    }
                  }}
                />
                
                <div className="flex items-center justify-between border-t border-zinc-950/40 pt-2 px-2 mt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[9px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900">
                      Enter
                    </span>
                    <span className="text-[10px] text-zinc-500">to write code</span>
                  </div>

                  <button
                    type="submit"
                    disabled={thinkingState !== 'idle' || !composerVal.trim()}
                    className="bg-zinc-100 hover:bg-white text-zinc-950 disabled:opacity-20 font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition"
                  >
                    <span>Send Message</span>
                    <ArrowUpRight className="w-3 h-3" />
                  </button>
                </div>
              </form>
            </div>
          </div>

        </section>

        {/* 3. ARC & LINEAR STYLE FLUid POWER DRAWER (RIGHT SHEET SYSTEM) */}
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
                {/* Header */}
                <div className="px-5 py-4 border-b border-zinc-900 bg-[#070709] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-[#ff7043]" />
                    <h4 className="font-semibold text-xs tracking-wider uppercase text-white">
                      {activeSheet === 'changes' ? 'Diff Review' :
                       activeSheet === 'context' ? 'System Context' : 'Action Details'}
                    </h4>
                  </div>

                  <button 
                    onClick={() => setActiveSheet(null)}
                    className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition cursor-pointer"
                  >
                    ✕
                  </button>
                </div>

                {/* Body Content */}
                <div className="flex-1 overflow-y-auto p-5 space-y-6">

                  {/* 3a. CHANGES DIFFERENTIAL SHEETS */}
                  {activeSheet === 'changes' && (
                    <div className="space-y-4">
                      
                      <div className="p-4 bg-zinc-900/40 border border-zinc-900 rounded-xl space-y-1">
                        <span className="text-[10px] text-zinc-500 uppercase tracking-widest font-mono font-bold">Staged Changesets</span>
                        <p className="text-xs text-zinc-350 font-medium">Branch: feature/concurrent-caches</p>
                      </div>

                      {/* File deltas */}
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

                      {/* Unified visual Diff */}
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
                            <span>const guard = await lockQueue.acquire();</span>
                          </div>
                          <div className="bg-emerald-950/20 text-emerald-400 p-2 border-l border-emerald-600 rounded">
                            <span className="text-emerald-500 font-bold select-none mr-2">+</span>
                            <span>const data = await fs.promises.readFile(path, 'utf8');</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 3b. GLOBAL SYSTEM CONTEXT SHEETS */}
                  {activeSheet === 'context' && (
                    <div className="space-y-6">

                      {/* System Prompt */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-[#ff7043] font-bold">System Prompt Parameters</div>
                        <div className="p-3.5 bg-zinc-950 border border-zinc-900 rounded-xl font-mono text-[10px] text-zinc-400 leading-relaxed max-h-40 overflow-y-auto">
                          "You are Meow Autonomous Core, a senior systems engineer. Minimize visual noise. Adhere to strict clean TypeScript limits. Eliminate telemetry clutter from outer rails."
                        </div>
                      </div>

                      {/* Active Workspace Files */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Workspace Repository Layer</div>
                        
                        <div className="space-y-1">
                          {[
                            'src/core/users.ts',
                            'src/core/autopilot.ts',
                            'src/core/locks.ts',
                            'src/App.tsx',
                            'package.json'
                          ].map((fpath, idx) => (
                            <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 text-xs border border-transparent hover:border-zinc-900 hover:bg-zinc-900/30 transition">
                              <span className="font-mono text-zinc-300">{fpath}</span>
                              <FileText className="w-3.5 h-3.5 text-zinc-650" />
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Learned Retained Memory */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Autonomous Memory Rules</div>
                        
                        {[
                          'Avoid standard blocking loops synchronously to preserve CPU performance.',
                          'Use concurrent mutex locks when writing logging variables to the file structure.',
                          'Favor functional React hooks and motion layout transformations.'
                        ].map((rule, idx) => (
                          <div key={idx} className="p-3 bg-zinc-950 border border-zinc-900 rounded-xl text-xs text-zinc-400">
                            {rule}
                          </div>
                        ))}
                      </div>

                      {/* Active Tools list */}
                      <div className="space-y-2">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Authorized Integrations</div>
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-455">view_file</div>
                          <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-455">patch_file</div>
                          <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-455">run_shell</div>
                          <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-445">grep</div>
                        </div>
                      </div>

                    </div>
                  )}

                  {/* 3c. DETAILED ACTION SHEET */}
                  {activeSheet === 'action-detail' && selectedActionDetail && (
                    <div className="space-y-6">
                      
                      <div className="space-y-1">
                        <h3 className="text-sm font-semibold text-white">{selectedActionDetail.title}</h3>
                        <span className="text-[10px] text-zinc-550 uppercase tracking-widest font-mono">Detailed Action Record</span>
                      </div>

                      {/* Summary points */}
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

                      {/* Impacted files */}
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

                      {/* Tool logs */}
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
                                Simulated invocation records for local testing environments pass cleanly. No anomalies detected.
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                    </div>
                  )}

                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

      </div>

      {/* 4. PREMIUM FLOATING TOAST NOTIFICATION */}
      <AnimatePresence>
        {showNotification && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-6 right-6 bg-[#0f0f13] border border-zinc-850 px-4 py-3 rounded-xl shadow-soft z-50 flex items-center gap-2.5 max-w-sm"
          >
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs text-zinc-300 leading-normal font-sans font-medium">{showNotification}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

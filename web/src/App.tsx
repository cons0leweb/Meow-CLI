import React, { useState, useEffect } from 'react';
import { Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api, createChatStream } from './api/api';
import { ActionDetail, ChatMessage, StatusResponse } from './types';

// Import newly refactored modular components
import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatContainer } from './components/ChatContainer';
import { RightDrawer } from './components/RightDrawer';

export default function App() {
  // ─── Core Platform States ─────────────────────────────────────────
  const [currentSession, setCurrentSession] = useState<string>('crud-create');
  const [activeSheet, setActiveSheet] = useState<'changes' | 'context' | 'api-settings' | 'action-detail' | null>(null);
  const [selectedActionDetail, setSelectedActionDetail] = useState<ActionDetail | null>(null);
  
  const [composerVal, setComposerVal] = useState<string>('');
  const [thinkingState, setThinkingState] = useState<'idle' | 'thinking' | 'streaming'>('idle');
  const [showNotification, setShowNotification] = useState<string | null>(null);

  const [autopilotPaused, setAutopilotPaused] = useState<boolean>(false);
  const [planExpandedId, setPlanExpandedId] = useState<string | null>(null);
  const [workedExpandedId, setWorkedExpandedId] = useState<string | null>(null);

  // ─── Backend Synchronization States ───────────────────────────────
  const [sessions, setSessions] = useState<any[]>([]);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [apiStatus, setApiStatus] = useState<StatusResponse | null>(null);
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [autopilotInfo, setAutopilotInfo] = useState<any>(null);

  // ─── Simulated / Initial Conversation Scenarios ──────────────────
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
        content: `I've created a complete user CRUD system representation in our model files. Here's a quick description of the operations I've completed:

1. **Schema Reading**: Viewed existing interfaces in \`src/core/users.ts\`.
2. **Controller Implementation**: Patched the main router schema callbacks.
3. **Database Migrations**: Ran the database migration checklist suite.
4. **Task Commitment**: Created a local git commit for tracking.`,
        timestamp: '19:40:05',
        actions: [
          { title: 'Edited app.tsx', sheetKey: 'edited-app' },
          { title: 'Read users.ts', sheetKey: 'read-users' },
          { title: 'Ran migration tests', sheetKey: 'ran-tests' },
          { title: 'Committed Changes', sheetKey: 'git-commit-action' },
          { title: 'Searched Web for Express APIs', sheetKey: 'web-search-action' }
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
        content: `I've isolated three blocking file synchronous calls inside \`src/core/autopilot.ts\` and replaced them with standard non-blocking locks:

* **File Operations**: Refactored the core parser loop state logic.
* **Mutex Lock Protection**: Avoided race conditions during simultaneous writes.
* **Continuous Integration**: Ran full test pipeline diagnostics to verify sanity thresholds under heavy loads.`,
        timestamp: '19:41:18',
        actions: [
          { title: 'Patched autopilot.ts', sheetKey: 'patched-autopilot' },
          { title: 'Configured async Lock system', sheetKey: 'async-lock' },
          { title: 'Running CI Pipeline validations', sheetKey: 'ci-pipeline-action' }
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
        autopilotTitle: 'Refactor auth middleware validation logic',
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
    },
    'git-commit-action': {
      title: 'Committed Changes',
      summary: [
        'Created local staging indexes representing refactored schemas',
        'Committed active directory index modifications successfully',
        'Pushed commit 5a2ef39d into active branches stream context'
      ],
      files: ['src/App.tsx', 'src/server.ts'],
      tools: ['git_commit']
    },
    'web-search-action': {
      title: 'Searched Web for Express APIs',
      summary: [
        'Looked up official specifications for Express routing structures',
        'Analyzed response types and body parser sanitization standards',
        'Verified integration checklists for multi-part forms uploads models'
      ],
      files: [],
      tools: ['web_search']
    },
    'ci-pipeline-action': {
      title: 'Running CI Pipeline validations',
      summary: [
        'Booted isolated sandbox workflow container test harness',
        'Verified that zero locking deadlock conditions arise under intensive loops',
        'CI flow successfully greened within 12 seconds with zero test failures'
      ],
      files: ['.github/workflows/main.yml'],
      tools: ['ci_pipeline']
    }
  };

  // Pre-configured planned steps for Autopilot Demo Checklist
  const preConfiguredPlanSteps = [
    { label: 'Inspect middleware files', status: 'completed' },
    { label: 'Patch authorization token verify blocks', status: 'completed' },
    { label: 'Run validation test suite', status: 'pending' },
    { label: 'Verify cache locks in local environment', status: 'pending' }
  ];

  // ─── Toast Notifications Manager ─────────────────────────────────
  const triggerNotification = (msg: string) => {
    setShowNotification(msg);
    setTimeout(() => {
      setShowNotification(null);
    }, 3500);
  };

  // ─── Initial Telemetry & Session Query loaders ────────────────────
  const loadSessions = async () => {
    try {
      const res = await api.getSessions();
      if (res && res.sessions && res.sessions.length > 0) {
        setSessions(res.sessions);
        if (res.current && !currentSession) {
          setCurrentSession(res.current);
        }
      } else {
        setSessions([
          { id: 'crud-create', chat: 'Create CRUD for users', messagesCount: 2 },
          { id: 'auth-debug', chat: 'Identify cache locks', messagesCount: 2 },
          { id: 'auth-refactor', chat: 'Refactor auth middleware', messagesCount: 2 }
        ]);
      }
    } catch (err) {
      console.warn("Backend CLI api offline or fallback mode: falling back to dynamic states.");
      setSessions([
        { id: 'crud-create', chat: 'Create CRUD for users', messagesCount: 2 },
        { id: 'auth-debug', chat: 'Identify cache locks', messagesCount: 2 },
        { id: 'auth-refactor', chat: 'Refactor auth middleware', messagesCount: 2 }
      ]);
    }
  };

  const loadApiStatusAndFiles = () => {
    api.status().then(stat => {
      if (stat) setApiStatus(stat as any);
    }).catch(() => null);

    api.listFiles('.').then(res => {
      if (res && res.files) {
        setProjectFiles(res.files.map(f => f.name));
      }
    }).catch(() => null);
  };

  // Run on Mount
  useEffect(() => {
    loadSessions();
    loadApiStatusAndFiles();
    
    api.getAuthStatus().then(res => {
      if (res && res.authenticated && res.user) {
        setUserInfo(res.user);
      }
    }).catch(() => null);
  }, []);

  // Update context dynamically when sheets are toggled open
  useEffect(() => {
    if (activeSheet === 'context' || activeSheet === 'api-settings') {
      loadApiStatusAndFiles();
    }
  }, [activeSheet]);

  // Telemetry status polling for bg Autopilot sequences
  useEffect(() => {
    const autopilotStatusInterval = setInterval(() => {
      api.getAutopilotStatus().then(res => {
        if (res) {
          setAutopilotInfo(res);
        }
      }).catch(() => null);
    }, 4500);

    return () => clearInterval(autopilotStatusInterval);
  }, []);

  // Sync threads context whenever selection changes
  useEffect(() => {
    if (!currentSession) return;
    if (['crud-create', 'auth-debug', 'auth-refactor'].includes(currentSession)) return;

    api.loadSession(currentSession).then(data => {
      if (data && data.messages) {
        const formatted = data.messages.map((m: any, index: number) => ({
          id: m.id || `msg-${index}-${Date.now()}`,
          role: m.role || 'assistant',
          content: m.content || '',
          timestamp: m.timestamp || new Date(m.time || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          isAutopilotCard: m.isAutopilotCard,
          autopilotTitle: m.autopilotTitle,
          autopilotStep: m.autopilotStep,
          autopilotTotalSteps: m.autopilotTotalSteps,
          autopilotStatus: m.autopilotStatus,
          actions: m.actions || []
        }));
        setThreads(prev => ({
          ...prev,
          [currentSession]: formatted
        }));
      }
    }).catch((err) => {
      console.warn("Could not fetch messages for session:", currentSession, err);
    });
  }, [currentSession]);

  // ─── Actions & Callbacks ──────────────────────────────────────────
  const handleComposerSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!composerVal.trim()) return;

    const typedMsg = composerVal;
    
    // Post user message instantly
    const userMsg: ChatMessage = {
      id: `m-usr-${Date.now()}`,
      role: 'user',
      content: typedMsg,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
    };

    const updatedThread = [...(threads[currentSession] || []), userMsg];
    setThreads(prev => ({
      ...prev,
      [currentSession]: updatedThread
    }));
    
    setComposerVal('');
    setThinkingState('thinking');

    const assistantMsgId = `m-asst-${Date.now()}`;
    let accumulatedContent = '';

    // Autopilot trigger sequence
    const isAutopilotRequest = typedMsg.toLowerCase().includes('autopilot') || typedMsg.toLowerCase().includes('refactor');
    if (isAutopilotRequest) {
      api.executeAutopilot(typedMsg).then(() => {
        triggerNotification("Autopilot started on server!");
        const autopilotCard: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: 'Started Autopilot task execution on the background daemon server.',
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          isAutopilotCard: true,
          autopilotTitle: typedMsg,
          autopilotStep: 'Initializing...',
          autopilotTotalSteps: 5,
          autopilotStatus: 'running'
        };
        setThreads(prev => ({
          ...prev,
          [currentSession]: [...(prev[currentSession] || []), autopilotCard]
        }));
        setThinkingState('idle');
      }).catch(err => {
        console.warn("Defaulting to client-simulation Autopilot card:", err);
        setTimeout(() => {
          setThinkingState('idle');
          setThreads(prev => ({
            ...prev,
            [currentSession]: [
              ...(prev[currentSession] || []),
              {
                id: assistantMsgId,
                role: 'assistant',
                content: 'I have started Autopilot simulation to address your caching request.',
                timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                isAutopilotCard: true,
                autopilotTitle: typedMsg,
                autopilotStep: 'Step 1 of 4',
                autopilotTotalSteps: 4,
                autopilotStatus: 'running'
              }
            ]
          }));
        }, 1200);
      });
      return;
    }

    // Call real streaming chat
    try {
      const messagesPayload = updatedThread.map(m => ({
        role: m.role,
        content: m.content
      }));

      const activeModel = apiStatus?.activeModel;
      
      createChatStream(
        messagesPayload,
        activeModel,
        (chunk) => {
          setThinkingState('streaming');
          accumulatedContent += chunk;
          setThreads(prev => {
            const currentList = prev[currentSession] || [];
            const filtered = currentList.filter(item => item.id !== assistantMsgId);
            return {
              ...prev,
              [currentSession]: [
                ...filtered,
                {
                  id: assistantMsgId,
                  role: 'assistant',
                  content: accumulatedContent,
                  timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })
                }
              ]
            };
          });
        },
        (result) => {
          setThinkingState('idle');
          api.saveSession(currentSession, {
            messages: [
              ...messagesPayload,
              { role: 'assistant', content: result.content }
            ]
          }).catch(err => console.error("Could not save updated session state:", err));
          triggerNotification("Response completed and stored.");
        },
        (error) => {
          console.warn("Stream error, running simulation mode:", error);
          setThinkingState('idle');
          
          setTimeout(() => {
            const assistantResult: ChatMessage = {
              id: assistantMsgId,
              role: 'assistant',
              content: `I have processed your instruction relative to: "${typedMsg}". Standard local validations passed cleanly, keeping runtime environments active.`,
              timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
              actions: [
                { title: 'Edited app.tsx', sheetKey: 'edited-app' },
                { title: 'Ran migration suite', sheetKey: 'ran-tests' }
              ]
            };

            setThreads(prev => {
              const currentList = prev[currentSession] || [];
              const filtered = currentList.filter(item => item.id !== assistantMsgId);
              return {
                ...prev,
                [currentSession]: [...filtered, assistantResult]
              };
            });
            triggerNotification("Simulation response received completely.");
          }, 1000);
        }
      );
    } catch (err) {
      console.error("Failed executing chat client streamer stream:", err);
      setThinkingState('idle');
    }
  };

  const handleCreateNewChat = async () => {
    try {
      const res = await api.createSession();
      const newSessionId = res.sessionId;
      await loadSessions();
      setCurrentSession(newSessionId);
      triggerNotification("New workspace chat initiated.");
    } catch (err) {
      console.warn("Using local fallback session id:", err);
      const newSessionId = `custom-chat-${Date.now()}`;
      setSessions(prev => [
        { id: newSessionId, chat: 'New Local Session', messagesCount: 1 },
        ...prev
      ]);
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
      triggerNotification("New local sandbox chat initialized.");
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await api.deleteSession(id);
      if (currentSession === id) {
        setCurrentSession('crud-create');
      }
      await loadSessions();
      triggerNotification("Deleted workflow session.");
    } catch (e) {
      // Fallback
      setSessions(prev => prev.filter(s => s.id !== id));
      if (currentSession === id) {
        setCurrentSession('crud-create');
      }
      triggerNotification("Removed local session.");
    }
  };

  const handleInspectAction = (sheetKey: string, title: string) => {
    const details = actionDetailMap[sheetKey];
    if (details) {
      setSelectedActionDetail(details);
      setActiveSheet('action-detail');
      triggerNotification(`Pulled "${details.title}" detailed record representation`);
    } else {
      triggerNotification(`No explicit logs stored for "${title}"`);
    }
  };

  return (
    <div className="min-h-screen bg-[#070709] text-[#ced4da] flex flex-col font-sans select-none antialiased relative overflow-hidden h-screen">
      
      {/* 1. Top Control Bar Header */}
      <Header 
        activeSheet={activeSheet}
        onToggleSheet={setActiveSheet}
        apiStatus={apiStatus}
      />

      {/* 2. Main Content Grid (Sidebar + Messages Flow) */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">
        
        {/* Sidebar */}
        <Sidebar 
          currentSession={currentSession}
          onSetCurrentSession={setCurrentSession}
          sessions={sessions}
          userInfo={userInfo}
          activeSheet={activeSheet}
          onToggleSheet={setActiveSheet}
          onCreateNewChat={handleCreateNewChat}
          onDeleteSession={handleDeleteSession}
          onNotify={triggerNotification}
        />

        {/* Chat message layout & Composer input */}
        <ChatContainer 
          currentSession={currentSession}
          messages={threads[currentSession] || []}
          thinkingState={thinkingState}
          composerVal={composerVal}
          onComposerValChange={setComposerVal}
          onSubmitComposer={handleComposerSubmit}
          autopilotPaused={autopilotPaused}
          onToggleAutopilotPause={() => {
            setAutopilotPaused(!autopilotPaused);
            triggerNotification(autopilotPaused ? "Autopilot sequence resumed." : "Autopilot sequence paused.");
          }}
          planExpandedId={planExpandedId}
          onSetPlanExpandedId={setPlanExpandedId}
          workedExpandedId={workedExpandedId}
          onSetWorkedExpandedId={setWorkedExpandedId}
          onInspectAction={handleInspectAction}
          preConfiguredPlanSteps={preConfiguredPlanSteps}
        />

        {/* Sliding Right Drawer system */}
        <RightDrawer 
          activeSheet={activeSheet}
          onClose={() => setActiveSheet(null)}
          selectedActionDetail={selectedActionDetail}
          apiStatus={apiStatus}
          projectFiles={projectFiles}
          onNotify={triggerNotification}
          onConfigChange={loadApiStatusAndFiles}
        />

      </div>

      {/* 3. Sliding Premium Notification toast */}
      <AnimatePresence>
        {showNotification && (
          <motion.div 
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="fixed bottom-6 right-6 bg-[#0f0f13]/95 border border-zinc-850 px-4 py-3 rounded-xl shadow-soft z-50 flex items-center gap-2.5 max-w-sm backdrop-blur select-none"
          >
            <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-xs text-zinc-350 leading-normal font-sans font-medium">{showNotification}</span>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}

import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api, createChatStream } from './api/api';
import { ActionDetail, ChatMessage, StatusResponse } from './types';

import { Header } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { ChatContainer } from './components/ChatContainer';
import { RightDrawer } from './components/RightDrawer';

export default function App() {
  // ─── Core States ──────────────────────────────────────────────
  const [currentSession, setCurrentSession] = useState<string | null>(null);
  const [activeSheet, setActiveSheet] = useState<'changes' | 'context' | 'api-settings' | 'action-detail' | null>(null);
  const [selectedActionDetail, setSelectedActionDetail] = useState<ActionDetail | null>(null);

  const [composerVal, setComposerVal] = useState<string>('');
  const [thinkingState, setThinkingState] = useState<'idle' | 'thinking' | 'streaming'>('idle');
  const [showNotification, setShowNotification] = useState<string | null>(null);

  const [autopilotPaused, setAutopilotPaused] = useState<boolean>(false);
  const [planExpandedId, setPlanExpandedId] = useState<string | null>(null);
  const [workedExpandedId, setWorkedExpandedId] = useState<string | null>(null);

  // ─── Backend Data ─────────────────────────────────────────────
  const [sessions, setSessions] = useState<Array<{ id: string; chat: string; messagesCount: number }>>([]);
  const [userInfo, setUserInfo] = useState<any>(null);
  const [apiStatus, setApiStatus] = useState<StatusResponse | null>(null);
  const [projectFiles, setProjectFiles] = useState<string[]>([]);
  const [autopilotInfo, setAutopilotInfo] = useState<any>(null);

  // Threads: messages per session (loaded from backend)
  const [threads, setThreads] = useState<Record<string, ChatMessage[]>>({});

  // ─── Notifications ────────────────────────────────────────────
  const triggerNotification = useCallback((msg: string) => {
    setShowNotification(msg);
    setTimeout(() => setShowNotification(null), 3500);
  }, []);

  // ─── Data Loading ─────────────────────────────────────────────
  const loadSessions = useCallback(async () => {
    try {
      const res = await api.getSessions();
      if (res?.sessions) {
        setSessions(res.sessions.map((s: any) => ({
          id: s.id,
          chat: s.chat || `Session ${s.id?.slice(0, 8)}`,
          messagesCount: s.messagesCount || 0,
        })));
        if (res.current && !currentSession) {
          setCurrentSession(res.current);
        }
        // If no sessions exist, create one
        if (res.sessions.length === 0 && !currentSession) {
          const newSession = await api.createSession();
          setCurrentSession(newSession.sessionId);
        }
      }
    } catch (err) {
      console.warn('Cannot load sessions from backend:', err);
    }
  }, [currentSession]);

  const loadApiStatusAndFiles = useCallback(async () => {
    try {
      const stat = await api.status();
      if (stat) setApiStatus(stat as any);
    } catch {}

    try {
      const res = await api.listFiles('.');
      if (res?.files) {
        setProjectFiles(res.files.map(f => f.name));
      }
    } catch {}
  }, []);

  // ─── Init on mount ────────────────────────────────────────────
  useEffect(() => {
    loadSessions();
    loadApiStatusAndFiles();

    api.getAuthStatus().then(res => {
      if (res?.authenticated) setUserInfo(res.user);
    }).catch(() => null);
  }, []);

  // ─── Reload data when sheets open ─────────────────────────────
  useEffect(() => {
    if (activeSheet === 'context' || activeSheet === 'api-settings') {
      loadApiStatusAndFiles();
    }
  }, [activeSheet, loadApiStatusAndFiles]);

  // ─── Poll autopilot status ────────────────────────────────────
  useEffect(() => {
    const interval = setInterval(() => {
      api.getAutopilotStatus().then(setAutopilotInfo).catch(() => null);
    }, 4500);
    return () => clearInterval(interval);
  }, []);

  // ─── Load messages when session changes ───────────────────────
  useEffect(() => {
    if (!currentSession) return;

    // Don't reload if we already have messages cached
    if (threads[currentSession]) return;

    api.loadSession(currentSession).then(data => {
      if (data?.messages && Array.isArray(data.messages)) {
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
          actions: m.actions || [],
        }));
        setThreads(prev => ({ ...prev, [currentSession]: formatted }));
      } else {
        // Empty session
        setThreads(prev => ({ ...prev, [currentSession]: [] }));
      }
    }).catch(() => {
      // Session doesn't exist yet or error — start empty
      setThreads(prev => ({ ...prev, [currentSession]: [] }));
    });
  }, [currentSession]);

  // ─── Submit message ───────────────────────────────────────────
  const handleComposerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composerVal.trim() || thinkingState !== 'idle') return;

    const typedMsg = composerVal.trim();

    // Create session if needed
    let sessionId = currentSession;
    if (!sessionId) {
      try {
        const res = await api.createSession();
        sessionId = res.sessionId;
        setCurrentSession(sessionId);
        await loadSessions();
      } catch (err) {
        triggerNotification('Failed to create session');
        return;
      }
    }

    // Add user message
    const userMsg: ChatMessage = {
      id: `m-usr-${Date.now()}`,
      role: 'user',
      content: typedMsg,
      timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
    };

    setThreads(prev => ({
      ...prev,
      [sessionId!]: [...(prev[sessionId!] || []), userMsg],
    }));

    setComposerVal('');
    setThinkingState('thinking');

    const currentMessages = [...(threads[sessionId!] || []), userMsg];
    const assistantMsgId = `m-asst-${Date.now()}`;
    let accumulatedContent = '';

    // Check for autopilot trigger
    const isAutopilotRequest = typedMsg.toLowerCase().includes('autopilot') ||
      typedMsg.toLowerCase().includes('refactor');

    if (isAutopilotRequest) {
      try {
        await api.executeAutopilot(typedMsg);
        triggerNotification('Autopilot started on server!');

        const autopilotCard: ChatMessage = {
          id: assistantMsgId,
          role: 'assistant',
          content: 'Started Autopilot task execution on the background daemon server.',
          timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
          isAutopilotCard: true,
          autopilotTitle: typedMsg,
          autopilotStep: 'Initializing...',
          autopilotTotalSteps: 5,
          autopilotStatus: 'running',
        };

        setThreads(prev => ({
          ...prev,
          [sessionId!]: [...(prev[sessionId!] || []), autopilotCard],
        }));

        // Save session
        api.saveSession(sessionId!, {
          messages: [...currentMessages, { role: 'assistant', content: 'Autopilot started', isAutopilotCard: true }],
        }).catch(() => {});
      } catch (err) {
        triggerNotification('Failed to start autopilot');
      }

      setThinkingState('idle');
      return;
    }

    // Normal streaming chat
    try {
      const messagesPayload = currentMessages.map(m => ({
        role: m.role,
        content: m.content,
      }));

      const activeModel = apiStatus?.activeModel;

      createChatStream(
        messagesPayload,
        activeModel,
        (chunk) => {
          setThinkingState('streaming');
          accumulatedContent += chunk;
          setThreads(prev => {
            const list = prev[sessionId!] || [];
            const filtered = list.filter(item => item.id !== assistantMsgId);
            return {
              ...prev,
              [sessionId!]: [
                ...filtered,
                {
                  id: assistantMsgId,
                  role: 'assistant',
                  content: accumulatedContent,
                  timestamp: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
                },
              ],
            };
          });
        },
        (result) => {
          setThinkingState('idle');

          // Save to backend
          const allMessages = [
            ...messagesPayload,
            { role: 'assistant', content: result.content },
          ];
          api.saveSession(sessionId!, { messages: allMessages }).catch(() => {});
          triggerNotification('Response completed and stored.');
        },
        (error) => {
          console.warn('Stream error:', error);
          setThinkingState('idle');
          triggerNotification('Stream error: ' + error);
        },
      );
    } catch (err) {
      console.error('Failed to start stream:', err);
      setThinkingState('idle');
      triggerNotification('Failed to send message');
    }
  };

  // ─── Session management ───────────────────────────────────────
  const handleCreateNewChat = async () => {
    try {
      const res = await api.createSession();
      const newSessionId = res.sessionId;
      setThreads(prev => ({ ...prev, [newSessionId]: [] }));
      setCurrentSession(newSessionId);
      await loadSessions();
      triggerNotification('New chat created.');
    } catch (err) {
      console.error('Failed to create session:', err);
      triggerNotification('Failed to create new chat');
    }
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await api.deleteSession(id);
      setThreads(prev => {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      });
      if (currentSession === id) {
        setCurrentSession(null);
      }
      await loadSessions();
      triggerNotification('Session deleted.');
    } catch (e) {
      triggerNotification('Failed to delete session');
    }
  };

  const handleSelectSession = async (id: string) => {
    setCurrentSession(id);
    // Load messages for this session if not loaded
    if (!threads[id]) {
      try {
        const data = await api.loadSession(id);
        if (data?.messages) {
          const formatted = data.messages.map((m: any, index: number) => ({
            id: m.id || `msg-${index}-${Date.now()}`,
            role: m.role || 'assistant',
            content: m.content || '',
            timestamp: m.timestamp || new Date(m.time || Date.now()).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
            actions: m.actions || [],
          }));
          setThreads(prev => ({ ...prev, [id]: formatted }));
        }
      } catch {
        setThreads(prev => ({ ...prev, [id]: [] }));
      }
    }
  };

  // ─── Action detail inspection (from real tool calls) ──────────
  const handleInspectAction = (sheetKey: string, title: string) => {
    // In real mode, we'd fetch tool call details from backend
    // For now, build from available data
    setSelectedActionDetail({
      title,
      summary: [`Action: ${title}`],
      files: [],
      tools: [sheetKey],
    });
    setActiveSheet('action-detail');
    triggerNotification(`Showing details for: ${title}`);
  };

  return (
    <div className="min-h-screen bg-[#070709] text-[#ced4da] flex flex-col font-sans select-none antialiased relative overflow-hidden h-screen">

      {/* 1. Top Control Bar Header */}
      <Header
        activeSheet={activeSheet}
        onToggleSheet={setActiveSheet}
        apiStatus={apiStatus}
      />

      {/* 2. Main Content Grid */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative">

        {/* Sidebar */}
        <Sidebar
          currentSession={currentSession}
          onSetCurrentSession={handleSelectSession}
          sessions={sessions}
          userInfo={userInfo}
          activeSheet={activeSheet}
          onToggleSheet={setActiveSheet}
          onCreateNewChat={handleCreateNewChat}
          onDeleteSession={handleDeleteSession}
          onNotify={triggerNotification}
        />

        {/* Chat */}
        <ChatContainer
          currentSession={currentSession}
          messages={threads[currentSession || ''] || []}
          thinkingState={thinkingState}
          composerVal={composerVal}
          onComposerValChange={setComposerVal}
          onSubmitComposer={handleComposerSubmit}
          autopilotPaused={autopilotPaused}
          onToggleAutopilotPause={() => {
            setAutopilotPaused(!autopilotPaused);
            triggerNotification(autopilotPaused ? 'Autopilot resumed.' : 'Autopilot paused.');
          }}
          planExpandedId={planExpandedId}
          onSetPlanExpandedId={setPlanExpandedId}
          workedExpandedId={workedExpandedId}
          onSetWorkedExpandedId={setWorkedExpandedId}
          onInspectAction={handleInspectAction}
        />

        {/* Right Drawer */}
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

      {/* 3. Notification Toast */}
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

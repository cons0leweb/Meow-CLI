import React, { useRef, useEffect, useState } from 'react';
import { 
  Sparkles, Cpu, ChevronDown, ChevronRight, Play, Pause, 
  ArrowUpRight, Check, FileText, FolderOpen, Search, FilePlus, 
  Edit, Terminal, Globe, GitPullRequest, HelpCircle, CheckSquare, 
  Sliders, Split, History, GitCommit, GitBranch, PlayCircle, Eye, Copy
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';
import { ChatMessage } from '../types';

interface ChatContainerProps {
  currentSession: string | null;
  messages: ChatMessage[];
  thinkingState: 'idle' | 'thinking' | 'streaming';
  composerVal: string;
  onComposerValChange: (val: string) => void;
  onSubmitComposer: (e: React.FormEvent) => void;
  
  autopilotPaused: boolean;
  onToggleAutopilotPause: () => void;
  
  planExpandedId: string | null;
  onSetPlanExpandedId: (id: string | null) => void;
  
  workedExpandedId: string | null;
  onSetWorkedExpandedId: (id: string | null) => void;
  
  onInspectAction: (sheetKey: string, title: string) => void;
}

// 1. Tool action styles and definitions representing the requested tools
export interface ToolMapping {
  type: 'read' | 'edit' | 'build' | 'generic' | 'thought' | 'review' | 'test';
  label: string;
  icon: React.ComponentType<any>;
}

export const toolLabels: Record<string, ToolMapping> = {
  'read_file':     { type: 'read',    label: 'Reading File', icon: FileText },
  'list_dir':      { type: 'read',    label: 'Listing Directory', icon: FolderOpen },
  'grep_search':   { type: 'read',    label: 'Searching Code', icon: Search },
  'write_file':    { type: 'edit',    label: 'Writing File', icon: FilePlus },
  'patch_file':    { type: 'edit',    label: 'Editing File', icon: Edit },
  'run_shell':     { type: 'build',   label: 'Running Command', icon: Terminal },
  'tool_chain':    { type: 'build',   label: 'Executing Tool Chain', icon: Cpu },
  'http_request':  { type: 'generic', label: 'Making HTTP Request', icon: Globe },
  'web_search':    { type: 'generic', label: 'Searching Web', icon: Search },
  'delegate_task': { type: 'thought', label: 'Delegating Subtask', icon: GitPullRequest },
  'ask_user':      { type: 'review',  label: 'Asking for Input', icon: HelpCircle },
  'confirm':       { type: 'review',  label: 'Awaiting Confirmation', icon: CheckSquare },
  'choose':        { type: 'review',  label: 'Presenting Options', icon: Sliders },
  'git_diff':      { type: 'review',  label: 'Reviewing Changes', icon: Split },
  'git_log':       { type: 'read',    label: 'Checking History', icon: History },
  'git_commit':    { type: 'edit',    label: 'Committing Changes', icon: GitCommit },
  'git_branch':    { type: 'edit',    label: 'Managing Branches', icon: GitBranch },
  'ci_pipeline':   { type: 'test',    label: 'Running CI Pipeline', icon: PlayCircle },
};

export const categoryStyles: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  read: { bg: 'bg-cyan-500/10', text: 'text-cyan-400', border: 'border-cyan-500/20', dot: 'bg-cyan-500' },
  edit: { bg: 'bg-emerald-500/10', text: 'text-emerald-400', border: 'border-emerald-500/20', dot: 'bg-emerald-500' },
  build: { bg: 'bg-amber-500/10', text: 'text-amber-400', border: 'border-amber-500/20', dot: 'bg-amber-500' },
  test: { bg: 'bg-orange-500/10', text: 'text-orange-400', border: 'border-orange-500/20', dot: 'bg-orange-500' },
  review: { bg: 'bg-indigo-500/10', text: 'text-indigo-400', border: 'border-indigo-500/20', dot: 'bg-indigo-500' },
  generic: { bg: 'bg-zinc-500/10', text: 'text-zinc-400', border: 'border-zinc-800/60', dot: 'bg-zinc-500' },
  thought: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/20', dot: 'bg-purple-500' }
};

// Auto-detector heuristics map for action step logging
export function getToolMetadata(title: string, sheetKey: string) {
  const normTitle = title.toLowerCase();
  const normKey = sheetKey.toLowerCase();
  
  if (normTitle.includes('committing') || normKey.includes('commit')) {
    return { key: 'git_commit', ...toolLabels['git_commit'] };
  }
  if (normTitle.includes('branch') || normKey.includes('branch')) {
    return { key: 'git_branch', ...toolLabels['git_branch'] };
  }
  if (normTitle.includes('history') || normKey.includes('log')) {
    return { key: 'git_log', ...toolLabels['git_log'] };
  }
  if (normTitle.includes('diff') || normKey.includes('diff')) {
    return { key: 'git_diff', ...toolLabels['git_diff'] };
  }
  if (normTitle.includes('search web') || normTitle.includes('google') || normKey.includes('web-search')) {
    return { key: 'web_search', ...toolLabels['web_search'] };
  }
  if (normTitle.includes('http') || normTitle.includes('api request') || normKey.includes('http')) {
    return { key: 'http_request', ...toolLabels['http_request'] };
  }
  if (normTitle.includes('delegate') || normTitle.includes('subtask') || normKey.includes('delegate')) {
    return { key: 'delegate_task', ...toolLabels['delegate_task'] };
  }
  if (normTitle.includes('pipeline') || normTitle.includes('ci')) {
    return { key: 'ci_pipeline', ...toolLabels['ci_pipeline'] };
  }
  if (normTitle.includes('ask') || normTitle.includes('input') || normKey.includes('ask')) {
    return { key: 'ask_user', ...toolLabels['ask_user'] };
  }
  if (normTitle.includes('confirm') || normKey.includes('confirm')) {
    return { key: 'confirm', ...toolLabels['confirm'] };
  }
  if (normTitle.includes('option') || normTitle.includes('choose')) {
    return { key: 'choose', ...toolLabels['choose'] };
  }
  if (normKey.includes('read-') || normTitle.includes('read') || normTitle.includes('view') || normKey.includes('view-')) {
    return { key: 'read_file', ...toolLabels['read_file'] };
  }
  if (normTitle.includes('edit') || normTitle.includes('patch') || normKey.includes('edited-') || normKey.includes('patched-') || normKey.includes('patch_file')) {
    return { key: 'patch_file', ...toolLabels['patch_file'] };
  }
  if (normTitle.includes('write') || normKey.includes('write')) {
    return { key: 'write_file', ...toolLabels['write_file'] };
  }
  if (normTitle.includes('list') || normKey.includes('list-')) {
    return { key: 'list_dir', ...toolLabels['list_dir'] };
  }
  if (normTitle.includes('grep') || normTitle.includes('search')) {
    return { key: 'grep_search', ...toolLabels['grep_search'] };
  }
  if (normTitle.includes('migration') || normTitle.includes('test') || normTitle.includes('run') || normTitle.includes('shell')) {
    return { key: 'run_shell', ...toolLabels['run_shell'] };
  }
  
  return { key: 'tool_chain', ...toolLabels['tool_chain'] };
}

// 2. Custom Markdown Parser Renderers to match premium UI
function CodeBlock({ children }: { children: React.ReactNode }) {
  const [copied, setCopied] = useState(false);
  const text = React.Children.toArray(children).join('');

  const handleCopy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative my-3 rounded-lg border border-zinc-800/80 bg-[#09090c]/90 overflow-hidden font-mono text-[11px]">
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#121216]/50 border-b border-zinc-900 text-zinc-500 text-[10px]">
        <span>terminal output / code</span>
        <button 
          onClick={handleCopy} 
          className="hover:text-white transition flex items-center gap-1 cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      <div className="p-3.5 overflow-x-auto text-zinc-300 select-text leading-relaxed">
        <code>{children}</code>
      </div>
    </div>
  );
}

export function ChatContainer({
  currentSession,
  messages = [],
  thinkingState,
  composerVal,
  onComposerValChange,
  onSubmitComposer,
  autopilotPaused,
  onToggleAutopilotPause,
  planExpandedId,
  onSetPlanExpandedId,
  workedExpandedId,
  onSetWorkedExpandedId,
  onInspectAction,
}: ChatContainerProps) {
  const containerEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    containerEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinkingState]);

  return (
    <section className="flex-1 flex flex-col bg-[#070709] min-w-0 relative h-full">
      
      {/* Scrollable message deck */}
      <div className="flex-1 overflow-y-auto p-6 md:p-8 space-y-6">
        <div className="max-w-2xl mx-auto space-y-6">

          {/* Messages Render list */}
          {messages.map((msg) => {
            const isUser = msg.role === 'user';
            
            // ─── Case A: Standard Chat Bubble ───────────────────
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
                    <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800/80 flex items-center justify-center shrink-0 shadow-sm relative overflow-hidden group">
                      <div className="absolute inset-0 bg-gradient-to-tr from-amber-500/10 to-transparent opacity-40" />
                      <Sparkles className="w-4 h-4 text-amber-500/90 z-10 animate-pulse" />
                    </div>
                  )}

                  {/* Content block */}
                  <div className={`flex-1 min-w-0 ${isUser ? 'pl-12' : 'pr-12'}`}>
                    <div className={`rounded-xl p-4 text-xs leading-relaxed border transition-all duration-300 ${
                      isUser 
                        ? 'bg-[#111115] border-zinc-900/60 text-zinc-150 shadow-soft ml-auto max-w-lg focus:outline-none' 
                        : 'bg-transparent border-transparent text-zinc-200'
                    }`}>
                      
                      {/* Bubble Metadata */}
                      <div className="flex items-center gap-2 mb-2.5">
                        <span className="font-semibold text-xs text-white">
                          {isUser ? 'You' : 'Agent'}
                        </span>
                        <span className="h-1 w-1 bg-zinc-800 rounded-full" />
                        <span className="text-[10px] text-zinc-500 font-mono">
                          {msg.timestamp}
                        </span>
                      </div>

                      {/* Markdown rendering body with premium lists and fonts */}
                      <div className="markdown-body text-zinc-300 selection:bg-zinc-800/80 space-y-2 text-left leading-relaxed">
                        <Markdown
                          components={{
                            code: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                            ul: ({ children }) => <ul className="list-disc pl-5 my-2 space-y-1 text-zinc-300">{children}</ul>,
                            ol: ({ children }) => <ol className="list-decimal pl-5 my-2 space-y-1 text-zinc-300">{children}</ol>,
                            h1: ({ children }) => <h1 className="text-sm font-bold text-white mt-3 mb-1.5">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-xs font-bold text-white mt-3 mb-1">{children}</h2>,
                            li: ({ children }) => <li className="text-zinc-350">{children}</li>,
                            p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed text-zinc-300">{children}</p>,
                            strong: ({ children }) => <strong className="font-semibold text-white">{children}</strong>
                          }}
                        >
                          {msg.content}
                        </Markdown>
                      </div>
                    </div>

                    {/* COLLAPSIBLE ACTIONS TASK TIMELINE (ELEGANT INTEGRATED TOOL LOGS) */}
                    {!isUser && msg.actions && msg.actions.length > 0 && (
                      <div className="mt-3 pl-4">
                        <button 
                          onClick={() => onSetWorkedExpandedId(workedExpandedId === msg.id ? null : msg.id)}
                          className="text-xs font-semibold text-zinc-450 hover:text-white flex items-center gap-1.5 transition cursor-pointer select-none bg-zinc-950/40 px-2.5 py-1 rounded-md border border-zinc-900/60"
                        >
                          <Terminal className="w-3 h-3 text-[#ff7043]" />
                          <span>Worked Operations ({msg.actions.length})</span>
                          <ChevronDown className={`w-3 h-3 transition-transform duration-300 ${workedExpandedId === msg.id ? 'rotate-180' : ''}`} />
                        </button>

                        <AnimatePresence>
                          {workedExpandedId === msg.id && (
                            <motion.div 
                              initial={{ height: 0, opacity: 0, scale: 0.98 }}
                              animate={{ height: 'auto', opacity: 1, scale: 1, marginTop: 8 }}
                              exit={{ height: 0, opacity: 0, scale: 0.98 }}
                              transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                              className="overflow-hidden bg-[#0d0d11]/85 backdrop-blur-md rounded-xl border border-zinc-850 p-2.5 max-w-lg space-y-1.5 shadow-soft"
                            >
                              <div className="text-[10px] font-bold tracking-wider text-zinc-500 uppercase px-2 py-0.5 border-b border-zinc-900/40 mb-1">
                                Execution Sequence Logs
                              </div>

                              {msg.actions.map((act, idx) => {
                                // Dynamic lookup based on classification
                                const meta = getToolMetadata(act.title, act.sheetKey);
                                const IconComp = meta.icon || Cpu;
                                const style = categoryStyles[meta.type] || categoryStyles.generic;

                                return (
                                  <motion.div 
                                    key={idx}
                                    initial={{ opacity: 0, x: -4 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: idx * 0.05, duration: 0.3 }}
                                    className="flex items-center justify-between p-2 rounded-lg hover:bg-zinc-900/50 text-xs border border-transparent hover:border-zinc-850/60 transition duration-150"
                                  >
                                    
                                    {/* Action description & custom chip with appropriate icon */}
                                    <div className="flex items-center gap-2.5 truncate pr-1">
                                      <div className={`p-1.5 rounded-md ${style.bg} ${style.border} border shrink-0`}>
                                        <IconComp className={`w-3.5 h-3.5 ${style.text}`} />
                                      </div>
                                      <div className="truncate flex flex-col">
                                        <span className="text-zinc-200 font-medium truncate">{act.title}</span>
                                        <div className="flex items-center gap-1.5 mt-0.5">
                                          <span className={`w-1 h-1 rounded-full ${style.dot}`} />
                                          <span className="text-[9px] text-zinc-500 font-mono tracking-tight uppercase leading-none">{meta.label}</span>
                                        </div>
                                      </div>
                                    </div>
                                    
                                    <button 
                                      onClick={() => onInspectAction(act.sheetKey, act.title)}
                                      className="text-zinc-500 hover:text-amber-500 flex items-center gap-0.5 transition cursor-pointer px-2 py-1 hover:bg-zinc-850 rounded text-[10px] shrink-0 font-medium"
                                    >
                                      <span>Inspect Details</span>
                                      <ChevronRight className="w-3 h-3" />
                                    </button>
                                  </motion.div>
                                );
                              })}
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>

                </motion.div>
              );
            }

            // ─── Case B: Autopilot Interactive Card ────────────
            return (
              <motion.div 
                key={msg.id} 
                initial={{ opacity: 0, y: 12, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', damping: 28, stiffness: 220 }}
                className="flex gap-4 justify-start"
              >
                
                <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-805 flex items-center justify-center shrink-0">
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

                    <button 
                      onClick={onToggleAutopilotPause}
                      className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-805 text-zinc-300 font-medium text-[10px] rounded transition cursor-pointer flex items-center gap-1 shrink-0"
                    >
                      {autopilotPaused ? <Play className="w-2.5 h-2.5 text-emerald-500" /> : <Pause className="w-2.5 h-2.5" />}
                      <span>{autopilotPaused ? 'Resume' : 'Pause'}</span>
                    </button>
                  </div>

                  {/* Toggle checklist step plans */}
                  <div className="mt-3.5 pt-3 border-t border-zinc-900">
                    <button 
                      onClick={() => onSetPlanExpandedId(planExpandedId === msg.id ? null : msg.id)}
                      className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-300 transition flex items-center gap-1 cursor-pointer select-none"
                    >
                      <span>View Autonomous Plan</span>
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

          {/* ─── Case C: Thinking Shimmer loader ───────────────── */}
          <AnimatePresence>
            {thinkingState === 'thinking' && (
              <motion.div 
                initial={{ opacity: 0, y: 12, filter: 'blur(4px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                exit={{ opacity: 0, y: -4, filter: 'blur(4px)' }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="flex gap-4 justify-start text-zinc-400"
              >
                <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
                  <Sparkles className="w-4 h-4 text-zinc-500 animate-spin" />
                </div>
                
                <div className="flex-1 max-w-md bg-[#0d0d11]/40 border border-zinc-900 rounded-xl p-4 space-y-2">
                  <div className="text-xs font-semibold text-zinc-450">
                    <span className="text-shimmer">Core parsing workspace parameters...</span>
                  </div>
                  <div className="h-2 bg-zinc-900 rounded w-11/12 animate-pulse" />
                  <div className="h-2 bg-zinc-900 rounded w-8/12 animate-pulse" />
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* ─── Case D: Blur streaming indicator ────────────── */}
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

          <div ref={containerEndRef} />
        </div>
      </div>

      {/* COMPOSER FIELD AT BOTTOM (Minimal, central) */}
      <div className="p-6 border-t border-[#141418]/60 bg-[#070709] shrink-0">
        <div className="max-w-2xl mx-auto w-full">
          <form 
            onSubmit={onSubmitComposer} 
            className="bg-zinc-900 border border-zinc-850 rounded-xl p-3 focus-within:border-zinc-700/80 transition duration-300 shadow-soft"
          >
            <textarea
              rows={2}
              value={composerVal}
              onChange={(e) => onComposerValChange(e.target.value)}
              placeholder={'How should Meow adjust the codebase?'}
              className="w-full bg-transparent border-0 text-xs text-white placeholder-zinc-500 focus:ring-0 focus:outline-none resize-none px-2 py-1 leading-relaxed"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  onSubmitComposer(e);
                }
              }}
            />
            
            <div className="flex items-center justify-between border-t border-zinc-950/40 pt-2 px-2 mt-1">
              <div className="flex items-center gap-2">
                <span className="text-[9px] font-mono text-zinc-500 bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-900 select-none">
                  Enter
                </span>
                <span className="text-[10px] text-zinc-550 select-none">to write code</span>
              </div>

              <button
                type="submit"
                disabled={thinkingState !== 'idle' || !composerVal.trim()}
                className="bg-zinc-100 hover:bg-white text-zinc-950 disabled:opacity-25 font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition cursor-pointer select-none"
              >
                <span>Send Message</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          </form>
        </div>
      </div>

    </section>
  );
}

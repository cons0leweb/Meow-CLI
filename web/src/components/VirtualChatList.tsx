import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, User, Cpu, Check, ChevronDown, Play, Pause, RefreshCw, ArrowUpRight } from 'lucide-react';
import { MarkdownRenderer } from './MarkdownRenderer';

// ─── Types ──────────────────────────────────────────────────────────

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

export interface VirtualChatListProps {
  messages: ChatMessage[];
  streamingContent?: string;
  thinkingState?: 'idle' | 'thinking' | 'streaming';
  autopilotPaused?: boolean;
  onAutopilotTogglePause?: (paused: boolean) => void;
  onAutopilotTogglePlan?: (msgId: string | null) => void;
  expandedPlanId?: string | null;
  /** Estimated height of each message row in pixels */
  estimatedItemHeight?: number;
  /** Overscan number of items to render above/below viewport */
  overscan?: number;
  themeColors?: { accent: string; text: string; muted: string };
  config?: Record<string, any>;
  messagesEndRef?: React.RefObject<HTMLDivElement | null>;
}

// ─── Virtual Chat List ──────────────────────────────────────────────

export const VirtualChatList: React.FC<VirtualChatListProps> = ({
  messages,
  streamingContent,
  thinkingState = 'idle',
  autopilotPaused = false,
  onAutopilotTogglePause,
  onAutopilotTogglePlan,
  expandedPlanId,
  estimatedItemHeight = 120,
  overscan = 5,
  themeColors = { accent: '#CC7832', text: '#d4d4d8', muted: '#52525b' },
  config = {},
  messagesEndRef: externalEndRef,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(600);

  // Measure container height on resize
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerHeight(entry.contentRect.height);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const handleScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop);
  }, []);

  // Dynamic message heights based on content length
  const messageHeights = useMemo(() => {
    const heights: number[] = [];
    for (const msg of messages) {
      if (msg.isAutopilotCard) {
        heights.push(220); // autopilot cards are taller
      } else {
        // Estimate: ~20px per line of text + header + padding
        const lines = msg.content.split('\n').length;
        const codeBlocks = (msg.content.match(/```/g) || []).length / 2;
        heights.push(Math.max(estimatedItemHeight, 60 + lines * 20 + codeBlocks * 60));
      }
    }
    return heights;
  }, [messages, estimatedItemHeight]);

  // Calculate cumulative offsets
  const offsets = useMemo(() => {
    const result: number[] = [0];
    for (let i = 0; i < messageHeights.length; i++) {
      result.push(result[i] + (messageHeights[i] || estimatedItemHeight));
    }
    return result;
  }, [messageHeights, estimatedItemHeight]);

  const totalHeight = offsets[offsets.length - 1] || 0;

  // Determine visible range
  const visibleStart = useMemo(() => {
    let lo = 0, hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (offsets[mid] < scrollTop - overscan * estimatedItemHeight) lo = mid + 1;
      else hi = mid;
    }
    return Math.max(0, lo - overscan);
  }, [scrollTop, offsets, overscan, estimatedItemHeight]);

  const visibleEnd = useMemo(() => {
    const bottom = scrollTop + containerHeight + overscan * estimatedItemHeight;
    let lo = 0, hi = offsets.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if (offsets[mid] <= bottom) lo = mid;
      else hi = mid - 1;
    }
    return Math.min(messages.length, lo + overscan + 1);
  }, [scrollTop, containerHeight, offsets, overscan, estimatedItemHeight, messages.length]);

  const visibleMessages = messages.slice(visibleStart, visibleEnd);
  const padTop = offsets[visibleStart] || 0;
  const padBottom = totalHeight - (offsets[visibleEnd] || totalHeight);

  return (
    <div
      ref={containerRef}
      onScroll={handleScroll}
      className="flex-1 overflow-y-auto p-6 md:p-8"
      style={{ willChange: 'scroll-position' }}
    >
      <div className="max-w-2xl mx-auto">
        {/* Virtual scroll spacer (top) */}
        {padTop > 0 && <div style={{ height: padTop }} />}

        {/* Visible messages */}
        {visibleMessages.map((msg, idx) => {
          const actualIdx = visibleStart + idx;
          const isUser = msg.role === 'user';

          return (
            <div key={msg.id} className="mb-6">
              {msg.isAutopilotCard ? (
                <AutopilotCardMessage
                  msg={msg}
                  autopilotPaused={autopilotPaused}
                  onTogglePause={onAutopilotTogglePause}
                  onTogglePlan={onAutopilotTogglePlan}
                  expandedPlanId={expandedPlanId}
                />
              ) : (
                <RegularMessage
                  msg={msg}
                  isUser={isUser}
                  themeColors={themeColors}
                />
              )}
            </div>
          );
        })}

        {/* Streaming content */}
        {streamingContent && (
          <StreamingMessage content={streamingContent} />
        )}

        {/* Thinking shimmer */}
        {thinkingState === 'thinking' && !streamingContent && (
          <ThinkingShimmer />
        )}

        {/* Virtual scroll spacer (bottom) */}
        {padBottom > 0 && <div style={{ height: padBottom }} />}

        {/* Anchor for auto-scroll */}
        <div ref={externalEndRef} />
      </div>
    </div>
  );
};

// ─── Regular Message ────────────────────────────────────────────────

const RegularMessage: React.FC<{
  msg: ChatMessage;
  isUser: boolean;
  themeColors: { accent: string; text: string; muted: string };
}> = ({ msg, isUser, themeColors }) => {
  return (
    <div className="flex gap-4 justify-start">
      {!isUser && (
        <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
          <Sparkles className="w-4 h-4" style={{ color: themeColors.accent }} />
        </div>
      )}
      <div className={`flex-1 min-w-0 ${isUser ? 'pl-12' : 'pr-12'}`}>
        <div
          className={`rounded-xl p-4 text-xs leading-relaxed border ${
            isUser
              ? 'bg-[#111115] border-zinc-800 ml-auto max-w-lg'
              : 'bg-transparent border-transparent'
          }`}
          style={{ color: isUser ? '#fff' : themeColors.text }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-xs text-white">
              {isUser ? 'You' : 'Agent'}
            </span>
            <span className="text-[10px] font-mono" style={{ color: themeColors.muted }}>
              {msg.timestamp}
            </span>
          </div>

          {isUser ? (
            <div className="font-sans whitespace-pre-wrap">{msg.content}</div>
          ) : (
            <MarkdownRenderer content={msg.content} />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Autopilot Card Message ─────────────────────────────────────────

const AutopilotCardMessage: React.FC<{
  msg: ChatMessage;
  autopilotPaused: boolean;
  onTogglePause?: (paused: boolean) => void;
  onTogglePlan?: (msgId: string | null) => void;
  expandedPlanId?: string | null;
}> = ({ msg, autopilotPaused, onTogglePause, onTogglePlan, expandedPlanId }) => {
  return (
    <div className="flex gap-4 justify-start">
      <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
        <Cpu className="w-4 h-4 text-[#ff7043]" />
      </div>
      <div className="flex-1 max-w-md bg-[#0d0d11] border border-zinc-850 rounded-xl p-4">
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
            onClick={() => onTogglePause?.(!autopilotPaused)}
            className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-805 text-zinc-300 font-medium text-[10px] rounded transition cursor-pointer flex items-center gap-1"
          >
            {autopilotPaused ? (
              <Play className="w-2.5 h-2.5 text-emerald-500" />
            ) : (
              <Pause className="w-2.5 h-2.5" />
            )}
            <span>{autopilotPaused ? 'Resume' : 'Pause'}</span>
          </button>
        </div>

        <div className="mt-3.5 pt-3 border-t border-zinc-900">
          <MarkdownRenderer content={msg.content} />
        </div>

        <div className="mt-3.5 pt-3 border-t border-zinc-900">
          <button
            onClick={() => onTogglePlan?.(expandedPlanId === msg.id ? null : msg.id)}
            className="text-[11px] font-semibold text-zinc-500 hover:text-zinc-300 transition flex items-center gap-1 cursor-pointer"
          >
            <span>View Plan</span>
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-300 ${
                expandedPlanId === msg.id ? 'rotate-180' : ''
              }`}
            />
          </button>

          <AnimatePresence>
            {expandedPlanId === msg.id && (
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
                  <div key={idx} className="flex items-center gap-2 text-xs py-0.5 pl-1 text-zinc-400">
                    {step.status === 'completed' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-zinc-700 shrink-0" />
                    )}
                    <span
                      className={
                        step.status === 'completed'
                          ? 'line-through text-zinc-650 font-normal'
                          : 'text-zinc-300 font-medium'
                      }
                    >
                      {step.label}
                    </span>
                  </div>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

// ─── Streaming Message ──────────────────────────────────────────────

const StreamingMessage: React.FC<{ content: string }> = ({ content }) => {
  return (
    <div className="flex gap-4 justify-start mb-6">
      <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0">
        <Sparkles className="w-4 h-4 text-amber-500" />
      </div>
      <div className="flex-1 min-w-0 pr-12">
        <div className="rounded-xl p-4 text-xs leading-relaxed border bg-transparent border-transparent text-zinc-200">
          <div className="flex items-center gap-2 mb-2">
            <span className="font-semibold text-xs text-white">Agent</span>
            <span className="text-[10px] font-mono text-zinc-500">streaming...</span>
          </div>
          <div className="font-sans">
            <MarkdownRenderer content={content} />
            <span className="inline-block w-1.5 h-4 bg-amber-500/60 ml-0.5 animate-pulse rounded-sm" />
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Thinking Shimmer ────────────────────────────────────────────────

const ThinkingShimmer: React.FC = () => {
  return (
    <div className="flex gap-4 justify-start mb-6">
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
    </div>
  );
};

export default VirtualChatList;

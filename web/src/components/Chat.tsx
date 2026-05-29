import React from 'react';
import { motion } from 'motion/react';
import { 
  Send, Sparkles, User, HelpCircle, CornerDownRight,
  Shield, Play, Pause, RotateCcw
} from 'lucide-react';

export interface ChatMessageProps {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  reasoning?: string;
  toolsUsed?: string[];
}

export const MessageBubble: React.FC<ChatMessageProps> = ({
  role,
  content,
  timestamp,
  reasoning,
  toolsUsed
}) => {
  const isUser = role === 'user';
  const isSystem = role === 'system';

  return (
    <div className={`flex gap-4 ${isUser ? 'justify-end' : 'justify-start'}`}>
      {/* Sender Avatar */}
      {!isUser && (
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
          isSystem 
            ? 'bg-zinc-900 border-zinc-805 text-zinc-500' 
            : 'bg-amber-500/10 border-amber-500/25 text-amber-500'
        }`}>
          {isSystem ? <HelpCircle className="w-4 h-4" /> : <Sparkles className="w-4 h-4" />}
        </div>
      )}

      {/* Message Box */}
      <div className={`max-w-2xl rounded-2xl p-4 transition duration-200 border ${
        isUser 
          ? 'bg-zinc-850 border-zinc-800 text-white shadow-soft' 
          : isSystem 
            ? 'bg-zinc-900/40 border-zinc-850 text-zinc-400 font-mono text-xs' 
            : 'bg-zinc-900 border-zinc-850 text-zinc-200 shadow-soft'
      }`}>
        {/* Banner metadata */}
        <div className="flex items-center gap-2 mb-1">
          <span className="font-display font-semibold text-xs text-white">
            {isUser ? 'You' : isSystem ? 'System Event' : 'Agent (Autopilot)'}
          </span>
          <span className="text-[10px] text-zinc-500 font-mono font-medium">
            {timestamp}
          </span>
        </div>

        {/* Content Body */}
        <div className="text-xs leading-relaxed font-sans mt-1.5 break-words">
          {content}
        </div>

        {/* Tools Displayed badge */}
        {toolsUsed && toolsUsed.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-3">
            {toolsUsed.map((tool, i) => (
              <span key={i} className="text-[9px] font-mono font-semibold px-2 py-0.5 rounded border border-zinc-800 bg-zinc-950 text-zinc-400">
                🔧 {tool}
              </span>
            ))}
          </div>
        )}

        {/* Embedded Chain-of-Thought (Reasoning) */}
        {reasoning && (
          <div className="mt-3.5 pt-3 border-t border-zinc-850 font-mono text-[11px] text-zinc-400">
            <div className="flex items-center gap-1.5 text-zinc-500 font-semibold uppercase text-[9px] mb-1.5">
              <Sparkles className="w-3 h-3 text-amber-500/80 animate-pulse" />
              <span>Reasoning (Thought Process)</span>
            </div>
            <p className="leading-relaxed">
              {reasoning}
            </p>
          </div>
        )}
      </div>

      {isUser && (
        <div className="w-8 h-8 rounded-lg bg-zinc-800 border border-zinc-700 flex items-center justify-center shrink-0 text-white shadow-soft">
          <User className="w-4 h-4" />
        </div>
      )}
    </div>
  );
};


// Composer Interface (Claude Desktop Style)
export interface ComposerProps {
  value: string;
  onChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  placeholder?: string;
  isLoading?: boolean;
}

export const Composer: React.FC<ComposerProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = "Message helper, steer task coordinates or request file view...",
  isLoading = false
}) => {
  return (
    <form onSubmit={onSubmit} className="bg-zinc-900 border border-zinc-850 rounded-2xl p-2.5 focus-within:border-zinc-700 group transition duration-300 shadow-soft">
      <textarea
        rows={2}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full bg-transparent border-0 text-xs text-white placeholder-zinc-500 focus:ring-0 focus:outline-none resize-none px-2 py-1.5"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSubmit(e);
          }
        }}
      />
      
      <div className="flex items-center justify-between border-t border-zinc-900 pt-2 px-2 mt-1">
        <div className="flex items-center gap-1.5 text-[10px] text-zinc-500">
          <span className="font-mono text-[9px] bg-zinc-950 px-1.5 py-0.5 rounded border border-zinc-800 text-zinc-400">
            ⌘ Enter
          </span>
          <span>to submit coordinate commands</span>
        </div>

        <button
          type="submit"
          disabled={isLoading || !value.trim()}
          className="bg-zinc-100 hover:bg-white text-zinc-950 disabled:opacity-30 disabled:hover:bg-zinc-100 font-semibold text-xs px-3.5 py-1.5 rounded-xl shadow-sm flex items-center gap-1.5 transition duration-150"
        >
          <Send className="w-3 h-3" />
          <span>Post Command</span>
        </button>
      </div>
    </form>
  );
};

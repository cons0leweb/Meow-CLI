import React from 'react';
import { Plus, MessageSquare, X, Settings } from 'lucide-react';
import { motion } from 'motion/react';
import { SessionMeta } from '../types';

interface SidebarProps {
  currentSession: string | null;
  onSetCurrentSession: (id: string) => void;
  sessions: any[];
  userInfo: any;
  activeSheet: 'changes' | 'context' | 'api-settings' | 'action-detail' | null;
  onToggleSheet: (sheet: 'changes' | 'context' | 'api-settings' | 'action-detail' | null) => void;
  onCreateNewChat: () => void;
  onDeleteSession: (id: string) => void;
  onNotify: (msg: string) => void;
}

export function Sidebar({
  currentSession,
  onSetCurrentSession,
  sessions,
  userInfo,
  activeSheet,
  onToggleSheet,
  onCreateNewChat,
  onDeleteSession,
  onNotify
}: SidebarProps) {
  return (
    <aside className="w-64 border-r border-[#141418]/60 bg-[#070709] flex flex-col shrink-0 min-h-0 select-none">
      <div className="p-4 flex flex-col justify-between h-full">
        
        <div className="space-y-6">
          
          {/* Luxury Claude New Chat Button */}
          <motion.button 
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            onClick={onCreateNewChat}
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
              Workspace Chats
            </div>
            
            <div className="space-y-1 max-h-56 overflow-y-auto pr-1">
              {sessions.map((session) => (
                <motion.div 
                  key={session.id}
                  whileHover={{ x: 2 }}
                  className={`group w-full flex items-center justify-between px-3 py-2 rounded-xl transition text-xs cursor-pointer ${
                    currentSession === session.id 
                      ? 'bg-[#111115] text-white font-medium border border-zinc-900/60' 
                      : 'text-zinc-400 hover:bg-zinc-900/20 hover:text-zinc-200'
                  }`}
                  onClick={() => {
                    onSetCurrentSession(session.id);
                    onNotify(`Switched to "${session.chat || 'custom workflow'}"`);
                  }}
                >
                  <div className="flex items-center gap-2 truncate pr-1">
                    <MessageSquare className={`w-3.5 h-3.5 shrink-0 ${
                      currentSession === session.id ? 'text-[#ff7043]' : 'text-zinc-500 group-hover:text-amber-500'
                    }`} />
                    <span className="truncate">{session.chat || `Session ${session.id.slice(0, 8)}`}</span>
                  </div>

                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 hover:text-red-400 p-0.5 rounded transition shrink-0 cursor-pointer"
                  >
                    <X className="w-2.5 h-2.5" />
                  </button>
                </motion.div>
              ))}
            </div>
          </div>

          {/* Working Directory */}
          <div className="space-y-1">
            <div className="text-[9px] uppercase font-bold tracking-widest text-[#4f4f5a] mb-2 px-1">
              Working Directory
            </div>
            <div className="text-zinc-400 text-xs px-3 py-1.5 rounded-lg">
              <span className="font-mono text-[10px] text-zinc-500 truncate block">
                {process.cwd() || '/home/cons0leweb/JS/meow-cli'}
              </span>
            </div>
          </div>

        </div>

        {/* Profile settings footer section */}
        <div className="pt-3 border-t border-zinc-900 flex items-center justify-between">
          <div className="flex items-center gap-2 truncate">
            <div className="w-7 h-7 rounded-full bg-[#ff7043]/15 border border-[#ff7043]/25 flex items-center justify-center font-bold text-xs text-white">
              {userInfo?.name ? userInfo.name[0].toUpperCase() : 'M'}
            </div>
            <div className="truncate">
              <div className="text-xs font-semibold text-white truncate">{userInfo?.name || 'Meow CLI'}</div>
              <div className="text-[10px] text-zinc-500 truncate">{userInfo?.email || 'local'}</div>
            </div>
          </div>
          <motion.button 
            whileHover={{ rotate: 15, scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => {
              onToggleSheet(activeSheet === 'api-settings' ? null : 'api-settings');
              onNotify("Accessing API settings.");
            }} 
            className="p-1.5 rounded-lg hover:bg-zinc-900 border border-transparent hover:border-zinc-850 text-zinc-400 hover:text-white transition cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </motion.button>
        </div> 

      </div>
    </aside>
  );
}

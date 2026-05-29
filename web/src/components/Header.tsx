import React from 'react';
import { Cpu, Code, Settings } from 'lucide-react';
import { motion } from 'motion/react';

interface HeaderProps {
  activeSheet: 'changes' | 'context' | 'api-settings' | 'action-detail' | null;
  onToggleSheet: (sheet: 'changes' | 'context' | 'api-settings' | 'action-detail' | null) => void;
  apiStatus: any;
}

export function Header({ activeSheet, onToggleSheet, apiStatus }: HeaderProps) {
  return (
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
        
        {/* API Settings Quick Toggle */}
        <motion.button 
          whileHover={{ scale: 1.02, backgroundColor: 'rgba(24, 24, 31, 0.8)' }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onToggleSheet(activeSheet === 'api-settings' ? null : 'api-settings')}
          className={`text-xs px-3 py-1.5 rounded-lg font-semibold border transition cursor-pointer flex items-center gap-1.5 ${
            activeSheet === 'api-settings' 
              ? 'bg-[#18181f]/60 border-zinc-700 text-white' 
              : 'bg-transparent border-zinc-900 text-zinc-400 hover:text-white'
          }`}
        >
          <Settings className="w-3.5 h-3.5 opacity-60" />
          <span>API Settings</span>
        </motion.button>

        <motion.button 
          whileHover={{ scale: 1.02, backgroundColor: 'rgba(24, 24, 31, 0.8)' }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onToggleSheet(activeSheet === 'context' ? null : 'context')}
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
          onClick={() => onToggleSheet(activeSheet === 'changes' ? null : 'changes')}
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
  );
}

import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Sparkles, Eye, FileText, CheckCircle2, AlertCircle, Play, Cpu, 
  GitCommit, Hourglass, Shield, Terminal
} from 'lucide-react';

export type ActivityStatus = 'idle' | 'running' | 'success' | 'failed';

export interface ActivityItem {
  id: string;
  type: 'thought' | 'read' | 'edit' | 'test' | 'build' | 'review' | 'generic';
  label: string;
  detail?: string;
  status: ActivityStatus;
  timestamp?: string;
}

export interface ActivityTimelineProps {
  items: ActivityItem[];
  onItemClick?: (item: ActivityItem) => void;
}

const itemTypeConfig = {
  thought: {
    icon: Sparkles,
    colorClass: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
    title: 'Thought',
  },
  read: {
    icon: Eye,
    colorClass: 'text-teal-600 bg-teal-500/10 border-teal-500/20',
    title: 'Read File',
  },
  edit: {
    icon: FileText,
    colorClass: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
    title: 'Edited File',
  },
  test: {
    icon: Terminal,
    colorClass: 'text-purple-500 bg-purple-500/10 border-purple-500/20',
    title: 'Ran Tests',
  },
  build: {
    icon: Cpu,
    colorClass: 'text-[#ff7043] bg-amber-500/10 border-amber-500/20',
    title: 'Built Project',
  },
  review: {
    icon: Shield,
    colorClass: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
    title: 'Reviewed Changes',
  },
  generic: {
    icon: Play,
    colorClass: 'text-zinc-400 bg-zinc-400/10 border-zinc-400/20',
    title: 'Event',
  },
};

export const ActivityTimeline: React.FC<ActivityTimelineProps> = ({ items, onItemClick }) => {
  return (
    <div className="relative pl-6 space-y-4 before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[1px] before:bg-zinc-800">
      <AnimatePresence initial={false}>
        {items.map((item, index) => {
          const config = itemTypeConfig[item.type] || itemTypeConfig.generic;
          const Icon = config.icon;
          const isLast = index === items.length - 1;

          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              onClick={() => onItemClick?.(item)}
              className="relative group cursor-pointer"
            >
              {/* Outer Glow Ring on Hover */}
              <div className="absolute -left-[20px] top-1/2 -translate-y-1/2 w-4 h-4 rounded-full bg-[#16161a] border border-zinc-850 flex items-center justify-center z-10 transition duration-300 group-hover:border-zinc-500" />
              
              {/* Actual Status Mini Dot */}
              <div className={`absolute -left-[18px] top-1/2 -translate-y-1/2 w-2 h-2 rounded-full z-20 ${
                item.status === 'running' ? 'bg-amber-500 animate-pulse' :
                item.status === 'success' ? 'bg-emerald-500' :
                item.status === 'failed' ? 'bg-red-500' : 'bg-zinc-700'
              }`} />

              <div className="bg-zinc-900 border border-zinc-850 hover:border-zinc-800/80 p-3 rounded-xl transition duration-200 shadow-soft">
                <div className="flex items-center justify-between gap-3 mb-1">
                  <div className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded-md flex items-center justify-center border ${config.colorClass}`}>
                      <Icon className="w-3.5 h-3.5" />
                    </div>
                    <div>
                      <span className="font-display font-semibold text-xs text-white">
                        {item.label}
                      </span>
                      <span className="text-[10px] text-zinc-500 font-mono ml-2 font-medium">
                        {config.title}
                      </span>
                    </div>
                  </div>

                  {item.timestamp && (
                    <span className="text-[10px] text-zinc-500 font-mono tracking-wide">
                      {item.timestamp}
                    </span>
                  )}
                </div>

                {item.detail && (
                  <p className="text-[11px] text-zinc-400 font-sans leading-relaxed mt-1.5 pl-8">
                    {item.detail}
                  </p>
                )}
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

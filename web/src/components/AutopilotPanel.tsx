import React, { useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Cpu, Play, Square, Terminal, FileText, Eye, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';

// ─── Types ──────────────────────────────────────────────────────────

interface AutopilotStatus {
  running: boolean;
  hasInstance: boolean;
  phase: string;
  iterations: number;
  errors: number;
}

interface AutopilotPanelProps {
  onStart?: (task: string, model?: string) => void;
  onStop?: () => void;
  onStatusChange?: (status: AutopilotStatus) => void;
  currentCwd?: string;
}

// ─── Autopilot Panel ────────────────────────────────────────────────

export const AutopilotPanel: React.FC<AutopilotPanelProps> = ({
  onStart,
  onStop,
  onStatusChange,
  currentCwd = '',
}) => {
  const [expanded, setExpanded] = useState(false);
  const [task, setTask] = useState('');
  const [model, setModel] = useState('');
  const [status, setStatus] = useState<AutopilotStatus>({
    running: false,
    hasInstance: false,
    phase: 'idle',
    iterations: 0,
    errors: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [recentLog, setRecentLog] = useState<string[]>([]);

  // Poll status while running
  useEffect(() => {
    if (!status.running) return;

    const interval = setInterval(async () => {
      try {
        const newStatus = await api.getAutopilotStatus();
        setStatus(newStatus);
        onStatusChange?.(newStatus);

        if (!newStatus.running && status.running) {
          setRecentLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Autopilot completed`]);
        }
      } catch (e: any) {
        console.error('Status poll error:', e);
      }
    }, 2000);

    return () => clearInterval(interval);
  }, [status.running]);

  const handleExecute = useCallback(async () => {
    if (!task.trim()) return;

    setError(null);
    setRecentLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Starting autopilot: "${task.slice(0, 50)}..."`]);

    try {
      const result = await api.executeAutopilot(task.trim(), model || undefined);
      setStatus(prev => ({ ...prev, running: true, phase: 'running' }));
      onStart?.(task.trim(), model || undefined);
      setRecentLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${result.message}`]);
    } catch (e: any) {
      setError(e.message);
      setRecentLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ERROR: ${e.message}`]);
    }
  }, [task, model, onStart]);

  const handleStop = useCallback(async () => {
    try {
      await api.cancelAutopilot();
      setStatus(prev => ({ ...prev, running: false, phase: 'cancelled' }));
      onStop?.();
      setRecentLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] Autopilot cancelled`]);
    } catch (e: any) {
      setError(e.message);
    }
  }, [onStop]);

  return (
    <div className="border-t border-zinc-800">
      {/* Toggle header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full px-3 py-2 flex items-center gap-2 text-xs text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 transition cursor-pointer"
      >
        <Cpu className={`w-3.5 h-3.5 ${status.running ? 'text-amber-500 animate-pulse' : ''}`} />
        <span className="font-medium">Autopilot</span>
        {status.running && (
          <span className="text-[10px] text-amber-500 ml-1">● Running</span>
        )}
        <div className="ml-auto flex items-center gap-1.5">
          {status.iterations > 0 && (
            <span className="text-[10px] font-mono text-zinc-600">
              {status.iterations} iters
            </span>
          )}
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            ▸
          </motion.span>
        </div>
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden px-3 pb-3 space-y-2"
          >
            {/* Task input */}
            <div className="flex gap-2">
              <input
                type="text"
                value={task}
                onChange={e => setTask(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleExecute()}
                placeholder="Describe the task for the agent..."
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-amber-700 transition font-mono"
                disabled={status.running}
              />
              {status.running ? (
                <button
                  onClick={handleStop}
                  className="px-3 py-2 bg-red-900/30 border border-red-800 text-red-400 rounded-lg text-xs font-medium hover:bg-red-900/50 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Square className="w-3 h-3" />
                  Stop
                </button>
              ) : (
                <button
                  onClick={handleExecute}
                  disabled={!task.trim()}
                  className="px-3 py-2 bg-amber-700/20 border border-amber-700 text-amber-400 rounded-lg text-xs font-medium hover:bg-amber-700/30 transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1.5"
                >
                  <Play className="w-3 h-3" />
                  Run
                </button>
              )}
            </div>

            {/* Model selector */}
            <div className="flex gap-2">
              <input
                type="text"
                value={model}
                onChange={e => setModel(e.target.value)}
                placeholder="Model (optional)"
                className="flex-1 bg-zinc-900 border border-zinc-800 rounded-lg px-2.5 py-1.5 text-[11px] text-zinc-400 placeholder-zinc-700 focus:outline-none focus:border-zinc-700 transition font-mono"
                disabled={status.running}
              />
              <span className="text-[10px] text-zinc-600 self-center font-mono">
                CWD: {currentCwd.slice(-40) || '~'}
              </span>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-2 bg-red-900/20 border border-red-800 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 text-red-400 mt-0.5 shrink-0" />
                <span className="text-[11px] text-red-300">{error}</span>
              </div>
            )}

            {/* Status indicators */}
            {status.running && (
              <div className="flex gap-3 text-[10px] font-mono text-zinc-500 px-1">
                <span>Phase: <span className="text-amber-400">{status.phase}</span></span>
                <span>Iterations: <span className="text-zinc-300">{status.iterations}</span></span>
                <span>Errors: <span className={status.errors > 0 ? 'text-red-400' : 'text-zinc-500'}>{status.errors}</span></span>
              </div>
            )}

            {/* Recent log */}
            {recentLog.length > 0 && (
              <div className="bg-black/40 rounded-lg p-2 max-h-24 overflow-y-auto space-y-0.5">
                {recentLog.slice(-8).map((line, i) => (
                  <div key={i} className="text-[10px] font-mono text-zinc-600 leading-relaxed">
                    {line}
                  </div>
                ))}
              </div>
            )}

            {/* Quick action buttons */}
            <div className="flex gap-1.5 pt-1">
              {[
                { icon: Terminal, label: 'Run shell command' },
                { icon: FileText, label: 'Read file & analyze' },
                { icon: Eye, label: 'Review & fix code' },
              ].map((action, idx) => (
                <button
                  key={idx}
                  onClick={() => setTask(prev => prev + action.label)}
                  className="px-2 py-1 bg-zinc-900 hover:bg-zinc-800 border border-zinc-800 text-zinc-500 rounded text-[10px] transition cursor-pointer flex items-center gap-1"
                >
                  <action.icon className="w-2.5 h-2.5" />
                  {action.label}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default AutopilotPanel;

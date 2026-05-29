import React from 'react';
import { FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ActionDetail, StatusResponse } from '../types';
import { ApiSettings } from './ApiSettings';

interface RightDrawerProps {
  activeSheet: 'changes' | 'context' | 'api-settings' | 'action-detail' | null;
  onClose: () => void;
  selectedActionDetail: ActionDetail | null;
  apiStatus: StatusResponse | null;
  projectFiles: string[];
  onNotify: (msg: string) => void;
  onConfigChange?: () => void;
}

export function RightDrawer({
  activeSheet,
  onClose,
  selectedActionDetail,
  apiStatus,
  projectFiles,
  onNotify,
  onConfigChange
}: RightDrawerProps) {
  return (
    <AnimatePresence>
      {activeSheet && (
        <>
          {/* Overlay background blur trigger */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.35 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/50 z-30 cursor-pointer"
          />

          {/* Sliding sheet container container */}
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
                <h4 className="font-semibold text-xs tracking-wider uppercase text-white select-none">
                  {activeSheet === 'changes' ? 'Diff Review' :
                   activeSheet === 'context' ? 'System Context' : 
                   activeSheet === 'api-settings' ? 'API Parameters' : 'Action Details'}
                </h4>
              </div>

              <button 
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition cursor-pointer font-sans"
              >
                ✕
              </button>
            </div>

            {/* Body Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-6">

              {/* ─── Case A: CHANGES DIFFERENTIAL SHEETS ───────── */}
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
                    
                    <div className="flex items-center justify-between text-xs py-1 text-zinc-350">
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

              {/* ─── Case B: SYSTEM CONTEXT DETAILS ────────────── */}
              {activeSheet === 'context' && (
                <div className="space-y-6">

                  {/* Active Engine */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-[#ff7043] font-bold">Active Engine Configuration</div>
                    <div className="bg-zinc-950 border border-zinc-900 rounded-xl p-3.5 space-y-2 text-xs">
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-zinc-500 font-mono">Engine Model:</span>
                        <span className="text-white font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">{apiStatus?.activeModel || 'gemini-2.0-flash'}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-zinc-500 font-mono">Service Provider:</span>
                        <span className="text-white font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800 uppercase text-[10px]">{apiStatus?.activeProvider || 'google'}</span>
                      </div>
                      <div className="flex justify-between items-center text-[11px]">
                        <span className="text-zinc-500 font-mono">Config Profile:</span>
                        <span className="text-white font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">{apiStatus?.activeProfile || 'default'}</span>
                      </div>
                    </div>
                  </div>

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
                    
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {(projectFiles.length > 0 ? projectFiles : [
                        'src/api/api.ts',
                        'src/App.tsx',
                        'package.json',
                        'vite.config.ts'
                      ]).map((fpath, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/40 text-xs border border-transparent hover:border-zinc-900 hover:bg-zinc-900/30 transition">
                          <span className="font-mono text-zinc-300 truncate pr-2">{fpath}</span>
                          <FileText className="w-3.5 h-3.5 text-zinc-650 shrink-0" />
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
                      <div key={idx} className="p-3 bg-zinc-950 border border-zinc-900 rounded-xl text-xs text-zinc-400 leading-normal">
                        {rule}
                      </div>
                    ))}
                  </div>

                  {/* Active Tools list */}
                  <div className="space-y-2">
                    <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Authorized Integrations</div>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-500">view_file</div>
                      <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-500">patch_file</div>
                      <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-500">run_shell</div>
                      <div className="p-2.5 bg-zinc-950 border border-zinc-900 rounded-lg text-zinc-500">grep</div>
                    </div>
                  </div>

                </div>
              )}

              {/* ─── Case C: API PARAMETERS & COSTS ────────────── */}
              {activeSheet === 'api-settings' && (
                <ApiSettings 
                  onNotify={onNotify} 
                  onConfigChange={onConfigChange}
                  status={apiStatus}
                />
              )}

              {/* ─── Case D: ACTION SPECIFICS ────────────────── */}
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
  );
}

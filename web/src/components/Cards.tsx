import React from 'react';
import { motion } from 'motion/react';
import { 
  ShieldAlert, Check, X, GitPullRequest, ArrowUpRight, 
  Sparkles, FileText, ChevronRight, CornerDownRight 
} from 'lucide-react';

export type CardState = 'idle' | 'loading' | 'active' | 'success' | 'warning' | 'error';

// PlanCard interface
export interface PlanStep {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'success' | 'failed';
}

export interface PlanCardProps {
  title: string;
  description?: string;
  steps: PlanStep[];
  state?: CardState;
  onStepClick?: (step: PlanStep) => void;
}

export const PlanCard: React.FC<PlanCardProps> = ({ 
  title, 
  description, 
  steps, 
  state = 'active',
  onStepClick 
}) => {
  return (
    <div className={`p-5 rounded-2xl bg-zinc-900 border transition duration-300 ${
      state === 'success' ? 'border-emerald-950/40 bg-zinc-900/60' :
      state === 'warning' ? 'border-amber-950/40 bg-zinc-900/60' :
      'border-zinc-850'
    } shadow-soft`}>
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h4 className="font-display font-semibold text-xs text-white uppercase tracking-wider">
            {title}
          </h4>
          {description && (
            <p className="text-xs text-zinc-400 mt-1 leading-relaxed">
              {description}
            </p>
          )}
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border bg-zinc-950 border-zinc-800 text-zinc-400">
          Planned
        </span>
      </div>

      <div className="space-y-1.5 mt-4">
        {steps.map((step) => {
          const isActive = step.status === 'active';
          const isSuccess = step.status === 'success';
          const isFailed = step.status === 'failed';

          return (
            <div 
              key={step.id} 
              onClick={() => onStepClick?.(step)}
              className={`flex items-center justify-between p-2.5 rounded-xl border text-xs transition duration-150 cursor-pointer ${
                isActive ? 'bg-amber-950/10 border-amber-800/20 text-white' :
                isSuccess ? 'bg-zinc-900 border-zinc-850/60 text-zinc-400' :
                isFailed ? 'bg-red-950/25 border-red-900/20 text-red-100' :
                'bg-zinc-950/20 border-transparent hover:border-zinc-850 text-zinc-500'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className={`w-1.5 h-1.5 rounded-full ${
                  isActive ? 'bg-amber-400 animate-pulse' :
                  isSuccess ? 'bg-emerald-500' :
                  isFailed ? 'bg-red-500' : 'bg-zinc-700'
                }`} />
                <span className="font-medium font-sans">{step.name}</span>
              </div>
              <ChevronRight className="w-3.5 h-3.5 opacity-40" />
            </div>
          );
        })}
      </div>
    </div>
  );
};


// ReviewRequestCard interface
export interface ReviewRequestCardProps {
  title: string;
  description: string;
  sourceFile: string;
  onApprove: () => void;
  onReject: () => void;
  state?: CardState;
}

export const ReviewRequestCard: React.FC<ReviewRequestCardProps> = ({
  title,
  description,
  sourceFile,
  onApprove,
  onReject,
  state = 'warning'
}) => {
  return (
    <div className="p-5 rounded-2xl bg-zinc-900 border border-amber-950/30 shadow-soft relative overflow-hidden">
      <div className="absolute top-0 left-0 w-[3px] h-full bg-amber-500" />
      
      <div className="flex gap-4">
        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-500 shrink-0">
          <ShieldAlert className="w-4 h-4" />
        </div>

        <div className="flex-1 space-y-4">
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold text-amber-500 uppercase tracking-wide">
                Review Requested
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">{sourceFile}</span>
            </div>
            <h4 className="text-sm font-display font-semibold text-white mt-1">
              {title}
            </h4>
            <p className="text-xs text-zinc-350 leading-relaxed mt-1.5">
              {description}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={onApprove}
              className="bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs py-1.5 px-3.5 rounded-lg shadow-sm transition duration-150"
            >
              Approve Lock
            </button>
            <button 
              onClick={onReject}
              className="bg-zinc-850 hover:bg-zinc-800 border border-zinc-800 text-zinc-300 font-medium text-xs py-1.5 px-3.5 rounded-lg transition duration-150"
            >
              Reject Action
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};


// ChangesSummaryCard interface
export interface FileDelta {
  file: string;
  additions: number;
  deletions: number;
  status: 'modified' | 'added' | 'removed';
}

export interface ChangesSummaryCardProps {
  commitMessage?: string;
  branchName: string;
  deltas: FileDelta[];
  onCommitClick?: () => void;
}

export const ChangesSummaryCard: React.FC<ChangesSummaryCardProps> = ({
  commitMessage = 'Refactor async cache layer',
  branchName,
  deltas,
  onCommitClick
}) => {
  return (
    <div className="p-5 rounded-2xl bg-zinc-900 border border-zinc-850 shadow-soft">
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-zinc-800 flex items-center justify-center">
            <GitPullRequest className="w-3.5 h-3.5 text-zinc-400" />
          </div>
          <div>
            <span className="text-[10px] text-zinc-500 font-semibold uppercase tracking-wider font-mono">
              Git Commit Staged
            </span>
            <div className="text-xs text-white font-medium">{branchName}</div>
          </div>
        </div>
        
        <button 
          onClick={onCommitClick}
          className="bg-emerald-700 hover:bg-emerald-600 text-white font-semibold text-[11px] py-1 px-2.5 rounded-md transition duration-150"
        >
          Push Staged
        </button>
      </div>

      <div className="p-3 bg-zinc-950 border border-zinc-850/60 rounded-xl mb-4">
        <div className="text-[10px] font-mono text-zinc-500 mb-1">PROPOSED COMMIT MESSAGE</div>
        <p className="text-xs text-zinc-200 font-sans leading-relaxed">
          {commitMessage}
        </p>
      </div>

      <div className="space-y-1.5">
        <div className="text-[10px] font-mono text-zinc-500 tracking-wider">FILES IMPACTED</div>
        {deltas.map((del, i) => (
          <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-zinc-950/20 text-xs">
            <div className="flex items-center gap-2">
              <FileText className="w-3.5 h-3.5 text-zinc-500" />
              <span className="font-mono text-zinc-300 truncate max-w-[150px]">{del.file}</span>
            </div>
            <div className="flex items-center gap-1.5 font-mono text-[10px]">
              <span className="text-emerald-500">+{del.additions}</span>
              <span className="text-red-500">-{del.deletions}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

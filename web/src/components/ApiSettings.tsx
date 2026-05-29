import React, { useState, useEffect } from 'react';
import { 
  Key, ShieldCheck, Cpu, Database, Save, RotateCcw, 
  HelpCircle, RefreshCw, BarChart3, AlertCircle, Sparkles, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { api, COMMON_MODELS, API_SCHEMAS } from '../api/api';
import { StatusResponse, CostResponse, ProvidersResponse } from '../types';

interface ApiSettingsProps {
  onNotify: (msg: string) => void;
  onConfigChange?: () => void;
  status: StatusResponse | null;
}

export function ApiSettings({ onNotify, onConfigChange, status }: ApiSettingsProps) {
  const [apiKey, setApiKeyState] = useState('');
  const [model, setModelState] = useState('');
  const [apiBase, setApiBaseState] = useState('');
  const [profile, setProfileState] = useState('');
  const [activeProvider, setActiveProvider] = useState('');
  
  const [costData, setCostData] = useState<CostResponse | null>(null);
  const [providersData, setProvidersData] = useState<ProvidersResponse | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [resettingCost, setResettingCost] = useState(false);

  // Sync state with parent-fed raw statuses
  useEffect(() => {
    if (status) {
      setModelState(status.activeModel || '');
      setProfileState(status.activeProfile || '');
      setActiveProvider(status.activeProvider || '');
    }
  }, [status]);

  // Load complementary cost data and provider specifics
  const loadCostAndProviders = async () => {
    try {
      const [costRes, providersRes] = await Promise.all([
        api.getCost().catch(() => null),
        api.getProviders().catch(() => null)
      ]);
      if (costRes) setCostData(costRes as any);
      if (providersRes) {
        setProvidersData(providersRes as any);
        const activeProv = providersRes.active ? providersRes.providers[providersRes.active] : null;
        if (activeProv) {
          setApiBaseState(activeProv.base_url || '');
          if (activeProv.api_key && !activeProv.api_key.includes('...')) {
            setApiKeyState(activeProv.api_key);
          }
        }
      }
    } catch (err) {
      console.warn("Could not load API parameters telemetry data.");
    }
  };

  useEffect(() => {
    loadCostAndProviders();
    // Load raw config to populate fields
    api.getRawConfig().then(cfg => {
      if (cfg.api_key && !apiKey) setApiKeyState(cfg.api_key);
      if (cfg.api_base && !apiBase) setApiBaseState(cfg.api_base);
    }).catch(() => {});
  }, []);

  const handleSaveEngine = async () => {
    setLoading(true);
    try {
      // 1. Set API Key
      if (apiKey) {
        await api.setApiKey(apiKey);
      }
      // 2. Set Model
      if (model) {
        await api.setModel(model);
      }
      // 3. Set Base URL
      if (apiBase) {
        await api.setApiBase(apiBase);
      }
      // 4. Set Profile
      if (profile) {
        await api.setProfile(profile);
      }

      onNotify("API configurations updated successfully!");
      if (onConfigChange) onConfigChange();
      await loadCostAndProviders();
    } catch (err: any) {
      onNotify(err.message || "Failed to persist API configuration changes");
    } finally {
      setLoading(false);
    }
  };

  const handleResetCost = async () => {
    setResettingCost(true);
    try {
      await api.resetCost();
      onNotify("API utilization tokens counter reset cleanly.");
      await loadCostAndProviders();
    } catch (e) {
      onNotify("Could not reset parameters.");
    } finally {
      setResettingCost(false);
    }
  };

  const handleProviderSelect = async (provId: string) => {
    try {
      await api.activateProvider(provId);
      onNotify(`Switched active provider context to ${provId}`);
      if (onConfigChange) onConfigChange();
      await loadCostAndProviders();
    } catch (err: any) {
      onNotify(`Failed to switch provider context: ${err.message}`);
    }
  };

  // Get available providers from backend data
  const availableProviders = providersData?.providers
    ? Object.keys(providersData.providers)
    : [];

  // Get common provider IDs (union of built-in + configured)
  const commonProviderIds = ['google', 'openai', 'anthropic', 'deepseek'];
  const allProviderIds = [...new Set([...commonProviderIds, ...availableProviders])];

  return (
    <div className="space-y-6 pt-1 select-text text-zinc-300">
      
      {/* Introduction */}
      <div className="p-4 bg-zinc-900/30 border border-zinc-900 rounded-xl flex gap-3 items-start">
        <Sparkles className="w-5 h-5 text-[#ff7043] shrink-0 mt-0.5" />
        <div className="space-y-1">
          <h5 className="text-xs font-semibold text-white">Engine parameters manager</h5>
          <p className="text-[11px] text-zinc-450 leading-relaxed">
            Modify target runtime engines, authorize secure cryptographic client credentials keys and review network usage telemetry.
          </p>
        </div>
      </div>

      {/* Provider Switch Panel */}
      <div className="space-y-2.5">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">LLM Service Providers</div>
        <div className="grid grid-cols-2 gap-2">
          {allProviderIds.map((prov) => {
            const isActive = activeProvider === prov;
            const isConfigured = availableProviders.includes(prov);
            return (
              <button
                key={prov}
                onClick={() => handleProviderSelect(prov)}
                className={`flex flex-col items-center justify-center p-3 rounded-xl border transition text-center cursor-pointer ${
                  isActive 
                    ? 'border-[#ff7043]/50 bg-[#ff7043]/5 text-white' 
                    : isConfigured
                      ? 'border-zinc-800 bg-zinc-950/40 hover:border-zinc-700 text-zinc-300 hover:text-white'
                      : 'border-zinc-900 bg-zinc-950/40 text-zinc-500 hover:border-zinc-800'
                }`}
              >
                <Database className={`w-4 h-4 mb-1.5 ${isActive ? 'text-[#ff7043]' : 'text-zinc-500'}`} />
                <span className="text-[10px] font-mono uppercase tracking-tight font-semibold">{prov}</span>
                {isConfigured && (
                  <span className="text-[8px] text-emerald-500 mt-1">configured</span>
                )}
              </button>
            );
          })}
        </div>
        {availableProviders.length === 0 && (
          <p className="text-[10px] text-zinc-500 text-center pt-1">
            No providers configured. Add providers via CLI: /provider add
          </p>
        )}
      </div>

      {/* Core Inputs */}
      <div className="space-y-4">
        <div className="text-[10px] font-mono uppercase tracking-widest text-[#ff7043] font-bold">Engine parameters</div>
        
        <div className="space-y-3.5 bg-zinc-950/60 p-4 rounded-xl border border-zinc-900">
          
          {/* API Key */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider flex items-center justify-between">
              <span>Service API Keys credentials</span>
              {status?.apiKeyConfigured && (
                <span className="text-emerald-500 font-mono lowercase text-[9px] flex items-center gap-1">
                  <ShieldCheck className="w-3 h-3" /> Configured
                </span>
              )}
            </label>
            <div className="relative">
              <input
                type="password"
                placeholder="sk-••••••••••••••••••••"
                value={apiKey}
                onChange={(e) => setApiKeyState(e.target.value)}
                className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg py-2 pl-8 pr-3 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-700 font-mono"
              />
              <Key className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5" />
            </div>
          </div>

          {/* Model Selector */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Active Execution Model</label>
            <div className="relative">
              <select
                value={model}
                onChange={(e) => setModelState(e.target.value)}
                className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg py-2 pl-8 pr-8 text-xs text-white focus:outline-none focus:border-zinc-700 min-h-[34px] cursor-pointer appearance-none"
              >
                <option value="">Select a model...</option>
                <optgroup label="Google Engines" className="bg-[#09090c]">
                  {COMMON_MODELS.filter(m => m.provider === 'google').map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
                <optgroup label="OpenAI Engines" className="bg-[#09090c]">
                  {COMMON_MODELS.filter(m => m.provider === 'openai').map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Anthropic Engines" className="bg-[#09090c]">
                  {COMMON_MODELS.filter(m => m.provider === 'anthropic').map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
                <optgroup label="DeepSeek Engines" className="bg-[#09090c]">
                  {COMMON_MODELS.filter(m => m.provider === 'deepseek').map(m => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                </optgroup>
              </select>
              <Cpu className="w-3.5 h-3.5 text-zinc-500 absolute left-2.5 top-2.5 pointer-events-none" />
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-zinc-500">
                <span className="text-[9px]">▼</span>
              </div>
            </div>
          </div>

          {/* Service Endpoint Base URL */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Service Endpoint base url</label>
            <input
              type="text"
              placeholder="https://api.openai.com/v1"
              value={apiBase}
              onChange={(e) => setApiBaseState(e.target.value)}
              className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg py-2 px-3 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-zinc-700 font-mono"
            />
          </div>

          {/* Config Profile */}
          <div className="space-y-1.5">
            <label className="text-[10px] uppercase font-bold text-zinc-400 tracking-wider">Config workflow profile</label>
            <input
              type="text"
              placeholder="default"
              value={profile}
              onChange={(e) => setProfileState(e.target.value)}
              className="w-full bg-zinc-900/80 border border-zinc-800 rounded-lg py-2 px-3 text-xs text-white placeholder-zinc-650 focus:outline-none focus:border-zinc-700 font-mono"
            />
          </div>

          {/* Action Trigger button */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={handleSaveEngine}
            disabled={loading}
            className="w-full bg-zinc-100 dark:bg-zinc-100 hover:bg-white text-zinc-950 font-semibold text-xs py-2 rounded-lg flex items-center justify-center gap-1.5 transition cursor-pointer mt-2 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{loading ? 'Storing Changes...' : 'Save Configuration'}</span>
          </motion.button>

        </div>
      </div>

      {/* Cost Telemetry Usage Indicators */}
      {costData && (
        <div className="space-y-3.5">
          <div className="text-[10px] font-mono uppercase tracking-widest text-[#ff7043] font-bold">API usage counter dashboard</div>
          
          <div className="bg-zinc-950/60 p-4 border border-zinc-900 rounded-xl space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-zinc-900/30 border border-zinc-900 rounded-lg space-y-1">
                <span className="text-[9px] uppercase text-zinc-500 font-medium">Session Queries</span>
                <div className="text-sm font-semibold text-white font-mono">{costData.session?.requests || 0} calls</div>
              </div>
              <div className="p-3 bg-[#111115] border border-zinc-900 rounded-lg space-y-1">
                <span className="text-[9px] uppercase text-[#ff7043] font-medium font-semibold">Total Price Estimation</span>
                <div className="text-sm font-bold text-emerald-400 font-mono">${(costData.total?.total_usd || 0).toFixed(4)}</div>
              </div>
            </div>

            {/* In depth token stats */}
            <div className="space-y-1.5 text-xs">
              <div className="flex justify-between items-center py-1 border-b border-zinc-900/40 text-[11px]">
                <span className="text-zinc-500">Session input tokens:</span>
                <span className="font-mono text-zinc-300">{(costData.session?.input_tokens || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-zinc-900/40 text-[11px]">
                <span className="text-zinc-500">Session output tokens:</span>
                <span className="font-mono text-zinc-300">{(costData.session?.output_tokens || 0).toLocaleString()}</span>
              </div>
              <div className="flex justify-between items-center py-1 border-b border-zinc-900/40 text-[11px]">
                <span className="text-zinc-500">Total Accum. queries:</span>
                <span className="font-mono text-white">{costData.total?.requests || 0} runs</span>
              </div>
            </div>

            <motion.button
              whileTap={{ scale: 0.98 }}
              onClick={handleResetCost}
              disabled={resettingCost}
              className="w-full bg-transparent border border-zinc-800 hover:bg-zinc-900/40 text-xs text-zinc-400 hover:text-white transition py-2 rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5 text-zinc-500" />
              <span>{resettingCost ? 'Clearing...' : 'Reset Telemetry Counters'}</span>
            </motion.button>
          </div>
        </div>
      )}

      {/* Add new provider section */}
      <div className="space-y-2">
        <div className="text-[10px] font-mono uppercase tracking-widest text-zinc-500 font-bold">Add New Provider</div>
        <p className="text-[10px] text-zinc-500">
          Use meow-cli CLI to add providers: <code className="text-zinc-300">/provider add my-provider --api-key ... --base-url ...</code>
        </p>
      </div>

    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Key, Globe, Cpu, Palette, Shield, User, Save,
  X, ChevronDown, Check, FileText, Plus, Trash2, Languages,
  GitBranch, Zap, Sliders, RefreshCw
} from 'lucide-react';
import { api, StatusResponse, API_SCHEMAS } from '../lib/api';

export interface SettingsProps {
  onClose: () => void;
  onConfigChange?: () => void;
}

type SettingsTab = 'general' | 'api' | 'providers' | 'profiles' | 'models' | 'templates' | 'about';

export const Settings: React.FC<SettingsProps> = ({ onClose, onConfigChange }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [config, setConfig] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  const [providers, setProviders] = useState<Record<string, any>>({});
  const [activeProvider, setActiveProvider] = useState('');
  const [profiles, setProfiles] = useState<Record<string, any>>({});
  const [newProfileName, setNewProfileName] = useState('');
  const [newProviderId, setNewProviderId] = useState('');
  const [providerForm, setProviderForm] = useState<Record<string, string>>({});
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [theme, setTheme] = useState('default');
  const [availableThemes, setAvailableThemes] = useState<Record<string, any>>({});
  const [lang, setLang] = useState('ru');

  const notify = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3000);
  };

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, c, p, profilesData, themeData] = await Promise.all([
        api.status(),
        api.getConfig(),
        api.getProviders(),
        api.getProfiles(),
        api.getTheme(),
      ]);
      setStatus(s);
      setConfig(c);
      setProviders(p.providers);
      setActiveProvider(p.active);
      setProfiles(profilesData);
      setTheme(themeData.current);
      setAvailableThemes(themeData.themes);
      setLang(c.lang || 'ru');
    } catch (e: any) {
      notify(`Error loading: ${e.message}`);
    }
    setLoading(false);
  };

  const saveConfigField = async (key: string, value: any) => {
    setSaving(true);
    try {
      const update = { [key]: value };
      await api.updateConfig(update);
      setConfig((prev) => ({ ...prev, [key]: value }));
      notify(`Saved: ${key}`);
      onConfigChange?.();
    } catch (e: any) {
      notify(`Error: ${e.message}`);
    }
    setSaving(false);
  };

  const handleApiKey = async () => {
    const key = config.api_key_raw || '';
    if (!key) return notify('Enter an API key');
    setSaving(true);
    try {
      await api.setApiKey(key);
      notify('API key saved');
      onConfigChange?.();
      loadData();
    } catch (e: any) {
      notify(`Error: ${e.message}`);
    }
    setSaving(false);
  };

  const handleSetModel = async (model: string) => {
    setSaving(true);
    try {
      await api.setModel(model);
      setConfig((prev) => ({ ...prev, model }));
      notify(`Model set to ${model}`);
      onConfigChange?.();
    } catch (e: any) {
      notify(`Error: ${e.message}`);
    }
    setSaving(false);
  };

  const handleActivateProvider = async (id: string) => {
    setSaving(true);
    try {
      await api.activateProvider(id);
      setActiveProvider(id);
      notify(`Provider '${id}' activated`);
      onConfigChange?.();
    } catch (e: any) {
      notify(`Error: ${e.message}`);
    }
    setSaving(false);
  };

  const handleDeleteProvider = async (id: string) => {
    setSaving(true);
    try {
      await api.deleteProvider(id);
      const { [id]: _, ...rest } = providers;
      setProviders(rest);
      if (activeProvider === id) setActiveProvider('');
      notify(`Provider '${id}' deleted`);
    } catch (e: any) {
      notify(`Error: ${e.message}`);
    }
    setSaving(false);
  };

  const handleAddProvider = async () => {
    if (!newProviderId) return notify('Enter provider ID');
    setSaving(true);
    try {
      await api.createProvider(newProviderId, {
        base_url: providerForm.base_url || '',
        api_key: providerForm.api_key || '',
        model: providerForm.model || '',
        api_schema: providerForm.api_schema || 'openai',
      });
      setProviders((prev) => ({
        ...prev,
        [newProviderId]: {
          base_url: providerForm.base_url || '',
          api_key: '••••••••',
          model: providerForm.model || '',
          api_schema: providerForm.api_schema || 'openai',
        },
      }));
      setNewProviderId('');
      setProviderForm({});
      setShowAddProvider(false);
      notify(`Provider '${newProviderId}' created`);
    } catch (e: any) {
      notify(`Error: ${e.message}`);
    }
    setSaving(false);
  };

  const handleSetTheme = async (t: string) => {
    setSaving(true);
    try {
      await api.setTheme(t);
      setTheme(t);
      notify(`Theme set to '${t}'`);
    } catch (e: any) {
      notify(`Error: ${e.message}`);
    }
    setSaving(false);
  };

  const handleSaveProfile = async (name: string, data: Record<string, any>) => {
    setSaving(true);
    try {
      await api.saveProfile(name, data);
      setProfiles((prev) => ({ ...prev, [name]: { ...prev[name], ...data } }));
      notify(`Profile '${name}' saved`);
    } catch (e: any) {
      notify(`Error: ${e.message}`);
    }
    setSaving(false);
  };

  const handleDeleteProfile = async (name: string) => {
    setSaving(true);
    try {
      await api.deleteProfile(name);
      const { [name]: _, ...rest } = profiles;
      setProfiles(rest);
      notify(`Profile '${name}' deleted`);
    } catch (e: any) {
      notify(`Error: ${e.message}`);
    }
    setSaving(false);
  };

  const handleLangChange = async (l: string) => {
    setLang(l);
    await saveConfigField('lang', l);
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ReactNode }[] = [
    { id: 'general', label: 'General', icon: <Sliders className="w-3.5 h-3.5" /> },
    { id: 'api', label: 'API Key', icon: <Key className="w-3.5 h-3.5" /> },
    { id: 'providers', label: 'Providers', icon: <Globe className="w-3.5 h-3.5" /> },
    { id: 'profiles', label: 'Profiles', icon: <User className="w-3.5 h-3.5" /> },
    { id: 'models', label: 'Model', icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: 'templates', label: 'Templates', icon: <FileText className="w-3.5 h-3.5" /> },
    { id: 'about', label: 'About', icon: <Shield className="w-3.5 h-3.5" /> },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-amber-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-[#070709]">
      {/* Notification Toast */}
      <AnimatePresence>
        {notification && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="absolute top-4 right-4 z-50 bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 shadow-xl"
          >
            {notification}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-zinc-900 flex items-center justify-between bg-[#070709]">
        <div className="flex items-center gap-3">
          <div className="w-6 h-6 rounded-md bg-zinc-900 border border-zinc-800 flex items-center justify-center">
            <Sliders className="w-3.5 h-3.5 text-amber-500" />
          </div>
          <h2 className="text-sm font-semibold text-white">Settings</h2>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-white transition cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Tab Bar */}
      <div className="shrink-0 flex gap-1 px-4 py-3 border-b border-zinc-900 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-zinc-800 text-white border border-zinc-700'
                : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
            }`}
          >
            {tab.icon}
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* ── General ── */}
        {activeTab === 'general' && (
          <div className="max-w-xl space-y-6">
            {/* Language */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
                <Languages className="w-3 h-3" /> Language / Язык
              </label>
              <div className="flex gap-2">
                {['ru', 'en'].map((l) => (
                  <button
                    key={l}
                    onClick={() => handleLangChange(l)}
                    className={`px-4 py-2 rounded-lg text-xs font-medium border transition cursor-pointer ${
                      lang === l
                        ? 'bg-zinc-800 border-zinc-700 text-white'
                        : 'bg-zinc-900 border-zinc-850 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {l === 'ru' ? '🇷🇺 Русский' : '🇬🇧 English'}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
                <Palette className="w-3 h-3" /> Theme
              </label>
              <div className="flex flex-wrap gap-2">
                {Object.keys(availableThemes).length > 0
                  ? Object.entries(availableThemes).map(([t, colors]: [string, any]) => (
                      <button
                        key={t}
                        onClick={() => handleSetTheme(t)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition cursor-pointer flex items-center gap-2 ${
                          theme === t
                            ? 'bg-zinc-800 border-zinc-700 text-white'
                            : 'bg-zinc-900 border-zinc-850 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <span
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: colors.accent || '#CC7832' }}
                        />
                        <span className="capitalize">{t}</span>
                        {theme === t && <Check className="w-3 h-3 text-emerald-500" />}
                      </button>
                    ))
                  : ['default', 'dark', 'ocean', 'forest', 'sunset'].map((t) => (
                      <button
                        key={t}
                        onClick={() => handleSetTheme(t)}
                        className={`px-3 py-2 rounded-lg text-xs font-medium border transition cursor-pointer ${
                          theme === t
                            ? 'bg-zinc-800 border-zinc-700 text-white'
                            : 'bg-zinc-900 border-zinc-850 text-zinc-400 hover:text-zinc-200'
                        }`}
                      >
                        <span className="capitalize">{t}</span>
                      </button>
                    ))}
              </div>
            </div>

            {/* Auto-approve */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> Behavior
              </label>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-900 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.auto_yes || false}
                    onChange={(e) => saveConfigField('auto_yes', e.target.checked)}
                    className="rounded border-zinc-700 text-amber-500 focus:ring-amber-500/30"
                  />
                  <div>
                    <div className="text-xs font-medium text-zinc-200">Auto-approve</div>
                    <div className="text-[10px] text-zinc-500">Automatically approve tool execution</div>
                  </div>
                </label>

                <label className="flex items-center gap-3 p-3 bg-zinc-900/50 border border-zinc-900 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.quiet || false}
                    onChange={(e) => saveConfigField('quiet', e.target.checked)}
                    className="rounded border-zinc-700 text-amber-500 focus:ring-amber-500/30"
                  />
                  <div>
                    <div className="text-xs font-medium text-zinc-200">Quiet mode</div>
                    <div className="text-[10px] text-zinc-500">Minimal output in terminal</div>
                  </div>
                </label>
              </div>
            </div>

            {/* Git Settings */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
                <GitBranch className="w-3 h-3" /> Git
              </label>
              <div className="space-y-2 bg-zinc-900/30 border border-zinc-900 rounded-xl p-4">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.git?.autocommit || false}
                    onChange={(e) => saveConfigField('git', { ...config.git, autocommit: e.target.checked })}
                    className="rounded border-zinc-700 text-amber-500 focus:ring-amber-500/30"
                  />
                  <span className="text-xs text-zinc-300">Auto-commit changes</span>
                </label>
                <div>
                  <label className="text-[10px] text-zinc-500">Commit prefix</label>
                  <input
                    type="text"
                    value={config.git?.prefix || ''}
                    onChange={(e) => saveConfigField('git', { ...config.git, prefix: e.target.value })}
                    className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                    placeholder="e.g. feat, fix"
                  />
                </div>
              </div>
            </div>

            {/* Autopilot Settings */}
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold flex items-center gap-1.5">
                <Cpu className="w-3 h-3" /> Autopilot
              </label>
              <div className="space-y-2 bg-zinc-900/30 border border-zinc-900 rounded-xl p-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] text-zinc-500">Max iterations</label>
                    <input
                      type="number"
                      value={config.autopilot?.max_iterations || 50}
                      onChange={(e) =>
                        saveConfigField('autopilot', { ...config.autopilot, max_iterations: parseInt(e.target.value) || 50 })
                      }
                      className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">Max errors</label>
                    <input
                      type="number"
                      value={config.autopilot?.max_errors || 5}
                      onChange={(e) =>
                        saveConfigField('autopilot', { ...config.autopilot, max_errors: parseInt(e.target.value) || 5 })
                      }
                      className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── API Key ── */}
        {activeTab === 'api' && (
          <div className="max-w-xl space-y-6">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">API Key</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={config.api_key_raw || ''}
                  onChange={(e) => setConfig((prev) => ({ ...prev, api_key_raw: e.target.value }))}
                  className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                  placeholder="sk-... or your API key"
                />
                <button
                  onClick={handleApiKey}
                  disabled={saving}
                  className="bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-4 py-2 rounded-xl transition disabled:opacity-50 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                </button>
              </div>
              {config.api_key && (
                <p className="text-[10px] text-emerald-500 font-mono">
                  ✓ Key configured: {config.api_key}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">API Base URL</label>
              <input
                type="text"
                value={config.api_base || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, api_base_temp: e.target.value }))}
                onBlur={(e) => saveConfigField('api_base', e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                placeholder="https://api.openai.com/v1"
              />
              <p className="text-[10px] text-zinc-500">
                Current: <span className="font-mono text-zinc-400">{config.api_base || 'https://api.openai.com/v1'}</span>
              </p>
            </div>

            <div className="p-4 bg-amber-950/10 border border-amber-900/20 rounded-xl">
              <p className="text-[11px] text-amber-400/80 leading-relaxed">
                <strong>Note:</strong> You can also configure multiple providers in the Providers tab.
                Each provider can have its own API key, base URL, and model.
              </p>
            </div>
          </div>
        )}

        {/* ── Providers ── */}
        {activeTab === 'providers' && (
          <div className="max-w-xl space-y-4">
            {/* Provider list */}
            {Object.entries(providers).map(([id, prov]: [string, any]) => (
              <div
                key={id}
                className={`p-4 rounded-xl border transition ${
                  activeProvider === id
                    ? 'bg-zinc-900/60 border-amber-700/40'
                    : 'bg-zinc-900/30 border-zinc-900'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className={`w-2 h-2 rounded-full ${
                        activeProvider === id ? 'bg-emerald-500' : 'bg-zinc-600'
                      }`}
                    />
                    <span className="text-sm font-semibold text-white">{id}</span>
                    {activeProvider === id && (
                      <span className="text-[9px] uppercase tracking-wider bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 font-bold">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {activeProvider !== id && (
                      <button
                        onClick={() => handleActivateProvider(id)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
                      >
                        Activate
                      </button>
                    )}
                    <button
                      onClick={() => handleDeleteProvider(id)}
                      className="p-1.5 rounded-lg hover:bg-red-950/30 text-zinc-500 hover:text-red-400 transition cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                  <div>
                    <span className="text-zinc-500">Base URL:</span>
                    <span className="text-zinc-300 ml-1">{prov.base_url || '—'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Model:</span>
                    <span className="text-zinc-300 ml-1">{prov.model || '—'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">Schema:</span>
                    <span className="text-zinc-300 ml-1">{prov.api_schema || 'openai'}</span>
                  </div>
                  <div>
                    <span className="text-zinc-500">API Key:</span>
                    <span className="text-zinc-300 ml-1">{prov.api_key || '—'}</span>
                  </div>
                </div>
              </div>
            ))}

            {/* Add provider button */}
            {!showAddProvider ? (
              <button
                onClick={() => setShowAddProvider(true)}
                className="w-full p-3 border-2 border-dashed border-zinc-800 rounded-xl text-xs text-zinc-500 hover:text-zinc-300 hover:border-zinc-700 transition cursor-pointer flex items-center justify-center gap-2"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Provider
              </button>
            ) : (
              <div className="p-4 bg-zinc-900/50 border border-zinc-800 rounded-xl space-y-3">
                <h4 className="text-xs font-semibold text-white">New Provider</h4>
                <input
                  type="text"
                  value={newProviderId}
                  onChange={(e) => setNewProviderId(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                  placeholder="Provider ID (e.g. openai, anthropic)"
                />
                <input
                  type="text"
                  value={providerForm.base_url || ''}
                  onChange={(e) => setProviderForm((p) => ({ ...p, base_url: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                  placeholder="Base URL (e.g. https://api.openai.com/v1)"
                />
                <input
                  type="password"
                  value={providerForm.api_key || ''}
                  onChange={(e) => setProviderForm((p) => ({ ...p, api_key: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                  placeholder="API Key"
                />
                <input
                  type="text"
                  value={providerForm.model || ''}
                  onChange={(e) => setProviderForm((p) => ({ ...p, model: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                  placeholder="Default model (e.g. gpt-4o)"
                />
                <select
                  value={providerForm.api_schema || 'openai'}
                  onChange={(e) => setProviderForm((p) => ({ ...p, api_schema: e.target.value }))}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                >
                  {API_SCHEMAS.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleAddProvider}
                    disabled={saving}
                    className="flex-1 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold py-2 rounded-lg transition disabled:opacity-50 cursor-pointer"
                  >
                    Save Provider
                  </button>
                  <button
                    onClick={() => setShowAddProvider(false)}
                    className="px-4 py-2 rounded-lg bg-zinc-800 text-zinc-300 text-xs hover:bg-zinc-700 transition cursor-pointer"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Profiles ── */}
        {activeTab === 'profiles' && (
          <div className="max-w-xl space-y-4">
            {Object.entries(profiles).map(([name, profile]: [string, any]) => (
              <div key={name} className="p-4 bg-zinc-900/30 border border-zinc-900 rounded-xl">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white capitalize">{name}</span>
                    {config.profile === name && (
                      <span className="text-[9px] uppercase tracking-wider bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded border border-emerald-500/20 font-bold">
                        Active
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    {config.profile !== name && (
                      <button
                        onClick={() => api.setProfile(name).then(loadData)}
                        className="text-[10px] px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition cursor-pointer"
                      >
                        Use
                      </button>
                    )}
                    {name !== 'default' && (
                      <button
                        onClick={() => handleDeleteProfile(name)}
                        className="p-1.5 rounded-lg hover:bg-red-950/30 text-zinc-500 hover:text-red-400 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[10px] text-zinc-500">Temperature</label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={profile.temperature || 0.2}
                      onChange={(e) => handleSaveProfile(name, { ...profile, temperature: parseFloat(e.target.value) })}
                      className="w-full accent-amber-500"
                    />
                    <span className="text-[10px] text-zinc-400">{profile.temperature || 0.2}</span>
                  </div>
                  <div>
                    <label className="text-[10px] text-zinc-500">System Prompt</label>
                    <textarea
                      value={profile.system || ''}
                      onChange={(e) => {
                        const updated = { ...profiles, [name]: { ...profile, system: e.target.value } };
                        setProfiles(updated);
                      }}
                      onBlur={(e) => handleSaveProfile(name, { ...profile, system: e.target.value })}
                      className="w-full mt-1 bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700 resize-none font-mono"
                      rows={3}
                      placeholder="System prompt for this profile..."
                    />
                  </div>
                </div>
              </div>
            ))}

            {/* Add profile */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newProfileName}
                onChange={(e) => setNewProfileName(e.target.value)}
                className="flex-1 bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 focus:outline-none focus:border-zinc-700"
                placeholder="New profile name..."
              />
              <button
                onClick={async () => {
                  if (!newProfileName) return;
                  await handleSaveProfile(newProfileName, { temperature: 0.5, system: '' });
                  setNewProfileName('');
                }}
                className="bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold px-4 py-2 rounded-xl transition cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* ── Models ── */}
        {activeTab === 'models' && (
          <div className="max-w-xl space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                Current Model
              </label>
              <input
                type="text"
                value={config.model || ''}
                onChange={(e) => setConfig((prev) => ({ ...prev, model_temp: e.target.value }))}
                onBlur={(e) => e.target.value && handleSetModel(e.target.value)}
                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700"
                placeholder="e.g. gpt-4o, claude-sonnet-4-20250514"
              />
            </div>

            <div className="space-y-2">
              <label className="text-[10px] uppercase tracking-widest text-zinc-500 font-bold">
                Common Models
              </label>
              <div className="space-y-1">
                {[
                  { group: 'OpenAI', models: ['gpt-4-turbo', 'gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo'] },
                  { group: 'Anthropic', models: ['claude-sonnet-4-20250514', 'claude-opus-4-20250514', 'claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022'] },
                  { group: 'DeepSeek', models: ['deepseek-chat', 'deepseek-coder'] },
                  { group: 'Google', models: ['gemini-2.0-flash', 'gemini-2.0-pro', 'gemini-1.5-pro'] },
                ].map((group) => (
                  <div key={group.group} className="mb-2">
                    <div className="text-[9px] uppercase tracking-wider text-zinc-600 font-bold mb-1 px-1">
                      {group.group}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {group.models.map((m) => (
                        <button
                          key={m}
                          onClick={() => handleSetModel(m)}
                          className={`px-2.5 py-1.5 rounded-lg text-[10px] font-mono border transition cursor-pointer ${
                            config.model === m
                              ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                              : 'bg-zinc-900/50 border-zinc-850 text-zinc-400 hover:text-zinc-200 hover:border-zinc-700'
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── Templates ── */}
        {activeTab === 'templates' && (
          <div className="max-w-xl space-y-4">
            <div className="text-[10px] text-zinc-500 leading-relaxed">
              Prompt templates are reusable message patterns. Use {'{code}'}, {'{file}'}, {'{context}'} as variables.
            </div>
            {config.templates &&
              Object.entries(config.templates as Record<string, string>).map(([name, tmpl]) => (
                <div key={name} className="p-4 bg-zinc-900/30 border border-zinc-900 rounded-xl">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-semibold text-white capitalize">{name}</span>
                  </div>
                  <textarea
                    value={tmpl}
                    onChange={(e) => {
                      const updated = { ...config.templates, [name]: e.target.value };
                      setConfig((prev) => ({ ...prev, templates: updated }));
                    }}
                    onBlur={() => saveConfigField('templates', config.templates)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:outline-none focus:border-zinc-700 resize-none"
                    rows={2}
                  />
                </div>
              ))}
          </div>
        )}

        {/* ── About ── */}
        {activeTab === 'about' && (
          <div className="max-w-xl space-y-6">
            <div className="p-6 bg-zinc-900/30 border border-zinc-900 rounded-2xl text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto">
                <span className="text-3xl">🐱</span>
              </div>
              <h3 className="text-lg font-semibold text-white">Meow CLI Web</h3>
              <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed">
                Web interface for Meow CLI — a powerful terminal-based AI agent with
                streaming, permissions, checkpoints, and autonomous mode.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="p-4 bg-zinc-900/30 border border-zinc-900 rounded-xl">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Version</div>
                <div className="text-sm font-semibold text-white">3.0.4</div>
              </div>
              <div className="p-4 bg-zinc-900/30 border border-zinc-900 rounded-xl">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Data Directory</div>
                <div className="text-xs font-mono text-zinc-300 truncate">
                  ~/.meowcli/data
                </div>
              </div>
              <div className="p-4 bg-zinc-900/30 border border-zinc-900 rounded-xl">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Status</div>
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${status?.apiKeyConfigured ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  <span className="text-xs text-zinc-300">
                    {status?.apiKeyConfigured ? 'API Configured' : 'No API Key'}
                  </span>
                </div>
              </div>
              <div className="p-4 bg-zinc-900/30 border border-zinc-900 rounded-xl">
                <div className="text-[9px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Active Model</div>
                <div className="text-xs font-mono text-zinc-300 truncate">
                  {status?.activeModel || 'Not set'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

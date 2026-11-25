import React, { useState, useEffect, useCallback } from 'react';
import {
  Zap,
  Send,
  Mail,
  Truck,
  Globe,
  Database,
  RefreshCw,
  Power,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  SlidersHorizontal,
  ExternalLink,
  Clock,
  ShieldCheck,
  Activity,
  Cpu,
  Lock,
  Check,
  X,
  Play,
  RotateCcw,
} from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';

interface AutomationService {
  id: string;
  name: string;
  category: string;
  enabled: boolean;
  status: 'connected' | 'configuring' | 'disconnected' | 'error';
  maskedKey?: string;
  latencyMs?: number;
  description: string;
  lastChecked?: string;
  details?: Record<string, any>;
}

interface AutomationSummary {
  totalServices: number;
  activeCount: number;
  averageLatencyMs: number;
  overallStatus: 'healthy' | 'degraded';
  timestamp: string;
}

interface AutomationCenterModuleProps {
  onShowToast?: (message: string, type: 'success' | 'error' | 'info' | 'warning') => void;
}

export const AutomationCenterModule: React.FC<AutomationCenterModuleProps> = ({ onShowToast }) => {
  const { t } = useLanguage();

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [summary, setSummary] = useState<AutomationSummary | null>(null);
  const [services, setServices] = useState<AutomationService[]>([]);
  const [testingServiceId, setTestingServiceId] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; message: string; latencyMs: number }>>({});
  const [selectedServiceForConfig, setSelectedServiceForConfig] = useState<AutomationService | null>(null);
  const [isTogglingId, setIsTogglingId] = useState<string | null>(null);

  // Helper fetch with timeout (Rule 11)
  const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 8000) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const token = localStorage.getItem('pine_auth_token') || sessionStorage.getItem('pine_auth_token') || '';
      const headers = {
        'Content-Type': 'application/json',
        Authorization: token ? `Bearer ${token}` : '',
        ...(options.headers || {}),
      };
      const res = await fetch(url, { ...options, headers, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err: any) {
      clearTimeout(timer);
      throw err;
    }
  };

  // Load automation status
  const loadStatus = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsLoading(true);
    else setIsRefreshing(true);

    try {
      const res = await fetchWithTimeout('/api/admin/automation/status');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          setSummary(data.summary);
          setServices(data.services || []);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        if (onShowToast) onShowToast(err.message || t('automationCenter.fetchError'), 'error');
      }
    } catch (err: any) {
      if (onShowToast) {
        onShowToast(
          err.name === 'AbortError'
            ? t('automationCenter.timeoutError')
            : (err.message || t('automationCenter.networkError')),
          'error'
        );
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [t, onShowToast]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Test single service connection
  const handleTestService = async (serviceId: string) => {
    setTestingServiceId(serviceId);
    try {
      const res = await fetchWithTimeout('/api/admin/automation/test', {
        method: 'POST',
        body: JSON.stringify({ serviceId }),
      });
      const data = await res.json().catch(() => ({}));

      setTestResults((prev) => ({
        ...prev,
        [serviceId]: {
          success: Boolean(data.success),
          message: data.message || (data.success ? t('automationCenter.testOk') : t('automationCenter.testFailed')),
          latencyMs: data.latencyMs || 0,
        },
      }));

      if (data.success) {
        if (onShowToast) onShowToast(data.message, 'success');
        // Update latency in service state
        setServices((prev) =>
          prev.map((s) => (s.id === serviceId ? { ...s, status: 'connected', latencyMs: data.latencyMs } : s))
        );
      } else {
        if (onShowToast) onShowToast(data.message, 'warning');
      }
    } catch (err: any) {
      const errMsg = err.name === 'AbortError' ? t('automationCenter.timeoutShort') : err.message;
      setTestResults((prev) => ({
        ...prev,
        [serviceId]: {
          success: false,
          message: errMsg,
          latencyMs: 8000,
        },
      }));
      if (onShowToast) onShowToast(errMsg, 'error');
    } finally {
      setTestingServiceId(null);
    }
  };

  // Test all services in sequence with timeout
  const handleTestAll = async () => {
    if (services.length === 0) return;
    if (onShowToast) onShowToast(t('automationCenter.testingAllToast'), 'info');

    for (const s of services) {
      await handleTestService(s.id);
    }
    loadStatus(true);
  };

  // Toggle service on/off
  const handleToggleService = async (service: AutomationService) => {
    const nextState = !service.enabled;
    setIsTogglingId(service.id);

    try {
      const res = await fetchWithTimeout('/api/admin/automation/config', {
        method: 'POST',
        body: JSON.stringify({ serviceId: service.id, enabled: nextState }),
      });

      if (res.ok) {
        setServices((prev) =>
          prev.map((s) => (s.id === service.id ? { ...s, enabled: nextState } : s))
        );
        if (onShowToast) {
          onShowToast(
            t('automationCenter.toggledToast', {
              state: nextState ? t('automationCenter.stateEnabled') : t('automationCenter.stateDisabled'),
              name: service.name,
            }),
            'success'
          );
        }
      } else {
        const err = await res.json().catch(() => ({}));
        if (onShowToast) onShowToast(err.message || t('automationCenter.updateFailed'), 'error');
      }
    } catch (err: any) {
      if (onShowToast) onShowToast(err.message || t('automationCenter.networkError'), 'error');
    } finally {
      setIsTogglingId(null);
    }
  };

  // Icon mapping
  const getServiceIcon = (id: string) => {
    switch (id) {
      case 'sepay':
        return <Zap className="w-5 h-5 text-amber-500" />;
      case 'telegram':
        return <Send className="w-5 h-5 text-sky-500" />;
      case 'resend':
        return <Mail className="w-5 h-5 text-emerald-500" />;
      case 'shipping':
        return <Truck className="w-5 h-5 text-indigo-500" />;
      case 'google':
        return <Globe className="w-5 h-5 text-rose-500" />;
      case 'd1':
        return <Database className="w-5 h-5 text-cyan-500" />;
      default:
        return <Cpu className="w-5 h-5 text-purple-500" />;
    }
  };

  return (
    <div className="w-full space-y-4 max-w-full overflow-hidden">
      {/* 1. TOP METRIC STRIP (Single-Screen First) */}
      <div className="bg-slate-900/80 backdrop-blur border border-slate-800 rounded-xl p-3 sm:p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center">
            <Cpu className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-base sm:text-lg font-bold text-white">
                {t('automationCenter.title')}
              </h1>
              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {summary?.overallStatus === 'healthy' ? t('automationCenter.statusHealthy') : t('automationCenter.statusDegraded')}
              </span>
            </div>
            <p className="text-xs text-slate-400">
              {t('automationCenter.subtitle')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Active Services Badge */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-1.5 text-center">
            <div className="text-[10px] uppercase font-bold text-slate-400">{t('automationCenter.activeChannels')}</div>
            <div className="text-sm font-extrabold text-white">
              <span className="text-emerald-400">{summary?.activeCount || 0}</span> / {summary?.totalServices || 6}
            </div>
          </div>

          {/* Average Latency */}
          <div className="bg-slate-800/80 border border-slate-700/60 rounded-lg px-3 py-1.5 text-center">
            <div className="text-[10px] uppercase font-bold text-slate-400">{t('automationCenter.avgLatency')}</div>
            <div className="text-sm font-extrabold text-cyan-400">
              {summary?.averageLatencyMs ? `${summary.averageLatencyMs}ms` : '--'}
            </div>
          </div>

          {/* Actions */}
          <button
            onClick={() => loadStatus(true)}
            disabled={isRefreshing || isLoading}
            className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-xs font-semibold border border-slate-700 transition cursor-pointer disabled:opacity-50"
            title={t('automationCenter.refreshTitle')}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-purple-400' : ''}`} />
            <span className="hidden sm:inline">{t('automationCenter.refresh')}</span>
          </button>

          <button
            onClick={handleTestAll}
            disabled={Boolean(testingServiceId) || isLoading}
            className="flex items-center gap-1.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white px-3.5 py-2 rounded-lg text-xs font-bold shadow-md hover:shadow-purple-500/20 transition cursor-pointer disabled:opacity-50"
          >
            <Activity className="w-3.5 h-3.5" />
            <span>{t('automationCenter.testAll')}</span>
          </button>
        </div>
      </div>

      {/* 2. SERVICES GRID (3 Columns on Desktop, Zero Horizontal Overflow) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        {services.map((service) => {
          const isTesting = testingServiceId === service.id;
          const isToggling = isTogglingId === service.id;
          const result = testResults[service.id];

          return (
            <div
              key={service.id}
              className={`bg-slate-900/70 border rounded-xl p-3.5 sm:p-4 flex flex-col justify-between transition-all duration-200 shadow-sm ${
                service.enabled
                  ? 'border-slate-800 hover:border-slate-700'
                  : 'border-slate-800/50 opacity-60 bg-slate-950/40'
              }`}
            >
              <div>
                {/* Card Top: Icon, Name & Status */}
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="p-2 rounded-lg bg-slate-800 border border-slate-700/60 shrink-0">
                      {getServiceIcon(service.id)}
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-white truncate" title={service.name}>
                        {service.name}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`w-2 h-2 rounded-full shrink-0 ${
                            service.status === 'connected'
                              ? 'bg-emerald-400 animate-pulse'
                              : service.status === 'configuring'
                              ? 'bg-amber-400'
                              : 'bg-rose-400'
                          }`}
                        />
                        <span className="text-[11px] font-semibold uppercase text-slate-300">
                          {service.status === 'connected'
                            ? t('automationCenter.connected')
                            : service.status === 'configuring'
                            ? t('automationCenter.configuring')
                            : t('automationCenter.disconnected')}
                        </span>
                        {service.latencyMs !== undefined && (
                          <span className="text-[10px] text-cyan-400 font-mono">
                            • {service.latencyMs}ms
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Toggle Switch */}
                  <button
                    onClick={() => handleToggleService(service)}
                    disabled={isToggling}
                    className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                      service.enabled ? 'bg-purple-600' : 'bg-slate-700'
                    }`}
                    title={service.enabled ? t('automationCenter.disableService') : t('automationCenter.enableService')}
                  >
                    <span
                      className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                        service.enabled ? 'translate-x-4' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>

                {/* Description */}
                <p className="text-xs text-slate-400 line-clamp-2 mb-3 min-h-[32px]">
                  {service.description}
                </p>

                {/* Masked Secret Key / Identity Preview */}
                {service.maskedKey ? (
                  <div className="bg-slate-950/60 border border-slate-800 rounded-lg px-2.5 py-1.5 mb-3 flex items-center justify-between text-xs">
                    <span className="text-slate-400 font-mono text-[11px] flex items-center gap-1.5">
                      <Lock className="w-3 h-3 text-slate-500" />
                      {service.maskedKey}
                    </span>
                    <span className="text-[10px] text-slate-400 bg-slate-800 px-1.5 py-0.2 rounded font-semibold">
                      {t('automationCenter.secured')}
                    </span>
                  </div>
                ) : (
                  <div className="bg-slate-950/40 border border-dashed border-slate-800 rounded-lg px-2.5 py-1.5 mb-3 text-xs text-slate-400 italic">
                    {service.id === 'd1'
                      ? t('automationCenter.d1Binding')
                      : t('automationCenter.noKeyConfigured')}
                  </div>
                )}

                {/* Live Test Result Banner (if tested recently) */}
                {result && (
                  <div
                    className={`mb-3 p-2 rounded-lg text-xs flex items-start gap-2 border ${
                      result.success
                        ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
                        : 'bg-rose-500/10 border-rose-500/20 text-rose-300'
                    }`}
                  >
                    {result.success ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-emerald-400" />
                    ) : (
                      <XCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-rose-400" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{result.message}</div>
                      {result.latencyMs > 0 && (
                        <div className="text-[10px] opacity-80 mt-0.5 font-mono">
                          {t('automationCenter.responseTime')} {result.latencyMs}ms
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Card Footer: Buttons */}
              <div className="flex items-center gap-2 pt-2 border-t border-slate-800/80">
                <button
                  onClick={() => handleTestService(service.id)}
                  disabled={isTesting || !service.enabled}
                  className="flex-1 bg-slate-800 hover:bg-slate-700 text-slate-200 py-1.5 px-2.5 rounded-lg text-xs font-semibold border border-slate-700/80 flex items-center justify-center gap-1.5 transition cursor-pointer disabled:opacity-40"
                >
                  <Play className={`w-3 h-3 ${isTesting ? 'animate-spin text-purple-400' : 'text-slate-400'}`} />
                  <span>{isTesting ? t('automationCenter.testing') : t('automationCenter.testConnection')}</span>
                </button>

                <button
                  onClick={() => setSelectedServiceForConfig(service)}
                  className="bg-slate-800/70 hover:bg-slate-700 text-slate-300 py-1.5 px-3 rounded-lg text-xs font-semibold border border-slate-700 flex items-center justify-center gap-1 transition cursor-pointer"
                  title={t('automationCenter.viewParams')}
                >
                  <SlidersHorizontal className="w-3 h-3 text-slate-400" />
                  <span className="hidden sm:inline">{t('automationCenter.details')}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 3. MODAL SERVICE DETAILS & PARAMETERS */}
      {selectedServiceForConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden divide-y divide-slate-800">
            {/* Modal Header */}
            <div className="p-4 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-slate-800 border border-slate-700">
                  {getServiceIcon(selectedServiceForConfig.id)}
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">{selectedServiceForConfig.name}</h3>
                  <p className="text-xs text-slate-400">{t('automationCenter.modalSubtitle')}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedServiceForConfig(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">{t('automationCenter.modalStatus')}</label>
                <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-950/80 border border-slate-800">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      selectedServiceForConfig.status === 'connected' ? 'bg-emerald-400' : 'bg-rose-400'
                    }`}
                  />
                  <span className="text-xs font-semibold text-white uppercase">
                    {selectedServiceForConfig.status === 'connected'
                      ? t('automationCenter.modalConnectedOp')
                      : t('automationCenter.modalNotConnected')}
                  </span>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-400 uppercase">{t('automationCenter.modalActiveKey')}</label>
                <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800 font-mono text-xs text-slate-300">
                  {selectedServiceForConfig.maskedKey || t('automationCenter.modalEnvFallback')}
                </div>
              </div>

              {selectedServiceForConfig.details && Object.keys(selectedServiceForConfig.details).length > 0 && (
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-400 uppercase">{t('automationCenter.modalRuntimeDetails')}</label>
                  <pre className="p-3 rounded-lg bg-slate-950/90 border border-slate-800 text-[11px] font-mono text-slate-300 overflow-x-auto">
                    {JSON.stringify(selectedServiceForConfig.details, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 sm:p-4 bg-slate-950/50 flex items-center justify-between">
              <button
                onClick={() => handleTestService(selectedServiceForConfig.id)}
                disabled={Boolean(testingServiceId)}
                className="bg-purple-600 hover:bg-purple-500 text-white px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-1.5 transition cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                <span>{t('automationCenter.runLiveTest')}</span>
              </button>

              <button
                onClick={() => setSelectedServiceForConfig(null)}
                className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-4 py-2 rounded-lg text-xs font-semibold border border-slate-700 transition cursor-pointer"
              >
                {t('automationCenter.close')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

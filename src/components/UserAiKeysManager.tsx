import React, { useState, useEffect } from 'react';
import {
  Sparkles,
  KeyRound,
  Shield,
  ShieldAlert,
  Copy,
  Check,
  AlertTriangle,
  Clock,
  Laptop,
  Wallet,
  Trash2,
  Edit2,
  RefreshCw,
  X,
  ExternalLink,
  Ban,
  Activity,
  CheckCircle2,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useLanguage } from '../context/LanguageContext';
import type { UserProfile } from '../types/game';
import { formatCore } from '../utils/textUtils';

interface UserAiKey {
  id: string;
  name: string;
  key_prefix: string;
  scopes: string[];
  wallet_permissions: {
    wallet_view: boolean;
    wallet_deposit: boolean;
    wallet_pay: boolean;
    seller_withdraw: boolean;
  };
  daily_spend_limit: number;
  daily_spent_today: number;
  daily_spent_date: string;
  daily_withdraw_limit: number;
  max_devices: number;
  connected_devices: number;
  unacknowledged_alerts: number;
  is_active: boolean;
  call_count: number;
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string;
  last_used_endpoint: string;
  last_used_ip: string;
  created_at: string;
}

interface SecurityAlert {
  id: string;
  key_id: string;
  key_name: string;
  key_prefix: string;
  ip_address: string;
  device_id: string;
  max_devices: number;
  first_alert_at: string;
  email_sent_count: number;
}

interface ApiLog {
  id: string;
  endpoint: string;
  method: string;
  status_code: number;
  ip_address: string;
  device_id: string;
  error_code: string;
  response_summary: string;
  created_at: string;
}

interface ConnectedDevice {
  id: string;
  ip_address: string;
  device_id: string;
  first_seen_at: string;
  last_seen_at: string;
  is_blocked: number;
}

interface UserAiKeysManagerProps {
  currentUser: UserProfile | null;
  onShowToast: (title: string, message?: string, type?: 'success' | 'error' | 'info') => void;
  isDarkMode?: boolean;
}

export const UserAiKeysManager: React.FC<UserAiKeysManagerProps> = ({
  currentUser,
  onShowToast,
  isDarkMode,
}) => {
  const { t, language } = useLanguage();
  const isEn = language === 'en';

  const [keys, setKeys] = useState<UserAiKey[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'active' | 'revoked'>('active');

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingKey, setEditingKey] = useState<UserAiKey | null>(null);
  const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState(false);

  // Logs modal
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [activeLogsKey, setActiveLogsKey] = useState<UserAiKey | null>(null);
  const [logs, setLogs] = useState<ApiLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Devices modal
  const [showDevicesModal, setShowDevicesModal] = useState(false);
  const [activeDevicesKey, setActiveDevicesKey] = useState<UserAiKey | null>(null);
  const [devices, setDevices] = useState<ConnectedDevice[]>([]);
  const [isLoadingDevices, setIsLoadingDevices] = useState(false);

  // Form states
  const [formName, setFormName] = useState('');
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formMaxDevices, setFormMaxDevices] = useState(3);
  const [formScopes, setFormScopes] = useState<string[]>([
    'profile',
    'shopping',
    'reviews',
    'disputes',
    'seller',
    'rewards',
    'notifications',
  ]);
  const [formWalletPerms, setFormWalletPerms] = useState({
    wallet_view: false,
    wallet_deposit: false,
    wallet_pay: false,
    seller_withdraw: false,
  });
  const [formDailySpendLimit, setFormDailySpendLimit] = useState(500000);
  const [formDailyWithdrawLimit, setFormDailyWithdrawLimit] = useState(1000000);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const getAuthToken = () => {
    return (
      (typeof localStorage !== 'undefined' ? localStorage.getItem('pine_auth_token') : '') ||
      (typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('pine_auth_token') : '') ||
      ''
    );
  };

  const fetchKeys = async () => {
    setIsLoading(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/user/ai-keys', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.keys)) {
        setKeys(data.keys);
      }
    } catch (e) {
      console.warn('Failed to fetch AI keys:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchAlerts = async () => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/user/ai-keys/alerts', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.alerts)) {
        setAlerts(data.alerts);
      }
    } catch (e) {
      console.warn('Failed to fetch security alerts:', e);
    }
  };

  useEffect(() => {
    fetchKeys();
    fetchAlerts();
  }, []);

  const handleOpenCreate = () => {
    setFormName(isEn ? 'My AI Assistant' : 'Trợ lý Muse của tôi');
    setFormExpiresAt('');
    setFormMaxDevices(3);
    setFormScopes(['profile', 'shopping', 'reviews', 'disputes', 'seller', 'rewards', 'notifications']);
    setFormWalletPerms({
      wallet_view: false,
      wallet_deposit: false,
      wallet_pay: false,
      seller_withdraw: false,
    });
    setFormDailySpendLimit(500000);
    setFormDailyWithdrawLimit(1000000);
    setShowCreateModal(true);
  };

  const handleOpenEdit = (key: UserAiKey) => {
    setEditingKey(key);
    setFormName(key.name);
    setFormExpiresAt(key.expires_at ? key.expires_at.slice(0, 10) : '');
    setFormMaxDevices(key.max_devices || 3);
    setFormScopes(key.scopes || []);
    setFormWalletPerms(key.wallet_permissions || {
      wallet_view: false,
      wallet_deposit: false,
      wallet_pay: false,
      seller_withdraw: false,
    });
    setFormDailySpendLimit(key.daily_spend_limit || 500000);
    setFormDailyWithdrawLimit(key.daily_withdraw_limit || 1000000);
    setShowEditModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      onShowToast(isEn ? 'Error' : 'Lỗi', isEn ? 'Please enter a key name.' : 'Vui lòng nhập tên gợi ý cho khóa.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const token = getAuthToken();
      const res = await fetch('/api/user/ai-keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formName.trim(),
          expires_at: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
          max_devices: formMaxDevices,
          scopes: formScopes,
          wallet_permissions: formWalletPerms,
          daily_spend_limit: formDailySpendLimit,
          daily_withdraw_limit: formDailyWithdrawLimit,
        }),
      });

      const data = await res.json();
      if (data.success && data.key?.rawKey) {
        setShowCreateModal(false);
        setCreatedRawKey(data.key.rawKey);
        confetti({ particleCount: 50, spread: 60, origin: { y: 0.6 } });
        onShowToast(isEn ? 'Key Created!' : 'Tạo Khóa Thành Công!', data.message, 'success');
        fetchKeys();
      } else {
        onShowToast(isEn ? 'Error' : 'Lỗi', data.error || 'Failed to create key.', 'error');
      }
    } catch (e: any) {
      onShowToast(isEn ? 'Network Error' : 'Lỗi Mạng', String(e?.message || e), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingKey) return;

    setIsSubmitting(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/user/ai-keys/${editingKey.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          name: formName.trim(),
          expires_at: formExpiresAt ? new Date(formExpiresAt).toISOString() : null,
          max_devices: formMaxDevices,
          scopes: formScopes,
          wallet_permissions: formWalletPerms,
          daily_spend_limit: formDailySpendLimit,
          daily_withdraw_limit: formDailyWithdrawLimit,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowEditModal(false);
        onShowToast(isEn ? 'Success' : 'Thành Công', isEn ? 'Updated key configuration successfully.' : 'Cập nhật cấu hình khóa thành công.', 'success');
        fetchKeys();
      } else {
        onShowToast(isEn ? 'Error' : 'Lỗi', data.error || 'Failed to update key.', 'error');
      }
    } catch (e: any) {
      onShowToast(isEn ? 'Network Error' : 'Lỗi Mạng', String(e?.message || e), 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRevokeKey = async (key: UserAiKey) => {
    const confirmMsg = t('aiApiKeys.revokeConfirm', { name: key.name });
    if (!window.confirm(confirmMsg)) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/user/ai-keys/${key.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(isEn ? 'Revoked' : 'Đã Thu Hồi', t('aiApiKeys.revokeSuccess'), 'success');
        fetchKeys();
      } else {
        onShowToast(isEn ? 'Error' : 'Lỗi', data.error || 'Failed to revoke key.', 'error');
      }
    } catch (e: any) {
      onShowToast(isEn ? 'Network Error' : 'Lỗi Mạng', String(e?.message || e), 'error');
    }
  };

  const handleRevokeAll = async () => {
    const confirmMsg = t('aiApiKeys.emergencyRevokeConfirm');
    if (!window.confirm(confirmMsg)) return;

    try {
      const token = getAuthToken();
      const res = await fetch('/api/user/ai-keys/revoke-all', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(isEn ? 'Emergency Disconnect' : 'Ngắt Khẩn Cấp', t('aiApiKeys.emergencyRevokeSuccess', { count: data.revokedCount }), 'success');
        fetchKeys();
      } else {
        onShowToast(isEn ? 'Error' : 'Lỗi', data.error || 'Failed to revoke keys.', 'error');
      }
    } catch (e: any) {
      onShowToast(isEn ? 'Network Error' : 'Lỗi Mạng', String(e?.message || e), 'error');
    }
  };

  const handleAcknowledgeAlert = async (alertId?: string) => {
    try {
      const token = getAuthToken();
      const res = await fetch('/api/user/ai-keys/alerts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ alertId }),
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(isEn ? 'Confirmed' : 'Đã Xác Nhận', t('aiApiKeys.alertAcknowledged'), 'success');
        fetchAlerts();
        fetchKeys();
      }
    } catch (e) {
      console.warn('Failed to acknowledge alert:', e);
    }
  };

  const handleViewLogs = async (key: UserAiKey) => {
    setActiveLogsKey(key);
    setShowLogsModal(true);
    setIsLoadingLogs(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/user/ai-keys/${key.id}/logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setLogs(data.logs);
      }
    } catch (e) {
      console.warn('Failed to fetch logs:', e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const handleViewDevices = async (key: UserAiKey) => {
    setActiveDevicesKey(key);
    setShowDevicesModal(true);
    setIsLoadingDevices(true);
    try {
      const token = getAuthToken();
      const res = await fetch(`/api/user/ai-keys/${key.id}/devices`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.devices)) {
        setDevices(data.devices);
      }
    } catch (e) {
      console.warn('Failed to fetch devices:', e);
    } finally {
      setIsLoadingDevices(false);
    }
  };

  const handleRemoveDevice = async (deviceRowId: string) => {
    if (!activeDevicesKey) return;
    if (!window.confirm(t('aiApiKeys.removeDeviceConfirm'))) return;

    try {
      const token = getAuthToken();
      const res = await fetch(`/api/user/ai-keys/${activeDevicesKey.id}/devices`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ deviceRowId }),
      });
      const data = await res.json();
      if (data.success) {
        onShowToast(isEn ? 'Success' : 'Thành Công', t('aiApiKeys.removeDeviceSuccess'), 'success');
        handleViewDevices(activeDevicesKey);
        fetchKeys();
      } else {
        onShowToast(isEn ? 'Error' : 'Lỗi', data.error || 'Failed to remove device.', 'error');
      }
    } catch (e: any) {
      onShowToast(isEn ? 'Network Error' : 'Lỗi Mạng', String(e?.message || e), 'error');
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const toggleScope = (scope: string) => {
    if (formScopes.includes(scope)) {
      setFormScopes(formScopes.filter((s) => s !== scope));
    } else {
      setFormScopes([...formScopes, scope]);
    }
  };

  const activeKeysList = keys.filter((k) => k.is_active);
  const revokedKeysList = keys.filter((k) => !k.is_active);

  return (
    <div className="space-y-6">
      {/* 1. Security Alert Banner (Nhóm 4) */}
      {alerts.length > 0 && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 space-y-3 animate-pulse">
          <div className="flex items-start gap-3">
            <ShieldAlert className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <h4 className="font-bold text-rose-200">{t('aiApiKeys.securityAlertBannerTitle')}</h4>
              {alerts.map((al) => (
                <p key={al.id} className="mt-1 text-xs text-rose-300">
                  {t('aiApiKeys.securityAlertBannerDesc', { name: al.key_name, ip: al.ip_address })}
                  <span className="ml-2 font-mono text-[10px] bg-rose-950/60 px-1.5 py-0.5 rounded">
                    Device: {al.device_id || 'Unknown'} (Alerts sent: {al.email_sent_count}/24h)
                  </span>
                </p>
              ))}
            </div>
            <button
              onClick={() => handleAcknowledgeAlert()}
              className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold transition-colors cursor-pointer shrink-0"
            >
              {t('aiApiKeys.acknowledgeAlert')}
            </button>
          </div>
        </div>
      )}

      {/* 2. Top Header Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800">
        <div>
          <div className="flex items-center gap-2">
            <KeyRound className="w-5 h-5 text-indigo-400" />
            <h3 className="font-bold text-slate-100 text-base">{t('aiApiKeys.tabTitle')}</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">{t('aiApiKeys.tabDesc')}</p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all shadow-lg shadow-indigo-600/20 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>{t('aiApiKeys.createBtn')}</span>
          </button>

          {activeKeysList.length > 0 && (
            <button
              onClick={handleRevokeAll}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/30 text-xs font-bold transition-all cursor-pointer"
              title={t('aiApiKeys.emergencyRevokeAll')}
            >
              <Ban className="w-3.5 h-3.5" />
              <span>{t('aiApiKeys.emergencyRevokeAll')}</span>
            </button>
          )}
        </div>
      </div>

      {/* 3. Sub Tabs (Active / Revoked) */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-2">
        <button
          onClick={() => setActiveTab('active')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'active'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <span>{t('aiApiKeys.activeKeys')}</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-900">
            {activeKeysList.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('revoked')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
            activeTab === 'revoked'
              ? 'bg-slate-800 text-white'
              : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
          }`}
        >
          <span>{t('aiApiKeys.revokedKeys')}</span>
          <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-slate-900">
            {revokedKeysList.length}
          </span>
        </button>

        <button
          onClick={fetchKeys}
          className="ml-auto p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-400' : ''}`} />
        </button>
      </div>

      {/* 4. Keys List */}
      <div className="space-y-3">
        {isLoading && keys.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-xs animate-pulse">Loading keys...</div>
        ) : (activeTab === 'active' ? activeKeysList : revokedKeysList).length === 0 ? (
          <div className="p-8 rounded-xl bg-slate-900/40 border border-slate-800/60 text-center">
            <KeyRound className="w-8 h-8 text-slate-600 mx-auto mb-2 opacity-50" />
            <p className="text-slate-400 text-xs">{t('aiApiKeys.noKeys')}</p>
          </div>
        ) : (
          (activeTab === 'active' ? activeKeysList : revokedKeysList).map((key) => {
            const isExpired = key.expires_at && new Date(key.expires_at).getTime() < Date.now();
            return (
              <div
                key={key.id}
                className={`p-4 rounded-xl border transition-all ${
                  !key.is_active
                    ? 'bg-slate-950/40 border-slate-900 opacity-60'
                    : isExpired
                    ? 'bg-amber-950/10 border-amber-500/20'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200 text-sm">{key.name}</span>
                      {key.is_active && !isExpired ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          {t('aiApiKeys.statusActive')}
                        </span>
                      ) : isExpired ? (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {t('aiApiKeys.statusExpired')}
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          {t('aiApiKeys.statusRevoked')}
                        </span>
                      )}

                      {key.unacknowledged_alerts > 0 && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-500 text-white animate-pulse">
                          {key.unacknowledged_alerts} ALERT
                        </span>
                      )}
                    </div>

                    {/* Key Prefix & Copy */}
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-indigo-400 bg-slate-950 px-2.5 py-1 rounded border border-slate-800">
                        {key.key_prefix}
                      </span>
                      <button
                        onClick={() => handleCopyText(key.key_prefix)}
                        className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                        title="Copy Prefix"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1.5 self-end sm:self-center">
                    <button
                      onClick={() => handleViewLogs(key)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                      title={t('aiApiKeys.viewLogs')}
                    >
                      <Activity className="w-3 h-3 text-cyan-400" />
                      <span>{t('aiApiKeys.viewLogs')}</span>
                    </button>

                    <button
                      onClick={() => handleViewDevices(key)}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                      title={t('aiApiKeys.viewDevices')}
                    >
                      <Laptop className="w-3 h-3 text-amber-400" />
                      <span>{t('aiApiKeys.viewDevices')}</span>
                    </button>

                    {key.is_active && (
                      <>
                        <button
                          onClick={() => handleOpenEdit(key)}
                          className="px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1"
                          title={t('aiApiKeys.editBtn')}
                        >
                          <Edit2 className="w-3 h-3 text-indigo-400" />
                          <span>{t('aiApiKeys.editBtn')}</span>
                        </button>

                        <button
                          onClick={() => handleRevokeKey(key)}
                          className="px-2.5 py-1.5 rounded-lg bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 text-xs font-medium border border-rose-500/20 transition-colors cursor-pointer flex items-center gap-1"
                          title={t('aiApiKeys.revokeBtn')}
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>{t('aiApiKeys.revokeBtn')}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Badges / Metrics bar */}
                <div className="mt-3 pt-3 border-t border-slate-800/80 flex flex-wrap items-center gap-2 text-[11px] text-slate-400">
                  <span className="flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 rounded">
                    <Laptop className="w-3 h-3 text-slate-400" />
                    <span>
                      {t('aiApiKeys.connectedDevices', { current: key.connected_devices, max: key.max_devices })}
                    </span>
                  </span>

                  <span className="flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 rounded">
                    <Activity className="w-3 h-3 text-slate-400" />
                    <span>{t('aiApiKeys.callCount', { count: key.call_count })}</span>
                  </span>

                  {key.expires_at ? (
                    <span className="flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 rounded">
                      <Clock className="w-3 h-3 text-slate-400" />
                      <span>Hết hạn: {key.expires_at.slice(0, 10)}</span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 bg-slate-950/60 px-2 py-0.5 rounded text-emerald-400/80">
                      <Clock className="w-3 h-3" />
                      <span>{t('aiApiKeys.neverExpires')}</span>
                    </span>
                  )}

                  {/* Wallet status */}
                  {key.wallet_permissions?.wallet_pay ? (
                    <span className="flex items-center gap-1 bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded">
                      <Wallet className="w-3 h-3" />
                      <span>
                        Ví Pay: {Number(key.daily_spent_today || 0).toLocaleString('vi-VN')}đ / {Number(key.daily_spend_limit || 0).toLocaleString('vi-VN')}đ/ngày
                      </span>
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 bg-slate-950/60 text-slate-500 px-2 py-0.5 rounded">
                      <Wallet className="w-3 h-3" />
                      <span>Ví: Tắt chi tiêu</span>
                    </span>
                  )}

                  {/* Scopes count */}
                  <span className="ml-auto text-slate-500">
                    Scopes: {key.scopes?.join(', ') || 'None'}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 5. Create / Edit Key Modal */}
      {(showCreateModal || showEditModal) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="relative w-full max-w-xl my-8 p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-indigo-400" />
                <h3 className="font-bold text-base">
                  {showCreateModal ? t('aiApiKeys.modalCreateTitle') : t('aiApiKeys.modalEditTitle')}
                </h3>
              </div>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setShowEditModal(false);
                }}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={showCreateModal ? handleCreateSubmit : handleEditSubmit} className="space-y-4 text-xs">
              {/* Tên gợi ý */}
              <div>
                <label className="block font-bold text-slate-300 mb-1">{t('aiApiKeys.keyNameLabel')}</label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={t('aiApiKeys.keyNamePlaceholder')}
                  className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-indigo-500 text-xs"
                />
              </div>

              {/* Ngày hết hạn & Giới hạn thiết bị */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-300 mb-1">{t('aiApiKeys.expiresAtLabel')}</label>
                  <input
                    type="date"
                    value={formExpiresAt}
                    onChange={(e) => setFormExpiresAt(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">{t('aiApiKeys.expiresAtDesc')}</p>
                </div>

                <div>
                  <label className="block font-bold text-slate-300 mb-1">{t('aiApiKeys.maxDevicesLabel')}</label>
                  <input
                    type="number"
                    min="1"
                    max="50"
                    value={formMaxDevices}
                    onChange={(e) => setFormMaxDevices(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 focus:outline-none focus:border-indigo-500 text-xs"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">{t('aiApiKeys.maxDevicesDesc')}</p>
                </div>
              </div>

              {/* Scopes Section (Nhóm 2) */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
                <span className="font-bold text-slate-200 block">{t('aiApiKeys.scopesTitle')}</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                  {[
                    { id: 'profile', label: t('aiApiKeys.scopeProfile') },
                    { id: 'shopping', label: t('aiApiKeys.scopeShopping') },
                    { id: 'reviews', label: t('aiApiKeys.scopeReviews') },
                    { id: 'disputes', label: t('aiApiKeys.scopeDisputes') },
                    { id: 'seller', label: t('aiApiKeys.scopeSeller') },
                    { id: 'rewards', label: t('aiApiKeys.scopeRewards') },
                    { id: 'notifications', label: t('aiApiKeys.scopeNotifications') },
                  ].map((sc) => (
                    <label key={sc.id} className="flex items-center gap-2 cursor-pointer hover:text-slate-200">
                      <input
                        type="checkbox"
                        checked={formScopes.includes(sc.id)}
                        onChange={() => toggleScope(sc.id)}
                        className="rounded bg-slate-900 border-slate-700 text-indigo-600 focus:ring-0"
                      />
                      <span>{sc.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Wallet Section (Nhóm 3) */}
              <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-500/30 space-y-3">
                <div>
                  <span className="font-bold text-amber-300 block flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-amber-400" />
                    <span>{t('aiApiKeys.walletSectionTitle')}</span>
                  </span>
                  <p className="text-[10px] text-amber-400/80 mt-0.5">{t('aiApiKeys.walletSectionDesc')}</p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-300">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formWalletPerms.wallet_view}
                      onChange={(e) => setFormWalletPerms({ ...formWalletPerms, wallet_view: e.target.checked })}
                      className="rounded bg-slate-900 border-amber-500 text-amber-500 focus:ring-0"
                    />
                    <span>{t('aiApiKeys.permWalletView')}</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formWalletPerms.wallet_deposit}
                      onChange={(e) => setFormWalletPerms({ ...formWalletPerms, wallet_deposit: e.target.checked })}
                      className="rounded bg-slate-900 border-amber-500 text-amber-500 focus:ring-0"
                    />
                    <span>{t('aiApiKeys.permWalletDeposit')}</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formWalletPerms.wallet_pay}
                      onChange={(e) => setFormWalletPerms({ ...formWalletPerms, wallet_pay: e.target.checked })}
                      className="rounded bg-slate-900 border-amber-500 text-amber-500 focus:ring-0"
                    />
                    <span className="font-bold text-amber-300">{t('aiApiKeys.permWalletPay')}</span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formWalletPerms.seller_withdraw}
                      onChange={(e) => setFormWalletPerms({ ...formWalletPerms, seller_withdraw: e.target.checked })}
                      className="rounded bg-slate-900 border-amber-500 text-amber-500 focus:ring-0"
                    />
                    <span>{t('aiApiKeys.permSellerWithdraw')}</span>
                  </label>
                </div>

                {formWalletPerms.wallet_pay && (
                  <div className="pt-2 border-t border-amber-500/20">
                    <label className="block font-bold text-amber-300 mb-1">{t('aiApiKeys.dailySpendLimitLabel')}</label>
                    <input
                      type="number"
                      step="10000"
                      min="0"
                      value={formDailySpendLimit}
                      onChange={(e) => setFormDailySpendLimit(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-amber-500/40 text-amber-200 focus:outline-none focus:border-amber-400 text-xs font-mono"
                    />
                    <p className="text-[10px] text-amber-400/80 mt-1">{t('aiApiKeys.dailySpendLimitDesc')}</p>
                  </div>
                )}
              </div>

              {/* Submit buttons */}
              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setShowEditModal(false);
                  }}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold cursor-pointer"
                >
                  {t('aiApiKeys.cancel')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-bold transition-all shadow-lg shadow-indigo-600/20 cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{showCreateModal ? t('aiApiKeys.createBtn') : t('aiApiKeys.saveChanges')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Raw Key Reveal Modal (Nhóm 1 - Chỉ hiện 1 lần duy nhất) */}
      {createdRawKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="relative w-full max-w-lg p-6 rounded-2xl bg-slate-900 border border-indigo-500/40 shadow-2xl text-slate-100 space-y-4">
            <div className="flex items-center gap-2 text-indigo-400">
              <KeyRound className="w-6 h-6 animate-bounce" />
              <h3 className="font-bold text-base">{t('aiApiKeys.modalCreateTitle')}</h3>
            </div>

            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
              <h4 className="font-bold flex items-center gap-1.5 text-amber-200">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{t('aiApiKeys.rawKeyWarningTitle')}</span>
              </h4>
              <p className="text-[11px] leading-relaxed">{t('aiApiKeys.rawKeyWarningDesc')}</p>
            </div>

            <div className="space-y-1.5">
              <span className="text-xs text-slate-400 font-bold block">Khóa API của bạn (Secret Token):</span>
              <div className="flex items-center gap-2 p-3 rounded-xl bg-slate-950 border border-slate-800">
                <code className="flex-1 font-mono text-xs text-emerald-400 break-all select-all font-bold">
                  {createdRawKey}
                </code>
                <button
                  onClick={() => handleCopyText(createdRawKey)}
                  className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold transition-all flex items-center gap-1.5 shrink-0 cursor-pointer"
                >
                  {copiedKey ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{copiedKey ? t('aiApiKeys.copied') : t('aiApiKeys.copyKey')}</span>
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                onClick={() => setCreatedRawKey(null)}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-bold transition-colors cursor-pointer"
              >
                {t('aiApiKeys.close')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Logs Modal (Nhóm 5) */}
      {showLogsModal && activeLogsKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-2xl max-h-[85vh] p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 text-cyan-400" />
                  <span>{t('aiApiKeys.logsTitle')}: {activeLogsKey.name}</span>
                </h3>
                <span className="text-[11px] font-mono text-slate-400">{activeLogsKey.key_prefix}</span>
              </div>
              <button
                onClick={() => setShowLogsModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {isLoadingLogs ? (
                <div className="p-8 text-center text-slate-500 text-xs animate-pulse">Loading call logs...</div>
              ) : logs.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">{t('aiApiKeys.noLogs')}</div>
              ) : (
                logs.map((lg) => (
                  <div
                    key={lg.id}
                    className="p-2.5 rounded-lg bg-slate-950 border border-slate-800/80 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-indigo-400">{lg.method}</span>
                        <span className="font-mono text-slate-200">{lg.endpoint}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            lg.status_code >= 200 && lg.status_code < 300
                              ? 'bg-emerald-500/10 text-emerald-400'
                              : 'bg-rose-500/10 text-rose-400'
                          }`}
                        >
                          {lg.status_code}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-2">
                        <span>IP: {lg.ip_address}</span>
                        {lg.device_id && <span>Dev: {lg.device_id}</span>}
                        {lg.error_code && <span className="text-rose-400 font-bold">[{lg.error_code}]</span>}
                      </div>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {lg.created_at?.slice(0, 19).replace('T', ' ')}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* 8. Devices Modal (Nhóm 4) */}
      {showDevicesModal && activeDevicesKey && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="relative w-full max-w-xl max-h-[85vh] p-6 rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl text-slate-100 flex flex-col space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div>
                <h3 className="font-bold text-sm flex items-center gap-2">
                  <Laptop className="w-4 h-4 text-amber-400" />
                  <span>{t('aiApiKeys.devicesTitle')}: {activeDevicesKey.name}</span>
                </h3>
                <span className="text-[11px] text-slate-400">
                  {devices.length} / {activeDevicesKey.max_devices} slots used
                </span>
              </div>
              <button
                onClick={() => setShowDevicesModal(false)}
                className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {isLoadingDevices ? (
                <div className="p-8 text-center text-slate-500 text-xs animate-pulse">Loading connected devices...</div>
              ) : devices.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-xs">{t('aiApiKeys.noDevices')}</div>
              ) : (
                devices.map((dev) => (
                  <div
                    key={dev.id}
                    className="p-3 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <Laptop className="w-3.5 h-3.5 text-amber-400" />
                        <span className="font-mono text-slate-200 font-bold">{dev.ip_address}</span>
                        {dev.device_id && (
                          <span className="text-[10px] font-mono bg-slate-900 text-slate-400 px-1.5 py-0.5 rounded">
                            {dev.device_id}
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500">
                        First seen: {dev.first_seen_at?.slice(0, 19).replace('T', ' ')} | Last active: {dev.last_seen_at?.slice(0, 19).replace('T', ' ')}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemoveDevice(dev.id)}
                      className="px-2.5 py-1 rounded bg-rose-600/10 hover:bg-rose-600/20 text-rose-400 border border-rose-500/20 text-[11px] font-medium transition-colors cursor-pointer flex items-center gap-1"
                      title={t('aiApiKeys.removeDevice')}
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>{t('aiApiKeys.removeDevice')}</span>
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

import React, { useState, useEffect } from 'react';
import {
  Share2,
  Link2,
  CheckSquare,
  Package,
  Store,
  RefreshCw,
  Clock,
  Send,
  X,
  Check,
  Copy,
  CheckCircle2,
} from 'lucide-react';

interface SellerAffiliateManagerProps {
  getHeaders: () => Record<string, string>;
  isEn: boolean;
  t: (key: string, fallback?: string, params?: any) => string;
  products: any[];
  fetchProducts: () => void;
}

export const SellerAffiliateManager: React.FC<SellerAffiliateManagerProps> = ({
  getHeaders,
  isEn,
  t,
  fetchProducts,
}) => {
  // Navigation & Sub-tab State
  const [affiliateSubTab, setAffiliateSubTab] = useState<'supplier' | 'reseller'>('supplier');

  // Supplier State
  const [affiliateRequests, setAffiliateRequests] = useState<any[]>([]);
  const [loadingAffiliateRequests, setLoadingAffiliateRequests] = useState<boolean>(false);
  const [affiliatePartners, setAffiliatePartners] = useState<any[]>([]);
  const [loadingAffiliatePartners, setLoadingAffiliatePartners] = useState<boolean>(false);
  const [approvedRawKeyData, setApprovedRawKeyData] = useState<{ partnerShopName: string; rawKey: string } | null>(null);
  const [isApprovingId, setIsApprovingId] = useState<string | null>(null);
  const [isRejectingId, setIsRejectingId] = useState<string | null>(null);
  const [isRevokingId, setIsRevokingId] = useState<string | null>(null);
  const [copiedAffiliateKey, setCopiedAffiliateKey] = useState<boolean>(false);

  // Reseller Sub-tab State
  const [supplierCodeInput, setSupplierCodeInput] = useState<string>('');
  const [requestNoteInput, setRequestNoteInput] = useState<string>('');
  const [isSendingAffiliateReq, setIsSendingAffiliateReq] = useState<boolean>(false);
  const [sentAffiliateRequests, setSentAffiliateRequests] = useState<any[]>([]);
  const [loadingSentRequests, setLoadingSentRequests] = useState<boolean>(false);
  const [selectedSupplierForCatalog, setSelectedSupplierForCatalog] = useState<any | null>(null);
  const [supplierCatalog, setSupplierCatalog] = useState<any[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(false);
  const [myAffiliateListings, setMyAffiliateListings] = useState<any[]>([]);
  const [loadingListings, setLoadingListings] = useState<boolean>(false);

  // Listing Assignment Modal State
  const [showAssignModal, setShowAssignModal] = useState<boolean>(false);
  const [assignTargetProduct, setAssignTargetProduct] = useState<any | null>(null);
  const [assignMarkupType, setAssignMarkupType] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [assignMarkupValue, setAssignMarkupValue] = useState<string>('10');
  const [assignPriceMode, setAssignPriceMode] = useState<'FORMULA' | 'LOCKED'>('FORMULA');
  const [assignShowSupplier, setAssignShowSupplier] = useState<boolean>(true);
  const [isSavingListing, setIsSavingListing] = useState<boolean>(false);

  // Feedback Messages
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [successMsg, setSuccessMsg] = useState<string>('');

  // Fetch Affiliate Data
  const fetchAffiliateRequests = async () => {
    setLoadingAffiliateRequests(true);
    try {
      const res = await fetch('/api/seller/affiliate/requests', { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setAffiliateRequests(data.requests || []);
      }
    } catch {}
    setLoadingAffiliateRequests(false);
  };

  const fetchAffiliatePartners = async () => {
    setLoadingAffiliatePartners(true);
    try {
      const res = await fetch('/api/seller/affiliate/partners', { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setAffiliatePartners(data.partners || []);
      }
    } catch {}
    setLoadingAffiliatePartners(false);
  };

  const fetchSentRequests = async () => {
    setLoadingSentRequests(true);
    try {
      const res = await fetch('/api/seller/affiliate/requests?type=sent', { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setSentAffiliateRequests(data.requests || []);
      }
    } catch {}
    setLoadingSentRequests(false);
  };

  const fetchAffiliateListings = async () => {
    setLoadingListings(true);
    try {
      const res = await fetch('/api/seller/affiliate/listings', { headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setMyAffiliateListings(data.listings || []);
      }
    } catch {}
    setLoadingListings(false);
  };

  const fetchSupplierCatalog = async (supplierId: string, supplierName?: string) => {
    setLoadingCatalog(true);
    setSelectedSupplierForCatalog({ id: supplierId, name: supplierName || supplierId });
    try {
      const res = await fetch(`/api/seller/affiliate/catalog?supplier_id=${supplierId}`, { credentials: 'include', headers: getHeaders() });
      const data = await res.json();
      if (data.success) {
        setSupplierCatalog(data.products || []);
      } else {
        setErrorMsg(data.error || 'Failed to fetch catalog');
      }
    } catch {
      setErrorMsg('Network error fetching catalog');
    }
    setLoadingCatalog(false);
  };

  useEffect(() => {
    fetchAffiliateRequests();
    fetchAffiliatePartners();
    fetchSentRequests();
    fetchAffiliateListings();
  }, []);

  const handleApproveRequest = async (id: string, shopName: string) => {
    if (!window.confirm(t('sellerAffiliate.approveConfirm', 'Duyệt yêu cầu này?'))) return;
    setIsApprovingId(id);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/seller/affiliate/requests/${id}/approve`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success && data.rawKey) {
        setApprovedRawKeyData({ partnerShopName: shopName, rawKey: data.rawKey });
        setSuccessMsg(data.message);
        fetchAffiliateRequests();
        fetchAffiliatePartners();
      } else {
        setErrorMsg(data.error || 'Failed to approve');
      }
    } catch {
      setErrorMsg('Error connecting to server');
    }
    setIsApprovingId(null);
  };

  const handleRejectRequest = async (id: string) => {
    if (!window.confirm(t('sellerAffiliate.rejectConfirm', 'Từ chối yêu cầu này?'))) return;
    setIsRejectingId(id);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/seller/affiliate/requests/${id}/reject`, {
        method: 'POST',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        fetchAffiliateRequests();
      } else {
        setErrorMsg(data.error || 'Failed to reject');
      }
    } catch {
      setErrorMsg('Error connecting to server');
    }
    setIsRejectingId(null);
  };

  const handleRevokePartner = async (partnerId: string) => {
    if (!window.confirm(t('sellerAffiliate.revokePartnerConfirm', 'Thu hồi khóa cặp này?'))) return;
    setIsRevokingId(partnerId);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/seller/affiliate/partners/${partnerId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        fetchAffiliatePartners();
      } else {
        setErrorMsg(data.error || 'Failed to revoke');
      }
    } catch {
      setErrorMsg('Error connecting to server');
    }
    setIsRevokingId(null);
  };

  const handleSendAffiliateRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierCodeInput.trim()) return;
    setIsSendingAffiliateReq(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/seller/affiliate/requests', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          target_seller_code: supplierCodeInput.trim(),
          note: requestNoteInput.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        setSupplierCodeInput('');
        setRequestNoteInput('');
        fetchSentRequests();
      } else {
        setErrorMsg(data.error || 'Failed to send request');
      }
    } catch {
      setErrorMsg('Network error');
    }
    setIsSendingAffiliateReq(false);
  };

  const handleOpenAssignModal = (prod: any) => {
    setAssignTargetProduct(prod);
    setAssignMarkupType('PERCENT');
    setAssignMarkupValue('10');
    setAssignPriceMode('FORMULA');
    setAssignShowSupplier(true);
    setShowAssignModal(true);
  };

  const handleConfirmAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!assignTargetProduct) return;
    setIsSavingListing(true);
    setErrorMsg('');
    try {
      const markupNum = parseFloat(assignMarkupValue) || 0;
      const res = await fetch('/api/seller/affiliate/listings', {
        method: 'POST',
        headers: getHeaders(),
        body: JSON.stringify({
          origin_product_id: assignTargetProduct.id,
          markup_type: assignMarkupType,
          markup_value: markupNum,
          price_mode: assignPriceMode,
          show_supplier: assignShowSupplier,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAssignModal(false);
        setSuccessMsg(data.message);
        fetchAffiliateListings();
        fetchProducts();
      } else {
        setErrorMsg(data.error || 'Failed to assign product');
      }
    } catch {
      setErrorMsg('Network error');
    }
    setIsSavingListing(false);
  };

  const handleRemoveListing = async (listingId: string) => {
    if (!window.confirm(t('sellerAffiliate.removeListingConfirm', 'Hủy gán sản phẩm này?'))) return;
    try {
      const res = await fetch(`/api/seller/affiliate/listings/${listingId}`, {
        method: 'DELETE',
        headers: getHeaders(),
      });
      const data = await res.json();
      if (data.success) {
        setSuccessMsg(data.message);
        fetchAffiliateListings();
        fetchProducts();
      } else {
        setErrorMsg(data.error || 'Failed to remove listing');
      }
    } catch {
      setErrorMsg('Network error');
    }
  };

  return (
    <div className="space-y-6">
      {/* Notifications */}
      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold flex items-center justify-between">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg('')}><X className="w-4 h-4" /></button>
        </div>
      )}
      {successMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-xs font-semibold flex items-center justify-between">
          <span>{successMsg}</span>
          <button onClick={() => setSuccessMsg('')}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Top Banner & Sub-tab Switcher */}
      <div className="p-6 rounded-2xl bg-card border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
        <div className="space-y-1">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            {t('sellerAffiliate.tabTitle', 'Bán Lại & Gán Shop (Liên Shop)')}
          </h3>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {t('sellerAffiliate.tabDesc', 'Mở bán lại sản phẩm cho các gian hàng khác hoặc gán sản phẩm từ nhà cung cấp về shop bán kiếm lợi nhuận.')}
          </p>
        </div>
        {/* Sub-tab Switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl bg-muted/60 border border-border shrink-0">
          <button
            type="button"
            onClick={() => setAffiliateSubTab('supplier')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              affiliateSubTab === 'supplier'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('sellerAffiliate.supplierTab', 'Nhà Cung Cấp (NCC)')}
            {affiliateRequests.filter((r) => r.status === 'PENDING').length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.2 rounded-full bg-primary text-primary-foreground text-[10px]">
                {affiliateRequests.filter((r) => r.status === 'PENDING').length}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setAffiliateSubTab('reseller')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
              affiliateSubTab === 'reseller'
                ? 'bg-card text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {t('sellerAffiliate.resellerTab', 'Shop Bán Lại (Shop Gán)')}
          </button>
        </div>
      </div>

      {/* SUB-TAB 1: NHÀ CUNG CẤP (NCC) */}
      {affiliateSubTab === 'supplier' && (
        <div className="space-y-6">
          {/* Card 1: Yêu Cầu Liên Kết Từ Shop Khác */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                {t('sellerAffiliate.supplierRequestsTitle', 'Yêu Cầu Liên Kết Từ Shop Khác')}
              </h4>
              <button
                onClick={fetchAffiliateRequests}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground text-xs flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAffiliateRequests ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingAffiliateRequests ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                {t('common.loading', 'Đang tải dữ liệu...')}
              </div>
            ) : affiliateRequests.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('sellerAffiliate.noRequests', 'Hiện chưa có yêu cầu liên kết nào từ shop khác.')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-fixed w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2.5 px-3 w-[25%] font-semibold">{t('sellerAffiliate.colResellerShop', 'Shop Gửi Yêu Cầu')}</th>
                      <th className="py-2.5 px-3 w-[20%] font-semibold">{t('sellerAffiliate.colRequestDate', 'Ngày Gửi')}</th>
                      <th className="py-2.5 px-3 w-[25%] font-semibold">{t('sellerAffiliate.colNote', 'Ghi Chú')}</th>
                      <th className="py-2.5 px-3 w-[12%] font-semibold text-center">{t('sellerAffiliate.colStatus', 'Trạng Thái')}</th>
                      <th className="py-2.5 px-3 w-[18%] font-semibold text-right">{t('sellerAffiliate.colActions', 'Thao Tác')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {affiliateRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-3 font-bold text-foreground truncate" title={req.reseller_shop_name}>
                          {req.reseller_shop_name}
                        </td>
                        <td className="py-3 px-3 text-muted-foreground">
                          {new Date(req.created_at).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')}
                        </td>
                        <td className="py-3 px-3 text-muted-foreground truncate" title={req.request_note || '-'}>
                          {req.request_note || '-'}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            req.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                            req.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                            'bg-destructive/10 text-destructive border border-destructive/20'
                          }`}>
                            {req.status === 'APPROVED' ? t('sellerAffiliate.statusApproved', 'Đã Duyệt') :
                             req.status === 'PENDING' ? t('sellerAffiliate.statusPending', 'Chờ Duyệt') :
                             t('sellerAffiliate.statusRejected', 'Đã Từ Chối')}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {req.status === 'PENDING' ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleApproveRequest(req.id, req.reseller_shop_name)}
                                disabled={isApprovingId === req.id}
                                className="px-2.5 py-1 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/25 font-bold text-[11px] disabled:opacity-50"
                              >
                                {isApprovingId === req.id ? '...' : t('sellerAffiliate.approveBtn', 'Duyệt')}
                              </button>
                              <button
                                onClick={() => handleRejectRequest(req.id)}
                                disabled={isRejectingId === req.id}
                                className="px-2.5 py-1 rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/25 font-bold text-[11px] disabled:opacity-50"
                              >
                                {isRejectingId === req.id ? '...' : t('sellerAffiliate.rejectBtn', 'Từ Chối')}
                              </button>
                            </div>
                          ) : (
                            <span className="text-[11px] text-muted-foreground">-</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Card 2: Danh Sách Shop Đang Bán Lại */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Store className="w-4 h-4 text-primary" />
                {t('sellerAffiliate.partnerShopsTitle', 'Danh Sách Shop Đang Bán Lại Sản Phẩm Của Bạn')}
              </h4>
              <button
                onClick={fetchAffiliatePartners}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground text-xs flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingAffiliatePartners ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingAffiliatePartners ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                {t('common.loading', 'Đang tải dữ liệu...')}
              </div>
            ) : affiliatePartners.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('sellerAffiliate.noPartners', 'Chưa có shop nào đang bán lại sản phẩm của bạn.')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-fixed w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2.5 px-3 w-[25%] font-semibold">{t('sellerAffiliate.colPartnerName', 'Gian Hàng Đối Tác')}</th>
                      <th className="py-2.5 px-3 w-[15%] font-semibold">{t('sellerAffiliate.colKeyPrefix', 'Khóa Cặp API')}</th>
                      <th className="py-2.5 px-3 w-[15%] font-semibold text-center">{t('sellerAffiliate.colActiveListings', 'Sản Phẩm Đang Gán')}</th>
                      <th className="py-2.5 px-3 w-[15%] font-semibold text-right">{t('sellerAffiliate.colTotalRevenue', 'Doanh Thu Đã Tạo')}</th>
                      <th className="py-2.5 px-3 w-[15%] font-semibold text-center">{t('sellerAffiliate.colConnectedAt', 'Thời Điểm')}</th>
                      <th className="py-2.5 px-3 w-[15%] font-semibold text-right">{t('sellerAffiliate.colActions', 'Thao Tác')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {affiliatePartners.map((partner) => (
                      <tr key={partner.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-3 font-bold text-foreground truncate" title={partner.reseller_shop_name}>
                          {partner.reseller_shop_name}
                        </td>
                        <td className="py-3 px-3">
                          <code className="px-2 py-0.5 rounded bg-muted font-mono font-bold text-primary text-[11px]">
                            {partner.key_prefix}
                          </code>
                        </td>
                        <td className="py-3 px-3 text-center font-bold text-foreground">
                          {partner.active_listings_count || 0}
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-foreground">
                          {(partner.total_revenue || 0).toLocaleString()} Core
                        </td>
                        <td className="py-3 px-3 text-center text-muted-foreground">
                          {new Date(partner.created_at).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')}
                        </td>
                        <td className="py-3 px-3 text-right">
                          {partner.status === 'ACTIVE' ? (
                            <button
                              onClick={() => handleRevokePartner(partner.id)}
                              disabled={isRevokingId === partner.id}
                              className="px-2.5 py-1 rounded-lg bg-destructive/15 text-destructive hover:bg-destructive/25 font-bold text-[11px] disabled:opacity-50"
                            >
                              {isRevokingId === partner.id ? '...' : t('sellerAffiliate.revokePartnerBtn', 'Thu Hồi')}
                            </button>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">{t('sellerAffiliate.statusRevoked', 'Đã Thu Hồi')}</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: SHOP BÁN LẠI (SHOP GÁN) */}
      {affiliateSubTab === 'reseller' && (
        <div className="space-y-6">
          {/* Card 1: Gửi Yêu Cầu Liên Kết NCC */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Link2 className="w-4 h-4 text-primary" />
                {t('sellerAffiliate.connectSupplierTitle', 'Gửi Yêu Cầu Liên Kết Nhà Cung Cấp (NCC)')}
              </h4>
              <p className="text-xs text-muted-foreground">
                {t('sellerAffiliate.connectSupplierDesc', 'Nhập mã gian hàng của nhà cung cấp bạn muốn liên kết để bán lại sản phẩm của họ.')}
              </p>
            </div>

            <form onSubmit={handleSendAffiliateRequest} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    {t('sellerAffiliate.supplierCodeLabel', 'Mã / Slug Gian Hàng NCC')}
                  </label>
                  <input
                    type="text"
                    required
                    value={supplierCodeInput}
                    onChange={(e) => setSupplierCodeInput(e.target.value)}
                    placeholder={t('sellerAffiliate.supplierCodePlaceholder', 'Ví dụ: store-123 hoặc pine-gaming')}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-semibold text-muted-foreground">
                    {t('sellerAffiliate.requestNoteLabel', 'Lời nhắn gửi NCC (tùy chọn)')}
                  </label>
                  <input
                    type="text"
                    value={requestNoteInput}
                    onChange={(e) => setRequestNoteInput(e.target.value)}
                    placeholder={t('sellerAffiliate.requestNotePlaceholder', 'Giới thiệu kênh bán hoặc cam kết doanh số...')}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-background focus:ring-1 focus:ring-primary focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSendingAffiliateReq || !supplierCodeInput.trim()}
                  className="px-4 py-2 rounded-xl bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1.5 shadow-sm disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {isSendingAffiliateReq ? t('sellerAffiliate.sending', 'Đang gửi...') : t('sellerAffiliate.sendRequestBtn', 'Gửi Yêu Cầu')}
                </button>
              </div>
            </form>
          </div>

          {/* Card 2: Lịch Sử Yêu Cầu Đã Gửi */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <Clock className="w-4 h-4 text-primary" />
                {t('sellerAffiliate.mySentRequestsTitle', 'Lịch Sử Yêu Cầu Đã Gửi')}
              </h4>
              <button
                onClick={fetchSentRequests}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground text-xs flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingSentRequests ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingSentRequests ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                {t('common.loading', 'Đang tải dữ liệu...')}
              </div>
            ) : sentAffiliateRequests.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('sellerAffiliate.noSentRequests', 'Bạn chưa gửi yêu cầu liên kết nào.')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-fixed w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2.5 px-3 w-[30%] font-semibold">{t('sellerAffiliate.colSupplierShop', 'Nhà Cung Cấp')}</th>
                      <th className="py-2.5 px-3 w-[20%] font-semibold">{t('sellerAffiliate.colRequestDate', 'Ngày Gửi')}</th>
                      <th className="py-2.5 px-3 w-[20%] font-semibold text-center">{t('sellerAffiliate.colStatus', 'Trạng Thái')}</th>
                      <th className="py-2.5 px-3 w-[30%] font-semibold text-right">{t('sellerAffiliate.colActions', 'Thao Tác')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {sentAffiliateRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-3 font-bold text-foreground truncate" title={req.supplier_shop_name}>
                          {req.supplier_shop_name}
                        </td>
                        <td className="py-3 px-3 text-muted-foreground">
                          {new Date(req.created_at).toLocaleDateString(isEn ? 'en-US' : 'vi-VN')}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            req.status === 'APPROVED' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                            req.status === 'PENDING' ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' :
                            'bg-destructive/10 text-destructive border border-destructive/20'
                          }`}>
                            {req.status === 'APPROVED' ? t('sellerAffiliate.statusApproved', 'Đã Duyệt') :
                             req.status === 'PENDING' ? t('sellerAffiliate.statusPending', 'Chờ Duyệt') :
                             t('sellerAffiliate.statusRejected', 'Đã Từ Chối')}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          {req.status === 'APPROVED' && (
                            <button
                              onClick={() => fetchSupplierCatalog(req.supplier_seller_id, req.supplier_shop_name)}
                              className="px-2.5 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary font-bold text-[11px] inline-flex items-center gap-1"
                            >
                              <Package className="w-3.5 h-3.5" />
                              {t('sellerAffiliate.openCatalogBtn', 'Xem Kho Hàng Mở')}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Card 3: Kho Sản Phẩm Mở Của Nhà Cung Cấp */}
          {selectedSupplierForCatalog && (
            <div className="p-6 rounded-2xl bg-card border border-primary/40 space-y-4 shadow-sm animate-in fade-in duration-200">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                    <Package className="w-4 h-4 text-primary" />
                    {t('sellerAffiliate.catalogTitle', 'Kho Sản Phẩm Mở Của')}: <strong className="text-primary">{selectedSupplierForCatalog.name}</strong>
                  </h4>
                </div>
                <button
                  onClick={() => setSelectedSupplierForCatalog(null)}
                  className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {loadingCatalog ? (
                <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                  {t('common.loading', 'Đang tải danh mục...')}
                </div>
              ) : supplierCatalog.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  {t('sellerAffiliate.noCatalogProducts', 'Nhà cung cấp này chưa mở bán lại sản phẩm nào hoặc kho hàng tạm hết.')}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="table-fixed w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-border text-muted-foreground">
                        <th className="py-2.5 px-3 w-[30%] font-semibold">{isEn ? 'Product' : 'Sản Phẩm'}</th>
                        <th className="py-2.5 px-3 w-[15%] font-semibold text-right">{t('sellerAffiliate.colBasePrice', 'Giá Gốc')}</th>
                        <th className="py-2.5 px-3 w-[15%] font-semibold text-center">{t('sellerAffiliate.colDiscount', 'Chiết Khấu')}</th>
                        <th className="py-2.5 px-3 w-[15%] font-semibold text-center">{t('sellerAffiliate.colCommission', 'Hoa Hồng')}</th>
                        <th className="py-2.5 px-3 w-[12%] font-semibold text-center">{t('sellerAffiliate.colMap', 'MAP')}</th>
                        <th className="py-2.5 px-3 w-[13%] font-semibold text-right">{t('sellerAffiliate.colActions', 'Thao Tác')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {supplierCatalog.map((prod) => (
                        <tr key={prod.id} className="hover:bg-muted/40 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2 truncate">
                              <img src={prod.cover_url} alt="" className="w-7 h-7 rounded-lg object-cover shrink-0 border border-border" />
                              <span className="font-bold text-foreground truncate" title={prod.name}>{prod.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-bold text-foreground">
                            {prod.price_core.toLocaleString()} Core
                          </td>
                          <td className="py-3 px-3 text-center text-emerald-500 font-semibold">
                            {prod.resell_discount_pct ? `${prod.resell_discount_pct}%` : '0%'}
                          </td>
                          <td className="py-3 px-3 text-center text-primary font-semibold">
                            {prod.resell_commission_pct ? `${prod.resell_commission_pct}%` : '0%'}
                          </td>
                          <td className="py-3 px-3 text-center text-muted-foreground">
                            {prod.resell_map_price ? `${prod.resell_map_price.toLocaleString()}` : '-'}
                          </td>
                          <td className="py-3 px-3 text-right">
                            <button
                              onClick={() => handleOpenAssignModal(prod)}
                              className="px-2.5 py-1 rounded-lg bg-primary text-primary-foreground font-bold text-[11px] shadow-sm hover:opacity-95"
                            >
                              {t('sellerAffiliate.assignBtn', 'Gán Shop')}
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Card 4: Sản Phẩm Đã Gán Vào Gian Hàng Của Bạn */}
          <div className="p-6 rounded-2xl bg-card border border-border space-y-4 shadow-sm">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                <CheckSquare className="w-4 h-4 text-primary" />
                {t('sellerAffiliate.myListingsTitle', 'Sản Phẩm Đã Gán Vào Gian Hàng Của Bạn')}
              </h4>
              <button
                onClick={fetchAffiliateListings}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground text-xs flex items-center gap-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingListings ? 'animate-spin' : ''}`} />
              </button>
            </div>

            {loadingListings ? (
              <div className="py-8 text-center text-xs text-muted-foreground animate-pulse">
                {t('common.loading', 'Đang tải dữ liệu...')}
              </div>
            ) : myAffiliateListings.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted-foreground">
                {t('sellerAffiliate.noListings', 'Bạn chưa gán sản phẩm nào từ nhà cung cấp.')}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="table-fixed w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="py-2.5 px-3 w-[28%] font-semibold">{isEn ? 'Product & Supplier' : 'Sản Phẩm & NCC'}</th>
                      <th className="py-2.5 px-3 w-[16%] font-semibold text-right">{t('sellerAffiliate.colSellingPrice', 'Giá Bán')}</th>
                      <th className="py-2.5 px-3 w-[14%] font-semibold text-center">{t('sellerAffiliate.colMarkup', 'Mức Tăng')}</th>
                      <th className="py-2.5 px-3 w-[16%] font-semibold text-center">{t('sellerAffiliate.colPriceMode', 'Chế Độ Giá')}</th>
                      <th className="py-2.5 px-3 w-[12%] font-semibold text-center">{t('sellerAffiliate.colSyncStatus', 'Đồng Bộ')}</th>
                      <th className="py-2.5 px-3 w-[14%] font-semibold text-right">{t('sellerAffiliate.colActions', 'Thao Tác')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {myAffiliateListings.map((listing) => (
                      <tr key={listing.id} className="hover:bg-muted/40 transition-colors">
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-2 truncate">
                            <img src={listing.cover_url} alt="" className="w-8 h-8 rounded-lg object-cover shrink-0 border border-border" />
                            <div className="truncate">
                              <div className="font-bold text-foreground truncate" title={listing.product_name}>
                                {listing.product_name}
                              </div>
                              <div className="text-[10px] text-muted-foreground truncate">
                                NCC: {listing.supplier_shop_name}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-right font-bold text-foreground">
                          {listing.selling_price_core.toLocaleString()} Core
                          <div className="text-[10px] text-muted-foreground">
                            Gốc: {listing.base_price_core.toLocaleString()}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-center font-semibold text-primary">
                          {listing.markup_type === 'PERCENT' ? `+${listing.markup_value}%` : `+${listing.markup_value.toLocaleString()} Core`}
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${
                            listing.price_mode === 'FORMULA' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 'bg-purple-500/10 text-purple-500 border border-purple-500/20'
                          }`}>
                            {listing.price_mode === 'FORMULA' ? 'Công Thức' : 'Khóa Giá'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            listing.sync_status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-amber-500/10 text-amber-500'
                          }`}>
                            {listing.sync_status === 'ACTIVE' ? 'Hoạt Động' : 'Tạm Ẩn'}
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleRemoveListing(listing.id)}
                            className="px-2 py-1 rounded-lg bg-destructive/10 hover:bg-destructive/20 text-destructive text-[11px] font-semibold"
                          >
                            {t('sellerAffiliate.removeListingBtn', 'Hủy Gán')}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal: Gán Sản Phẩm Vào Shop Mình (Dành cho Reseller) */}
      {showAssignModal && assignTargetProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold flex items-center gap-2">
                <Package className="w-5 h-5 text-primary" />
                {t('sellerAffiliate.assignModalTitle', 'Cấu Hình Gán Sản Phẩm Vào Gian Hàng')}
              </h3>
              <button onClick={() => setShowAssignModal(false)}><X className="w-5 h-5" /></button>
            </div>

            <div className="p-3 bg-muted/40 rounded-xl border border-border flex items-center gap-3">
              <img src={assignTargetProduct.cover_url} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 border border-border" />
              <div className="truncate">
                <div className="font-bold text-xs text-foreground truncate">{assignTargetProduct.name}</div>
                <div className="text-[11px] text-muted-foreground">
                  {t('sellerAffiliate.colBasePrice', 'Giá Gốc')}: <strong className="text-foreground">{assignTargetProduct.price_core.toLocaleString()} Core</strong>
                </div>
              </div>
            </div>

            <form onSubmit={handleConfirmAssign} className="space-y-4">
              <div className="space-y-2">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {t('sellerAffiliate.markupTypeLabel', 'Hình Thức Mức Tăng')}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setAssignMarkupType('PERCENT')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      assignMarkupType === 'PERCENT'
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    {t('sellerAffiliate.markupPercent', '+% Tỷ Lệ')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setAssignMarkupType('FIXED')}
                    className={`p-2.5 rounded-xl border text-xs font-bold transition-all ${
                      assignMarkupType === 'FIXED'
                        ? 'bg-primary/10 border-primary text-primary'
                        : 'border-border text-muted-foreground hover:bg-muted/50'
                    }`}
                  >
                    {t('sellerAffiliate.markupFixed', '+Core Cố Định')}
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {t('sellerAffiliate.markupValueLabel', 'Giá Trị Mức Tăng')} ({assignMarkupType === 'PERCENT' ? '%' : 'Core'})
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={assignMarkupValue}
                  onChange={(e) => setAssignMarkupValue(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary font-bold"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {t('sellerAffiliate.priceModeLabel', 'Chế Độ Giá')}
                </label>
                <select
                  value={assignPriceMode}
                  onChange={(e) => setAssignPriceMode(e.target.value as any)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary font-medium"
                >
                  <option value="FORMULA">{t('sellerAffiliate.modeFormula', 'Công thức động (Tự đổi khi giá gốc NCC đổi)')}</option>
                  <option value="LOCKED">{t('sellerAffiliate.modeLocked', 'Khóa giá cố định (Cảnh báo nếu giá gốc vượt giá bán)')}</option>
                </select>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border">
                <span className="text-xs font-semibold text-foreground">
                  {t('sellerAffiliate.showSupplierLabel', 'Hiển thị nhà cung cấp ("Bán bởi bạn, cung cấp bởi NCC")')}
                </span>
                <input
                  type="checkbox"
                  checked={assignShowSupplier}
                  onChange={(e) => setAssignShowSupplier(e.target.checked)}
                  className="w-4 h-4 rounded text-primary focus:ring-primary"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted"
                >
                  {t('common.cancel', 'Hủy')}
                </button>
                <button
                  type="submit"
                  disabled={isSavingListing}
                  className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm disabled:opacity-50"
                >
                  {isSavingListing ? t('common.loading', 'Đang gán...') : t('sellerAffiliate.confirmAssignBtn', 'Xác Nhận Gán')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Hiển Thị Khóa Cặp API NCC - Shop Gán Duy Nhất 1 Lần */}
      {approvedRawKeyData && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-card border border-primary/40 rounded-2xl w-full max-w-lg p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-emerald-500">
              <CheckCircle2 className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-foreground">
                {t('sellerAffiliate.approvedModalTitle', 'Đã Duyệt Yêu Cầu & Cấp Khóa Cặp API!')}
              </h3>
            </div>

            <div className="p-3.5 bg-destructive/10 border border-destructive/30 rounded-xl text-destructive text-xs leading-relaxed font-semibold">
              ⚠️ {t('sellerAffiliate.approvedModalWarning', 'Khóa API theo cặp dưới đây chỉ hiển thị DUY NHẤT 1 LẦN. Hãy sao chép và gửi cho đối tác hoặc lưu trữ cẩn thận. Hệ thống không lưu khóa thô!')}
            </div>

            <div className="space-y-1.5 text-xs">
              <div className="text-muted-foreground">{t('sellerAffiliate.colPartnerName', 'Gian Hàng Đối Tác')}: <strong className="text-foreground">{approvedRawKeyData.partnerShopName}</strong></div>
              <div className="relative flex items-center">
                <input
                  type="text"
                  readOnly
                  value={approvedRawKeyData.rawKey}
                  className="w-full font-mono text-xs px-3.5 py-2.5 pr-24 rounded-xl border border-primary/40 bg-muted/60 text-foreground font-bold focus:outline-none select-all"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(approvedRawKeyData.rawKey);
                    setCopiedAffiliateKey(true);
                    setTimeout(() => setCopiedAffiliateKey(false), 2500);
                  }}
                  className="absolute right-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground font-bold text-xs flex items-center gap-1 shadow-sm hover:opacity-95"
                >
                  {copiedAffiliateKey ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      {t('sellerApiKeys.copied', 'Đã chép!')}
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      {t('sellerApiKeys.copyBtn', 'Sao Chép')}
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setApprovedRawKeyData(null)}
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-foreground text-background font-bold text-xs shadow hover:opacity-90"
              >
                {t('sellerApiKeys.closeModalBtn', 'Tôi Đã Lưu Khóa An Toàn')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Modal Cài Đặt Bán Lại Liên Shop (Dành cho NCC trên từng sản phẩm)
export const ResellSettingsModal: React.FC<{
  product: any;
  isOpen: boolean;
  onClose: () => void;
  getHeaders: () => Record<string, string>;
  onSuccess: () => void;
  isEn: boolean;
  t: (key: string, fallback?: string, params?: any) => string;
}> = ({ product, isOpen, onClose, getHeaders, onSuccess, isEn, t }) => {
  const [resellEnabled, setResellEnabled] = useState<boolean>(product?.resell_enabled === 1 || Boolean(product?.resell_enabled));
  const [resellDiscountPct, setResellDiscountPct] = useState<string>(product?.resell_discount_pct != null ? String(product.resell_discount_pct) : '0');
  const [resellCommissionPct, setResellCommissionPct] = useState<string>(product?.resell_commission_pct != null ? String(product.resell_commission_pct) : '0');
  const [resellMapPrice, setResellMapPrice] = useState<string>(product?.resell_map_price != null ? String(product.resell_map_price) : '');
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');

  if (!isOpen || !product) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch(`/api/seller/products/${product.id}/resell`, {
        method: 'PUT',
        headers: getHeaders(),
        body: JSON.stringify({
          resell_enabled: resellEnabled,
          resell_discount_pct: parseFloat(resellDiscountPct) || 0,
          resell_commission_pct: parseFloat(resellCommissionPct) || 0,
          resell_map_price: resellMapPrice ? parseFloat(resellMapPrice) : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        setErrorMsg(data.error || 'Failed to update resell settings');
      }
    } catch {
      setErrorMsg('Network error');
    }
    setIsSaving(false);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-md p-6 shadow-xl space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold flex items-center gap-2">
            <Share2 className="w-5 h-5 text-primary" />
            {t('sellerAffiliate.resellSettingsTitle', 'Cài Đặt Mở Bán Lại Liên Shop')}
          </h3>
          <button onClick={onClose}><X className="w-5 h-5" /></button>
        </div>

        <div className="text-xs font-semibold text-foreground truncate">
          {product.name}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          {t('sellerAffiliate.resellSettingsDesc', 'Cho phép các gian hàng khác bán lại sản phẩm này qua API với chiết khấu, hoa hồng và giá sàn MAP.')}
        </p>

        {errorMsg && (
          <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-xs font-semibold">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4 pt-1">
          <div className="flex items-center justify-between p-3 rounded-xl bg-muted/40 border border-border">
            <span className="text-xs font-semibold text-foreground">
              {t('sellerAffiliate.enableResell', 'Cho phép các shop khác bán lại sản phẩm này')}
            </span>
            <input
              type="checkbox"
              checked={resellEnabled}
              onChange={(e) => setResellEnabled(e.target.checked)}
              className="w-4 h-4 rounded text-primary focus:ring-primary"
            />
          </div>

          {resellEnabled && (
            <div className="space-y-3 p-3.5 rounded-xl bg-background border border-border animate-in fade-in duration-200">
              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {t('sellerAffiliate.discountPct', 'Chiết khấu cho shop gán (%)')}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={resellDiscountPct}
                  onChange={(e) => setResellDiscountPct(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('sellerAffiliate.discountPctDesc', 'Tỷ lệ giảm trực tiếp trên giá gốc khi shop gán bán sản phẩm.')}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {t('sellerAffiliate.commissionPct', 'Hoa hồng trả shop gán (%)')}
                </label>
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={resellCommissionPct}
                  onChange={(e) => setResellCommissionPct(e.target.value)}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('sellerAffiliate.commissionPctDesc', 'Tỷ lệ hoa hồng trích từ doanh thu giá gốc trả cho shop gán.')}
                </p>
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-semibold text-muted-foreground">
                  {t('sellerAffiliate.mapPrice', 'Giá sàn tối thiểu MAP (Core)')}
                </label>
                <input
                  type="number"
                  min="0"
                  value={resellMapPrice}
                  onChange={(e) => setResellMapPrice(e.target.value)}
                  placeholder={isEn ? 'Leave empty if none' : 'Để trống nếu không đặt'}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-border bg-card focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <p className="text-[10px] text-muted-foreground">
                  {t('sellerAffiliate.mapPriceDesc', 'Giá bán của shop gán không được thấp hơn mức này.')}
                </p>
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border text-xs font-semibold hover:bg-muted"
            >
              {t('common.cancel', 'Hủy')}
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2 rounded-xl bg-primary text-primary-foreground text-xs font-bold shadow-sm disabled:opacity-50"
            >
              {isSaving ? t('common.loading', 'Đang lưu...') : t('sellerAffiliate.saveSettingsBtn', 'Lưu Cấu Hình')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

/**
 * VietQR Image URL Generator
 * Generates official VietQR bank transfer QR codes with bank ID, account number, amount and memo
 */

export interface VietQrConfig {
  bankId: string; // e.g. 'MB', 'VCB', 'TCB'
  accountNumber: string;
  accountName: string;
}

export const DEFAULT_VIETQR_CONFIG: VietQrConfig = {
  bankId: 'MB',
  accountNumber: '0987654321',
  accountName: 'UNIVERSAL COMMERCE CORP',
};

export function generateVietQrUrl(params: {
  amount: number;
  orderCode: string;
  bankId?: string;
  accountNumber?: string;
  accountName?: string;
}): string {
  const bank = params.bankId || DEFAULT_VIETQR_CONFIG.bankId;
  const acc = params.accountNumber || DEFAULT_VIETQR_CONFIG.accountNumber;
  const memo = encodeURIComponent(`THANH TOAN ${params.orderCode}`);
  const amount = Math.max(0, Math.round(params.amount));

  return `https://img.vietqr.io/image/${bank}-${acc}-compact2.png?amount=${amount}&addInfo=${memo}&accountName=${encodeURIComponent(params.accountName || DEFAULT_VIETQR_CONFIG.accountName)}`;
}

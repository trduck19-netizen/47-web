/**
 * Client-side Image Optimization & Compression Utility (Nhóm 2)
 * Universal Mall Homepage Sections Management
 * 
 * - Chuyển đổi định dạng sang WebP chuẩn
 * - Thu nhỏ kích thước tối đa: Banner (1200px / 300KB), Icon/Nhỏ (400px / 100KB)
 * - Đo lường dung lượng trước/sau nén
 * - Fallback an toàn: nếu trình duyệt không hỗ trợ WebP canvas, trả về bản gốc
 */

export interface CompressionOptions {
  targetType: 'banner' | 'icon';
  maxBannerDimension?: number;   // default: 1200
  maxIconDimension?: number;     // default: 400
  maxBannerSizeBytes?: number;   // default: 300 * 1024 (300KB)
  maxIconSizeBytes?: number;     // default: 100 * 1024 (100KB)
  initialQuality?: number;       // default: 0.82
}

export interface ClientCompressionResult {
  success: boolean;
  blob: Blob;
  base64: string;
  fileName: string;
  originalSizeBytes: number;
  compressedSizeBytes: number;
  reductionPercentage: number;
  width: number;
  height: number;
  format: string;
  isCompressed: boolean;
  warning?: string;
  error?: string;
}

export const ALLOWED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
];

export const DISALLOWED_IMAGE_TYPES = [
  'image/svg+xml',
  'image/svg',
];

/**
 * Kiểm tra tính hợp lệ và an toàn của tệp ảnh trước khi xử lý
 */
export function validateImageFile(file: File): { valid: boolean; error?: string } {
  if (!file) {
    return { valid: false, error: 'Tệp không tồn tại.' };
  }

  const type = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();

  // Chặn hoàn toàn file SVG (phòng chống SVG script injection XSS)
  if (DISALLOWED_IMAGE_TYPES.includes(type) || name.endsWith('.svg')) {
    return {
      valid: false,
      error: 'Định dạng SVG không được hỗ trợ để đảm bảo an toàn bảo mật. Vui lòng dùng WebP, PNG hoặc JPG.',
    };
  }

  const isAllowed = ALLOWED_IMAGE_TYPES.includes(type) ||
    name.endsWith('.jpg') ||
    name.endsWith('.jpeg') ||
    name.endsWith('.png') ||
    name.endsWith('.webp') ||
    name.endsWith('.gif') ||
    name.endsWith('.avif');

  if (!isAllowed) {
    return {
      valid: false,
      error: 'Chỉ chấp nhận các định dạng ảnh: WebP, PNG, JPG/JPEG, GIF, AVIF.',
    };
  }

  // Giới hạn tệp tải lên ban đầu tối đa 10MB
  if (file.size > 10 * 1024 * 1024) {
    return {
      valid: false,
      error: `Ảnh gốc quá lớn (${(file.size / (1024 * 1024)).toFixed(1)}MB). Giới hạn tối đa trước khi nén là 10MB.`,
    };
  }

  return { valid: true };
}

/**
 * Nén và chuyển đổi ảnh sang WebP phía Client bằng HTML5 Canvas
 */
export async function compressImageOnClient(
  file: File,
  options: CompressionOptions
): Promise<ClientCompressionResult> {
  const originalSize = file.size;
  const isBanner = options.targetType === 'banner';
  const maxDim = isBanner
    ? (options.maxBannerDimension || 1200)
    : (options.maxIconDimension || 400);
  const maxSize = isBanner
    ? (options.maxBannerSizeBytes || 300 * 1024)
    : (options.maxIconSizeBytes || 100 * 1024);

  // Fallback helper nếu trình duyệt không hỗ trợ hoặc lỗi canvas
  const createFallbackResult = async (errorMsg?: string): Promise<ClientCompressionResult> => {
    const reader = new FileReader();
    const base64: string = await new Promise((resolve) => {
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(file);
    });

    return {
      success: true,
      blob: file,
      base64,
      fileName: file.name,
      originalSizeBytes: originalSize,
      compressedSizeBytes: originalSize,
      reductionPercentage: 0,
      width: 0,
      height: 0,
      format: file.type || 'image/jpeg',
      isCompressed: false,
      warning: errorMsg || 'Trình duyệt không hỗ trợ nén WebP, đã giữ nguyên bản gốc để chuyển máy chủ xử lý.',
    };
  };

  try {
    // 1. Tạo object URL để nạp vào HTMLImageElement
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Không thể nạp dữ liệu ảnh vào Canvas.'));
      img.src = objectUrl;
    });

    URL.revokeObjectURL(objectUrl);

    let origWidth = img.naturalWidth || img.width;
    let origHeight = img.naturalHeight || img.height;

    if (!origWidth || !origHeight) {
      return await createFallbackResult('Kích thước ảnh không hợp lệ.');
    }

    // 2. Tính toán kích thước mới theo tỷ lệ
    let targetWidth = origWidth;
    let targetHeight = origHeight;

    if (origWidth > maxDim || origHeight > maxDim) {
      if (origWidth >= origHeight) {
        targetWidth = maxDim;
        targetHeight = Math.max(1, Math.round((origHeight * maxDim) / origWidth));
      } else {
        targetHeight = maxDim;
        targetWidth = Math.max(1, Math.round((origWidth * maxDim) / origHeight));
      }
    }

    // 3. Khởi tạo Canvas và vẽ ảnh
    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');

    if (!ctx) {
      return await createFallbackResult('Không thể khởi tạo Canvas 2D context.');
    }

    ctx.drawImage(img, 0, 0, targetWidth, targetHeight);

    // 4. Nén sang WebP với thuật toán giảm dần chất lượng nếu vượt dung lượng
    let quality = options.initialQuality || 0.82;
    let compressedBlob: Blob | null = null;

    // Thử với chất lượng ban đầu
    const getBlob = (q: number): Promise<Blob | null> =>
      new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', q));

    compressedBlob = await getBlob(quality);

    // Kiểm tra xem trình duyệt có thực sự hỗ trợ toBlob('image/webp') không
    if (!compressedBlob || compressedBlob.type !== 'image/webp') {
      // Thử fallback toBlob JPEG nếu WebP không được hỗ trợ trên trình duyệt rất cũ
      compressedBlob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    }

    if (!compressedBlob) {
      return await createFallbackResult('Trình duyệt không thể xuất Blob từ Canvas.');
    }

    // Nếu dung lượng vẫn vượt quá giới hạn, thử giảm chất lượng xuống tới 0.55
    if (compressedBlob.size > maxSize && quality > 0.6) {
      quality = 0.65;
      const retryBlob = await getBlob(quality);
      if (retryBlob && retryBlob.size < compressedBlob.size) {
        compressedBlob = retryBlob;
      }
    }

    if (compressedBlob.size > maxSize && quality > 0.55) {
      quality = 0.50;
      const retryBlob = await getBlob(quality);
      if (retryBlob && retryBlob.size < compressedBlob.size) {
        compressedBlob = retryBlob;
      }
    }

    const compressedSize = compressedBlob.size;
    const reduction = Math.max(0, Math.round(((originalSize - compressedSize) / originalSize) * 100));

    // Chuyển Blob thành base64 data url
    const reader = new FileReader();
    const base64: string = await new Promise((resolve) => {
      reader.onload = () => resolve(reader.result as string);
      reader.readAsDataURL(compressedBlob!);
    });

    // Tạo tên tệp mới với đuôi .webp
    const baseName = file.name.replace(/\.[^/.]+$/, '');
    const newFileName = `${baseName}.webp`;

    const isWithinLimits = compressedSize <= maxSize;

    return {
      success: true,
      blob: compressedBlob,
      base64,
      fileName: newFileName,
      originalSizeBytes: originalSize,
      compressedSizeBytes: compressedSize,
      reductionPercentage: reduction,
      width: targetWidth,
      height: targetHeight,
      format: compressedBlob.type,
      isCompressed: true,
      warning: !isWithinLimits
        ? `Ảnh sau nén (${(compressedSize / 1024).toFixed(0)}KB) vẫn vượt mức khuyến nghị (${(maxSize / 1024).toFixed(0)}KB). Bạn có thể tiếp tục lưu hoặc chọn ảnh nhẹ hơn.`
        : undefined,
    };
  } catch (err: any) {
    return await createFallbackResult(err?.message);
  }
}

/**
 * Định dạng dung lượng tệp đọc được (B, KB, MB)
 */
export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * src/utils/storageMigration.ts
 * Di chuyển toàn bộ dữ liệu localStorage và sessionStorage từ tiền tố cũ (wcg_*)
 * sang tiền tố mới (pine_*) một cách an toàn và tự động:
 * - Đọc khóa cũ
 * - Ghi sang khóa mới nếu khóa mới chưa tồn tại
 * - Xóa khóa cũ
 * Đảm bảo 100% người dùng và quản trị viên không bị đăng xuất và không mất cache.
 */

export function migrateStoragePrefixes(): void {
  if (typeof window === 'undefined') return;

  try {
    // 1. LocalStorage
    const localKeys = Object.keys(localStorage);
    for (const key of localKeys) {
      if (key.startsWith('wcg_')) {
        const newKey = 'pine_' + key.slice(4);
        const val = localStorage.getItem(key);
        if (val !== null) {
          if (localStorage.getItem(newKey) === null) {
            localStorage.setItem(newKey, val);
          }
          localStorage.removeItem(key);
        }
      }
    }

    // 2. SessionStorage
    const sessionKeys = Object.keys(sessionStorage);
    for (const key of sessionKeys) {
      if (key.startsWith('wcg_')) {
        const newKey = 'pine_' + key.slice(4);
        const val = sessionStorage.getItem(key);
        if (val !== null) {
          if (sessionStorage.getItem(newKey) === null) {
            sessionStorage.setItem(newKey, val);
          }
          sessionStorage.removeItem(key);
        }
      }
    }
  } catch (err) {
    console.warn('[StorageMigration] Warning:', err);
  }
}

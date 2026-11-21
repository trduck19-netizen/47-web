/**
 * Cloudflare Pages Function: /api/crawl-article
 * Proxy bóc tách bài viết từ URL để phục vụ tính năng AI viết lại nội dung:
 * - Tránh lỗi CORS khi client fetch trực tiếp các trang tin tức
 * - Bóc tách Title, Meta Description, OG Image, Text content, Code patterns, và Image URLs
 */

import { authenticateAdmin, authenticateCaller } from '../services/auth_service';

interface Env {
  DB?: D1Database;
  JWT_SECRET?: string;
  ADMIN_SYNC_SECRET?: string;
}

function isSafeCrawlUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
    const host = parsed.hostname.toLowerCase();
    // Block loopback, RFC1918, link-local metadata
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      host.startsWith('169.254.') ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function onRequest(context: { request: Request; env: Env }): Promise<Response> {
  const { request } = context;

  // CORS headers
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method.toUpperCase() === 'OPTIONS') {
    return new Response(null, { status: 204, headers });
  }

  if (request.method.toUpperCase() !== 'POST') {
    return new Response(JSON.stringify({ success: false, error: 'Method not allowed' }), {
      status: 405,
      headers,
    });
  }

  // 1. Authenticate caller (Admin session required for SSRF proxy)
  const authHeader = request.headers.get('Authorization') || '';
  const token = authHeader.replace(/^Bearer\s+/i, '').trim() ||
                (request.headers.get('X-Sync-Key') || '').trim() ||
                (request.headers.get('X-Api-Key') || '').trim();

  if (!token) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Vui lòng đăng nhập quyền quản trị' }), {
      status: 401,
      headers,
    });
  }

  if (!context.env.DB) {
    return new Response(JSON.stringify({ success: false, error: 'Internal Error: D1 Database binding is missing' }), {
      status: 500,
      headers,
    });
  }

  const adminAuth = await authenticateAdmin(context.env.DB, token, {
    JWT_SECRET: context.env.JWT_SECRET,
    ADMIN_SYNC_SECRET: context.env.ADMIN_SYNC_SECRET,
  });
  if (!adminAuth.authenticated) {
    const callerAuth = await authenticateCaller(context.env.DB, token, context.env.JWT_SECRET);
    if (!callerAuth.authenticated || (callerAuth.member?.role !== 'ADMIN' && callerAuth.member?.role !== 'SUPER_ADMIN')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized: Quyền quản trị viên bắt buộc' }), {
        status: 401,
        headers,
      });
    }
  }

  try {
    const body: any = await request.json().catch(() => ({}));
    const rawUrl = body.url?.trim();

    if (!rawUrl || !isSafeCrawlUrl(rawUrl)) {
      return new Response(
        JSON.stringify({ success: false, error: 'Vui lòng cung cấp URL hợp lệ (bắt đầu bằng http/https và không trỏ vào địa chỉ IP nội bộ)' }),
        { status: 400, headers }
      );
    }

    const isSocialMedia = /facebook\.com|fb\.com|fb\.watch|instagram\.com|tiktok\.com|threads\.net|twitter\.com|x\.com/i.test(rawUrl);

    // Fetch the target webpage with realistic browser User-Agent and manual redirects (max 3)
    let currentUrl = rawUrl;
    let redirectCount = 0;
    const maxRedirects = 3;
    let response: Response | null = null;

    while (redirectCount <= maxRedirects) {
      if (!isSafeCrawlUrl(currentUrl)) {
        return new Response(
          JSON.stringify({ success: false, error: 'Redirect bị chặn: URL chuyển hướng trỏ vào địa chỉ IP nội bộ không hợp lệ' }),
          { status: 400, headers }
        );
      }

      response = await fetch(currentUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (UniversalMall-ArticleBot/1.0)',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'vi,en-US;q=0.9,en;q=0.8',
        },
        signal: AbortSignal.timeout(10000),
        redirect: 'manual',
      });

      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        if (!location) break;
        const nextUrl = new URL(location, currentUrl).toString();
        currentUrl = nextUrl;
        redirectCount++;
        continue;
      }

      break;
    }

    if (!response || !response.ok) {
      if (isSocialMedia) {
        return new Response(
          JSON.stringify({
            success: false,
            isSocial: true,
            error: 'Bài viết trên Facebook / Mạng xã hội được bảo mật riêng tư và yêu cầu đăng nhập. Bạn chỉ cần Copy (sao chép) nội dung bài viết trên Facebook rồi Dán vào ô "Nội dung bài viết gốc" bên dưới, AI sẽ viết lại và lọc sạch mã quà tặng ngay lập tức!',
          }),
          { status: 200, headers }
        );
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: `Không thể tải trang web (HTTP ${response?.status || 'Error'}). Bạn có thể copy và dán trực tiếp nội dung bài viết vào ô bên dưới.`,
        }),
        { status: 200, headers }
      );
    }

    // Read streaming body with byte counter abort when exceeding 1MB (1048576 bytes)
    const MAX_BYTES = 1024 * 1024;
    let html = '';
    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let totalBytes = 0;
      const chunks: string[] = [];

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            totalBytes += value.byteLength;
            if (totalBytes > MAX_BYTES) {
              const remaining = MAX_BYTES - (totalBytes - value.byteLength);
              if (remaining > 0) {
                chunks.push(decoder.decode(value.subarray(0, remaining), { stream: false }));
              }
              await reader.cancel().catch(() => {});
              break;
            }
            chunks.push(decoder.decode(value, { stream: true }));
          }
        }
      } catch (streamErr) {
        console.warn('[CrawlArticle Stream Notice]', streamErr);
      }
      html = chunks.join('');
    } else {
      html = '';
    }

    // Check if social media login wall was served
    if (isSocialMedia && (html.includes('id="login_form"') || html.includes('login.php') || html.includes('Facebook – log in') || html.includes('Đăng nhập hoặc đăng ký'))) {
      return new Response(
        JSON.stringify({
          success: false,
          isSocial: true,
          error: 'Bài viết Facebook này nằm trong nhóm hoặc trang yêu cầu đăng nhập tài khoản. Bạn chỉ cần Copy (sao chép) nội dung bài viết trên Facebook và Dán vào ô "Nội dung bài viết gốc" bên dưới, AI sẽ tự động phân tích và viết lại bài chuẩn SEO ngay!',
        }),
        { status: 200, headers }
      );
    }

    // 1. Extract Title
    let title = '';
    const ogTitleMatch = html.match(/<meta\s+property=["']og:title["']\s+content=["'](.*?)["']/i) ||
                         html.match(/<meta\s+content=["'](.*?)["']\s+property=["']og:title["']/i);
    if (ogTitleMatch && ogTitleMatch[1]) {
      title = ogTitleMatch[1];
    } else {
      const titleTagMatch = html.match(/<title>(.*?)<\/title>/i);
      if (titleTagMatch && titleTagMatch[1]) {
        title = titleTagMatch[1];
      }
    }
    title = cleanHtmlEntities(title).trim();

    // 2. Extract Description / Excerpt
    let excerpt = '';
    const ogDescMatch = html.match(/<meta\s+property=["']og:description["']\s+content=["'](.*?)["']/i) ||
                        html.match(/<meta\s+name=["']description["']\s+content=["'](.*?)["']/i);
    if (ogDescMatch && ogDescMatch[1]) {
      excerpt = cleanHtmlEntities(ogDescMatch[1]).trim();
    }

    // 3. Extract Cover Image
    let cover_url = '';
    const ogImageMatch = html.match(/<meta\s+property=["']og:image["']\s+content=["'](.*?)["']/i) ||
                         html.match(/<meta\s+name=["']twitter:image["']\s+content=["'](.*?)["']/i);
    if (ogImageMatch && ogImageMatch[1]) {
      cover_url = ogImageMatch[1].trim();
      if (cover_url.startsWith('//')) cover_url = 'https:' + cover_url;
    }

    // 4. Extract Article text content
    // Remove scripts, styles, iframes, nav, footer, header, aside
    let cleanHtml = html
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
      .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
      .replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
      .replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
      .replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
      .replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '');

    // Extract images from article body
    const imageMatches = [...cleanHtml.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)];
    const images: string[] = [];
    for (const m of imageMatches) {
      let src = m[1].trim();
      if (src.startsWith('//')) src = 'https:' + src;
      if (src.startsWith('http') && !src.includes('logo') && !src.includes('avatar') && !src.includes('icon')) {
        if (!images.includes(src)) images.push(src);
      }
    }

    // Convert headings and paragraphs to text
    cleanHtml = cleanHtml
      .replace(/<h1[^>]*>(.*?)<\/h1>/gi, '\n# $1\n')
      .replace(/<h2[^>]*>(.*?)<\/h2>/gi, '\n## $1\n')
      .replace(/<h3[^>]*>(.*?)<\/h3>/gi, '\n### $1\n')
      .replace(/<p[^>]*>(.*?)<\/p>/gi, '\n$1\n')
      .replace(/<li[^>]*>(.*?)<\/li>/gi, '\n- $1\n')
      .replace(/<br\s*[\/]?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ');

    let content = cleanHtmlEntities(cleanHtml)
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !isBoilerplateLine(l))
      .join('\n\n');

    // Limit text length to avoid token blowups
    if (content.length > 15000) {
      content = content.slice(0, 15000) + '...';
    }

    // 5. Scan Giftcodes from content
    const codeCandidates = scanGiftcodesFromText(content);

    return new Response(
      JSON.stringify({
        success: true,
        title,
        excerpt,
        cover_url,
        content,
        codes: codeCandidates,
        images: images.slice(0, 8),
      }),
      { status: 200, headers }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || 'Lỗi khi bóc tách bài viết từ link. Bạn có thể dán trực tiếp nội dung bài báo vào ô.',
      }),
      { status: 200, headers }
    );
  }
}

/**
 * Filter out website navigation, breadcrumbs, ads and boilerplate lines
 */
function isBoilerplateLine(line: string): boolean {
  const lower = line.toLowerCase().trim();
  if (lower.length < 3) return true;
  if (/^(skip to content|chuyển đến nội dung|trang chủ\s*[»>|]|home\s*[»>|]|mục lục|table of contents)/i.test(lower)) return true;
  if (/^(chia sẻ\s*[:|]|bình luận\s*[:|]|đọc thêm\s*[:|]|xem thêm\s*[:|]|bài viết liên quan|theo dõi|follow us|quảng cáo|nguồn ảnh|nguồn\s*:)/i.test(lower)) return true;
  if (/^(like|share|comment|subscribe|đăng ký kênh|tham gia nhóm|facebook group|fanpage)/i.test(lower)) return true;
  if (/^(bản quyền thuộc về|all rights reserved|chính sách bảo mật|điều khoản sử dụng)/i.test(lower)) return true;
  return false;
}

/**
 * Clean common HTML entities, zero-width characters, and decorative wingdings
 */
function cleanHtmlEntities(str: string): string {
  if (!str) return '';
  return str
    // Strip zero-width and invisible characters
    .replace(/[\u200B-\u200D\uFEFF\u200E\u200F\u00A0]/g, ' ')
    // Strip decorative wingdings and arrows that clutter text
    .replace(/[»«►◄▲▼■◆●★☆❖✓✔✕✖]/g, ' ')
    // Numeric character references
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCharCode(Number(dec));
      } catch {
        return '';
      }
    })
    .replace(/&#x([a-fA-F0-9]+);/g, (_, hex) => {
      try {
        return String.fromCharCode(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    // Named entities
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .replace(/&hellip;/g, '...')
    .replace(/&ndash;/g, '-')
    .replace(/&mdash;/g, '--')
    .replace(/&bull;/g, '-')
    .replace(/\s+/g, ' ');
}

/**
 * Scan giftcode strings from plain text
 */
function scanGiftcodesFromText(text: string): string[] {
  const codes = new Set<string>();
  const ignored = new Set([
    'ANDROID', 'FACEBOOK', 'YOUTUBE', 'DISCORD', 'TWITTER', 'TIKTOK', 'ONLINE', 'MOBILE',
    'VIP', 'PRO', 'HOT', 'NEW', 'CODE', 'GAME', 'LINK', 'GIFTCODE', 'GIFTCODES', 'GOOGLE',
    'PLAY', 'STORE', 'APPLE', 'UPDATE', 'SERVER', 'EVENT', 'VERSION', 'SYSTEM', 'GAMER',
    'FREE', 'ITEM', 'GOLD', 'COIN', 'COINS', 'DIAMOND', 'DIAMONDS', 'LEVEL', 'DAILY',
    'VIETNAM', 'VIET', 'NAM', 'LOGIN', 'SHARE', 'FOLLOW', 'LIKE', 'COMMENT', 'GROUP',
    'THANKS', 'SPECIAL', 'REWARD', 'REWARDS', 'GIFT', 'PACKAGE', 'BANNER', 'CLIENT',
  ]);

  // Pattern 1: Look for explicit Code tags: "Code: XYZ123", "Giftcode: ABC888"
  const tagMatches = text.matchAll(/(?:code|giftcode|mã quà tặng|mã code)\s*[:=\-–]\s*([a-zA-Z0-9_\-]+)/gi);
  for (const m of tagMatches) {
    const candidate = m[1].trim().toUpperCase();
    if (candidate.length >= 4 && candidate.length <= 25 && !ignored.has(candidate)) {
      codes.add(candidate);
    }
  }

  // Pattern 2: Uppercase alphanumeric words between 5 and 20 chars
  const words = text.match(/\b[A-Z0-9_]{5,20}\b/g) || [];
  for (const w of words) {
    const upper = w.toUpperCase();
    if (!ignored.has(upper) && /[0-9]/.test(upper) && /[A-Z]/.test(upper)) {
      // Must contain both letters and digits or underscore (typical giftcode)
      codes.add(upper);
    }
  }

  return Array.from(codes).slice(0, 20);
}

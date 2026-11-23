interface Env {
  DB: D1Database;
  TINYPNG_API_KEY?: string;
  TINIFY_API_KEY?: string;
  GEMINI_API_KEY?: string;
  AI_API_KEY?: string;
}

export const onRequestGet: PagesFunction<Env> = async (context) => {
  const { env } = context;

  try {
    let d1Ready = false;
    let totalImages = 0;
    let compressedImages = 0;
    let totalSizeBytes = 0;

    if (env.DB) {
      try {
        const stats = await env.DB.prepare(`
          SELECT 
            COUNT(*) as total,
            SUM(CASE WHEN is_compressed = 1 THEN 1 ELSE 0 END) as compressed,
            SUM(size_bytes) as total_size
          FROM homepage_section_images
        `).first<any>();

        if (stats) {
          d1Ready = true;
          totalImages = Number(stats.total) || 0;
          compressedImages = Number(stats.compressed) || 0;
          totalSizeBytes = Number(stats.total_size) || 0;
        }
      } catch {
        d1Ready = false;
      }
    }

    const hasTinyPngKey = Boolean(env.TINYPNG_API_KEY || env.TINIFY_API_KEY);
    const hasGeminiKey = Boolean(env.GEMINI_API_KEY || env.AI_API_KEY);

    return new Response(
      JSON.stringify({
        success: true,
        status: 'ready',
        d1_ready: d1Ready,
        total_images: totalImages,
        compressed_images: compressedImages,
        total_size_bytes: totalSizeBytes,
        external_tinypng_configured: hasTinyPngKey,
        external_gemini_configured: hasGeminiKey,
        internal_compressor: 'ImageScript (WebP HTML5 Canvas + Edge Worker WebCrypto)',
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({
        success: false,
        status: 'error',
        error: err?.message || 'Lỗi kiểm tra probe ảnh.',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }
};

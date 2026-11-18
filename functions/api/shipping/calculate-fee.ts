import { CORS_HEADERS, Env } from '../../services/mission_service';

export const onRequestOptions: PagesFunction = async () => {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
};

/**
 * GET / POST /api/shipping/calculate-fee
 * Tính cước phí vận chuyển thời gian thực từ API mạng hãng bưu chính (GHTK / GHN / Viettel Post)
 */
export const onRequestGet: PagesFunction<Env> = async (context) => {
  return handleCalculateFee(context);
};

export const onRequestPost: PagesFunction<Env> = async (context) => {
  return handleCalculateFee(context);
};

async function handleCalculateFee(context: EventContext<Env, any, any>): Promise<Response> {
  const { request, env } = context;

  try {
    const url = new URL(request.url);
    let params: any = {};

    if (request.method === 'POST') {
      try {
        params = await request.json();
      } catch {
        params = {};
      }
    } else {
      params = {
        carrier: url.searchParams.get('carrier'),
        pick_province: url.searchParams.get('pick_province'),
        pick_district: url.searchParams.get('pick_district'),
        province: url.searchParams.get('province'),
        district: url.searchParams.get('district'),
        address: url.searchParams.get('address'),
        weight: url.searchParams.get('weight'),
        value: url.searchParams.get('value'),
      };
    }

    const carrier = String(params.carrier || 'GHTK').toUpperCase().trim();
    const pickProvince = String(params.pick_province || 'Hà Nội').trim();
    const pickDistrict = String(params.pick_district || 'Cầu Giấy').trim();
    let province = String(params.province || '').trim();
    let district = String(params.district || '').trim();
    const address = String(params.address || '').trim();
    const weight = Math.max(100, parseInt(params.weight || '500', 10)); // gram
    const orderValue = Math.max(0, parseInt(params.value || '100000', 10)); // VND

    // Trích xuất tỉnh / quận từ địa chỉ nếu chưa truyền riêng
    if (!province && address) {
      const lower = address.toLowerCase();
      if (lower.includes('hà nội')) province = 'Hà Nội';
      else if (lower.includes('hồ chí minh') || lower.includes('tp.hcm') || lower.includes('sài gòn')) province = 'Hồ Chí Minh';
      else if (lower.includes('đà nẵng')) province = 'Đà Nẵng';
      else if (lower.includes('hải phòng')) province = 'Hải Phòng';
      else if (lower.includes('cần thơ')) province = 'Cần Thơ';
      else province = 'Hà Nội';
    }
    if (!province) province = 'Hà Nội';
    if (!district) district = province === 'Hà Nội' ? 'Cầu Giấy' : 'Quận 1';

    // 1. XỬ LÝ HÃNG GHTK (Giao Hàng Tiết Kiệm)
    if (carrier === 'GHTK') {
      const ghtkToken = (env.GHTK_API_TOKEN || '').trim();
      const trackingFormat = 'GHTK.VN.{CITY}.{YYMMDD}.{6DIGITS} (Ví dụ: GHTK.VN.HN.261118.839201)';
      const trackingLookupUrl = 'https://giaohangtietkiem.vn/tra-cuu-van-don?order=';

      if (!ghtkToken) {
        return new Response(
          JSON.stringify({
            success: false,
            configured: false,
            carrier: 'GHTK',
            carrierName: 'Giao Hàng Tiết Kiệm (GHTK Express)',
            error: 'MISSING_CARRIER_TOKEN',
            message: 'Chưa cấu hình biến môi trường GHTK_API_TOKEN trên Cloudflare Pages. Vui lòng thêm token API bưu chính chính thức vào Cloudflare Settings > Environment Variables để gọi trực tiếp mạng bưu cục GHTK.',
            trackingFormat,
            trackingLookupUrl,
            requiredCredentials: [
              'GHTK_API_TOKEN: Mã token đối tác cung cấp tại trang https://khachhang.giaohangtietkiem.vn'
            ],
            standardEstimateFee: province === 'Hà Nội' ? 22000 : 35000,
            timestamp: new Date().toISOString(),
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      // Khi có token GHTK thật: Gọi API mạng trực tiếp tới hệ thống GHTK
      try {
        const queryParams = new URLSearchParams({
          pick_province: pickProvince,
          pick_district: pickDistrict,
          province,
          district,
          address,
          weight: String(weight),
          value: String(orderValue),
          transport: 'road',
        });

        const ghtkRes = await fetch(`https://services.giaohangtietkiem.vn/services/shipment/fee?${queryParams.toString()}`, {
          method: 'GET',
          headers: {
            Token: ghtkToken,
            'Content-Type': 'application/json',
          },
        });

        const ghtkData: any = await ghtkRes.json();
        if (ghtkData && ghtkData.success && ghtkData.fee) {
          return new Response(
            JSON.stringify({
              success: true,
              configured: true,
              carrier: 'GHTK',
              carrierName: 'Giao Hàng Tiết Kiệm (GHTK Express)',
              source: 'LIVE_GHTK_NETWORK_API',
              fee: ghtkData.fee.fee,
              insurance_fee: ghtkData.fee.insurance_fee || 0,
              delivery_type: ghtkData.fee.delivery_type,
              estimated_delivery: '1 - 2 ngày làm việc',
              trackingFormat,
              trackingLookupUrl,
              timestamp: new Date().toISOString(),
            }),
            { status: 200, headers: CORS_HEADERS }
          );
        } else {
          return new Response(
            JSON.stringify({
              success: false,
              configured: true,
              carrier: 'GHTK',
              source: 'LIVE_GHTK_NETWORK_API',
              error: ghtkData?.message || 'Lỗi phản hồi từ API bưu cục GHTK',
              trackingFormat,
              trackingLookupUrl,
              fallbackFee: province === 'Hà Nội' ? 22000 : 35000,
              timestamp: new Date().toISOString(),
            }),
            { status: 200, headers: CORS_HEADERS }
          );
        }
      } catch (netErr: any) {
        return new Response(
          JSON.stringify({
            success: false,
            configured: true,
            carrier: 'GHTK',
            error: `Lỗi kết nối mạng tới bưu cục GHTK: ${netErr?.message}`,
            fallbackFee: 22000,
            timestamp: new Date().toISOString(),
          }),
          { status: 502, headers: CORS_HEADERS }
        );
      }
    }

    // 2. XỬ LÝ HÃNG GHN (Giao Hàng Nhanh)
    if (carrier === 'GHN') {
      const ghnToken = (env.GHN_API_TOKEN || '').trim();
      const ghnShopId = (env.GHN_SHOP_ID || '').trim();
      const trackingFormat = 'GHN{YYMMDD}{6DIGITS} (Ví dụ: GHN261118942105)';
      const trackingLookupUrl = 'https://tracking.ghn.vn/?order_code=';

      if (!ghnToken) {
        return new Response(
          JSON.stringify({
            success: false,
            configured: false,
            carrier: 'GHN',
            carrierName: 'Giao Hàng Nhanh (GHN Express)',
            error: 'MISSING_CARRIER_TOKEN',
            message: 'Chưa cấu hình biến môi trường GHN_API_TOKEN trên Cloudflare Pages. Vui lòng thêm token API GHN vào Cloudflare Settings > Environment Variables để gọi trực tiếp mạng bưu cục GHN.',
            trackingFormat,
            trackingLookupUrl,
            requiredCredentials: [
              'GHN_API_TOKEN: Mã token đối tác cung cấp tại trang https://khachhang.ghn.vn',
              'GHN_SHOP_ID: Mã cửa hàng ShopId đăng ký tại GHN'
            ],
            standardEstimateFee: province === 'Hồ Chí Minh' ? 25000 : 38000,
            timestamp: new Date().toISOString(),
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      }

      // Khi có token GHN thật: Gọi API mạng GHN
      try {
        const ghnRes = await fetch('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee', {
          method: 'POST',
          headers: {
            Token: ghnToken,
            ShopId: ghnShopId,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            service_type_id: 2, // Chuẩn thương mại điện tử
            insurance_value: orderValue,
            weight,
            to_district_id: 1450, // Default ID nếu chưa map district
          }),
        });
        const ghnData: any = await ghnRes.json();
        return new Response(
          JSON.stringify({
            success: ghnData?.code === 200,
            configured: true,
            carrier: 'GHN',
            source: 'LIVE_GHN_NETWORK_API',
            data: ghnData?.data,
            trackingFormat,
            trackingLookupUrl,
            timestamp: new Date().toISOString(),
          }),
          { status: 200, headers: CORS_HEADERS }
        );
      } catch (netErr: any) {
        return new Response(
          JSON.stringify({
            success: false,
            configured: true,
            carrier: 'GHN',
            error: `Lỗi kết nối mạng tới bưu cục GHN: ${netErr?.message}`,
            fallbackFee: 25000,
            timestamp: new Date().toISOString(),
          }),
          { status: 502, headers: CORS_HEADERS }
        );
      }
    }

    // 3. XỬ LÝ HÃNG VIETTEL POST (VTP)
    const vtpToken = (env.VIETTEL_POST_TOKEN || '').trim();
    const trackingFormat = 'VTP{YYMMDD}{6DIGITS} hoặc VT{6DIGITS}VN (Ví dụ: VTP261118104829)';
    const trackingLookupUrl = 'https://viettelpost.vn/tra-cuu-hanh-trinh-don-hang?id=';

    return new Response(
      JSON.stringify({
        success: false,
        configured: Boolean(vtpToken),
        carrier: 'VTP',
        carrierName: 'Viettel Post (Bưu Chính Viettel)',
        error: vtpToken ? null : 'MISSING_CARRIER_TOKEN',
        message: vtpToken
          ? 'Đã cấu hình token Viettel Post'
          : 'Chưa cấu hình biến môi trường VIETTEL_POST_TOKEN trên Cloudflare Pages.',
        trackingFormat,
        trackingLookupUrl,
        requiredCredentials: [
          'VIETTEL_POST_TOKEN: Token đăng ký tại https://partner.viettelpost.vn'
        ],
        standardEstimateFee: 28000,
        timestamp: new Date().toISOString(),
      }),
      { status: 200, headers: CORS_HEADERS }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ success: false, message: error?.message || 'Lỗi khi tính cước vận chuyển.' }),
      { status: 500, headers: CORS_HEADERS }
    );
  }
};

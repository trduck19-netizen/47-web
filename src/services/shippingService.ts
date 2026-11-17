export type ShippingCarrier = 'GHTK' | 'GHN' | 'VIETTEL_POST';

export interface ShippingTimelineStep {
  status: string;
  title: string;
  description: string;
  timestamp: string;
  isCompleted: boolean;
  isCurrent: boolean;
}

export interface ShippingOrderRecord {
  orderId: string;
  trackingCode: string;
  carrier: ShippingCarrier;
  carrierName: string;
  customerName: string;
  phone: string;
  address: string;
  estimatedDeliveryDays: number;
  shippingFee: number;
  currentStepIndex: number;
  timeline: ShippingTimelineStep[];
  updatedAt: string;
}

class ShippingService {
  private STORAGE_KEY = 'universal_mall_shipping_orders_v1';

  calculateShippingFee(provinceCity: string, weightGrams = 500): number {
    const city = (provinceCity || '').toLowerCase();
    if (city.includes('hà nội') || city.includes('hồ chí minh') || city.includes('đà nẵng')) {
      return 22000;
    }
    return 32000;
  }

  generateTrackingCode(carrier: ShippingCarrier): string {
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const timestamp = Date.now().toString().slice(-4);
    switch (carrier) {
      case 'GHTK':
        return `GHTK.VN.${timestamp}.${randomHex}`;
      case 'GHN':
        return `GHN${timestamp}${randomHex}`;
      case 'VIETTEL_POST':
        return `VTP${timestamp}${randomHex}VN`;
    }
  }

  createShippingOrder(params: {
    orderId: string;
    carrier?: ShippingCarrier;
    customerName: string;
    phone: string;
    address: string;
    provinceCity: string;
    shippingFee: number;
  }): ShippingOrderRecord {
    const carrier = params.carrier || 'GHTK';
    const carrierNames: Record<ShippingCarrier, string> = {
      GHTK: 'Giao Hàng Tiết Kiệm (GHTK)',
      GHN: 'Giao Hàng Nhanh (GHN Express)',
      VIETTEL_POST: 'Viettel Post Bưu Chính',
    };

    const trackingCode = this.generateTrackingCode(carrier);
    const now = new Date();
    const nowStr = now.toLocaleDateString('vi-VN') + ' ' + now.toLocaleTimeString('vi-VN');

    const timeline: ShippingTimelineStep[] = [
      {
        status: 'CREATED',
        title: 'Đã tạo đơn hàng & xuất vận đơn',
        description: `Hệ thống đã kết nối tới bưu cục ${carrierNames[carrier]}, mã vận đơn: ${trackingCode}`,
        timestamp: nowStr,
        isCompleted: true,
        isCurrent: false,
      },
      {
        status: 'PICKED',
        title: 'Bưu tá đã lấy hàng thành công',
        description: `Bưu tá thuộc bưu cục trung tâm đã tiếp nhận gói hàng và niêm phong an toàn.`,
        timestamp: 'Dự kiến: +2 giờ',
        isCompleted: false,
        isCurrent: true,
      },
      {
        status: 'IN_TRANSIT',
        title: 'Đang luân chuyển qua kho tổng',
        description: 'Kiện hàng đang được phân loại tự động tại trung tâm khai thác bưu chính.',
        timestamp: 'Dự kiến: Ngày mai',
        isCompleted: false,
        isCurrent: false,
      },
      {
        status: 'OUT_FOR_DELIVERY',
        title: 'Đang giao hàng tới người nhận',
        description: 'Bưu tá khu vực đang liên hệ số điện thoại người nhận để tiến hành giao.',
        timestamp: 'Dự kiến: 2 - 3 ngày',
        isCompleted: false,
        isCurrent: false,
      },
      {
        status: 'DELIVERED',
        title: 'Giao hàng thành công',
        description: 'Người nhận đã nhận hàng nguyên vẹn và ký nhận biên bản bưu chính.',
        timestamp: 'Dự kiến hoàn tất',
        isCompleted: false,
        isCurrent: false,
      },
    ];

    const record: ShippingOrderRecord = {
      orderId: params.orderId,
      trackingCode,
      carrier,
      carrierName: carrierNames[carrier],
      customerName: params.customerName,
      phone: params.phone,
      address: params.address,
      estimatedDeliveryDays: 2,
      shippingFee: params.shippingFee,
      currentStepIndex: 1,
      timeline,
      updatedAt: now.toISOString(),
    };

    this.saveOrder(record);
    return record;
  }

  private saveOrder(order: ShippingOrderRecord) {
    try {
      const orders = this.getAllOrders();
      orders.unshift(order);
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(this.STORAGE_KEY, JSON.stringify(orders.slice(0, 50)));
      }
    } catch {}
  }

  getAllOrders(): ShippingOrderRecord[] {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const raw = localStorage.getItem(this.STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      }
    } catch {}
    return [];
  }

  getByTrackingCode(code: string): ShippingOrderRecord | null {
    const orders = this.getAllOrders();
    return orders.find(o => o.trackingCode.toLowerCase() === (code || '').trim().toLowerCase()) || null;
  }
}

export const shippingService = new ShippingService();

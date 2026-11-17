import React, { useState } from 'react';
import { Users, Phone, Mail, MessageSquare, CheckCircle, Clock } from 'lucide-react';
import type { PlatformLead } from '../../types';

export const PlatformLeadsModule: React.FC = () => {
  const [leads, setLeads] = useState<PlatformLead[]>(() => {
    try {
      const raw = localStorage.getItem('universal_mall_leads_v1');
      if (raw) return JSON.parse(raw);
    } catch {}
    return [
      {
        id: 'lead_demo_01',
        lead_code: 'LEAD-10023',
        full_name: 'Nguyễn Thành Nam',
        phone: '0988123456',
        email: 'nam.fashion@gmail.com',
        package_type: 'pro',
        industry_focus: 'Thời Trang & Streetwear',
        domain_requested: 'namstreetwear.vn',
        status: 'NEW',
        created_at: new Date().toISOString(),
      },
      {
        id: 'lead_demo_02',
        lead_code: 'LEAD-10024',
        full_name: 'Trần Thị Thu Thảo',
        phone: '0977889900',
        email: 'thao.cosmetics@gmail.com',
        package_type: 'startup',
        industry_focus: 'Mỹ Phẩm & Skincare',
        domain_requested: 'thaobeauty.com',
        status: 'CONTACTED',
        created_at: new Date().toISOString(),
      },
    ];
  });

  return (
    <div className="space-y-4 text-xs">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-black text-gray-900 tracking-tight">Khách Hàng Thuê / Mua Sàn (Tenant Leads)</h2>
          <p className="text-gray-500 text-xs">Danh sách hồ sơ quan tâm giải pháp sàn thương mại đăng ký từ trang /giai-phap-san</p>
        </div>
      </div>

      {/* Table Rule 9: table-fixed w-full with exact percentages */}
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <table className="table-fixed w-full text-left">
          <thead className="bg-gray-50 border-b border-gray-100 text-gray-500 font-bold">
            <tr>
              <th className="py-3 px-3 w-[22%]">Mã Lead & Khách Hàng</th>
              <th className="py-3 px-2 w-[22%]">Liên hệ (SĐT / Email)</th>
              <th className="py-3 px-2 w-[20%]">Gói Đăng Ký & Ngành</th>
              <th className="py-3 px-2 w-[16%]">Trạng thái</th>
              <th className="py-3 px-3 w-[20%] text-right">Hành động</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {leads.map(lead => (
              <tr key={lead.id} className="hover:bg-orange-50/30 transition-colors">
                <td className="py-2.5 px-3">
                  <p className="font-mono font-bold text-orange-600 truncate">{lead.lead_code}</p>
                  <p className="font-bold text-gray-800 truncate">{lead.full_name}</p>
                </td>
                <td className="py-2.5 px-2">
                  <p className="font-semibold text-gray-800">{lead.phone}</p>
                  <p className="text-[10px] text-gray-400 truncate">{lead.email || 'Chưa cung cấp'}</p>
                </td>
                <td className="py-2.5 px-2">
                  <p className="font-bold text-gray-900 capitalize">
                    {lead.package_type === 'startup' ? 'Gói Khởi Nghiệp (390k)' : lead.package_type === 'pro' ? 'Gói Chuyên Nghiệp (790k)' : 'Mua Đứt Mã Nguồn (15tr)'}
                  </p>
                  <p className="text-[10px] text-gray-400 truncate">{lead.industry_focus}</p>
                </td>
                <td className="py-2.5 px-2">
                  <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded-full font-bold text-[10px] ${
                    lead.status === 'NEW'
                      ? 'bg-amber-100 text-amber-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {lead.status === 'NEW' ? 'Chưa liên hệ' : 'Đã tư vấn'}
                  </span>
                </td>
                <td className="py-2.5 px-3 text-right">
                  <a
                    href={`https://zalo.me/${lead.phone}`}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center space-x-1 px-2.5 py-1 bg-blue-50 hover:bg-blue-100 text-blue-600 font-bold rounded-lg transition-colors text-[11px]"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Chat Zalo</span>
                  </a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

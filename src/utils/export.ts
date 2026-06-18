import type { Order } from '../types';
import { STATUS_LABELS, PRODUCT_TYPE_LABELS, REFRIGERATION_LABELS } from '../types';

export function exportToCSV(orders: Order[]): void {
  const headers = [
    '订单号',
    '取货日期',
    '客户简称',
    '产品清单',
    '装盒数量',
    '过敏提醒',
    '冷藏要求',
    '核对人',
    '状态'
  ];

  const rows = orders.map((order) => [
    order.id,
    order.pickupDate,
    order.customerName,
    order.products.map((p) => `${p.name} x${p.quantity}`).join('；'),
    String(order.boxQuantity),
    order.allergyWarning || '无',
    REFRIGERATION_LABELS[order.refrigeration],
    order.checker || '未分配',
    STATUS_LABELS[order.status]
  ]);

  const csvContent = [headers, ...rows].map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `订单清单_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function printOrders(orders: Order[], title: string = '订单清单'): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 20px; font-size: 14px; }
    h1 { font-size: 20px; margin-bottom: 16px; text-align: center; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px 12px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    .status-tag { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; color: white; }
    .pending_pack { background: #f59e0b; }
    .pending_review { background: #3b82f6; }
    .ready_ship { background: #10b981; }
    .on_hold { background: #ef4444; }
    .allergy { color: #ef4444; font-weight: 600; }
    @media print {
      body { margin: 10px; }
    }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <table>
    <thead>
      <tr>
        <th>订单号</th>
        <th>取货日期</th>
        <th>客户</th>
        <th>产品清单</th>
        <th>盒数</th>
        <th>过敏提醒</th>
        <th>冷藏</th>
        <th>核对人</th>
        <th>状态</th>
      </tr>
    </thead>
    <tbody>
      ${orders.map((order) => `
      <tr>
        <td><strong>${order.id}</strong></td>
        <td>${order.pickupDate}</td>
        <td>${order.customerName}</td>
        <td>
          ${order.products.map((p) => `<div>${p.name} <small>(${PRODUCT_TYPE_LABELS[p.type]}) x${p.quantity}</small></div>`).join('')}
        </td>
        <td>${order.boxQuantity}</td>
        <td class="allergy">${order.allergyWarning || '-'}</td>
        <td>${REFRIGERATION_LABELS[order.refrigeration]}</td>
        <td>${order.checker || '-'}</td>
        <td><span class="status-tag ${order.status}">${STATUS_LABELS[order.status]}</span></td>
      </tr>
      `).join('')}
    </tbody>
  </table>
  <p style="text-align: right; color: #666;">打印时间：${new Date().toLocaleString('zh-CN')}</p>
</body>
</html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
  setTimeout(() => {
    printWindow.print();
  }, 200);
}

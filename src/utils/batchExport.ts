import type { ShippingBatch, Order } from '../types';
import { REFRIGERATION_LABELS, BATCH_STATUS_LABELS, PRODUCT_TYPE_LABELS, STATUS_LABELS } from '../types';
import { orderStore } from '../store/orderStore';
import { escapeHtml, sanitizeCsvCell } from './security';

export function exportBatchToCSV(batch: ShippingBatch): void {
  const orders = batch.orderIds
    .map((id) => orderStore.getById(id))
    .filter(Boolean) as Order[];

  const headers = [
    '序号',
    '订单号',
    '取货日期',
    '客户简称',
    '产品清单',
    '装盒数量',
    '过敏提醒',
    '冷藏要求',
    '核对人',
    '状态',
    '是否已核对'
  ];

  const rows = orders.map((order, index) => [
    sanitizeCsvCell(String(index + 1)),
    sanitizeCsvCell(order.id),
    sanitizeCsvCell(order.pickupDate),
    sanitizeCsvCell(order.customerName),
    sanitizeCsvCell(order.products.map((p) => `${p.name} x${p.quantity}`).join('；')),
    sanitizeCsvCell(String(order.boxQuantity)),
    sanitizeCsvCell(order.allergyWarning || '无'),
    sanitizeCsvCell(REFRIGERATION_LABELS[order.refrigeration]),
    sanitizeCsvCell(order.checker || '未分配'),
    sanitizeCsvCell(STATUS_LABELS[order.status]),
    sanitizeCsvCell(batch.checkedIds.includes(order.id) ? '是' : '否')
  ]);

  const stats = orders.reduce(
    (acc, o) => {
      acc.totalBoxes += o.boxQuantity;
      acc.customerCount.add(o.customerName);
      return acc;
    },
    { totalBoxes: 0, customerCount: new Set<string>() }
  );

  const summaryRows = [
    ['批次号', sanitizeCsvCell(batch.id)],
    ['取货日期', sanitizeCsvCell(batch.pickupDate)],
    ['冷藏要求', sanitizeCsvCell(batch.refrigeration === 'mixed' ? '混合' : REFRIGERATION_LABELS[batch.refrigeration])],
    ['创建人', sanitizeCsvCell(batch.createdBy)],
    ['创建时间', sanitizeCsvCell(new Date(batch.createdAt).toLocaleString('zh-CN'))],
    ['批次状态', sanitizeCsvCell(BATCH_STATUS_LABELS[batch.status])],
    ['订单总数', sanitizeCsvCell(String(orders.length))],
    ['客户数量', sanitizeCsvCell(String(stats.customerCount.size))],
    ['总盒数', sanitizeCsvCell(String(stats.totalBoxes))],
    ['已核对数', sanitizeCsvCell(String(batch.checkedIds.filter((id) => batch.orderIds.includes(id)).length))],
    ['备注', sanitizeCsvCell(batch.remark || '无')]
  ];

  const csvContent = [
    ...summaryRows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')),
    [],
    headers.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','),
    ...rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `批次清单_${batch.id}_${batch.pickupDate}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function printBatchHandover(batch: ShippingBatch): void {
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const orders = batch.orderIds
    .map((id) => orderStore.getById(id))
    .filter(Boolean) as Order[];

  const totalBoxes = orders.reduce((sum, o) => sum + o.boxQuantity, 0);
  const customerList = Array.from(new Set(orders.map((o) => o.customerName)));
  const checkedCount = batch.checkedIds.filter((id) => batch.orderIds.includes(id)).length;
  const progress = orders.length > 0 ? Math.round((checkedCount / orders.length) * 100) : 0;

  const safeBatchId = escapeHtml(batch.id);
  const safePickupDate = escapeHtml(batch.pickupDate);
  const safeRefrigeration = escapeHtml(batch.refrigeration === 'mixed' ? '混合' : REFRIGERATION_LABELS[batch.refrigeration]);
  const safeCreatedBy = escapeHtml(batch.createdBy);
  const safeCreatedAt = escapeHtml(new Date(batch.createdAt).toLocaleString('zh-CN'));
  const safeStatus = escapeHtml(BATCH_STATUS_LABELS[batch.status]);
  const safeRemark = escapeHtml(batch.remark || '无');
  const safePrintTime = escapeHtml(new Date().toLocaleString('zh-CN'));
  const safeReceivedBy = escapeHtml(batch.receivedBy || '');
  const safeShippedAt = batch.shippedAt ? escapeHtml(new Date(batch.shippedAt).toLocaleString('zh-CN')) : '';

  const orderRowsHtml = orders.map((order, index) => {
    const productsHtml = order.products
      .map((p) => `<div>${escapeHtml(p.name)} <small>(${escapeHtml(PRODUCT_TYPE_LABELS[p.type])}) ×${escapeHtml(String(p.quantity))}</small></div>`)
      .join('');
    const isChecked = batch.checkedIds.includes(order.id);
    return `
      <tr>
        <td style="width: 50px; text-align: center;">${escapeHtml(String(index + 1))}</td>
        <td><strong>${escapeHtml(order.id)}</strong></td>
        <td>${escapeHtml(order.customerName)}</td>
        <td>${productsHtml}</td>
        <td style="width: 60px; text-align: center;">${escapeHtml(String(order.boxQuantity))}</td>
        <td style="width: 100px; color: #dc2626;">${escapeHtml(order.allergyWarning || '-')}</td>
        <td style="width: 80px;">${escapeHtml(REFRIGERATION_LABELS[order.refrigeration])}</td>
        <td style="width: 80px;">${escapeHtml(order.checker || '-')}</td>
        <td style="width: 80px; text-align: center;">
          ${isChecked ? '<span style="color: #10b981;">✅ 已核对</span>' : '<span style="color: #9ca3af;">□ 未核对</span>'}
        </td>
      </tr>
    `;
  }).join('');

  const customerListHtml = customerList
    .map((c) => `<span class="customer-tag">${escapeHtml(c)}</span>`)
    .join(' ');

  const html = `
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>批次交接单 - ${safeBatchId}</title>
  <style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 24px; font-size: 13px; line-height: 1.6; color: #1f2937; }
    h1 { font-size: 22px; margin: 0 0 4px; text-align: center; color: #1f2937; }
    .subtitle { text-align: center; color: #6b7280; margin-bottom: 24px; font-size: 14px; }
    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; padding: 16px; background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; }
    .info-item { display: flex; flex-direction: column; gap: 2px; }
    .info-label { font-size: 11px; color: #6b7280; font-weight: 500; }
    .info-value { font-size: 13px; color: #1f2937; font-weight: 600; }
    .stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
    .stat-card { padding: 12px; border: 1px solid #e5e7eb; border-radius: 8px; text-align: center; }
    .stat-num { font-size: 20px; font-weight: 700; color: #f97316; }
    .stat-label { font-size: 12px; color: #6b7280; margin-top: 2px; }
    .progress-bar-wrap { margin-bottom: 20px; padding: 12px 16px; background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; }
    .progress-info { display: flex; justify-content: space-between; margin-bottom: 6px; font-size: 12px; color: #166534; }
    .progress-bar { height: 8px; background: #dcfce7; border-radius: 4px; overflow: hidden; }
    .progress-fill { height: 100%; background: #22c55e; width: ${progress}%; border-radius: 4px; transition: width 0.3s; }
    h2 { font-size: 15px; margin: 20px 0 10px; padding-left: 8px; border-left: 3px solid #f97316; }
    .customer-list { padding: 8px; background: #fef3c7; border-radius: 6px; }
    .customer-tag { display: inline-block; padding: 2px 8px; margin: 2px; background: white; border: 1px solid #fcd34d; border-radius: 4px; font-size: 12px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; font-size: 12px; }
    th, td { border: 1px solid #e5e7eb; padding: 8px 10px; text-align: left; vertical-align: top; }
    th { background: #f9fafb; font-weight: 600; color: #374151; white-space: nowrap; }
    .signature-area { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 40px; }
    .signature-box { padding: 16px; border-top: 1px solid #d1d5db; }
    .signature-label { font-size: 12px; color: #6b7280; margin-bottom: 4px; }
    .signature-space { height: 40px; border-bottom: 1px solid #9ca3af; margin-bottom: 4px; }
    .remark-box { margin-top: 16px; padding: 12px; background: #fef9c3; border: 1px dashed #eab308; border-radius: 6px; }
    .remark-label { font-size: 12px; font-weight: 600; color: #854d0e; margin-bottom: 4px; }
    .footer { margin-top: 32px; text-align: right; color: #9ca3af; font-size: 11px; }
    @media print {
      body { margin: 12px; font-size: 11px; }
      .no-print { display: none !important; }
    }
  </style>
</head>
<body>
  <h1>📦 出货批次交接单</h1>
  <p class="subtitle">批次号：<strong style="color: #f97316;">${safeBatchId}</strong></p>

  <div class="info-grid">
    <div class="info-item">
      <span class="info-label">取货日期</span>
      <span class="info-value">📅 ${safePickupDate}</span>
    </div>
    <div class="info-item">
      <span class="info-label">冷藏要求</span>
      <span class="info-value">❄️ ${safeRefrigeration}</span>
    </div>
    <div class="info-item">
      <span class="info-label">创建人</span>
      <span class="info-value">👤 ${safeCreatedBy}</span>
    </div>
    <div class="info-item">
      <span class="info-label">批次状态</span>
      <span class="info-value">📋 ${safeStatus}</span>
    </div>
    <div class="info-item">
      <span class="info-label">创建时间</span>
      <span class="info-value">🕐 ${safeCreatedAt}</span>
    </div>
    ${safeShippedAt ? `
    <div class="info-item">
      <span class="info-label">出货时间</span>
      <span class="info-value">🚚 ${safeShippedAt}</span>
    </div>
    ` : ''}
    ${safeReceivedBy ? `
    <div class="info-item">
      <span class="info-label">接收人</span>
      <span class="info-value">🤝 ${safeReceivedBy}</span>
    </div>
    ` : ''}
    <div class="info-item" style="grid-column: ${safeShippedAt && safeReceivedBy ? 'auto' : 'span 2'};">
      <span class="info-label">备注</span>
      <span class="info-value">📝 ${safeRemark || '无'}</span>
    </div>
  </div>

  <div class="stats-row">
    <div class="stat-card">
      <div class="stat-num">${escapeHtml(String(orders.length))}</div>
      <div class="stat-label">订单总数</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${escapeHtml(String(customerList.length))}</div>
      <div class="stat-label">客户数量</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${escapeHtml(String(totalBoxes))}</div>
      <div class="stat-label">总盒数</div>
    </div>
    <div class="stat-card">
      <div class="stat-num">${escapeHtml(String(checkedCount))}/${escapeHtml(String(orders.length))}</div>
      <div class="stat-label">核对进度</div>
    </div>
  </div>

  <div class="progress-bar-wrap">
    <div class="progress-info">
      <strong>核对进度</strong>
      <span>${escapeHtml(String(checkedCount))} / ${escapeHtml(String(orders.length))} (${escapeHtml(String(progress))}%)</span>
    </div>
    <div class="progress-bar">
      <div class="progress-fill"></div>
    </div>
  </div>

  <h2>👥 客户清单（${escapeHtml(String(customerList.length))} 位）</h2>
  <div class="customer-list">
    ${customerListHtml}
  </div>

  <h2>🧾 订单明细</h2>
  <table>
    <thead>
      <tr>
        <th>序号</th>
        <th>订单号</th>
        <th>客户</th>
        <th>产品清单</th>
        <th>盒数</th>
        <th>过敏提醒</th>
        <th>冷藏</th>
        <th>核对人</th>
        <th>核对</th>
      </tr>
    </thead>
    <tbody>
      ${orderRowsHtml}
    </tbody>
  </table>

  ${batch.remark ? `
  <div class="remark-box">
    <div class="remark-label">📝 批次备注</div>
    <div style="font-size: 12px;">${safeRemark}</div>
  </div>
  ` : ''}

  <div class="signature-area">
    <div class="signature-box">
      <div class="signature-label">装盒人员签字确认</div>
      <div class="signature-space"></div>
      <div style="font-size: 11px; color: #9ca3af;">日期：____________</div>
    </div>
    <div class="signature-box">
      <div class="signature-label">接收门店/人员签字确认</div>
      <div class="signature-space"></div>
      <div style="font-size: 11px; color: #9ca3af;">日期：____________</div>
    </div>
  </div>

  <div class="footer">
    打印时间：${safePrintTime}
  </div>

  <div class="no-print" style="text-align: center; margin-top: 24px;">
    <button onclick="window.print()" style="padding: 10px 24px; background: #f97316; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; font-weight: 600;">
      🖨️ 打印交接单
    </button>
  </div>
</body>
</html>
  `;

  printWindow.document.write(html);
  printWindow.document.close();
  printWindow.focus();
}

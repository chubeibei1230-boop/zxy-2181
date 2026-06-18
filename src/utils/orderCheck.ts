import type { Order, CheckWarning, RefrigerationType } from '../types';

export function checkOrders(orders: Order[]): CheckWarning[] {
  const warnings: CheckWarning[] = [];

  orders.forEach((order) => {
    const orderWarnings = checkSingleOrder(order, orders);
    warnings.push(...orderWarnings);
  });

  return warnings;
}

function checkSingleOrder(order: Order, allOrders: Order[]): CheckWarning[] {
  const warnings: CheckWarning[] = [];

  const duplicateOrders = allOrders.filter(
    (o) => o.id !== order.id && o.customerName === order.customerName && o.pickupDate === order.pickupDate
  );
  if (duplicateOrders.length > 0) {
    warnings.push({
      orderId: order.id,
      type: 'duplicate',
      message: `与订单 ${duplicateOrders.map((o) => o.id).join('、')} 为同一客户同日订单，请注意合并装盒`,
      severity: 'warning'
    });
  }

  const totalProductQty = order.products.reduce((sum, p) => sum + p.quantity, 0);
  if (totalProductQty !== order.boxQuantity) {
    warnings.push({
      orderId: order.id,
      type: 'quantity_mismatch',
      message: `装盒数量(${order.boxQuantity})与产品总数(${totalProductQty})不一致`,
      severity: 'error'
    });
  }

  if (!order.allergyWarning || order.allergyWarning.trim() === '') {
    warnings.push({
      orderId: order.id,
      type: 'allergy_empty',
      message: '过敏提醒为空，请确认是否有过敏信息',
      severity: 'warning'
    });
  }

  if (hasRefrigerationConflict(order)) {
    warnings.push({
      orderId: order.id,
      type: 'refrigeration_conflict',
      message: '订单内产品冷藏要求不一致，请分别装盒',
      severity: 'error'
    });
  }

  return warnings;
}

function hasRefrigerationConflict(order: Order): boolean {
  const types = new Set<RefrigerationType>();
  types.add(order.refrigeration);

  const productTemps = order.products.map((p) => inferRefrigeration(p.type));
  productTemps.forEach((t) => types.add(t));

  const hasCold = types.has('chilled') || types.has('frozen');
  const hasRoom = types.has('none');

  return hasCold && hasRoom;
}

function inferRefrigeration(productType: string): RefrigerationType {
  switch (productType) {
    case 'cake':
      return 'chilled';
    case 'giftbox':
      return 'none';
    case 'cookie':
      return 'none';
    default:
      return 'none';
  }
}

export function getWarningsByOrderId(warnings: CheckWarning[], orderId: string): CheckWarning[] {
  return warnings.filter((w) => w.orderId === orderId);
}

export function groupWarningsByType(warnings: CheckWarning[]): Record<string, CheckWarning[]> {
  const grouped: Record<string, CheckWarning[]> = {};
  warnings.forEach((w) => {
    if (!grouped[w.type]) {
      grouped[w.type] = [];
    }
    grouped[w.type].push(w);
  });
  return grouped;
}

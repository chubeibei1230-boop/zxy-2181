import type { Order, RefrigerationType, ShippingBatch, BatchStatus, BatchFilterOptions } from '../types';
import { STATUS_LABELS } from '../types';
import { orderStore } from './orderStore';

const STORAGE_KEY = 'bakery_batches';

export interface OrderEligibilityResult {
  eligible: boolean;
  reasons: string[];
}

export class BatchStore {
  private batches: ShippingBatch[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.batches = JSON.parse(stored);
      } else {
        this.batches = [];
        this.saveToStorage();
      }
    } catch {
      this.batches = [];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.batches));
    } catch {
      console.error('Failed to save batches to localStorage');
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  getAll(): ShippingBatch[] {
    return [...this.batches];
  }

  getById(id: string): ShippingBatch | undefined {
    return this.batches.find((b) => b.id === id);
  }

  checkOrderEligibility(order: Order): OrderEligibilityResult {
    const reasons: string[] = [];

    if (order.status !== 'ready_ship') {
      const statusLabel = STATUS_LABELS[order.status] || order.status;
      reasons.push(`订单状态为"${statusLabel}"，需先达到"可出货"状态`);
    }

    const activeException = orderStore.getActiveException(order.id);
    if (activeException) {
      reasons.push(`存在未解决异常：${activeException.reason}`);
    }

    if (!order.checker) {
      reasons.push('未分配核对人');
    }

    return {
      eligible: reasons.length === 0,
      reasons
    };
  }

  getEligibleOrders(pickupDate?: string, refrigeration?: RefrigerationType | 'all'): Order[] {
    const allOrders = orderStore.getAll();
    return allOrders.filter((order) => {
      const result = this.checkOrderEligibility(order);
      if (!result.eligible) return false;
      if (pickupDate && order.pickupDate !== pickupDate) return false;
      if (refrigeration && refrigeration !== 'all' && order.refrigeration !== refrigeration) return false;
      const inAnyBatch = this.batches.some(
        (b) => b.status !== 'completed' && b.orderIds.includes(order.id)
      );
      if (inAnyBatch) return false;
      return true;
    });
  }

  createBatch(
    orderIds: string[],
    pickupDate: string,
    refrigeration: RefrigerationType | 'mixed',
    createdBy: string,
    remark?: string
  ): ShippingBatch | null {
    const now = new Date().toISOString();
    const validOrderIds: string[] = [];

    for (const id of orderIds) {
      const order = orderStore.getById(id);
      if (!order) continue;
      const result = this.checkOrderEligibility(order);
      if (!result.eligible) continue;
      const inAnyBatch = this.batches.some(
        (b) => b.status !== 'completed' && b.orderIds.includes(id)
      );
      if (inAnyBatch) continue;
      validOrderIds.push(id);
    }

    if (validOrderIds.length === 0) return null;

    const newBatch: ShippingBatch = {
      id: this.generateId(),
      pickupDate,
      refrigeration,
      status: 'created',
      orderIds: validOrderIds,
      checkedIds: [],
      remark: remark || '',
      createdBy,
      createdAt: now,
      updatedAt: now
    };

    this.batches.push(newBatch);
    this.saveToStorage();
    this.notify();
    return newBatch;
  }

  removeOrder(batchId: string, orderId: string): boolean {
    const batch = this.batches.find((b) => b.id === batchId);
    if (!batch) return false;
    if (batch.status === 'completed') return false;

    const index = batch.orderIds.indexOf(orderId);
    if (index === -1) return false;

    batch.orderIds.splice(index, 1);
    const checkedIndex = batch.checkedIds.indexOf(orderId);
    if (checkedIndex !== -1) {
      batch.checkedIds.splice(checkedIndex, 1);
    }
    batch.updatedAt = new Date().toISOString();

    if (batch.orderIds.length === 0) {
      this.delete(batchId);
    } else {
      this.saveToStorage();
      this.notify();
    }
    return true;
  }

  addOrder(batchId: string, orderId: string): boolean {
    const batch = this.batches.find((b) => b.id === batchId);
    if (!batch) return false;
    if (batch.status === 'completed') return false;

    const order = orderStore.getById(orderId);
    if (!order) return false;

    const result = this.checkOrderEligibility(order);
    if (!result.eligible) return false;

    if (batch.orderIds.includes(orderId)) return false;

    if (batch.refrigeration !== 'mixed' && batch.refrigeration !== order.refrigeration) {
      return false;
    }

    batch.orderIds.push(orderId);
    batch.updatedAt = new Date().toISOString();
    this.saveToStorage();
    this.notify();
    return true;
  }

  updateChecked(batchId: string, orderId: string, checked: boolean): boolean {
    const batch = this.batches.find((b) => b.id === batchId);
    if (!batch) return false;
    if (batch.status === 'completed') return false;

    const idx = batch.checkedIds.indexOf(orderId);
    if (checked && idx === -1) {
      batch.checkedIds.push(orderId);
    } else if (!checked && idx !== -1) {
      batch.checkedIds.splice(idx, 1);
    } else {
      return false;
    }
    batch.updatedAt = new Date().toISOString();
    this.saveToStorage();
    this.notify();
    return true;
  }

  markShipped(batchId: string, receivedBy?: string, handoverRemark?: string, handoverBy?: string): boolean {
    const batch = this.batches.find((b) => b.id === batchId);
    if (!batch) return false;
    if (batch.status === 'completed') return false;

    const now = new Date().toISOString();
    batch.status = 'completed';
    batch.shippedAt = now;
    batch.receivedBy = receivedBy || '';
    batch.handoverRemark = handoverRemark || '';
    batch.handoverBy = handoverBy || '';
    batch.updatedAt = now;

    batch.checkedIds = [...batch.orderIds];

    batch.orderIds.forEach((orderId) => {
      orderStore.updateStatus([orderId], 'shipped');
    });

    this.saveToStorage();
    this.notify();
    return true;
  }

  updateStatus(batchId: string, status: BatchStatus): boolean {
    const batch = this.batches.find((b) => b.id === batchId);
    if (!batch) return false;
    batch.status = status;
    batch.updatedAt = new Date().toISOString();
    this.saveToStorage();
    this.notify();
    return true;
  }

  delete(id: string): boolean {
    const index = this.batches.findIndex((b) => b.id === id);
    if (index === -1) return false;
    this.batches.splice(index, 1);
    this.saveToStorage();
    this.notify();
    return true;
  }

  update(id: string, updates: Partial<Omit<ShippingBatch, 'id' | 'createdAt'>>): ShippingBatch | undefined {
    const index = this.batches.findIndex((b) => b.id === id);
    if (index === -1) return undefined;
    this.batches[index] = {
      ...this.batches[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.saveToStorage();
    this.notify();
    return this.batches[index];
  }

  filter(options: BatchFilterOptions): ShippingBatch[] {
    return this.batches.filter((batch) => {
      if (options.pickupDate && batch.pickupDate !== options.pickupDate) {
        return false;
      }
      if (options.refrigeration && options.refrigeration !== 'all' && batch.refrigeration !== options.refrigeration) {
        return false;
      }
      if (options.status && options.status !== 'all' && batch.status !== options.status) {
        return false;
      }
      if (options.keyword) {
        const kw = options.keyword.toLowerCase();
        const matchId = batch.id.toLowerCase().includes(kw);
        const orders = batch.orderIds
          .map((id) => orderStore.getById(id))
          .filter(Boolean) as Order[];
        const matchCustomer = orders.some((o) => o.customerName.toLowerCase().includes(kw));
        if (!matchId && !matchCustomer) return false;
      }
      return true;
    });
  }

  getBatchOrders(batch: ShippingBatch): Order[] {
    return batch.orderIds
      .map((id) => orderStore.getById(id))
      .filter(Boolean) as Order[];
  }

  getBatchStats(batch: ShippingBatch): {
    orderCount: number;
    totalBoxes: number;
    customerCount: number;
    checkedCount: number;
    progress: number;
  } {
    const orders = this.getBatchOrders(batch);
    const orderCount = orders.length;
    const totalBoxes = orders.reduce((sum, o) => sum + o.boxQuantity, 0);
    const customerCount = new Set(orders.map((o) => o.customerName)).size;
    const checkedCount = batch.checkedIds.filter((id) => batch.orderIds.includes(id)).length;
    const progress = orderCount > 0 ? Math.round((checkedCount / orderCount) * 100) : 0;
    return { orderCount, totalBoxes, customerCount, checkedCount, progress };
  }

  getHandoverSummary(batch: ShippingBatch): {
    orderCount: number;
    customerCount: number;
    totalBoxes: number;
    uncheckedCount: number;
    uncheckedOrders: Order[];
    unresolvedExceptionCount: number;
    unresolvedExceptionOrders: Order[];
    allergyOrders: Order[];
    allergyCount: number;
    refrigerationSummary: { chilled: number; frozen: number; none: number; mixed: boolean };
    remark: string;
  } {
    const orders = this.getBatchOrders(batch);
    const orderCount = orders.length;
    const totalBoxes = orders.reduce((sum, o) => sum + o.boxQuantity, 0);
    const customerCount = new Set(orders.map((o) => o.customerName)).size;

    const uncheckedOrders = orders.filter((o) => !batch.checkedIds.includes(o.id));
    const uncheckedCount = uncheckedOrders.length;

    const unresolvedExceptionOrders = orders.filter((o) => {
      const active = orderStore.getActiveException(o.id);
      return active && active.status !== 'resolved';
    });
    const unresolvedExceptionCount = unresolvedExceptionOrders.length;

    const allergyOrders = orders.filter((o) => o.allergyWarning && o.allergyWarning.trim() !== '');
    const allergyCount = allergyOrders.length;

    const refrigerationTypes = new Set(orders.map((o) => o.refrigeration));
    const refrigerationSummary = {
      chilled: orders.filter((o) => o.refrigeration === 'chilled').length,
      frozen: orders.filter((o) => o.refrigeration === 'frozen').length,
      none: orders.filter((o) => o.refrigeration === 'none').length,
      mixed: refrigerationTypes.size > 1
    };

    return {
      orderCount,
      customerCount,
      totalBoxes,
      uncheckedCount,
      uncheckedOrders,
      unresolvedExceptionCount,
      unresolvedExceptionOrders,
      allergyOrders,
      allergyCount,
      refrigerationSummary,
      remark: batch.remark
    };
  }

  getUnbatchedReadyOrders(): Order[] {
    const all = orderStore.getAll();
    return all.filter((o) => {
      const result = this.checkOrderEligibility(o);
      if (!result.eligible) return false;
      const inBatch = this.batches.some(
        (b) => b.status !== 'completed' && b.orderIds.includes(o.id)
      );
      return !inBatch;
    });
  }

  reset(): void {
    this.batches = [];
    this.saveToStorage();
    this.notify();
  }

  private generateId(): string {
    let maxNum = 0;
    this.batches.forEach((b) => {
      const match = b.id.match(/^BATCH-(\d+)$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    return `BATCH-${String(maxNum + 1).padStart(3, '0')}`;
  }
}

export const batchStore = new BatchStore();

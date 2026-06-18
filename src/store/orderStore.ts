import type { Order, OrderStatus, FilterOptions, ExceptionRecord, ExceptionStatus, ExceptionCategory } from '../types';
import { mockOrders } from '../data/mockData';

const STORAGE_KEY = 'bakery_orders';

export class OrderStore {
  private orders: Order[] = [];
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.orders = parsed.map((o: Order) => ({
          ...o,
          exceptionRecords: o.exceptionRecords || []
        }));
      } else {
        this.orders = [...mockOrders];
        this.saveToStorage();
      }
    } catch {
      this.orders = [...mockOrders];
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.orders));
    } catch {
      console.error('Failed to save to localStorage');
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    this.listeners.forEach((fn) => fn());
  }

  getAll(): Order[] {
    return [...this.orders];
  }

  getById(id: string): Order | undefined {
    return this.orders.find((o) => o.id === id);
  }

  add(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'exceptionRecords'>): Order {
    const now = new Date().toISOString();
    const newOrder: Order = {
      ...order,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now,
      exceptionRecords: []
    };
    this.orders.push(newOrder);
    this.saveToStorage();
    this.notify();
    return newOrder;
  }

  update(id: string, updates: Partial<Omit<Order, 'exceptionRecords'>>): Order | undefined {
    const index = this.orders.findIndex((o) => o.id === id);
    if (index === -1) return undefined;
    this.orders[index] = {
      ...this.orders[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    this.saveToStorage();
    this.notify();
    return this.orders[index];
  }

  delete(id: string): boolean {
    const index = this.orders.findIndex((o) => o.id === id);
    if (index === -1) return false;
    this.orders.splice(index, 1);
    this.saveToStorage();
    this.notify();
    return true;
  }

  updateStatus(ids: string[], status: OrderStatus, checker?: string): void {
    const now = new Date().toISOString();
    ids.forEach((id) => {
      const order = this.orders.find((o) => o.id === id);
      if (order) {
        order.status = status;
        order.updatedAt = now;
        if (checker !== undefined) {
          order.checker = checker;
        }
      }
    });
    this.saveToStorage();
    this.notify();
  }

  addException(
    orderId: string,
    data: {
      category: ExceptionCategory;
      reason: string;
      responsible: string;
    }
  ): ExceptionRecord | null {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order) return null;

    const now = new Date().toISOString();
    const record: ExceptionRecord = {
      id: this.generateExceptionId(),
      orderId,
      category: data.category,
      reason: data.reason,
      status: 'pending',
      responsible: data.responsible,
      handlerRemark: '',
      createdAt: now,
      updatedAt: now,
      previousStatus: order.status
    };

    order.exceptionRecords = order.exceptionRecords || [];
    order.exceptionRecords.push(record);
    order.status = 'on_hold';
    order.updatedAt = now;

    this.saveToStorage();
    this.notify();
    return record;
  }

  updateException(
    orderId: string,
    exceptionId: string,
    updates: Partial<Pick<ExceptionRecord, 'status' | 'handlerRemark' | 'responsible'>>
  ): ExceptionRecord | null {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order || !order.exceptionRecords) return null;

    const record = order.exceptionRecords.find((r) => r.id === exceptionId);
    if (!record) return null;

    const now = new Date().toISOString();
    Object.assign(record, updates, { updatedAt: now });

    if (updates.status === 'resolved') {
      record.resolvedAt = now;
    }

    order.updatedAt = now;
    this.saveToStorage();
    this.notify();
    return record;
  }

  resolveExceptionAndRestore(
    orderId: string,
    exceptionId: string,
    handlerRemark: string
  ): boolean {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order || !order.exceptionRecords) return false;

    const record = order.exceptionRecords.find((r) => r.id === exceptionId);
    if (!record) return false;

    const now = new Date().toISOString();
    record.status = 'resolved';
    record.handlerRemark = handlerRemark;
    record.updatedAt = now;
    record.resolvedAt = now;

    const restoreStatus = record.previousStatus === 'on_hold' ? 'pending_review' : record.previousStatus;
    order.status = restoreStatus;
    order.updatedAt = now;

    this.saveToStorage();
    this.notify();
    return true;
  }

  getActiveException(orderId: string): ExceptionRecord | undefined {
    const order = this.orders.find((o) => o.id === orderId);
    if (!order || !order.exceptionRecords) return undefined;
    return order.exceptionRecords.find((r) => r.status !== 'resolved');
  }

  getExceptionStatus(orderId: string): ExceptionStatus | 'none' {
    const active = this.getActiveException(orderId);
    return active ? active.status : 'none';
  }

  filter(options: FilterOptions): Order[] {
    return this.orders.filter((order) => {
      if (options.pickupDate && order.pickupDate !== options.pickupDate) {
        return false;
      }
      if (options.productType !== 'all') {
        if (!order.products.some((p) => p.type === options.productType)) {
          return false;
        }
      }
      if (options.checker && order.checker !== options.checker) {
        return false;
      }
      if (options.status !== 'all' && order.status !== options.status) {
        return false;
      }
      if (options.refrigeration !== 'all' && order.refrigeration !== options.refrigeration) {
        return false;
      }
      if (options.exceptionStatus !== 'all') {
        const active = this.getActiveException(order.id);
        if (options.exceptionStatus === 'none') {
          if (active) return false;
        } else if (options.exceptionStatus === 'resolved') {
          const hasResolved = order.exceptionRecords?.some((r) => r.status === 'resolved');
          if (!hasResolved) return false;
        } else {
          if (!active || active.status !== options.exceptionStatus) return false;
        }
      }
      return true;
    });
  }

  getCheckers(): string[] {
    const checkers = new Set<string>();
    this.orders.forEach((o) => {
      if (o.checker) checkers.add(o.checker);
    });
    return Array.from(checkers).sort();
  }

  getPickupDates(): string[] {
    const dates = new Set<string>();
    this.orders.forEach((o) => dates.add(o.pickupDate));
    return Array.from(dates).sort();
  }

  resetToMock(): void {
    this.orders = [...mockOrders];
    this.saveToStorage();
    this.notify();
  }

  private generateId(): string {
    let maxNum = 0;
    this.orders.forEach((o) => {
      const match = o.id.match(/^ORD-(\d+)$/);
      if (match) {
        const n = parseInt(match[1], 10);
        if (n > maxNum) maxNum = n;
      }
    });
    return `ORD-${String(maxNum + 1).padStart(3, '0')}`;
  }

  private generateExceptionId(): string {
    let maxNum = 0;
    this.orders.forEach((o) => {
      o.exceptionRecords?.forEach((r) => {
        const match = r.id.match(/^EXC-(\d+)$/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (n > maxNum) maxNum = n;
        }
      });
    });
    return `EXC-${String(maxNum + 1).padStart(3, '0')}`;
  }
}

export const orderStore = new OrderStore();

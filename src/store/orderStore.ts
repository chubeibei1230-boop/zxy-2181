import type { Order, OrderStatus, FilterOptions } from '../types';
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
        this.orders = JSON.parse(stored);
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

  add(order: Omit<Order, 'id' | 'createdAt' | 'updatedAt'>): Order {
    const now = new Date().toISOString();
    const newOrder: Order = {
      ...order,
      id: this.generateId(),
      createdAt: now,
      updatedAt: now
    };
    this.orders.push(newOrder);
    this.saveToStorage();
    this.notify();
    return newOrder;
  }

  update(id: string, updates: Partial<Order>): Order | undefined {
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
    const num = this.orders.length + 1;
    return `ORD-${String(num).padStart(3, '0')}`;
  }
}

export const orderStore = new OrderStore();

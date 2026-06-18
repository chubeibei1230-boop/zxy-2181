export type OrderStatus = 'pending_pack' | 'pending_review' | 'ready_ship' | 'on_hold';

export type ProductType = 'cake' | 'cookie' | 'giftbox';

export type RefrigerationType = 'none' | 'chilled' | 'frozen';

export interface ProductItem {
  name: string;
  type: ProductType;
  quantity: number;
}

export interface Order {
  id: string;
  pickupDate: string;
  customerName: string;
  products: ProductItem[];
  boxQuantity: number;
  allergyWarning: string;
  refrigeration: RefrigerationType;
  checker: string;
  status: OrderStatus;
  createdAt: string;
  updatedAt: string;
}

export interface FilterOptions {
  pickupDate: string;
  productType: ProductType | 'all';
  checker: string;
  status: OrderStatus | 'all';
  refrigeration: RefrigerationType | 'all';
}

export interface CheckWarning {
  orderId: string;
  type: 'duplicate' | 'quantity_mismatch' | 'allergy_empty' | 'refrigeration_conflict';
  message: string;
  severity: 'warning' | 'error';
}

export const STATUS_LABELS: Record<OrderStatus, string> = {
  pending_pack: '待装盒',
  pending_review: '待复核',
  ready_ship: '可出货',
  on_hold: '异常暂缓'
};

export const PRODUCT_TYPE_LABELS: Record<ProductType, string> = {
  cake: '蛋糕',
  cookie: '饼干',
  giftbox: '礼盒'
};

export const REFRIGERATION_LABELS: Record<RefrigerationType, string> = {
  none: '常温',
  chilled: '冷藏',
  frozen: '冷冻'
};

export const STATUS_COLORS: Record<OrderStatus, string> = {
  pending_pack: '#f59e0b',
  pending_review: '#3b82f6',
  ready_ship: '#10b981',
  on_hold: '#ef4444'
};

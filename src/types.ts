export type OrderStatus = 'pending_pack' | 'pending_review' | 'ready_ship' | 'on_hold';

export type ExceptionStatus = 'pending' | 'processing' | 'resolved';

export type ProductType = 'cake' | 'cookie' | 'giftbox';

export type RefrigerationType = 'none' | 'chilled' | 'frozen';

export type ExceptionCategory =
  | 'product_issue'
  | 'quantity_issue'
  | 'allergy_issue'
  | 'refrigeration_issue'
  | 'customer_request'
  | 'other';

export interface ExceptionRecord {
  id: string;
  orderId: string;
  category: ExceptionCategory;
  reason: string;
  status: ExceptionStatus;
  responsible: string;
  handlerRemark: string;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  previousStatus: OrderStatus;
}

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
  exceptionRecords: ExceptionRecord[];
}

export interface FilterOptions {
  pickupDate: string;
  productType: ProductType | 'all';
  checker: string;
  status: OrderStatus | 'all';
  refrigeration: RefrigerationType | 'all';
  exceptionStatus: ExceptionStatus | 'all' | 'none';
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

export const EXCEPTION_STATUS_LABELS: Record<ExceptionStatus, string> = {
  pending: '待处理',
  processing: '处理中',
  resolved: '已解决'
};

export const EXCEPTION_STATUS_COLORS: Record<ExceptionStatus, string> = {
  pending: '#ef4444',
  processing: '#f59e0b',
  resolved: '#10b981'
};

export const EXCEPTION_CATEGORY_LABELS: Record<ExceptionCategory, string> = {
  product_issue: '产品问题',
  quantity_issue: '数量不符',
  allergy_issue: '过敏信息问题',
  refrigeration_issue: '冷藏要求冲突',
  customer_request: '客户临时要求',
  other: '其他问题'
};

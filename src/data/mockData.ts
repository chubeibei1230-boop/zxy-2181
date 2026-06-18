import type { Order } from '../types';

export const mockOrders: Order[] = [
  {
    id: 'ORD-001',
    pickupDate: '2026-06-20',
    customerName: '张先生',
    products: [
      { name: '草莓奶油蛋糕', type: 'cake', quantity: 1 },
      { name: '巧克力曲奇', type: 'cookie', quantity: 2 }
    ],
    boxQuantity: 2,
    allergyWarning: '坚果过敏',
    refrigeration: 'chilled',
    checker: '小李',
    status: 'pending_pack',
    createdAt: '2026-06-18T09:00:00Z',
    updatedAt: '2026-06-18T09:00:00Z'
  },
  {
    id: 'ORD-002',
    pickupDate: '2026-06-20',
    customerName: '王女士',
    products: [
      { name: '抹茶千层蛋糕', type: 'cake', quantity: 1 },
      { name: '黄油曲奇', type: 'cookie', quantity: 1 }
    ],
    boxQuantity: 2,
    allergyWarning: '',
    refrigeration: 'chilled',
    checker: '小王',
    status: 'pending_review',
    createdAt: '2026-06-18T10:30:00Z',
    updatedAt: '2026-06-18T14:00:00Z'
  },
  {
    id: 'ORD-003',
    pickupDate: '2026-06-21',
    customerName: '李先生',
    products: [
      { name: '精品礼盒A', type: 'giftbox', quantity: 3 }
    ],
    boxQuantity: 3,
    allergyWarning: '乳糖不耐受',
    refrigeration: 'none',
    checker: '小李',
    status: 'ready_ship',
    createdAt: '2026-06-17T11:00:00Z',
    updatedAt: '2026-06-18T16:00:00Z'
  },
  {
    id: 'ORD-004',
    pickupDate: '2026-06-20',
    customerName: '张先生',
    products: [
      { name: '芒果慕斯蛋糕', type: 'cake', quantity: 1 }
    ],
    boxQuantity: 2,
    allergyWarning: '芒果过敏',
    refrigeration: 'frozen',
    checker: '',
    status: 'on_hold',
    createdAt: '2026-06-18T13:00:00Z',
    updatedAt: '2026-06-18T13:30:00Z'
  },
  {
    id: 'ORD-005',
    pickupDate: '2026-06-22',
    customerName: '陈小姐',
    products: [
      { name: '曲奇礼盒', type: 'giftbox', quantity: 5 },
      { name: '芝士蛋糕', type: 'cake', quantity: 2 }
    ],
    boxQuantity: 6,
    allergyWarning: '麸质过敏',
    refrigeration: 'chilled',
    checker: '小王',
    status: 'pending_pack',
    createdAt: '2026-06-16T15:00:00Z',
    updatedAt: '2026-06-17T10:00:00Z'
  },
  {
    id: 'ORD-006',
    pickupDate: '2026-06-20',
    customerName: '刘先生',
    products: [
      { name: '蔓越莓曲奇', type: 'cookie', quantity: 3 }
    ],
    boxQuantity: 3,
    allergyWarning: '',
    refrigeration: 'none',
    checker: '小李',
    status: 'pending_review',
    createdAt: '2026-06-18T08:00:00Z',
    updatedAt: '2026-06-18T12:00:00Z'
  },
  {
    id: 'ORD-007',
    pickupDate: '2026-06-21',
    customerName: '赵女士',
    products: [
      { name: '生日蛋糕', type: 'cake', quantity: 1 },
      { name: '奶油曲奇', type: 'cookie', quantity: 2 },
      { name: '甜品礼盒', type: 'giftbox', quantity: 1 }
    ],
    boxQuantity: 3,
    allergyWarning: '鸡蛋过敏',
    refrigeration: 'chilled',
    checker: '小张',
    status: 'ready_ship',
    createdAt: '2026-06-15T09:00:00Z',
    updatedAt: '2026-06-18T17:00:00Z'
  },
  {
    id: 'ORD-008',
    pickupDate: '2026-06-22',
    customerName: '孙先生',
    products: [
      { name: '提拉米苏', type: 'cake', quantity: 2 }
    ],
    boxQuantity: 1,
    allergyWarning: '咖啡因敏感',
    refrigeration: 'frozen',
    checker: '小王',
    status: 'pending_pack',
    createdAt: '2026-06-17T14:00:00Z',
    updatedAt: '2026-06-17T14:00:00Z'
  }
];

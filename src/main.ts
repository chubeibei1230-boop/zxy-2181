import './styles.css';
import { orderStore } from './store/orderStore';
import { batchStore } from './store/batchStore';
import { checkOrders, getWarningsByOrderId } from './utils/orderCheck';
import { exportToCSV, printOrders } from './utils/export';
import { exportBatchToCSV, printBatchHandover } from './utils/batchExport';
import { escapeHtml } from './utils/security';
import type {
  Order,
  OrderStatus,
  FilterOptions,
  ProductType,
  RefrigerationType,
  CheckWarning,
  ProductItem,
  ExceptionRecord,
  ExceptionStatus,
  ExceptionCategory,
  ShippingBatch,
  BatchStatus,
  BatchFilterOptions
} from './types';
import {
  STATUS_LABELS,
  PRODUCT_TYPE_LABELS,
  REFRIGERATION_LABELS,
  EXCEPTION_STATUS_LABELS,
  EXCEPTION_STATUS_COLORS,
  EXCEPTION_CATEGORY_LABELS,
  BATCH_STATUS_LABELS,
  BATCH_STATUS_COLORS
} from './types';

type ViewMode = 'list' | 'shipping' | 'batches' | 'batch-detail';

class App {
  private viewMode: ViewMode = 'list';
  private selectedIds: Set<string> = new Set();
  private filters: FilterOptions = {
    pickupDate: '',
    productType: 'all',
    checker: '',
    status: 'all',
    refrigeration: 'all',
    exceptionStatus: 'all'
  };
  private shippingChecked: Set<string> = new Set();
  private editingOrder: Order | null = null;
  private exceptionDialogContext: { orderId: string; exceptionId?: string } | null = null;
  private exceptionHistoryOrderId: string | null = null;
  private currentBatchId: string | null = null;
  private createBatchContext: {
    pickupDate: string;
    refrigeration: RefrigerationType | 'all' | 'mixed';
    selectedOrderIds: Set<string>;
  } | null = null;
  private batchFilters: BatchFilterOptions = {
    pickupDate: '',
    refrigeration: 'all',
    status: 'all',
    keyword: ''
  };

  constructor() {
    this.render();
    orderStore.subscribe(() => this.render());
    batchStore.subscribe(() => this.render());
  }

  private get filteredOrders(): Order[] {
    return orderStore.filter(this.filters);
  }

  private get visibleSelectedIds(): string[] {
    const visibleIds = new Set(this.filteredOrders.map((o) => o.id));
    return Array.from(this.selectedIds).filter((id) => visibleIds.has(id));
  }

  private get warnings(): CheckWarning[] {
    return checkOrders(orderStore.getAll());
  }

  private syncSelectedIdsWithVisibility(): void {
    const visibleIds = new Set(this.filteredOrders.map((o) => o.id));
    const newSelected = new Set<string>();
    this.selectedIds.forEach((id) => {
      if (visibleIds.has(id)) newSelected.add(id);
    });
    this.selectedIds = newSelected;
  }

  private render(): void {
    const app = document.getElementById('app');
    if (!app) return;

    this.syncSelectedIdsWithVisibility();

    app.innerHTML = '';
    app.appendChild(this.renderHeader());
    app.appendChild(this.renderMain());
  }

  private renderHeader(): HTMLElement {
    const header = document.createElement('header');
    header.className = 'app-header';

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.justifyContent = 'space-between';
    titleRow.style.alignItems = 'center';
    titleRow.style.flexWrap = 'wrap';
    titleRow.style.gap = '12px';

    const titleGroup = document.createElement('div');
    const h1 = document.createElement('h1');
    h1.textContent = '🧁 烘焙订单装盒核对系统';
    const p = document.createElement('p');
    p.textContent = '出货前核对蛋糕、饼干和礼盒内容，确保准确无误';
    titleGroup.appendChild(h1);
    titleGroup.appendChild(p);

    const actions = document.createElement('div');
    actions.className = 'header-actions';

    const addBtn = this.createButton('➕ 新增订单', 'btn-primary', () => this.openOrderModal());
    const exportBtn = this.createButton('📊 导出CSV', '', () => exportToCSV(this.filteredOrders));
    const printBtn = this.createButton('🖨️ 打印', '', () => printOrders(this.filteredOrders, '订单清单'));
    const resetBtn = this.createButton('🔄 重置数据', '', () => {
      if (confirm('确定要重置为示例数据吗？所有修改将丢失。')) {
        orderStore.resetToMock();
      }
    });

    actions.append(addBtn, exportBtn, printBtn, resetBtn);
    titleRow.append(titleGroup, actions);
    header.appendChild(titleRow);

    return header;
  }

  private renderMain(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'container';

    container.appendChild(this.renderTabs());

    if (this.viewMode === 'list') {
      container.appendChild(this.renderStats());
      container.appendChild(this.renderFilterBar());
      container.appendChild(this.renderBatchBar());
      container.appendChild(this.renderOrderTable());
    } else if (this.viewMode === 'shipping') {
      container.appendChild(this.renderShippingMode());
    } else if (this.viewMode === 'batches') {
      container.appendChild(this.renderBatchesView());
    } else if (this.viewMode === 'batch-detail') {
      container.appendChild(this.renderBatchDetailView());
    }

    return container;
  }

  private renderTabs(): HTMLElement {
    const tabs = document.createElement('div');
    tabs.className = 'tabs';

    const listBtn = document.createElement('button');
    listBtn.className = `tab-btn ${this.viewMode === 'list' ? 'active' : ''}`;
    listBtn.textContent = '📋 订单管理';
    listBtn.onclick = () => {
      this.viewMode = 'list';
      this.render();
    };

    const shippingBtn = document.createElement('button');
    shippingBtn.className = `tab-btn ${this.viewMode === 'shipping' ? 'active' : ''}`;
    shippingBtn.textContent = '🚚 出货核对模式';
    shippingBtn.onclick = () => {
      this.viewMode = 'shipping';
      this.render();
    };

    const batchesBtn = document.createElement('button');
    batchesBtn.className = `tab-btn ${(this.viewMode === 'batches' || this.viewMode === 'batch-detail') ? 'active' : ''}`;
    batchesBtn.textContent = '📦 出货批次管理';
    batchesBtn.onclick = () => {
      this.viewMode = 'batches';
      this.currentBatchId = null;
      this.render();
    };

    tabs.append(listBtn, shippingBtn, batchesBtn);
    return tabs;
  }

  private renderStats(): HTMLElement {
    const allOrders = orderStore.getAll();
    const pendingExceptions = allOrders.filter((o) => {
      const a = orderStore.getActiveException(o.id);
      return a && a.status === 'pending';
    }).length;
    const processingExceptions = allOrders.filter((o) => {
      const a = orderStore.getActiveException(o.id);
      return a && a.status === 'processing';
    }).length;

    const stats = [
      { label: '总订单数', value: allOrders.length, color: '#3b82f6', icon: '📦' },
      {
        label: '待装盒',
        value: allOrders.filter((o) => o.status === 'pending_pack').length,
        color: '#f59e0b',
        icon: '📦'
      },
      {
        label: '待复核',
        value: allOrders.filter((o) => o.status === 'pending_review').length,
        color: '#3b82f6',
        icon: '🔍'
      },
      {
        label: '可出货',
        value: allOrders.filter((o) => o.status === 'ready_ship').length,
        color: '#10b981',
        icon: '✅'
      },
      {
        label: '异常待处理',
        value: pendingExceptions,
        color: '#ef4444',
        icon: '🚨'
      },
      {
        label: '异常处理中',
        value: processingExceptions,
        color: '#f97316',
        icon: '⏳'
      }
    ];

    const row = document.createElement('div');
    row.className = 'stats-row';

    stats.forEach((stat) => {
      const card = document.createElement('div');
      card.className = 'stat-card';

      const icon = document.createElement('div');
      icon.className = 'stat-icon';
      icon.style.background = `${stat.color}20`;
      icon.style.color = stat.color;
      icon.textContent = stat.icon;

      const info = document.createElement('div');
      info.className = 'stat-info';
      const h3 = document.createElement('h3');
      h3.style.color = stat.color;
      h3.textContent = String(stat.value);
      const p = document.createElement('p');
      p.textContent = stat.label;
      info.append(h3, p);

      card.append(icon, info);
      row.appendChild(card);
    });

    return row;
  }

  private renderFilterBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'filter-bar';

    const row = document.createElement('div');
    row.className = 'filter-row';

    const dateFilter = document.createElement('div');
    dateFilter.className = 'filter-item';
    const dateLabel = document.createElement('label');
    dateLabel.textContent = '取货日期';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = this.filters.pickupDate;
    dateInput.addEventListener('change', (e) => {
      this.filters.pickupDate = (e.target as HTMLInputElement).value;
      this.render();
    });
    dateFilter.append(dateLabel, dateInput);

    const typeFilter = document.createElement('div');
    typeFilter.className = 'filter-item';
    const typeLabel = document.createElement('label');
    typeLabel.textContent = '产品类型';
    const typeSelect = document.createElement('select');
    const typeOptions: [ProductType | 'all', string][] = [
      ['all', '全部'],
      ['cake', '蛋糕'],
      ['cookie', '饼干'],
      ['giftbox', '礼盒']
    ];
    typeOptions.forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (this.filters.productType === val) opt.selected = true;
      typeSelect.appendChild(opt);
    });
    typeSelect.addEventListener('change', (e) => {
      this.filters.productType = (e.target as HTMLSelectElement).value as ProductType | 'all';
      this.render();
    });
    typeFilter.append(typeLabel, typeSelect);

    const checkers = orderStore.getCheckers();
    const checkerFilter = document.createElement('div');
    checkerFilter.className = 'filter-item';
    const checkerLabel = document.createElement('label');
    checkerLabel.textContent = '核对人';
    const checkerSelect = document.createElement('select');
    const optAll = document.createElement('option');
    optAll.value = '';
    optAll.textContent = '全部';
    checkerSelect.appendChild(optAll);
    checkers.forEach((c) => {
      const opt = document.createElement('option');
      opt.value = c;
      opt.textContent = c;
      if (this.filters.checker === c) opt.selected = true;
      checkerSelect.appendChild(opt);
    });
    checkerSelect.addEventListener('change', (e) => {
      this.filters.checker = (e.target as HTMLSelectElement).value;
      this.render();
    });
    checkerFilter.append(checkerLabel, checkerSelect);

    const statusFilter = document.createElement('div');
    statusFilter.className = 'filter-item';
    const statusLabel = document.createElement('label');
    statusLabel.textContent = '状态';
    const statusSelect = document.createElement('select');
    const statusOptions: [OrderStatus | 'all', string][] = [
      ['all', '全部'],
      ['pending_pack', '待装盒'],
      ['pending_review', '待复核'],
      ['ready_ship', '可出货'],
      ['on_hold', '异常暂缓']
    ];
    statusOptions.forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (this.filters.status === val) opt.selected = true;
      statusSelect.appendChild(opt);
    });
    statusSelect.addEventListener('change', (e) => {
      this.filters.status = (e.target as HTMLSelectElement).value as OrderStatus | 'all';
      this.render();
    });
    statusFilter.append(statusLabel, statusSelect);

    const refFilter = document.createElement('div');
    refFilter.className = 'filter-item';
    const refLabel = document.createElement('label');
    refLabel.textContent = '冷藏要求';
    const refSelect = document.createElement('select');
    const refOptions: [RefrigerationType | 'all', string][] = [
      ['all', '全部'],
      ['none', '常温'],
      ['chilled', '冷藏'],
      ['frozen', '冷冻']
    ];
    refOptions.forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (this.filters.refrigeration === val) opt.selected = true;
      refSelect.appendChild(opt);
    });
    refSelect.addEventListener('change', (e) => {
      this.filters.refrigeration = (e.target as HTMLSelectElement).value as RefrigerationType | 'all';
      this.render();
    });
    refFilter.append(refLabel, refSelect);

    const excFilter = document.createElement('div');
    excFilter.className = 'filter-item';
    const excLabel = document.createElement('label');
    excLabel.textContent = '异常处理';
    const excSelect = document.createElement('select');
    const excOptions: [ExceptionStatus | 'all' | 'none', string][] = [
      ['all', '全部'],
      ['none', '无异常'],
      ['pending', '待处理'],
      ['processing', '处理中'],
      ['resolved', '已解决']
    ];
    excOptions.forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (this.filters.exceptionStatus === val) opt.selected = true;
      excSelect.appendChild(opt);
    });
    excSelect.addEventListener('change', (e) => {
      this.filters.exceptionStatus = (e.target as HTMLSelectElement).value as ExceptionStatus | 'all';
      this.render();
    });
    excFilter.append(excLabel, excSelect);

    const clearBtn = this.createButton('清除筛选', 'btn-sm', () => {
      this.filters = {
        pickupDate: '',
        productType: 'all',
        checker: '',
        status: 'all',
        refrigeration: 'all',
        exceptionStatus: 'all'
      };
      this.render();
    });

    row.append(dateFilter, typeFilter, checkerFilter, statusFilter, refFilter, excFilter, clearBtn);
    bar.appendChild(row);

    return bar;
  }

  private renderBatchBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'batch-bar';

    const visibleCount = this.visibleSelectedIds.length;
    const totalCount = this.selectedIds.size;
    const info = document.createElement('span');
    if (totalCount > 0) {
      info.textContent = visibleCount === totalCount
        ? `已选择 ${visibleCount} 个订单`
        : `已选择 ${visibleCount} 个（另有 ${totalCount - visibleCount} 个被筛选隐藏）`;
    } else {
      info.textContent = '点击表格复选框可批量操作';
    }

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '6px';
    actions.style.flexWrap = 'wrap';

    const statusActions: [OrderStatus, string, string][] = [
      ['pending_pack', '待装盒', 'btn-warning'],
      ['pending_review', '待复核', 'btn-info'],
      ['ready_ship', '可出货', 'btn-success'],
      ['on_hold', '异常暂缓', 'btn-danger']
    ];

    statusActions.forEach(([status, label, cls]) => {
      const btn = this.createButton(`标记${label}`, `${cls} btn-sm`, () => {
        const ids = this.visibleSelectedIds;
        if (ids.length === 0) {
          alert('请先选择当前可见的订单');
          return;
        }
        if (status === 'on_hold') {
          if (ids.length === 1) {
            this.openExceptionDialog(ids[0]);
          } else {
            const reason = prompt('请输入异常原因：');
            if (reason !== null && reason.trim()) {
              const responsible = prompt('请输入责任人：', '') || '';
              ids.forEach((id) => {
                orderStore.addException(id, {
                  category: 'other',
                  reason: reason.trim(),
                  responsible
                });
                this.shippingChecked.delete(id);
              });
            }
          }
        } else {
          const checker = prompt('请输入核对人姓名（可选）：') || undefined;
          const validIds = ids.filter((id) => !orderStore.getActiveException(id));
          const skippedCount = ids.length - validIds.length;
          if (validIds.length === 0) {
            alert(`所选订单均存在活跃异常，需先解决并恢复流转后才能修改状态`);
            return;
          }
          if (skippedCount > 0) {
            console.warn(`已跳过 ${skippedCount} 个有活跃异常的订单`);
          }
          orderStore.updateStatus(validIds, status, checker);
        }
        this.selectedIds.clear();
      });
      actions.appendChild(btn);
    });

    bar.append(info, actions);
    return bar;
  }

  private renderOrderTable(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'order-table-container';

    const table = document.createElement('table');
    table.className = 'order-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
      <th class="checkbox-cell"></th>
      <th>订单号</th>
      <th>取货日期</th>
      <th>客户</th>
      <th>产品清单</th>
      <th>装盒数量</th>
      <th>过敏提醒</th>
      <th>冷藏要求</th>
      <th>核对人</th>
      <th>状态</th>
      <th>异常处理</th>
      <th>操作</th>
    `;
    const selectAllCell = headerRow.querySelector('.checkbox-cell')!;
    const selectAllCheckbox = document.createElement('input');
    selectAllCheckbox.type = 'checkbox';
    selectAllCheckbox.checked = this.isAllSelected();
    selectAllCheckbox.addEventListener('change', () => {
      if (selectAllCheckbox.checked) {
        this.filteredOrders.forEach((o) => this.selectedIds.add(o.id));
      } else {
        this.filteredOrders.forEach((o) => this.selectedIds.delete(o.id));
      }
      this.render();
    });
    selectAllCell.appendChild(selectAllCheckbox);

    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    if (this.filteredOrders.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 12;
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      const icon = document.createElement('div');
      icon.style.fontSize = '48px';
      icon.textContent = '📭';
      const msg = document.createElement('p');
      msg.textContent = '暂无符合条件的订单';
      empty.append(icon, msg);
      td.appendChild(empty);
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      this.filteredOrders.forEach((order) => {
        tbody.appendChild(this.renderOrderRow(order));
      });
    }

    table.appendChild(tbody);
    container.appendChild(table);

    return container;
  }

  private renderOrderRow(order: Order): HTMLTableRowElement {
    const tr = document.createElement('tr');
    if (this.selectedIds.has(order.id)) {
      tr.classList.add('selected');
    }

    const orderWarnings = getWarningsByOrderId(this.warnings, order.id);
    const hasError = orderWarnings.some((w) => w.severity === 'error');
    const activeException = orderStore.getActiveException(order.id);
    const hasHistory = (order.exceptionRecords?.length || 0) > 0;

    const checkboxCell = document.createElement('td');
    checkboxCell.className = 'checkbox-cell';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'row-checkbox';
    checkbox.checked = this.selectedIds.has(order.id);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        this.selectedIds.add(order.id);
      } else {
        this.selectedIds.delete(order.id);
      }
      this.render();
    });
    checkboxCell.appendChild(checkbox);

    const idCell = document.createElement('td');
    const idStrong = document.createElement('strong');
    idStrong.textContent = order.id;
    idCell.appendChild(idStrong);

    const dateCell = document.createElement('td');
    dateCell.textContent = order.pickupDate;

    const customerCell = document.createElement('td');
    customerCell.textContent = order.customerName;

    const productCell = document.createElement('td');
    const productList = document.createElement('div');
    productList.className = 'product-list';

    order.products.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'product-item';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name;
      const qtySpan = document.createElement('span');
      const typeTag = document.createElement('span');
      typeTag.className = 'product-type-tag';
      typeTag.textContent = PRODUCT_TYPE_LABELS[p.type];
      const times = document.createElement('span');
      times.textContent = `×${p.quantity}`;
      qtySpan.append(typeTag, ' ', times);
      item.append(nameSpan, qtySpan);
      productList.appendChild(item);
    });

    if (orderWarnings.length > 0) {
      const warningList = document.createElement('div');
      warningList.className = 'warning-list';
      orderWarnings.forEach((w) => {
        const warnItem = document.createElement('div');
        warnItem.className = `warning-item ${w.severity}`;
        const icon = document.createElement('span');
        icon.textContent = w.severity === 'error' ? '❌' : '⚠️';
        const msg = document.createElement('span');
        msg.textContent = w.message;
        warnItem.append(icon, msg);
        warningList.appendChild(warnItem);
      });
      productList.appendChild(warningList);
    }
    productCell.appendChild(productList);

    const boxQtyCell = document.createElement('td');
    const boxQtyStrong = document.createElement('strong');
    boxQtyStrong.style.color = hasError ? '#ef4444' : '#374151';
    boxQtyStrong.textContent = String(order.boxQuantity);
    boxQtyCell.appendChild(boxQtyStrong);

    const allergyCell = document.createElement('td');
    if (order.allergyWarning) {
      const allergyTag = document.createElement('span');
      allergyTag.className = 'allergy-tag';
      allergyTag.textContent = order.allergyWarning;
      allergyCell.appendChild(allergyTag);
    } else {
      const empty = document.createElement('span');
      empty.className = 'allergy-empty';
      empty.textContent = '无';
      allergyCell.appendChild(empty);
    }

    const refCell = document.createElement('td');
    const refTag = document.createElement('span');
    refTag.className = `refrigeration-tag refrigeration-${order.refrigeration}`;
    refTag.textContent = REFRIGERATION_LABELS[order.refrigeration];
    refCell.appendChild(refTag);

    const checkerCell = document.createElement('td');
    if (order.checker) {
      checkerCell.textContent = order.checker;
    } else {
      const empty = document.createElement('span');
      empty.className = 'allergy-empty';
      empty.textContent = '未分配';
      checkerCell.appendChild(empty);
    }

    const statusCell = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `status-badge status-${order.status}`;
    statusBadge.textContent = STATUS_LABELS[order.status];
    statusCell.appendChild(statusBadge);

    const excCell = document.createElement('td');
    excCell.className = 'exception-cell';
    if (activeException) {
      const excBadge = document.createElement('span');
      excBadge.className = `exception-badge exception-${activeException.status}`;
      excBadge.textContent = EXCEPTION_STATUS_LABELS[activeException.status];
      excBadge.title = `原因：${activeException.reason}\n责任人：${activeException.responsible || '未指派'}\n登记时间：${this.formatDateTime(activeException.createdAt)}`;
      excCell.appendChild(excBadge);
      const createdTime = new Date(activeException.createdAt).getTime();
      const updatedTime = new Date(activeException.updatedAt).getTime();
      if (activeException.status !== 'pending' && updatedTime > createdTime) {
        const processTime = document.createElement('div');
        processTime.className = 'exception-list-time';
        processTime.textContent = `处理：${this.formatDateTime(activeException.updatedAt)}`;
        excCell.appendChild(processTime);
      }
    } else if (hasHistory) {
      const resolvedBadge = document.createElement('span');
      resolvedBadge.className = 'exception-badge exception-resolved-history';
      resolvedBadge.textContent = '已解决';
      resolvedBadge.title = `历史异常 ${order.exceptionRecords!.filter((r) => r.status === 'resolved').length} 条`;
      excCell.appendChild(resolvedBadge);
    } else {
      const empty = document.createElement('span');
      empty.className = 'allergy-empty';
      empty.textContent = '无';
      excCell.appendChild(empty);
    }

    const actionCell = document.createElement('td');
    const actionDiv = document.createElement('div');
    actionDiv.className = 'action-buttons';

    if (!activeException) {
      const holdBtn = this.createButton('标记异常', 'btn-sm btn-danger', () => {
        this.openExceptionDialog(order.id);
      });
      actionDiv.appendChild(holdBtn);
    } else {
      const handleBtn = this.createButton('处理异常', 'btn-sm btn-warning', () => {
        this.openExceptionDialog(order.id, activeException.id);
      });
      actionDiv.appendChild(handleBtn);
    }

    const historyBtn = this.createButton(hasHistory ? '异常记录' : '记录', 'btn-sm', () => {
      this.openExceptionHistory(order.id);
    });
    if (!hasHistory) {
      historyBtn.style.opacity = '0.6';
    }
    actionDiv.appendChild(historyBtn);

    const editBtn = this.createButton('编辑', 'btn-sm', () => this.openOrderModal(order));
    const deleteBtn = this.createButton('删除', 'btn-sm', () => {
      if (confirm(`确定删除订单 ${order.id} 吗？`)) {
        orderStore.delete(order.id);
        this.selectedIds.delete(order.id);
      }
    });
    deleteBtn.style.color = '#ef4444';

    actionDiv.append(editBtn, deleteBtn);
    actionCell.appendChild(actionDiv);

    tr.append(
      checkboxCell, idCell, dateCell, customerCell, productCell,
      boxQtyCell, allergyCell, refCell, checkerCell, statusCell, excCell, actionCell
    );

    return tr;
  }

  private formatDateTime(iso: string): string {
    try {
      const d = new Date(iso);
      const pad = (n: number) => String(n).padStart(2, '0');
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    } catch {
      return iso;
    }
  }

  private isAllSelected(): boolean {
    if (this.filteredOrders.length === 0) return false;
    return this.filteredOrders.every((o) => this.selectedIds.has(o.id));
  }

  private renderShippingMode(): HTMLElement {
    const allOrders = orderStore.getAll();
    const pendingReview = allOrders.filter((o) => o.status === 'pending_review');
    const onHold = allOrders.filter((o) => o.status === 'on_hold');

    const container = document.createElement('div');
    container.className = 'shipping-mode';

    const title = document.createElement('h2');
    title.textContent = '🚚 出货核对清单';
    container.appendChild(title);

    const desc = document.createElement('p');
    desc.style.color = '#6b7280';
    desc.style.marginBottom = '20px';
    desc.textContent = '按步骤完成复核，确认无误后点击复选框标记完成。';
    container.appendChild(desc);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';
    actions.style.marginBottom = '20px';

    const printShipBtn = this.createButton('🖨️ 打印清单', '', () => {
      const orders = [...pendingReview, ...onHold];
      printOrders(orders, '出货核对清单');
    });

    const exportShipBtn = this.createButton('📊 导出CSV', '', () => {
      const orders = [...pendingReview, ...onHold];
      exportToCSV(orders);
    });

    const clearCheckedBtn = this.createButton('🔄 重置勾选', 'btn-sm', () => {
      this.shippingChecked.clear();
      this.render();
    });

    actions.append(printShipBtn, exportShipBtn, clearCheckedBtn);
    container.appendChild(actions);

    if (onHold.length > 0) {
      container.appendChild(this.renderShippingSection('⚠️ 异常暂缓订单', 'on-hold', onHold));
    }

    container.appendChild(this.renderShippingSection('🔍 待复核订单', 'pending-review', pendingReview));

    const summary = document.createElement('div');
    summary.style.marginTop = '24px';
    summary.style.padding = '16px';
    summary.style.background = '#f0fdf4';
    summary.style.borderRadius = '8px';
    summary.style.border = '1px solid #86efac';

    const total = pendingReview.length + onHold.length;
    const checked = this.shippingChecked.size;
    const progress = total > 0 ? Math.round((checked / total) * 100) : 0;

    const summaryTop = document.createElement('div');
    summaryTop.style.display = 'flex';
    summaryTop.style.justifyContent = 'space-between';
    summaryTop.style.alignItems = 'center';
    summaryTop.style.marginBottom = '8px';
    const strong = document.createElement('strong');
    strong.style.color = '#166534';
    strong.textContent = '核对进度';
    const span = document.createElement('span');
    span.style.fontSize = '14px';
    span.style.color = '#166534';
    span.textContent = `${checked} / ${total} (${progress}%)`;
    summaryTop.append(strong, span);

    const barBg = document.createElement('div');
    barBg.style.height = '8px';
    barBg.style.background = '#dcfce7';
    barBg.style.borderRadius = '4px';
    barBg.style.overflow = 'hidden';
    const barFill = document.createElement('div');
    barFill.style.height = '100%';
    barFill.style.width = `${progress}%`;
    barFill.style.background = '#22c55e';
    barFill.style.borderRadius = '4px';
    barFill.style.transition = 'width 0.3s';
    barBg.appendChild(barFill);

    summary.append(summaryTop, barBg);
    container.appendChild(summary);

    return container;
  }

  private renderShippingSection(title: string, className: string, orders: Order[]): HTMLElement {
    const section = document.createElement('div');
    section.className = `shipping-section ${className}`;

    const h3 = document.createElement('h3');
    const titleSpan = document.createElement('span');
    titleSpan.textContent = title;
    const countSpan = document.createElement('span');
    countSpan.style.fontSize = '13px';
    countSpan.style.fontWeight = 'normal';
    countSpan.textContent = `(${orders.length} 单)`;
    h3.append(titleSpan, countSpan);
    section.appendChild(h3);

    if (orders.length === 0) {
      const empty = document.createElement('div');
      empty.style.padding = '20px';
      empty.style.textAlign = 'center';
      empty.style.color = '#9ca3af';
      empty.textContent = '暂无此类订单 🎉';
      section.appendChild(empty);
      return section;
    }

    const list = document.createElement('ol');
    list.className = 'shipping-list';
    list.style.listStyle = 'none';
    list.style.counterReset = 'step';

    orders.forEach((order, index) => {
      const item = document.createElement('li');
      item.className = 'shipping-item';
      const isChecked = this.shippingChecked.has(order.id);
      if (isChecked) {
        item.classList.add('completed');
      }

      const orderWarnings = getWarningsByOrderId(this.warnings, order.id);
      const activeException = orderStore.getActiveException(order.id);

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'shipping-checkbox';
      checkbox.checked = isChecked;
      if (activeException) {
        checkbox.disabled = true;
        checkbox.title = '异常订单需先解决并恢复流转后方可勾选出货';
      }
      checkbox.addEventListener('change', () => {
        if (activeException) return;
        if (checkbox.checked) {
          this.shippingChecked.add(order.id);
        } else {
          this.shippingChecked.delete(order.id);
        }
        this.render();
      });

      const content = document.createElement('div');
      content.className = 'shipping-content';

      const stepNum = document.createElement('span');
      stepNum.className = 'step-number';
      stepNum.textContent = String(index + 1);

      const orderId = document.createElement('strong');
      orderId.textContent = order.id;

      const dash = document.createTextNode(' - ');

      const custName = document.createTextNode(order.customerName);

      const statusBadge = document.createElement('span');
      statusBadge.style.marginLeft = '8px';
      statusBadge.className = `status-badge status-${order.status}`;
      statusBadge.textContent = STATUS_LABELS[order.status];

      const headerLine = document.createElement('div');
      headerLine.append(stepNum, orderId, dash, custName, statusBadge);

      if (activeException) {
        const excBanner = document.createElement('div');
        excBanner.className = `exception-banner exception-banner-${activeException.status}`;
        const excBadge = document.createElement('span');
        excBadge.className = `exception-badge exception-${activeException.status}`;
        excBadge.textContent = EXCEPTION_STATUS_LABELS[activeException.status];
        const excCat = document.createElement('span');
        excCat.className = 'exception-cat';
        excCat.textContent = EXCEPTION_CATEGORY_LABELS[activeException.category];
        const excReason = document.createElement('div');
        excReason.className = 'exception-reason';
        excReason.textContent = `原因：${activeException.reason}`;
        const excMeta = document.createElement('div');
        excMeta.className = 'exception-meta';
        excMeta.textContent = `责任人：${activeException.responsible || '未指派'} · 登记：${this.formatDateTime(activeException.createdAt)}`;
        excBanner.append(excBadge, ' ', excCat, excReason, excMeta);
        const createdTime = new Date(activeException.createdAt).getTime();
        const updatedTime = new Date(activeException.updatedAt).getTime();
        if (activeException.status !== 'pending' && updatedTime > createdTime) {
          const excProcessTime = document.createElement('div');
          excProcessTime.className = 'exception-meta';
          excProcessTime.style.color = '#b45309';
          excProcessTime.textContent = `⏱ 处理时间：${this.formatDateTime(activeException.updatedAt)}`;
          excBanner.appendChild(excProcessTime);
        }
        if (activeException.handlerRemark) {
          const excRemark = document.createElement('div');
          excRemark.className = 'exception-remark';
          excRemark.textContent = `处理进展：${activeException.handlerRemark}`;
          excBanner.appendChild(excRemark);
        }
        headerLine.appendChild(excBanner);
      }

      const metaP = document.createElement('p');
      metaP.innerHTML =
        `📅 取货：${escapeHtml(order.pickupDate)}` +
        `&nbsp;|&nbsp;` +
        `📦 ${order.boxQuantity} 盒` +
        `&nbsp;|&nbsp;` +
        `👤 ${escapeHtml(order.checker || '未分配')}`;

      const productsP = document.createElement('p');
      productsP.style.color = '#4b5563';
      productsP.textContent = `🧁 ${order.products.map((p) => `${p.name}×${p.quantity}`).join('，')}`;

      content.append(headerLine, metaP, productsP);

      if (order.allergyWarning) {
        const allergyP = document.createElement('p');
        allergyP.style.color = '#dc2626';
        allergyP.textContent = `⚠️ 过敏提醒：${order.allergyWarning}`;
        content.appendChild(allergyP);
      }

      const refP = document.createElement('p');
      const refTag = document.createElement('span');
      refTag.className = `refrigeration-tag refrigeration-${order.refrigeration}`;
      refTag.textContent = REFRIGERATION_LABELS[order.refrigeration];
      refP.appendChild(refTag);
      content.appendChild(refP);

      if (orderWarnings.length > 0) {
        const warnDiv = document.createElement('div');
        warnDiv.style.marginTop = '8px';
        warnDiv.style.padding = '8px';
        warnDiv.style.background = '#fef2f2';
        warnDiv.style.borderRadius = '4px';
        warnDiv.style.fontSize = '12px';
        warnDiv.style.color = '#dc2626';
        orderWarnings.forEach((w) => {
          const d = document.createElement('div');
          d.textContent = `${w.severity === 'error' ? '❌' : '⚠️'} ${w.message}`;
          warnDiv.appendChild(d);
        });
        content.appendChild(warnDiv);
      }

      const actionDiv = document.createElement('div');
      actionDiv.style.marginTop = '8px';
      actionDiv.style.display = 'flex';
      actionDiv.style.gap = '6px';
      actionDiv.style.flexWrap = 'wrap';

      if (!activeException) {
        const shipBtn = this.createButton('✓ 标记可出货', 'btn-sm btn-success', () => {
          const checker = prompt('请输入核对人姓名：', order.checker) || order.checker;
          orderStore.updateStatus([order.id], 'ready_ship', checker);
        });
        const holdBtn = this.createButton('⏸ 异常暂缓', 'btn-sm btn-danger', () => {
          this.openExceptionDialog(order.id);
        });
        actionDiv.append(shipBtn, holdBtn);
      } else {
        const handleBtn = this.createButton('📝 处理异常', 'btn-sm btn-warning', () => {
          this.openExceptionDialog(order.id, activeException.id);
        });
        const historyBtn = this.createButton('📋 异常记录', 'btn-sm', () => {
          this.openExceptionHistory(order.id);
        });
        if (activeException.status !== 'resolved') {
          const resolveBtn = this.createButton('✅ 解决并恢复流转', 'btn-sm btn-success', () => {
            const remark = prompt('请输入解决备注（说明处理结果）：') || '';
            orderStore.resolveExceptionAndRestore(order.id, activeException.id, remark);
          });
          actionDiv.appendChild(resolveBtn);
        }
        actionDiv.append(handleBtn, historyBtn);
      }

      const editBtn = this.createButton('编辑', 'btn-sm', () => {
        this.openOrderModal(order);
      });
      actionDiv.appendChild(editBtn);
      content.appendChild(actionDiv);

      item.append(checkbox, content);
      list.appendChild(item);
    });

    section.appendChild(list);
    return section;
  }

  private openOrderModal(order?: Order): void {
    this.editingOrder = order || null;
    this.renderOrderModal();
  }

  private renderOrderModal(): void {
    const existing = document.querySelector('.modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal';

    const isEdit = !!this.editingOrder;

    const header = document.createElement('div');
    header.className = 'modal-header';
    const h2 = document.createElement('h2');
    h2.textContent = isEdit ? '编辑订单' : '新增订单';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => {
      this.editingOrder = null;
      overlay.remove();
    };
    header.append(h2, closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const form = document.createElement('form');
    form.id = 'order-form';

    const grid1 = document.createElement('div');
    grid1.style.display = 'grid';
    grid1.style.gridTemplateColumns = '1fr 1fr';
    grid1.style.gap = '12px';

    const fgDate = this.createFormGroup(
      '取货日期 *',
      (() => {
        const inp = document.createElement('input');
        inp.type = 'date';
        inp.name = 'pickupDate';
        inp.required = true;
        inp.value = this.editingOrder?.pickupDate || new Date().toISOString().slice(0, 10);
        return inp;
      })()
    );
    const fgCust = this.createFormGroup(
      '客户简称 *',
      (() => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.name = 'customerName';
        inp.required = true;
        inp.value = this.editingOrder?.customerName || '';
        inp.placeholder = '如：张先生';
        inp.maxLength = 50;
        return inp;
      })()
    );
    grid1.append(fgDate, fgCust);

    const fgProducts = document.createElement('div');
    fgProducts.className = 'form-group';
    const prodLabel = document.createElement('label');
    prodLabel.textContent = '产品清单 *';
    const prodContainer = document.createElement('div');
    prodContainer.id = 'product-list-container';
    const addProdBtn = this.createButton('+ 添加产品', 'btn-sm', () => {
      prodContainer.appendChild(
        this.createProductRow({ name: '', type: 'cake', quantity: 1 })
      );
    });
    addProdBtn.style.marginTop = '8px';
    fgProducts.append(prodLabel, prodContainer, addProdBtn);

    const grid2 = document.createElement('div');
    grid2.style.display = 'grid';
    grid2.style.gridTemplateColumns = '1fr 1fr';
    grid2.style.gap = '12px';

    const fgBoxQty = this.createFormGroup(
      '装盒数量 *',
      (() => {
        const inp = document.createElement('input');
        inp.type = 'number';
        inp.name = 'boxQuantity';
        inp.min = '1';
        inp.required = true;
        inp.value = String(this.editingOrder?.boxQuantity || 1);
        return inp;
      })()
    );

    const fgRef = this.createFormGroup(
      '冷藏要求',
      (() => {
        const sel = document.createElement('select');
        sel.name = 'refrigeration';
        const opts: [RefrigerationType, string][] = [
          ['none', '常温'],
          ['chilled', '冷藏'],
          ['frozen', '冷冻']
        ];
        opts.forEach(([val, label]) => {
          const o = document.createElement('option');
          o.value = val;
          o.textContent = label;
          const curRef = this.editingOrder?.refrigeration;
          if ((!curRef && val === 'none') || curRef === val) o.selected = true;
          sel.appendChild(o);
        });
        return sel;
      })()
    );
    grid2.append(fgBoxQty, fgRef);

    const fgAllergy = this.createFormGroup(
      '过敏提醒',
      (() => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.name = 'allergyWarning';
        inp.value = this.editingOrder?.allergyWarning || '';
        inp.placeholder = '如：坚果过敏、乳糖不耐受';
        inp.maxLength = 100;
        return inp;
      })()
    );

    const grid3 = document.createElement('div');
    grid3.style.display = 'grid';
    grid3.style.gridTemplateColumns = '1fr 1fr';
    grid3.style.gap = '12px';

    const fgChecker = this.createFormGroup(
      '核对人',
      (() => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.name = 'checker';
        inp.value = this.editingOrder?.checker || '';
        inp.placeholder = '如：小李';
        inp.maxLength = 20;
        return inp;
      })()
    );

    const fgStatus = this.createFormGroup(
      '状态',
      (() => {
        const sel = document.createElement('select');
        sel.name = 'status';
        const statusOpts: [OrderStatus, string][] = [
          ['pending_pack', '待装盒'],
          ['pending_review', '待复核'],
          ['ready_ship', '可出货'],
          ['on_hold', '异常暂缓']
        ];
        statusOpts.forEach(([val, label]) => {
          const o = document.createElement('option');
          o.value = val;
          o.textContent = label;
          const curSt = this.editingOrder?.status;
          if ((!curSt && val === 'pending_pack') || curSt === val) o.selected = true;
          sel.appendChild(o);
        });
        if (isEdit && this.editingOrder) {
          const active = orderStore.getActiveException(this.editingOrder.id);
          if (active) {
            sel.disabled = true;
            sel.title = '存在活跃异常，需先解决并恢复流转后才能修改订单状态';
          }
        }
        return sel;
      })()
    );
    grid3.append(fgChecker, fgStatus);

    form.append(grid1, fgProducts, grid2, fgAllergy, grid3);
    body.appendChild(form);

    if (isEdit && this.editingOrder) {
      const records = this.editingOrder.exceptionRecords || [];
      if (records.length > 0) {
        const excSection = document.createElement('div');
        excSection.className = 'edit-exception-section';

        const excHeader = document.createElement('div');
        excHeader.className = 'edit-exception-header';
        const excTitle = document.createElement('h3');
        excTitle.textContent = '📋 异常处理记录';
        const excCount = document.createElement('span');
        excCount.style.fontSize = '13px';
        excCount.style.color = '#6b7280';
        excCount.style.marginLeft = '8px';
        const resolvedCount = records.filter((r) => r.status === 'resolved').length;
        const activeCount = records.length - resolvedCount;
        excCount.textContent = `共 ${records.length} 条（${activeCount} 条活跃，${resolvedCount} 条已解决）`;
        excHeader.append(excTitle, excCount);
        excSection.appendChild(excHeader);

        const excList = document.createElement('div');
        excList.className = 'edit-exception-list';

        const sortedRecords = [...records].sort((a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );

        sortedRecords.forEach((r) => {
          const item = document.createElement('div');
          item.className = `edit-exception-item edit-exception-${r.status}`;

          const itemHeader = document.createElement('div');
          itemHeader.className = 'edit-exception-item-header';
          const badge = document.createElement('span');
          badge.className = `exception-badge exception-${r.status}`;
          badge.textContent = EXCEPTION_STATUS_LABELS[r.status];
          const cat = document.createElement('span');
          cat.className = 'exception-cat-badge';
          cat.textContent = EXCEPTION_CATEGORY_LABELS[r.category];
          const time = document.createElement('span');
          time.className = 'timeline-time';
          time.textContent = this.formatDateTime(r.createdAt);
          itemHeader.append(badge, ' ', cat, time);

          const itemBody = document.createElement('div');
          itemBody.className = 'edit-exception-item-body';

          const reasonP = document.createElement('div');
          reasonP.innerHTML = `<span class="timeline-label">原因：</span>${escapeHtml(r.reason)}`;

          const metaP = document.createElement('div');
          metaP.className = 'timeline-meta';
          metaP.innerHTML = `
            <span>👤 责任人：${escapeHtml(r.responsible || '未指派')}</span>
            <span>↩️ 原状态：${STATUS_LABELS[r.previousStatus]}</span>
          `;

          itemBody.append(reasonP, metaP);

          const createdT = new Date(r.createdAt).getTime();
          const updatedT = new Date(r.updatedAt).getTime();
          if (r.status !== 'pending' && updatedT > createdT) {
            const processP = document.createElement('div');
            processP.className = 'timeline-meta';
            processP.style.color = '#b45309';
            processP.style.marginTop = '4px';
            processP.innerHTML = `<span>⏱ 处理时间：${this.formatDateTime(r.updatedAt)}</span>`;
            itemBody.appendChild(processP);
          }

          if (r.handlerRemark) {
            const remarkP = document.createElement('div');
            remarkP.className = 'timeline-block timeline-remark';
            remarkP.style.marginTop = '6px';
            remarkP.innerHTML = `<span class="timeline-label">处理进展：</span>${escapeHtml(r.handlerRemark)}`;
            itemBody.appendChild(remarkP);
          }
          if (r.resolvedAt) {
            const resolvedP = document.createElement('div');
            resolvedP.className = 'timeline-block timeline-resolved';
            resolvedP.style.marginTop = '6px';
            resolvedP.innerHTML = `<span class="timeline-label">解决时间：</span>${this.formatDateTime(r.resolvedAt)}`;
            itemBody.appendChild(resolvedP);
          }

          if (r.status !== 'resolved' && this.editingOrder) {
            const currentOrderId = this.editingOrder.id;
            const actions = document.createElement('div');
            actions.style.marginTop = '8px';
            actions.style.display = 'flex';
            actions.style.gap = '6px';

            const handleBtn = this.createButton('📝 处理', 'btn-sm btn-warning', () => {
              overlay.remove();
              this.editingOrder = null;
              this.openExceptionDialog(currentOrderId, r.id);
            });
            const resolveBtn = this.createButton('✅ 解决恢复', 'btn-sm btn-success', () => {
              const remark = prompt('请输入解决备注：') || '';
              orderStore.resolveExceptionAndRestore(currentOrderId, r.id, remark);
              overlay.remove();
              this.editingOrder = null;
            });
            actions.append(handleBtn, resolveBtn);
            itemBody.appendChild(actions);
          }

          item.append(itemHeader, itemBody);
          excList.appendChild(item);
        });

        excSection.appendChild(excList);
        body.appendChild(excSection);
      }
    }

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = this.createButton('取消', '', () => {
      this.editingOrder = null;
      overlay.remove();
    });

    const saveBtn = this.createButton('保存', 'btn-primary', () => {
      this.handleSaveOrder(overlay, form);
    });

    footer.append(cancelBtn, saveBtn);

    modal.append(header, body, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const productContainer = body.querySelector('#product-list-container')!;
    const initialProducts = this.editingOrder?.products || [
      { name: '', type: 'cake' as ProductType, quantity: 1 }
    ];

    initialProducts.forEach((p) => {
      productContainer.appendChild(this.createProductRow(p));
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.editingOrder = null;
        overlay.remove();
      }
    });
  }

  private createFormGroup(label: string, input: HTMLElement): HTMLElement {
    const fg = document.createElement('div');
    fg.className = 'form-group';
    const lab = document.createElement('label');
    lab.textContent = label;
    fg.append(lab, input);
    return fg;
  }

  private createProductRow(product?: ProductItem): HTMLElement {
    const row = document.createElement('div');
    row.className = 'product-form-row';

    const nameFg = document.createElement('div');
    nameFg.className = 'form-group';
    nameFg.style.marginBottom = '0';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.name = 'productName';
    nameInput.placeholder = '产品名称';
    nameInput.value = product?.name || '';
    nameInput.maxLength = 50;
    nameFg.appendChild(nameInput);

    const typeFg = document.createElement('div');
    typeFg.className = 'form-group';
    typeFg.style.marginBottom = '0';
    const typeSelect = document.createElement('select');
    typeSelect.name = 'productType';
    const typeOpts: [ProductType, string][] = [
      ['cake', '蛋糕'],
      ['cookie', '饼干'],
      ['giftbox', '礼盒']
    ];
    typeOpts.forEach(([val, label]) => {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = label;
      if (product?.type === val) o.selected = true;
      typeSelect.appendChild(o);
    });
    typeFg.appendChild(typeSelect);

    const qtyFg = document.createElement('div');
    qtyFg.className = 'form-group';
    qtyFg.style.marginBottom = '0';
    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.name = 'productQty';
    qtyInput.min = '1';
    qtyInput.value = String(product?.quantity || 1);
    qtyFg.appendChild(qtyInput);

    const removeBtn = this.createButton('删除', 'btn-sm', () => {
      const container = document.getElementById('product-list-container');
      if (container && container.children.length > 1) {
        row.remove();
      } else {
        alert('至少保留一个产品');
      }
    });
    removeBtn.style.marginBottom = '0';

    row.append(nameFg, typeFg, qtyFg, removeBtn);
    return row;
  }

  private handleSaveOrder(overlay: HTMLElement, form: HTMLFormElement): void {
    const formData = new FormData(form);

    const productRows = form.querySelectorAll('.product-form-row');
    const products: ProductItem[] = [];

    productRows.forEach((row) => {
      const nameInput = row.querySelector('[name="productName"]') as HTMLInputElement;
      const typeSelect = row.querySelector('[name="productType"]') as HTMLSelectElement;
      const qtyInput = row.querySelector('[name="productQty"]') as HTMLInputElement;

      const name = nameInput.value.trim().slice(0, 50);
      const type = typeSelect.value as ProductType;
      const quantity = Math.max(1, Math.min(999, parseInt(qtyInput.value, 10) || 1));

      if (name) {
        products.push({ name, type, quantity });
      }
    });

    if (products.length === 0) {
      alert('请至少添加一个产品');
      return;
    }

    const pickupDate = (formData.get('pickupDate') as string).trim();
    const customerName = (formData.get('customerName') as string).trim().slice(0, 50);
    const boxQuantity = Math.max(1, Math.min(999, parseInt(formData.get('boxQuantity') as string, 10) || 1));
    const allergyWarning = (formData.get('allergyWarning') as string).trim().slice(0, 100);
    const refrigeration = formData.get('refrigeration') as RefrigerationType;
    const checker = (formData.get('checker') as string).trim().slice(0, 20);
    const status = formData.get('status') as OrderStatus;

    if (!pickupDate || !customerName) {
      alert('请填写必填项');
      return;
    }

    const orderData = {
      pickupDate,
      customerName,
      products,
      boxQuantity,
      allergyWarning,
      refrigeration,
      checker,
      status
    };

    if (this.editingOrder) {
      const active = orderStore.getActiveException(this.editingOrder.id);
      if (active && status !== 'on_hold') {
        alert('存在活跃异常，需先解决并恢复流转后才能修改订单状态。本次保存已跳过状态修改。');
        delete (orderData as Partial<typeof orderData>).status;
      }
      orderStore.update(this.editingOrder.id, orderData);
    } else {
      orderStore.add(orderData);
    }

    this.editingOrder = null;
    overlay.remove();
  }

  private openExceptionDialog(orderId: string, exceptionId?: string): void {
    this.exceptionDialogContext = { orderId, exceptionId };
    this.renderExceptionDialog();
  }

  private renderExceptionDialog(): void {
    if (!this.exceptionDialogContext) return;

    const existing = document.querySelector('.exception-modal-overlay');
    if (existing) existing.remove();

    const { orderId, exceptionId } = this.exceptionDialogContext;
    const order = orderStore.getById(orderId);
    if (!order) return;

    const isEdit = !!exceptionId;
    const existingRecord = isEdit ? order.exceptionRecords?.find((r) => r.id === exceptionId) : null;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay exception-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal exception-modal';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const h2 = document.createElement('h2');
    h2.textContent = isEdit ? '处理异常' : '登记异常';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => {
      this.exceptionDialogContext = null;
      overlay.remove();
    };
    header.append(h2, closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const orderInfo = document.createElement('div');
    orderInfo.className = 'exception-order-info';
    orderInfo.innerHTML = `
      <strong>${escapeHtml(order.id)}</strong> - ${escapeHtml(order.customerName)}
      <span style="color:#6b7280;margin-left:8px">取货：${escapeHtml(order.pickupDate)}</span>
    `;
    body.appendChild(orderInfo);

    const form = document.createElement('form');
    form.id = 'exception-form';

    const categoryFg = this.createFormGroup(
      '异常类型 *',
      (() => {
        const sel = document.createElement('select');
        sel.name = 'category';
        sel.required = true;
        const opts: [ExceptionCategory, string][] = [
          ['product_issue', '产品问题'],
          ['quantity_issue', '数量不符'],
          ['allergy_issue', '过敏信息问题'],
          ['refrigeration_issue', '冷藏要求冲突'],
          ['customer_request', '客户临时要求'],
          ['other', '其他问题']
        ];
        opts.forEach(([val, label]) => {
          const o = document.createElement('option');
          o.value = val;
          o.textContent = label;
          if (existingRecord?.category === val) o.selected = true;
          sel.appendChild(o);
        });
        return sel;
      })()
    );

    const reasonFg = this.createFormGroup(
      '异常原因 *',
      (() => {
        const ta = document.createElement('textarea');
        ta.name = 'reason';
        ta.required = true;
        ta.rows = 3;
        ta.maxLength = 500;
        ta.placeholder = '请详细描述异常情况，便于后续处理和追溯';
        ta.value = existingRecord?.reason || '';
        return ta;
      })()
    );

    const grid = document.createElement('div');
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = '1fr 1fr';
    grid.style.gap = '12px';

    const responsibleFg = this.createFormGroup(
      '责任人 *',
      (() => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.name = 'responsible';
        inp.required = true;
        inp.maxLength = 20;
        inp.placeholder = '如：小张';
        inp.value = existingRecord?.responsible || '';
        return inp;
      })()
    );

    let statusFg: HTMLElement | null = null;
    if (isEdit) {
      statusFg = this.createFormGroup(
        '处理状态',
        (() => {
          const sel = document.createElement('select');
          sel.name = 'exceptionStatus';
          const opts: [ExceptionStatus, string][] = [
            ['pending', '待处理'],
            ['processing', '处理中'],
            ['resolved', '已解决']
          ];
          opts.forEach(([val, label]) => {
            const o = document.createElement('option');
            o.value = val;
            o.textContent = label;
            if (existingRecord?.status === val) o.selected = true;
            sel.appendChild(o);
          });
          return sel;
        })()
      );
      grid.append(responsibleFg, statusFg);
    } else {
      grid.append(responsibleFg);
    }

    const remarkFg = this.createFormGroup(
      isEdit ? '处理进展/备注' : '备注（可选）',
      (() => {
        const ta = document.createElement('textarea');
        ta.name = 'handlerRemark';
        ta.rows = 2;
        ta.maxLength = 500;
        ta.placeholder = isEdit ? '请记录当前处理进展或解决方案' : '补充说明';
        ta.value = existingRecord?.handlerRemark || '';
        return ta;
      })()
    );

    form.append(categoryFg, reasonFg, grid, remarkFg);
    body.appendChild(form);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = this.createButton('取消', '', () => {
      this.exceptionDialogContext = null;
      overlay.remove();
    });

    const saveBtn = this.createButton(
      isEdit ? '保存处理' : '确认登记',
      'btn-primary',
      () => {
        const formData = new FormData(form);
        const category = (formData.get('category') as ExceptionCategory) || 'other';
        const reason = (formData.get('reason') as string).trim();
        const responsible = (formData.get('responsible') as string).trim().slice(0, 20);
        const handlerRemark = (formData.get('handlerRemark') as string).trim().slice(0, 500);
        const newStatus = isEdit ? (formData.get('exceptionStatus') as ExceptionStatus) : null;

        if (!reason || !responsible) {
          alert('请填写必填项：异常原因、责任人');
          return;
        }

        if (isEdit && existingRecord) {
          const updates: Partial<Pick<ExceptionRecord, 'status' | 'handlerRemark' | 'responsible' | 'category' | 'reason'>> = {
            handlerRemark,
            responsible,
            category,
            reason
          };
          if (newStatus) updates.status = newStatus;

          if (newStatus === 'resolved') {
            orderStore.resolveExceptionAndRestore(orderId, existingRecord.id, handlerRemark || '已解决');
          } else {
            orderStore.updateException(orderId, existingRecord.id, updates);
          }
        } else {
          orderStore.addException(orderId, {
            category,
            reason,
            responsible,
            handlerRemark
          });
          this.shippingChecked.delete(orderId);
        }

        this.exceptionDialogContext = null;
        overlay.remove();
      }
    );

    footer.append(cancelBtn, saveBtn);

    modal.append(header, body, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.exceptionDialogContext = null;
        overlay.remove();
      }
    });
  }

  private openExceptionHistory(orderId: string): void {
    this.exceptionHistoryOrderId = orderId;
    this.renderExceptionHistoryDialog();
  }

  private renderExceptionHistoryDialog(): void {
    if (!this.exceptionHistoryOrderId) return;

    const existing = document.querySelector('.history-modal-overlay');
    if (existing) existing.remove();

    const orderId = this.exceptionHistoryOrderId;
    const order = orderStore.getById(orderId);
    if (!order) return;

    const records = order.exceptionRecords || [];

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay history-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal history-modal';
    modal.style.maxWidth = '640px';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const h2 = document.createElement('h2');
    h2.textContent = '异常处理记录';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => {
      this.exceptionHistoryOrderId = null;
      overlay.remove();
    };
    header.append(h2, closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const orderInfo = document.createElement('div');
    orderInfo.className = 'exception-order-info';
    orderInfo.innerHTML = `
      <strong>${escapeHtml(order.id)}</strong> - ${escapeHtml(order.customerName)}
      <span style="color:#6b7280;margin-left:8px">取货：${escapeHtml(order.pickupDate)}</span>
    `;
    body.appendChild(orderInfo);

    if (records.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.style.padding = '40px 20px';
      const icon = document.createElement('div');
      icon.style.fontSize = '40px';
      icon.textContent = '✅';
      const msg = document.createElement('p');
      msg.textContent = '该订单暂无异常记录';
      empty.append(icon, msg);
      body.appendChild(empty);
    } else {
      const timeline = document.createElement('div');
      timeline.className = 'exception-timeline';

      const sortedRecords = [...records].sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );

      sortedRecords.forEach((r) => {
        const item = document.createElement('div');
        item.className = `timeline-item timeline-${r.status}`;

        const dot = document.createElement('div');
        dot.className = 'timeline-dot';
        dot.style.background = EXCEPTION_STATUS_COLORS[r.status];

        const content = document.createElement('div');
        content.className = 'timeline-content';

        const topRow = document.createElement('div');
        topRow.style.display = 'flex';
        topRow.style.justifyContent = 'space-between';
        topRow.style.alignItems = 'center';
        topRow.style.marginBottom = '8px';
        topRow.style.flexWrap = 'wrap';
        topRow.style.gap = '6px';

        const leftGroup = document.createElement('div');
        leftGroup.style.display = 'flex';
        leftGroup.style.alignItems = 'center';
        leftGroup.style.gap = '6px';
        leftGroup.style.flexWrap = 'wrap';

        const statusBadge = document.createElement('span');
        statusBadge.className = `exception-badge exception-${r.status}`;
        statusBadge.textContent = EXCEPTION_STATUS_LABELS[r.status];

        const catBadge = document.createElement('span');
        catBadge.className = 'exception-cat-badge';
        catBadge.textContent = EXCEPTION_CATEGORY_LABELS[r.category];

        leftGroup.append(statusBadge, catBadge);

        const rightGroup = document.createElement('div');
        rightGroup.className = 'timeline-time';
        rightGroup.textContent = this.formatDateTime(r.createdAt);

        topRow.append(leftGroup, rightGroup);

        const reasonBlock = document.createElement('div');
        reasonBlock.className = 'timeline-block';
        reasonBlock.innerHTML = `<span class="timeline-label">异常原因：</span>${escapeHtml(r.reason)}`;

        const metaBlock = document.createElement('div');
        metaBlock.className = 'timeline-meta';
        metaBlock.innerHTML = `
          <span>👤 责任人：${escapeHtml(r.responsible || '未指派')}</span>
          <span>↩️ 原状态：${STATUS_LABELS[r.previousStatus]}</span>
        `;

        content.append(topRow, reasonBlock, metaBlock);

        const t_created = new Date(r.createdAt).getTime();
        const t_updated = new Date(r.updatedAt).getTime();
        if (r.status !== 'pending' && t_updated > t_created) {
          const processBlock = document.createElement('div');
          processBlock.className = 'timeline-meta';
          processBlock.style.color = '#b45309';
          processBlock.style.marginTop = '4px';
          processBlock.innerHTML = `<span>⏱ 处理时间：${this.formatDateTime(r.updatedAt)}</span>`;
          content.appendChild(processBlock);
        }

        if (r.handlerRemark) {
          const remarkBlock = document.createElement('div');
          remarkBlock.className = 'timeline-block timeline-remark';
          remarkBlock.innerHTML = `<span class="timeline-label">处理进展：</span>${escapeHtml(r.handlerRemark)}`;
          content.appendChild(remarkBlock);
        }

        if (r.resolvedAt) {
          const resolvedBlock = document.createElement('div');
          resolvedBlock.className = 'timeline-block timeline-resolved';
          resolvedBlock.innerHTML = `<span class="timeline-label">解决时间：</span>${this.formatDateTime(r.resolvedAt)}`;
          content.appendChild(resolvedBlock);
        }

        if (r.status !== 'resolved') {
          const actionRow = document.createElement('div');
          actionRow.style.marginTop = '10px';
          actionRow.style.display = 'flex';
          actionRow.style.gap = '6px';

          const handleBtn = this.createButton('📝 继续处理', 'btn-sm btn-warning', () => {
            overlay.remove();
            this.exceptionHistoryOrderId = null;
            this.openExceptionDialog(orderId, r.id);
          });

          const resolveBtn = this.createButton('✅ 解决并恢复', 'btn-sm btn-success', () => {
            const remark = prompt('请输入解决备注（说明处理结果）：') || '';
            orderStore.resolveExceptionAndRestore(orderId, r.id, remark);
            overlay.remove();
            this.exceptionHistoryOrderId = null;
          });

          actionRow.append(handleBtn, resolveBtn);
          content.appendChild(actionRow);
        }

        item.append(dot, content);
        timeline.appendChild(item);
      });

      body.appendChild(timeline);
    }

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const closeBtn2 = this.createButton('关闭', '', () => {
      this.exceptionHistoryOrderId = null;
      overlay.remove();
    });
    footer.appendChild(closeBtn2);

    modal.append(header, body, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.exceptionHistoryOrderId = null;
        overlay.remove();
      }
    });
  }

  private createButton(text: string, className: string, onClick: () => void): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = `btn ${className}`;
    btn.textContent = text;
    btn.addEventListener('click', onClick);
    return btn;
  }

  private get filteredBatches(): ShippingBatch[] {
    return batchStore.filter(this.batchFilters);
  }

  private renderBatchesView(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'batches-view';

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.justifyContent = 'space-between';
    titleRow.style.alignItems = 'center';
    titleRow.style.flexWrap = 'wrap';
    titleRow.style.gap = '12px';
    titleRow.style.marginBottom = '16px';

    const titleGroup = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.textContent = '📦 出货批次管理';
    const p = document.createElement('p');
    p.style.color = '#6b7280';
    p.style.fontSize = '13px';
    p.textContent = '按取货日期和冷藏要求生成出货批次，统一完成核对与交接';
    titleGroup.append(h2, p);

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';

    const eligibleCount = batchStore.getUnbatchedReadyOrders().length;
    const createBtn = this.createButton(eligibleCount > 0 ? `➕ 创建出货批次 (${eligibleCount}单可选)` : '➕ 创建出货批次', 'btn-primary', () => {
      this.openCreateBatchDialog();
    });

    actions.append(createBtn);
    titleRow.append(titleGroup, actions);
    container.appendChild(titleRow);

    container.appendChild(this.renderBatchStats());
    container.appendChild(this.renderBatchFilterBar());
    container.appendChild(this.renderBatchList());

    return container;
  }

  private renderBatchStats(): HTMLElement {
    const allBatches = batchStore.getAll();
    const allOrders = orderStore.getAll();
    const readyShipOrders = allOrders.filter((o) => o.status === 'ready_ship');

    const unbatchedReady = readyShipOrders.filter((o) => {
      const active = orderStore.getActiveException(o.id);
      if (active) return false;
      const inBatch = allBatches.some(
        (b) => b.status !== 'completed' && b.orderIds.includes(o.id)
      );
      return !inBatch;
    });

    const stats = [
      { label: '批次总数', value: allBatches.length, color: '#3b82f6', icon: '📦' },
      {
        label: '待出货批次',
        value: allBatches.filter((b) => b.status === 'created').length,
        color: '#f59e0b',
        icon: '⏳'
      },
      {
        label: '已出货批次',
        value: allBatches.filter((b) => b.status === 'completed').length,
        color: '#10b981',
        icon: '✅'
      },
      {
        label: '可出货未组批',
        value: unbatchedReady.length,
        color: '#8b5cf6',
        icon: '📋'
      }
    ];

    const row = document.createElement('div');
    row.className = 'stats-row';

    stats.forEach((stat) => {
      const card = document.createElement('div');
      card.className = 'stat-card';

      const icon = document.createElement('div');
      icon.className = 'stat-icon';
      icon.style.background = `${stat.color}20`;
      icon.style.color = stat.color;
      icon.textContent = stat.icon;

      const info = document.createElement('div');
      info.className = 'stat-info';
      const h3 = document.createElement('h3');
      h3.style.color = stat.color;
      h3.textContent = String(stat.value);
      const p = document.createElement('p');
      p.textContent = stat.label;
      info.append(h3, p);

      card.append(icon, info);
      row.appendChild(card);
    });

    return row;
  }

  private renderBatchFilterBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'filter-bar';

    const row = document.createElement('div');
    row.className = 'filter-row';

    const dateFilter = document.createElement('div');
    dateFilter.className = 'filter-item';
    const dateLabel = document.createElement('label');
    dateLabel.textContent = '取货日期';
    const dateInput = document.createElement('input');
    dateInput.type = 'date';
    dateInput.value = this.batchFilters.pickupDate;
    dateInput.addEventListener('change', (e) => {
      this.batchFilters.pickupDate = (e.target as HTMLInputElement).value;
      this.render();
    });
    dateFilter.append(dateLabel, dateInput);

    const refFilter = document.createElement('div');
    refFilter.className = 'filter-item';
    const refLabel = document.createElement('label');
    refLabel.textContent = '冷藏要求';
    const refSelect = document.createElement('select');
    const refOptions: [RefrigerationType | 'all', string][] = [
      ['all', '全部'],
      ['none', '常温'],
      ['chilled', '冷藏'],
      ['frozen', '冷冻']
    ];
    refOptions.forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (this.batchFilters.refrigeration === val) opt.selected = true;
      refSelect.appendChild(opt);
    });
    refSelect.addEventListener('change', (e) => {
      this.batchFilters.refrigeration = (e.target as HTMLSelectElement).value as RefrigerationType | 'all';
      this.render();
    });
    refFilter.append(refLabel, refSelect);

    const statusFilter = document.createElement('div');
    statusFilter.className = 'filter-item';
    const statusLabel = document.createElement('label');
    statusLabel.textContent = '批次状态';
    const statusSelect = document.createElement('select');
    const statusOpts: [BatchStatus | 'all', string][] = [
      ['all', '全部'],
      ['created', '待出货'],
      ['shipping', '出货中'],
      ['completed', '已出货']
    ];
    statusOpts.forEach(([val, label]) => {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label;
      if (this.batchFilters.status === val) opt.selected = true;
      statusSelect.appendChild(opt);
    });
    statusSelect.addEventListener('change', (e) => {
      this.batchFilters.status = (e.target as HTMLSelectElement).value as BatchStatus | 'all';
      this.render();
    });
    statusFilter.append(statusLabel, statusSelect);

    const keywordFilter = document.createElement('div');
    keywordFilter.className = 'filter-item';
    const keywordLabel = document.createElement('label');
    keywordLabel.textContent = '搜索关键词';
    const keywordInput = document.createElement('input');
    keywordInput.type = 'text';
    keywordInput.placeholder = '批次号/客户名称';
    keywordInput.value = this.batchFilters.keyword;
    keywordInput.addEventListener('input', (e) => {
      this.batchFilters.keyword = (e.target as HTMLInputElement).value;
      this.render();
    });
    keywordFilter.append(keywordLabel, keywordInput);

    const clearBtn = this.createButton('清除筛选', 'btn-sm', () => {
      this.batchFilters = {
        pickupDate: '',
        refrigeration: 'all',
        status: 'all',
        keyword: ''
      };
      this.render();
    });

    row.append(dateFilter, statusFilter, refFilter, keywordFilter, clearBtn);
    bar.appendChild(row);

    return bar;
  }

  private renderBatchList(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'batch-list-container';

    const batches = this.filteredBatches;

    if (batches.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.style.padding = '60px 20px';
      const icon = document.createElement('div');
      icon.style.fontSize = '56px';
      icon.textContent = '📭';
      const msg = document.createElement('p');
      msg.style.marginTop = '12px';
      msg.style.fontSize = '15px';
      msg.style.color = '#6b7280';
      msg.textContent = '暂无符合条件的出货批次';
      const subMsg = document.createElement('p');
      subMsg.style.marginTop = '4px';
      subMsg.style.fontSize = '13px';
      subMsg.style.color = '#9ca3af';
      subMsg.textContent = '点击"创建出货批次"开始组批，或调整筛选条件';
      empty.append(icon, msg, subMsg);
      container.appendChild(empty);
      return container;
    }

    const table = document.createElement('table');
    table.className = 'order-table batch-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
      <th>批次号</th>
      <th>取货日期</th>
      <th>冷藏要求</th>
      <th>订单数</th>
      <th>总盒数</th>
      <th>客户数</th>
      <th>核对进度</th>
      <th>状态</th>
      <th>创建人</th>
      <th>创建时间</th>
      <th>操作</th>
    `;
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    const sortedBatches = [...batches].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    sortedBatches.forEach((batch) => {
      tbody.appendChild(this.renderBatchRow(batch));
    });

    table.appendChild(tbody);
    container.appendChild(table);

    return container;
  }

  private renderBatchRow(batch: ShippingBatch): HTMLTableRowElement {
    const tr = document.createElement('tr');
    tr.style.cursor = 'pointer';
    tr.onclick = () => {
      this.currentBatchId = batch.id;
      this.viewMode = 'batch-detail';
      this.render();
    };

    const stats = batchStore.getBatchStats(batch);

    const idCell = document.createElement('td');
    const idStrong = document.createElement('strong');
    idStrong.style.color = '#1f2937';
    idStrong.textContent = batch.id;
    idCell.appendChild(idStrong);

    const dateCell = document.createElement('td');
    dateCell.textContent = batch.pickupDate;

    const refCell = document.createElement('td');
    const refTag = document.createElement('span');
    refTag.className =
      batch.refrigeration === 'mixed'
        ? 'refrigeration-tag refrigeration-chilled'
        : `refrigeration-tag refrigeration-${batch.refrigeration}`;
    refTag.textContent = batch.refrigeration === 'mixed' ? '混合' : REFRIGERATION_LABELS[batch.refrigeration];
    refCell.appendChild(refTag);

    const orderCountCell = document.createElement('td');
    orderCountCell.style.textAlign = 'center';
    const orderCountStrong = document.createElement('strong');
    orderCountStrong.style.fontSize = '15px';
    orderCountStrong.textContent = String(stats.orderCount);
    orderCountCell.appendChild(orderCountStrong);

    const boxCountCell = document.createElement('td');
    boxCountCell.style.textAlign = 'center';
    boxCountCell.textContent = String(stats.totalBoxes);

    const customerCountCell = document.createElement('td');
    customerCountCell.style.textAlign = 'center';
    customerCountCell.textContent = String(stats.customerCount);

    const progressCell = document.createElement('td');
    const progressWrap = document.createElement('div');
    const progressText = document.createElement('div');
    progressText.style.display = 'flex';
    progressText.style.justifyContent = 'space-between';
    progressText.style.fontSize = '12px';
    progressText.style.marginBottom = '4px';
    const checkedSpan = document.createElement('span');
    checkedSpan.style.color = '#6b7280';
    checkedSpan.textContent = `${stats.checkedCount}/${stats.orderCount}`;
    const percentSpan = document.createElement('span');
    percentSpan.style.fontWeight = '600';
    percentSpan.style.color = stats.progress === 100 ? '#10b981' : '#3b82f6';
    percentSpan.textContent = `${stats.progress}%`;
    progressText.append(checkedSpan, percentSpan);
    const barBg = document.createElement('div');
    barBg.style.height = '6px';
    barBg.style.background = '#e5e7eb';
    barBg.style.borderRadius = '3px';
    barBg.style.overflow = 'hidden';
    const barFill = document.createElement('div');
    barFill.style.height = '100%';
    barFill.style.width = `${stats.progress}%`;
    barFill.style.background = stats.progress === 100 ? '#22c55e' : '#3b82f6';
    barFill.style.borderRadius = '3px';
    barBg.appendChild(barFill);
    progressWrap.append(progressText, barBg);
    progressCell.appendChild(progressWrap);

    const statusCell = document.createElement('td');
    const statusBadge = document.createElement('span');
    statusBadge.className = `batch-status-badge batch-status-${batch.status}`;
    statusBadge.style.background = `${BATCH_STATUS_COLORS[batch.status]}20`;
    statusBadge.style.color = BATCH_STATUS_COLORS[batch.status];
    statusBadge.style.border = `1px solid ${BATCH_STATUS_COLORS[batch.status]}40`;
    statusBadge.textContent = BATCH_STATUS_LABELS[batch.status];
    statusCell.appendChild(statusBadge);

    const creatorCell = document.createElement('td');
    creatorCell.textContent = batch.createdBy || '-';

    const createdAtCell = document.createElement('td');
    createdAtCell.textContent = new Date(batch.createdAt).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    const actionCell = document.createElement('td');
    actionCell.onclick = (e) => e.stopPropagation();
    actionCell.className = 'action-buttons';
    actionCell.style.display = 'flex';
    actionCell.style.gap = '4px';
    actionCell.style.flexWrap = 'wrap';

    const viewBtn = this.createButton('查看详情', 'btn-sm btn-info', () => {
      this.currentBatchId = batch.id;
      this.viewMode = 'batch-detail';
      this.render();
    });
    actionCell.appendChild(viewBtn);

    const printBtn = this.createButton('打印交接单', 'btn-sm', () => {
      printBatchHandover(batch);
    });
    actionCell.appendChild(printBtn);

    const exportBtn = this.createButton('导出CSV', 'btn-sm', () => {
      exportBatchToCSV(batch);
    });
    actionCell.appendChild(exportBtn);

    if (batch.status !== 'completed') {
      const shipBtn = this.createButton('✓ 标记已出货', 'btn-sm btn-success', () => {
        const receivedBy = prompt('请输入接收人姓名（可选）：', '') || '';
        if (confirm(`确认将批次 ${batch.id} 标记为已出货？`)) {
          batchStore.markShipped(batch.id, receivedBy);
        }
      });
      actionCell.appendChild(shipBtn);

      const deleteBtn = this.createButton('删除', 'btn-sm', () => {
        if (confirm(`确定删除批次 ${batch.id} 吗？批次内的订单将被释放。`)) {
          batchStore.delete(batch.id);
        }
      });
      deleteBtn.style.color = '#ef4444';
      actionCell.appendChild(deleteBtn);
    }

    tr.append(
      idCell, dateCell, refCell, orderCountCell, boxCountCell, customerCountCell,
      progressCell, statusCell, creatorCell, createdAtCell, actionCell
    );

    return tr;
  }

  private renderBatchDetailView(): HTMLElement {
    const container = document.createElement('div');
    container.className = 'batch-detail-view';

    if (!this.currentBatchId) {
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.style.padding = '60px 20px';
      empty.innerHTML = '<div style="font-size:48px;">⚠️</div><p style="margin-top:12px;color:#6b7280;">批次不存在</p>';
      const backBtn = this.createButton('← 返回批次列表', 'btn-sm', () => {
        this.viewMode = 'batches';
        this.currentBatchId = null;
        this.render();
      });
      empty.appendChild(backBtn);
      container.appendChild(empty);
      return container;
    }

    const batch = batchStore.getById(this.currentBatchId);
    if (!batch) {
      this.currentBatchId = null;
      this.viewMode = 'batches';
      this.render();
      return container;
    }

    const orders = batchStore.getBatchOrders(batch);
    const stats = batchStore.getBatchStats(batch);

    const headerBar = document.createElement('div');
    headerBar.style.display = 'flex';
    headerBar.style.justifyContent = 'space-between';
    headerBar.style.alignItems = 'center';
    headerBar.style.flexWrap = 'wrap';
    headerBar.style.gap = '12px';
    headerBar.style.marginBottom = '16px';

    const leftGroup = document.createElement('div');
    leftGroup.style.display = 'flex';
    leftGroup.style.alignItems = 'center';
    leftGroup.style.gap = '12px';
    leftGroup.style.flexWrap = 'wrap';

    const backBtn = this.createButton('← 返回列表', 'btn-sm', () => {
      this.viewMode = 'batches';
      this.currentBatchId = null;
      this.render();
    });

    const titleGroup = document.createElement('div');
    const h2 = document.createElement('h2');
    h2.style.display = 'inline';
    h2.style.marginRight = '12px';
    h2.textContent = `📦 ${batch.id}`;
    const statusBadge = document.createElement('span');
    statusBadge.className = `batch-status-badge batch-status-${batch.status}`;
    statusBadge.style.background = `${BATCH_STATUS_COLORS[batch.status]}20`;
    statusBadge.style.color = BATCH_STATUS_COLORS[batch.status];
    statusBadge.style.border = `1px solid ${BATCH_STATUS_COLORS[batch.status]}40`;
    statusBadge.style.fontSize = '14px';
    statusBadge.style.padding = '4px 12px';
    statusBadge.textContent = BATCH_STATUS_LABELS[batch.status];
    const subtitle = document.createElement('p');
    subtitle.style.color = '#6b7280';
    subtitle.style.fontSize = '13px';
    subtitle.style.marginTop = '4px';
    subtitle.innerHTML = `📅 取货日期：<strong>${escapeHtml(batch.pickupDate)}</strong> &nbsp;|&nbsp; ❄️ 冷藏要求：<strong>${batch.refrigeration === 'mixed' ? '混合' : escapeHtml(REFRIGERATION_LABELS[batch.refrigeration])}</strong> &nbsp;|&nbsp; 👤 创建人：<strong>${escapeHtml(batch.createdBy || '-')}</strong>`;
    titleGroup.append(h2, statusBadge, subtitle);
    leftGroup.append(backBtn, titleGroup);

    const rightActions = document.createElement('div');
    rightActions.style.display = 'flex';
    rightActions.style.gap = '8px';
    rightActions.style.flexWrap = 'wrap';

    const printBtn = this.createButton('🖨️ 打印交接单', '', () => printBatchHandover(batch));
    const exportBtn = this.createButton('📊 导出CSV', '', () => exportBatchToCSV(batch));
    rightActions.append(printBtn, exportBtn);

    if (batch.status !== 'completed') {
      const shipBtn = this.createButton('✓ 标记已出货', 'btn-success', () => {
        const receivedBy = prompt('请输入接收人姓名（可选）：', batch.receivedBy || '') || '';
        if (confirm(`确认将批次 ${batch.id} 标记为已出货？`)) {
          batchStore.markShipped(batch.id, receivedBy);
        }
      });
      rightActions.appendChild(shipBtn);
    }

    headerBar.append(leftGroup, rightActions);
    container.appendChild(headerBar);

    container.appendChild(this.renderBatchDetailStats(batch, stats));
    container.appendChild(this.renderBatchProgressBar(stats));
    container.appendChild(this.renderBatchCustomerList(orders));

    if (batch.remark) {
      const remarkBox = document.createElement('div');
      remarkBox.style.background = '#fef9c3';
      remarkBox.style.border = '1px solid #fde047';
      remarkBox.style.borderRadius = '8px';
      remarkBox.style.padding = '12px 16px';
      remarkBox.style.marginBottom = '16px';
      remarkBox.innerHTML = `<span style="font-weight:600;color:#854d0e;">📝 批次备注：</span><span style="color:#713f12;">${escapeHtml(batch.remark)}</span>`;
      container.appendChild(remarkBox);
    }

    if (batch.status === 'completed') {
      const shippedInfo = document.createElement('div');
      shippedInfo.style.background = '#f0fdf4';
      shippedInfo.style.border = '1px solid #86efac';
      shippedInfo.style.borderRadius = '8px';
      shippedInfo.style.padding = '12px 16px';
      shippedInfo.style.marginBottom = '16px';
      shippedInfo.innerHTML = `
        <span style="font-weight:600;color:#166534;">✅ 出货完成</span>
        <span style="margin-left:16px;color:#15803d;">🚚 出货时间：${batch.shippedAt ? escapeHtml(new Date(batch.shippedAt).toLocaleString('zh-CN')) : '-'}</span>
        <span style="margin-left:16px;color:#15803d;">🤝 接收人：${escapeHtml(batch.receivedBy || '未记录')}</span>
      `;
      container.appendChild(shippedInfo);
    }

    container.appendChild(this.renderBatchDetailOrders(batch, orders));

    return container;
  }

  private renderBatchDetailStats(_batch: ShippingBatch, stats: ReturnType<typeof batchStore.getBatchStats>): HTMLElement {
    const statItems = [
      { label: '订单数量', value: stats.orderCount, icon: '📋', color: '#3b82f6' },
      { label: '总盒数', value: stats.totalBoxes, icon: '📦', color: '#f59e0b' },
      { label: '客户数量', value: stats.customerCount, icon: '👥', color: '#8b5cf6' },
      { label: '已核对', value: `${stats.checkedCount}/${stats.orderCount}`, icon: '✅', color: '#10b981' }
    ];

    const row = document.createElement('div');
    row.className = 'stats-row';
    row.style.marginBottom = '16px';

    statItems.forEach((item) => {
      const card = document.createElement('div');
      card.className = 'stat-card';
      const icon = document.createElement('div');
      icon.className = 'stat-icon';
      icon.style.background = `${item.color}20`;
      icon.style.color = item.color;
      icon.textContent = item.icon;
      const info = document.createElement('div');
      info.className = 'stat-info';
      const h3 = document.createElement('h3');
      h3.style.color = item.color;
      h3.textContent = String(item.value);
      const p = document.createElement('p');
      p.textContent = item.label;
      info.append(h3, p);
      card.append(icon, info);
      row.appendChild(card);
    });

    return row;
  }

  private renderBatchProgressBar(stats: ReturnType<typeof batchStore.getBatchStats>): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.marginBottom = '16px';
    wrap.style.padding = '16px';
    wrap.style.background = '#eff6ff';
    wrap.style.borderRadius = '8px';
    wrap.style.border = '1px solid #bfdbfe';

    const topRow = document.createElement('div');
    topRow.style.display = 'flex';
    topRow.style.justifyContent = 'space-between';
    topRow.style.alignItems = 'center';
    topRow.style.marginBottom = '8px';

    const left = document.createElement('div');
    const strong = document.createElement('strong');
    strong.style.color = '#1e40af';
    strong.textContent = '📊 核对进度';
    const tip = document.createElement('span');
    tip.style.marginLeft = '8px';
    tip.style.fontSize = '12px';
    tip.style.color = '#3b82f6';
    tip.textContent = '勾选下方订单复选框标记已核对';
    left.append(strong, tip);

    const right = document.createElement('span');
    right.style.fontWeight = '700';
    right.style.fontSize = '16px';
    right.style.color = stats.progress === 100 ? '#059669' : '#2563eb';
    right.textContent = `${stats.progress}% (${stats.checkedCount}/${stats.orderCount})`;

    topRow.append(left, right);

    const barBg = document.createElement('div');
    barBg.style.height = '10px';
    barBg.style.background = '#dbeafe';
    barBg.style.borderRadius = '5px';
    barBg.style.overflow = 'hidden';

    const barFill = document.createElement('div');
    barFill.style.height = '100%';
    barFill.style.width = `${stats.progress}%`;
    barFill.style.background = stats.progress === 100
      ? 'linear-gradient(90deg, #10b981, #059669)'
      : 'linear-gradient(90deg, #3b82f6, #2563eb)';
    barFill.style.borderRadius = '5px';
    barFill.style.transition = 'width 0.3s';

    barBg.appendChild(barFill);
    wrap.append(topRow, barBg);
    return wrap;
  }

  private renderBatchCustomerList(orders: Order[]): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'batch-customer-list-wrap';
    wrap.style.marginBottom = '16px';
    wrap.style.padding = '12px 16px';
    wrap.style.background = '#fef3c7';
    wrap.style.borderRadius = '8px';
    wrap.style.border = '1px solid #fcd34d';

    const customers = Array.from(new Set(orders.map((o) => o.customerName)));

    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'center';
    header.style.marginBottom = '8px';

    const title = document.createElement('strong');
    title.style.color = '#92400e';
    title.textContent = `👥 客户清单（${customers.length} 位）`;

    header.appendChild(title);

    const list = document.createElement('div');
    list.style.display = 'flex';
    list.style.flexWrap = 'wrap';
    list.style.gap = '6px';

    customers.forEach((name) => {
      const tag = document.createElement('span');
      tag.className = 'customer-tag';
      tag.textContent = name;
      list.appendChild(tag);
    });

    wrap.append(header, list);
    return wrap;
  }

  private renderBatchDetailOrders(batch: ShippingBatch, orders: Order[]): HTMLElement {
    const container = document.createElement('div');
    container.className = 'order-table-container';

    const titleRow = document.createElement('div');
    titleRow.style.display = 'flex';
    titleRow.style.justifyContent = 'space-between';
    titleRow.style.alignItems = 'center';
    titleRow.style.marginBottom = '12px';

    const title = document.createElement('h3');
    title.textContent = `🧾 批次订单明细（${orders.length} 单）`;

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.gap = '8px';

    if (batch.status !== 'completed') {
      const addOrderBtn = this.createButton('➕ 添加订单到批次', 'btn-sm btn-info', () => {
        this.openAddOrderToBatchDialog(batch.id);
      });
      actions.appendChild(addOrderBtn);
    }

    titleRow.append(title, actions);
    container.appendChild(titleRow);

    const warnings = checkOrders(orders);

    const table = document.createElement('table');
    table.className = 'order-table';

    const thead = document.createElement('thead');
    const headerRow = document.createElement('tr');
    headerRow.innerHTML = `
      <th class="checkbox-cell" style="width:40px;">核对</th>
      <th>订单号</th>
      <th>客户</th>
      <th>产品清单</th>
      <th style="width:60px;text-align:center;">盒数</th>
      <th>过敏提醒</th>
      <th>冷藏</th>
      <th>核对人</th>
      <th>操作</th>
    `;
    thead.appendChild(headerRow);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    if (orders.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 9;
      const empty = document.createElement('div');
      empty.className = 'empty-state';
      empty.style.padding = '40px 20px';
      empty.innerHTML = '<div style="font-size:40px;">📭</div><p style="margin-top:8px;color:#6b7280;">批次内暂无订单</p>';
      td.appendChild(empty);
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      orders.forEach((order) => {
        tbody.appendChild(this.renderBatchDetailOrderRow(batch, order, warnings));
      });
    }

    table.appendChild(tbody);
    container.appendChild(table);

    return container;
  }

  private renderBatchDetailOrderRow(
    batch: ShippingBatch,
    order: Order,
    allWarnings: CheckWarning[]
  ): HTMLTableRowElement {
    const tr = document.createElement('tr');
    const orderWarnings = getWarningsByOrderId(allWarnings, order.id);
    const hasError = orderWarnings.some((w) => w.severity === 'error');

    const checkboxCell = document.createElement('td');
    checkboxCell.className = 'checkbox-cell';
    checkboxCell.style.textAlign = 'center';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'row-checkbox';
    checkbox.style.transform = 'scale(1.2)';
    checkbox.checked = batch.checkedIds.includes(order.id);
    if (batch.status === 'completed') {
      checkbox.disabled = true;
    }
    checkbox.addEventListener('change', () => {
      if (batch.status === 'completed') return;
      batchStore.updateChecked(batch.id, order.id, checkbox.checked);
    });
    checkboxCell.appendChild(checkbox);

    const idCell = document.createElement('td');
    const idStrong = document.createElement('strong');
    idStrong.textContent = order.id;
    idCell.appendChild(idStrong);

    const customerCell = document.createElement('td');
    customerCell.textContent = order.customerName;

    const productCell = document.createElement('td');
    const productList = document.createElement('div');
    productList.className = 'product-list';

    order.products.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'product-item';
      const nameSpan = document.createElement('span');
      nameSpan.textContent = p.name;
      const qtySpan = document.createElement('span');
      const typeTag = document.createElement('span');
      typeTag.className = 'product-type-tag';
      typeTag.textContent = PRODUCT_TYPE_LABELS[p.type];
      const times = document.createElement('span');
      times.textContent = `×${p.quantity}`;
      qtySpan.append(typeTag, ' ', times);
      item.append(nameSpan, qtySpan);
      productList.appendChild(item);
    });

    const activeException = orderStore.getActiveException(order.id);
    if (activeException) {
      const excBanner = document.createElement('div');
      excBanner.className = `exception-banner exception-banner-${activeException.status}`;
      excBanner.style.marginTop = '6px';
      excBanner.innerHTML = `
        <span style="font-weight:600;">🚨 ${escapeHtml(EXCEPTION_STATUS_LABELS[activeException.status])}</span>
        <span style="margin-left:8px;">${escapeHtml(EXCEPTION_CATEGORY_LABELS[activeException.category])}</span>
        <div style="margin-top:2px;font-size:12px;">原因：${escapeHtml(activeException.reason)}</div>
      `;
      productList.appendChild(excBanner);
    }

    if (orderWarnings.length > 0) {
      const warningList = document.createElement('div');
      warningList.className = 'warning-list';
      orderWarnings.forEach((w) => {
        const warnItem = document.createElement('div');
        warnItem.className = `warning-item ${w.severity}`;
        warnItem.innerHTML = `<span>${w.severity === 'error' ? '❌' : '⚠️'}</span> <span>${escapeHtml(w.message)}</span>`;
        warningList.appendChild(warnItem);
      });
      productList.appendChild(warningList);
    }

    productCell.appendChild(productList);

    const boxQtyCell = document.createElement('td');
    boxQtyCell.style.textAlign = 'center';
    const boxQtyStrong = document.createElement('strong');
    boxQtyStrong.style.color = hasError ? '#ef4444' : '#374151';
    boxQtyStrong.style.fontSize = '15px';
    boxQtyStrong.textContent = String(order.boxQuantity);
    boxQtyCell.appendChild(boxQtyStrong);

    const allergyCell = document.createElement('td');
    if (order.allergyWarning) {
      const allergyTag = document.createElement('span');
      allergyTag.className = 'allergy-tag';
      allergyTag.textContent = order.allergyWarning;
      allergyCell.appendChild(allergyTag);
    } else {
      allergyCell.innerHTML = '<span class="allergy-empty">无</span>';
    }

    const refCell = document.createElement('td');
    const refTag = document.createElement('span');
    refTag.className = `refrigeration-tag refrigeration-${order.refrigeration}`;
    refTag.textContent = REFRIGERATION_LABELS[order.refrigeration];
    refCell.appendChild(refTag);

    const checkerCell = document.createElement('td');
    checkerCell.textContent = order.checker || '<span class="allergy-empty">未分配</span>';

    const actionCell = document.createElement('td');
    actionCell.style.display = 'flex';
    actionCell.style.gap = '4px';
    actionCell.style.flexWrap = 'wrap';

    if (batch.status !== 'completed') {
      const removeBtn = this.createButton('移出批次', 'btn-sm btn-warning', () => {
        if (confirm(`确认将订单 ${order.id} 从批次中移除？`)) {
          batchStore.removeOrder(batch.id, order.id);
        }
      });
      actionCell.appendChild(removeBtn);
    }

    const editBtn = this.createButton('编辑订单', 'btn-sm', () => {
      this.openOrderModal(order);
    });
    actionCell.appendChild(editBtn);

    tr.append(
      checkboxCell, idCell, customerCell, productCell, boxQtyCell,
      allergyCell, refCell, checkerCell, actionCell
    );

    return tr;
  }

  private openCreateBatchDialog(): void {
    const eligibleOrders = batchStore.getUnbatchedReadyOrders();
    if (eligibleOrders.length === 0) {
      alert('暂无符合条件的可出货订单。\n\n订单需要同时满足以下条件：\n1. 状态为"可出货"（ready_ship）\n2. 无未解决的活跃异常\n3. 已分配核对人\n4. 未在其他未完成批次中');
      return;
    }

    const pickupDates = Array.from(new Set(eligibleOrders.map((o) => o.pickupDate))).sort();
    const defaultDate = pickupDates.length > 0 ? pickupDates[0] : new Date().toISOString().slice(0, 10);

    this.createBatchContext = {
      pickupDate: defaultDate,
      refrigeration: 'all',
      selectedOrderIds: new Set()
    };

    this.renderCreateBatchDialog();
  }

  private renderCreateBatchDialog(): void {
    if (!this.createBatchContext) return;

    const existing = document.querySelector('.create-batch-modal-overlay');
    if (existing) existing.remove();

    const ctx = this.createBatchContext;
    const allEligible = batchStore.getUnbatchedReadyOrders();

    let filteredOrders = allEligible.filter((o) => o.pickupDate === ctx.pickupDate);
    if (ctx.refrigeration !== 'all' && ctx.refrigeration !== 'mixed') {
      filteredOrders = filteredOrders.filter((o) => o.refrigeration === ctx.refrigeration);
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay create-batch-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal create-batch-modal';
    modal.style.maxWidth = '900px';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const h2 = document.createElement('h2');
    h2.textContent = '➕ 创建出货批次';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => {
      this.createBatchContext = null;
      overlay.remove();
    };
    header.append(h2, closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const intro = document.createElement('div');
    intro.className = 'modal-intro-box';
    intro.innerHTML = `
      <strong>💡 说明：</strong>
      本步骤按<span style="color:#3b82f6;font-weight:600;">取货日期</span>和<span style="color:#3b82f6;font-weight:600;">冷藏要求</span>筛选订单，
      仅"可出货"状态、无未解决异常、已分配核对人的订单可以加入批次。
    `;
    body.appendChild(intro);

    const filterSection = document.createElement('div');
    filterSection.className = 'create-batch-filter';
    filterSection.style.background = '#f9fafb';
    filterSection.style.padding = '12px 16px';
    filterSection.style.borderRadius = '8px';
    filterSection.style.marginBottom = '16px';
    filterSection.style.border = '1px solid #e5e7eb';

    const filterTitle = document.createElement('div');
    filterTitle.style.fontWeight = '600';
    filterTitle.style.marginBottom = '10px';
    filterTitle.style.color = '#374151';
    filterTitle.textContent = '🔍 订单筛选条件';
    filterSection.appendChild(filterTitle);

    const filterGrid = document.createElement('div');
    filterGrid.style.display = 'grid';
    filterGrid.style.gridTemplateColumns = 'repeat(3, 1fr)';
    filterGrid.style.gap = '12px';

    const availableDates = Array.from(new Set(allEligible.map((o) => o.pickupDate))).sort();

    const dateFg = this.createFormGroup(
      '取货日期 *',
      (() => {
        const sel = document.createElement('select');
        sel.name = 'pickupDate';
        if (availableDates.length === 0) {
          const opt = document.createElement('option');
          opt.textContent = '无可用日期';
          opt.disabled = true;
          sel.appendChild(opt);
        } else {
          availableDates.forEach((d) => {
            const count = allEligible.filter((o) => o.pickupDate === d).length;
            const opt = document.createElement('option');
            opt.value = d;
            opt.textContent = `${d} (${count}单可选)`;
            if (d === ctx.pickupDate) opt.selected = true;
            sel.appendChild(opt);
          });
        }
        sel.addEventListener('change', (e) => {
          ctx.pickupDate = (e.target as HTMLSelectElement).value;
          ctx.selectedOrderIds.clear();
          this.renderCreateBatchDialog();
        });
        return sel;
      })()
    );

    const refFg = this.createFormGroup(
      '冷藏要求',
      (() => {
        const sel = document.createElement('select');
        sel.name = 'refrigeration';
        const opts: [RefrigerationType | 'all' | 'mixed', string][] = [
          ['all', '全部（自动设为"混合"批次）'],
          ['none', '常温'],
          ['chilled', '冷藏'],
          ['frozen', '冷冻']
        ];
        opts.forEach(([val, label]) => {
          const opt = document.createElement('option');
          opt.value = val;
          opt.textContent = label;
          if (val === ctx.refrigeration) opt.selected = true;
          sel.appendChild(opt);
        });
        sel.addEventListener('change', (e) => {
          const val = (e.target as HTMLSelectElement).value as RefrigerationType | 'all' | 'mixed';
          ctx.refrigeration = val;
          ctx.selectedOrderIds.clear();
          this.renderCreateBatchDialog();
        });
        return sel;
      })()
    );

    const creatorFg = this.createFormGroup(
      '创建人姓名 *',
      (() => {
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.name = 'createdBy';
        inp.id = 'create-batch-createdBy';
        inp.placeholder = '请输入您的姓名';
        inp.required = true;
        inp.maxLength = 20;
        return inp;
      })()
    );

    filterGrid.append(dateFg, refFg, creatorFg);
    filterSection.appendChild(filterGrid);

    const remarkFg = this.createFormGroup(
      '批次备注（可选）',
      (() => {
        const ta = document.createElement('textarea');
        ta.name = 'remark';
        ta.id = 'create-batch-remark';
        ta.rows = 2;
        ta.maxLength = 200;
        ta.placeholder = '如：门店A上午批次、加急送货等';
        return ta;
      })()
    );
    remarkFg.style.marginTop = '10px';
    remarkFg.style.marginBottom = '0';
    filterSection.appendChild(remarkFg);

    body.appendChild(filterSection);

    const orderSectionHeader = document.createElement('div');
    orderSectionHeader.style.display = 'flex';
    orderSectionHeader.style.justifyContent = 'space-between';
    orderSectionHeader.style.alignItems = 'center';
    orderSectionHeader.style.marginBottom = '10px';
    orderSectionHeader.style.flexWrap = 'wrap';
    orderSectionHeader.style.gap = '10px';

    const leftH = document.createElement('div');
    const h3 = document.createElement('h3');
    h3.style.display = 'inline';
    h3.style.fontSize = '15px';
    h3.textContent = '📋 可出货订单列表';
    const countBadge = document.createElement('span');
    countBadge.style.marginLeft = '8px';
    countBadge.style.padding = '2px 10px';
    countBadge.style.background = '#dbeafe';
    countBadge.style.color = '#1d4ed8';
    countBadge.style.borderRadius = '999px';
    countBadge.style.fontSize = '12px';
    countBadge.style.fontWeight = '600';
    countBadge.textContent = `筛选后 ${filteredOrders.length} 单`;
    leftH.append(h3, countBadge);

    const rightH = document.createElement('div');
    rightH.style.display = 'flex';
    rightH.style.gap = '8px';
    rightH.style.alignItems = 'center';

    const selectedCount = Array.from(ctx.selectedOrderIds).filter(
      (id) => filteredOrders.some((o) => o.id === id)
    ).length;
    const selectedInfo = document.createElement('span');
    selectedInfo.style.fontSize = '13px';
    selectedInfo.style.color = '#374151';
    const totalBoxes = filteredOrders
      .filter((o) => ctx.selectedOrderIds.has(o.id))
      .reduce((sum, o) => sum + o.boxQuantity, 0);
    selectedInfo.innerHTML = `已选 <strong style="color:#f97316;">${selectedCount}</strong> 单，共 <strong style="color:#f97316;">${totalBoxes}</strong> 盒`;

    const selectAllBtn = this.createButton('全选本页', 'btn-sm', () => {
      filteredOrders.forEach((o) => ctx.selectedOrderIds.add(o.id));
      this.renderCreateBatchDialog();
    });
    const clearSelBtn = this.createButton('清空选择', 'btn-sm', () => {
      ctx.selectedOrderIds.clear();
      this.renderCreateBatchDialog();
    });

    rightH.append(selectedInfo, selectAllBtn, clearSelBtn);
    orderSectionHeader.append(leftH, rightH);
    body.appendChild(orderSectionHeader);

    const orderTableContainer = document.createElement('div');
    orderTableContainer.style.maxHeight = '400px';
    orderTableContainer.style.overflowY = 'auto';
    orderTableContainer.style.border = '1px solid #e5e7eb';
    orderTableContainer.style.borderRadius = '8px';

    const orderTable = document.createElement('table');
    orderTable.className = 'order-table';
    orderTable.style.marginBottom = '0';

    const tHead = document.createElement('thead');
    tHead.style.position = 'sticky';
    tHead.style.top = '0';
    tHead.style.zIndex = '1';
    const tHeaderRow = document.createElement('tr');
    tHeaderRow.innerHTML = `
      <th class="checkbox-cell" style="width:40px;">选</th>
      <th>订单号</th>
      <th>客户</th>
      <th>产品清单</th>
      <th style="width:50px;text-align:center;">盒</th>
      <th>过敏</th>
      <th>冷藏</th>
      <th>核对人</th>
    `;
    tHead.appendChild(tHeaderRow);
    orderTable.appendChild(tHead);

    const tBody = document.createElement('tbody');

    if (filteredOrders.length === 0) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 8;
      td.style.padding = '30px';
      td.style.textAlign = 'center';
      td.style.color = '#9ca3af';
      td.textContent = '当前筛选条件下无可出货订单';
      tr.appendChild(td);
      tBody.appendChild(tr);
    } else {
      filteredOrders.forEach((order) => {
        const tr = document.createElement('tr');
        if (ctx.selectedOrderIds.has(order.id)) {
          tr.classList.add('selected');
        }

        const checkTd = document.createElement('td');
        checkTd.className = 'checkbox-cell';
        checkTd.style.textAlign = 'center';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = ctx.selectedOrderIds.has(order.id);
        cb.addEventListener('change', () => {
          if (cb.checked) {
            ctx.selectedOrderIds.add(order.id);
          } else {
            ctx.selectedOrderIds.delete(order.id);
          }
          this.renderCreateBatchDialog();
        });
        checkTd.appendChild(cb);

        const idTd = document.createElement('td');
        const ids = document.createElement('strong');
        ids.textContent = order.id;
        idTd.appendChild(ids);

        const custTd = document.createElement('td');
        custTd.textContent = order.customerName;

        const prodTd = document.createElement('td');
        const prodList = document.createElement('div');
        prodList.style.fontSize = '12px';
        prodList.innerHTML = order.products
          .map((p) => `${escapeHtml(p.name)} ×${p.quantity}`)
          .join('<br>');
        prodTd.appendChild(prodList);

        const boxTd = document.createElement('td');
        boxTd.style.textAlign = 'center';
        boxTd.innerHTML = `<strong>${order.boxQuantity}</strong>`;

        const algTd = document.createElement('td');
        if (order.allergyWarning) {
          algTd.innerHTML = `<span class="allergy-tag" style="font-size:11px;">${escapeHtml(order.allergyWarning)}</span>`;
        } else {
          algTd.innerHTML = '<span style="color:#9ca3af;font-size:12px;">-</span>';
        }

        const refTd = document.createElement('td');
        refTd.innerHTML = `<span class="refrigeration-tag refrigeration-${order.refrigeration}" style="font-size:11px;">${escapeHtml(REFRIGERATION_LABELS[order.refrigeration])}</span>`;

        const chkTd = document.createElement('td');
        chkTd.textContent = order.checker || '-';

        tr.append(checkTd, idTd, custTd, prodTd, boxTd, algTd, refTd, chkTd);
        tBody.appendChild(tr);
      });
    }

    orderTable.appendChild(tBody);
    orderTableContainer.appendChild(orderTable);
    body.appendChild(orderTableContainer);

    if (allEligible.length > 0 && allEligible.length > filteredOrders.length) {
      const extra = document.createElement('div');
      extra.style.marginTop = '10px';
      extra.style.padding = '8px 12px';
      extra.style.background = '#fef3c7';
      extra.style.borderRadius = '6px';
      extra.style.fontSize = '12px';
      extra.style.color = '#92400e';
      extra.innerHTML = `ℹ️ 另有 <strong>${allEligible.length - filteredOrders.length}</strong> 单符合可出货条件但不在当前筛选日期/冷藏范围内，若需添加请调整筛选条件或创建新的批次。`;
      body.appendChild(extra);
    }

    const ineligibleOrders = orderStore.getAll().filter((o) => {
      if (o.status === 'ready_ship') {
        const result = batchStore.checkOrderEligibility(o);
        return !result.eligible;
      }
      return true;
    }).filter((o) => o.pickupDate === ctx.pickupDate);

    if (ineligibleOrders.length > 0) {
      const ineligibleBox = document.createElement('div');
      ineligibleBox.className = 'ineligible-orders-box';
      const ineligibleHeader = document.createElement('div');
      ineligibleHeader.style.display = 'flex';
      ineligibleHeader.style.justifyContent = 'space-between';
      ineligibleHeader.style.alignItems = 'center';
      ineligibleHeader.style.marginBottom = '8px';
      const title = document.createElement('strong');
      title.style.color = '#991b1b';
      title.textContent = `🚫 不可加入批次的订单（${ineligibleOrders.length} 单）`;
      const toggle = document.createElement('button');
      toggle.className = 'btn btn-sm';
      toggle.textContent = '展开查看原因';
      const listWrap = document.createElement('div');
      listWrap.style.display = 'none';
      listWrap.style.marginTop = '8px';
      toggle.onclick = () => {
        if (listWrap.style.display === 'none') {
          listWrap.style.display = 'block';
          toggle.textContent = '收起';
        } else {
          listWrap.style.display = 'none';
          toggle.textContent = '展开查看原因';
        }
      };
      ineligibleHeader.append(title, toggle);

      ineligibleOrders.forEach((o) => {
        const result = batchStore.checkOrderEligibility(o);
        const item = document.createElement('div');
        item.className = 'ineligible-order-item';
        const idSpan = document.createElement('span');
        idSpan.style.fontWeight = '600';
        idSpan.textContent = `${o.id} - ${o.customerName}`;
        const statusBadge = document.createElement('span');
        statusBadge.className = `status-badge status-${o.status}`;
        statusBadge.style.marginLeft = '8px';
        statusBadge.style.fontSize = '11px';
        statusBadge.textContent = STATUS_LABELS[o.status];
        const reasons = document.createElement('div');
        reasons.style.marginTop = '4px';
        reasons.style.fontSize = '12px';
        reasons.style.color = '#991b1b';
        reasons.style.paddingLeft = '8px';
        reasons.innerHTML = result.reasons.map((r) => `• ${escapeHtml(r)}`).join('<br>');
        item.append(idSpan, statusBadge, reasons);
        listWrap.appendChild(item);
      });

      ineligibleBox.append(ineligibleHeader, listWrap);
      ineligibleBox.style.marginTop = '16px';
      body.appendChild(ineligibleBox);
    }

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = this.createButton('取消', '', () => {
      this.createBatchContext = null;
      overlay.remove();
    });

    const finalSelected = filteredOrders.filter((o) => ctx.selectedOrderIds.has(o.id));
    const finalSelectedIds = finalSelected.map((o) => o.id);

    const confirmBtn = this.createButton(
      `✅ 确认创建批次 (${finalSelectedIds.length}单)`,
      'btn-primary',
      () => {
        const createdByInput = document.getElementById('create-batch-createdBy') as HTMLInputElement;
        const remarkInput = document.getElementById('create-batch-remark') as HTMLTextAreaElement;

        const createdBy = createdByInput?.value.trim().slice(0, 20) || '';
        const remark = remarkInput?.value.trim().slice(0, 200) || '';

        if (!createdBy) {
          alert('请输入创建人姓名');
          createdByInput?.focus();
          return;
        }

        if (finalSelectedIds.length === 0) {
          alert('请至少选择一个订单');
          return;
        }

        const refrigerationType: RefrigerationType | 'mixed' =
          ctx.refrigeration === 'all' || ctx.refrigeration === 'mixed'
            ? (() => {
                const refs = new Set(finalSelected.map((o) => o.refrigeration));
                return refs.size === 1 ? (Array.from(refs)[0] as RefrigerationType) : 'mixed';
              })()
            : (ctx.refrigeration as RefrigerationType);

        const result = batchStore.createBatch(
          finalSelectedIds,
          ctx.pickupDate,
          refrigerationType,
          createdBy,
          remark
        );

        if (result) {
          alert(`批次创建成功！\n\n批次号：${result.id}\n订单数：${result.orderIds.length}\n取货日期：${result.pickupDate}`);
          this.createBatchContext = null;
          overlay.remove();
          this.currentBatchId = result.id;
          this.viewMode = 'batch-detail';
          this.render();
        } else {
          alert('创建失败：所选订单中可能有已加入其他批次或状态变更的情况，请刷新后重试。');
          this.renderCreateBatchDialog();
        }
      }
    );

    if (finalSelectedIds.length === 0) {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
    }

    footer.append(cancelBtn, confirmBtn);

    modal.append(header, body, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.createBatchContext = null;
        overlay.remove();
      }
    });
  }

  private openAddOrderToBatchDialog(batchId: string): void {
    const batch = batchStore.getById(batchId);
    if (!batch) return;

    const eligibleOrders = batchStore
      .getUnbatchedReadyOrders()
      .filter((o) => o.pickupDate === batch.pickupDate);

    if (eligibleOrders.length === 0) {
      alert(`当前取货日期（${batch.pickupDate}）暂无符合条件的可出货订单可添加。`);
      return;
    }

    this.createBatchContext = {
      pickupDate: batch.pickupDate,
      refrigeration: 'all',
      selectedOrderIds: new Set()
    };

    const existing = document.querySelector('.create-batch-modal-overlay');
    if (existing) existing.remove();

    const ctx = this.createBatchContext;
    const filteredOrders = eligibleOrders;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay create-batch-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'modal create-batch-modal';
    modal.style.maxWidth = '800px';

    const header = document.createElement('div');
    header.className = 'modal-header';
    const h2 = document.createElement('h2');
    h2.textContent = `➕ 添加订单到批次 ${batch.id}`;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'modal-close';
    closeBtn.innerHTML = '&times;';
    closeBtn.onclick = () => {
      this.createBatchContext = null;
      overlay.remove();
    };
    header.append(h2, closeBtn);

    const body = document.createElement('div');
    body.className = 'modal-body';

    const intro = document.createElement('div');
    intro.className = 'modal-intro-box';
    intro.innerHTML = `
      为批次 <strong style="color:#f97316;">${escapeHtml(batch.id)}</strong> 添加订单。
      仅显示取货日期为 <strong>${escapeHtml(batch.pickupDate)}</strong> 的可出货订单。
    `;
    body.appendChild(intro);

    const header2 = document.createElement('div');
    header2.style.display = 'flex';
    header2.style.justifyContent = 'space-between';
    header2.style.alignItems = 'center';
    header2.style.margin = '14px 0 10px';
    header2.style.flexWrap = 'wrap';
    header2.style.gap = '10px';

    const left = document.createElement('div');
    const countBadge = document.createElement('span');
    countBadge.style.padding = '2px 10px';
    countBadge.style.background = '#dbeafe';
    countBadge.style.color = '#1d4ed8';
    countBadge.style.borderRadius = '999px';
    countBadge.style.fontSize = '12px';
    countBadge.style.fontWeight = '600';
    countBadge.textContent = `共 ${filteredOrders.length} 单可选`;
    left.append(countBadge);

    const right = document.createElement('div');
    right.style.display = 'flex';
    right.style.gap = '8px';
    right.style.alignItems = 'center';
    const selectedCount = Array.from(ctx.selectedOrderIds).filter(
      (id) => filteredOrders.some((o) => o.id === id)
    ).length;
    const selectedInfo = document.createElement('span');
    selectedInfo.style.fontSize = '13px';
    selectedInfo.innerHTML = `已选 <strong style="color:#f97316;">${selectedCount}</strong> 单`;
    const selectAll = this.createButton('全选', 'btn-sm', () => {
      filteredOrders.forEach((o) => ctx.selectedOrderIds.add(o.id));
      this.openAddOrderToBatchDialog(batchId);
    });
    const clearSel = this.createButton('清空', 'btn-sm', () => {
      ctx.selectedOrderIds.clear();
      this.openAddOrderToBatchDialog(batchId);
    });
    right.append(selectedInfo, selectAll, clearSel);
    header2.append(left, right);
    body.appendChild(header2);

    const tableContainer = document.createElement('div');
    tableContainer.style.maxHeight = '380px';
    tableContainer.style.overflowY = 'auto';
    tableContainer.style.border = '1px solid #e5e7eb';
    tableContainer.style.borderRadius = '8px';

    const table = document.createElement('table');
    table.className = 'order-table';
    table.style.marginBottom = '0';

    const tHead = document.createElement('thead');
    tHead.style.position = 'sticky';
    tHead.style.top = '0';
    const thr = document.createElement('tr');
    thr.innerHTML = `
      <th class="checkbox-cell" style="width:40px;">选</th>
      <th>订单号</th>
      <th>客户</th>
      <th>产品</th>
      <th style="width:50px;text-align:center;">盒</th>
      <th>冷藏</th>
    `;
    tHead.appendChild(thr);
    table.appendChild(tHead);

    const tBody = document.createElement('tbody');
    filteredOrders.forEach((order) => {
      const tr = document.createElement('tr');
      if (ctx.selectedOrderIds.has(order.id)) tr.classList.add('selected');

      const ctd = document.createElement('td');
      ctd.className = 'checkbox-cell';
      ctd.style.textAlign = 'center';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = ctx.selectedOrderIds.has(order.id);
      cb.addEventListener('change', () => {
        if (cb.checked) {
          ctx.selectedOrderIds.add(order.id);
        } else {
          ctx.selectedOrderIds.delete(order.id);
        }
        this.openAddOrderToBatchDialog(batchId);
      });
      ctd.appendChild(cb);

      const idTd = document.createElement('td');
      idTd.innerHTML = `<strong>${escapeHtml(order.id)}</strong>`;
      const custTd = document.createElement('td');
      custTd.textContent = order.customerName;
      const prodTd = document.createElement('td');
      prodTd.style.fontSize = '12px';
      prodTd.innerHTML = order.products.map((p) => `${escapeHtml(p.name)}×${p.quantity}`).join('<br>');
      const boxTd = document.createElement('td');
      boxTd.style.textAlign = 'center';
      boxTd.innerHTML = `<strong>${order.boxQuantity}</strong>`;
      const refTd = document.createElement('td');
      refTd.innerHTML = `<span class="refrigeration-tag refrigeration-${order.refrigeration}" style="font-size:11px;">${escapeHtml(REFRIGERATION_LABELS[order.refrigeration])}</span>`;

      tr.append(ctd, idTd, custTd, prodTd, boxTd, refTd);
      tBody.appendChild(tr);
    });
    table.appendChild(tBody);
    tableContainer.appendChild(table);
    body.appendChild(tableContainer);

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = this.createButton('取消', '', () => {
      this.createBatchContext = null;
      overlay.remove();
    });

    const finalIds = filteredOrders
      .filter((o) => ctx.selectedOrderIds.has(o.id))
      .map((o) => o.id);

    const confirmBtn = this.createButton(
      `✅ 添加 ${finalIds.length} 个订单`,
      'btn-success',
      () => {
        if (finalIds.length === 0) {
          alert('请至少选择一个订单');
          return;
        }
        let added = 0;
        finalIds.forEach((id) => {
          if (batchStore.addOrder(batchId, id)) added++;
        });
        if (added > 0) {
          alert(`成功添加 ${added} 个订单到批次`);
        }
        this.createBatchContext = null;
        overlay.remove();
      }
    );
    if (finalIds.length === 0) {
      confirmBtn.disabled = true;
      confirmBtn.style.opacity = '0.5';
      confirmBtn.style.cursor = 'not-allowed';
    }

    footer.append(cancelBtn, confirmBtn);
    modal.append(header, body, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.createBatchContext = null;
        overlay.remove();
      }
    });
  }
}

new App();

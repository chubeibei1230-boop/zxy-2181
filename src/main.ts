import './styles.css';
import { orderStore } from './store/orderStore';
import { checkOrders, getWarningsByOrderId } from './utils/orderCheck';
import { exportToCSV, printOrders } from './utils/export';
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
  ExceptionCategory
} from './types';
import {
  STATUS_LABELS,
  PRODUCT_TYPE_LABELS,
  REFRIGERATION_LABELS,
  EXCEPTION_STATUS_LABELS,
  EXCEPTION_STATUS_COLORS,
  EXCEPTION_CATEGORY_LABELS
} from './types';

type ViewMode = 'list' | 'shipping';

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

  constructor() {
    this.render();
    orderStore.subscribe(() => this.render());
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
    } else {
      container.appendChild(this.renderShippingMode());
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

    tabs.append(listBtn, shippingBtn);
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
}

new App();

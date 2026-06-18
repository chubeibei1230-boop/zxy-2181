import './styles.css';
import { orderStore } from './store/orderStore';
import { checkOrders, getWarningsByOrderId } from './utils/orderCheck';
import { exportToCSV, printOrders } from './utils/export';
import type {
  Order,
  OrderStatus,
  FilterOptions,
  ProductType,
  RefrigerationType,
  CheckWarning,
  ProductItem
} from './types';
import {
  STATUS_LABELS,
  PRODUCT_TYPE_LABELS,
  REFRIGERATION_LABELS
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
    refrigeration: 'all'
  };
  private shippingChecked: Set<string> = new Set();
  private editingOrder: Order | null = null;

  constructor() {
    this.render();
    orderStore.subscribe(() => this.render());
  }

  private get filteredOrders(): Order[] {
    return orderStore.filter(this.filters);
  }

  private get warnings(): CheckWarning[] {
    return checkOrders(orderStore.getAll());
  }

  private render(): void {
    const app = document.getElementById('app');
    if (!app) return;

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

    const dateFilter = this.createFilterItem(
      '取货日期',
      `<input type="date" value="${this.filters.pickupDate}" id="filter-date">`
    );
    dateFilter.querySelector('input')!.addEventListener('change', (e) => {
      this.filters.pickupDate = (e.target as HTMLInputElement).value;
      this.render();
    });

    const typeOptions = ['all:全部', 'cake:蛋糕', 'cookie:饼干', 'giftbox:礼盒'];
    const typeFilter = this.createFilterItem(
      '产品类型',
      `<select id="filter-type">${typeOptions
        .map((opt) => {
          const [val, label] = opt.split(':');
          return `<option value="${val}" ${this.filters.productType === val ? 'selected' : ''}>${label}</option>`;
        })
        .join('')}</select>`
    );
    typeFilter.querySelector('select')!.addEventListener('change', (e) => {
      this.filters.productType = (e.target as HTMLSelectElement).value as ProductType | 'all';
      this.render();
    });

    const checkers = orderStore.getCheckers();
    const checkerFilter = this.createFilterItem(
      '核对人',
      `<select id="filter-checker">
        <option value="">全部</option>
        ${checkers
          .map((c) => `<option value="${c}" ${this.filters.checker === c ? 'selected' : ''}>${c}</option>`)
          .join('')}
      </select>`
    );
    checkerFilter.querySelector('select')!.addEventListener('change', (e) => {
      this.filters.checker = (e.target as HTMLSelectElement).value;
      this.render();
    });

    const statusOptions: [OrderStatus | 'all', string][] = [
      ['all', '全部'],
      ['pending_pack', '待装盒'],
      ['pending_review', '待复核'],
      ['ready_ship', '可出货'],
      ['on_hold', '异常暂缓']
    ];
    const statusFilter = this.createFilterItem(
      '状态',
      `<select id="filter-status">${statusOptions
        .map(([val, label]) => `<option value="${val}" ${this.filters.status === val ? 'selected' : ''}>${label}</option>`)
        .join('')}</select>`
    );
    statusFilter.querySelector('select')!.addEventListener('change', (e) => {
      this.filters.status = (e.target as HTMLSelectElement).value as OrderStatus | 'all';
      this.render();
    });

    const refOptions: [RefrigerationType | 'all', string][] = [
      ['all', '全部'],
      ['none', '常温'],
      ['chilled', '冷藏'],
      ['frozen', '冷冻']
    ];
    const refFilter = this.createFilterItem(
      '冷藏要求',
      `<select id="filter-ref">${refOptions
        .map(([val, label]) => `<option value="${val}" ${this.filters.refrigeration === val ? 'selected' : ''}>${label}</option>`)
        .join('')}</select>`
    );
    refFilter.querySelector('select')!.addEventListener('change', (e) => {
      this.filters.refrigeration = (e.target as HTMLSelectElement).value as RefrigerationType | 'all';
      this.render();
    });

    const clearBtn = this.createButton('清除筛选', 'btn-sm', () => {
      this.filters = {
        pickupDate: '',
        productType: 'all',
        checker: '',
        status: 'all',
        refrigeration: 'all'
      };
      this.render();
    });

    row.append(dateFilter, typeFilter, checkerFilter, statusFilter, refFilter, clearBtn);
    bar.appendChild(row);

    return bar;
  }

  private createFilterItem(label: string, innerHTML: string): HTMLElement {
    const item = document.createElement('div');
    item.className = 'filter-item';
    item.innerHTML = `<label>${label}</label>${innerHTML}`;
    return item;
  }

  private renderBatchBar(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'batch-bar';

    const count = this.selectedIds.size;
    const info = document.createElement('span');
    info.textContent = count > 0 ? `已选择 ${count} 个订单` : '点击表格复选框可批量操作';

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
        if (this.selectedIds.size === 0) {
          alert('请先选择订单');
          return;
        }
        const checker = prompt('请输入核对人姓名（可选）：') || undefined;
        orderStore.updateStatus(Array.from(this.selectedIds), status, checker);
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
    thead.innerHTML = `
      <tr>
        <th class="checkbox-cell">
          <input type="checkbox" id="select-all" ${this.isAllSelected() ? 'checked' : ''}>
        </th>
        <th>订单号</th>
        <th>取货日期</th>
        <th>客户</th>
        <th>产品清单</th>
        <th>装盒数量</th>
        <th>过敏提醒</th>
        <th>冷藏要求</th>
        <th>核对人</th>
        <th>状态</th>
        <th>操作</th>
      </tr>
    `;
    table.appendChild(thead);

    const selectAllCheckbox = thead.querySelector('#select-all') as HTMLInputElement;
    selectAllCheckbox.addEventListener('change', () => {
      if (selectAllCheckbox.checked) {
        this.filteredOrders.forEach((o) => this.selectedIds.add(o.id));
      } else {
        this.selectedIds.clear();
      }
      this.render();
    });

    const tbody = document.createElement('tbody');

    if (this.filteredOrders.length === 0) {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td colspan="11">
        <div class="empty-state">
          <div style="font-size: 48px;">📭</div>
          <p>暂无符合条件的订单</p>
        </div>
      </td>`;
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

    tr.innerHTML = `
      <td class="checkbox-cell">
        <input type="checkbox" class="row-checkbox" data-id="${order.id}" ${this.selectedIds.has(order.id) ? 'checked' : ''}>
      </td>
      <td><strong>${order.id}</strong></td>
      <td>${order.pickupDate}</td>
      <td>${order.customerName}</td>
      <td>
        <div class="product-list">
          ${order.products
            .map(
              (p) => `
            <div class="product-item">
              <span>${p.name}</span>
              <span>
                <span class="product-type-tag">${PRODUCT_TYPE_LABELS[p.type]}</span>
                <span>×${p.quantity}</span>
              </span>
            </div>
          `
            )
            .join('')}
          ${orderWarnings.length > 0 ? `
            <div class="warning-list">
              ${orderWarnings
                .map(
                  (w) => `
                <div class="warning-item ${w.severity}">
                  <span>${w.severity === 'error' ? '❌' : '⚠️'}</span>
                  <span>${w.message}</span>
                </div>
              `
                )
                .join('')}
            </div>
          ` : ''}
        </div>
      </td>
      <td><strong style="color: ${hasError ? '#ef4444' : '#374151'}">${order.boxQuantity}</strong></td>
      <td>
        ${
          order.allergyWarning
            ? `<span class="allergy-tag">${order.allergyWarning}</span>`
            : `<span class="allergy-empty">无</span>`
        }
      </td>
      <td><span class="refrigeration-tag refrigeration-${order.refrigeration}">${REFRIGERATION_LABELS[order.refrigeration]}</span></td>
      <td>${order.checker || '<span class="allergy-empty">未分配</span>'}</td>
      <td><span class="status-badge status-${order.status}">${STATUS_LABELS[order.status]}</span></td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-sm btn-edit" data-id="${order.id}">编辑</button>
          <button class="btn btn-sm btn-delete" data-id="${order.id}" style="color: #ef4444;">删除</button>
        </div>
      </td>
    `;

    const checkbox = tr.querySelector('.row-checkbox') as HTMLInputElement;
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) {
        this.selectedIds.add(order.id);
      } else {
        this.selectedIds.delete(order.id);
      }
      this.render();
    });

    const editBtn = tr.querySelector('.btn-edit') as HTMLButtonElement;
    editBtn.addEventListener('click', () => this.openOrderModal(order));

    const deleteBtn = tr.querySelector('.btn-delete') as HTMLButtonElement;
    deleteBtn.addEventListener('click', () => {
      if (confirm(`确定删除订单 ${order.id} 吗？`)) {
        orderStore.delete(order.id);
        this.selectedIds.delete(order.id);
      }
    });

    return tr;
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

    summary.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <strong style="color: #166534;">核对进度</strong>
        <span style="font-size: 14px; color: #166534;">${checked} / ${total} (${progress}%)</span>
      </div>
      <div style="height: 8px; background: #dcfce7; border-radius: 4px; overflow: hidden;">
        <div style="height: 100%; width: ${progress}%; background: #22c55e; border-radius: 4px; transition: width 0.3s;"></div>
      </div>
    `;
    container.appendChild(summary);

    return container;
  }

  private renderShippingSection(title: string, className: string, orders: Order[]): HTMLElement {
    const section = document.createElement('div');
    section.className = `shipping-section ${className}`;

    const h3 = document.createElement('h3');
    h3.innerHTML = `<span>${title}</span><span style="font-size: 13px; font-weight: normal;">(${orders.length} 单)</span>`;
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

      item.innerHTML = `
        <input type="checkbox" class="shipping-checkbox" data-id="${order.id}" ${isChecked ? 'checked' : ''}>
        <div class="shipping-content">
          <span class="step-number">${index + 1}</span>
          <strong>${order.id}</strong> - ${order.customerName}
          <span style="margin-left: 8px;" class="status-badge status-${order.status}">${STATUS_LABELS[order.status]}</span>
          <p>
            📅 取货：${order.pickupDate}
            &nbsp;|&nbsp;
            📦 ${order.boxQuantity} 盒
            &nbsp;|&nbsp;
            👤 ${order.checker || '未分配'}
          </p>
          <p style="color: #4b5563;">
            🧁 ${order.products.map((p) => `${p.name}×${p.quantity}`).join('，')}
          </p>
          ${
            order.allergyWarning
              ? `<p style="color: #dc2626;">⚠️ 过敏提醒：${order.allergyWarning}</p>`
              : ''
          }
          <p>
            <span class="refrigeration-tag refrigeration-${order.refrigeration}">${REFRIGERATION_LABELS[order.refrigeration]}</span>
          </p>
          ${
            orderWarnings.length > 0
              ? `<div style="margin-top: 8px; padding: 8px; background: #fef2f2; border-radius: 4px; font-size: 12px; color: #dc2626;">
                   ${orderWarnings.map((w) => `<div>${w.severity === 'error' ? '❌' : '⚠️'} ${w.message}</div>`).join('')}
                 </div>`
              : ''
          }
          <div style="margin-top: 8px; display: flex; gap: 6px;">
            <button class="btn btn-sm btn-success" data-action="ship" data-id="${order.id}">✓ 标记可出货</button>
            <button class="btn btn-sm btn-danger" data-action="hold" data-id="${order.id}">⏸ 异常暂缓</button>
            <button class="btn btn-sm" data-action="edit" data-id="${order.id}">编辑</button>
          </div>
        </div>
      `;

      const checkbox = item.querySelector('.shipping-checkbox') as HTMLInputElement;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          this.shippingChecked.add(order.id);
        } else {
          this.shippingChecked.delete(order.id);
        }
        this.render();
      });

      const actionButtons = item.querySelectorAll('[data-action]');
      actionButtons.forEach((btn) => {
        btn.addEventListener('click', () => {
          const action = (btn as HTMLElement).dataset.action;
          const id = (btn as HTMLElement).dataset.id!;
          if (action === 'ship') {
            const checker = prompt('请输入核对人姓名：', order.checker) || order.checker;
            orderStore.updateStatus([id], 'ready_ship', checker);
          } else if (action === 'hold') {
            const reason = prompt('请输入异常原因：');
            if (reason !== null) {
              orderStore.updateStatus([id], 'on_hold', order.checker);
            }
          } else if (action === 'edit') {
            this.openOrderModal(order);
          }
        });
      });

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
    body.innerHTML = `
      <form id="order-form">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label>取货日期 *</label>
            <input type="date" name="pickupDate" required value="${this.editingOrder?.pickupDate || new Date().toISOString().slice(0, 10)}">
          </div>
          <div class="form-group">
            <label>客户简称 *</label>
            <input type="text" name="customerName" required value="${this.editingOrder?.customerName || ''}" placeholder="如：张先生">
          </div>
        </div>

        <div class="form-group">
          <label>产品清单 *</label>
          <div id="product-list-container"></div>
          <button type="button" class="btn btn-sm" id="add-product-btn" style="margin-top: 8px;">+ 添加产品</button>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label>装盒数量 *</label>
            <input type="number" name="boxQuantity" min="1" required value="${this.editingOrder?.boxQuantity || 1}">
          </div>
          <div class="form-group">
            <label>冷藏要求</label>
            <select name="refrigeration">
              <option value="none" ${(!this.editingOrder || this.editingOrder.refrigeration === 'none') ? 'selected' : ''}>常温</option>
              <option value="chilled" ${this.editingOrder?.refrigeration === 'chilled' ? 'selected' : ''}>冷藏</option>
              <option value="frozen" ${this.editingOrder?.refrigeration === 'frozen' ? 'selected' : ''}>冷冻</option>
            </select>
          </div>
        </div>

        <div class="form-group">
          <label>过敏提醒</label>
          <input type="text" name="allergyWarning" value="${this.editingOrder?.allergyWarning || ''}" placeholder="如：坚果过敏、乳糖不耐受">
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
          <div class="form-group">
            <label>核对人</label>
            <input type="text" name="checker" value="${this.editingOrder?.checker || ''}" placeholder="如：小李">
          </div>
          <div class="form-group">
            <label>状态</label>
            <select name="status">
              <option value="pending_pack" ${(!this.editingOrder || this.editingOrder.status === 'pending_pack') ? 'selected' : ''}>待装盒</option>
              <option value="pending_review" ${this.editingOrder?.status === 'pending_review' ? 'selected' : ''}>待复核</option>
              <option value="ready_ship" ${this.editingOrder?.status === 'ready_ship' ? 'selected' : ''}>可出货</option>
              <option value="on_hold" ${this.editingOrder?.status === 'on_hold' ? 'selected' : ''}>异常暂缓</option>
            </select>
          </div>
        </div>
      </form>
    `;

    const footer = document.createElement('div');
    footer.className = 'modal-footer';

    const cancelBtn = this.createButton('取消', '', () => {
      this.editingOrder = null;
      overlay.remove();
    });

    const saveBtn = this.createButton('保存', 'btn-primary', () => {
      this.handleSaveOrder(overlay);
    });

    footer.append(cancelBtn, saveBtn);

    modal.append(header, body, footer);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const productContainer = body.querySelector('#product-list-container')!;
    const addProductBtn = body.querySelector('#add-product-btn')!;

    const initialProducts = this.editingOrder?.products || [
      { name: '', type: 'cake' as ProductType, quantity: 1 }
    ];

    initialProducts.forEach((p) => {
      productContainer.appendChild(this.createProductRow(p));
    });

    addProductBtn.addEventListener('click', () => {
      productContainer.appendChild(
        this.createProductRow({ name: '', type: 'cake', quantity: 1 })
      );
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) {
        this.editingOrder = null;
        overlay.remove();
      }
    });
  }

  private createProductRow(product?: ProductItem): HTMLElement {
    const row = document.createElement('div');
    row.className = 'product-form-row';

    row.innerHTML = `
      <div class="form-group" style="margin-bottom: 0;">
        <input type="text" name="productName" placeholder="产品名称" value="${product?.name || ''}">
      </div>
      <div class="form-group" style="margin-bottom: 0;">
        <select name="productType">
          <option value="cake" ${product?.type === 'cake' ? 'selected' : ''}>蛋糕</option>
          <option value="cookie" ${product?.type === 'cookie' ? 'selected' : ''}>饼干</option>
          <option value="giftbox" ${product?.type === 'giftbox' ? 'selected' : ''}>礼盒</option>
        </select>
      </div>
      <div class="form-group" style="margin-bottom: 0;">
        <input type="number" name="productQty" min="1" value="${product?.quantity || 1}">
      </div>
      <button type="button" class="btn btn-sm btn-remove-product" style="margin-bottom: 0;">删除</button>
    `;

    const removeBtn = row.querySelector('.btn-remove-product')!;
    removeBtn.addEventListener('click', () => {
      const container = document.getElementById('product-list-container');
      if (container && container.children.length > 1) {
        row.remove();
      } else {
        alert('至少保留一个产品');
      }
    });

    return row;
  }

  private handleSaveOrder(overlay: HTMLElement): void {
    const form = document.getElementById('order-form') as HTMLFormElement;
    const formData = new FormData(form);

    const productRows = document.querySelectorAll('.product-form-row');
    const products: ProductItem[] = [];

    productRows.forEach((row) => {
      const nameInput = row.querySelector('[name="productName"]') as HTMLInputElement;
      const typeSelect = row.querySelector('[name="productType"]') as HTMLSelectElement;
      const qtyInput = row.querySelector('[name="productQty"]') as HTMLInputElement;

      const name = nameInput.value.trim();
      const type = typeSelect.value as ProductType;
      const quantity = parseInt(qtyInput.value, 10) || 0;

      if (name && quantity > 0) {
        products.push({ name, type, quantity });
      }
    });

    if (products.length === 0) {
      alert('请至少添加一个产品');
      return;
    }

    const orderData = {
      pickupDate: formData.get('pickupDate') as string,
      customerName: (formData.get('customerName') as string).trim(),
      products,
      boxQuantity: parseInt(formData.get('boxQuantity') as string, 10) || 1,
      allergyWarning: (formData.get('allergyWarning') as string).trim(),
      refrigeration: formData.get('refrigeration') as RefrigerationType,
      checker: (formData.get('checker') as string).trim(),
      status: formData.get('status') as OrderStatus
    };

    if (!orderData.pickupDate || !orderData.customerName) {
      alert('请填写必填项');
      return;
    }

    if (this.editingOrder) {
      orderStore.update(this.editingOrder.id, orderData);
    } else {
      orderStore.add(orderData);
    }

    this.editingOrder = null;
    overlay.remove();
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

import { fetchConfig } from '@theme/utilities';

const messages = {
  invalid: 'ไม่พบแพ็กเกจที่เลือก',
  configuration: 'แพ็กเกจนี้ยังไม่มีสินค้าที่สามารถเลือกได้ กรุณาติดต่อร้านค้า',
  failure: 'เกิดข้อผิดพลาดในการเพิ่มสินค้า กรุณาลองใหม่อีกครั้ง',
};

function sortChildren(container, selector) {
  [...container.querySelectorAll(selector)]
    .sort((a, b) => Number(a.dataset.order) - Number(b.dataset.order))
    .forEach((child) => container.append(child));
}

export function selectionCount(step) {
  return step.options.reduce((sum, option) => sum + option.quantity, 0);
}

export function canAdjust(step, option, delta) {
  const next = option.quantity + delta;
  return !option.ineligible && Number.isSafeInteger(next) && next >= 0
    && Number.isSafeInteger(step.max) && selectionCount(step) + delta <= step.max;
}

/** Limits apply to total units in a step, including repeated units of a variant. */
export function validSteps(steps) {
  return steps.length > 0 && new Set(steps.map((step) => step.key)).size === steps.length && steps.every((step) => {
    const selected = step.options.filter((option) => option.quantity > 0);
    const count = selectionCount(step);
    return Boolean(step.key && step.plan) && Number.isSafeInteger(step.min) && Number.isSafeInteger(step.max)
      && step.min >= 0 && step.max >= step.min && !step.incomplete
      && step.options.every((option) => Number.isSafeInteger(option.quantity) && option.quantity >= 0)
      && count >= step.min && count <= step.max
      && selected.every((option) => !option.ineligible && /^\d+$/.test(option.variant) && /^\d+$/.test(option.sellingPlan));
  });
}

export function buildItems(steps, packageKey, group) {
  if (!validSteps(steps)) throw new Error('Invalid subscription selection');
  const items = steps.flatMap((step) => step.options.filter((option) => option.quantity > 0).map((option) => ({
    id: option.variant,
    quantity: option.quantity,
    selling_plan: option.sellingPlan,
    properties: {
      _subscription_package: packageKey,
      _subscription_step: step.key,
      _subscription_group: group,
    },
  })));
  if (!items.length) throw new Error('Empty subscription selection');
  return items;
}

class SubscriptionPackageList extends HTMLElement {
  connectedCallback() {
    sortChildren(this, '[data-order]');
    if (!this.querySelector('[data-order]')) this.textContent = 'ยังไม่มีแพ็กเกจที่เปิดให้เลือก';
  }
}

export class SubscriptionBuilder extends HTMLElement {
  connectedCallback() {
    if (this.initialized) return;
    this.initialized = true;
    this.error = this.querySelector('[data-error]');
    this.packageKey = new URLSearchParams(window.location.search).get('package');
    const templates = [...this.querySelectorAll('template[data-package]')].filter((template) => template.dataset.package === this.packageKey);
    if (!this.packageKey || templates.length !== 1) {
      this.error.textContent = messages.invalid;
      return;
    }
    this.querySelector('[data-content]').append(templates[0].content.cloneNode(true));
    sortChildren(this.querySelector('[data-steps]'), '[data-step]');
    this.button = this.querySelector('[data-checkout]');
    this.addEventListener('click', (event) => this.adjust(event));
    this.addEventListener('input', (event) => this.search(event));
    this.button.addEventListener('click', () => this.submit());
    this.update();
  }

  readSteps() {
    return [...this.querySelectorAll('[data-step]')].map((element) => ({
      element,
      key: element.dataset.step,
      plan: element.dataset.plan,
      min: element.dataset.min === '' ? NaN : Number(element.dataset.min),
      max: element.dataset.max === '' ? NaN : Number(element.dataset.max),
      incomplete: Boolean(element.querySelector('[data-incomplete]')),
      options: [...element.querySelectorAll('[data-variant]')].map((input) => ({
        input, quantity: Number(input.dataset.quantity), ineligible: input.hasAttribute('data-ineligible'),
        variant: input.dataset.variant, sellingPlan: input.dataset.sellingPlan, title: input.dataset.title,
        image: input.dataset.image, price: input.dataset.price,
      })),
    }));
  }

  search(event) {
    if (!event.target.matches('[data-search]')) return;
    const step = event.target.closest('[data-step]');
    const query = event.target.value.normalize('NFKC').toLocaleLowerCase().trim();
    const cards = [...step.querySelectorAll('[data-product]')];
    for (const card of cards) {
      card.hidden = !card.dataset.searchText.normalize('NFKC').toLocaleLowerCase().includes(query);
    }
    step.querySelector('[data-search-empty]').hidden = !cards.length || cards.some((card) => !card.hidden);
  }

  adjust(event) {
    const button = event.target.closest('button');
    if (this.busy || !button || !this.contains(button) || button.disabled) return;
    const steps = this.readSteps();
    if (button.hasAttribute('data-clear')) {
      for (const step of steps) for (const option of step.options) option.input.dataset.quantity = '0';
    } else {
      if (!button.hasAttribute('data-adjust') && !button.hasAttribute('data-remove')) return;
      const row = button.closest('[data-summary-row]');
      const source = button.closest('[data-variant]');
      const step = steps.find((step) => row ? step.key === row.dataset.stepKey : step.element.contains(source));
      const option = step?.options.find((option) => row ? option.variant === row.dataset.variantId : option.input === source);
      if (!option) return;
      const delta = button.hasAttribute('data-remove') ? -option.quantity : Number(button.dataset.adjust);
      if (!canAdjust(step, option, delta)) return;
      option.input.dataset.quantity = String(option.quantity + delta);
    }
    this.error.textContent = '';
    this.update();
  }

  update() {
    const steps = this.readSteps();
    const count = steps.reduce((sum, step) => sum + selectionCount(step), 0);
    const required = steps.reduce((sum, step) => sum + (Number.isFinite(step.min) ? step.min : 0), 0);
    const valid = validSteps(steps) && count > 0;
    this.button.disabled = this.busy || !valid;
    this.button.textContent = this.busy ? 'กำลังเพิ่มสินค้า…' : valid ? 'ไปชำระเงิน' : `เลือกสินค้าให้ครบตามขั้นตอน (ขั้นต่ำ ${required} ชิ้น)`;
    this.querySelector('[data-progress]').textContent = `เลือกแล้ว ${count} / ${required} ชิ้นขั้นต่ำ`;
    const progress = this.querySelector('[data-progress-bar]');
    progress.max = Math.max(required, 1);
    progress.value = steps.reduce((sum, step) => sum + Math.min(selectionCount(step), Number.isFinite(step.min) ? step.min : 0), 0);
    this.querySelector('[data-clear]').disabled = this.busy || count === 0;
    this.querySelector('[data-summary-empty]').hidden = count > 0;
    const summary = this.querySelector('[data-summary]');
    // Preserve keyboard focus when quantity controls in the summary are rebuilt.
    const focused = document.activeElement;
    const focusedRow = focused?.closest('[data-summary-row]');
    const focusIndex = focusedRow && summary.contains(focusedRow) ? [...summary.children].indexOf(focusedRow) : -1;
    const focusAction = focused?.hasAttribute('data-remove') ? '[data-remove]' : `[data-adjust="${focused?.dataset.adjust}"]`;
    const focusKey = focusedRow ? [focusedRow.dataset.stepKey, focusedRow.dataset.variantId] : null;
    summary.replaceChildren();
    for (const step of steps) {
      const count = selectionCount(step);
      step.element.querySelector('[data-step-progress]').textContent = `(เลือกแล้ว ${count})`;
      const unavailable = step.incomplete || (step.min > 0 && !step.options.some((option) => !option.ineligible));
      step.element.querySelector('[data-step-error]').textContent = unavailable ? messages.configuration : '';
      for (const option of step.options) {
        const selected = option.quantity > 0;
        option.input.querySelector('[data-quantity-label]').textContent = option.quantity;
        const badge = option.input.querySelector('[data-selected-badge]');
        badge.hidden = !selected;
        badge.textContent = `×${option.quantity}`;
        for (const control of option.input.querySelectorAll('[data-adjust]')) {
          control.disabled = this.busy || !canAdjust(step, option, Number(control.dataset.adjust));
        }
        if (selected) this.addSummaryRow(summary, step, option);
      }
      for (const card of step.element.querySelectorAll('[data-product]')) {
        card.toggleAttribute('data-selected', [...card.querySelectorAll('[data-variant]')].some((input) => Number(input.dataset.quantity) > 0));
      }
    }
    if (focusIndex >= 0) {
      const row = [...summary.children].find((row) => row.dataset.stepKey === focusKey[0] && row.dataset.variantId === focusKey[1]);
      const candidate = row?.querySelector(focusAction);
      const fallbackRow = summary.children[Math.min(focusIndex, summary.children.length - 1)];
      const target = candidate && !candidate.disabled ? candidate : fallbackRow?.querySelector('button:not(:disabled)');
      (target || this.querySelector('[data-search]'))?.focus();
    }
    if (!steps.length) this.error.textContent = messages.configuration;
  }

  addSummaryRow(summary, step, option) {
    const item = document.createElement('li');
    item.dataset.summaryRow = '';
    item.dataset.stepKey = step.key;
    item.dataset.variantId = option.variant;
    if (option.image) {
      const image = document.createElement('img');
      image.src = option.image;
      image.alt = option.title;
      image.width = 64;
      image.height = 64;
      item.append(image);
    }
    const description = document.createElement('p');
    description.textContent = `${step.element.querySelector('legend').textContent}: ${option.title}${option.price ? ` · ${option.price} / ชิ้น` : ''}`;
    item.append(description);
    const controls = document.createElement('div');
    controls.className = 'subscription-quantity';
    for (const delta of [-1, 1]) {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'button-secondary';
      button.dataset.adjust = String(delta);
      button.textContent = delta < 0 ? '−' : '+';
      button.setAttribute('aria-label', `${delta < 0 ? 'ลด' : 'เพิ่ม'}จำนวน ${option.title}`);
      button.disabled = this.busy || !canAdjust(step, option, delta);
      if (delta === 1) {
        const quantity = document.createElement('span');
        quantity.textContent = option.quantity;
        controls.append(quantity);
      }
      controls.append(button);
    }
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'button-secondary';
    remove.dataset.remove = '';
    remove.textContent = 'ลบ';
    remove.setAttribute('aria-label', `ลบ ${option.title}`);
    remove.disabled = this.busy;
    controls.append(remove);
    item.append(controls);
    summary.append(item);
  }

  async submit() {
    if (this.busy) return;
    const steps = this.readSteps();
    if (!validSteps(steps) || !steps.some((step) => step.options.some((option) => option.quantity > 0))) {
      this.update();
      return;
    }
    this.busy = true;
    this.error.textContent = '';
    this.update();
    try {
      const uuid = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const items = buildItems(steps, this.packageKey, `${this.packageKey}-${uuid}`);
      const root = this.dataset.root || '/';
      const response = await fetch(`${root}cart/add.js`, {
        ...fetchConfig('json', { body: JSON.stringify({ items }) }),
      });
      const result = await response.json();
      if (!response.ok || result.status || !Array.isArray(result.items) || result.items.length !== items.length) {
        throw new Error('Cart rejected the subscription package');
      }
      window.location.assign(`${root}checkout`);
    } catch (error) {
      this.busy = false;
      this.update();
      this.error.textContent = messages.failure;
      this.error.focus();
      if (window.Shopify?.designMode) console.error('[subscription-builder]', error);
    }
  }
}

if (!customElements.get('subscription-package-list')) customElements.define('subscription-package-list', SubscriptionPackageList);
if (!customElements.get('subscription-builder')) customElements.define('subscription-builder', SubscriptionBuilder);

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

/** All rules and plan IDs originate in Liquid, including variant eligibility. */
export function validSteps(steps) {
  return steps.length > 0 && new Set(steps.map((step) => step.key)).size === steps.length && steps.every((step) => {
    const selected = step.options.filter((option) => option.checked);
    return Boolean(step.key && step.plan) && Number.isInteger(step.min) && Number.isInteger(step.max)
      && step.min >= 0 && step.max >= step.min && !step.incomplete
      && step.options.filter((option) => !option.ineligible).length >= step.min
      && selected.length >= step.min && selected.length <= step.max
      && selected.every((option) => !option.ineligible && /^\d+$/.test(option.variant) && /^\d+$/.test(option.sellingPlan));
  });
}

export function buildItems(steps, packageKey, group) {
  if (!validSteps(steps)) throw new Error('Invalid subscription selection');
  const items = steps.flatMap((step) => step.options.filter((option) => option.checked).map((option) => ({
    id: option.variant,
    quantity: 1,
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
    this.addEventListener('change', (event) => this.change(event));
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
        input, checked: input.checked, ineligible: input.hasAttribute('data-ineligible'),
        variant: input.dataset.variant, sellingPlan: input.dataset.sellingPlan, title: input.dataset.title,
      })),
    }));
  }

  change(event) {
    const input = event.target;
    if (!input.matches('[data-variant]')) return;
    const step = this.readSteps().find((item) => item.element.contains(input));
    if (this.busy || input.hasAttribute('data-ineligible')) input.checked = false;
    if (input.checked && step.options.filter((item) => item.checked).length > step.max) {
      if (step.max === 1) step.options.forEach((item) => { if (item.input !== input) item.input.checked = false; });
      else input.checked = false;
    }
    this.error.textContent = '';
    this.update();
  }

  update() {
    const steps = this.readSteps();
    const selected = steps.flatMap((step) => step.options.filter((option) => option.checked));
    const required = steps.reduce((sum, step) => sum + (Number.isFinite(step.min) ? step.min : 0), 0);
    const valid = validSteps(steps) && selected.length > 0;
    this.button.disabled = this.busy || !valid;
    this.button.textContent = this.busy ? 'กำลังเพิ่มสินค้า…' : valid ? 'ไปชำระเงิน' : `เลือกสินค้าให้ครบตามขั้นตอน (ขั้นต่ำ ${required} ชิ้น)`;
    this.querySelector('[data-progress]').textContent = `เลือกแล้ว ${selected.length} / ${required} ชิ้นขั้นต่ำ`;
    const summary = this.querySelector('[data-summary]');
    summary.replaceChildren();
    for (const step of steps) {
      const count = step.options.filter((option) => option.checked).length;
      step.element.querySelector('[data-step-progress]').textContent = `(เลือกแล้ว ${count})`;
      const unavailable = step.incomplete || !step.options.some((option) => !option.ineligible)
        || step.options.filter((option) => !option.ineligible).length < step.min;
      step.element.querySelector('[data-step-error]').textContent = unavailable ? messages.configuration : '';
      for (const option of step.options) {
        // For single-choice steps retain the ability to switch directly to another variant.
        option.input.disabled = this.busy || option.ineligible || (!option.checked && count >= step.max && step.max !== 1);
        if (option.checked) {
          const item = document.createElement('li');
          item.textContent = `${step.element.querySelector('legend').textContent}: ${option.title}`;
          summary.append(item);
        }
      }
    }
    if (!steps.length) this.error.textContent = messages.configuration;
  }

  async submit() {
    if (this.busy) return;
    const steps = this.readSteps();
    if (!validSteps(steps) || !steps.some((step) => step.options.some((option) => option.checked))) {
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

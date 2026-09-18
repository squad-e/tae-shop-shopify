import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('../assets/subscription-builder.js', import.meta.url), 'utf8'))
  .replace("import { fetchConfig } from '@theme/utilities';", '')
  .replaceAll('export ', '');
const context = vm.createContext({
  HTMLElement: class {}, customElements: { get: () => true },
  fetchConfig: (_, config) => ({ method: 'POST', ...config }),
  URLSearchParams, console, Math, Date,
  window: { location: { assign() {} } },
});
vm.runInContext(`${source}\nglobalThis.api = { validSteps, buildItems, SubscriptionBuilder, canAdjust };`, context);
const { validSteps, buildItems, SubscriptionBuilder, canAdjust } = context.api;
const option = (id, plan, checked = true) => ({ variant: String(id), sellingPlan: String(plan), quantity: checked ? 1 : 0, ineligible: false });
const step = (key, options, min = 1, max = 1) => ({ key, plan: 'Configured plan', min, max, options });

test('one-step and future mixed-plan packages generate complete grouped payloads', () => {
  for (const count of [1, 2, 3]) {
    const steps = Array.from({ length: count }, (_, i) => step(`step-${i}`, [option(i + 1, i + 100)]));
    const items = buildItems(steps, 'cms-package', 'shared-group');
    assert.equal(items.length, count);
    items.forEach((item, i) => {
      assert.equal(item.selling_plan, String(i + 100));
      assert.equal(item.quantity, 1);
      assert.equal(item.properties._subscription_group, 'shared-group');
      assert.equal(item.properties._subscription_step, `step-${i}`);
    });
  }
});

test('incomplete, excessive, missing-plan, unavailable and invalid CMS selections fail closed', () => {
  const cases = [
    [], [step('a', [])], [step('a', [option(1, 2)]), step('b', [option(2, 3, false)])],
    [step('a', [option(1, 2), option(2, 2)])],
    [step('a', [option(1, '')])],
    [step('a', [{ ...option(1, 2), ineligible: true }])],
    [step('a', [option(1, 2)], NaN)],
    [step('a', [option(1, 2)], 2, 1)],
    [step('a', [option(1, 2)]), step('a', [option(1, 2)])],
    [{ ...step('a', [option(1, 2)]), incomplete: true }],
  ];
  for (const steps of cases) {
    assert.equal(validSteps(steps), false);
    assert.throws(() => buildItems(steps, 'package', 'group'));
  }
});

test('min/max are CMS driven and optional steps do not require selections', () => {
  assert.equal(validSteps([step('a', [option(1, 2), option(2, 2)], 2, 3), step('b', [], 0, 1)]), true);
  assert.throws(() => buildItems([step('a', [], 0, 1)], 'package', 'group'));
});

function builder(steps) {
  const instance = Object.create(SubscriptionBuilder.prototype);
  Object.assign(instance, { readSteps: () => steps, update() {}, error: { textContent: '', focus() {} }, dataset: { root: '/th/' }, packageKey: 'test' });
  return instance;
}

test('submission makes one request, locks duplicate clicks and redirects only after success', async () => {
  let requests = 0;
  let release;
  let redirected = '';
  context.window.location.assign = (url) => { redirected = url; };
  context.fetch = async (url, config) => {
    requests++;
    assert.equal(url, '/th/cart/add.js');
    const body = JSON.parse(config.body);
    assert.equal(body.items.length, 2);
    assert.equal(body.items[0].properties._subscription_group, body.items[1].properties._subscription_group);
    await new Promise((resolve) => { release = resolve; });
    return { ok: true, json: async () => ({ items: body.items }) };
  };
  const instance = builder([step('a', [option(1, 10)]), step('b', [option(2, 20)])]);
  const pending = instance.submit();
  await instance.submit();
  assert.equal(requests, 1);
  assert.equal(redirected, '');
  release();
  await pending;
  assert.equal(redirected, '/th/checkout');
});

test('network and cart failures restore state without redirecting', async () => {
  for (const fail of ['network', 'cart', 'invalid-json']) {
    let redirected = false;
    context.window.location.assign = () => { redirected = true; };
    context.fetch = async () => {
      if (fail === 'network') throw new Error('Offline');
      return { ok: false, json: async () => { if (fail === 'invalid-json') throw new Error('Invalid JSON'); return { status: 422 }; } };
    };
    const instance = builder([step('a', [option(1, 2)])]);
    await instance.submit();
    assert.equal(redirected, false);
    assert.equal(instance.busy, false);
    assert.ok(instance.error.textContent);
  }
});

test('incomplete submissions never contact cart', async () => {
  context.fetch = () => { assert.fail('Should not submit'); };
  await builder([step('a', [])]).submit();
});


test('repeated units count toward limits and retain per-step plans in one payload', () => {
  const diffuser = { ...option(1, 10), quantity: 2 };
  const steps = [step('diffuser', [diffuser, option(3, 10, false)], 2, 2), step('perfume', [option(2, 20)], 1, 1)];
  assert.equal(validSteps(steps), true);
  const items = buildItems(steps, 'package', 'group');
  assert.equal(items.length, 2);
  assert.equal(items[0].quantity, 2);
  assert.equal(items[1].selling_plan, '20');
  assert.equal(canAdjust(steps[0], steps[0].options[1], 1), false);
  assert.equal(canAdjust(steps[0], diffuser, -1), true);
  diffuser.quantity = 1;
  assert.equal(validSteps(steps), false);
  assert.equal(canAdjust(steps[0], steps[0].options[1], 1), true);
});

test('negative, fractional, non-finite and over-limit quantities cannot submit', () => {
  for (const quantity of [-1, 0.5, NaN, Infinity, 3]) {
    assert.equal(validSteps([step('a', [{ ...option(1, 10), quantity }], 1, 2)]), false);
  }
  const empty = option(1, 10, false);
  assert.equal(canAdjust(step('a', [empty]), empty, -1), false);
});

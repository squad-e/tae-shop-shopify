# Shopify Subscription Custom Builder — Codex Implementation Spec

> Implementation update: use Shopify’s native Active/Draft status (enable the publishable capability) instead of the custom `active` Boolean, and `package.system.handle` instead of the custom `package_key` field. This supersedes those fields and their lookup examples below. The `package` query parameter and `_subscription_package` property now contain the native Handle. See `subscription-builder-setup.md` for current setup instructions.

## 1. Objective

Implement a **custom subscription package builder inside the existing Shopify custom theme** for JOURNAL.

The implementation must work with:

- **Shopify Grow**
- **Appstle Subscriptions** for Selling Plans / subscription billing / delivery schedules
- **Shopify Metaobjects** as CMS configuration
- **Shopify Collections** as product sources for each selection step
- **Public checkout validation app** as the final checkout guard

The custom theme is responsible for:

1. Showing available subscription packages
2. Reading package/step configuration from Shopify Metaobjects
3. Rendering one or more product-selection steps
4. Preventing the customer from continuing until every required step is complete
5. Resolving the correct Shopify Selling Plan for each selected variant
6. Adding all selected subscription items to cart in **one `/cart/add.js` request**
7. Redirecting the customer to checkout after successful add-to-cart
8. Optionally improving cart UX for package items

The custom theme is **not** the final security layer.  
A public Shopify validation app will block checkout if the customer tampers with cart contents.

---

# 2. High-Level Architecture

```text
Shopify Metaobjects
        │
        ├── subscription_package
        │
        └── subscription_step
        │
        ▼
Shopify Custom Theme
        │
        ├── Package Landing
        └── Subscription Builder
                │
                ▼
Shopify Collections
(product source per step)
                │
                ▼
Appstle Selling Plans
                │
                ▼
POST /cart/add.js
(all selected products in one request)
                │
                ▼
Checkout
                │
                ▼
Public Validation App
(final server-side enforcement)
```

---

# 3. Important Business Rules

## Package example: 6 Months

Customer must select:

```text
Step 1
Home Fragrance Diffuser
Min: 1
Max: 1
```

Result:

```text
1 selected item
+
6M Appstle Selling Plan
```

---

## Package example: 12 Months

Customer must select:

```text
Step 1
Home Fragrance Diffuser
Min: 1
Max: 1

Step 2
Body Lotion 250 ML
Min: 1
Max: 1
```

Customer must complete **both steps** before checkout is enabled.

Result:

```text
Diffuser × 1
+
Body Lotion × 1
+
12M Appstle Selling Plan
```

The two selected products may use:

- the same Selling Plan, or
- different Selling Plans

Therefore, Selling Plan configuration belongs at **step level**, not package level only.

---

# 4. Shopify Metaobject Definitions

Create these two Metaobject definitions in Shopify Admin.

---

## 4.1 `subscription_package`

Definition name:

```text
Subscription Package
```

Type:

```text
subscription_package
```

Recommended fields:

| Label | Key | Type | Required | Example |
|---|---|---|---:|---|
| Package name | `name` | Single line text | Yes | `6 MONTHS` |
| Package key | `package_key` | Single line text | Yes | `journal-6m` |
| Badge | `badge` | Single line text | No | `แนะนำ` |
| Image | `image` | File / Image | No | package artwork |
| Duration months | `duration_months` | Integer | Yes | `6` |
| Delivery interval | `delivery_interval` | Integer | No | `2` |
| Delivery count | `delivery_count` | Integer | No | `3` |
| Display price | `display_price` | Decimal | No | `2790` |
| Compare price | `compare_price` | Decimal | No | `3300` |
| Discount text | `discount_text` | Single line text | No | `ประหยัด 15%` |
| Description | `description` | Rich text | No | package details |
| Steps | `steps` | List of Metaobject references → `subscription_step` | Yes | 1–N steps |
| Active | `active` | Boolean | Yes | `true` |
| Sort order | `sort_order` | Integer | No | `1` |

### Important

`display_price` is **display-only**.

Do **not** assume this field controls Shopify checkout pricing.

Actual checkout pricing still comes from Shopify / Appstle Selling Plan pricing.

---

## 4.2 `subscription_step`

Definition name:

```text
Subscription Step
```

Type:

```text
subscription_step
```

Recommended fields:

| Label | Key | Type | Required | Example |
|---|---|---|---:|---|
| Step name | `name` | Single line text | Yes | `Home Fragrance Diffuser` |
| Step key | `key` | Single line text | Yes | `diffuser` |
| Description | `description` | Single line / Rich text | No | `เลือกได้ 1 รายการ` |
| Product collection | `collection` | Collection reference | Yes | Diffuser collection |
| Minimum selection | `min_select` | Integer | Yes | `1` |
| Maximum selection | `max_select` | Integer | Yes | `1` |
| Selling plan name | `selling_plan_name` | Single line text | Yes | `JOURNAL 12 Months - Every 2 Months` |
| Sort order | `sort_order` | Integer | No | `1` |

---

# 5. Example CMS Entries

## 5.1 6M Step

Entry:

```text
Handle:
step-diffuser-6m

Name:
Home Fragrance Diffuser

Key:
diffuser

Collection:
JOURNAL Subscription - Diffuser

Min:
1

Max:
1

Selling Plan Name:
JOURNAL 6 Months - Every 2 Months

Sort Order:
1
```

---

## 5.2 12M Step 1

Entry:

```text
Handle:
step-diffuser-12m

Name:
Home Fragrance Diffuser

Key:
diffuser

Collection:
JOURNAL Subscription - Diffuser

Min:
1

Max:
1

Selling Plan Name:
JOURNAL 12 Months - Every 2 Months

Sort Order:
1
```

---

## 5.3 12M Step 2

Entry:

```text
Handle:
step-body-lotion-12m

Name:
Body Lotion 250 ML

Key:
body-lotion

Collection:
JOURNAL Subscription - Body Lotion

Min:
1

Max:
1

Selling Plan Name:
JOURNAL 12 Months - Every 2 Months

Sort Order:
2
```

---

## 5.4 6M Package

```text
Name:
6 MONTHS

Package Key:
journal-6m

Badge:
แนะนำ

Duration:
6

Delivery Interval:
2

Delivery Count:
3

Display Price:
2790

Compare Price:
3300

Discount Text:
ประหยัด 15%

Steps:
- step-diffuser-6m

Active:
true

Sort Order:
1
```

---

## 5.5 12M Package

```text
Name:
1 YEAR

Package Key:
journal-12m

Badge:
คุ้มที่สุด

Duration:
12

Delivery Interval:
2

Delivery Count:
6

Display Price:
4990

Compare Price:
6250

Discount Text:
ประหยัด 20%

Steps:
- step-diffuser-12m
- step-body-lotion-12m

Active:
true

Sort Order:
2
```

---

# 6. Shopify Collections

Use Shopify Collections as the source of products per step.

Example collections:

```text
JOURNAL Subscription - Diffuser
```

Contains:

```text
LOM ARUN
LOM OON LANNA
LOM NAO
LOM TALAY
```

And:

```text
JOURNAL Subscription - Body Lotion
```

Contains:

```text
CHARM
NANG RAM
...
```

These collections are reused by:

- Appstle Subscription product assignment
- Custom Builder product rendering
- Public validation rules

---

# 7. Appstle Selling Plan Assumptions

Appstle remains responsible for:

- Billing model
- Prepaid / recurring behavior
- Delivery frequency
- Delivery count
- Selling Plan creation
- Subscription pricing / discount behavior

Example Appstle configuration:

## 6M

```text
Plan name:
JOURNAL Package 6M

Frequency name:
JOURNAL 6 Months - Every 2 Months
```

Eligible products:

```text
JOURNAL Subscription - Diffuser
```

---

## 12M

```text
Plan name:
JOURNAL Package 12M

Frequency name:
JOURNAL 12 Months - Every 2 Months
```

Eligible products:

```text
JOURNAL Subscription - Diffuser
JOURNAL Subscription - Body Lotion
```

### Important

The value stored in:

```text
subscription_step.selling_plan_name
```

must match Appstle's **Frequency name** / Shopify `selling_plan.name`.

Do not rely on Appstle's internal `Plan name`.

---

# 8. Theme Implementation Scope

Recommended files.

The exact naming may be adapted to the existing theme convention.

```text
sections/
  subscription-package-list.liquid
  subscription-builder.liquid

snippets/
  subscription-package-card.liquid
  subscription-product-card.liquid
  subscription-builder-step.liquid

assets/
  subscription-builder.js
  subscription-builder.css

templates/
  page.subscription.json
  page.subscription-builder.json
```

If the theme already has a stronger component structure, reuse it.

Avoid introducing a completely separate frontend architecture unless necessary.

---

# 9. Package Landing Page

Purpose:

Render all active `subscription_package` entries.

Sort by:

```text
sort_order ASC
```

Each card should show:

- Badge
- Package image
- Package name
- Description
- Display price
- Compare price
- Discount text
- Duration
- Delivery interval
- Delivery count
- Number of required selections
- CTA

Example:

```text
6 MONTHS
รับน้ำหอมทุก 2 เดือน
เลือกน้ำหอม 1 ชิ้น ต่อรอบ
฿2,790
[เลือกแพ็กเกจนี้]
```

And:

```text
1 YEAR
รับน้ำหอมทุก 2 เดือน
เลือกสินค้า 2 ชิ้น ต่อรอบ
฿4,990
[เลือกแพ็กเกจนี้]
```

CTA should navigate to builder using a stable identifier.

Recommended:

```text
/pages/subscription-builder?package=journal-12m
```

Do not pass the entire package config in query params.

Only pass:

```text
package_key
```

---

# 10. Builder Page Behavior

The builder must load the requested package from CMS.

Example:

```text
/pages/subscription-builder?package=journal-12m
```

Builder resolves:

```text
subscription_package.package_key == "journal-12m"
```

If package does not exist or is inactive:

- show friendly error
- disable checkout
- optionally redirect to package listing

---

# 11. Step Rendering

Loop over:

```text
package.steps
```

Sort by:

```text
step.sort_order
```

For each step:

1. Read collection reference
2. Render products in that collection
3. Render variant selector if product has multiple relevant variants
4. Enforce `min_select`
5. Enforce `max_select`
6. Track selected variant IDs
7. Track `selling_plan_name`

Example UI:

```text
Step 1
HOME FRAGRANCE DIFFUSER
เลือกได้ 1 รายการ

[ LOM ARUN ]
[ LOM OON LANNA ]
[ LOM NAO ]
[ LOM TALAY ]
```

Then:

```text
Step 2
BODY LOTION 250 ML
เลือกได้ 1 รายการ

[ CHARM ]
[ NANG RAM ]
```

---

# 12. Selection State

JS state should conceptually look like:

```js
{
  packageKey: "journal-12m",
  steps: {
    diffuser: {
      min: 1,
      max: 1,
      sellingPlanName: "JOURNAL 12 Months - Every 2 Months",
      selected: [
        {
          productId,
          variantId,
          title,
          image
        }
      ]
    },

    "body-lotion": {
      min: 1,
      max: 1,
      sellingPlanName: "JOURNAL 12 Months - Every 2 Months",
      selected: [
        {
          productId,
          variantId,
          title,
          image
        }
      ]
    }
  }
}
```

Do not hardcode:

```js
if (package === "12m") require 2 items
```

Instead derive validity from CMS:

```js
steps.every(step => {
  const count = step.selected.length;

  return (
    count >= step.min &&
    count <= step.max
  );
});
```

---

# 13. Progress Indicator

Progress should be derived dynamically.

For package 12M:

```text
0 / 2
1 / 2
2 / 2
```

For future packages with 3 required steps:

```text
0 / 3
...
3 / 3
```

Recommended calculation:

```text
required selection count
=
sum(step.min_select)
```

Selected count:

```text
sum(selected quantity across steps)
```

---

# 14. Checkout CTA

CTA must remain disabled until every required step is valid.

Example:

```text
[ เลือกสินค้าให้ครบ 2 ชิ้น ]
```

Disabled while invalid.

Then:

```text
[ ไปชำระเงิน ]
```

Enabled when valid.

Use both:

- disabled visual state
- actual JS guard

Never trust only CSS.

---

# 15. Selling Plan Resolution

Do not hardcode Shopify Selling Plan IDs into JS if avoidable.

CMS stores:

```text
selling_plan_name
```

Example:

```text
JOURNAL 12 Months - Every 2 Months
```

For each selected variant, resolve the Shopify Selling Plan ID from that variant's available selling plan allocations.

Conceptually:

```text
selected variant
    ↓
variant.selling_plan_allocations
    ↓
find allocation where:
allocation.selling_plan.name == step.selling_plan_name
    ↓
allocation.selling_plan.id
```

The resolved numeric Selling Plan ID is then sent to `/cart/add.js`.

If no matching Selling Plan is found:

- do not add to cart
- show error
- log useful debug information in development mode

Suggested buyer-facing error:

```text
ไม่สามารถเพิ่มสินค้านี้ในแพ็กเกจที่เลือกได้ กรุณาลองใหม่อีกครั้ง
```

---

# 16. Exposing Selling Plan Data to JavaScript

Recommended approach:

Render structured JSON into the page from Liquid.

Example concept:

```liquid
<script
  type="application/json"
  id="subscription-builder-data"
>
{
  "package": {...},
  "steps": [...]
}
</script>
```

Each variant should expose enough information to resolve:

- variant ID
- product ID
- title
- image
- selling plan allocations:
  - selling plan ID
  - selling plan name

Do not fetch Appstle APIs from the browser if Shopify Liquid already exposes the required Selling Plan allocation data.

---

# 17. Add To Cart

For a multi-step package, add all selected products in **one request**.

Endpoint:

```text
POST /cart/add.js
```

Example payload for 12M:

```json
{
  "items": [
    {
      "id": 111111111,
      "quantity": 1,
      "selling_plan": 5728370942,
      "properties": {
        "_subscription_package": "journal-12m",
        "_subscription_step": "diffuser",
        "_subscription_group": "GENERATED_GROUP_ID"
      }
    },
    {
      "id": 222222222,
      "quantity": 1,
      "selling_plan": 5728370942,
      "properties": {
        "_subscription_package": "journal-12m",
        "_subscription_step": "body-lotion",
        "_subscription_group": "GENERATED_GROUP_ID"
      }
    }
  ]
}
```

For 6M:

```json
{
  "items": [
    {
      "id": 111111111,
      "quantity": 1,
      "selling_plan": 1234567890,
      "properties": {
        "_subscription_package": "journal-6m",
        "_subscription_step": "diffuser",
        "_subscription_group": "GENERATED_GROUP_ID"
      }
    }
  ]
}
```

---

# 18. Line Item Properties

Use private line item properties for cart presentation / grouping.

Recommended:

```text
_subscription_package
_subscription_step
_subscription_group
```

Example:

```text
_subscription_package = journal-12m
_subscription_step = diffuser
_subscription_group = 8d98b4...
```

### Important

These are **UX metadata only**.

Do not treat these properties as secure validation truth.

The validation app should rely on:

- Selling Plan
- Product / Collection
- Quantity

not only line item properties.

---

# 19. Package Group ID

Generate one group ID per completed builder submission.

Both products in the same package should share the same group ID.

Example:

```text
_subscription_group:
journal-12m-<uuid>
```

Use:

```js
crypto.randomUUID()
```

if browser support is acceptable.

Fallback is allowed if necessary.

---

# 20. Redirect to Checkout

After successful `/cart/add.js`:

```js
window.location.href = "/checkout";
```

Do not redirect before the add request has completed successfully.

While request is running:

- disable CTA
- show loading state
- prevent double click

On failure:

- restore CTA
- show error message

---

# 21. Cart UX — Recommended Enhancement

If package items appear in cart, group them visually using:

```text
_subscription_group
```

Instead of:

```text
LOM ARUN
Remove

CHARM
Remove
```

Prefer:

```text
JOURNAL 12 MONTH PACKAGE

1. HOME FRAGRANCE DIFFUSER
   LOM ARUN

2. BODY LOTION
   CHARM

[แก้ไขแพ็กเกจ]
[ลบแพ็กเกจ]
```

Recommended behavior:

### Edit package

Return customer to builder:

```text
/pages/subscription-builder?package=journal-12m
```

Prefilling previous selection is optional for first phase.

### Remove package

Remove all cart lines sharing the same:

```text
_subscription_group
```

Do not expose per-line remove actions for package items in normal UI.

### Important

Cart UX is not the final security control.

Customers can still manipulate `/cart/change.js`.

The public validation app is responsible for checkout enforcement.

---

# 22. Public Validation App Assumption

The theme implementation should assume validation rules are configured separately.

Example 12M validation:

```text
IF
Selling plan name contains:
JOURNAL 12 Months

THEN REQUIRE:
Diffuser collection quantity = exactly 1

AND

Body Lotion collection quantity = exactly 1
```

Example 6M:

```text
IF
Selling plan name contains:
JOURNAL 6 Months

THEN REQUIRE:
Diffuser collection quantity = exactly 1
```

Do not implement a fake "security validation" only in theme JS.

Theme JS is UX validation only.

---

# 23. Pricing Warning

This must be confirmed before production launch.

Current CMS examples include:

```text
6M display price = 2,790
12M display price = 4,990
```

The theme must treat these as **display values only**.

The custom theme cannot arbitrarily force Shopify checkout total to:

```text
2,790
4,990
```

If the actual business requirement is:

> The complete package price must always be exactly ฿2,790 / ฿4,990 regardless of selected SKU prices

then pricing requires a separate Shopify/Appstle pricing design.

Do not fake this by only changing frontend display price.

---

# 24. Error States

Handle these cases.

## Invalid package

```text
package query parameter missing
```

or:

```text
package not found
```

Show:

```text
ไม่พบแพ็กเกจที่เลือก
```

---

## Empty collection

If a configured step points to a collection with no available products:

```text
แพ็กเกจนี้ยังไม่มีสินค้าที่สามารถเลือกได้
```

Disable checkout.

---

## Selling Plan missing

If selected variant does not contain the configured selling plan:

```text
ไม่สามารถใช้สินค้านี้กับแพ็กเกจที่เลือกได้
```

Disable submission.

---

## Variant unavailable

Do not allow selecting sold-out / unavailable variants.

---

## Cart API failure

Show:

```text
เกิดข้อผิดพลาดในการเพิ่มสินค้า กรุณาลองใหม่อีกครั้ง
```

Do not redirect to checkout.

---

# 25. Accessibility

Minimum expectations:

- product options keyboard accessible
- selected state visible beyond color only
- buttons use actual `<button>`
- disabled CTA uses `disabled`
- progress has readable text
- images have alt text
- selection inputs expose accessible labels

---

# 26. Responsive Behavior

Desktop should support layout similar to supplied design:

```text
Main product selection area
+
Sticky package summary sidebar
```

Mobile:

```text
Step content
↓
Sticky / fixed bottom CTA
```

Avoid horizontal overflow.

Product grid should adapt automatically.

---

# 27. Suggested Component Responsibilities

## `subscription-package-list.liquid`

Responsibilities:

- read active packages
- sort packages
- render package cards
- link to builder

---

## `subscription-package-card.liquid`

Responsibilities:

- package card UI only
- no cart logic

---

## `subscription-builder.liquid`

Responsibilities:

- resolve selected package
- read referenced steps
- serialize package/step/product/selling plan data
- render builder shell
- load JS/CSS

---

## `subscription-builder-step.liquid`

Responsibilities:

- render one CMS-driven step
- render step title / description
- render associated products

---

## `subscription-product-card.liquid`

Responsibilities:

- render product/variant selectable card
- image
- title
- optional price
- selected state hooks
- availability state

---

## `subscription-builder.js`

Responsibilities:

- parse serialized builder config
- maintain selection state
- enforce min/max
- update summary
- update progress
- enable/disable CTA
- resolve Selling Plan IDs
- call `/cart/add.js`
- redirect to checkout
- handle error/loading states

---

# 28. No Hardcoding Rules

Avoid hardcoding:

```text
6M = 1 step
12M = 2 steps
Diffuser is always step 1
Body Lotion is always step 2
```

CMS must drive these rules.

This should work without code changes if admin creates:

```text
24 MONTH PACKAGE
```

with:

```text
Step 1: Diffuser
Step 2: Body Lotion
Step 3: Perfume
```

provided all Selling Plans and collections are configured correctly.

---

# 29. Recommended Data Contract

Suggested serialized data format:

```json
{
  "package": {
    "key": "journal-12m",
    "name": "1 YEAR",
    "durationMonths": 12,
    "deliveryInterval": 2,
    "deliveryCount": 6,
    "displayPrice": 4990,
    "comparePrice": 6250,
    "discountText": "ประหยัด 20%"
  },
  "steps": [
    {
      "key": "diffuser",
      "name": "Home Fragrance Diffuser",
      "min": 1,
      "max": 1,
      "sellingPlanName": "JOURNAL 12 Months - Every 2 Months",
      "products": [
        {
          "id": 123,
          "title": "LOM ARUN",
          "handle": "lom-arun",
          "image": "...",
          "variants": [
            {
              "id": 456,
              "title": "Default Title",
              "available": true,
              "sellingPlans": [
                {
                  "id": 5728370942,
                  "name": "JOURNAL 12 Months - Every 2 Months"
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

---

# 30. Acceptance Criteria

Implementation is considered complete when all of these pass.

## Package listing

- [ ] Active packages are read from Metaobjects
- [ ] Inactive packages are hidden
- [ ] Package order follows CMS sort order
- [ ] CTA opens correct builder package

## Builder

- [ ] Builder reads package by `package_key`
- [ ] All referenced steps are rendered
- [ ] Step order follows `sort_order`
- [ ] Products come from referenced Shopify Collection
- [ ] `min_select` / `max_select` are enforced
- [ ] Progress updates dynamically
- [ ] CTA is disabled until every step is valid

## Selling Plan

- [ ] Correct Selling Plan is resolved by configured `selling_plan_name`
- [ ] Each selected variant receives its correct Selling Plan ID
- [ ] Missing Selling Plan prevents checkout

## Cart

- [ ] All selected items are added in one `/cart/add.js` request
- [ ] All lines receive package metadata properties
- [ ] Package lines share one group ID
- [ ] Double submission is prevented
- [ ] Successful request redirects to `/checkout`
- [ ] Failed request stays on builder and shows error

## Compatibility

- [ ] Works with 1-step package
- [ ] Works with 2-step package
- [ ] Architecture supports 3+ steps without hardcoded conditions
- [ ] Same product can participate in multiple Appstle Selling Plans
- [ ] Different steps may use different Selling Plans

---

# 31. Test Cases

## Test A — 6M happy path

```text
Open 6M
Select 1 Diffuser
CTA enabled
Submit
```

Expected:

```text
Cart contains 1 line
Correct 6M selling plan
Redirect to checkout
```

---

## Test B — 12M incomplete

```text
Open 12M
Select Diffuser only
```

Expected:

```text
Progress = 1/2
CTA disabled
```

---

## Test C — 12M happy path

```text
Select Diffuser
Select Body Lotion
```

Expected:

```text
Progress = 2/2
CTA enabled
```

Submit.

Expected cart:

```text
Diffuser × 1
12M selling plan

Body Lotion × 1
12M selling plan
```

---

## Test D — Missing Selling Plan

Temporarily configure a step with an invalid Selling Plan name.

Expected:

```text
Submission blocked
Useful buyer error shown
No partial cart add
```

---

## Test E — Sold out variant

Expected:

```text
Cannot select sold-out variant
```

---

## Test F — Network / cart API failure

Expected:

```text
No checkout redirect
Loading state reset
Error shown
```

---

## Test G — Future mixed-plan package

Configure:

```text
Step 1 Selling Plan A
Step 2 Selling Plan B
```

Expected payload:

```text
item 1 → plan A
item 2 → plan B
```

No code change required.

---

# 32. Out of Scope for Initial Custom Theme Implementation

Do not implement these unless explicitly requested:

- Appstle admin automation
- Creating Selling Plans from theme
- Checkout validation app configuration
- Server-side Shopify Function
- Fixed package pricing engine
- Subscription customer portal
- Order lifecycle automation
- Subscription swap after purchase
- Package-specific inventory reservation
- complex bundle discount calculations

---

# 33. Implementation Guidance for Codex

Before changing code:

1. Inspect the existing theme structure.
2. Reuse existing CSS variables, typography, buttons, grid and card components.
3. Do not duplicate existing theme utility functions.
4. Identify cart drawer / cart page implementation before adding cart grouping behavior.
5. Identify whether the theme is using:
   - vanilla JS
   - Web Components
   - theme-specific custom elements
6. Follow the existing JavaScript pattern.
7. Keep builder logic isolated from unrelated product-page subscription code.

Prefer progressive implementation:

```text
Phase 1
Package CMS rendering

Phase 2
Builder step rendering

Phase 3
Selection state

Phase 4
Selling Plan resolution

Phase 5
Cart add + checkout redirect

Phase 6
Optional cart package grouping
```

---

# 34. Definition of Done

The final implementation should allow a Shopify admin to create or modify package composition via CMS without editing code.

For example, admin should be able to change:

```text
12M:
Diffuser + Body Lotion
```

to:

```text
12M:
Perfume + Hand Cream
```

by updating:

- collection reference
- step metadata
- Selling Plan name

and the builder should follow the new configuration automatically.

The custom theme handles the buying experience.

Appstle handles subscription mechanics.

The public validation app remains the final checkout integrity layer.

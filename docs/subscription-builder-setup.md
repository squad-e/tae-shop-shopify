# Subscription builder setup

## Included

- `page.subscription` template: active package cards, sorted numerically by CMS sort order.
- `page.subscription-builder` template: resolves the `package` URL parameter against the active package's native `system.handle`, sorts its steps, and renders collection variants.
- Native custom elements and existing theme buttons, colors, fonts and request helper.
- A checkbox per variant supports selecting multiple distinct variants when a step permits it. Each selection adds quantity 1. Single-selection steps allow switching directly between variants.
- Selling plans resolve in Liquid from each variant's allocations using an exact name match. Unavailable variants and missing or ambiguous plan matches are disabled. Escaped data attributes carry the resolved allocation into JavaScript; no Appstle browser API or embedded raw JSON is needed.
- One localized cart add request for the whole package, shared group metadata, submission lock, error recovery and checkout redirect after success.
- Cart grouping is optional in the spec and is not included. Existing cart controls remain in place.

## Shopify Admin setup

1. Create the two metaobject definitions and fields from `shopify-subscription-custom-builder-codex-spec.md`. Enable storefront read access and the native Active/Draft (publishable) capability for both definitions, and set published entries to Active. Shopify filters Draft entries out of Liquid automatically. Do not create the custom `active` or `package_key` fields from the original spec; the implementation now uses native Status and Handle instead.
2. Create the collections and assign available products. Configure Appstle selling plans for the relevant product variants. Copy the exact Shopify selling plan name (Appstle Frequency name) into each step's `selling_plan_name`.
3. Create steps with unique Handles (or custom step keys) within each package, nonnegative integer minimums, and maximums greater than or equal to minimums. Link steps to packages and set numeric sort orders.
4. Create a page with handle `subscription` and assign the `page.subscription` template. Create `subscription-builder` and assign `page.subscription-builder`.
5. In the theme editor, select the Builder page in the Subscription packages section and the Package listing page in the Subscription builder section. These settings support alternative page handles; the handles above are the defaults.
6. Configure the public checkout validation app separately using selling plans, product/collection membership and quantities. Private line properties are presentation metadata only.
7. Verify Appstle's actual checkout totals, billing and deliveries. CMS display prices do not control checkout charges. Configure display amounts appropriately for the shop's currency; this implementation does not convert CMS prices for multiple currencies.

## Native package identity

The package Handle is used consistently in the listing CTA, builder lookup, `_subscription_package` line property and group ID prefix. For example, handle `package-12-m-subscription` opens `/pages/subscription-builder?package=package-12-m-subscription`. Existing links using a different custom `package_key` must be updated to the Handle. Changing a Handle changes the package URL; keep published handles stable. Custom `active` and `package_key` fields, if present, are ignored. Step identifiers use `key`, then `step_key`, then the native step Handle when the custom key is empty. Business fields remain CMS driven.

## Verification

Run:

```sh
node --test tests/subscription-builder.test.mjs
shopify theme check
```

Automated tests cover one, two and three steps, mixed plan IDs, incomplete/invalid selections, sold-out eligibility, min/max, grouped payloads, single-request submission, repeated clicks, errors and redirect timing.

On an unpublished Shopify theme with real CMS/Appstle data, also run spec tests A–G. Verify keyboard navigation, mobile scrolling, variant labels, storefront publication status, actual cart allocations and the validation app's response to a manually altered cart. Store-backed rendering and real checkout cannot be verified from the theme files alone.

## Current catalog bounds

This initial implementation renders up to 250 package entries and 250 products per step using Shopify Liquid pagination. Keep the package catalog within 250 entries so global sorting and builder resolution cover every package. A step with more than 250 products fails closed instead of submitting an incomplete catalog. Use curated subscription collections; very large catalogs need a separate on-demand loading strategy. Variant options follow the variants exposed by Shopify Liquid; test any high-variant products in the target store before launch.

## Shopify references

- [Variant selling plan allocations](https://shopify.dev/docs/api/liquid/objects/selling_plan_allocation)
- [Liquid pagination](https://shopify.dev/docs/api/liquid/tags/paginate)
- [Cart AJAX API](https://shopify.dev/docs/api/ajax/reference/cart)

- [Native metaobject Handle](https://shopify.dev/docs/api/liquid/objects/metaobject_system)
- [Shopify Active/Draft filtering](https://shopify.dev/docs/api/liquid/objects/metaobject_definition)

## Field key compatibility

The original spec keys remain preferred. The following label-derived alternatives are also accepted; these are explicit aliases, not automatic detection of arbitrary field names:

| Original key | Alternative key |
| --- | --- |
| Package `name` | `package_name` |
| Package `delivery_interval` | `delivery_interval_months` |
| Step `name` | `step_name` |
| Step `key` | `step_key`, then native Handle |
| Step `collection` | `product_collection` |
| Step `min_select` | `minimum_selection` |
| Step `max_select` | `maximum_selection` |

Minimum and maximum values are never invented when both keys are missing. The builder remains disabled for incomplete configuration. Entry labels do not reveal actual field keys; inspect Manage definition if fields still appear blank.

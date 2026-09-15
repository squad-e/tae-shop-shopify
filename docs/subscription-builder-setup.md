# Subscription builder setup

## Included

- `page.subscription` template: active package cards, sorted numerically by CMS sort order.
- `page.subscription-builder` template: resolves the `package` URL parameter against the active package's `package_key`, sorts its steps, and renders collection variants.
- Native custom elements and existing theme buttons, colors, fonts and request helper.
- A checkbox per variant supports selecting multiple distinct variants when a step permits it. Each selection adds quantity 1. Single-selection steps allow switching directly between variants.
- Selling plans resolve in Liquid from each variant's allocations using an exact name match. Unavailable variants and missing or ambiguous plan matches are disabled. Escaped data attributes carry the resolved allocation into JavaScript; no Appstle browser API or embedded raw JSON is needed.
- One localized cart add request for the whole package, shared group metadata, submission lock, error recovery and checkout redirect after success.
- Cart grouping is optional in the spec and is not included. Existing cart controls remain in place.

## Shopify Admin setup

1. Create the two metaobject definitions and fields from `shopify-subscription-custom-builder-codex-spec.md`. Enable storefront read access for both definitions and make referenced entries available/Active. The package's custom `active` boolean must also be true.
2. Create the collections and assign available products. Configure Appstle selling plans for the relevant product variants. Copy the exact Shopify selling plan name (Appstle Frequency name) into each step's `selling_plan_name`.
3. Create steps with unique keys within each package, nonnegative integer minimums, and maximums greater than or equal to minimums. Link steps to packages and set numeric sort orders.
4. Create a page with handle `subscription` and assign the `page.subscription` template. Create `subscription-builder` and assign `page.subscription-builder`.
5. In the theme editor, select the Builder page in the Subscription packages section and the Package listing page in the Subscription builder section. These settings support alternative page handles; the handles above are the defaults.
6. Configure the public checkout validation app separately using selling plans, product/collection membership and quantities. Private line properties are presentation metadata only.
7. Verify Appstle's actual checkout totals, billing and deliveries. CMS display prices do not control checkout charges. Configure display amounts appropriately for the shop's currency; this implementation does not convert CMS prices for multiple currencies.

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

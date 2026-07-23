# Product Colors — simple version

One file to edit: `config/products.ts`

```ts
export const PRODUCT_COLORS = {
  PLC: "",        // Supercrete      <- put a hex color here, e.g. "#3b82f6"
  "PLC+": "",     // Supercrete Plus
  POW: "",        // Powercrete
  HOLCIM: "",     // Holcim
  HWP: "",        // Holcim Water Protect
  HCG: "",        // Holcim Coastal Guard
};
```

Fill in each hex value and every chart picks it up — no picker, no
localStorage, no context to wrap your app in. Just edit the file and
redeploy.

## Files

- `config/products.ts` — the only file you edit. Colors, labels, and a
  lookup table that maps every short-code/display-name/internal-column-name
  variant the different API endpoints use back to the same product, so a
  color you set once applies no matter which chart or endpoint format is
  involved.
- `charts/*.tsx` — the 6 chart files that color **by product**, updated to
  import `getProductColor` / `getProductLabel` from `products.ts` instead of
  each keeping its own hardcoded color list.

`CustomerTypeSalesChart`, `CustomerChart`, `RegionChart`, `TerritoryChart`,
`TreemapChart` color by customer type / customer / region / territory —
not product — so they're untouched.

## Install

1. Copy `config/products.ts` into your project (e.g. `src/config/products.ts`).
2. Fill in the 6 hex colors.
3. Replace the 6 chart files with the updated versions here.

That's it — no provider, no wrapping, nothing else to wire up.

## Adding a 7th product later

Add it to all four objects in `products.ts` (`PRODUCT_COLORS`,
`PRODUCT_LABELS`, `PRODUCT_DATA_KEYS`, `PRODUCT_CODES`) and its aliases to
`ALIASES`. Every chart already loops over `PRODUCT_CODES`, so it shows up
automatically.

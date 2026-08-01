/**
 * Unit checks for money coercion (no test runner required).
 * Run: npm run test:money
 */
import {
  asCents,
  sumCents,
  SANITY_CENTS_MAX,
  formatUsd,
} from "../lib/money";

function assert(cond: unknown, msg: string) {
  if (!cond) {
    console.error("FAIL:", msg);
    process.exitCode = 1;
  } else {
    console.log("ok:", msg);
  }
}

// Core bug: string BIGINT + number must not concatenate
assert(asCents("1250478") === 1250478, 'asCents("1250478") → 1250478');
assert(
  sumCents("1250478", 5_000_000) === 6_250_478,
  'sumCents("1250478", 5000000) === 6250478 (not concat)',
);
assert(
  sumCents("1250478", "5000000") !== Number("12504785000000"),
  "string+string path is arithmetic, not concat",
);
assert(sumCents("1250478", "5000000") === 6_250_478, "two strings sum");

assert(asCents(null) === 0, "null → 0");
assert(asCents(undefined) === 0, "undefined → 0");
assert(asCents("") === 0, '"" → 0');
assert(asCents("not-a-number") === 0, "NaN string → 0");
assert(asCents(12.7) === 13, "rounds");
assert(asCents(12.4) === 12, "rounds down");
assert(asCents(BigInt(100)) === 100, "bigint");

assert(SANITY_CENTS_MAX === 1_000_000_000, "sanity max $10M");
assert(formatUsd(1250478).includes("12,504.78") || formatUsd(1250478).includes("12504.78"), "formatUsd");

// Simulate pre-fix concat disaster fingerprint
const concatDisaster = Number("1250478" + String(5_000_000));
assert(concatDisaster === 12_504_785_000_000, "documents concat bug magnitude");
assert(concatDisaster > SANITY_CENTS_MAX, "concat exceeds sanity");

if (process.exitCode) {
  console.error("\nSome money tests failed.");
  process.exit(1);
}
console.log("\nAll money tests passed.");

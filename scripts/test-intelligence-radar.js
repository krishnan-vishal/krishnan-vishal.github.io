#!/usr/bin/env node

const assert = require("assert");
const {
    canonicalUrl,
    eventFingerprint,
    isPaymentsRelevant
} = require("./propose-intelligence-candidates.js");

const paymentItem = {
    title: "Authority publishes instant payments interoperability requirements",
    summary: "New requirements apply to payment infrastructure.",
    publicationDate: "2026-09-07"
};
const duplicatePaymentItem = {
    title: "Authority publishes instant payments interoperability requirements",
    summary: "Republished through another approved discovery source.",
    publicationDate: "2026-09-07"
};
const unrelatedItem = {
    title: "Authority appoints a new communications director",
    summary: "Corporate announcement.",
    publicationDate: "2026-09-07"
};

assert.strictEqual(isPaymentsRelevant(paymentItem), true, "payment-related material must qualify");
assert.strictEqual(isPaymentsRelevant(unrelatedItem), false, "unrelated authority news must not qualify");
assert.strictEqual(eventFingerprint(paymentItem), eventFingerprint(duplicatePaymentItem), "same title/date must have deterministic event identity");
assert.strictEqual(canonicalUrl("https://example.test/item#section"), "https://example.test/item", "canonical URLs must ignore fragments");

console.log("GPIR intelligence radar contract passed.");

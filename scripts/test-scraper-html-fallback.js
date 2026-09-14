const assert = require("node:assert/strict");
const Module = require("node:module");

const anchors = [
    { title: "Central bank payment notice", href: "/payments/notice" },
    { title: "Fintech licensing update", href: "/licensing/update" },
    { title: "General contact information", href: "/contact" },
    { title: "Payment", href: "/payment" },
    { title: "Central bank payment notice", href: "/payments/notice#section" },
    { title: "Digital currency guidance", href: "/digital-currency/guidance" }
];
let selected;
const fakeCheerio = {
    load() {
        return value => {
            if (typeof value === "string") {
                selected = value;
                return { each: callback => anchors.forEach((anchor, index) => callback(index, anchor)) };
            }
            return {
                is: name => name === "a",
                text: () => value.title,
                attr: name => name === "href" ? value.href : null,
                each: callback => callback(0, value)
            };
        };
    }
};

const originalLoad = Module._load;
Module._load = function(name, ...args) {
    if (name === "cheerio") return fakeCheerio;
    if (name === "@supabase/supabase-js") return { createClient() {} };
    return originalLoad.call(this, name, ...args);
};
const { extractHtml, htmlSelector, matchesFinancialKeyword } = require("../scraper.js");
Module._load = originalLoad;

assert.equal(htmlSelector({ parser_profile: "GENERIC" }), "a[href]");
assert.equal(htmlSelector({ parser_profile: "css:tr.notice a[href]" }), "tr.notice a[href]");
assert.equal(htmlSelector({ parser_profile: ".news-list a[href]" }), ".news-list a[href]");
assert.equal(matchesFinancialKeyword("Digital currency guidance", "https://example.org/news"), true);
assert.equal(matchesFinancialKeyword("General contact information", "https://example.org/contact"), false);

const items = extractHtml("<table><tr><td><a>...</a></td></tr></table>", "https://example.org", htmlSelector({}));
assert.equal(selected, "a[href]");
assert.deepEqual(items.map(item => item.url), [
    "https://example.org/payments/notice",
    "https://example.org/licensing/update",
    "https://example.org/digital-currency/guidance"
]);
assert(items.every(item => item.title.length >= 10 && item.title.length <= 250));
console.log("Scraper all-anchor fallback filters passed.");

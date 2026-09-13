#!/usr/bin/env node

const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const source = fs.readFileSync(path.resolve(__dirname, "../assets/js/generate-dashboard-gallery.js"), "utf8");
const registry = { records: [
    { id: "country:india", contentType: "COUNTRY", title: "India", page: "pages/countries/india.html", relationships: [{ type: "REGION", target: "region:apac" }] },
    { id: "region:apac", contentType: "REGION", title: "APAC" },
    { id: "dashboard:india", contentType: "DASHBOARD", slug: "dashboard-india", relationships: [{ type: "COUNTRY", target: "country:india" }] }
] };
const metadata = { records: [{
    dashboardId: "dashboard-india", country: "India", region: "APAC", description: "Published static description",
    imagePath: "assets/dashboards/IND-DB-001.png", pagePath: "pages/countries/india.html",
    status: "Published", edition: "Edition 2026.1"
}] };

async function renderGallery(cloudRows, cloudFailure = false){
    const requests = [];
    let finishCloud;
    const gallery = { children: [], appendChild(card){ this.children.push(card); } };
    const document = {
        querySelector(selector){
            if(selector === ".dashboard-grid") return gallery;
            if(selector.includes("assets/js/script.js")) return { getAttribute: () => "assets/js/script.js?v=test" };
            return null;
        },
        createElement(tag){
            if(tag === "article"){
                const card = { innerHTML: "", liveText: null };
                card.querySelector = () => ({ set textContent(value){ card.liveText = value; } });
                return card;
            }
            let content = "";
            return {
                set textContent(value){ content = String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); },
                get innerHTML(){ return content; }
            };
        }
    };
    const context = vm.createContext({
        document, URL, Headers, AbortController, setTimeout, clearTimeout, console: { warn() {}, error() {} },
        fetch: async (url, options) => {
            requests.push({ url, options });
            if(url.includes("supabase.co")){
                if(cloudFailure === "delayed"){
                    return new Promise(resolve => { finishCloud = resolve; });
                }
                if(cloudFailure) throw new Error("network unavailable");
                return { ok: true, json: async () => cloudRows };
            }
            if(url.includes("content-registry.json")) return { ok: true, json: async () => registry };
            if(url.includes("dashboard-metadata.json")) return { ok: true, json: async () => metadata };
            throw new Error(`Unexpected request: ${url}`);
        }
    });
    vm.runInContext(source, context);
    const completion = context.initializeDashboardGallery();
    if(cloudFailure === "delayed"){
        await new Promise(resolve => setImmediate(resolve));
        assert.equal(gallery.children.length, 1, "static gallery must render before cloud response");
        finishCloud({ ok: true, json: async () => cloudRows });
    }
    await completion;
    return { gallery, requests };
}

async function main(){
    const live = await renderGallery([
        { country_code: "IN", country_name: "India", publication_status: "draft", intelligence_summary: "Unpublished" },
        { country_code: "IN", country_name: "India", publication_status: "live", intelligence_summary: "<script>unsafe</script> Verified update", page: "pages/countries/india.html" }
    ]);
    assert.equal(live.gallery.children.length, 1);
    assert.equal(live.gallery.children[0].liveText, "<script>unsafe</script> Verified update");
    assert.match(live.gallery.children[0].innerHTML, /Published static description/);
    assert.doesNotMatch(live.gallery.children[0].innerHTML, /Unpublished|unsafe/);
    const apiRequest = live.requests.find(request => request.url.includes("supabase.co"));
    assert.ok(apiRequest);
    assert.equal(new URL(apiRequest.url).searchParams.get("publication_status"), "eq.live");
    assert.ok(apiRequest.options.headers.get("apikey").startsWith("sb_publishable_"));

    for(const failure of [false, true, "delayed"]){
        const fallback = await renderGallery([], failure);
        assert.equal(fallback.gallery.children.length, 1);
        assert.match(fallback.gallery.children[0].innerHTML, /Published static description/);
        assert.equal(fallback.gallery.children[0].liveText, null);
    }
    console.log("Live country gallery contract passed.");
}

main().catch(error => {
    console.error(error);
    process.exitCode = 1;
});

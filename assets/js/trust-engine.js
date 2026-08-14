/*=====================================================
  GPIR TRUST & SOURCE VERIFICATION ENGINE

  Honest scope: this is a static site with no backend, no live
  feed/API ingestion and no connected threat-intelligence or
  malware-scanning service. What this module actually does:

  1. Checks a record's cited source URL against a small,
     hand-maintained registry of organizations whose official
     domain GPIR has verified (assets/data/trusted-sources.json).
  2. Runs basic, transparent lookalike-domain heuristics (punycode,
     IP-literal hosts, non-HTTPS, brand+"login/verify/secure"
     patterns, watch-listed TLDs) — pattern checks, not a
     connected security database.
  3. Keeps SOURCE TRUST and CONTENT VERIFICATION as separate
     axes: a registry-matched, HTTPS, no-red-flags source still
     only earns SOURCE_VERIFIED — it says nothing about whether
     the record's summarised content is itself correct.

  Fail-safe rule: if verification cannot be completed (registry
  fetch fails, organization not registered, URL unparsable), the
  result is SOURCE_REQUIRES_VERIFICATION — never SOURCE_VERIFIED
  by default.
======================================================*/

(function(){

    const REGISTRY_URL = (function(){
        const script = document.currentScript ||
            document.querySelector('script[src*="assets/js/trust-engine.js"]');
        const src = script ? script.getAttribute("src") : "assets/js/trust-engine.js";
        return src.replace(/assets\/js\/trust-engine\.js.*$/, "assets/data/trusted-sources.json");
    })();

    const SUSPICIOUS_TLDS = ["xyz", "top", "click", "support", "zip", "gq", "tk"];
    const SUSPICIOUS_KEYWORDS = ["login", "verify", "secure", "security", "support", "update", "confirm", "signin", "wallet-recovery"];

    let registry = [];
    let registryLoaded = false;

    function loadRegistry(){
        return fetch(REGISTRY_URL)
            .then(r => { if(!r.ok) throw new Error("registry fetch failed"); return r.json(); })
            .then(data => { registry = data.registry || []; registryLoaded = true; })
            .catch(() => { registry = []; registryLoaded = false; });
    }

    function hostnameOf(url){
        try{ return new URL(url).hostname.toLowerCase(); }
        catch(e){ return null; }
    }

    function domainMatches(hostname, officialDomain){
        return hostname === officialDomain || hostname.endsWith("." + officialDomain);
    }

    function findRegistryEntry(sourceOrgId){
        return registry.find(r => r.id === sourceOrgId) || null;
    }

    // Basic, transparent pattern checks — not a connected phishing database.
    function lookalikeFlags(url, hostname){

        const flags = [];

        if(!hostname) return ["URL_UNPARSABLE"];

        if(!/^https:\/\//i.test(url)) flags.push("NOT_HTTPS");

        if(hostname.includes("xn--")) flags.push("PUNYCODE_DOMAIN");

        if(/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) flags.push("IP_LITERAL_HOST");

        const tld = hostname.split(".").pop();
        if(SUSPICIOUS_TLDS.includes(tld)) flags.push("WATCHLISTED_TLD");

        if(hostname.split("-").length - 1 >= 3) flags.push("EXCESSIVE_HYPHENS");

        if(SUSPICIOUS_KEYWORDS.some(kw => hostname.includes(kw))) flags.push("SUSPICIOUS_KEYWORD");

        return flags;
    }

    function confidenceForTier(tier){
        if(tier === 1 || tier === 2) return "HIGH";
        if(tier === 3) return "MEDIUM";
        return "LOW";
    }

    // Two-axis result: sourceStatus/confidence describe whether the
    // cited URL genuinely belongs to the claimed organization.
    // contentStatus (set on the record itself, not computed here)
    // describes whether the summarised content has been reviewed —
    // a verified source does not automatically mean the content is
    // beyond question. See section 39 of the trust sprint.
    function evaluateSource(record){

        if(!record.source || !record.source.url){
            return {
                sourceStatus: "SOURCE_REQUIRES_VERIFICATION",
                confidence: "UNVERIFIED",
                reasons: ["NO_SOURCE_CITED"]
            };
        }

        const hostname = hostnameOf(record.source.url);
        const flags = lookalikeFlags(record.source.url, hostname);
        const entry = record.sourceOrgId ? findRegistryEntry(record.sourceOrgId) : null;

        if(!entry){
            return {
                sourceStatus: "SOURCE_REQUIRES_VERIFICATION",
                confidence: "UNVERIFIED",
                reasons: registryLoaded ? ["ORGANIZATION_NOT_REGISTERED"] : ["REGISTRY_UNAVAILABLE"]
            };
        }

        const domainOk = hostname && entry.officialDomains.some(d => domainMatches(hostname, d));

        if(!domainOk){
            return {
                sourceStatus: "SOURCE_WARNING",
                confidence: "LOW",
                reasons: ["DOMAIN_MISMATCH"].concat(flags)
            };
        }

        if(flags.length){
            return {
                sourceStatus: "SOURCE_WARNING",
                confidence: "LOW",
                reasons: flags
            };
        }

        return {
            sourceStatus: "SOURCE_VERIFIED",
            confidence: confidenceForTier(entry.tier),
            reasons: []
        };

    }

    function buildReportMailto(record, reason){

        const to = "krishnanvishal12@gmail.com";
        const subject = encodeURIComponent(`GPIR source report: ${record.title}`);
        const bodyLines = [
            `Record ID: ${record.id}`,
            `Title: ${record.title}`,
            `Report reason: ${reason}`,
            `Source URL: ${record.source ? record.source.url : "(none cited)"}`,
            "",
            "Additional details:"
        ];
        const body = encodeURIComponent(bodyLines.join("\n"));

        return `mailto:${to}?subject=${subject}&body=${body}`;

    }

    const ready = loadRegistry();

    window.GPIRTrustEngine = {
        ready,
        evaluateSource,
        buildReportMailto,
        isRegistryLoaded: () => registryLoaded
    };

})();

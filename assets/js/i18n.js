/*=====================================================
  GPIR I18N ENGINE

  A real translation layer for the interface chrome (nav, tickers,
  footer, search, mega-menu headings) — not a decorative label.

  English stays canonical: every language resource is merged on top
  of the English resource, so any key missing from a translation
  silently falls back to English rather than showing "undefined" or
  a raw translation key. Deep research/article content is out of
  scope for this layer by design (see the fallback notice) — it is
  not machine-translated and presented as validated GPIR research.
======================================================*/

(function(){

    const RTL_LANGUAGES = ["ar", "ur"];

    const LANGUAGE_NAMES = {
        en: "English", zh: "中文", hi: "हिन्दी", es: "Español", fr: "Français",
        ar: "العربية", bn: "বাংলা", pt: "Português", ru: "Русский", ur: "اردو",
        id: "Bahasa Indonesia", de: "Deutsch", ja: "日本語", it: "Italiano", mr: "मराठी"
    };

    function getBasePath(){
        const script = document.currentScript ||
            document.querySelector('script[src*="assets/js/i18n.js"]');
        const src = script ? script.getAttribute("src") : "assets/js/i18n.js";
        return src.replace(/assets\/js\/i18n\.js.*$/, "assets/i18n/");
    }

    const BASE_PATH = getBasePath();

    const cache = {};
    let activeDict = {};

    function loadResource(lang){
        if(cache[lang]) return Promise.resolve(cache[lang]);
        return fetch(`${BASE_PATH}${lang}.json`)
            .then(r => { if(!r.ok) throw new Error("i18n fetch failed: " + lang); return r.json(); })
            .then(data => { cache[lang] = data; return data; });
    }

    function applyTranslations(dict){

        document.querySelectorAll("[data-i18n]").forEach(el => {
            const key = el.getAttribute("data-i18n");
            if(dict[key] !== undefined) el.textContent = dict[key];
        });

        document.querySelectorAll("[data-i18n-placeholder]").forEach(el => {
            const key = el.getAttribute("data-i18n-placeholder");
            if(dict[key] !== undefined) el.setAttribute("placeholder", dict[key]);
        });

        document.querySelectorAll("[data-i18n-aria-label]").forEach(el => {
            const key = el.getAttribute("data-i18n-aria-label");
            if(dict[key] !== undefined) el.setAttribute("aria-label", dict[key]);
        });

    }

    function updateDocumentDirection(lang){

        const isRtl = RTL_LANGUAGES.indexOf(lang) !== -1;

        document.documentElement.setAttribute("lang", lang);
        document.documentElement.setAttribute("dir", isRtl ? "rtl" : "ltr");

    }

    function updateFallbackNotice(lang){

        const notice = document.getElementById("footer-language-notice");

        if(!notice) return;

        if(lang === "en"){
            notice.hidden = true;
            notice.textContent = "";
            return;
        }

        const dict = { ...(cache.en || {}), ...(cache[lang] || {}) };
        notice.hidden = false;
        notice.textContent = dict["translate.fallback_notice"] ||
            "Some content is currently available in English only.";

    }

    function announce(lang){

        let live = document.getElementById("i18n-live-region");

        if(!live){
            live = document.createElement("div");
            live.id = "i18n-live-region";
            live.setAttribute("aria-live", "polite");
            live.setAttribute("role", "status");
            live.className = "visually-hidden";
            document.body.appendChild(live);
        }

        const name = LANGUAGE_NAMES[lang] || lang;
        live.textContent = `Language changed to ${name}`;

    }

    function setLanguage(lang, opts){

        opts = opts || {};

        if(!LANGUAGE_NAMES[lang]) lang = "en";

        Promise.all([
            loadResource("en"),
            lang === "en" ? Promise.resolve(null) : loadResource(lang).catch(() => null)
        ]).then(([enDict, langDict]) => {

            const merged = { ...enDict, ...(langDict || {}) };
            activeDict = merged;

            applyTranslations(merged);
            updateDocumentDirection(lang);
            updateFallbackNotice(lang);

            if(!opts.silent) announce(lang);

            try{ localStorage.setItem("gpir-language", lang); } catch(e){}

            document.dispatchEvent(new CustomEvent("gpir:languagechange", { detail: { lang } }));

        });

    }

    function currentLanguage(){
        try{
            return localStorage.getItem("gpir-language") || "en";
        } catch(e){
            return "en";
        }
    }

    function init(){
        setLanguage(currentLanguage(), { silent: true });
    }

    if(document.readyState === "loading"){
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }

    function t(key){
        return activeDict[key] !== undefined ? activeDict[key] : key;
    }

    window.GPIRI18n = {
        setLanguage,
        currentLanguage,
        languageNames: LANGUAGE_NAMES,
        t
    };

})();

/*=====================================================
  FOOTER UTILITIES
  Currency + Language preference controls.
======================================================*/

document.addEventListener("DOMContentLoaded", () => {

    initializeCurrencySelect();

    initializeLanguageSelect();

});

const LANGUAGE_NAMES = {
    en: "English", zh: "中文", hi: "हिन्दी", es: "Español", fr: "Français",
    ar: "العربية", bn: "বাংলা", pt: "Português", ru: "Русский", ur: "اردو",
    id: "Bahasa Indonesia", de: "Deutsch", ja: "日本語", it: "Italiano", mr: "मराठी"
};

const RTL_LANGUAGES = ["ar", "ur"];

function initializeCurrencySelect(){

    const select = document.getElementById("footer-currency-select");

    if(!select) return;

    let stored = "USD";

    try{
        stored = localStorage.getItem("gpir-currency") || "USD";
    } catch(e){}

    select.value = stored;

    select.addEventListener("change", () => {

        const code = select.value;

        try{
            localStorage.setItem("gpir-currency", code);
        } catch(e){}

        if(typeof setFxBaseCurrency === "function"){
            setFxBaseCurrency(code);
        }

    });

}

function initializeLanguageSelect(){

    const select = document.getElementById("footer-language-select");

    const notice = document.getElementById("footer-language-notice");

    if(!select) return;

    let stored = "en";

    try{
        stored = localStorage.getItem("gpir-language") || "en";
    } catch(e){}

    select.value = stored;

    applyLanguagePreference(stored, notice);

    select.addEventListener("change", () => {

        const code = select.value;

        try{
            localStorage.setItem("gpir-language", code);
        } catch(e){}

        applyLanguagePreference(code, notice);

    });

}

function applyLanguagePreference(code, notice){

    const isRtl = RTL_LANGUAGES.indexOf(code) !== -1;

    document.documentElement.setAttribute("lang", code);

    document.documentElement.setAttribute("dir", isRtl ? "rtl" : "ltr");

    if(!notice) return;

    if(code === "en"){

        notice.hidden = true;
        notice.textContent = "";

    } else {

        const name = LANGUAGE_NAMES[code] || code;

        notice.hidden = false;

        notice.textContent =
            `GPIR is currently displayed in English. Full ${name} translation ` +
            `of research content is in development — your preference is saved ` +
            `and interface labels will switch automatically once it's ready.`;

    }

}

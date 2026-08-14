/*=====================================================
  FOOTER UTILITIES
  Currency preference control. Language is handled by
  assets/js/i18n.js — this file just wires the <select> to it.
======================================================*/

document.addEventListener("DOMContentLoaded", () => {

    initializeCurrencySelect();

    initializeLanguageSelect();

});

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

    if(!select) return;

    const applyStoredValue = () => {
        if(window.GPIRI18n) select.value = window.GPIRI18n.currentLanguage();
    };

    applyStoredValue();

    select.addEventListener("change", () => {
        if(window.GPIRI18n) window.GPIRI18n.setLanguage(select.value);
    });

    // If i18n.js finishes its own async init after this ran, or another
    // tab changes the language, keep the dropdown in sync.
    document.addEventListener("gpir:languagechange", (e) => {
        if(e.detail && e.detail.lang) select.value = e.detail.lang;
    });

}

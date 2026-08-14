/*=====================================================
  LIVE FX RATES + ANNOUNCEMENTS TICKER
======================================================*/

document.addEventListener("DOMContentLoaded", () => {

    initializeFxTicker();

    initializeAnnouncementTicker();

});

/*=====================================================
  LIVE FX RATES
======================================================*/

const currencies = [
    "USD","EUR","GBP","INR","BDT","PKR","AED","SAR","KWD",
    "QAR","BHD","OMR","JPY","SGD","MYR","THB","CNY",
    "KRW","AUD","CAD","CHF","ZAR","NGN","MXN","BRL"
];

// Base currency the ticker displays pairs against. A footer utility
// (Currency selector) can change this via setFxBaseCurrency(); it's a
// genuine re-fetch against the same live API, not a fabricated
// conversion of already-displayed values.
let fxBaseCurrency = (function(){
    try{
        return localStorage.getItem("gpir-currency") || "USD";
    } catch(e){
        return "USD";
    }
})();

function initializeFxTicker(){

    const track = document.getElementById("fxTicker");

    if(!track) return;

    loadRates();

    setInterval(loadRates, 60000);

    // Re-render immediately on a language change so the "Last Updated" /
    // error label reflects the new language without waiting for the
    // next scheduled refresh.
    document.addEventListener("gpir:languagechange", loadRates);

}

function setFxBaseCurrency(code){

    if(!code || code === fxBaseCurrency) return;

    fxBaseCurrency = code;

    loadRates();

}

async function loadRates(){

    const track = document.getElementById("fxTicker");

    const updated = document.getElementById("lastUpdated");

    if(!track) return;

    try{

        const response = await fetch(`https://open.er-api.com/v6/latest/${fxBaseCurrency}`);

        const data = await response.json();

        let html = "";

        for(const code of currencies){

            if(code === fxBaseCurrency) continue;

            html += `

                <span class="ticker-item">

                    <span class="pair">${fxBaseCurrency}/${code}</span>
                    <span class="rate">${data.rates[code].toFixed(4)}</span>
                    <span class="separator">│</span>

                </span>
`;

        }

        track.innerHTML = html + html;

        if(updated){

            const label = window.GPIRI18n ? window.GPIRI18n.t("ticker.last_updated") : "Last Updated";
            updated.textContent =
                label + ": " + new Date().toLocaleTimeString();

        }

    } catch(err){

        console.error(err);

        const unableText = window.GPIRI18n ? window.GPIRI18n.t("ticker.unable_to_load") : "Unable to load exchange rates.";
        track.innerHTML =
            `<span class="ticker-item">${unableText}</span>`;

        if(updated){

            updated.textContent = "";

        }

    }

}

/*=====================================================
  ANNOUNCEMENTS TICKER
  Duplicates the cards once so the CSS marquee
  (translateX 0 -> -50%) loops seamlessly.
======================================================*/

function initializeAnnouncementTicker(){

    const track = document.getElementById("announcementTicker");

    if(!track) return;

    const originalHTML = track.innerHTML;

    track.innerHTML = originalHTML + originalHTML;

}

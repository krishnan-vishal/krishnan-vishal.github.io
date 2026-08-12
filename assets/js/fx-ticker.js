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
    "EUR","GBP","INR","BDT","PKR","AED","SAR","KWD",
    "QAR","BHD","OMR","JPY","SGD","MYR","THB","CNY",
    "KRW","AUD","CAD","CHF","ZAR","NGN","MXN","BRL"
];

function initializeFxTicker(){

    const track = document.getElementById("fxTicker");

    if(!track) return;

    loadRates();

    setInterval(loadRates, 60000);

}

async function loadRates(){

    const track = document.getElementById("fxTicker");

    const updated = document.getElementById("lastUpdated");

    if(!track) return;

    try{

        const response = await fetch("https://open.er-api.com/v6/latest/USD");

        const data = await response.json();

        let html = "";

        for(const code of currencies){

            html += `

                <span class="ticker-item">

                    <span class="pair">USD/${code}</span>
                    <span class="rate">${data.rates[code].toFixed(4)}</span>
                    <span class="separator">│</span>

                </span>
`;

        }

        track.innerHTML = html + html;

        if(updated){

            updated.textContent =
                "Last Updated: " + new Date().toLocaleTimeString();

        }

    } catch(err){

        console.error(err);

        track.innerHTML =
            "<span class=\"ticker-item\">Unable to load exchange rates.</span>";

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

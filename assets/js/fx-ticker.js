const currencies = [
    "EUR","GBP","INR","BDT","PKR","AED","SAR","KWD",
    "QAR","BHD","OMR","JPY","SGD","MYR","THB","CNY",
    "KRW","AUD","CAD","CHF","ZAR","NGN","MXN","BRL"
];

async function loadRates() {

    try {

        const response = await fetch("https://open.er-api.com/v6/latest/USD");
        const data = await response.json();

        let html = "";

        for (const code of currencies) {

            html += `

                <span class="ticker-item">

                    <span class="pair">USD/${code}</span>
                    <span class="rate">${data.rates[code].toFixed(4)}</span>
                    <span class="separator">│</span>
                    
                </span>
`;

        }

        document.getElementById("fxTicker").innerHTML = html;

        document.getElementById("lastUpdated").textContent =
            "Last Updated: " + new Date().toLocaleTimeString();

    } catch (err) {

        console.error(err);

        document.getElementById("fxTicker").innerHTML =
            "Unable to load exchange rates.";

    }

}

loadRates();

setInterval(loadRates, 60000);
(function(){
"use strict";

var W = 1000, H = 500, LAT_TOP = 78, LAT_BOT = -58;

function project(lon, lat){
    return {
        x: (lon + 180) / 360 * W,
        y: (LAT_TOP - lat) / (LAT_TOP - LAT_BOT) * H
    };
}

/* Simplified continental silhouettes used only to texture the map with a
   dot pattern — not real country borders, so they are never used for
   click hit-testing. Country click targets are the discrete markers
   plotted from assets/data/world-map-countries.json. */
function getPolygons(){
    return [
        [[-155,71],[-130,71],[-95,73],[-80,73],[-68,63],[-60,52],[-55,47],[-60,44],[-67,45],[-70,41],[-74,40],[-76,35],[-81,31],[-80,26],[-82,24],[-97,26],[-97,19],[-92,15],[-88,13],[-83,9],[-79,8],[-83,9.5],[-87,13],[-94,16],[-105,21],[-110,24],[-115,28],[-117,32],[-122,37],[-124,42],[-124,49],[-130,55],[-140,59],[-155,60],[-165,65],[-155,71]],
        [[-77,8],[-70,12],[-72,8],[-79,4],[-80,-3],[-81,-6],[-80,-14],[-71,-18],[-70,-23],[-71,-30],[-73,-38],[-71,-45],[-68,-52],[-66,-55],[-69,-55],[-65,-50],[-62,-42],[-58,-35],[-57,-30],[-48,-25],[-39,-15],[-35,-9],[-38,-5],[-43,-2],[-49,0],[-51,2],[-60,5],[-67,8],[-72,10],[-77,8]],
        [[-9,43],[-9,38],[-6,37],[-2,36],[3,37],[3,41],[7,43],[10,44],[13,42],[15,40],[18,40],[20,39],[23,37],[26,35],[26,39],[23,40],[26,41],[28,41],[27,43],[29,45],[30,46],[28,45],[25,44],[22,44],[19,43],[18,45],[16,46],[14,46],[16,48],[19,49],[22,49],[24,49],[26,50],[24,52],[23,54],[21,56],[18,54],[15,55],[13,55],[10,54],[8,54],[9,52],[6,51],[4,51],[3,51],[1,51],[-2,50],[-5,48],[-4,47],[-1,46],[-2,44],[-1,44],[-9,43]],
        [[5,58],[6,62],[9,64],[13,66],[18,68],[21,69],[25,70],[29,69],[28,66],[24,65],[22,63],[18,60],[14,59],[10,57],[7,57],[5,58]],
        [[30,50],[35,52],[40,50],[45,48],[48,47],[50,46],[52,44],[55,42],[60,42],[65,41],[70,40],[75,40],[80,42],[85,45],[90,50],[95,52],[100,50],[105,52],[110,50],[115,49],[120,42],[125,43],[130,44],[135,45],[140,48],[145,50],[150,55],[155,60],[160,62],[165,65],[170,68],[178,68],[178,65],[170,65],[160,60],[150,60],[140,58],[135,55],[130,52],[128,45],[135,50],[140,55],[145,60],[150,65],[155,70],[160,70],[165,68],[160,72],[150,73],[140,73],[130,72],[120,73],[110,73],[100,75],[90,73],[80,72],[70,72],[60,70],[50,68],[45,66],[40,65],[35,63],[32,60],[30,56],[28,52],[30,50]],
        [[35,42],[42,40],[45,38],[48,36],[50,32],[52,28],[56,26],[58,24],[60,25],[62,26],[65,25],[68,24],[70,22],[72,21],[73,18],[76,15],[78,10],[80,8],[80,13],[80,16],[82,18],[85,20],[88,22],[90,22],[92,22],[95,20],[97,17],[98,10],[99,7],[101,6],[103,4],[104,1],[100,5],[97,15],[95,18],[92,20],[88,25],[85,25],[80,25],[75,28],[72,30],[68,30],[63,28],[60,28],[55,30],[50,30],[45,32],[40,35],[36,36],[33,35],[35,32],[35,30],[34,29],[35,32],[35,36],[33,38],[35,42]],
        [[75,40],[80,42],[85,45],[90,45],[95,43],[100,42],[105,40],[110,40],[115,42],[120,40],[122,38],[121,35],[119,32],[121,30],[122,28],[120,25],[115,23],[110,20],[105,20],[102,22],[100,25],[98,25],[97,28],[95,29],[92,27],[90,28],[88,28],[85,28],[80,30],[76,32],[75,35],[75,40]],
        [[121,19],[122,17],[124,13],[126,9],[125,6],[123,7],[121,10],[120,14],[120,17],[121,19]],
        [[95,5],[98,3],[102,-1],[106,-3],[110,-4],[115,-4],[119,-5],[120,-3],[122,0],[120,3],[117,3],[112,1],[106,-2],[100,2],[97,5],[95,5]],
        [[100,6],[103,2],[104,1],[109,1],[115,4],[117,6],[115,7],[110,4],[104,4],[100,6]],
        [[-17,15],[-16,21],[-11,23],[-6,27],[-1,30],[3,32],[9,32],[11,33],[15,32],[20,31],[25,32],[28,31],[32,31],[35,30],[36,27],[38,20],[43,13],[47,12],[51,12],[51,8],[48,4],[45,2],[42,0],[40,-3],[40,-8],[38,-12],[36,-16],[35,-20],[35,-24],[33,-27],[30,-30],[26,-33],[22,-34],[18,-33],[15,-27],[12,-18],[13,-8],[12,-5],[9,3],[6,4],[4,5],[2,4],[-2,5],[-4,6],[-6,5],[-8,5],[-10,6],[-13,8],[-16,12],[-17,15]],
        [[43,-12],[47,-13],[49,-16],[47,-24],[45,-25],[43,-20],[43,-15],[43,-12]],
        [[113,-22],[114,-26],[115,-31],[117,-35],[121,-34],[126,-32],[131,-32],[136,-35],[139,-38],[144,-38],[147,-38],[150,-37],[153,-28],[153,-24],[150,-22],[147,-19],[145,-16],[142,-11],[137,-12],[133,-12],[130,-12],[129,-15],[123,-17],[113,-22]],
        [[173,-41],[175,-38],[177,-38],[178,-40],[177,-45],[173,-43],[171,-44],[173,-41]],
        [[-5,50],[-3,50],[0,51],[1,53],[-1,55],[-3,58],[-5,58],[-6,56],[-4,54],[-6,53],[-8,52],[-8,51],[-5,50]],
        [[130,31],[132,33],[135,34],[138,35],[140,36],[141,39],[141,41],[140,44],[142,44],[141,45],[139,42],[137,37],[135,35],[133,34],[131,32],[130,31]],
        [[80,6],[81,7],[82,9],[81,10],[80,8],[80,6]],
        [[-84,22],[-80,23],[-77,20],[-75,20],[-77,19],[-82,21],[-84,22]],
        [[-45,60],[-40,65],[-30,68],[-25,70],[-30,75],[-40,78],[-50,75],[-55,70],[-50,65],[-45,60]]
    ];
}

function pointInPolygon(pt, poly){
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++){
        var xi = poly[i][0], yi = poly[i][1];
        var xj = poly[j][0], yj = poly[j][1];
        if (((yi > pt[1]) !== (yj > pt[1])) && (pt[0] < (xj - xi) * (pt[1] - yi) / (yj - yi) + xi)) c = !c;
    }
    return c;
}

/* Real, commonly documented cross-border payment/remittance corridors —
   restricted to country pairs that are both already tracked on this site
   (assets/data/world-map-countries.json), so the decorative flow lines
   never reference a country with no directory entry. */
var CORRIDORS = [
    ["UAE","India"], ["UAE","Pakistan"], ["UAE","Philippines"], ["UAE","Bangladesh"],
    ["Saudi Arabia","Pakistan"], ["Saudi Arabia","Bangladesh"],
    ["Qatar","India"], ["Qatar","Philippines"],
    ["Singapore","Indonesia"], ["Singapore","Malaysia"],
    ["United Kingdom","India"], ["United Kingdom","Pakistan"],
    ["France","Vietnam"], ["Netherlands","Indonesia"],
    ["Japan","Philippines"], ["Italy","Philippines"],
    ["Australia","Vietnam"], ["China","Vietnam"]
];

var REGION_LABEL = {
    gcc: "Middle East / GCC",
    apac: "APAC",
    latam: "LATAM",
    europe: "Europe / SEPA",
    americas: "Americas",
    africa: "Africa"
};

var REGION_DIRECTORY = {
    gcc: "pages/regions/middle-east.html",
    apac: "pages/regions/apac.html",
    latam: "pages/regions/latam.html",
    europe: "pages/regions/europe.html",
    americas: "pages/regions/americas.html",
    africa: "pages/regions/africa.html"
};

var REGION_COLOR = {
    gcc: "#e0a458",
    apac: "#4fb8a6",
    europe: "#9b8cd1",
    latam: "#6aa9d8",
    americas: "#d97757",
    africa: "#5cb85c"
};

var REGION_LEGEND_LABEL = {
    gcc: "Middle East",
    apac: "Asia Pacific",
    europe: "Europe",
    latam: "LATAM",
    africa: "Africa",
    americas: "Americas"
};

function svgEl(tag, attrs){
    var el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for (var k in attrs) el.setAttribute(k, attrs[k]);
    return el;
}

function buildLandDots(svg){
    var polys = getPolygons();
    var frag = document.createDocumentFragment();
    var idx = 0;
    for (var lat = 74; lat >= -56; lat -= 3){
        for (var lon = -178; lon <= 178; lon += 3){
            var isLand = false;
            for (var p = 0; p < polys.length; p++){
                if (pointInPolygon([lon, lat], polys[p])) { isLand = true; break; }
            }
            if (isLand){
                var pt = project(lon, lat);
                var shade = 0.10 + (Math.sin(idx * 12.9898) * 0.5 + 0.5) * 0.08;
                var dot = svgEl("circle", { cx: pt.x.toFixed(1), cy: pt.y.toFixed(1), r: 1.1, fill: "rgba(230,225,215," + shade.toFixed(2) + ")" });
                frag.appendChild(dot);
            }
            idx++;
        }
    }
    svg.appendChild(frag);
}

function buildCorridorArcs(svg, byName, reduceMotion){
    var frag = document.createDocumentFragment();
    var used = 0;
    CORRIDORS.forEach(function(pair, i){
        var a = byName[pair[0]], b = byName[pair[1]];
        if (!a || !b) return;
        var p1 = project(a.lon, a.lat), p2 = project(b.lon, b.lat);
        var mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
        var dx = p2.x - p1.x, dy = p2.y - p1.y;
        var dist = Math.sqrt(dx * dx + dy * dy) || 1;
        var nx = -dy / dist, ny = dx / dist;
        var bend = Math.min(dist * 0.22, 70);
        var cx = mx + nx * bend, cy = my + ny * bend;
        var d = "M " + p1.x.toFixed(1) + " " + p1.y.toFixed(1) + " Q " + cx.toFixed(1) + " " + cy.toFixed(1) + " " + p2.x.toFixed(1) + " " + p2.y.toFixed(1);
        var color = REGION_COLOR[a.region] || "#e0a458";

        frag.appendChild(svgEl("path", { d: d, stroke: color, "stroke-width": "0.6", fill: "none", opacity: "0.22" }));

        if (!reduceMotion){
            var flow = svgEl("circle", { r: "2.1", fill: color });
            flow.style.offsetPath = "path('" + d + "')";
            flow.style.animation = "wmFlow " + (3.5 + (i % 5) * 0.7) + "s linear infinite";
            flow.style.animationDelay = (-(i * 0.6)) + "s";
            flow.style.filter = "drop-shadow(0 0 3px " + color + ")";
            frag.appendChild(flow);
        }
        used++;
    });
    svg.appendChild(frag);
    return used;
}

function statusLabel(status){
    return status === "active" ? "Active" : "Coming Soon";
}

/* Nudges apart any marker centers closer than minDist (in the 1000x500
   coordinate space) so dense clusters — e.g. Western/Central Europe —
   never leave two markers overlapping as click targets. Geographic
   accuracy is sacrificed only by the minimum needed to keep every
   marker independently clickable; corridor arcs still use the true
   projected coordinates, not these adjusted points. */
function declutterPoints(points, minDist, iterations){
    for (var iter = 0; iter < iterations; iter++){
        var moved = false;
        for (var i = 0; i < points.length; i++){
            for (var j = i + 1; j < points.length; j++){
                var dx = points[j].x - points[i].x;
                var dy = points[j].y - points[i].y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < 0.0001){
                    points[i].x -= minDist / 2;
                    points[j].x += minDist / 2;
                    moved = true;
                } else if (dist < minDist){
                    var push = (minDist - dist) / 2;
                    var nx = dx / dist, ny = dy / dist;
                    points[i].x -= nx * push;
                    points[i].y -= ny * push;
                    points[j].x += nx * push;
                    points[j].y += ny * push;
                    moved = true;
                }
            }
        }
        if (!moved) break;
    }
}

function buildMarkers(container, tooltip, countries, reduceMotion){
    var frag = document.createDocumentFragment();

    var points = countries.map(function(c){ return project(c.lon, c.lat); });
    declutterPoints(points, 34, 120);

    countries.forEach(function(c, idx){
        var pt = points[idx];
        var leftPct = (pt.x / W * 100).toFixed(2) + "%";
        var topPct = (pt.y / H * 100).toFixed(2) + "%";
        var isActive = c.status === "active";

        var regionColor = REGION_COLOR[c.region] || "#e0a458";

        var wrap = document.createElement(isActive ? "a" : "button");
        wrap.className = "wm-marker " + (isActive ? "wm-marker--active" : "wm-marker--soon");
        wrap.style.left = leftPct;
        wrap.style.top = topPct;
        wrap.setAttribute("aria-label", c.name + " — " + statusLabel(c.status));

        if (isActive){
            wrap.href = c.url;
        } else {
            wrap.type = "button";
        }

        var dot = document.createElement("span");
        dot.className = "wm-marker-dot";
        dot.style.background = regionColor;
        dot.style.boxShadow = isActive
            ? "0 0 0 2px rgba(255,255,255,.92), 0 0 12px 4px " + regionColor
            : "0 0 8px 2px " + regionColor + "88";
        wrap.appendChild(dot);

        if (!reduceMotion){
            var pulse = document.createElement("span");
            pulse.className = "wm-marker-pulse";
            pulse.style.background = regionColor;
            wrap.appendChild(pulse);
        }

        function showTooltip(){
            tooltip.innerHTML = "";
            var title = document.createElement("strong");
            title.textContent = c.name;
            tooltip.appendChild(title);
            var status = document.createElement("span");
            status.className = "wm-tooltip-status " + (isActive ? "wm-tooltip-status--active" : "wm-tooltip-status--soon");
            status.textContent = statusLabel(c.status);
            tooltip.appendChild(status);

            if (isActive){
                var p = document.createElement("p");
                p.textContent = "Country Intelligence page is live.";
                tooltip.appendChild(p);
            } else {
                var p2 = document.createElement("p");
                p2.textContent = "Country Intelligence page not yet published.";
                tooltip.appendChild(p2);
                var dirUrl = REGION_DIRECTORY[c.region];
                if (dirUrl){
                    var link = document.createElement("a");
                    link.href = dirUrl;
                    link.className = "wm-tooltip-link";
                    link.textContent = "View " + (REGION_LABEL[c.region] || "region") + " directory →";
                    tooltip.appendChild(link);
                }
            }

            tooltip.style.left = leftPct;
            tooltip.style.top = topPct;
            tooltip.hidden = false;
            tooltip.classList.toggle("wm-tooltip--flip", pt.x > W * 0.62);
        }

        wrap.addEventListener("mouseenter", showTooltip);
        wrap.addEventListener("focus", showTooltip);

        if (!isActive){
            wrap.addEventListener("click", function(e){
                e.preventDefault();
                showTooltip();
            });
        }

        frag.appendChild(wrap);
    });

    container.appendChild(frag);
}

function init(){
    var root = document.getElementById("world-map-canvas");
    if (!root) return;

    var svg = document.getElementById("world-map-svg");
    var markerLayer = document.getElementById("world-map-markers");
    var tooltip = document.getElementById("world-map-tooltip");
    var legendItems = document.getElementById("world-map-legend-items");
    if (!svg || !markerLayer || !tooltip) return;

    var reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    buildLandDots(svg);

    fetch("assets/data/world-map-countries.json")
        .then(function(r){ return r.ok ? r.json() : Promise.reject(r.status); })
        .then(function(data){
            var countries = data.countries || [];
            var byName = {};
            countries.forEach(function(c){ byName[c.name] = c; });

            buildCorridorArcs(svg, byName, reduceMotion);
            buildMarkers(markerLayer, tooltip, countries, reduceMotion);

            if (legendItems){
                var regionsPresent = {};
                countries.forEach(function(c){ regionsPresent[c.region] = true; });

                Object.keys(REGION_COLOR).forEach(function(region){
                    if (!regionsPresent[region]) return;
                    var el = document.createElement("span");
                    el.className = "wm-legend-item";
                    var dot = document.createElement("span");
                    dot.className = "wm-legend-dot";
                    dot.style.background = REGION_COLOR[region];
                    el.appendChild(dot);
                    el.appendChild(document.createTextNode(REGION_LEGEND_LABEL[region]));
                    legendItems.appendChild(el);
                });

                var activeEl = document.createElement("span");
                activeEl.className = "wm-legend-item wm-legend-item--active";
                var activeDot = document.createElement("span");
                activeDot.className = "wm-legend-dot wm-legend-dot--ring";
                activeEl.appendChild(activeDot);
                activeEl.appendChild(document.createTextNode("Active — click to open"));
                legendItems.appendChild(activeEl);
            }
        })
        .catch(function(){
            root.classList.add("world-map-canvas--error");
        });

    document.addEventListener("click", function(e){
        if (!tooltip.hidden && !e.target.closest(".wm-marker") && !e.target.closest(".world-map-tooltip")){
            tooltip.hidden = true;
        }
    });
    document.addEventListener("keydown", function(e){
        if (e.key === "Escape") tooltip.hidden = true;
    });
}

if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}

})();

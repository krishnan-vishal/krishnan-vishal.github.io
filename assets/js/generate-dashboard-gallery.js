/**
 * Generate Dashboard Gallery from Registry
 * 
 * Renders dashboard cards in .dashboard-grid from:
 * - content-registry.json (DASHBOARD entries with COUNTRY relationships)
 * - dashboard-metadata.json (structured dashboard metadata)
 * 
 * Maintains all existing card IDs (dashboard-uae, dashboard-ksa, etc.)
 * for backward compatibility with lightbox and other features.
 * 
 * This replaces the hardcoded HTML dashboard cards with registry-driven rendering.
 */

async function fetchLiveCountryIntelligence(){
    const url = new URL("https://qlnvhfapctcpzqyuhhth.supabase.co/rest/v1/country_intelligence");
    url.searchParams.set("select", "country_code,country_name,publication_status,intelligence_summary,page:metadata->>page");
    url.searchParams.set("publication_status", "eq.live");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    try{
        const headers = new Headers();
        headers.set("apikey", "sb_publishable_WXg6w9pZIWatIraPV1mUVQ_JAUZ7PQ6");
        const response = await fetch(url.toString(), {
            headers,
            cache: "no-store",
            signal: controller.signal
        });
        if(!response.ok) throw new Error(`country intelligence API returned HTTP ${response.status}`);
        const rows = await response.json();
        if(!Array.isArray(rows)) throw new Error("country intelligence API returned an invalid payload");
        return rows.filter(row => row && row.publication_status === "live" && typeof row.country_code === "string");
    } finally {
        clearTimeout(timeout);
    }
}

function initializeDashboardGallery(){

    const gallery = document.querySelector(".dashboard-grid");
    if(!gallery) return;

    const script = document.querySelector('script[src*="assets/js/script.js"]');
    const src = script ? script.getAttribute("src") : "assets/js/script.js";
    const registryUrl = src.replace(/assets\/js\/script\.js.*$/, "assets/data/content-registry.json");
    const metadataUrl = src.replace(/assets\/js\/script\.js.*$/, "assets/data/dashboard-metadata.json");
    const liveCountryRequest = fetchLiveCountryIntelligence().catch(error => {
        console.warn("[GPIR] Live country intelligence unavailable; retaining published dashboard metadata.", error);
        return [];
    });

    // Published dashboard identity and images remain local even if the cloud
    // mirror is empty or unavailable.
    return Promise.all([
        fetch(registryUrl).then(r => {
            if(!r.ok) throw new Error("registry unavailable");
            return r.json();
        }),
        fetch(metadataUrl).then(r => {
            if(!r.ok) throw new Error("metadata unavailable");
            return r.json();
        })
    ])
    .then(([registryData, metadataData]) => {
        // Get dashboard records from registry
        const dashboardRecords = (registryData.records || []).filter(r => r.contentType === "DASHBOARD");
        
        // Map metadata by dashboardId
        const metadataMap = new Map((metadataData.records || []).map(m => [m.dashboardId, m]));
        
        // Map countries by country ID to get region information
        const countryMap = new Map((registryData.records || []).filter(r => r.contentType === "COUNTRY").map(c => [c.id, c]));
        const regionMap = new Map((registryData.records || []).filter(r => r.contentType === "REGION").map(r => [r.id, r]));
        const cardsByPage = new Map();
        const cardsByName = new Map();
        
        // Generate cards for each dashboard
        dashboardRecords.forEach(dashboardRecord => {
            const metadata = metadataMap.get(dashboardRecord.slug);
            if(!metadata) return;
            
            // Find the country this dashboard belongs to (from registry relationships)
            const countryRelation = dashboardRecord.relationships?.find(rel => rel.type === "COUNTRY");
            const countryRecord = countryRelation ? countryMap.get(countryRelation.target) : null;
            const regionRelation = countryRecord?.relationships?.find(rel => rel.type === "REGION");
            const regionRecord = regionRelation ? regionMap.get(regionRelation.target) : null;
            const regionLabel = regionRecord?.title || metadata.region || "";
            
            // Get country page from metadata or infer from slug
            const countryPage = countryRecord?.page || metadata.pagePath;
            
            // Create card element
            const card = document.createElement("article");
            card.className = "dashboard-card";
            card.id = dashboardRecord.slug; // Preserve existing dashboard-{country} anchors
            
            // Build image responsive sources
            const imagePath = metadata.imagePath.replace(/\.png$/, "");
            const thumbnailPath = imagePath
                .replace("assets/dashboards/", "assets/dashboards/thumbnail/")
                .replace("-DB-", "-TN-");
            
            card.innerHTML = `
                <div class="dashboard-image">
                    <a
                        href="${escapeHtml(metadata.imagePath)}"
                        data-lightbox-src="${escapeHtml(metadata.imagePath)}"
                        data-lightbox-title="${escapeHtml(metadata.country)}"
                        aria-label="Open ${escapeHtml(metadata.country)} GPIR dashboard">
                        
                        <picture>
                            <source type="image/webp" sizes="(max-width:768px) 92vw, (max-width:1200px) 45vw, 380px" 
                                srcset="${escapeHtml(thumbnailPath)}-w480.webp 480w, ${escapeHtml(thumbnailPath)}-w640.webp 640w, ${escapeHtml(thumbnailPath)}-w960.webp 960w, ${escapeHtml(thumbnailPath)}-w1280.webp 1280w, ${escapeHtml(thumbnailPath)}.webp 2560w">
                            
                            <img
                                src="${escapeHtml(thumbnailPath)}-w960.png"
                                srcset="${escapeHtml(thumbnailPath)}-w480.png 480w, ${escapeHtml(thumbnailPath)}-w640.png 640w, ${escapeHtml(thumbnailPath)}-w960.png 960w, ${escapeHtml(thumbnailPath)}-w1280.png 1280w, ${escapeHtml(thumbnailPath)}.png 2560w"
                                sizes="(max-width:768px) 92vw, (max-width:1200px) 45vw, 380px"
                                alt="GPIR Country Intelligence Dashboard – ${escapeHtml(metadata.country)}"
                                loading="lazy"
                                decoding="async"
                                width="2560"
                                height="1620">
                        </picture>
                    </a>
                </div>
                
                <div class="dashboard-content">
                    <span class="dashboard-region">
                        ${escapeHtml(regionLabel)}
                    </span>
                    
                    <h3>
                        ${escapeHtml(metadata.country)}
                    </h3>
                    
                    <p>
                        ${escapeHtml(metadata.description)}
                    </p>
                    
                    <div class="dashboard-meta">
                        <span class="status ${metadata.status === 'Published' ? 'published' : 'draft'}">
                            ${escapeHtml(metadata.status)}
                        </span>
                        
                        <span class="edition">
                            ${escapeHtml(metadata.edition)}
                        </span>
                    </div>
                    
                    <div class="dashboard-cta-row">
                        <a
                            href="${escapeHtml(metadata.imagePath)}"
                            data-lightbox-src="${escapeHtml(metadata.imagePath)}"
                            data-lightbox-title="${escapeHtml(metadata.country)}"
                            class="dashboard-link">
                            
                            Explore ${escapeHtml(metadata.country)} Dashboard →
                        </a>
                        
                        <a href="${escapeHtml(countryPage)}" class="dashboard-link dashboard-link-secondary">
                            View Country Page →
                        </a>
                    </div>
                </div>
            `;

            if(countryPage) cardsByPage.set(countryPage, card);
            if(countryRecord?.title) cardsByName.set(countryRecord.title, card);
            gallery.appendChild(card);
        });
        
        // Trigger lightbox initialization on newly added cards
        if(typeof initializeLightbox === 'function') {
            initializeLightbox();
        }
        if(typeof initializeDashboardReader === "function") {
            initializeDashboardReader();
        }
        return liveCountryRequest.then(rows => {
            rows.forEach(row => {
                if(typeof row.intelligence_summary !== "string" || !row.intelligence_summary.trim()) return;
                const card = cardsByPage.get(row.page) || cardsByName.get(row.country_name);
                const description = card?.querySelector(".dashboard-content > p");
                if(description) description.textContent = row.intelligence_summary;
            });
        });
    })
    .catch(err => {
        console.error("[GPIR] Dashboard gallery generation failed:", err);
        // Gallery remains empty but doesn't break page
    });
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text == null ? "" : String(text);
    return div.innerHTML;
}

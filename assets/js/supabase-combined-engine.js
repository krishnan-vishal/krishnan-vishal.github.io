import { createClient } from "https://jsdelivr.net";

// ==========================================
// 🔑 CORE CONFIGURATION (FILL WITH YOUR KEYS)
// ==========================================
const SUPABASE_URL = "https://qlnvhfapctcpzqyuhhth.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFsbnZoZmFwY3RjcHpxeXVoaHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODkyOTA1NjYsImV4cCI6MjEwNDg2NjU2Nn0.5V_Oe-J4FtPWsUS3R8n9R2u5T-mzUoaIN3O6PCPpHAI";

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ==========================================
// 🎨 INJECT COMPACT HIGH-DENSITY VISUAL STYLES
// ==========================================
const styleElement = document.createElement("style");
styleElement.textContent = `
    /* Ultra-Compact Global Ticker Strip (Matches FX Ticker Space) */
    .gpir-compact-ticker-bar {
        width: 100%;
        height: 32px;
        background: #050c16;
        border-top: 1px solid #f6b817;
        border-bottom: 1px solid #f6b817;
        display: flex;
        align-items: center;
        overflow: hidden;
        font-family: sans-serif;
    }
    .gpir-ticker-label {
        background: #f6b817;
        color: #050c16;
        font-size: 10px;
        font-weight: 900;
        text-transform: uppercase;
        padding: 0 10px;
        height: 100%;
        display: flex;
        align-items: center;
        letter-spacing: 0.05em;
        z-index: 10;
        box-shadow: 3px 0 10px rgba(0,0,0,0.5);
    }
    .gpir-ticker-marquee {
        display: flex;
        align-items: center;
        white-space: nowrap;
        padding-left: 20px;
        animation: gpirTickerScroll 60s linear infinite;
    }
    .gpir-ticker-marquee:hover {
        animation-play-state: paused;
    }
    .gpir-ticker-item {
        display: inline-flex;
        align-items: center;
        color: #ffd35a;
        font-size: 12px;
        font-weight: 700;
        margin-right: 40px;
        cursor: pointer;
        text-decoration: none;
    }
    .gpir-ticker-item:hover {
        color: #ffffff;
    }
    .gpir-ticker-badge {
        background: rgba(246, 184, 23, 0.15);
        color: #f6b817;
        font-size: 9px;
        padding: 1px 5px;
        border-radius: 3px;
        margin-right: 8px;
        border: 1px solid rgba(246, 184, 23, 0.3);
    }
    .gpir-ticker-splitter {
        color: #1e2d42;
        margin-left: 40px;
    }

    /* Intelligence Grid Archive Layout Custom Fixes */
    .gpir-clean-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
        gap: 16px;
        margin-top: 20px;
    }
    .gpir-intel-card {
        background: #0b1523;
        border: 1px solid #1e2d42;
        border-radius: 8px;
        padding: 14px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        transition: transform 0.2s, border-color 0.2s;
    }
    .gpir-intel-card:hover {
        border-color: #f6b817;
        transform: translateY(-2px);
    }
    .gpir-card-status-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin-bottom: 8px;
    }
    .status-badge {
        font-size: 9px;
        font-weight: 800;
        text-transform: uppercase;
        padding: 2px 6px;
        border-radius: 4px;
    }
    .status-live { background: rgba(16, 185, 129, 0.15); color: #10b981; border: 1px solid rgba(16, 185, 129, 0.3); }
    .status-archive { background: rgba(156, 163, 175, 0.15); color: #9ca3af; border: 1px solid rgba(156, 163, 175, 0.3); }
    
    .gpir-card-title {
        color: #ffffff;
        font-size: 14px;
        font-weight: 700;
        line-height: 1.4;
        margin: 0 0 8px 0;
    }
    .gpir-card-narration {
        color: #a0aec0;
        font-size: 12px;
        line-height: 1.5;
        margin: 0 0 12px 0;
    }
    .gpir-card-meta {
        font-size: 10px;
        color: #718096;
        display: flex;
        align-items: center;
        justify-content: space-between;
        border-top: 1px solid #1e2d42;
        padding-top: 8px;
    }
    .gpir-verify-btn {
        color: #f6b817;
        text-decoration: none;
        font-weight: 700;
    }
    .gpir-verify-btn:hover { text-decoration: underline; }

    @keyframes gpirTickerScroll {
        0% { transform: translate3d(0, 0, 0); }
        100% { transform: translate3d(-50%, 0, 0); }
    }
`;
document.head.appendChild(styleElement);

// ==========================================
// 🏃 PIPELINE DATA RECOVERY & RENDERING ENGINE
// ==========================================
async function initializeGpirEngine() {
    try {
        // 1. Query records from Supabase
        const { data: records, error } = await supabase
            .from("global_announcements")
            .select("*")
            .eq("publication_status", "approved")
            .order("published_at", { ascending: false });

        if (error) throw error;
        if (!records || records.length === 0) return;

        // Hide any "snapshot fallback" error banner if present
        const alertBanner = document.querySelector(".announcement-dashboard-heading p");
        if (alertBanner) alertBanner.style.display = "none";

        // 2. Separate Live (Latest 24h) and Archive items based on current time context
        const now = new Date("2026-09-15T10:56:00Z"); // Explicit 2026 system clock synch
        const oneDayAgo = now.getTime() - (24 * 60 * 60 * 1000);

        const liveRecords = [];
        const archiveRecords = [];

        records.forEach(rec => {
            const pubTime = new Date(rec.published_at).getTime();
            if (pubTime >= oneDayAgo) {
                liveRecords.push(rec);
            } else {
                archiveRecords.push(rec);
            }
        });

        // 3. Render the Flowing Custom Ribbon Ticker Bar
        renderTicker(records);

        // 4. Render the Core Architecture Grid System
        renderGrid(liveRecords, archiveRecords);

    } catch (err) {
        console.error("Database connection failure, running fallback snapshot layout:", err);
    }
}

function renderTicker(items) {
    const tickerContainer = document.getElementById("announcementTicker");
    if (!tickerContainer) return;

    // Convert parent container into compact layout structure
    const parent = tickerContainer.parentElement;
    parent.className = "gpir-compact-ticker-bar";
    parent.innerHTML = `<div class="gpir-ticker-label">Live Announcements</div>`;

    const marqueeTrack = document.createElement("div");
    marqueeTrack.className = "gpir-ticker-marquee";

    // Build item strip nodes twice for clean endless looping resets
    const tickerItemsHTML = items.slice(0, 15).map(item => `
        <a href="${item.canonical_url}" target="_blank" class="gpir-ticker-item">
            <span class="gpir-ticker-badge">${item.source_id || 'ALERT'}</span>
            ${item.title}
            <span class="gpir-ticker-splitter">|</span>
        </a>
    `).join("");

    marqueeTrack.innerHTML = tickerItemsHTML + tickerItemsHTML;
    parent.appendChild(marqueeTrack);
}

function renderGrid(liveItems, archiveItems) {
    // Locate document nodes targeting grid listings
    const liveSection = document.querySelector("[data-announcement-dashboard] .latest-24h-grid") || 
                        document.getElementById("announcementTicker"); // Graceful DOM alignment
    
    // Select or create target archive presentation container boxes
    let dynamicGridContainer = document.getElementById("gpir-live-archive-grid");
    if (!dynamicGridContainer) {
        dynamicGridContainer = document.createElement("div");
        dynamicGridContainer.id = "gpir-live-archive-grid";
        dynamicGridContainer.className = "gpir-clean-grid";
        // Append below filter panel blocks
        const filterPanel = document.querySelector(".announcement-dashboard-filters");
        if (filterPanel) filterPanel.parentNode.insertBefore(dynamicGridContainer, filterPanel.nextSibling);
    }

    // Combine and structure layout rendering cells mapping clean metrics data
    const allDisplayItems = [...liveItems.map(i => ({...i, isLive: true})), ...archiveItems.map(i => ({...i, isLive: false}))];
    
    dynamicGridContainer.innerHTML = allDisplayItems.map(item => `
        <div class="gpir-intel-card">
            <div>
                <div class="gpir-card-status-row">
                    <span class="status-badge ${item.isLive ? 'status-live' : 'status-archive'}">
                        ${item.isLive ? '● Live Recent' : '📦 Archived'}
                    </span>
                    <span style="color: #f6b817; font-size: 10px; font-weight:800;">${item.country_iso3 || 'GLOBAL'}</span>
                </div>
                <h3 class="gpir-card-title">${item.title}</h3>
                <p class="gpir-card-narration">${item.summary_narration || 'AI Narration synthesis pending engine pass...'}</p>
            </div>
            <div class="gpir-card-meta">
                <span>${new Date(item.published_at).toLocaleDateString()}</span>
                <a href="${item.canonical_url}" target="_blank" class="gpir-verify-btn">Verify Source ↗</a>
            </div>
        </div>
    `).join("");
}

// Fire calculation loop automatically on asset frame compilation
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initializeGpirEngine);
} else {
    initializeGpirEngine();
}

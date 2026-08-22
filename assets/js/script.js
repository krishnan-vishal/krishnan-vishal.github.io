/*=====================================================
  GPIR WEBSITE
  Version 1.1
======================================================*/

document.addEventListener("DOMContentLoaded", () => {

    initializeWebsite();

});

function initializeWebsite(){

    console.log("GPIR Version 1.1 Loaded");

    initializeSmoothScroll();

    initializeBackToTop();

    initializeMobileNav();

    initializeHeaderScrollState();

    initializeActiveNavLink();

    initializeScrollReveal();

    initializeStatCounters();

    initializeAdaptiveNav();

    initializeMegaMenuHoverIntent();

    initializeMobileMegaAccordion();

    initializeSearch();

    initializeFloatingBackToTop();

    initializeReadingProgress();

    initializeTickerVisibilityPause();

}

/*=====================================================
  FLOATING BACK TO TOP

  A compact, scroll-triggered control distinct from the existing
  footer "Back to Top" link — appears only after meaningful scroll
  so it stays out of the way on short pages.
======================================================*/

function initializeFloatingBackToTop(){

    const btn = document.createElement("button");

    btn.type = "button";
    btn.id = "floating-back-to-top";
    btn.setAttribute("aria-label", "Back to top");
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>';

    document.body.appendChild(btn);

    btn.addEventListener("click", () => {
        window.scrollTo({ top: 0, behavior: "smooth" });
    });

    const toggle = () => {
        btn.classList.toggle("is-visible", window.scrollY > 600);
    };

    document.addEventListener("scroll", toggle, { passive: true });
    toggle();

}

/*=====================================================
  READING PROGRESS

  A thin, subtle bar reflecting how far down the page the reader
  has scrolled — helps orient readers on long research pages.
======================================================*/

function initializeReadingProgress(){

    const bar = document.createElement("div");

    bar.id = "reading-progress-bar";
    bar.setAttribute("aria-hidden", "true");

    document.body.appendChild(bar);

    const update = () => {
        const scrollable = document.documentElement.scrollHeight - document.documentElement.clientHeight;
        const ratio = scrollable > 0 ? Math.min(1, Math.max(0, window.scrollY / scrollable)) : 0;
        bar.style.width = (ratio * 100) + "%";
    };

    document.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();

}

/*=====================================================
  ADAPTIVE NAV — priority + overflow

  Measures the actual rendered width of the top-level nav items and
  moves whichever ones don't fit into a "More" panel, instead of
  shrinking text/spacing until things happen to fit. Runs above the
  mobile breakpoint only; the accordion below it already shows every
  category directly, so there's nothing to overflow there.
======================================================*/

function initializeAdaptiveNav(){

    const mainNav = document.querySelector(".main-nav");

    const list = mainNav ? mainNav.querySelector(":scope > ul") : null;

    const moreItem = document.querySelector("[data-nav-more]");

    const toolsEl = document.querySelector(".header-tools");

    const headerContainer = document.querySelector(".header-container");

    const brandEl = document.querySelector(".brand");

    if(!mainNav || !list || !moreItem || !headerContainer || !brandEl) return;

    const moreList = moreItem.querySelector(".nav-more-list");

    const mobileQuery = window.matchMedia("(max-width:767px)");

    // "More" is a permanent static category (Resources / Directory /
    // FINTECHOISIS / Legal) now, not a hidden-until-needed overflow
    // bucket, so it's excluded from the measured/overflow-able items
    // but always counted in the width budget below.
    const originalItems = Array.from(list.children).filter(li => li !== moreItem);

    const getGapPx = (el) => {
        const cs = getComputedStyle(el);
        const gap = parseFloat(cs.columnGap || cs.gap);
        return isNaN(gap) ? 0 : gap;
    };

    const restoreAll = () => {
        originalItems.forEach(li => { li.hidden = false; });
        moreList.innerHTML = "";
    };

    const recalc = () => {

        if(mobileQuery.matches){
            restoreAll();
            return;
        }

        restoreAll();

        // .main-nav itself can't be measured directly here: as a flex item
        // with nowrap text it won't shrink below its content's natural
        // width, so its own rect is the "wants to be this wide" size, not
        // the actual budget. Derive the budget from the header container
        // and brand instead, which stay correctly sized.
        const containerRect = headerContainer.getBoundingClientRect();
        const brandWidth = brandEl.getBoundingClientRect().width;
        const containerGap = getGapPx(headerContainer);
        const toolsWidth = toolsEl ? toolsEl.getBoundingClientRect().width : 0;
        const mainNavGap = getGapPx(mainNav);

        // .search-toggle sits in .header-container as its own flex item
        // (outside .header-tools, so it stays reachable on mobile too),
        // and is display:none only inside the mobile drawer breakpoint —
        // above that it always takes up real width plus one more gap.
        const searchToggleEl = document.querySelector(".search-toggle");
        const searchToggleWidth = (searchToggleEl && searchToggleEl.offsetParent !== null)
            ? searchToggleEl.getBoundingClientRect().width + containerGap
            : 0;

        const available = containerRect.width - brandWidth - containerGap - toolsWidth - mainNavGap - searchToggleWidth - 4;

        const listGap = getGapPx(list);

        // moreItem is always rendered now, so its real width is always
        // part of the budget (no more measure-then-hide dance).
        const moreWidth = moreItem.getBoundingClientRect().width;

        const widths = originalItems.map(li => li.getBoundingClientRect().width);
        const totalWidth = widths.reduce((sum, w) => sum + w, 0) + listGap * (originalItems.length - 1) + moreWidth + listGap;

        if(totalWidth <= available) return;

        let overflowCount = 0;
        let remainingWidth = totalWidth;
        const budget = available;

        while(overflowCount < originalItems.length && remainingWidth > budget){
            overflowCount++;
            const idx = originalItems.length - overflowCount;
            remainingWidth -= (widths[idx] + listGap);
        }

        if(overflowCount === 0) return;

        // Genuinely-overflowing categories are degraded to a simple link
        // in the More panel's overflow shelf, rather than moved wholesale
        // with their own nested mega-menu — keeps this rare edge case
        // (very cramped desktop widths) simple and predictable.
        originalItems
            .slice(originalItems.length - overflowCount)
            .forEach(li => {
                const trigger = li.querySelector(":scope > a");
                if(!trigger) return;
                const label = (trigger.textContent || "").trim();
                li.hidden = true;
                const shelfItem = document.createElement("li");
                const shelfLink = document.createElement("a");
                shelfLink.href = trigger.getAttribute("href") || "#";
                shelfLink.textContent = label;
                shelfItem.appendChild(shelfLink);
                moreList.appendChild(shelfItem);
            });

    };

    let queued = false;

    const scheduleRecalc = () => {
        if(queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            recalc();
        });
    };

    scheduleRecalc();

    window.addEventListener("resize", scheduleRecalc);

    window.addEventListener("load", scheduleRecalc);

    mobileQuery.addEventListener("change", scheduleRecalc);

    if(document.fonts && document.fonts.ready){
        document.fonts.ready.then(scheduleRecalc);
    }

}

function initializeMobileMegaAccordion(){

    const mobileQuery = window.matchMedia("(max-width:767px)");

    const items = document.querySelectorAll(".nav-item-mega");

    const collapseAll = () => {

        items.forEach(item => {

            item.classList.remove("is-expanded");

            const menu = item.querySelector(".mega-menu");

            if(menu) menu.style.maxHeight = "";

            const itemTrigger = item.querySelector(":scope > .nav-mega-trigger");

            if(itemTrigger) itemTrigger.setAttribute("aria-expanded","false");

        });

    };

    items.forEach(item => {

        const trigger = item.querySelector(".nav-mega-trigger");

        const menu = item.querySelector(".mega-menu");

        if(!trigger || !menu) return;

        trigger.addEventListener("click", (e) => {

            if(!mobileQuery.matches) return;

            e.preventDefault();

            const isExpanded = item.classList.contains("is-expanded");

            items.forEach(other => {
                if(other !== item){
                    other.classList.remove("is-expanded");
                    const otherMenu = other.querySelector(".mega-menu");
                    if(otherMenu) otherMenu.style.maxHeight = "";
                    const otherTrigger = other.querySelector(":scope > .nav-mega-trigger");
                    if(otherTrigger) otherTrigger.setAttribute("aria-expanded","false");
                }
            });

            if(isExpanded){

                item.classList.remove("is-expanded");
                menu.style.maxHeight = "";
                trigger.setAttribute("aria-expanded","false");

            } else {

                item.classList.add("is-expanded");
                menu.style.maxHeight = menu.scrollHeight + "px";
                trigger.setAttribute("aria-expanded","true");

            }

        });

    });

    mobileQuery.addEventListener("change", collapseAll);

}

function initializeMegaMenuHoverIntent(){

    const CLOSE_DELAY = 260;

    const EDGE_MARGIN = 16;

    // Touch devices (tablets, touch laptops) don't fire hover reliably,
    // so above the mobile-accordion breakpoint they need tap-to-toggle
    // instead of relying on mouseenter/mouseleave.
    const hoverCapable = window.matchMedia("(hover:hover) and (pointer:fine)").matches;

    const mobileQuery = window.matchMedia("(max-width:767px)");

    const closeMegaItem = (item) => {
        item.classList.remove("is-open");
        const itemTrigger = item.querySelector(":scope > .nav-mega-trigger");
        if(itemTrigger) itemTrigger.setAttribute("aria-expanded","false");
    };

    // Escape-close refocuses the trigger for accessibility, but that
    // focus() call itself fires "focusin" — which the per-item listener
    // below would otherwise read as "user tabbed/clicked in, reopen me,"
    // undoing the very close it's part of. This flag tells that listener
    // to skip the reopen for the one focusin caused by our own call.
    let suppressFocusOpen = false;

    document.querySelectorAll(".nav-item-mega").forEach(item => {

        let closeTimer = null;

        const menu = item.querySelector(".mega-menu");

        const trigger = item.querySelector(".nav-mega-trigger");

        const applyEdgeGuard = () => {

            if(!menu) return;

            menu.style.setProperty("--edge-shift", "0px");

            const rect = menu.getBoundingClientRect();

            let shift = 0;

            if(rect.right > window.innerWidth - EDGE_MARGIN){
                shift -= (rect.right - (window.innerWidth - EDGE_MARGIN));
            }

            if(rect.left + shift < EDGE_MARGIN){
                shift += (EDGE_MARGIN - (rect.left + shift));
            }

            menu.style.setProperty("--edge-shift", `${shift}px`);

        };

        const open = () => {
            if(closeTimer){
                clearTimeout(closeTimer);
                closeTimer = null;
            }
            applyEdgeGuard();
            item.classList.add("is-open");
            if(trigger) trigger.setAttribute("aria-expanded","true");
        };

        const close = () => {
            if(closeTimer){
                clearTimeout(closeTimer);
                closeTimer = null;
            }
            item.classList.remove("is-open");
            if(trigger) trigger.setAttribute("aria-expanded","false");
        };

        const scheduleClose = () => {
            if(closeTimer) clearTimeout(closeTimer);
            closeTimer = setTimeout(() => {
                item.classList.remove("is-open");
                if(trigger) trigger.setAttribute("aria-expanded","false");
                closeTimer = null;
            }, CLOSE_DELAY);
        };

        if(hoverCapable){

            item.addEventListener("mouseenter", open);
            item.addEventListener("mouseleave", scheduleClose);

        }

        // On the click-to-toggle branch, a pointer click focuses the trigger
        // *before* the click event fires, so an unconditional open() here
        // would already be open by the time the click handler reads
        // wasOpen — cancelling the tap out from under it. Keyboard (tab)
        // focus should still open it, so gate on :focus-visible, which
        // browsers only set true for non-pointer focus.
        item.addEventListener("focusin", () => {
            if(suppressFocusOpen) return;
            if(!hoverCapable && trigger && !trigger.matches(":focus-visible")) return;
            open();
        });

        item.addEventListener("focusout", (e) => {
            if(!item.contains(e.relatedTarget)){
                scheduleClose();
            }
        });

        if(!hoverCapable && trigger){

            trigger.addEventListener("click", (e) => {

                if(mobileQuery.matches) return;

                e.preventDefault();

                const wasOpen = item.classList.contains("is-open");

                document.querySelectorAll(".nav-item-mega.is-open").forEach(other => {
                    if(other !== item && !other.contains(item) && !item.contains(other)){
                        closeMegaItem(other);
                    }
                });

                if(wasOpen) close(); else open();

            });

        }

    });

    if(!hoverCapable){

        document.addEventListener("click", (e) => {

            if(mobileQuery.matches) return;

            document.querySelectorAll(".nav-item-mega.is-open").forEach(item => {
                if(!item.contains(e.target)) closeMegaItem(item);
            });

        });

    }

    document.addEventListener("keydown", (e) => {

        if(e.key !== "Escape" || mobileQuery.matches) return;

        const openItem = document.querySelector(".nav-item-mega.is-open");

        if(!openItem) return;

        const openTrigger = openItem.querySelector(":scope > .nav-mega-trigger");

        closeMegaItem(openItem);

        if(openTrigger){
            suppressFocusOpen = true;
            openTrigger.focus();
            suppressFocusOpen = false;
        }

    });

}

function initializeSmoothScroll(){

    const mobileMegaQuery = window.matchMedia("(max-width:767px)");

    const hoverCapable = window.matchMedia("(hover:hover) and (pointer:fine)").matches;

    document
        .querySelectorAll('a[href^="#"]')
        .forEach(anchor=>{

            anchor.addEventListener("click",function(e){

                if(this.classList.contains("nav-mega-trigger") && (mobileMegaQuery.matches || !hoverCapable)) return;

                const href=this.getAttribute("href");

                if(!href || href==="#") return;

                const target=document.querySelector(href);

                if(!target) return;

                e.preventDefault();

                target.scrollIntoView({

                    behavior:"smooth"

                });

            });

        });

}

function initializeBackToTop(){

    const button=document.querySelector(".back-top");

    if(!button) return;

    button.addEventListener("click",(e)=>{

        e.preventDefault();

        window.scrollTo({

            top:0,

            behavior:"smooth"

        });

    });

}

/*=====================================================
  MOBILE NAVIGATION
======================================================*/

function initializeMobileNav(){

    const header=document.querySelector(".header");

    const toggle=document.querySelector(".nav-toggle");

    const nav=document.querySelector(".main-nav");

    if(!header || !toggle || !nav) return;

    const closeNav=()=>{

        header.classList.remove("nav-open");

        toggle.setAttribute("aria-expanded","false");

        nav.querySelectorAll(".nav-item-mega.is-expanded").forEach(item=>{

            item.classList.remove("is-expanded");

            const menu=item.querySelector(".mega-menu");

            if(menu) menu.style.maxHeight = "";

        });

    };

    toggle.addEventListener("click",()=>{

        const isOpen=header.classList.toggle("nav-open");

        toggle.setAttribute("aria-expanded",isOpen ? "true" : "false");

    });

    const mobileQuery = window.matchMedia("(max-width:767px)");

    nav.querySelectorAll("a").forEach(link=>{

        if(link.classList.contains("nav-mega-trigger")) return;

        link.addEventListener("click",closeNav);

    });

    nav.querySelectorAll(".nav-mega-trigger").forEach(trigger=>{

        trigger.addEventListener("click",(e)=>{

            if(!mobileQuery.matches) closeNav();

        });

    });

    document.addEventListener("keydown",(e)=>{

        if(e.key==="Escape") closeNav();

    });

}

/*=====================================================
  HEADER SCROLL STATE
======================================================*/

function initializeHeaderScrollState(){

    const header=document.querySelector(".header");

    if(!header) return;

    const updateState=()=>{

        header.classList.toggle("scrolled",window.scrollY>12);

    };

    updateState();

    window.addEventListener("scroll",updateState,{passive:true});

}

/*=====================================================
  ACTIVE NAV LINK ON SCROLL
======================================================*/

function initializeActiveNavLink(){

    const links=Array.from(document.querySelectorAll(".main-nav a[href^='#']"));

    if(!links.length) return;

    const sections=links
        .map(link=>{
            const href=link.getAttribute("href");
            if(!href || href==="#") return null;
            return document.querySelector(href);
        })
        .filter(Boolean);

    if(!sections.length) return;

    const setActive=(id)=>{

        links.forEach(link=>{

            link.classList.toggle("active",link.getAttribute("href")===`#${id}`);

        });

    };

    const observer=new IntersectionObserver((entries)=>{

        entries.forEach(entry=>{

            if(entry.isIntersecting){

                setActive(entry.target.id);

            }

        });

    },{

        rootMargin:"-45% 0px -50% 0px",

        threshold:0

    });

    sections.forEach(section=>observer.observe(section));

}

/*=====================================================
  SCROLL REVEAL
======================================================*/

function initializeScrollReveal(){

    const prefersReducedMotion=window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    const targets=document.querySelectorAll(
        [
            ".command-card",
            ".architecture-card",
            ".dashboard-card",
            ".intelligence-tile",
            ".region-card",
            ".observatory-card",
            ".research-card",
            ".framework-item",
            ".about-item"
        ].join(",")
    );

    if(!targets.length) return;

    if(prefersReducedMotion){

        targets.forEach(el=>el.classList.add("is-visible"));

        return;
    }

    const observer=new IntersectionObserver((entries)=>{

        entries.forEach(entry=>{

            if(entry.isIntersecting){

                entry.target.classList.add("is-visible");

                observer.unobserve(entry.target);
            }

        });

    },{

        threshold:0.15,

        rootMargin:"0px 0px -60px 0px"

    });

    targets.forEach(el=>{

        el.classList.add("reveal-on-scroll");

        observer.observe(el);

    });

}

/*=====================================================
  STAT COUNTERS
======================================================*/

function initializeStatCounters(){

    const prefersReducedMotion=window.matchMedia(
        "(prefers-reduced-motion: reduce)"
    ).matches;

    const counters=document.querySelectorAll(
        ".hero-stats h2, .stat-box h4, .global-box h3"
    );

    if(!counters.length) return;

    const parseTarget=(text)=>{

        const match=text.match(/[\d.]+/);

        if(!match) return null;

        return {

            prefix:text.slice(0,match.index),

            number:parseFloat(match[0]),

            suffix:text.slice(match.index+match[0].length),

            decimals:(match[0].split(".")[1]||"").length

        };

    };

    const animateCounter=(el)=>{

        const parsed=parseTarget(el.textContent.trim());

        if(!parsed || prefersReducedMotion) return;

        const duration=1400;

        const start=performance.now();

        const step=(now)=>{

            const progress=Math.min((now-start)/duration,1);

            const eased=1-Math.pow(1-progress,3);

            const value=(parsed.number*eased).toFixed(parsed.decimals);

            el.textContent=`${parsed.prefix}${value}${parsed.suffix}`;

            if(progress<1){

                requestAnimationFrame(step);

            }

        };

        requestAnimationFrame(step);

    };

    const observer=new IntersectionObserver((entries)=>{

        entries.forEach(entry=>{

            if(entry.isIntersecting){

                animateCounter(entry.target);

                observer.unobserve(entry.target);
            }

        });

    },{threshold:0.6});

    counters.forEach(el=>observer.observe(el));

}

/*=====================================================
  SEARCH

  A lightweight client-side "quick jump" over content that
  already exists on the page — the chapter directory and every
  real (non-"#") mega-menu link — rather than a fabricated
  backend search. No results are invented; a query with no
  matches says so plainly.
======================================================*/

function buildSearchIndex(){

    const seen = new Set();

    const index = [];

    const addLinks = (selector) => {

        document.querySelectorAll(selector).forEach(a => {

            const href = a.getAttribute("href");

            if(!href || href === "#") return;

            const strong = a.querySelector("strong");

            const label = (strong ? strong.textContent : a.textContent).trim().replace(/\s+/g," ");

            if(!label) return;

            const key = href + "|" + label;

            if(seen.has(key)) return;

            seen.add(key);

            index.push({ label, href });

        });

    };

    addLinks(".research-directory-grid a");

    addLinks(".main-nav .mega-col-desc-list a");

    addLinks(".main-nav .mega-col a");

    return index;

}

function initializeSearch(){

    const toggle = document.getElementById("search-toggle");

    const overlay = document.getElementById("search-overlay");

    const input = document.getElementById("search-input");

    const resultsEl = document.getElementById("search-results");

    if(!toggle || !overlay || !input || !resultsEl) return;

    const index = buildSearchIndex();

    const addAnnouncementsToIndex = (records) => {

        records.forEach(record => {

            if(record.status === "SOURCE_VERIFICATION_REQUIRED") return;

            index.push({
                label: record.title,
                href: record.gpirMapping ? record.gpirMapping.href : "#market-ribbon",
                intelId: record.id
            });

        });

    };

    if(window.GPIRAnnouncements) addAnnouncementsToIndex(window.GPIRAnnouncements.getRecords());

    document.addEventListener("gpir:announcementsready", (e) => addAnnouncementsToIndex(e.detail.records));

    let activeIndex = -1;

    const escapeHtml = (str) => {

        const div = document.createElement("div");

        div.textContent = str;

        return div.innerHTML;

    };

    const TYPE_LABEL = {
        "GPIR Research": "GPIR Research",
        "GPIR Policy": "GPIR Policy",
        "Global Intelligence": "Global Intelligence"
    };

    const contentResultMarkup = (r) => {

        const location = [r.header, r.category, r.country].filter(Boolean).join(" · ");

        return `<a class="search-result search-result--content" href="${r.href}">
            <span class="search-result-type">${escapeHtml(TYPE_LABEL[r.type] || r.type)}</span>
            <span class="search-result-title">${escapeHtml(r.pageTitle)}${r.sectionTitle && r.sectionTitle !== r.pageTitle ? " — " + escapeHtml(r.sectionTitle) : ""}</span>
            <span class="search-result-excerpt">${r.excerptHtml}</span>
            <span class="search-result-location">${escapeHtml(location)}</span>
        </a>`;

    };

    const renderResults = (navItems, contentResult, query) => {

        activeIndex = -1;

        const contentResults = (contentResult && contentResult.results) || [];
        const contentTotal = (contentResult && contentResult.total) || 0;
        const hasAny = contentResults.length > 0 || navItems.length > 0;

        if(!hasAny){

            const hintNone = window.GPIRI18n ? window.GPIRI18n.t("search.hint_none") : "No matches for “{query}” — try a market, payment rail or chapter title.";

            const hintType = window.GPIRI18n ? window.GPIRI18n.t("search.hint_type") : "Start typing to jump to a chapter, market or intelligence section.";

            resultsEl.innerHTML = query

                ? `<p class="search-empty">${hintNone.replace("{query}", escapeHtml(query))}</p>`

                : `<p class="search-hint">${hintType}</p>`;

            return;

        }

        const parts = [];

        if(window.GPIRContentSearch && window.GPIRContentSearch.hasFailed() && query){
            parts.push(`<p class="search-unavailable">GPIR content search is temporarily unavailable. Navigation results below still work.</p>`);
        } else if(window.GPIRContentSearch && window.GPIRContentSearch.isLoading() && query){
            parts.push(`<p class="search-hint">Loading GPIR content index…</p>`);
        }

        if(query && (contentResults.length || navItems.length)){
            const countLabel = window.GPIRI18n
                ? window.GPIRI18n.t("search.results_count").replace("{count}", contentTotal + navItems.length)
                : `${contentTotal + navItems.length} GPIR results`;
            parts.push(`<p class="search-result-count">${escapeHtml(countLabel)}</p>`);
        }

        contentResults.forEach(r => parts.push(contentResultMarkup(r)));

        navItems.forEach(item => parts.push(
            `<a class="search-result" href="${item.href}"${item.intelId ? ` data-intel-id="${item.intelId}"` : ""}>${escapeHtml(item.label)}</a>`
        ));

        resultsEl.innerHTML = parts.join("");

    };

    const activateResult = (link, e) => {

        const intelId = link.getAttribute("data-intel-id");

        if(intelId && window.GPIRAnnouncements){

            if(e) e.preventDefault();

            close();

            window.GPIRAnnouncements.openDetail(intelId);

            return true;

        }

        return false;

    };

    resultsEl.addEventListener("click", (e) => {

        const link = e.target.closest(".search-result");

        if(link) activateResult(link, e);

    });

    const currentResultLinks = () => Array.from(resultsEl.querySelectorAll(".search-result"));

    const setActive = (i) => {

        const links = currentResultLinks();

        if(!links.length) return;

        activeIndex = (i + links.length) % links.length;

        links.forEach((el,idx) => el.classList.toggle("is-active", idx === activeIndex));

        links[activeIndex].scrollIntoView({ block:"nearest" });

    };

    const open = () => {

        overlay.classList.add("is-open");

        overlay.setAttribute("aria-hidden","false");

        toggle.setAttribute("aria-expanded","true");

        renderResults(index.slice(0,8), null, "");

        requestAnimationFrame(() => requestAnimationFrame(() => input.focus()));

        document.addEventListener("keydown", onKeydown);

        // The ~300KB content-search index is only worth fetching once the
        // reader has actually opened search — most page views never do.
        if(window.GPIRContentSearch){
            window.GPIRContentSearch.load().then(() => {
                const rawQuery = input.value.trim();
                if(!rawQuery || !overlay.classList.contains("is-open")) return;
                const navMatches = index.filter(item => item.label.toLowerCase().includes(rawQuery.toLowerCase())).slice(0,6);
                const contentResult = window.GPIRContentSearch.search(rawQuery, { limit: 8 });
                renderResults(navMatches, contentResult, rawQuery.toLowerCase());
            });
        }

    };

    const close = () => {

        overlay.classList.remove("is-open");

        overlay.setAttribute("aria-hidden","true");

        toggle.setAttribute("aria-expanded","false");

        input.value = "";

        resultsEl.innerHTML = "";

        activeIndex = -1;

        document.removeEventListener("keydown", onKeydown);

        toggle.focus();

    };

    const onKeydown = (e) => {

        if(e.key === "Escape"){

            close();

            return;

        }

        if(e.key === "ArrowDown"){

            e.preventDefault();

            setActive(activeIndex + 1);

            return;

        }

        if(e.key === "ArrowUp"){

            e.preventDefault();

            setActive(activeIndex - 1);

            return;

        }

        if(e.key === "Enter"){

            const links = currentResultLinks();

            const target = activeIndex >= 0 ? links[activeIndex] : links[0];

            if(target){

                e.preventDefault();

                if(!activateResult(target)) window.location.href = target.getAttribute("href");

            }

        }

    };

    toggle.addEventListener("click", () => {

        if(overlay.classList.contains("is-open")) close(); else open();

    });

    // Hover/focus on the search toggle is a strong signal of intent to
    // search — start the index fetch a beat before the click so it's
    // more likely already resolved by the time the reader types.
    const prefetchIndex = () => { if(window.GPIRContentSearch) window.GPIRContentSearch.load(); };
    toggle.addEventListener("mouseenter", prefetchIndex, { once: true });
    toggle.addEventListener("focus", prefetchIndex, { once: true });

    overlay.querySelectorAll("[data-search-close]").forEach(el => {

        el.addEventListener("click", close);

    });

    input.addEventListener("input", () => {

        const rawQuery = input.value.trim();

        const query = rawQuery.toLowerCase();

        if(!query){

            renderResults(index.slice(0,8), null, "");

            return;

        }

        const navMatches = index.filter(item => item.label.toLowerCase().includes(query)).slice(0,6);

        const contentResult = window.GPIRContentSearch ? window.GPIRContentSearch.search(rawQuery, { limit: 8 }) : null;

        renderResults(navMatches, contentResult, query);

    });

}

/*=====================================================
  TICKER VISIBILITY PAUSE

  Same principle already applied to the interactive map's
  corridor-flow/marker-pulse animations: a 60s linear marquee keeps
  animating (and getting painted) even while scrolled off-screen or
  the tab is backgrounded, for no reader benefit. animation-play-state
  freezes a CSS animation at its exact current position and resumes
  from that same position — there is no offset to track manually and
  no restart-from-beginning, so this is a plain visibility toggle, not
  a stateful pause/resume implementation.

  Runs on every page (harmless no-op where the ticker markup doesn't
  exist, e.g. every page but the homepage) rather than only on
  index.html, so a future page that adds a ticker gets this for free.
======================================================*/

function initializeTickerVisibilityPause(){

    const ribbons = [
        document.getElementById("fx-ribbon"),
        document.getElementById("market-ribbon")
    ].filter(Boolean);

    if(!ribbons.length) return;

    const reduceMotion = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduceMotion) return; // already fully static via the existing reduced-motion CSS rule

    // A class toggle (not an inline style) so this never overrides the
    // existing .ticker-track:hover{animation-play-state:paused} rule —
    // hovering to read the ticker keeps working regardless of this
    // visibility-driven pause.
    const setPaused = (ribbon, paused) => {

        const track = ribbon.querySelector(".ticker-track");

        if(track) track.classList.toggle("gpir-ticker-paused", paused);

    };

    ribbons.forEach(ribbon => {

        if("IntersectionObserver" in window){

            const io = new IntersectionObserver((entries) => {

                const entry = entries[0];

                setPaused(ribbon, !entry.isIntersecting || document.hidden);

            }, { threshold: 0.01 });

            io.observe(ribbon);

        }

        document.addEventListener("visibilitychange", () => {

            if(document.hidden){

                setPaused(ribbon, true);

                return;

            }

            if("IntersectionObserver" in window === false){

                setPaused(ribbon, false);

                return;

            }

            const rect = ribbon.getBoundingClientRect();

            const inView = rect.bottom > 0 && rect.top < (window.innerHeight || document.documentElement.clientHeight);

            setPaused(ribbon, !inView);

        });

    });

}

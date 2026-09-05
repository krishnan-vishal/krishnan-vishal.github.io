/*=====================================================
  GPIR WEBSITE
  Version 1.1
======================================================*/

document.addEventListener("DOMContentLoaded", () => {

    initializeWebsite();

});

function initializeWebsite(){

    console.log("GPIR Version 1.1 Loaded");

    // Each feature module is independent, so one throwing (e.g. a bad
    // selector on a page that doesn't have that section) must not stop
    // the rest -- most critically the navigation, which has to keep
    // working even if an unrelated module (map, ticker, search) fails.
    const safeInit = (fn) => {
        try{
            fn();
        } catch(err){
            console.error("[GPIR] " + (fn.name || "init") + " failed:", err);
        }
    };

    safeInit(initializeSmoothScroll);

    safeInit(initializeBackToTop);

    safeInit(initializeMobileNav);

    safeInit(initializeHeaderScrollState);

    safeInit(initializeActiveNavLink);

    safeInit(initializeScrollReveal);

    safeInit(initializeStatCounters);

    safeInit(initializeAdaptiveNav);

    safeInit(initializeMegaMenuHoverIntent);

    safeInit(initializeMobileMegaAccordion);

    safeInit(initializeSearch);

    safeInit(initializeReaderAssistant);

    safeInit(initializeDashboardReader);

    safeInit(initializeFloatingBackToTop);

    safeInit(initializeReadingProgress);

    safeInit(initializeTickerVisibilityPause);

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

    // How far the reader has to scroll away from where a menu was opened
    // before it's treated as "genuinely left the navigation context" (v1
    // menu-accessibility sprint, GPIR-MENU-01) rather than a mega-menu
    // floating stale over unrelated content.
    const SCROLL_CLOSE_THRESHOLD = 80;

    // Touch devices (tablets, touch laptops) don't fire hover reliably,
    // so above the mobile-accordion breakpoint they need tap-to-toggle
    // instead of relying on mouseenter/mouseleave.
    const hoverCapable = window.matchMedia("(hover:hover) and (pointer:fine)").matches;

    const mobileQuery = window.matchMedia("(max-width:767px)");

    // Escape-close refocuses the trigger for accessibility, but that
    // focus() call itself fires "focusin" — which the per-item listener
    // below would otherwise read as "user tabbed/clicked in, reopen me,"
    // undoing the very close it's part of. This flag tells that listener
    // to skip the reopen for the one focusin caused by our own call.
    let suppressFocusOpen = false;

    // Captured the moment any menu opens (not lazily on first scroll
    // event, which would already reflect the post-scroll position and
    // never see a delta). Read by the scroll listener below.
    let scrollAnchorY = null;

    // Single registry every item's controls are added to, so the singleton
    // rule ("only one mega-menu open at a time") and the scroll/resize
    // safeguards below can act on every item without re-querying the DOM
    // or duplicating per-item logic (v1 sprint requires one shared
    // controller, not separate hover logic per menu).
    const controllers = [];

    let menuIdCounter = 0;

    document.querySelectorAll(".nav-item-mega").forEach(item => {

        try{

            let closeTimer = null;

            const menu = item.querySelector(".mega-menu");

            const trigger = item.querySelector(".nav-mega-trigger");

            if(!menu || !trigger) return;

            // Wire aria-controls to a real id so assistive tech can
            // associate the trigger with the panel it expands, without
            // adding roles the interaction model doesn't actually support.
            if(!menu.id){
                menuIdCounter += 1;
                menu.id = "mega-menu-" + menuIdCounter;
            }
            trigger.setAttribute("aria-controls", menu.id);

            const applyEdgeGuard = () => {

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

            // Forces the close transition to complete in ~0s instead of the
            // normal ~280ms fade. Used only when a DIFFERENT item is taking
            // over (singleton switch) or the viewport just changed shape —
            // cases where a lingering fade would mean two menus visibly
            // overlapping, or a stale panel surviving a breakpoint change.
            // The graceful fade is preserved for a genuine "user moved
            // away" close via scheduleClose().
            const closeInstant = () => {
                if(closeTimer){
                    clearTimeout(closeTimer);
                    closeTimer = null;
                }
                item.classList.add("is-instant-close");
                item.classList.remove("is-open");
                trigger.setAttribute("aria-expanded","false");
                requestAnimationFrame(() => {
                    requestAnimationFrame(() => {
                        item.classList.remove("is-instant-close");
                    });
                });
            };

            // closeInstant() alone can't hide the panel here: the pointer
            // is still physically resting over it (that's how it got
            // clicked), so CSS's own `:hover` fallback -- kept for
            // graceful no-JS degradation -- keeps it visible regardless
            // of the is-open class, for the entire window between "link
            // clicked" and "browser actually swaps in the new page". An
            // inline !important override is the one thing that outranks
            // a stylesheet :hover rule in the cascade, so it's the only
            // way to guarantee the panel is gone for that window rather
            // than visibly riding out the navigation.
            const closeForNavigation = () => {
                closeInstant();
                menu.style.setProperty("opacity", "0", "important");
                menu.style.setProperty("visibility", "hidden", "important");
                menu.style.setProperty("pointer-events", "none", "important");
                setTimeout(() => {
                    menu.style.removeProperty("opacity");
                    menu.style.removeProperty("visibility");
                    menu.style.removeProperty("pointer-events");
                }, 1000);
            };

            const open = () => {
                if(closeTimer){
                    clearTimeout(closeTimer);
                    closeTimer = null;
                }
                // Singleton rule: opening this item always closes every
                // other open one immediately, so rapid pointer movement
                // across adjacent primary items can never render two
                // mega-menus at once.
                controllers.forEach(other => {
                    if(other.item !== item && other.item.classList.contains("is-open")){
                        other.closeInstant();
                    }
                });
                applyEdgeGuard();
                item.classList.add("is-open");
                trigger.setAttribute("aria-expanded","true");
                scrollAnchorY = window.scrollY;
            };

            const close = () => {
                if(closeTimer){
                    clearTimeout(closeTimer);
                    closeTimer = null;
                }
                item.classList.remove("is-open");
                trigger.setAttribute("aria-expanded","false");
            };

            const scheduleClose = () => {
                if(closeTimer) clearTimeout(closeTimer);
                closeTimer = setTimeout(() => {
                    item.classList.remove("is-open");
                    trigger.setAttribute("aria-expanded","false");
                    closeTimer = null;
                }, CLOSE_DELAY);
            };

            controllers.push({ item, trigger, menu, open, close, closeInstant, scheduleClose });

            // Activating a real link inside the menu starts a full page
            // navigation, which the browser doesn't complete instantly --
            // the current page (including this open dropdown) stays
            // rendered for that window. Closing it the instant a link is
            // activated means the open panel isn't what's still on screen
            // for that gap, rather than lingering through it.
            menu.querySelectorAll("a[href]").forEach(link => {
                link.addEventListener("click", () => closeForNavigation());
            });

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
                if(!hoverCapable && !trigger.matches(":focus-visible")) return;
                open();
            });

            item.addEventListener("focusout", (e) => {
                if(!item.contains(e.relatedTarget)){
                    scheduleClose();
                }
            });

            if(!hoverCapable){

                trigger.addEventListener("click", (e) => {

                    if(mobileQuery.matches) return;

                    e.preventDefault();

                    const wasOpen = item.classList.contains("is-open");

                    if(wasOpen) close(); else open();

                });

            }

        } catch(err){
            console.error("[GPIR] mega-menu item setup failed:", err);
        }

    });

    if(!hoverCapable){

        document.addEventListener("click", (e) => {

            if(mobileQuery.matches) return;

            controllers.forEach(c => {
                if(c.item.classList.contains("is-open") && !c.item.contains(e.target)) c.closeInstant();
            });

        });

    }

    document.addEventListener("keydown", (e) => {

        if(e.key !== "Escape" || mobileQuery.matches) return;

        const openController = controllers.find(c => c.item.classList.contains("is-open"));

        if(!openController) return;

        openController.closeInstant();

        suppressFocusOpen = true;
        openController.trigger.focus();
        suppressFocusOpen = false;

    });

    // If the reader scrolls meaningfully away from where an open menu was
    // triggered, it's no longer relevant to what's on screen -- close it
    // rather than leaving it floating over unrelated content.
    window.addEventListener("scroll", () => {

        if(scrollAnchorY === null) return;

        const openController = controllers.find(c => c.item.classList.contains("is-open"));

        if(!openController){
            scrollAnchorY = null;
            return;
        }

        if(Math.abs(window.scrollY - scrollAnchorY) > SCROLL_CLOSE_THRESHOLD){
            openController.scheduleClose();
            scrollAnchorY = null;
        }

    }, { passive:true });

    // A viewport resize (desktop <-> tablet <-> mobile, or a plain window
    // resize) can leave a menu positioned for a layout that no longer
    // exists -- close everything instantly and let the next interaction
    // recompute from a clean state, rather than risk a stale panel stuck
    // open across the breakpoint change.
    let resizeTimer = null;

    window.addEventListener("resize", () => {
        if(resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            controllers.forEach(c => {
                if(c.item.classList.contains("is-open")) c.closeInstant();
            });
        }, 120);
    }, { passive:true });

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
                href: "pages/intelligence/" + record.id + ".html",
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

    let readerContextPromise = null;

    const loadReaderContext = () => {
        if(readerContextPromise) return readerContextPromise;
        const script = document.querySelector('script[src*="assets/js/script.js"]');
        const src = script ? script.getAttribute("src") : "assets/js/script.js";
        const prefix = src.replace(/assets\/js\/script\.js.*$/, "assets/data/");
        readerContextPromise = Promise.all([
            fetch(prefix + "content-registry.json").then(response => { if(!response.ok) throw new Error("registry unavailable"); return response.json(); }),
            fetch(prefix + "trusted-sources.json").then(response => { if(!response.ok) throw new Error("source registry unavailable"); return response.json(); }),
            fetch(prefix + "announcements.json").then(response => { if(!response.ok) throw new Error("announcement data unavailable"); return response.json(); })
        ]).then(([registry, sources, announcements]) => ({
            records: registry.records || [],
            sources: sources.registry || [],
            announcements: announcements.records || []
        }));
        return readerContextPromise;
    };

    const registryContextFor = (href, context) => {
        const record = context.records.find(item => item.page === href);
        if(!record) return null;
        const byId = new Map(context.records.map(item => [item.id, item]));
        const visited = new Set([record.id]);
        const related = [];
        let frontier = [record];
        for(let depth = 0; depth < 2 && frontier.length; depth++){
            const next = [];
            frontier.forEach(current => (current.relationships || []).forEach(relationship => {
                const target = byId.get(relationship.target);
                if(!target || visited.has(target.id)) return;
                visited.add(target.id);
                if(target.page) related.push({ title: target.title, href: target.page, meta: target.contentType });
                next.push(target);
            }));
            frontier = next;
        }
        const sourceIds = new Set((record.sourceRefs || []).map(id => id.replace(/^source:/, "")));
        const announcement = context.announcements.find(item => record.sourceRef && record.sourceRef.value === item.id);
        const source = context.sources.find(item => sourceIds.has(item.id));
        return { record, related, announcement, source };
    };

    const provenanceMarkup = (contextInfo, escapeHtml) => {
        if(!contextInfo) return "";
        const { record, announcement, source, related } = contextInfo;
        const rows = [];
        if(source) rows.push(`<dt>Source organisation</dt><dd>${escapeHtml(source.organization)}</dd>`, `<dt>Source type</dt><dd>${escapeHtml(source.sourceType || "Unavailable")}</dd>`, `<dt>Verification date</dt><dd>${escapeHtml(source.lastVerifiedDate || "Unavailable")}</dd>`);
        if(announcement){
            if(announcement.source?.publicationTitle) rows.push(`<dt>Publication</dt><dd>${escapeHtml(announcement.source.publicationTitle)}</dd>`);
            rows.push(`<dt>Published</dt><dd>${escapeHtml(announcement.publishedDate || "Unavailable")}</dd>`, `<dt>Retrieved</dt><dd>${escapeHtml(announcement.retrievedDate || "Unavailable")}</dd>`, `<dt>Content status</dt><dd>${escapeHtml(announcement.contentStatus || "Unavailable")}</dd>`);
            if(announcement.source?.url) rows.push(`<dt>Source URL</dt><dd><a href="${escapeHtml(announcement.source.url)}" target="_blank" rel="noopener noreferrer">View source</a></dd>`);
        }
        const evidence = rows.length ? `<details class="search-result-evidence"><summary>Source / Evidence</summary><dl>${rows.join("")}</dl></details>` : "";
        const relatedMarkup = related.length ? `<details class="search-result-related"><summary>Explore Related</summary><ul>${related.map(item => `<li><a href="${escapeHtml(item.href)}">${escapeHtml(item.title)}</a><small>${escapeHtml(item.meta)}</small></li>`).join("")}</ul></details>` : "";
        return evidence + relatedMarkup;
    };

    const contentResultMarkup = (r, context) => {

        const location = [r.header, r.category, r.country].filter(Boolean).join(" · ");
        const contextInfo = registryContextFor(r.href, context);

        return `<a class="search-result search-result--content" href="${r.href}">
            <span class="search-result-type">${escapeHtml(TYPE_LABEL[r.type] || r.type)}</span>
            <span class="search-result-title">${escapeHtml(r.pageTitle)}${r.sectionTitle && r.sectionTitle !== r.pageTitle ? " — " + escapeHtml(r.sectionTitle) : ""}</span>
            <span class="search-result-excerpt">${r.excerptHtml}</span>
            <span class="search-result-location">${escapeHtml(location)}</span>
        </a>${provenanceMarkup(contextInfo, escapeHtml)}`;

    };

    const renderResults = (navItems, contentResult, query, context) => {

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

        contentResults.forEach(r => parts.push(contentResultMarkup(r, context)));

        navItems.forEach(item => parts.push(
            `<a class="search-result" href="${item.href}"${item.intelId ? ` data-intel-id="${item.intelId}"` : ""}>${escapeHtml(item.label)}</a>`
        ));

        resultsEl.innerHTML = parts.join("");

    };

    const activateResult = (link, e) => {

        const intelId = link.getAttribute("data-intel-id");

        if(e && (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey)) return false;

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

        renderResults(index.slice(0,8), null, "", null);

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
                loadReaderContext().then(context => renderResults(navMatches, contentResult, rawQuery.toLowerCase(), context)).catch(() => renderResults(navMatches, contentResult, rawQuery.toLowerCase(), null));
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

            renderResults(index.slice(0,8), null, "", null);

            return;

        }

        const navMatches = index.filter(item => item.label.toLowerCase().includes(query)).slice(0,6);

        const contentResult = window.GPIRContentSearch ? window.GPIRContentSearch.search(rawQuery, { limit: 8 }) : null;

        if(contentResult && contentResult.results.length){
            loadReaderContext().then(context => renderResults(navMatches, contentResult, query, context)).catch(() => renderResults(navMatches, contentResult, query, null));
        } else {
            renderResults(navMatches, contentResult, query, null);
        }

    });

}

/*=====================================================
  ASK GPIR READER ASSISTANT

  This is a deterministic retrieval layer, not a generative AI service.
  It reuses the existing search index and canonical registry, and falls
  back to headings already present on the current page for explanations.
=====================================================*/

function initializeReaderAssistant(){

    const overlay = document.getElementById("search-overlay");
    const panel = overlay && overlay.querySelector(".search-panel");
    const input = document.getElementById("search-input");
    const results = document.getElementById("search-results");

    if(!overlay || !panel || !input || !results) return;

    const assistant = document.createElement("section");
    assistant.className = "gpir-assistant";
    assistant.hidden = true;
    assistant.setAttribute("aria-labelledby", "gpir-assistant-title");
    assistant.innerHTML = `
        <div class="gpir-assistant-header">
            <div>
                <p class="gpir-assistant-kicker">AI-ready reader tool</p>
                <h2 id="gpir-assistant-title">ASK GPIR</h2>
            </div>
            <button type="button" class="gpir-assistant-close" aria-label="Close ASK GPIR">Close</button>
        </div>
        <p class="gpir-assistant-note">Local retrieval from published GPIR content. Sources remain authoritative.</p>
        <div class="gpir-assistant-actions">
            <button type="button" data-gpir-assistant-example="What countries are currently covered?">Coverage</button>
            <button type="button" data-gpir-assistant-example="Explain this page">Explain this page</button>
            <button type="button" data-gpir-assistant-example="Explore this topic">Explore this topic</button>
        </div>
        <div class="gpir-assistant-answer" aria-live="polite"></div>
    `;

    const searchHeader = panel.querySelector(".search-panel-header");
    if(!searchHeader) return;

    const askButton = document.createElement("button");
    askButton.type = "button";
    askButton.className = "gpir-assistant-trigger";
    askButton.textContent = "ASK GPIR";
    askButton.setAttribute("aria-expanded", "false");
    askButton.setAttribute("aria-controls", "gpir-assistant");
    searchHeader.appendChild(askButton);
    assistant.id = "gpir-assistant";
    panel.insertBefore(assistant, results);

    const answer = assistant.querySelector(".gpir-assistant-answer");
    const closeAssistant = () => {
        assistant.hidden = true;
        askButton.setAttribute("aria-expanded", "false");
        askButton.focus();
    };

    const script = document.querySelector('script[src*="assets/js/script.js"]');
    const scriptSrc = script ? script.getAttribute("src") : "assets/js/script.js";
    const dataPrefix = scriptSrc.replace(/assets\/js\/script\.js.*$/, "assets/data/");
    let contextPromise = null;

    const loadContext = () => {
        if(contextPromise) return contextPromise;
        contextPromise = Promise.all([
            fetch(dataPrefix + "content-registry.json").then(response => {
                if(!response.ok) throw new Error("registry unavailable");
                return response.json();
            }),
            fetch(dataPrefix + "trusted-sources.json").then(response => {
                if(!response.ok) throw new Error("source registry unavailable");
                return response.json();
            }),
            fetch(dataPrefix + "announcements.json").then(response => {
                if(!response.ok) throw new Error("announcement data unavailable");
                return response.json();
            })
        ]).then(([registry, sources, announcements]) => ({
            registry: registry.records || [],
            sources: sources.registry || [],
            announcements: announcements.records || []
        }));
        return contextPromise;
    };

    const escape = (value) => {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    };

    const resultLinks = (items) => items.map(item => `
        <li><a href="${escape(item.href)}">${escape(item.title)}</a>${item.meta ? `<small>${escape(item.meta)}</small>` : ""}</li>
    `).join("");

    const currentPath = () => window.location.pathname.replace(/^\//, "") || "index.html";

    const currentRecords = (records) => records.filter(record => record.page === currentPath());

    const recordById = (records) => new Map(records.map(record => [record.id, record]));

    const sourceDetails = (record, context) => {
        const sourceRefs = Array.isArray(record.sourceRefs) ? record.sourceRefs : [];
        const sourceRecords = sourceRefs.map(id => recordById(context.registry).get(id)).filter(Boolean);
        const trustedById = new Map(context.sources.map(source => ["source:" + source.id, source]));
        const announcement = context.announcements.find(item => record.sourceRef && record.sourceRef.value === item.id);
        const sourceItems = sourceRecords.map(sourceRecord => {
            const trusted = trustedById.get(sourceRecord.id);
            return {
                label: trusted ? `${trusted.organization} (${trusted.sourceType || "Source"})` : sourceRecord.title,
                href: null,
                meta: trusted && trusted.lastVerifiedDate ? `Source verified ${trusted.lastVerifiedDate}` : "Verification date unavailable"
            };
        });
        if(announcement && announcement.source){
            sourceItems.push({
                label: `${announcement.source.name} · ${announcement.source.publicationTitle}`,
                href: announcement.source.url,
                meta: [
                    announcement.publishedDate ? `Published ${announcement.publishedDate}` : "Publication date unavailable",
                    announcement.retrievedDate ? `Retrieved ${announcement.retrievedDate}` : "Retrieval date unavailable",
                    announcement.contentStatus || "Verification status unavailable"
                ].join(" · ")
            });
        }
        return sourceItems;
    };

    const relatedRecords = (record, context) => {
        const byId = recordById(context.registry);
        return (record.relationships || [])
            .map(relationship => byId.get(relationship.target))
            .filter(related => related && related.page && related.id !== record.id)
            .map(related => ({ title: related.title, href: related.page, meta: related.contentType }));
    };

    const explainCurrentPage = () => {
        const title = document.querySelector("h1")?.textContent.trim() || document.title;
        const headings = Array.from(document.querySelectorAll("main h2, main h3, .chapter-content h2, .chapter-content h3"))
            .map(heading => heading.textContent.trim())
            .filter(Boolean)
            .slice(0, 6);
        const sections = headings.length ? `<ul>${headings.map(heading => `<li>${escape(heading)}</li>`).join("")}</ul>` : "<p>No structured section headings were found on this page.</p>";
        loadContext().then(context => {
            const records = currentRecords(context.registry);
            const related = records.flatMap(record => relatedRecords(record, context));
            const sources = records.flatMap(record => sourceDetails(record, context));
            const relatedMarkup = related.length ? `<h4>Related GPIR content</h4><ul>${resultLinks(related)}</ul>` : "";
            const sourceMarkup = sources.length ? `<h4>Source / evidence</h4><ul>${sources.map(source => `<li>${source.href ? `<a href="${escape(source.href)}" target="_blank" rel="noopener noreferrer">${escape(source.label)}</a>` : escape(source.label)}<small>${escape(source.meta)}</small></li>`).join("")}</ul>` : "";
            answer.innerHTML = `<h3>${escape(title)}</h3><p>This page contains the following published sections:</p>${sections}${relatedMarkup}${sourceMarkup}<p class="gpir-assistant-source-note">The structure and connections above come from this page and validated GPIR records; this is not a generated factual summary.</p>`;
        }).catch(() => {
            answer.innerHTML = `<h3>${escape(title)}</h3><p>This page contains the following published sections:</p>${sections}<p class="gpir-assistant-source-note">This explanation is assembled from the current page headings; registry context is unavailable.</p>`;
        });
    };

    const answerQuery = (query) => {
        const normalized = query.trim().toLowerCase();
        if(!normalized) return;
        answer.innerHTML = "<p>Looking through the published GPIR index…</p>";

        if(normalized.includes("dashboard") && (normalized.includes("explain") || normalized.includes("details") || normalized.includes("methodology") || normalized.includes("period") || normalized.includes("country") || normalized.includes("direction") || normalized.includes("use case"))){
            const dashboardId = window.location.hash.match(/^#(dashboard-[a-z-]+)$/)?.[1] || document.activeElement?.closest?.(".dashboard-card")?.id;
            const record = (window.GPIRDashboardMetadata || []).find(item => item.dashboardId === dashboardId) || (window.GPIRDashboardMetadata || [])[0];
            if(!record){
                // No on-page dashboard card (e.g. a country page): fall back to the
                // canonical registry's deterministic COUNTRY→DASHBOARD relationship
                // so the reader is pointed to the existing homepage dashboard card
                // instead of a dead end.
                loadContext().then(context => {
                    const byId = recordById(context.registry);
                    const rootPrefix = dataPrefix.replace(/assets\/data\/$/, "");
                    const dashboards = currentRecords(context.registry)
                        .flatMap(pageRecord => (pageRecord.relationships || []))
                        .filter(relationship => relationship.type === "DASHBOARD")
                        .map(relationship => byId.get(relationship.target))
                        .filter(Boolean);
                    answer.innerHTML = dashboards.length
                        ? `<h3>Country Intelligence Dashboard</h3><p>This page's dashboard is published on the GPIR homepage dashboard gallery.</p><ul>${resultLinks(dashboards.map(dashboard => ({ title: dashboard.title, href: rootPrefix + "index.html#" + dashboard.slug, meta: "Homepage dashboard gallery" })))}</ul><p class="gpir-assistant-source-note">This link comes from a validated GPIR registry relationship, not an inferred match.</p>`
                        : "<p>No structured dashboard metadata is available on this page.</p>";
                }).catch(() => { answer.innerHTML = "<p>No structured dashboard metadata is available on this page.</p>"; });
                return;
            }
            const unavailable = "Not available in existing dashboard metadata";
            answer.innerHTML = `<h3>${dashboardReaderEscape(record.title)} dashboard</h3><dl class="gpir-assistant-dashboard-details"><dt>Country</dt><dd>${dashboardReaderEscape(record.country || unavailable)}</dd><dt>Region</dt><dd>${dashboardReaderEscape(record.region || unavailable)}</dd><dt>Period</dt><dd>${dashboardReaderEscape(record.period || unavailable)}</dd><dt>Direction</dt><dd>${dashboardReaderEscape(record.direction || unavailable)}</dd><dt>Use case</dt><dd>${dashboardReaderEscape(record.useCase || unavailable)}</dd><dt>Metric</dt><dd>${dashboardReaderEscape(record.metric || unavailable)}</dd><dt>Source</dt><dd>${dashboardReaderEscape(record.source || unavailable)}</dd><dt>Methodology</dt><dd>${dashboardReaderEscape(record.methodology || "Methodology not available in existing dashboard metadata")}</dd></dl><p class="gpir-assistant-source-note">This dashboard reader exposes existing metadata only; it does not infer missing values.</p>`;
            return;
        }

        if(normalized.includes("explain this") || normalized.includes("summarize this")){
            explainCurrentPage();
            return;
        }

        if(normalized.includes("what countries") || normalized.includes("countries covered")){
            loadContext().then(context => {
                const countries = context.registry
                    .filter(record => record.contentType === "COUNTRY" && record.status === "active")
                    .map(record => ({ title: record.title, href: record.page, meta: "Active country page" }));
                answer.innerHTML = countries.length
                    ? `<h3>Active GPIR country coverage</h3><ul>${resultLinks(countries)}</ul><p class="gpir-assistant-source-note">Coverage is read from the canonical content registry.</p>`
                    : "<p>No active country records are currently indexed.</p>";
            }).catch(() => { answer.innerHTML = "<p>The canonical content registry is temporarily unavailable.</p>"; });
            return;
        }

        if(normalized.includes("explore this topic")){
            const pageTitle = document.querySelector("h1")?.textContent.trim() || document.title;
            input.value = pageTitle;
            answerQuery(pageTitle);
            return;
        }

        if(normalized.includes("what should i read next") || normalized.includes("read next") || normalized.includes("related content")){
            loadContext().then(context => {
                const records = currentRecords(context.registry);
                const next = [];
                const seen = new Set();
                records.forEach(record => {
                    const related = relatedRecords(record, context);
                    related.forEach(item => {
                        if(seen.has(item.href)) return;
                        seen.add(item.href);
                        next.push(item);
                    });
                });
                answer.innerHTML = next.length
                    ? `<h3>Suggested next reading</h3><ul>${resultLinks(next.slice(0, 6))}</ul><p class="gpir-assistant-source-note">Suggestions come only from validated GPIR registry relationships.</p>`
                    : "<p>No validated related GPIR page is available for this record.</p>";
            }).catch(() => { answer.innerHTML = "<p>Validated related content is temporarily unavailable.</p>"; });
            return;
        }

        if(normalized.includes("source") || normalized.includes("evidence")){
            loadContext().then(context => {
                const records = currentRecords(context.registry);
                const sources = records.flatMap(record => sourceDetails(record, context));
                answer.innerHTML = sources.length
                    ? `<h3>Source / evidence</h3><ul>${sources.map(source => `<li>${source.href ? `<a href="${escape(source.href)}" target="_blank" rel="noopener noreferrer">${escape(source.label)}</a>` : escape(source.label)}<small>${escape(source.meta)}</small></li>`).join("")}</ul><p class="gpir-assistant-source-note">This metadata comes from existing GPIR records; source trust is not independent factual verification.</p>`
                    : "<p>No source or evidence metadata is available for this page.</p>";
            }).catch(() => { answer.innerHTML = "<p>Source and evidence metadata is temporarily unavailable.</p>"; });
            return;
        }

        if(!window.GPIRContentSearch){
            answer.innerHTML = "<p>Published content search is unavailable on this page.</p>";
            return;
        }

        window.GPIRContentSearch.load().then(() => {
            const found = window.GPIRContentSearch.search(query, { limit: 6 });
            if(!found.results.length){
                answer.innerHTML = `<p>No published GPIR content matched <strong>${escape(query)}</strong>.</p>`;
                return;
            }
            const items = found.results.map(result => ({
                title: result.pageTitle + (result.sectionTitle && result.sectionTitle !== result.pageTitle ? " — " + result.sectionTitle : ""),
                href: result.href,
                meta: [result.type, result.category, result.country].filter(Boolean).join(" · ")
            }));
            answer.innerHTML = `<h3>Published GPIR matches</h3><ul>${resultLinks(items)}</ul><p class="gpir-assistant-source-note">Results are retrieved from the static GPIR search index.</p>`;
        }).catch(() => { answer.innerHTML = "<p>Published content search is temporarily unavailable.</p>"; });
    };

    askButton.addEventListener("click", () => {
        assistant.hidden = !assistant.hidden;
        askButton.setAttribute("aria-expanded", String(!assistant.hidden));
        if(!assistant.hidden) assistant.querySelector("[data-gpir-assistant-example]")?.focus();
    });

    assistant.querySelector(".gpir-assistant-close").addEventListener("click", closeAssistant);
    assistant.querySelectorAll("[data-gpir-assistant-example]").forEach(button => {
        button.addEventListener("click", () => answerQuery(button.getAttribute("data-gpir-assistant-example")));
    });

    input.addEventListener("keydown", (event) => {
        if(event.key === "Enter" && !event.shiftKey && !assistant.hidden){
            event.preventDefault();
            answerQuery(input.value);
        }
    });

}

/*=====================================================
  STRUCTURED DASHBOARD READER

  Reads only the dashboard metadata extracted from existing homepage cards.
  Null fields remain explicitly unavailable; no dashboard values are inferred.
=====================================================*/

function initializeDashboardReader(){

    const cards = document.querySelectorAll(".dashboard-card[id]");
    if(!cards.length) return;

    const script = document.querySelector('script[src*="assets/js/script.js"]');
    const src = script ? script.getAttribute("src") : "assets/js/script.js";
    const dataUrl = src.replace(/assets\/js\/script\.js.*$/, "assets/data/dashboard-metadata.json");

    fetch(dataUrl)
        .then(response => { if(!response.ok) throw new Error("dashboard metadata unavailable"); return response.json(); })
        .then(data => {
            window.GPIRDashboardMetadata = data.records || [];
            const byId = new Map((data.records || []).map(record => [record.dashboardId, record]));
            cards.forEach(card => {
                const record = byId.get(card.id);
                if(!record) return;

                const details = document.createElement("details");
                details.className = "dashboard-reader-details";
                details.innerHTML = `
                    <summary>Dashboard details</summary>
                    <dl>
                        <dt>Country</dt><dd>${dashboardReaderEscape(record.country)}</dd>
                        <dt>Region</dt><dd>${dashboardReaderEscape(record.region)}</dd>
                        <dt>Edition</dt><dd>${dashboardReaderEscape(record.edition)}</dd>
                        <dt>Status</dt><dd>${dashboardReaderEscape(record.status)}</dd>
                        <dt>Period</dt><dd>${dashboardReaderEscape(record.period || "Not available in existing dashboard metadata")}</dd>
                        <dt>Direction</dt><dd>${dashboardReaderEscape(record.direction || "Not available in existing dashboard metadata")}</dd>
                        <dt>Use case</dt><dd>${dashboardReaderEscape(record.useCase || "Not available in existing dashboard metadata")}</dd>
                        <dt>Metric / unit</dt><dd>${dashboardReaderEscape(record.metric || "Not available in existing dashboard metadata")} / ${dashboardReaderEscape(record.unit || "Not available in existing dashboard metadata")}</dd>
                        <dt>Source</dt><dd>${dashboardReaderEscape(record.source || "Not available in existing dashboard metadata")}</dd>
                        <dt>Methodology</dt><dd>${dashboardReaderEscape(record.methodology || "Methodology not available in existing dashboard metadata")}</dd>
                        <dt>Disclaimer</dt><dd>${dashboardReaderEscape(record.disclaimer || "Disclaimer not available in existing dashboard metadata")}</dd>
                    </dl>
                    <p class="dashboard-reader-note">Only metadata already present in the dashboard card is shown. Missing fields are not inferred.</p>
                `;
                const content = card.querySelector(".dashboard-content");
                if(content) content.appendChild(details);
            });
        })
        .catch(() => {
            // Existing dashboard cards remain fully usable when optional metadata fails.
        });

}

function dashboardReaderEscape(value){
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
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

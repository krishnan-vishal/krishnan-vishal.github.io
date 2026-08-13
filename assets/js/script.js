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

    const originalItems = Array.from(list.children).filter(li => li !== moreItem);

    const getGapPx = (el) => {
        const cs = getComputedStyle(el);
        const gap = parseFloat(cs.columnGap || cs.gap);
        return isNaN(gap) ? 0 : gap;
    };

    const restoreAll = () => {
        originalItems.forEach(li => list.insertBefore(li, moreItem));
        moreList.innerHTML = "";
        moreItem.hidden = true;
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

        const available = containerRect.width - brandWidth - containerGap - toolsWidth - mainNavGap - 4;

        const listGap = getGapPx(list);

        moreItem.hidden = false;
        moreItem.style.visibility = "hidden";
        const moreWidth = moreItem.getBoundingClientRect().width;
        moreItem.style.visibility = "";
        moreItem.hidden = true;

        const widths = originalItems.map(li => li.getBoundingClientRect().width);
        const totalWidth = widths.reduce((sum, w) => sum + w, 0) + listGap * Math.max(0, originalItems.length - 1);

        if(totalWidth <= available) return;

        let overflowCount = 0;
        let remainingWidth = totalWidth;
        const budget = available - moreWidth - listGap;

        while(overflowCount < originalItems.length && remainingWidth > budget){
            overflowCount++;
            const idx = originalItems.length - overflowCount;
            remainingWidth -= (widths[idx] + listGap);
        }

        if(overflowCount === 0) return;

        originalItems
            .slice(originalItems.length - overflowCount)
            .forEach(li => moreList.appendChild(li));

        moreItem.hidden = false;

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
                }
            });

            if(isExpanded){

                item.classList.remove("is-expanded");
                menu.style.maxHeight = "";

            } else {

                item.classList.add("is-expanded");
                menu.style.maxHeight = menu.scrollHeight + "px";

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
        };

        const close = () => {
            if(closeTimer){
                clearTimeout(closeTimer);
                closeTimer = null;
            }
            item.classList.remove("is-open");
        };

        const scheduleClose = () => {
            if(closeTimer) clearTimeout(closeTimer);
            closeTimer = setTimeout(() => {
                item.classList.remove("is-open");
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
                        other.classList.remove("is-open");
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
                if(!item.contains(e.target)) item.classList.remove("is-open");
            });

        });

    }

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

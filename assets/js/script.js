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

}

function initializeSmoothScroll(){

    document
        .querySelectorAll('a[href^="#"]')
        .forEach(anchor=>{

            anchor.addEventListener("click",function(e){

                const target=document.querySelector(this.getAttribute("href"));

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

    };

    toggle.addEventListener("click",()=>{

        const isOpen=header.classList.toggle("nav-open");

        toggle.setAttribute("aria-expanded",isOpen ? "true" : "false");

    });

    nav.querySelectorAll("a").forEach(link=>{

        link.addEventListener("click",closeNav);

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
        .map(link=>document.querySelector(link.getAttribute("href")))
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

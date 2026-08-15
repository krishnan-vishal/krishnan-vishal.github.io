/*=====================================================
  GPIR DASHBOARD LIGHTBOX

  Root cause fixed: dashboard preview links used to open the raw
  PNG file directly (target="_blank"), which navigates the browser
  away from the protected page entirely — a bare image file has no
  DOM, no script, so content-protection.js could never run against
  it and the native "Save image as / Copy image" menu was always
  fully available there, regardless of any in-page protection.

  This module keeps the dashboard image inside the current,
  protected page: it intercepts clicks on any [data-lightbox-src]
  trigger, opens the image in an in-page modal instead of
  navigating, and leaves it to the existing content-protection.js
  document-level contextmenu/drag handlers (already loaded on every
  page that includes this script) to apply to it like any other
  in-page element. Same honest scope as content-protection.js: this
  deters casual right-click/drag saving, it does not and cannot stop
  devtools, view-source or a determined user.
======================================================*/

(function(){

    let lightbox = null;
    let lightboxImg = null;
    let lightboxTitle = null;
    let lastFocused = null;

    function buildLightbox(){

        if(lightbox) return lightbox;

        lightbox = document.createElement("div");
        lightbox.className = "gpir-lightbox";
        lightbox.id = "gpir-lightbox";
        lightbox.setAttribute("role", "dialog");
        lightbox.setAttribute("aria-modal", "true");
        lightbox.setAttribute("aria-label", "Dashboard preview");
        lightbox.hidden = true;

        lightbox.innerHTML = `
            <div class="gpir-lightbox-backdrop" data-lightbox-close></div>
            <div class="gpir-lightbox-panel">
                <button type="button" class="gpir-lightbox-close" data-lightbox-close aria-label="Close preview">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
                <div class="gpir-lightbox-image-wrap">
                    <img class="gpir-lightbox-image" src="" alt="" draggable="false">
                </div>
                <div class="gpir-lightbox-caption">
                    <span class="gpir-lightbox-title"></span>
                    <span class="gpir-lightbox-note">GPIR content is protected — right-click, drag and save are disabled here. Use the repository link to reference this dashboard.</span>
                </div>
            </div>
        `;

        document.body.appendChild(lightbox);

        lightboxImg = lightbox.querySelector(".gpir-lightbox-image");
        lightboxTitle = lightbox.querySelector(".gpir-lightbox-title");

        lightbox.addEventListener("click", (e) => {
            if(e.target.closest("[data-lightbox-close]")) closeLightbox();
        });

        document.addEventListener("keydown", (e) => {
            if(e.key === "Escape" && !lightbox.hidden) closeLightbox();
        });

        return lightbox;
    }

    function openLightbox(src, title, triggerEl){

        buildLightbox();

        lightboxImg.src = src;
        lightboxImg.alt = title ? `GPIR Country Intelligence Dashboard — ${title}` : "GPIR Country Intelligence Dashboard";
        lightboxTitle.textContent = title || "GPIR Country Intelligence Dashboard";

        lastFocused = triggerEl || document.activeElement;

        lightbox.hidden = false;
        requestAnimationFrame(() => lightbox.classList.add("is-visible"));

        document.body.classList.add("gpir-lightbox-open");

        const closeBtn = lightbox.querySelector(".gpir-lightbox-close");
        if(closeBtn) closeBtn.focus();
    }

    function closeLightbox(){

        if(!lightbox || lightbox.hidden) return;

        lightbox.classList.remove("is-visible");
        document.body.classList.remove("gpir-lightbox-open");

        setTimeout(() => {
            lightbox.hidden = true;
            lightboxImg.src = "";
        }, 200);

        if(lastFocused && typeof lastFocused.focus === "function") lastFocused.focus();
    }

    document.addEventListener("click", (e) => {

        const trigger = e.target.closest("[data-lightbox-src]");
        if(!trigger) return;

        e.preventDefault();

        openLightbox(
            trigger.getAttribute("data-lightbox-src"),
            trigger.getAttribute("data-lightbox-title"),
            trigger
        );

    });

    window.GPIRDashboardLightbox = { open: openLightbox, close: closeLightbox };

})();

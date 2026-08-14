/*=====================================================
  GPIR CONTENT PROTECTION LAYER

  Honest scope: this deters ordinary, casual copying — right-click
  save, drag-and-drop, plain select-and-copy, Ctrl/Cmd+C/X/S/P/U/A,
  ordinary printing. It does NOT and cannot prevent view-source,
  browser devtools, reader mode, screenshots or a determined user —
  no client-side script can. The site's own language reflects that:
  "content reproduction is restricted," never "cannot be copied."

  Never applies to form controls: inputs, textareas, selects and
  contenteditable elements (search box, language/currency selects,
  intel-report reason picker, etc.) always behave normally, so nothing
  a reader legitimately needs to type, select or submit is affected.
======================================================*/

(function(){

    const TOAST_MESSAGE = "GPIR content is protected. Please use the repository and source links.";

    function isFormField(el){
        if(!el) return false;
        const tag = el.tagName;
        return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || !!el.isContentEditable;
    }

    let toastTimer = null;

    function showToast(message){

        let toast = document.getElementById("gpir-protection-toast");

        if(!toast){
            toast = document.createElement("div");
            toast.id = "gpir-protection-toast";
            toast.className = "gpir-toast";
            toast.setAttribute("role", "status");
            toast.setAttribute("aria-live", "polite");
            document.body.appendChild(toast);
        }

        toast.textContent = message;
        toast.classList.add("is-visible");

        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => toast.classList.remove("is-visible"), 3000);

    }

    function injectPrintNotice(){

        if(document.getElementById("gpir-print-notice")) return;

        const notice = document.createElement("div");
        notice.id = "gpir-print-notice";
        notice.innerHTML = `
            <p>GPIR content is intended for digital research access. Printing and reproduction are restricted under the FINTECHOISIS Copyright &amp; Intellectual Property Policy.</p>
            <p>RETURN TO GPIR — krishnan-vishal.github.io</p>
        `;
        document.body.appendChild(notice);

    }

    document.addEventListener("contextmenu", (e) => {
        if(isFormField(e.target)) return;
        e.preventDefault();
        showToast(TOAST_MESSAGE);
    });

    document.addEventListener("dragstart", (e) => {
        if(e.target && e.target.tagName === "IMG"){
            e.preventDefault();
        }
    });

    document.addEventListener("copy", () => {
        if(isFormField(document.activeElement)) return;
        showToast(TOAST_MESSAGE);
    });

    document.addEventListener("cut", (e) => {
        if(isFormField(document.activeElement)) return;
        e.preventDefault();
        showToast(TOAST_MESSAGE);
    });

    document.addEventListener("keydown", (e) => {

        if(isFormField(e.target)) return;

        const mod = e.ctrlKey || e.metaKey;

        if(!mod) return;

        const key = (e.key || "").toLowerCase();

        if(["c", "x", "u", "s", "a", "p"].includes(key)){
            e.preventDefault();
            showToast(TOAST_MESSAGE);
        }

    });

    injectPrintNotice();

    window.GPIRContentProtection = { showToast };

})();

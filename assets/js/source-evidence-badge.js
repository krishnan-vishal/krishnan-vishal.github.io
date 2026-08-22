/*=====================================================
  GPIR SOURCE / EVIDENCE PRESENTATION COMPONENT
  Implementation 06 -- renders a structured content object's `evidence`
  block (docs/CONTENT_SCHEMA.md §8) as a small, reusable badge, and
  optionally flags any field named in `evidence.analysisFields` as
  FINTECHOISIS's own analysis rather than sourced fact.

  Pure, dependency-free, framework-free -- matches the vanilla-JS
  convention every other engine on the site already follows (see
  docs/ARCHITECTURE_GUARDRAIL.md §3). Not called from any live page yet;
  see _demo/source-evidence-badge-demo.html for a working, inspectable
  render using real classified content objects.

  Usage:
    renderSourceEvidenceBadge(contentObject, containerElement);
    renderAnalysisNote(contentObject, "description", noteContainerElement);
======================================================*/

function escapeHtml(str){
    if(str == null) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

/**
 * Renders the compact evidence pill + source line into `container`.
 * Does nothing (renders nothing, throws nothing) if the object has no
 * populated `evidence` block -- absence of evidence is a valid state
 * (docs/CONTENT_SCHEMA.md §8.1), not an error to surface loudly.
 */
function renderSourceEvidenceBadge(contentObject, container){
    if(!container) return;
    container.innerHTML = "";

    const evidence = contentObject && contentObject.evidence;
    if(!evidence) return;

    const wrap = document.createElement("div");
    wrap.className = "gpir-evidence";

    if(evidence.sourceType || evidence.evidenceType){
        const pill = document.createElement("span");
        pill.className = "gpir-evidence-pill";
        if(evidence.verificationStatus) pill.setAttribute("data-verification", evidence.verificationStatus);

        const parts = [];
        if(evidence.sourceType) parts.push(escapeHtml(evidence.sourceType));
        if(evidence.evidenceType) parts.push(escapeHtml(evidence.evidenceType));
        pill.innerHTML = parts.join('<span class="gpir-evidence-pill-sep">·</span>');
        wrap.appendChild(pill);
    }

    if(evidence.sourceName || evidence.sourceOrganisation){
        const sourceLine = document.createElement("p");
        sourceLine.className = "gpir-evidence-source";
        if(evidence.sourceName && evidence.sourceOrganisation){
            sourceLine.innerHTML = `<strong>${escapeHtml(evidence.sourceName)}</strong> — ${escapeHtml(evidence.sourceOrganisation)}`;
        } else {
            sourceLine.innerHTML = `<strong>${escapeHtml(evidence.sourceName || evidence.sourceOrganisation)}</strong>`;
        }
        wrap.appendChild(sourceLine);
    }

    const metaParts = [];
    if(evidence.lastReviewed) metaParts.push(`Last reviewed ${escapeHtml(evidence.lastReviewed)}`);
    if(evidence.retrievalDate) metaParts.push(`Retrieved ${escapeHtml(evidence.retrievalDate)}`);
    if(evidence.referencePeriod) metaParts.push(`Reference period: ${escapeHtml(evidence.referencePeriod)}`);
    if(metaParts.length){
        const meta = document.createElement("p");
        meta.className = "gpir-evidence-meta";
        meta.textContent = metaParts.join(" · ");
        wrap.appendChild(meta);
    }

    container.appendChild(wrap);
}

/**
 * Renders a small "FINTECHOISIS Analysis" note into `container` only if
 * `fieldName` is listed in the object's `evidence.analysisFields` --
 * the fact-vs-analysis distinction from docs/CONTENT_SCHEMA.md §8.1.
 * No-op (renders nothing) for a field not flagged as analysis, so it's
 * safe to call for every field on a page without conditionals at the
 * call site.
 */
function renderAnalysisNote(contentObject, fieldName, container){
    if(!container) return;
    container.innerHTML = "";

    const evidence = contentObject && contentObject.evidence;
    const analysisFields = (evidence && evidence.analysisFields) || [];
    if(!analysisFields.includes(fieldName)) return;

    const note = document.createElement("div");
    note.className = "gpir-analysis-note";
    note.innerHTML = `<span class="gpir-analysis-note-label">FINTECHOISIS Analysis</span>${escapeHtml(contentObject[fieldName] || "")}`;
    container.appendChild(note);
}

if(typeof module !== "undefined" && module.exports){
    module.exports = { renderSourceEvidenceBadge, renderAnalysisNote };
}

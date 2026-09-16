#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONTRACT_PATH = path.join(ROOT, "docs", "M33-G1-STAGING-DATA-CONTRACT.md");
const REQUIRED_ENTITIES = [
    "SOURCE",
    "RAW_EVIDENCE",
    "PROCESSING_RUN",
    "ASSESSMENT",
    "REJECT",
    "REVIEW",
    "CANDIDATE",
    "CANONICAL_HANDOFF"
];
const REQUIRED_TAXONOMY = [
    "Payments",
    "Banking",
    "Regulation",
    "Fintech",
    "Cross-border Payments",
    "Remittances",
    "RTP / A2A",
    "Cards / Schemes",
    "Wallets",
    "PSP / MTO / MSB / Aggregators",
    "Open Banking / Open Finance",
    "Stablecoins / Digital Assets",
    "CBDC",
    "AML / KYC / KYB / Sanctions",
    "Fraud / Cyber / TPRM",
    "Payment Infrastructure",
    "ISO 20022 / Messaging",
    "FX / Treasury / Settlement",
    "Merchant / Acquiring",
    "Digital Identity",
    "AI / Agentic Payments",
    "BNPL"
];
const REQUIRED_SUPABASE_NAMES = [
    "source_registry",
    "intelligence_raw_ingestion",
    "intelligence_candidates",
    "intelligence_rejection_log",
    "intelligence_ingestion_runs",
    "global_announcements",
    "gpir_rejection_reason",
    "gpir_intelligence_assessment"
];

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function validateContractText(text) {
    const source = String(text || "");
    const errors = [];
    const requirePattern = (pattern, message) => {
        if (!pattern.test(source)) errors.push(message);
    };

    REQUIRED_ENTITIES.forEach((entity, index) => {
        const letter = String.fromCharCode(65 + index);
        requirePattern(
            new RegExp(`^## ${letter}\\. ${escapeRegex(entity)}$`, "m"),
            `missing logical entity section: ${entity}`
        );
    });

    requirePattern(/RAW_PRESERVATION:\s*REQUIRED/, "RAW preservation requirement is missing");
    requirePattern(/including evidence that is later\s+rejected/i, "RAW rejected-evidence retention is missing");
    requirePattern(/RAW never implies `approved`, `published`,\s*`ticker_eligible` or `candidate`/i, "RAW non-publication semantics are missing");
    requirePattern(/`REJECT` is terminal[\s\S]{0,160}requires a deterministic reason/i, "REJECT terminal/reason semantics are missing");
    requirePattern(/`REVIEW` is quarantined and cannot automatically publish/i, "REVIEW quarantine semantics are missing");
    requirePattern(/`CANDIDATE` is eligible for validation only/i, "CANDIDATE validation-only semantics are missing");
    requirePattern(/Only `VALIDATED` may create a `CANONICAL_HANDOFF`/i, "validated-only handoff rule is missing");
    requirePattern(/CANONICAL_HANDOFF[\s\S]{0,260}does not itself[\s\S]{0,160}(?:M30|publication)/i, "canonical handoff is not separated from publication");
    requirePattern(/RAW\s*→\s*PROCESSING\s*→\s*REJECT\s*\|\s*REVIEW\s*\|\s*CANDIDATE/i, "RAW processing state transition is missing");
    requirePattern(/CANDIDATE\s*→\s*VALIDATED\s*\|\s*FAILED_VALIDATION/i, "candidate validation transition is missing");

    REQUIRED_TAXONOMY.forEach(category => {
        requirePattern(new RegExp(`^- ${escapeRegex(category)}$`, "m"), `missing taxonomy family: ${category}`);
    });
    ["primary category", "secondary categories/tags", "jurisdiction/region", "use case", "payment rail", "UNKNOWN"].forEach(term => {
        requirePattern(new RegExp(escapeRegex(term), "i"), `missing taxonomy dimension: ${term}`);
    });
    requirePattern(/extensible, versioned registry/i, "taxonomy extensibility is missing");

    REQUIRED_SUPABASE_NAMES.forEach(objectName => {
        requirePattern(new RegExp(`\\b${escapeRegex(objectName)}\\b`), `missing Supabase reconciliation name: ${objectName}`);
    });
    requirePattern(/\| Existing M30 publication, outside staging \| `global_announcements` \| PUBLICATION-ONLY \|/, "global_announcements must be classified PUBLICATION-ONLY");
    requirePattern(/SCHEMA VERIFICATION REQUIRED/, "schema verification requirement is missing");
    requirePattern(/`EXACT`[\s\S]*`PARTIAL`[\s\S]*`MISSING`[\s\S]*`PUBLICATION-ONLY`[\s\S]*`UNKNOWN`/, "mapping classification legend is incomplete");

    requirePattern(/LOCAL_RUNTIME_DEPENDENCY:\s*NONE/, "local runtime dependency must be NONE");
    requirePattern(/SECRET_OR_CREDENTIAL_REQUIREMENT:\s*NONE/, "secret or credential requirement must be NONE");
    if (/(?:localhost|127\.0\.0\.1|file:\/\/|[A-Za-z]:[\\/]Users[\\/]|\/Users\/|\/home\/)/i.test(source)) {
        errors.push("local-computer runtime path or host detected");
    }
    if (/(?:SUPABASE_SERVICE_ROLE_KEY|BEGIN (?:RSA |OPENSSH |EC )?PRIVATE KEY|password\s*[:=]|api[_-]?key\s*[:=]|\.env\b)/i.test(source)) {
        errors.push("secret or credential material/requirement detected");
    }

    return errors;
}

function runSelfTest(contractText) {
    let checks = 0;
    assert.deepStrictEqual(validateContractText(contractText), [], "authoritative contract fixture must pass");
    checks += 1;

    const withoutRawPreservation = contractText.replace("RAW_PRESERVATION: REQUIRED", "RAW_PRESERVATION: OMITTED");
    assert.ok(validateContractText(withoutRawPreservation).some(error => /RAW preservation/.test(error)), "missing RAW preservation must fail");
    checks += 1;

    const unsafePublicationMapping = contractText.replace(
        "| Existing M30 publication, outside staging | `global_announcements` | PUBLICATION-ONLY |",
        "| Existing M30 publication, outside staging | `global_announcements` | CANDIDATE |"
    );
    assert.ok(validateContractText(unsafePublicationMapping).some(error => /PUBLICATION-ONLY/.test(error)), "unsafe global_announcements mapping must fail");
    checks += 1;

    assert.ok(validateContractText(`${contractText}\nRuntime: localhost`).some(error => /local-computer/.test(error)), "local runtime dependency must fail");
    checks += 1;

    assert.ok(validateContractText(`${contractText}\nSUPABASE_SERVICE_ROLE_KEY=example`).some(error => /secret/.test(error)), "secret requirement must fail");
    checks += 1;

    return checks;
}

function main() {
    try {
        if (!fs.existsSync(CONTRACT_PATH)) throw new Error("contract file does not exist");
        const contractText = fs.readFileSync(CONTRACT_PATH, "utf8");
        const selfTestChecks = runSelfTest(contractText);
        console.log(`M33-G1 data-contract self-test: PASS (${selfTestChecks} checks)`);
        if (process.argv.includes("--self-test")) return;

        const errors = validateContractText(contractText);
        const entityErrors = errors.filter(error => /logical entity/.test(error)).length;
        const taxonomyErrors = errors.filter(error => /taxonomy family/.test(error)).length;
        console.log(`M33-G1 data-contract validation: ${errors.length ? "FAIL" : "PASS"}`);
        console.log(`Logical entities present: ${REQUIRED_ENTITIES.length - entityErrors}/${REQUIRED_ENTITIES.length}`);
        console.log(`Required taxonomy families present: ${REQUIRED_TAXONOMY.length - taxonomyErrors}/${REQUIRED_TAXONOMY.length}`);
        console.log("global_announcements classification: PUBLICATION-ONLY");
        console.log("Schema verification required: YES");
        console.log("Local runtime dependency introduced: NO");
        console.log("Secret or credential requirement introduced: NO");

        if (errors.length) {
            errors.forEach(error => console.error(`- ${error}`));
            process.exitCode = 1;
        }
    } catch (error) {
        console.error(`M33-G1 data-contract validation: ERROR - ${error.message}`);
        process.exitCode = 1;
    }
}

if (require.main === module) main();

module.exports = {
    REQUIRED_ENTITIES,
    REQUIRED_SUPABASE_NAMES,
    REQUIRED_TAXONOMY,
    runSelfTest,
    validateContractText
};

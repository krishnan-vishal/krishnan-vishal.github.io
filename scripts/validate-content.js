#!/usr/bin/env node
/*
 * GPIR structured-content contract check.
 *
 * This is a dev-time check for the static JSON content layer. It validates
 * relationships and publishing invariants without claiming to verify facts
 * or source contents on the network.
 */

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "assets", "data");
const announcementsPath = path.join(DATA_DIR, "announcements.json");
const sourcesPath = path.join(DATA_DIR, "trusted-sources.json");
const registryPath = path.join(DATA_DIR, "content-registry.json");
const modelPath = path.join(DATA_DIR, "content-model.json");
const dashboardPath = path.join(DATA_DIR, "dashboard-metadata.json");

const errors = [];
const allowedStatuses = new Set(["GPIR_CLASSIFIED", "PENDING_HUMAN_REVIEW", "SOURCE_VERIFICATION_REQUIRED"]);
const allowedContentStatuses = new Set(["CONTENT_VERIFIED", "CONTENT_UNDER_REVIEW"]);
const allowedRegistryStatuses = new Set(["active", "coming_soon", "draft", "archived", "GPIR_CLASSIFIED"]);
const datePattern = /^\d{4}-(?:\d{2}|\d{2}-\d{2})$/;
const idPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function readJson(filePath){
    try{
        return JSON.parse(fs.readFileSync(filePath, "utf8"));
    } catch(error){
        errors.push(`${path.relative(ROOT, filePath)}: invalid JSON (${error.message})`);
        return {};
    }
}

function requiredString(value, label){
    if(typeof value !== "string" || !value.trim()) errors.push(`${label}: expected a non-empty string`);
}

function dateField(value, label){
    if(value !== null && (typeof value !== "string" || !datePattern.test(value))) errors.push(`${label}: expected YYYY-MM or YYYY-MM-DD, or null`);
}

function repositoryFileExists(href, label){
    if(typeof href !== "string" || !href.trim()){
        errors.push(`${label}: expected a repository-relative href`);
        return;
    }
    if(/^(?:https?:|javascript:|data:)/i.test(href)){
        errors.push(`${label}: external or executable href is not allowed`);
        return;
    }
    const filePart = href.split(/[?#]/)[0];
    if(!fs.existsSync(path.resolve(ROOT, filePart))) errors.push(`${label}: target does not exist (${href})`);
}

const announcements = readJson(announcementsPath);
const sourceData = readJson(sourcesPath);
const registryData = readJson(registryPath);
const contentModel = readJson(modelPath);
const dashboardData = readJson(dashboardPath);
const records = Array.isArray(announcements.records) ? announcements.records : [];
const registry = Array.isArray(sourceData.registry) ? sourceData.registry : [];
const sourceRegistryIds = new Set();

function validateEnumList(value, label){
    if(!Array.isArray(value) || value.length === 0){
        errors.push(`${label}: expected a non-empty array`);
        return;
    }
    const seen = new Set();
    value.forEach((item, index) => {
        if(typeof item !== "string" || !item.trim()) errors.push(`${label}[${index}]: expected a non-empty string`);
        if(seen.has(item)) errors.push(`${label}[${index}]: duplicate value (${item})`);
        seen.add(item);
    });
}

validateEnumList(contentModel.contentTypes, "content-model.contentTypes");
validateEnumList(contentModel.evidenceClassifications, "content-model.evidenceClassifications");
validateEnumList(contentModel.verificationStatuses, "content-model.verificationStatuses");
validateEnumList(contentModel.readinessStatuses, "content-model.readinessStatuses");
validateEnumList(contentModel.reconciliationStatuses, "content-model.reconciliationStatuses");
validateEnumList(contentModel.provenanceFields, "content-model.provenanceFields");
validateEnumList(contentModel.dashboardMetadataFields, "content-model.dashboardMetadataFields");
if(!contentModel.recordRules || typeof contentModel.recordRules !== "object"){
    errors.push("content-model.recordRules: expected an object");
}

const dashboardRecords = Array.isArray(dashboardData.records) ? dashboardData.records : [];
const dashboardIds = new Set();
dashboardRecords.forEach((dashboard, index) => {
    const label = `dashboard-metadata.records[${index}]`;
    requiredString(dashboard.dashboardId, `${label}.dashboardId`);
    if(dashboardIds.has(dashboard.dashboardId)) errors.push(`${label}.dashboardId: duplicate value (${dashboard.dashboardId})`);
    dashboardIds.add(dashboard.dashboardId);
    ["title", "country", "region", "edition", "status", "description", "imagePath", "pagePath"].forEach(field => requiredString(dashboard[field], `${label}.${field}`));
    ["period", "direction", "useCase", "metric", "unit", "source", "methodology", "disclaimer"].forEach(field => {
        if(dashboard[field] !== null) requiredString(dashboard[field], `${label}.${field}`);
    });
    repositoryFileExists(dashboard.imagePath, `${label}.imagePath`);
    repositoryFileExists(dashboard.pagePath, `${label}.pagePath`);
});

registry.forEach((source, index) => {
    const label = `trusted-sources.registry[${index}]`;
    requiredString(source.id, `${label}.id`);
    if(sourceRegistryIds.has(source.id)) errors.push(`${label}.id: duplicate id (${source.id})`);
    sourceRegistryIds.add(source.id);
    requiredString(source.organization, `${label}.organization`);
    if(!Array.isArray(source.officialDomains) || source.officialDomains.length === 0){
        errors.push(`${label}.officialDomains: expected at least one domain`);
    }
});

const recordIds = new Set();
records.forEach((record, index) => {
    const label = `announcements.records[${index}]`;
    requiredString(record.id, `${label}.id`);
    if(typeof record.id === "string" && !idPattern.test(record.id)) errors.push(`${label}.id: must be lowercase kebab-case`);
    if(recordIds.has(record.id)) errors.push(`${label}.id: duplicate id (${record.id})`);
    recordIds.add(record.id);

    if(!allowedStatuses.has(record.status)) errors.push(`${label}.status: unsupported status (${record.status})`);
    if(!allowedContentStatuses.has(record.contentStatus)) errors.push(`${label}.contentStatus: unsupported status (${record.contentStatus})`);
    ["title", "category", "subCategory", "country", "region"].forEach(field => requiredString(record[field], `${label}.${field}`));
    ["countryCode", "eventType", "organisation"].forEach(field => {
        if(record[field] !== null) requiredString(record[field], `${label}.${field}`);
    });
    ["publishedDate", "retrievedDate"].forEach(field => dateField(record[field], `${label}.${field}`));

    if(record.status === "GPIR_CLASSIFIED"){
        ["tickerHeadline", "summary"].forEach(field => requiredString(record[field], `${label}.${field}`));
        if(!record.source || typeof record.source !== "object"){
            errors.push(`${label}.source: classified records require a source object`);
        } else {
            requiredString(record.source.name, `${label}.source.name`);
            requiredString(record.source.publicationTitle, `${label}.source.publicationTitle`);
            requiredString(record.source.url, `${label}.source.url`);
            if(typeof record.source.url === "string" && !/^https:\/\//i.test(record.source.url)) errors.push(`${label}.source.url: must use HTTPS`);
        }
        if(!sourceRegistryIds.has(record.sourceOrgId)) errors.push(`${label}.sourceOrgId: not present in trusted source registry (${record.sourceOrgId})`);
    } else if(record.status === "SOURCE_VERIFICATION_REQUIRED") {
        if(record.source !== null || record.sourceOrgId !== null) errors.push(`${label}: unresolved records must have source and sourceOrgId set to null`);
    }

    if(!record.audit || typeof record.audit !== "object"){
        errors.push(`${label}.audit: expected audit metadata`);
    } else {
        ["discoveredDate", "sourceVerifiedDate", "lastVerifiedDate"].forEach(field => dateField(record.audit[field], `${label}.audit.${field}`));
        if(!Array.isArray(record.audit.correctionHistory)) errors.push(`${label}.audit.correctionHistory: expected an array`);
    }

    if(record.gpirMapping){
        repositoryFileExists(record.gpirMapping.href, `${label}.gpirMapping.href`);
    }
    if(record.relatedCountryHref) repositoryFileExists(record.relatedCountryHref, `${label}.relatedCountryHref`);
});

const contentRegistry = Array.isArray(registryData.records) ? registryData.records : [];
const supportedTypes = new Set(Array.isArray(registryData.supportedContentTypes) ? registryData.supportedContentTypes : []);
const contentRegistryIds = new Set();
const registryIdCounts = new Map();
const sourceReferenceKeys = new Set();

contentRegistry.forEach(record => {
    if(typeof record.id === "string"){
        contentRegistryIds.add(record.id);
        registryIdCounts.set(record.id, (registryIdCounts.get(record.id) || 0) + 1);
    }
});

function resolveSourceReference(sourceRef, label){
    if(!sourceRef || typeof sourceRef !== "object"){
        errors.push(`${label}: expected a sourceRef object`);
        return;
    }
    requiredString(sourceRef.file, `${label}.file`);
    requiredString(sourceRef.collection, `${label}.collection`);
    requiredString(sourceRef.key, `${label}.key`);
    requiredString(sourceRef.value, `${label}.value`);
    if(typeof sourceRef.file !== "string") return;

    const sourcePath = path.resolve(ROOT, sourceRef.file);
    if(!fs.existsSync(sourcePath)){
        errors.push(`${label}.file: target does not exist (${sourceRef.file})`);
        return;
    }

    const sourceData = readJson(sourcePath);
    const collection = sourceData[sourceRef.collection];
    const candidates = Array.isArray(collection) ? collection : collection && typeof collection === "object" ? [collection] : [{ [sourceRef.collection]: collection }];
    if(!candidates.some(item => item && item[sourceRef.key] === sourceRef.value)){
        errors.push(`${label}: no matching ${sourceRef.key}=${sourceRef.value} in ${sourceRef.file}#${sourceRef.collection}`);
    }
}

contentRegistry.forEach((record, index) => {
    const label = `content-registry.records[${index}]`;
    requiredString(record.id, `${label}.id`);
    requiredString(record.contentType, `${label}.contentType`);
    requiredString(record.title, `${label}.title`);
    requiredString(record.slug, `${label}.slug`);
    if(typeof record.id !== "string") errors.push(`${label}.id: expected a string`);
    else if(registryIdCounts.get(record.id) > 1) errors.push(`${label}.id: duplicate id (${record.id})`);
    if(!supportedTypes.has(record.contentType)) errors.push(`${label}.contentType: unsupported type (${record.contentType})`);
    if(typeof record.slug === "string" && !idPattern.test(record.slug)) errors.push(`${label}.slug: must be lowercase kebab-case`);
    if(!allowedRegistryStatuses.has(record.status)) errors.push(`${label}.status: unsupported status (${record.status})`);

    resolveSourceReference(record.sourceRef, `${label}.sourceRef`);

    if(record.page) repositoryFileExists(record.page, `${label}.page`);
    if(record.sourceRefs !== undefined){
        if(!Array.isArray(record.sourceRefs)) errors.push(`${label}.sourceRefs: expected an array`);
        else record.sourceRefs.forEach((sourceId, sourceIndex) => {
            if(!contentRegistryIds.has(sourceId)) errors.push(`${label}.sourceRefs[${sourceIndex}]: target does not exist (${sourceId})`);
        });
    }

    if(!Array.isArray(record.relationships)){
        errors.push(`${label}.relationships: expected an array`);
    } else {
        record.relationships.forEach((relationship, relationshipIndex) => {
            const relationshipLabel = `${label}.relationships[${relationshipIndex}]`;
            requiredString(relationship.type, `${relationshipLabel}.type`);
            requiredString(relationship.target, `${relationshipLabel}.target`);
            if(typeof relationship.target === "string" && !contentRegistryIds.has(relationship.target)){
                errors.push(`${relationshipLabel}.target: target does not exist (${relationship.target})`);
            }
        });
    }

    const sourceKey = `${record.contentType}:${record.sourceRef && record.sourceRef.file}:${record.sourceRef && record.sourceRef.collection}:${record.sourceRef && record.sourceRef.value}`;
    if(sourceReferenceKeys.has(sourceKey) && !["ANNOUNCEMENT", "INTELLIGENCE"].includes(record.contentType)){
        errors.push(`${label}: duplicate canonical source reference (${sourceKey})`);
    }
    sourceReferenceKeys.add(sourceKey);
});

contentRegistry.forEach((record, index) => {
    if(!Array.isArray(record.relationships)) return;
    record.relationships.forEach((relationship, relationshipIndex) => {
        if(relationship && typeof relationship.target === "string" && !contentRegistryIds.has(relationship.target)){
            errors.push(`content-registry.records[${index}].relationships[${relationshipIndex}].target: target does not exist (${relationship.target})`);
        }
    });
});

if(errors.length){
    console.error(`GPIR content validation failed with ${errors.length} error(s):`);
    errors.forEach(error => console.error(`- ${error}`));
    process.exitCode = 1;
} else {
    console.log(`GPIR content validation passed: ${records.length} announcements, ${registry.length} trusted sources, and ${contentRegistry.length} registry records.`);
}

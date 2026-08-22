/*=====================================================
  GPIR CONTENT CHANGE EVENT RECORDER

  Appends one machine-readable change event to assets/data/content/
  events/change-events.jsonl whenever a structured content object
  (assets/data/content/**) is created, updated, corrected, or archived.
  See docs/CONTENT_SCHEMA.md §10.

  JSON Lines, not a single JSON array: an event log is append-only by
  nature, and appending one line is O(1) -- rewriting a whole JSON array
  to add one entry is not, and gets slower as the log grows. This is the
  simplest format compatible with a static, database-free repository
  that still behaves like a real event stream (one line = one event, in
  emission order) rather than reaching for Kafka or a message broker
  neither the site nor its content volume justifies.

  Run manually whenever a content object changes:
    node scripts/record-content-change-event.js \
      --id intel-cbuae-payment-token-2026 \
      --eventType UPDATED \
      --previousVersion 1 \
      --newVersion 2 \
      --source "Implementation 06 added evidence/versionInfo (commit 37ca4d6)" \
      [--significance ROUTINE]

  country/region/topics/entities are derived from the content object's
  own fields and `relationships` array, not passed on the command line
  -- there is exactly one place that data lives, matching every other
  generator in this repo (see docs/ARCHITECTURE_GUARDRAIL.md "must not
  be duplicated").

  Dev-time build step, like the other scripts/generate-*.js files --
  not a runtime dependency of any live page.
======================================================*/

const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const CONTENT_DIR = path.join(ROOT, "assets/data/content");
const EVENTS_PATH = path.join(CONTENT_DIR, "events/change-events.jsonl");
const CONTENT_SCHEMA_PATH = path.join(CONTENT_DIR, "schema/content-object.schema.json");

const VALID_EVENT_TYPES = ["CREATED", "UPDATED", "CORRECTED", "ARCHIVED"];
const VALID_SIGNIFICANCE = ["UNASSESSED", "ROUTINE", "NOTABLE", "MAJOR"];

function parseArgs(argv){
    const args = {};
    for(let i = 0; i < argv.length; i++){
        if(argv[i].startsWith("--")){
            const key = argv[i].slice(2);
            const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : true;
            args[key] = value;
        }
    }
    return args;
}

function walkJsonFiles(dir, out = []){
    if(!fs.existsSync(dir)) return out;
    for(const entry of fs.readdirSync(dir, { withFileTypes: true })){
        if(entry.name === "schema" || entry.name === "events") continue;
        const full = path.join(dir, entry.name);
        if(entry.isDirectory()) walkJsonFiles(full, out);
        else if(entry.name.endsWith(".json")) out.push(full);
    }
    return out;
}

function findContentObject(id){
    for(const file of walkJsonFiles(CONTENT_DIR)){
        const obj = JSON.parse(fs.readFileSync(file, "utf8"));
        if(obj.id === id) return obj;
    }
    return null;
}

function readContentModelVersion(){
    const raw = fs.readFileSync(CONTENT_SCHEMA_PATH, "utf8");
    const match = raw.match(/contentModelVersion:\s*([0-9]+\.[0-9]+\.[0-9]+)/);
    return match ? match[1] : "unknown";
}

function nextEventId(contentId){
    let seq = 1;
    if(fs.existsSync(EVENTS_PATH)){
        const lines = fs.readFileSync(EVENTS_PATH, "utf8").split("\n").filter(Boolean);
        const prefix = `evt-${contentId}-`;
        lines.forEach(line => {
            const evt = JSON.parse(line);
            if(evt.eventId && evt.eventId.startsWith(prefix)){
                const n = parseInt(evt.eventId.slice(prefix.length), 10);
                if(!isNaN(n) && n >= seq) seq = n + 1;
            }
        });
    }
    return `evt-${contentId}-${seq}`;
}

function deriveTopics(obj){
    const topics = new Set();
    if(obj.topic) topics.add(obj.topic);
    if(obj.subtopic) topics.add(obj.subtopic);
    (obj.relationships || []).forEach(edge => {
        if(edge.targetType === "topic") topics.add(edge.targetId);
    });
    return Array.from(topics);
}

function deriveEntities(obj){
    const entities = new Set();
    (obj.relationships || []).forEach(edge => {
        if(edge.targetType === "entity") entities.add(edge.targetId);
    });
    return Array.from(entities);
}

function main(){
    const args = parseArgs(process.argv.slice(2));

    if(!args.id || !args.eventType || !args.source){
        console.error("Usage: node scripts/record-content-change-event.js --id <contentId> --eventType CREATED|UPDATED|CORRECTED|ARCHIVED --newVersion <n> --source \"...\" [--previousVersion <n>] [--significance UNASSESSED|ROUTINE|NOTABLE|MAJOR]");
        process.exit(1);
    }

    if(!VALID_EVENT_TYPES.includes(args.eventType)){
        console.error(`Invalid --eventType "${args.eventType}". Must be one of: ${VALID_EVENT_TYPES.join(", ")}`);
        process.exit(1);
    }

    const significance = args.significance || "UNASSESSED";
    if(!VALID_SIGNIFICANCE.includes(significance)){
        console.error(`Invalid --significance "${significance}". Must be one of: ${VALID_SIGNIFICANCE.join(", ")}`);
        process.exit(1);
    }

    const obj = findContentObject(args.id);
    if(!obj){
        console.error(`No content object found with id "${args.id}" under ${path.relative(ROOT, CONTENT_DIR)}`);
        process.exit(1);
    }

    const newVersion = args.newVersion ? parseInt(args.newVersion, 10) : obj.version;
    const previousVersion = args.eventType === "CREATED"
        ? null
        : (args.previousVersion !== undefined ? parseInt(args.previousVersion, 10) : null);

    const event = {
        eventId: nextEventId(args.id),
        contentId: obj.id,
        contentType: obj.contentType,
        country: obj.country || null,
        region: obj.region || null,
        topics: deriveTopics(obj),
        entities: deriveEntities(obj),
        eventType: args.eventType,
        eventDate: args.eventDate || new Date().toISOString().slice(0, 10),
        contentVersion: readContentModelVersion(),
        previousVersion,
        newVersion,
        source: args.source,
        significanceStatus: significance,
    };

    fs.mkdirSync(path.dirname(EVENTS_PATH), { recursive: true });
    fs.appendFileSync(EVENTS_PATH, JSON.stringify(event) + "\n");

    console.log("Recorded event:");
    console.log(JSON.stringify(event, null, 2));
    console.log(`\nAppended to ${path.relative(ROOT, EVENTS_PATH)}`);
}

main();

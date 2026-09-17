# M33-G1 Step 6E Controlled Three-Source Canary Plan

## Status: STOPPED — source-selection and acquisition-path gate

The requested canary cannot be prepared safely from the current repository
evidence. There is no version-controlled `source_registry` snapshot and no
version-controlled `gpir-intelligence-fetch`/canonical acquisition runner to
inspect. Step 6C also established that this workspace has no authenticated
read-only Supabase metadata route.

The trusted-source registry is not a substitute for production
`source_registry`: it identifies `rbi-press-releases` as a verified official
regulatory RSS source, but the association candidate `sfa` is explicitly
`DISCOVERY_ONLY`; no verified existing specialist-source record was evidenced.
Consequently, exactly three GREEN production source records, their acquisition
metadata, and the required canonical path cannot be verified without guessing.

No canary runner, scheduler, source registry record, Supabase row, RAW record,
candidate, handoff, announcement, ticker value or production workflow was
created or changed.

## Required owner evidence before planning resumes

Provide read-only `source_registry` metadata for three candidate records
(including source ID, name, status, trust tier, official/feed URLs, acquisition
method and parser profile), and the approved Edge Function/repository location
for the canonical acquisition path. Then the bounded, RAW-first plan can be
written without inferring production configuration.

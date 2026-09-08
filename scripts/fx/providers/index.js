#!/usr/bin/env node
/*
 * GPIR FX provider priority registry. Configuration-driven: to change
 * priority order or add a provider, edit this list (and
 * assets/data/fx/fx-config.json for reader-facing metadata) rather
 * than the orchestrator's control flow.
 *
 * Priority order per the milestone spec:
 *   1-4. authorised licensed feeds, only if their credential(s) exist
 *   5. approved reference source (always available, keyless)
 *   6. last validated GPIR snapshot (handled by the orchestrator
 *      itself when every provider below returns nothing usable)
 */
const lseg = require("./lseg.js");
const bloomberg = require("./bloomberg.js");
const xe = require("./xe.js");
const ibrlive = require("./ibrlive.js");
const reference = require("./reference.js");

const PROVIDER_PRIORITY = [lseg, bloomberg, xe, ibrlive, reference];

module.exports = { PROVIDER_PRIORITY, lseg, bloomberg, xe, ibrlive, reference };

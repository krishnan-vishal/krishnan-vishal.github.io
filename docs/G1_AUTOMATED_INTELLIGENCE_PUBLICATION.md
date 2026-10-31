# G1 automated intelligence publication

This change prepares, but does not deploy, the G1 Phase 1 publication path.
The deployed `gpir-intelligence-fetch` acquisition function is deliberately
unchanged. A separate `gpir-intelligence-publish` function validates candidates
and the `gpir-public-intelligence` function exposes approved current and
historical records read-only.

## Publication gates

Every candidate is fetched again from its canonical HTTPS URL. Publication
requires all of the following:

- the final and canonical hosts match a GREEN `source_registry` origin;
- an exact source publication timestamp is present, is not in the future and
  is within 36 hours of the candidate timestamp;
- the retrieved article body contains at least 600 characters and two
  meaningful evidence sentences beyond the headline;
- the article body contains at least two payments-intelligence terms;
- the canonical URL and normalized-content SHA-256 are not already published;
- a source-body-grounded summary can be constructed; and
- confidence meets the automatic threshold: T1 70, T1.5 80, or T2 90.

T3 sources never auto-publish. Inaccessible, unsupported or insufficient
material remains `REVIEW`; verified duplicates become `DUPLICATE`; definitive
source-domain or timestamp failures become `REJECTED`. No headline-only summary
can reach the atomic publication RPC.

Publication preserves the source timestamp. The database computes ticker
eligibility from the 12-hour window; expired approved records remain accessible
through `gpir-public-intelligence`, which ASK GPIR and Search GPIR use as their
authoritative announcement source.

## Controlled release order

Production release requires a separate owner authorization. After approval:

1. Deploy `gpir-intelligence-publish` with JWT verification enabled.
2. Deploy `gpir-public-intelligence` with JWT verification disabled because it
   returns approved public records only and holds the service key server-side.
3. Apply `20261031134116_g1_automated_intelligence_publication.sql`. This creates
   the private audit table, atomic publication RPC and ten-minute scheduler.
4. Invoke the publisher with this bounded backfill request until no unprocessed
   candidates remain:

   ```json
   {
     "from": "2026-10-17T00:00:00.000Z",
     "to": "2026-11-01T00:00:00.000Z",
     "batchSize": 5
   }
   ```

5. Verify audit totals, approved announcements, the live 12-hour feed and the
   historical repository before enabling any frontend release.

The existing Vault secret name is reused by the scheduler; no decrypted secret
or service-role credential is committed or sent to browser code.

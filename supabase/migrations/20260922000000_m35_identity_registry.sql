-- M35-F4C local design. Review against the live estate before deployment.
-- Forward correction only after the first assignment: never reset sequences, delete
-- assigned identities, or replace audit history. This migration touches only gpir_identity_*.

CREATE SEQUENCE public.gpir_identity_publication_seq AS bigint START WITH 1 NO CYCLE;
CREATE SEQUENCE public.gpir_identity_lineage_seq AS bigint START WITH 1 NO CYCLE;
REVOKE ALL ON SEQUENCE public.gpir_identity_publication_seq, public.gpir_identity_lineage_seq
  FROM PUBLIC, anon, authenticated, service_role;

-- F4A parity: append zero, double alternating digits from right, subtract nine
-- when a doubled digit exceeds nine, then choose the digit that reaches a multiple of ten.
CREATE FUNCTION public.gpir_identity_luhn_digit(p_digits text)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
DECLARE
  i integer;
  n integer;
  total integer := 0;
  double_digit boolean := false;
  expanded text;
BEGIN
  IF p_digits !~ '^[0-9]{12}$' THEN
    RAISE EXCEPTION 'Identity sequence must contain twelve digits';
  END IF;
  expanded := p_digits || '0';
  FOR i IN REVERSE length(expanded)..1 LOOP
    n := substr(expanded, i, 1)::integer;
    IF double_digit THEN
      n := n * 2;
      IF n > 9 THEN n := n - 9; END IF;
    END IF;
    total := total + n;
    double_digit := NOT double_digit;
  END LOOP;
  RETURN ((10 - (total % 10)) % 10)::text;
END;
$$;

CREATE FUNCTION public.gpir_identity_valid_id(p_id text, p_kind text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = pg_catalog AS $$
DECLARE digits text;
BEGIN
  IF p_kind NOT IN ('P', 'L') OR
     p_id !~ ('^VK-GPIR-' || p_kind || '-[0-9]{12}-[0-9]$') THEN
    RETURN false;
  END IF;
  digits := split_part(p_id, '-', 4);
  RETURN right(p_id, 1) = public.gpir_identity_luhn_digit(digits);
END;
$$;

CREATE TABLE public.gpir_identity_lineages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_lineage_id text NOT NULL UNIQUE,
  lineage_status text NOT NULL DEFAULT 'ACTIVE'
    CHECK (lineage_status IN ('ACTIVE', 'REVIEW', 'RETIRED')),
  publication_family jsonb NOT NULL DEFAULT '{}'::jsonb,
  migration_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gpir_identity_lineage_format CHECK
    (public.gpir_identity_valid_id(edition_lineage_id, 'L'))
);

CREATE TABLE public.gpir_identity_publications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_unit_key text NOT NULL UNIQUE
    CHECK (length(btrim(source_unit_key)) > 0 AND source_unit_key !~* '^(fixture|test):'),
  gpir_publication_id text UNIQUE,
  lineage_id uuid REFERENCES public.gpir_identity_lineages(id) ON DELETE RESTRICT,
  publication_type text NOT NULL,
  region text,
  country_market text,
  source_legacy_path text,
  source_hash text,
  edition_label text,
  claimed_publication_id text,
  claim_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  assignment_method text CHECK (assignment_method IN ('source-native', 'governed-sequence')),
  assignment_timestamp timestamptz,
  identity_status text NOT NULL DEFAULT 'PROVISIONAL'
    CHECK (identity_status IN ('PROVISIONAL', 'SOURCE_NATIVE', 'GOVERNED_ASSIGNED', 'COLLISION_REVIEW', 'BLOCKED')),
  collision_state text NOT NULL DEFAULT 'none'
    CHECK (collision_state IN ('none', 'review')),
  predecessor_publication_id uuid REFERENCES public.gpir_identity_publications(id) ON DELETE RESTRICT,
  migration_provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT gpir_identity_publication_state CHECK (
    (identity_status IN ('SOURCE_NATIVE', 'GOVERNED_ASSIGNED') AND
     gpir_publication_id IS NOT NULL AND lineage_id IS NOT NULL AND
     assignment_method IS NOT NULL AND assignment_timestamp IS NOT NULL)
    OR
    (identity_status IN ('PROVISIONAL', 'BLOCKED') AND gpir_publication_id IS NULL)
    OR
    (identity_status = 'COLLISION_REVIEW' AND
      (gpir_publication_id IS NULL OR
       (lineage_id IS NOT NULL AND assignment_method IS NOT NULL AND
        assignment_timestamp IS NOT NULL)))),
  CONSTRAINT gpir_identity_publication_format CHECK (
    gpir_publication_id IS NULL OR
    (assignment_method = 'governed-sequence' AND public.gpir_identity_valid_id(gpir_publication_id, 'P')) OR
    (assignment_method = 'source-native' AND gpir_publication_id ~ '^VK-GPIR?-[A-Z0-9]+(-[A-Z0-9]+)+$'
      AND gpir_publication_id !~ '^VK-GPIR-[PL]-[0-9]{12}-[0-9]$')),
  CONSTRAINT gpir_identity_collision_state CHECK
    ((identity_status = 'COLLISION_REVIEW') = (collision_state = 'review'))
);

CREATE TABLE public.gpir_identity_related_identifiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publication_id uuid NOT NULL REFERENCES public.gpir_identity_publications(id) ON DELETE RESTRICT,
  identifier_type text NOT NULL CHECK (identifier_type IN
    ('dashboard', 'source', 'asset', 'legacy', 'external-reference', 'cms', 'other')),
  identifier_value text NOT NULL CHECK (length(btrim(identifier_value)) > 0),
  relationship text NOT NULL CHECK (length(btrim(relationship)) > 0),
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  verification_state text NOT NULL DEFAULT 'UNVERIFIED'
    CHECK (verification_state IN ('UNVERIFIED', 'VERIFIED', 'DISPUTED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (publication_id, identifier_type, identifier_value, relationship)
);

CREATE TABLE public.gpir_identity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('publication', 'lineage', 'related-identifier')),
  entity_id uuid NOT NULL,
  event_type text NOT NULL,
  previous_state jsonb,
  new_state jsonb NOT NULL,
  assignment_method text,
  actor_process text NOT NULL,
  reason text NOT NULL,
  provenance_evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION public.gpir_identity_guard_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  IF TG_TABLE_NAME = 'gpir_identity_publications' THEN
    IF NEW.source_unit_key IS DISTINCT FROM OLD.source_unit_key OR
       (OLD.gpir_publication_id IS NOT NULL AND
        NEW.gpir_publication_id IS DISTINCT FROM OLD.gpir_publication_id) OR
       (OLD.lineage_id IS NOT NULL AND NEW.lineage_id IS DISTINCT FROM OLD.lineage_id) THEN
      RAISE EXCEPTION 'Assigned publication identity and source unit are immutable';
    END IF;
  ELSIF TG_TABLE_NAME = 'gpir_identity_lineages' AND
        NEW.edition_lineage_id IS DISTINCT FROM OLD.edition_lineage_id THEN
    RAISE EXCEPTION 'Edition lineage identity is immutable';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER gpir_identity_publication_immutable BEFORE UPDATE ON public.gpir_identity_publications
  FOR EACH ROW EXECUTE FUNCTION public.gpir_identity_guard_immutable();
CREATE TRIGGER gpir_identity_lineage_immutable BEFORE UPDATE ON public.gpir_identity_lineages
  FOR EACH ROW EXECUTE FUNCTION public.gpir_identity_guard_immutable();

CREATE FUNCTION public.gpir_identity_reject_registry_delete()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Identity registry rows require forward correction, not deletion';
END;
$$;
CREATE TRIGGER gpir_identity_publication_preserve BEFORE DELETE ON public.gpir_identity_publications
  FOR EACH ROW EXECUTE FUNCTION public.gpir_identity_reject_registry_delete();
CREATE TRIGGER gpir_identity_lineage_preserve BEFORE DELETE ON public.gpir_identity_lineages
  FOR EACH ROW EXECUTE FUNCTION public.gpir_identity_reject_registry_delete();
CREATE TRIGGER gpir_identity_related_preserve BEFORE DELETE ON public.gpir_identity_related_identifiers
  FOR EACH ROW EXECUTE FUNCTION public.gpir_identity_reject_registry_delete();

CREATE FUNCTION public.gpir_identity_reject_event_mutation()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'Identity events are append-only';
END;
$$;
CREATE TRIGGER gpir_identity_events_append_only BEFORE UPDATE OR DELETE ON public.gpir_identity_events
  FOR EACH ROW EXECUTE FUNCTION public.gpir_identity_reject_event_mutation();

-- Create as invoker first: if a non-transactional runner stops before the
-- revokes below, the default PUBLIC EXECUTE cannot borrow owner privileges.
-- Only the last statement enables SECURITY DEFINER after grants and RLS lock down.
CREATE FUNCTION public.gpir_identity_resolve(
  p_source_unit_key text, p_publication_type text, p_actor_process text,
  p_source_legacy_path text DEFAULT NULL, p_source_hash text DEFAULT NULL,
  p_claimed_publication_id text DEFAULT NULL, p_claim_evidence jsonb DEFAULT '{}'::jsonb,
  p_predecessor_source_unit_key text DEFAULT NULL,
  p_migration_provenance jsonb DEFAULT '{}'::jsonb)
RETURNS public.gpir_identity_publications LANGUAGE plpgsql SECURITY INVOKER
SET search_path = pg_catalog, public AS $$
DECLARE
  rec public.gpir_identity_publications%ROWTYPE;
  prior public.gpir_identity_publications%ROWTYPE;
  incumbent public.gpir_identity_publications%ROWTYPE;
  line public.gpir_identity_lineages%ROWTYPE;
  candidate text;
  digits text;
  sequence_value bigint;
  prev_state jsonb;
  is_new boolean := false;
  event_reason text;
BEGIN
  IF p_source_unit_key IS NULL OR btrim(p_source_unit_key) = '' OR
     p_source_unit_key ~* '^(fixture|test):' OR p_publication_type IS NULL OR
     btrim(p_publication_type) = '' OR p_actor_process IS NULL OR
     btrim(p_actor_process) = '' THEN
    RAISE EXCEPTION 'Controlled non-fixture intake key, type and actor are required';
  END IF;
  -- The UNIQUE constraint and row lock serialize the same source unit. A retry
  -- returns its existing assignment without calling nextval again.
  INSERT INTO public.gpir_identity_publications
    (source_unit_key, publication_type, source_legacy_path, source_hash,
     claimed_publication_id, claim_evidence, migration_provenance)
  VALUES
    (p_source_unit_key, p_publication_type, p_source_legacy_path, p_source_hash,
     p_claimed_publication_id, coalesce(p_claim_evidence, '{}'::jsonb),
     coalesce(p_migration_provenance, '{}'::jsonb))
  ON CONFLICT (source_unit_key) DO NOTHING
  RETURNING * INTO rec;
  is_new := FOUND;
  SELECT * INTO rec FROM public.gpir_identity_publications
    WHERE source_unit_key = p_source_unit_key FOR UPDATE;
  IF is_new THEN
    INSERT INTO public.gpir_identity_events
      (entity_type, entity_id, event_type, new_state, actor_process, reason, provenance_evidence)
    VALUES ('publication', rec.id, 'INTAKE', to_jsonb(rec), p_actor_process,
      'Controlled provisional intake', coalesce(p_migration_provenance, '{}'::jsonb));
  END IF;
  prev_state := to_jsonb(rec);
  IF rec.publication_type <> p_publication_type OR
     (rec.claimed_publication_id IS NOT NULL AND p_claimed_publication_id IS NOT NULL AND
      rec.claimed_publication_id <> p_claimed_publication_id) OR
     (rec.gpir_publication_id IS NOT NULL AND p_claimed_publication_id IS NOT NULL AND
      rec.gpir_publication_id <> p_claimed_publication_id) OR
     (rec.predecessor_publication_id IS NOT NULL AND p_predecessor_source_unit_key IS NOT NULL AND
      rec.predecessor_publication_id IS DISTINCT FROM
        (SELECT id FROM public.gpir_identity_publications
         WHERE source_unit_key = p_predecessor_source_unit_key)) THEN
    event_reason := 'Conflicting intake for the same source unit';
  ELSIF p_claimed_publication_id IS NOT NULL AND
        (p_claim_evidence->>'isSamePublication' IS DISTINCT FROM 'true' OR
         p_claim_evidence->>'uniquenessEstablished' IS DISTINCT FROM 'true' OR
         nullif(btrim(p_claim_evidence->>'citation'), '') IS NULL) THEN
    -- Preserve unresolved evidence without allocating an identity.
    IF rec.identity_status = 'PROVISIONAL' THEN RETURN rec; END IF;
    event_reason := 'Claimed ID lacks exact-publication and uniqueness evidence';
  ELSE
    event_reason := NULL;
  END IF;
  IF event_reason IS NOT NULL THEN
    UPDATE public.gpir_identity_publications SET identity_status = 'COLLISION_REVIEW',
      collision_state = 'review',
      claim_evidence = coalesce(p_claim_evidence, '{}'::jsonb),
      migration_provenance = coalesce(p_migration_provenance, '{}'::jsonb)
      WHERE id = rec.id RETURNING * INTO rec;
    INSERT INTO public.gpir_identity_events
      (entity_type, entity_id, event_type, previous_state, new_state,
       actor_process, reason, provenance_evidence)
    VALUES ('publication', rec.id, 'COLLISION_REVIEW', prev_state, to_jsonb(rec),
      p_actor_process, event_reason, coalesce(p_migration_provenance, '{}'::jsonb) ||
        jsonb_build_object('incomingClaimedPublicationId', p_claimed_publication_id,
          'incomingClaimEvidence', coalesce(p_claim_evidence, '{}'::jsonb)));
    RETURN rec;
  END IF;
  IF rec.identity_status IN ('SOURCE_NATIVE', 'GOVERNED_ASSIGNED', 'COLLISION_REVIEW', 'BLOCKED') THEN
    RETURN rec;
  END IF;
  IF rec.claimed_publication_id IS NOT NULL AND p_claimed_publication_id IS NULL THEN
    -- A pending source-native claim cannot be bypassed by an omitted claim.
    RETURN rec;
  END IF;
  IF p_claimed_publication_id IS NOT NULL THEN
    -- New governed-format IDs come only from this registry's sequences.
    -- This rejects F4A fixture IDs even if a caller presents a signed claim.
    IF NOT (p_claimed_publication_id ~ '^VK-GPIR?-[A-Z0-9]+(-[A-Z0-9]+)+$' AND
      p_claimed_publication_id !~ '^VK-GPIR-[PL]-[0-9]{12}-[0-9]$') THEN
      RETURN rec;
    END IF;
    -- Same-ID claims serialize before the uniqueness decision.
    PERFORM pg_advisory_xact_lock(hashtextextended(p_claimed_publication_id, 0));
    SELECT * INTO incumbent FROM public.gpir_identity_publications
      WHERE gpir_publication_id = p_claimed_publication_id AND id <> rec.id FOR UPDATE;
    IF FOUND THEN
      prev_state := to_jsonb(incumbent);
      IF incumbent.identity_status <> 'COLLISION_REVIEW' THEN
        UPDATE public.gpir_identity_publications SET identity_status = 'COLLISION_REVIEW',
          collision_state = 'review' WHERE id = incumbent.id RETURNING * INTO incumbent;
        INSERT INTO public.gpir_identity_events
          (entity_type, entity_id, event_type, previous_state, new_state,
           assignment_method, actor_process, reason, provenance_evidence)
        VALUES ('publication', incumbent.id, 'COLLISION_REVIEW', prev_state,
          to_jsonb(incumbent), incumbent.assignment_method, p_actor_process,
          'Another source unit claimed this assigned publication ID',
          coalesce(p_claim_evidence, '{}'::jsonb) ||
            jsonb_build_object('conflictingSourceUnitKey', p_source_unit_key));
      END IF;
      prev_state := to_jsonb(rec);
      UPDATE public.gpir_identity_publications SET identity_status = 'COLLISION_REVIEW',
        collision_state = 'review', claim_evidence = coalesce(p_claim_evidence, '{}'::jsonb)
        WHERE id = rec.id RETURNING * INTO rec;
      INSERT INTO public.gpir_identity_events
        (entity_type, entity_id, event_type, previous_state, new_state,
         actor_process, reason, provenance_evidence)
      VALUES ('publication', rec.id, 'COLLISION_REVIEW', prev_state, to_jsonb(rec),
        p_actor_process, 'Claimed publication ID already belongs to another source unit',
        coalesce(p_claim_evidence, '{}'::jsonb));
      RETURN rec;
    END IF;
    candidate := p_claimed_publication_id;
  ELSE
    LOOP
      sequence_value := nextval('public.gpir_identity_publication_seq'::regclass);
      IF sequence_value > 999999999999 THEN RAISE EXCEPTION 'Publication identity sequence exhausted'; END IF;
      digits := lpad(sequence_value::text, 12, '0');
      candidate := 'VK-GPIR-P-' || digits || '-' || public.gpir_identity_luhn_digit(digits);
      PERFORM pg_advisory_xact_lock(hashtextextended(candidate, 0));
      EXIT WHEN NOT EXISTS (SELECT 1 FROM public.gpir_identity_publications
        WHERE gpir_publication_id = candidate);
      -- A source-native ID may occupy this sequence value. Never recycle it.
    END LOOP;
  END IF;
  IF p_predecessor_source_unit_key IS NOT NULL THEN
    SELECT * INTO prior FROM public.gpir_identity_publications
      WHERE source_unit_key = p_predecessor_source_unit_key;
    IF NOT FOUND OR prior.lineage_id IS NULL OR
       prior.identity_status NOT IN ('SOURCE_NATIVE', 'GOVERNED_ASSIGNED') THEN
      -- No silent lineage inference; the FK below is the authoritative link.
      RAISE EXCEPTION 'Explicit predecessor must already have a governed lineage';
    END IF;
    SELECT * INTO line FROM public.gpir_identity_lineages WHERE id = prior.lineage_id;
  ELSE
    sequence_value := nextval('public.gpir_identity_lineage_seq'::regclass);
    IF sequence_value > 999999999999 THEN RAISE EXCEPTION 'Lineage identity sequence exhausted'; END IF;
    digits := lpad(sequence_value::text, 12, '0');
    INSERT INTO public.gpir_identity_lineages (edition_lineage_id, migration_provenance)
      VALUES ('VK-GPIR-L-' || digits || '-' || public.gpir_identity_luhn_digit(digits),
        coalesce(p_migration_provenance, '{}'::jsonb)) RETURNING * INTO line;
    INSERT INTO public.gpir_identity_events
      (entity_type, entity_id, event_type, new_state, actor_process, reason, provenance_evidence)
    VALUES ('lineage', line.id, 'ASSIGNED', to_jsonb(line), p_actor_process,
      'New governed publication family', coalesce(p_migration_provenance, '{}'::jsonb));
  END IF;
  UPDATE public.gpir_identity_publications SET
    gpir_publication_id = candidate, lineage_id = line.id,
    predecessor_publication_id = prior.id,
    claimed_publication_id = coalesce(rec.claimed_publication_id, p_claimed_publication_id),
    claim_evidence = coalesce(p_claim_evidence, '{}'::jsonb),
    assignment_method = CASE WHEN p_claimed_publication_id IS NULL
      THEN 'governed-sequence' ELSE 'source-native' END,
    assignment_timestamp = clock_timestamp(),
    identity_status = CASE WHEN p_claimed_publication_id IS NULL
      THEN 'GOVERNED_ASSIGNED' ELSE 'SOURCE_NATIVE' END
    WHERE id = rec.id RETURNING * INTO rec;
  INSERT INTO public.gpir_identity_events
    (entity_type, entity_id, event_type, previous_state, new_state,
     assignment_method, actor_process, reason, provenance_evidence)
  VALUES ('publication', rec.id, 'ASSIGNED', prev_state, to_jsonb(rec),
    rec.assignment_method, p_actor_process, 'Authoritative identity assignment',
    coalesce(p_migration_provenance, '{}'::jsonb));
  RETURN rec;
END;
$$;

ALTER TABLE public.gpir_identity_lineages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpir_identity_publications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpir_identity_related_identifiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gpir_identity_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.gpir_identity_lineages, public.gpir_identity_publications,
  public.gpir_identity_related_identifiers, public.gpir_identity_events
  FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.gpir_identity_resolve(text, text, text, text, text, text, jsonb, text, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.gpir_identity_resolve(text, text, text, text, text, text, jsonb, text, jsonb)
  TO service_role;
-- The deployment owner must retain table ownership. service_role receives
-- EXECUTE only; this becomes the controlled mutation boundary last.
ALTER FUNCTION public.gpir_identity_resolve(text, text, text, text, text, text, jsonb, text, jsonb)
  SECURITY DEFINER;

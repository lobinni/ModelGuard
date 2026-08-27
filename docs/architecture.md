# ModelGuard AI — Architecture V3

## System overview

ModelGuard combines:

1. a GenLayer intelligent contract (`contracts/ai_model_guard.py`);
2. a live `genlayer-js`/MetaMask client;
3. a PostgreSQL/Drizzle local mirror for UI development;
4. a deterministic offline contract regression harness;
5. GitHub Actions for public, reproducible evidence.

The protocol registers authenticated source artifacts, not free-text claims.
Every decision requires three independent gates: faithfulness, technical
substance, and semantic originality.

## Persistent contract state

- `owner: Address` — administrative account;
- `models: DynArray[ModelRecord]` — approved and rejected records;
- `submission_attempts: TreeMap[Address, u256]` — lifetime finalized attempts;
- `content_hash_index: TreeMap[str, u256]` — SHA-256 → model ID + 1;
- `total_submission_attempts`, `approved_model_count`,
  `rejected_model_count` — registry counters;
- `paused: bool` — emergency registration switch.

`ModelRecord` contains `registrant`, `model_name`, `architecture_text`,
`artifact_url`, `content_hash`, `timestamp`, `is_approved`, and
`audit_reason`.

Rejected records remain auditable but are excluded from later originality
corpora. Their hashes remain indexed to prevent a second-opinion replay.

## Registration signature

```text
register_and_audit_model(
  model_name,
  architecture_text,
  artifact_url,
  content_hash
) -> model_id
```

## Transaction state machine

```text
READY
  └─ deterministic checks
      ├─ paused / input limits / ASCII / URL / SHA-256
      ├─ hash not previously registered
      └─ registrant has an attempt remaining
          ↓
RESERVED
  └─ increment per-wallet and global attempts
          ↓
PROVENANCE VERIFICATION (inside nondeterministic closure)
  ├─ fetch public artifact
  ├─ require HTTP 2xx and 1–24,000 bytes
  ├─ SHA-256(response bytes) == committed content_hash
  └─ artifact contains marker for gl.message.sender_address
          ↓
THREE-GATE AUDIT
  ├─ faithfulness: summary represents authenticated artifact
  ├─ substance: evidence describes a concrete technical design
  └─ originality: no substantial collision in sampled approved corpus
          ↓
VALIDATOR REPLAY
  └─ each validator independently refetches, reverifies, and reaudits
      ├─ decision agrees → append record + hash index + verdict counter
      └─ error/disagreement → atomic rollback, including attempt counters
```

No storage write occurs inside the nondeterministic closure. The attempt is
reserved before interaction for anti-grinding, but GenLayer atomic rollback
restores it after provenance failure, invalid LLM output, or disagreement.

## Provenance model

The registrant supplies a stable HTTPS URL and SHA-256 digest. The artifact
must include:

```text
modelguard-provenance: <lowercase registrant address>
```

The digest authenticates exact bytes; the marker proves the sender controlled
the published source location at audit time. The marker does not prove civil
identity or legal authorship. Content-addressed storage (IPFS/Arweave) or a raw
GitHub URL pinned to a commit SHA is preferred over mutable URLs.

The contract hashes the full response while sending at most 6,000 sanitized
ASCII characters to the LLM. This bounds prompt size without weakening byte
integrity.

## Audit corpus and verdict scope

`_build_approved_corpus()` scans newest-first, includes only approved records,
stops at 64, then restores ascending model-ID order. Each evidence item contains
name, architecture summary, and authenticated content hash.

Approval certifies provenance verification, faithfulness, substance, and
originality only relative to this sampled 64-record window. It does not certify
global novelty or non-infringement.

## Client ↔ contract parity

| Step | Contract | Frontend / mirror |
| --- | --- | --- |
| Checks | validates name, summary, URL, hash, pause and attempts | `validateModelDraft` mirrors deterministic checks and messages |
| Calldata | four positional string parameters | `writeContract` sends `[name, architecture, artifactUrl, contentHash]` with zero value |
| Deployment safety | V3 method must expose four exact parameter names | client schema preflight blocks legacy V2 before wallet switching/signing |
| Provenance | validators fetch, hash and inspect marker | form computes SHA-256; mirror independently fetches/hash-checks/marker-checks |
| Interaction | `gl.nondet.web.get` + `gl.nondet.exec_prompt` inside `run_nondet_unsafe` | UI shows leader, validator replay, and decision phases |
| Consensus | decision match is consensus-critical; reason may vary | client waits for `ACCEPTED`, tracks `FINALIZED` in background |
| Readback | `get_model_record` and hash index | UI refreshes registry and shows artifact URL/digest/verdict |

Address-typed reads use `CalldataAddress(bytes20)`. Passing a plain hex string
encodes TEXT rather than GenLayer's special address type and makes `gen_call`
fail.

## PostgreSQL mirror

`src/lib/registry-service.ts` mirrors the validation, duplicate-hash,
provenance-fetch, persistence and counter paths. `src/lib/audit-engine.ts`
implements deterministic faithfulness/substance/originality heuristics for UI
development. It does not claim to reproduce LLM consensus.

The database connection is lazy, so Vercel can build and run live mode without
`DATABASE_URL`.

## Test architecture

`tests/genvm_harness.py` is a behavioral test double for the narrow GenVM API
used by the contract. It models storage containers, sender and timestamp
context, web/LLM mocks, independent leader/validator closure execution, and
atomic rollback. The 43-test suite runs offline and in GitHub Actions.

This harness is deliberately not presented as the real GenVM. Before deployment
run the official static checks from `requirements-genvm.txt` and execute at
least one real Studionet integration transaction with a stable artifact.

## Deployment compatibility

V3 changes the storage layout and registration signature. It requires a fresh
deployment. The known V2 address in `deployments/studionet.json` is marked
`sourceCompatible: false`; the frontend refuses V3 writes against it.

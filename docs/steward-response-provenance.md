# Steward Response — Verifiable Provenance and Reproducible Tests

**Re:** ModelGuard AI — "originality is judged from unauthenticated
descriptions, so a stronger version should anchor registrations to verifiable
source artifacts or signed provenance and make the core direct tests
reproducibly pass."

Thank you — both findings were correct and both are now fixed in the
contract itself, not only in the documentation.

---

## 1. Registrations are anchored to verifiable source artifacts

**Before.** `register_and_audit_model(model_name, architecture_text)` judged a
free-text self-description. Nothing tied that text to a real artifact, and
nothing tied the artifact to the submitting account. Anyone could describe
anyone's work, and the judge had no way to tell.

**Now.** The write method is:

```
register_and_audit_model(model_name, architecture_text, artifact_url, content_hash)
```

Every registration commits to a **public source artifact** and to the
**sha256 digest of its exact bytes**. During the audit — inside the
nondeterministic block, so the leader *and every validator* perform it
independently — the contract:

1. fetches `artifact_url` with `gl.nondet.web.get`;
2. rejects non-2xx, empty, or oversized responses (`MAX_ARTIFACT_BYTES`);
3. recomputes `sha256(body)` and **reverts unless it equals the committed
   `content_hash`**, so the audited bytes are provably the pledged bytes and
   editing the source after committing invalidates the submission;
4. requires the fetched artifact to contain the **authorship marker**
   `modelguard-provenance: <registrant address>`. Only a party controlling the
   source location can publish that line, which binds the artifact to the
   submitting account and blocks third-party registration of someone else's
   public work;
5. passes the **authenticated artifact excerpt** to the Chief Judge as the
   primary evidence.

The prompt now runs **three gates** and approves only when all three pass:

| Gate | Rejects |
| ---- | ------- |
| Faithfulness | the description materially misrepresents the authenticated artifact |
| Substance | vague / non-technical / trivial claims with no distinguishable design |
| Originality | substantial protected logic reproduced from the sampled window, incl. paraphrase |

**Replay protection.** `content_hash_index: TreeMap[str, u256]` indexes every
audited digest, approved *or* rejected, so the same artifact can never be
registered twice, and a rejected artifact cannot be resubmitted for a second
opinion. `get_model_id_by_hash()` exposes the index publicly, and
`get_provenance_marker(address)` returns the exact line a registrant must
publish.

**Attempt fairness.** Provenance failure reverts the whole transaction, so an
unreachable or tampered artifact never costs an honest registrant one of their
three lifetime attempts.

**Honest scope statement (unchanged and still explicit).** Approval certifies:
*this account controls the source at `artifact_url`, those exact bytes hash to
`content_hash`, and the judge quorum found that artifact substantive and
original relative to the sampled window of the 64 most recent approved
entries.* It is still not global prior art, and the roadmap's signed-attestation
and bonded-challenge paths remain the way to widen it further.

## 2. The core direct tests reproducibly pass

**Before.** The suite targeted the GenLayer `gltest` plugin only, so a reviewer
without that environment could not run it — the tests were effectively
unverifiable.

**Now.** `requirements-test.txt` pins pytest, and
`tests/genvm_harness.py` implements the narrow runtime behavior the contract
uses (storage-native types, message context, web/LLM mocks, deterministic
transaction time, **transaction atomicity**, and **leader/validator replay**).
The 43-test suite runs with one documented command and is executed by the
public GitHub Actions workflow on every push and pull request:

```bash
python -m pip install -r requirements-test.txt
python -m pytest -q
# => 43 passed
```

Two behaviours are modelled deliberately because the safety argument depends
on them: a failing write **rolls storage back** (so "a failed audit does not
consume an attempt" is exercised, not assumed), and the consensus test double
**executes the validator closure independently** and only settles when it
agrees with the leader.

The harness is explicitly a behavioral regression layer, not the real GenVM.
`requirements-genvm.txt` separately pins the official GenLayer tooling
(`genlayer-py@v0.18`, `genlayer-test@v0.29`, and an immutable genvm-linter
commit). Before deployment we run `genvm-lint check/schema/typecheck` and a
real Studionet integration transaction to validate network web access and
consensus behavior.

New provenance coverage on top of the previous invariants:

- audit prompt actually carries the authenticated artifact excerpt;
- digest mismatch reverts and refunds the attempt;
- artifact tampered *after* commitment is rejected;
- artifact missing the provenance marker is rejected;
- a third party cannot register someone else's artifact;
- unreachable artifact reverts;
- duplicate digest rejected, including resubmission of a rejected digest;
- hash index and marker helpers behave;
- invalid URL schemes (http, credentials in URL) and malformed digests reject;
- validator disagreement reverts the transaction.

## Pointers for re-review

- `contracts/ai_model_guard.py` → `fetch_verified_artifact()`, the three-gate
  `audit_prompt`, `content_hash_index`, `PROVENANCE_MARKER`
- `tests/genvm_harness.py`, `tests/conftest.py`, `tests/direct/`
- `docs/architecture.md` → provenance section and client/contract parity matrix

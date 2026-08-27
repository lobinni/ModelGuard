# ModelGuard AI

ModelGuard AI is a GenLayer intelligent contract and a full-stack Next.js
application for registering AI model architectures, training pipelines,
optimizer schedules, and multi-agent systems against **authenticated source
artifacts**.

A registration is not judged from a self-reported description alone. The
registrant commits to a public artifact URL and the SHA-256 digest of its exact
bytes. The GenLayer leader and validators independently fetch the artifact,
verify its digest and provenance marker, run the semantic audit, and only
complete the state transition when they agree on the decision.

> ModelGuard is an auditable technical-claim registry. It does not create legal
> patent rights, prove employment/authorship history, or perform a global prior
> art search.

## Current status

The repository source is **V3 — provenance anchored**.

The last known Studionet deployment below is **V2 and is not compatible with
the current four-argument registration method**:

| Field | Value |
| --- | --- |
| Network | GenLayer Studionet, chain ID `61999` |
| Legacy V2 address | [`0x5B47eb2588b605a17A26ea627e17Aa7deA2E628E`](https://explorer-studio.genlayer.com/address/0x5B47eb2588b605a17A26ea627e17Aa7deA2E628E) |
| Owner | `0xc782a9c1ee1cfdc7d26aaa3c0649cd6827fd6246` |
| V2 registration signature | `register_and_audit_model(model_name, architecture_text)` |
| V3 required signature | `register_and_audit_model(model_name, architecture_text, artifact_url, content_hash)` |
| Deployment record | [`deployments/studionet.json`](deployments/studionet.json) |

**Redeploy `contracts/ai_model_guard.py` before enabling V3 live writes.** The
frontend performs a schema preflight and refuses to ask MetaMask to sign when
the configured contract still exposes the legacy signature.

After redeployment, update:

1. `DEFAULT_CONTRACT_ADDRESS` in `src/lib/config.ts`;
2. `NEXT_PUBLIC_CONTRACT_ADDRESS` in Vercel;
3. `deployments/studionet.json` with the new address, deployment transaction
   hash, deployer, date, and `sourceCompatible: true`;
4. this status section.

## What changed in V3

V3 addresses the steward feedback that originality was previously evaluated
from unauthenticated descriptions and that core tests needed a reproducible
execution path.

### Verifiable source artifacts

Every registration now includes:

- `artifact_url`: a public plain HTTPS URL;
- `content_hash`: SHA-256 of the artifact's exact response bytes;
- a provenance marker inside those bytes:

```text
modelguard-provenance: 0xYOUR_LOWERCASE_WALLET_ADDRESS
```

During the nondeterministic operation, the leader and every validator:

1. fetch the URL with `gl.nondet.web.get`;
2. require an HTTP success response;
3. reject empty artifacts and artifacts larger than 24,000 bytes;
4. recompute SHA-256 and compare it with the committed digest;
5. require the marker to bind the source artifact to the transaction sender;
6. sanitize a bounded 6,000-character excerpt for the audit prompt;
7. independently rerun the Chief Judge audit.

If the artifact is unreachable, modified, oversized, hash-mismatched, or bound
to another wallet, the entire transaction reverts. The registrant does not lose
an attempt.

### Replay protection

`content_hash_index: TreeMap[str, u256]` stores `model_id + 1` for every audited
artifact, whether approved or rejected. Therefore:

- the same artifact cannot be registered by two wallets;
- a rejected artifact cannot be resubmitted for another model draw;
- indexers can resolve a digest with `get_model_id_by_hash`.

### Three independent audit gates

The Chief Judge returns `APPROVED` only if all gates pass:

1. **Faithfulness** — the submitted summary materially represents the
   authenticated artifact.
2. **Substance** — the artifact describes a concrete technical architecture,
   training pipeline, optimizer schedule, or agent orchestration. Vague and
   buzzword-only claims are rejected even when they copy nothing.
3. **Originality** — the artifact does not reproduce substantial protected
   logic from the sampled approved corpus, including by paraphrase.

Validators may phrase their reasons differently, but they must agree on the
substantive `APPROVED` or `REJECTED` decision.

## Originality scope

The originality claim is deliberately bounded.

`_build_approved_corpus()` scans records newest-first, includes only approved
records, stops after `MAX_CORPUS_MODELS = 64`, then restores ascending model-ID
order before producing compact ASCII JSON.

An approval means:

> At registration time, a GenLayer validator quorum verified that the sender
> controlled the published source location, that the fetched bytes matched the
> committed SHA-256 digest, that the summary faithfully represented a
> substantive technical artifact, and that the artifact was semantically
> original relative to the sampled window of up to 64 most recent approved
> entries.

It does **not** establish global novelty, first authorship, or non-infringement
outside that sampled corpus. A provenance marker demonstrates control over the
published source location at audit time; it is not a legal identity signature.
For durable evidence, prefer an immutable IPFS/Arweave URL or a raw GitHub URL
pinned to a commit SHA instead of a mutable branch URL.

## State and transaction flow

Persistent storage:

- `owner: Address`;
- `models: DynArray[ModelRecord]`;
- `submission_attempts: TreeMap[Address, u256]`;
- `content_hash_index: TreeMap[str, u256]`;
- total, approved, and rejected counters;
- emergency `paused` flag.

Each `ModelRecord` stores:

- registrant address;
- model name and architecture summary;
- artifact URL and SHA-256 digest;
- deterministic transaction timestamp;
- approval decision and audit reason.

Transaction sequence:

```text
READY
  └─ deterministic input checks
      └─ artifact URL and hash uniqueness checks
          └─ reserve one attempt
              └─ leader fetches and verifies artifact
                  └─ leader runs three-gate audit
                      └─ validators independently refetch, reverify, and reaudit
                          ├─ decisions agree → append ModelRecord and hash index
                          └─ failure/disagreement → atomic rollback
```

The attempt update happens before the nondeterministic audit to prevent model
sampling/grinding. GenLayer transaction rollback restores the counter when
provenance verification, LLM normalization, or validator consensus fails. A
finalized `APPROVED` or `REJECTED` verdict consumes one lifetime attempt.

## Contract API

### Write methods

```text
register_and_audit_model(
  model_name: str,
  architecture_text: str,
  artifact_url: str,
  content_hash: str
) -> u256

set_paused(paused: bool) -> None
transfer_ownership(new_owner: Address) -> None
```

Registration constraints:

| Field | Constraint |
| --- | --- |
| Model name | non-empty printable ASCII, maximum 160 characters |
| Architecture summary | ASCII, 64–4,000 characters; tabs/newlines allowed |
| Artifact URL | plain HTTPS, no credentials/fragments, maximum 300 characters |
| Content hash | 64 hexadecimal SHA-256 characters; normalized to lowercase |
| Artifact response | HTTP 2xx, 1–24,000 bytes |
| Attempts | maximum 3 finalized decisions per registrant address |
| Audit reason | non-empty printable ASCII, maximum 400 characters |

### View methods

```text
get_model_record(model_id)
get_model_id_by_hash(content_hash)
get_provenance_marker(registrant)
get_registry_stats()
get_submission_attempts(registrant)
get_remaining_attempts(registrant)
get_owner()
is_registration_paused()
```

### Administrative controls

Only `owner` can pause registration or transfer ownership. Ownership transfer
to the zero address is rejected. The pause switch stops new registrations but
cannot override or rewrite audit verdicts.

## Preparing an artifact

1. Connect MetaMask and copy your lowercase wallet address.
2. Create a UTF-8 text/Markdown/JSON source artifact below 24 KB that describes
   the actual implementation or architecture.
3. Add the exact provenance line:

   ```text
   modelguard-provenance: 0xabc...your-wallet
   ```

4. Publish it at a stable public HTTPS URL. Recommended:
   - IPFS gateway URL with a content CID;
   - Arweave transaction URL;
   - GitHub raw URL pinned to an immutable commit SHA.
5. Compute SHA-256 **after adding the provenance line**:

   ```bash
   sha256sum model-spec.md
   # macOS alternative
   shasum -a 256 model-spec.md
   ```

6. Paste the URL and digest into the app. The **Hash artifact** button can fetch
   and calculate the same digest in the browser when the source allows CORS.
7. Submit and confirm the zero-value contract call in MetaMask.

## Frontend architecture

The application uses Next.js App Router, TypeScript, Tailwind CSS, React Three
Fiber, `genlayer-js`, PostgreSQL, and Drizzle ORM.

```text
src/
  app/
    api/registry/             local mirror API routes
    page.tsx                  live dashboard and registration workspace
  components/
    consensus/                consensus progress visualization
    dashboard/                metrics and audited records
    layout/                   wallet and network header
    registration/             provenance-aware registration form
    scene/                    visual validator lattice
  db/                         lazy PostgreSQL connection and Drizzle schema
  hooks/                      registry/wallet state controller
  lib/
    audit-engine.ts           deterministic mirror judge
    genlayer.ts               live contract calls and MetaMask onboarding
    registry-service.ts       mirror Checks/Effects/Interactions flow
    validation.ts             client/server validation parity
  types/                      shared domain types
```

### Live mode

Set `NEXT_PUBLIC_CONTRACT_ADDRESS` to a compatible V3 deployment. The app:

- connects only after the user clicks the MetaMask button;
- verifies the contract schema before wallet network switching/signing;
- adds or switches to Studionet chain `61999` only before a write;
- encodes GenLayer `Address` arguments using `CalldataAddress(bytes20)`;
- waits up to ten minutes for `ACCEPTED` and tracks `FINALIZED` in the
  background.

`ACCEPTED` means validator consensus has written the record. `FINALIZED` seals
it after the appeal window. A slow transition is normal on Studionet.

### Local mirror mode

Set `NEXT_PUBLIC_CONTRACT_ADDRESS=""` and configure `DATABASE_URL`. The mirror
fetches and verifies the same artifact, checks the same digest/marker, applies
the same validation limits, and persists records through Drizzle. It is a UI
and integration aid, not a replacement for GenLayer consensus.

## Repository layout

```text
contracts/ai_model_guard.py          intelligent contract
requirements-test.txt               pinned offline-test dependency
requirements-genvm.txt              official GenLayer tooling (Python 3.12+)
tests/genvm_harness.py               deterministic GenVM behavioral harness
tests/conftest.py                    offline direct-mode fixtures
tests/direct/test_ai_model_guard.py  43 contract regression tests
.github/workflows/ci.yml             public test/build evidence
src/                                 Next.js full-stack application
docs/architecture.md                 detailed architecture and parity matrix
docs/steward-response-provenance.md  response to steward feedback
docs/deploy-github-vercel.md         deployment guide
deployments/studionet.json           machine-readable deployment status
```

## Reproducible tests

### Offline core regression suite

Requirements: Python 3.11+.

```bash
python -m pip install -r requirements-test.txt
python -m pytest -q
```

Expected result:

```text
43 passed
```

The bundled harness models only the GenVM behaviors used by this contract:
storage-native containers, sender context, deterministic transaction time,
web and LLM mocks, leader/validator replay, and atomic storage rollback. It
makes core logic reproducible without a network or paid LLM. It is not a
substitute for real GenVM static checks and network integration tests.

Coverage includes:

- approved and rejected record persistence;
- deterministic timestamps and registry counters;
- artifact fetch, digest verification, and prompt inclusion;
- post-commit artifact tampering;
- empty, oversized, unavailable, and non-2xx artifacts;
- missing and wrong-wallet provenance markers;
- duplicate hashes and rejected-artifact replay prevention;
- URL, hash, ASCII, length, and substance boundaries;
- per-wallet attempt isolation and the three-attempt lifetime cap;
- pause/resume, owner authorization, ownership transfer, zero address;
- malformed LLM responses and reason normalization;
- validator disagreement and atomic rollback;
- approved-only corpus inclusion and registry invariants;
- independent leader and validator artifact refetch;
- presence of all three audit gates in the generated prompt.

The suite runs twice locally in approximately 0.1 seconds and is executed on
every push and pull request by GitHub Actions.

### Official GenLayer tooling

Requirements: Python 3.12+ and Git.

```bash
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements-genvm.txt

genvm-lint check contracts/ai_model_guard.py
genvm-lint schema contracts/ai_model_guard.py --json
genvm-lint typecheck contracts/ai_model_guard.py
```

The official dependencies follow the GenLayer project boilerplate:
`genlayer-py@v0.18`, `genlayer-test@v0.29`, and `genvm-linter`. Before a
production deployment, also run a Studio/network integration transaction to
validate real web access, validator behavior, consensus timing, and rollback.

## Web application development

Requirements: Node.js 22+, npm, and optionally PostgreSQL for mirror mode.

```bash
npm ci
npx next typegen
npm exec tsc -- --noEmit --pretty false
npm run build
npm run dev
```

Production build does not require `DATABASE_URL`. The database connection is
lazy and is opened only when a mirror API route actually queries PostgreSQL.

For mirror mode:

```bash
cp .env.example .env
npx drizzle-kit push
npm run dev
```

## Deploy the V3 contract

```bash
source .venv/bin/activate

genvm-lint check contracts/ai_model_guard.py
genvm-lint schema contracts/ai_model_guard.py --json
genvm-lint typecheck contracts/ai_model_guard.py
python -m pytest -q

genlayer deploy --contract contracts/ai_model_guard.py
```

After deployment:

```bash
genlayer schema <NEW_CONTRACT_ADDRESS>
genlayer call <NEW_CONTRACT_ADDRESS> get_owner
genlayer call <NEW_CONTRACT_ADDRESS> is_registration_paused
```

Confirm the schema includes the four registration parameters and the two new
views, then update the deployment record and frontend address before deploying
Vercel.

## GitHub and Vercel

The repository includes a CI workflow with two required checks:

- `Contract regression (43 tests)`;
- `Next.js production build` without a database.

Push commands are provided below and in
[`docs/deploy-github-vercel.md`](docs/deploy-github-vercel.md).

On Vercel, configure only:

```text
NEXT_PUBLIC_GENLAYER_NETWORK=studionet
NEXT_PUBLIC_CONTRACT_ADDRESS=<NEW_V3_CONTRACT_ADDRESS>
```

`DATABASE_URL` is optional and only needed for mirror mode.

## Security and limitations

- Artifact text remains untrusted prompt input; it is bounded, normalized, and
  explicitly treated as inert evidence.
- HTTPS proves transport integrity, while SHA-256 proves byte integrity. The
  marker proves source-location control at audit time, not civil/legal
  identity. Prefer content-addressed or commit-pinned URLs.
- The web response must remain publicly available while validators replay the
  transaction. Dynamic endpoints are unsuitable because byte changes cause
  digest mismatch or consensus failure.
- The semantic decision is probabilistic. Consensus proves validator agreement,
  not an objective legal conclusion.
- The 64-entry corpus is not global prior art.
- No fees or bonds are collected in this version.
- Storage evolution after deployment must be append-only; V3 therefore requires
  a fresh deployment rather than mutating the incompatible V2 layout.

## Roadmap

- EIP-712 signed provenance attestations linked to wallet identity.
- Content-addressed artifact pinning and availability monitoring.
- Verified retrieval beyond the 64-record recency window.
- Bonded challenge and appeal workflow for missed prior art.
- Real Studionet integration tests in CI when deterministic validator fixtures
  become available.

## References

- [GenLayer Builder Resources](https://portal.genlayer.foundation/builders/resources)
- [GenLayer JavaScript SDK](https://docs.genlayer.com/api-references/genlayer-js)
- [Steward response](docs/steward-response-provenance.md)
- [Architecture](docs/architecture.md)

## License

No license has been selected. Add an explicit license before third-party reuse
or distribution.

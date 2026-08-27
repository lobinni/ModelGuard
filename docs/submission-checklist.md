# GenLayer Builders Contribution — V3 Checklist

Use this checklist before submitting ModelGuard at
<https://portal.genlayer.foundation/builders/contributions>.

## Blocking items

- [ ] Deploy the current provenance-aware `contracts/ai_model_guard.py` as a
      fresh Studionet contract.
- [ ] Verify the schema exposes four registration arguments:
      `model_name`, `architecture_text`, `artifact_url`, `content_hash`.
- [ ] Verify `get_model_id_by_hash` and `get_provenance_marker` exist.
- [ ] Replace the legacy V2 address in `src/lib/config.ts`, Vercel, README, and
      `deployments/studionet.json`.
- [ ] Add the deployment transaction hash and set `sourceCompatible: true`.
- [ ] Execute one live registration using an immutable/commit-pinned artifact.
- [ ] Publish the GitHub repository as PUBLIC.
- [ ] Push CI and confirm both green checks: 43 contract tests and Next.js
      production build.
- [ ] Deploy the frontend and verify MetaMask flow on the production domain.

Do not submit the V2 address
`0x5B47eb2588b605a17A26ea627e17Aa7deA2E628E` as evidence for V3. It predates
the provenance fields and is intentionally marked incompatible.

## Recommended contribution entries

1. **Contract Deployed** — new V3 explorer URL plus deployment receipt.
2. **GitHub Repository** — public repository URL with green Actions checks.
3. **Tutorial/Documentation** — README, architecture document, and steward
   response URL.
4. **Developer Tool** (optional) — provenance-aware frontend and deterministic
   mirror, if the portal permits a separate entry.

## Evidence package

Attach public URLs for:

- V3 contract explorer page;
- deployment transaction receipt;
- GitHub repository root;
- GitHub Actions successful workflow;
- Vercel/custom-domain live application;
- `docs/steward-response-provenance.md`;
- the commit containing the V3 contract and 43-test suite.

## Suggested description (under 1,000 characters)

> ModelGuard AI V3 is a GenLayer intelligent contract for registering AI model
> architectures against authenticated public source artifacts. Each submission
> commits to an HTTPS artifact and SHA-256 digest. The leader and every
> validator independently fetch the artifact, verify exact bytes and a
> wallet-bound provenance marker, then apply faithfulness, technical-substance,
> and sampled originality gates. Only matching validator decisions append the
> record. Every audited digest is indexed to prevent duplicate claims and
> rejected-artifact replay; failed provenance or consensus rolls the transaction
> back atomically. The repository includes a Next.js/MetaMask client, a Drizzle
> mirror, 43 deterministic regression tests, pinned dependencies, public CI,
> architecture documentation, and an explicit statement that originality is
> limited to the 64 most recent approved registry entries.

## Reviewer pointers

- Contract verification: `fetch_verified_artifact`, `content_hash_index`, and
  the three-gate prompt in `contracts/ai_model_guard.py`.
- Reproducibility: `.github/workflows/ci.yml`, `requirements-test.txt`, and
  `tests/direct/test_ai_model_guard.py`.
- Honest limitations: README “Originality scope” and “Security and
  limitations”.
- Full response: `docs/steward-response-provenance.md`.

"""Deterministic contract regression tests for AIModelGuard.

Run reproducibly with the bundled behavioral harness (no network or LLM):

    python -m pip install -r requirements-test.txt
    python -m pytest -q

The harness exercises the contract source and models the GenVM behaviors this
contract relies on, including transaction rollback and leader/validator replay.
It complements — and does not replace — official genvm-lint checks and a real
Studionet integration transaction before deployment.
"""

import json

import pytest


CONTRACT_PATH = "contracts/ai_model_guard.py"
APPROVED_REASON = "The candidate contains independently expressed original logic."
REJECTED_REASON = "The candidate reproduces substantial protected logic from the registry."

ARTIFACT_URL = "https://raw.githubusercontent.com/example/models/main/spec.md"
SPEC_BODY = (
    "Entropy-Gated Mixture of Experts: every transformer block scores token "
    "entropy, routes low-uncertainty tokens to one generalist expert and "
    "high-uncertainty tokens across three specialists, then re-encodes any "
    "expert output whose confidence margin falls under a learned threshold."
)
DESCRIPTION = (
    "A depth-adaptive mixture of experts that routes tokens by entropy and "
    "re-encodes low-confidence expert outputs through a verifier gate."
)


def artifact_bytes(registrant, body=SPEC_BODY, marker=True):
    text = body
    if marker:
        text += f"\n\nmodelguard-provenance: {str(registrant).lower()}\n"
    return text.encode("utf-8")


@pytest.fixture
def model_guard(direct_vm, direct_deploy, direct_owner):
    direct_vm.sender = direct_owner
    return direct_deploy(CONTRACT_PATH)


def mock_audit(direct_vm, decision="APPROVED", reason=APPROVED_REASON):
    direct_vm.mock_llm(
        r".*Chief Judge for an on-chain AI model architecture.*",
        json.dumps({"decision": decision, "reason": reason}),
    )


def publish(direct_vm, registrant, url=ARTIFACT_URL, body=SPEC_BODY, marker=True):
    """Publish an artifact for `registrant` and return its committed digest."""
    return direct_vm.mock_web(url, artifact_bytes(registrant, body, marker))


def register(
    model_guard,
    direct_vm,
    registrant,
    name="Original Model",
    description=DESCRIPTION,
    url=ARTIFACT_URL,
    body=SPEC_BODY,
    marker=True,
    content_hash=None,
):
    digest = publish(direct_vm, registrant, url, body, marker)
    return model_guard.register_and_audit_model(
        name, description, url, content_hash or digest
    )


# ---------------------------------------------------------------------------
# Baseline state and happy path
# ---------------------------------------------------------------------------


def test_initial_state_is_empty_and_owned(model_guard, direct_owner, direct_alice):
    assert model_guard.get_owner().as_bytes == direct_owner.as_bytes
    assert model_guard.is_registration_paused() is False
    assert model_guard.get_registry_stats() == {
        "total_records": 0,
        "total_attempts": 0,
        "approved_records": 0,
        "rejected_records": 0,
    }
    assert model_guard.get_submission_attempts(direct_alice) == 0
    assert model_guard.get_remaining_attempts(direct_alice) == 3


def test_approved_submission_persists_complete_record(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    direct_vm.warp("2026-01-02T03:04:05Z")
    mock_audit(direct_vm)

    model_id = register(model_guard, direct_vm, direct_alice, "Novel Router Net")
    record = model_guard.get_model_record(model_id)

    assert model_id == 0
    assert record.registrant == direct_alice
    assert record.model_name == "Novel Router Net"
    assert record.architecture_text == DESCRIPTION
    assert record.artifact_url == ARTIFACT_URL
    assert len(record.content_hash) == 64
    assert record.timestamp == 1767323045
    assert record.is_approved is True
    assert record.audit_reason == APPROVED_REASON


def test_rejected_submission_persists_auditable_record(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm, "REJECTED", REJECTED_REASON)

    model_id = register(model_guard, direct_vm, direct_alice, "Copied Router Net")
    record = model_guard.get_model_record(model_id)

    assert record.is_approved is False
    assert record.audit_reason == REJECTED_REASON
    assert model_guard.get_registry_stats() == {
        "total_records": 1,
        "total_attempts": 1,
        "approved_records": 0,
        "rejected_records": 1,
    }


# ---------------------------------------------------------------------------
# Provenance anchoring — the audit never trusts an unauthenticated claim
# ---------------------------------------------------------------------------


def test_audit_prompt_carries_the_authenticated_artifact(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)

    register(model_guard, direct_vm, direct_alice)

    assert ARTIFACT_URL in direct_vm.web_calls
    prompt = direct_vm.prompts[-1]
    assert "authenticated_artifact_excerpt" in prompt
    assert "routes low-uncertainty tokens" in prompt


def test_digest_mismatch_reverts_and_refunds_the_attempt(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)
    publish(direct_vm, direct_alice)
    wrong_hash = "0" * 64

    with direct_vm.expect_revert("[PROVENANCE_ERROR]"):
        model_guard.register_and_audit_model(
            "Mismatch Model", DESCRIPTION, ARTIFACT_URL, wrong_hash
        )

    assert model_guard.get_submission_attempts(direct_alice) == 0
    assert model_guard.get_registry_stats()["total_records"] == 0


def test_tampered_artifact_after_commitment_is_rejected(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)
    committed = publish(direct_vm, direct_alice)

    # The source is edited after the registrant committed to the digest.
    publish(direct_vm, direct_alice, body=SPEC_BODY + " Silently edited later.")

    with direct_vm.expect_revert("Artifact digest does not match"):
        model_guard.register_and_audit_model(
            "Tampered Model", DESCRIPTION, ARTIFACT_URL, committed
        )

    assert model_guard.get_registry_stats()["total_records"] == 0


def test_artifact_without_provenance_marker_is_rejected(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)

    with direct_vm.expect_revert("provenance marker"):
        register(model_guard, direct_vm, direct_alice, marker=False)

    assert model_guard.get_submission_attempts(direct_alice) == 0


def test_third_party_cannot_register_someone_elses_artifact(
    direct_vm, model_guard, direct_alice, direct_bob
):
    # The artifact is bound to Alice's address; Bob tries to claim it.
    direct_vm.sender = direct_bob
    mock_audit(direct_vm)
    digest = publish(direct_vm, direct_alice)

    with direct_vm.expect_revert("provenance marker"):
        model_guard.register_and_audit_model(
            "Stolen Model", DESCRIPTION, ARTIFACT_URL, digest
        )

    assert model_guard.get_submission_attempts(direct_bob) == 0
    assert model_guard.get_registry_stats()["total_records"] == 0


def test_unreachable_artifact_reverts(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)
    digest = publish(direct_vm, direct_alice)
    direct_vm.clear_web(ARTIFACT_URL)

    with direct_vm.expect_revert("Artifact URL is not reachable"):
        model_guard.register_and_audit_model(
            "Offline Model", DESCRIPTION, ARTIFACT_URL, digest
        )

    assert model_guard.get_submission_attempts(direct_alice) == 0


def test_duplicate_artifact_hash_is_rejected(
    direct_vm, model_guard, direct_alice, direct_bob
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)
    digest = register(model_guard, direct_vm, direct_alice, "First Claim")
    stored = model_guard.get_model_record(digest).content_hash

    direct_vm.sender = direct_bob
    with direct_vm.expect_revert("Artifact content hash is already registered"):
        model_guard.register_and_audit_model(
            "Duplicate Claim", DESCRIPTION, ARTIFACT_URL, stored
        )

    assert model_guard.get_submission_attempts(direct_bob) == 0


def test_rejected_artifact_cannot_be_resubmitted(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm, "REJECTED", REJECTED_REASON)
    model_id = register(model_guard, direct_vm, direct_alice, "Rejected Once")
    stored = model_guard.get_model_record(model_id).content_hash

    mock_audit(direct_vm, "APPROVED", APPROVED_REASON)
    with direct_vm.expect_revert("Artifact content hash is already registered"):
        model_guard.register_and_audit_model(
            "Second Opinion", DESCRIPTION, ARTIFACT_URL, stored
        )


def test_hash_index_and_marker_helpers(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)
    assert model_guard.get_model_id_by_hash("0" * 64) == 0
    assert model_guard.get_provenance_marker(direct_alice) == (
        "modelguard-provenance:" + str(direct_alice).lower()
    )

    model_id = register(model_guard, direct_vm, direct_alice)
    stored = model_guard.get_model_record(model_id).content_hash
    assert model_guard.get_model_id_by_hash(stored) == model_id + 1


def test_invalid_artifact_url_and_hash_are_rejected(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    digest = publish(direct_vm, direct_alice)

    with direct_vm.expect_revert("Artifact URL cannot be empty"):
        model_guard.register_and_audit_model("M", DESCRIPTION, "  ", digest)

    with direct_vm.expect_revert("Artifact URL must be a plain https URL"):
        model_guard.register_and_audit_model(
            "M", DESCRIPTION, "http://insecure.example/spec.md", digest
        )

    with direct_vm.expect_revert("Artifact URL must be a plain https URL"):
        model_guard.register_and_audit_model(
            "M", DESCRIPTION, "https://user@example.com/spec.md", digest
        )

    with direct_vm.expect_revert("Content hash must be 64 lowercase hex characters"):
        model_guard.register_and_audit_model("M", DESCRIPTION, ARTIFACT_URL, "abc123")

    assert model_guard.get_submission_attempts(direct_alice) == 0


# ---------------------------------------------------------------------------
# Input validation
# ---------------------------------------------------------------------------


def test_submission_trims_outer_whitespace(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)
    digest = publish(direct_vm, direct_alice)

    model_id = model_guard.register_and_audit_model(
        "  Trimmed Name  ", f"\n  {DESCRIPTION}  \n", f" {ARTIFACT_URL} ", digest
    )
    record = model_guard.get_model_record(model_id)

    assert record.model_name == "Trimmed Name"
    assert record.architecture_text == DESCRIPTION
    assert record.artifact_url == ARTIFACT_URL


def test_empty_name_reverts_without_consuming_attempt(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Model name cannot be empty"):
        register(model_guard, direct_vm, direct_alice, name="")

    assert model_guard.get_submission_attempts(direct_alice) == 0
    assert model_guard.get_registry_stats()["total_records"] == 0


def test_whitespace_description_reverts(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Architecture description cannot be empty"):
        register(model_guard, direct_vm, direct_alice, description=" \n\t ")

    assert model_guard.get_submission_attempts(direct_alice) == 0


def test_too_short_description_reverts(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert(
        "Architecture description is too short to be audited"
    ):
        register(model_guard, direct_vm, direct_alice, description="it routes tokens")

    assert model_guard.get_submission_attempts(direct_alice) == 0


def test_description_at_substance_floor_is_accepted(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)

    model_id = register(model_guard, direct_vm, direct_alice, description="S" * 64)

    assert len(model_guard.get_model_record(model_id).architecture_text) == 64


def test_name_boundaries(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)

    model_id = register(model_guard, direct_vm, direct_alice, name="N" * 160)
    assert model_guard.get_model_record(model_id).model_name == "N" * 160

    with direct_vm.expect_revert("Model name exceeds the maximum length"):
        register(
            model_guard,
            direct_vm,
            direct_alice,
            name="N" * 161,
            body=SPEC_BODY + " variant b",
        )


def test_description_over_maximum_length_reverts(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Architecture description exceeds the maximum length"):
        register(model_guard, direct_vm, direct_alice, description="A" * 4001)

    assert model_guard.get_submission_attempts(direct_alice) == 0


def test_non_ascii_and_control_characters_are_rejected(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Model name must contain only printable ASCII text"):
        register(model_guard, direct_vm, direct_alice, name="Net Zero \u00e9")

    with direct_vm.expect_revert("Model name must contain only printable ASCII text"):
        register(model_guard, direct_vm, direct_alice, name="Line\nBreak")

    with direct_vm.expect_revert(
        "Architecture description must contain only ASCII text"
    ):
        register(
            model_guard,
            direct_vm,
            direct_alice,
            description=DESCRIPTION + " caf\u00e9 accents",
        )

    assert model_guard.get_submission_attempts(direct_alice) == 0


def test_description_allows_line_breaks(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)
    staged = DESCRIPTION + "\n\tStage two replays the evidence ledger."

    model_id = register(model_guard, direct_vm, direct_alice, description=staged)

    assert model_guard.get_model_record(model_id).architecture_text == staged


# ---------------------------------------------------------------------------
# Anti-grinding
# ---------------------------------------------------------------------------


def test_lifetime_attempt_limit_blocks_fourth_submission(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)

    for index in range(3):
        register(
            model_guard,
            direct_vm,
            direct_alice,
            name=f"Model {index}",
            url=f"{ARTIFACT_URL}?v={index}",
            body=f"{SPEC_BODY} Variant {index}.",
        )

    with direct_vm.expect_revert("Maximum submission attempts reached"):
        register(
            model_guard,
            direct_vm,
            direct_alice,
            name="Fourth Model",
            url=f"{ARTIFACT_URL}?v=3",
            body=f"{SPEC_BODY} Variant 3.",
        )

    assert model_guard.get_submission_attempts(direct_alice) == 3
    assert model_guard.get_remaining_attempts(direct_alice) == 0
    assert model_guard.get_registry_stats() == {
        "total_records": 3,
        "total_attempts": 3,
        "approved_records": 3,
        "rejected_records": 0,
    }


def test_rejected_submission_still_consumes_attempt(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm, "REJECTED", REJECTED_REASON)

    register(model_guard, direct_vm, direct_alice, "Risky Model")

    assert model_guard.get_submission_attempts(direct_alice) == 1
    assert model_guard.get_remaining_attempts(direct_alice) == 2


def test_attempts_are_isolated_between_registrants(
    direct_vm, model_guard, direct_alice, direct_bob
):
    mock_audit(direct_vm)

    direct_vm.sender = direct_alice
    register(model_guard, direct_vm, direct_alice, "Alice Model")

    direct_vm.sender = direct_bob
    register(
        model_guard,
        direct_vm,
        direct_bob,
        "Bob Model",
        url=f"{ARTIFACT_URL}?owner=bob",
        body=f"{SPEC_BODY} Bob variant.",
    )

    assert model_guard.get_submission_attempts(direct_alice) == 1
    assert model_guard.get_submission_attempts(direct_bob) == 1
    assert model_guard.get_registry_stats()["total_attempts"] == 2


# ---------------------------------------------------------------------------
# Administration
# ---------------------------------------------------------------------------


def test_pause_blocks_registration_and_resume_restores_it(
    direct_vm, model_guard, direct_owner, direct_alice
):
    direct_vm.sender = direct_owner
    model_guard.set_paused(True)
    assert model_guard.is_registration_paused() is True

    direct_vm.sender = direct_alice
    with direct_vm.expect_revert("Model registration is paused"):
        register(model_guard, direct_vm, direct_alice, "Paused Model")
    assert model_guard.get_submission_attempts(direct_alice) == 0

    direct_vm.sender = direct_owner
    model_guard.set_paused(False)

    direct_vm.sender = direct_alice
    mock_audit(direct_vm)
    register(model_guard, direct_vm, direct_alice, "Resumed Model")
    assert model_guard.get_registry_stats()["total_records"] == 1


def test_non_owner_cannot_pause_or_transfer(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice

    with direct_vm.expect_revert("Only the owner can perform this action"):
        model_guard.set_paused(True)

    with direct_vm.expect_revert("Only the owner can perform this action"):
        model_guard.transfer_ownership(direct_alice)


def test_owner_can_transfer_ownership(
    direct_vm, model_guard, direct_owner, direct_alice
):
    direct_vm.sender = direct_owner
    model_guard.transfer_ownership(direct_alice)
    assert model_guard.get_owner().as_bytes == direct_alice.as_bytes

    direct_vm.sender = direct_alice
    model_guard.set_paused(True)
    assert model_guard.is_registration_paused() is True


def test_transfer_to_zero_address_reverts(
    direct_vm, model_guard, direct_owner, direct_zero
):
    direct_vm.sender = direct_owner

    with direct_vm.expect_revert("New owner cannot be the zero address"):
        model_guard.transfer_ownership(direct_zero)


def test_unknown_model_record_reverts(direct_vm, model_guard):
    with direct_vm.expect_revert("Model record does not exist"):
        model_guard.get_model_record(0)


# ---------------------------------------------------------------------------
# LLM response handling and consensus
# ---------------------------------------------------------------------------


def test_malformed_llm_responses_revert_atomically(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    publish(direct_vm, direct_alice)
    snapshot = direct_vm.snapshot()

    for payload in (
        json.dumps({"decision": "MAYBE", "reason": "Unknown verdict"}),
        json.dumps({"decision": "APPROVED"}),
        json.dumps({"decision": 7, "reason": "Wrong type"}),
        json.dumps("not-a-json-object"),
        json.dumps({"decision": "APPROVED", "reason": ""}),
        json.dumps({"decision": "APPROVED", "reason": "R" * 401}),
        json.dumps({"decision": "APPROVED", "reason": "Non ascii \u00e9"}),
    ):
        direct_vm.mock_llm(r".*Chief Judge.*", payload)
        with direct_vm.expect_revert("[LLM_ERROR]"):
            register(model_guard, direct_vm, direct_alice, "DoS Model")
        direct_vm.rollback(snapshot)

    assert model_guard.get_registry_stats()["total_records"] == 0
    assert model_guard.get_submission_attempts(direct_alice) == 0


def test_llm_decision_is_case_normalized(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm, "  approved  ")

    model_id = register(model_guard, direct_vm, direct_alice, "Case Model")

    assert model_guard.get_model_record(model_id).is_approved is True


def test_audit_reason_whitespace_is_collapsed(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm, reason="Original  \n\t  logic with   spacing.")

    model_id = register(model_guard, direct_vm, direct_alice, "Reason Model")

    assert model_guard.get_model_record(model_id).audit_reason == (
        "Original logic with spacing."
    )


def test_validator_disagreement_reverts_the_transaction(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    decisions = iter(["APPROVED", "REJECTED"])

    def flapping(_prompt):
        return json.dumps(
            {"decision": next(decisions, "REJECTED"), "reason": APPROVED_REASON}
        )

    direct_vm.capture_llm(r".*Chief Judge.*", flapping)

    with direct_vm.expect_revert("Consensus"):
        register(model_guard, direct_vm, direct_alice, "Flapping Model")

    assert model_guard.get_registry_stats()["total_records"] == 0
    assert model_guard.get_submission_attempts(direct_alice) == 0


def test_only_approved_records_feed_the_corpus(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice

    mock_audit(direct_vm)
    register(model_guard, direct_vm, direct_alice, "Seed Model")

    mock_audit(direct_vm, "REJECTED", REJECTED_REASON)
    register(
        model_guard,
        direct_vm,
        direct_alice,
        "Rejected Model",
        url=f"{ARTIFACT_URL}?v=2",
        body=f"{SPEC_BODY} Second variant.",
    )

    mock_audit(direct_vm)
    register(
        model_guard,
        direct_vm,
        direct_alice,
        "Third Model",
        url=f"{ARTIFACT_URL}?v=3",
        body=f"{SPEC_BODY} Third variant.",
    )

    final_prompt = direct_vm.prompts[-1]
    assert "Seed Model" in final_prompt
    assert "Rejected Model" not in final_prompt


def test_mixed_decision_registry_invariants(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice

    mock_audit(direct_vm)
    register(model_guard, direct_vm, direct_alice, "Approved One")

    mock_audit(direct_vm, "REJECTED", "Overlaps approved one.")
    register(
        model_guard,
        direct_vm,
        direct_alice,
        "Rejected One",
        url=f"{ARTIFACT_URL}?v=2",
        body=f"{SPEC_BODY} Second variant.",
    )

    mock_audit(direct_vm)
    register(
        model_guard,
        direct_vm,
        direct_alice,
        "Approved Two",
        url=f"{ARTIFACT_URL}?v=3",
        body=f"{SPEC_BODY} Third variant.",
    )

    stats = model_guard.get_registry_stats()
    assert stats == {
        "total_records": 3,
        "total_attempts": 3,
        "approved_records": 2,
        "rejected_records": 1,
    }
    assert stats["total_records"] == stats["approved_records"] + stats["rejected_records"]


# ---------------------------------------------------------------------------
# Provenance boundary and replay-completeness checks
# ---------------------------------------------------------------------------


def test_empty_artifact_reverts_without_consuming_attempt(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)
    import hashlib

    direct_vm.mock_web(ARTIFACT_URL, b"", status=200)
    empty_digest = hashlib.sha256(b"").hexdigest()

    with direct_vm.expect_revert("Artifact is empty"):
        model_guard.register_and_audit_model(
            "Empty Artifact", DESCRIPTION, ARTIFACT_URL, empty_digest
        )

    assert model_guard.get_submission_attempts(direct_alice) == 0
    assert model_guard.get_registry_stats()["total_records"] == 0


def test_oversized_artifact_reverts_without_consuming_attempt(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)
    oversized = artifact_bytes(direct_alice, body="A" * 24_001)
    digest = direct_vm.mock_web(ARTIFACT_URL, oversized, status=200)

    with direct_vm.expect_revert("Artifact exceeds the size limit"):
        model_guard.register_and_audit_model(
            "Oversized Artifact", DESCRIPTION, ARTIFACT_URL, digest
        )

    assert model_guard.get_submission_attempts(direct_alice) == 0


def test_non_success_http_status_reverts(direct_vm, model_guard, direct_alice):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)
    body = artifact_bytes(direct_alice)
    digest = direct_vm.mock_web(ARTIFACT_URL, body, status=503)

    with direct_vm.expect_revert("Artifact URL is not reachable"):
        model_guard.register_and_audit_model(
            "Unavailable Artifact", DESCRIPTION, ARTIFACT_URL, digest
        )

    assert model_guard.get_submission_attempts(direct_alice) == 0


def test_artifact_url_over_maximum_length_reverts_before_web_fetch(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    oversized_url = "https://example.com/" + "a" * 281

    with direct_vm.expect_revert("Artifact URL exceeds the maximum length"):
        model_guard.register_and_audit_model(
            "Long URL", DESCRIPTION, oversized_url, "a" * 64
        )

    assert direct_vm.web_calls == []
    assert model_guard.get_submission_attempts(direct_alice) == 0


def test_uppercase_digest_is_normalized_and_indexed(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)
    digest = publish(direct_vm, direct_alice)

    model_id = model_guard.register_and_audit_model(
        "Normalized Digest", DESCRIPTION, ARTIFACT_URL, digest.upper()
    )
    record = model_guard.get_model_record(model_id)

    assert record.content_hash == digest
    assert model_guard.get_model_id_by_hash(digest.upper()) == model_id + 1


def test_leader_and_validator_each_refetch_the_artifact(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)

    register(model_guard, direct_vm, direct_alice, "Replay Fetch Model")

    # One fetch in the leader closure and one independent fetch in the
    # validator closure. This guards against accidentally trusting only the
    # leader's provenance result.
    assert direct_vm.web_calls == [ARTIFACT_URL, ARTIFACT_URL]


def test_prompt_contains_all_three_registration_gates(
    direct_vm, model_guard, direct_alice
):
    direct_vm.sender = direct_alice
    mock_audit(direct_vm)

    register(model_guard, direct_vm, direct_alice, "Three Gate Model")
    prompt = direct_vm.prompts[-1]

    assert "Gate one, faithfulness" in prompt
    assert "Gate two, substance" in prompt
    assert "Gate three, originality" in prompt
    assert "passes ALL THREE gates" in prompt

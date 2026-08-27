"""Fixtures for the reproducible offline contract regression suite.

The local behavioral harness intentionally mirrors the familiar direct-mode
fixture API. These fixtures do not claim to replace official GenVM execution;
they make contract invariants and rollback behavior deterministic in CI.
"""

from __future__ import annotations

import hashlib
from contextlib import contextmanager

import pytest

from tests.genvm_harness import VM, Address, ContractProxy, load_contract


CONTRACT_CLASS = "AIModelGuard"

OWNER = Address("0x" + "11" * 20)
ALICE = Address("0x" + "a1" * 20)
BOB = Address("0x" + "b0" * 20)
ZERO = Address(bytes(20))


class DirectVM:
    """Thin test-facing wrapper over the harness execution context."""

    def __init__(self) -> None:
        self._contract: ContractProxy | None = None

    # -- execution context --------------------------------------------------
    @property
    def sender(self) -> Address | None:
        return VM.sender

    @sender.setter
    def sender(self, value: Address) -> None:
        VM.sender = value

    def warp(self, iso_timestamp: str) -> None:
        VM.warp(iso_timestamp)

    # -- nondeterminism mocking --------------------------------------------
    def mock_llm(self, pattern: str, response: str) -> None:
        VM.mock_llm(pattern, response)

    def capture_llm(self, pattern: str, handler) -> None:
        VM.capture_llm(pattern, handler)

    def mock_web(self, url: str, body: bytes, status: int = 200) -> str:
        """Publish an artifact and return its sha256 digest."""
        VM.mock_web(url, status, body)
        return hashlib.sha256(body).hexdigest()

    def clear_web(self, url: str) -> None:
        VM.clear_web(url)

    @property
    def prompts(self) -> list[str]:
        return VM.prompts

    @property
    def web_calls(self) -> list[str]:
        return VM.web_calls

    # -- assertions ---------------------------------------------------------
    @contextmanager
    def expect_revert(self, message: str):
        with pytest.raises(Exception) as excinfo:
            yield
        assert message in str(excinfo.value), (
            f"expected revert containing {message!r}, got {str(excinfo.value)!r}"
        )

    # -- storage snapshots --------------------------------------------------
    def bind(self, contract: ContractProxy) -> None:
        self._contract = contract

    def snapshot(self):
        assert self._contract is not None
        return self._contract.snapshot()

    def rollback(self, snapshot) -> None:
        assert self._contract is not None
        self._contract.restore(snapshot)


@pytest.fixture
def direct_vm() -> DirectVM:
    VM.sender = None
    VM.llm_mocks = []
    VM.web_mocks = {}
    VM.prompts = []
    VM.web_calls = []
    VM.warp("2026-01-02T03:04:05Z")
    return DirectVM()


@pytest.fixture
def direct_owner() -> Address:
    return OWNER


@pytest.fixture
def direct_alice() -> Address:
    return ALICE


@pytest.fixture
def direct_bob() -> Address:
    return BOB


@pytest.fixture
def direct_zero() -> Address:
    return ZERO


@pytest.fixture
def direct_deploy(direct_vm: DirectVM):
    def _deploy(path: str) -> ContractProxy:
        contract = load_contract(path, CONTRACT_CLASS, VM.sender or OWNER)
        direct_vm.bind(contract)
        return contract

    return _deploy

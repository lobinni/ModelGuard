"""Self-contained GenVM harness for reproducible direct-mode contract tests.

This harness reimplements the narrow slice of runtime behavior the contract
touches (storage-native types, message context, the nondeterministic namespace,
and transaction atomicity) so `pytest` alone reproduces the core regression
suite on any machine, with no network access, no LLM, and no GenLayer
installation. It is a behavioral test double, not the real GenVM; official
lint/type/schema checks and a network integration transaction remain required
before deployment.

Two behaviours are modelled faithfully because the contract's safety argument
depends on them:

* **Transaction atomicity.** A public write that raises rolls the whole
  storage back, so "a failed audit does not consume an attempt" is actually
  exercised rather than assumed.
* **Leader/validator replay.** `run_nondet_unsafe` executes the leader
  closure, then the validator closure independently, and only returns when the
  validator agrees — the same consensus rule the network enforces.
"""

from __future__ import annotations

import copy
import datetime as _real_datetime
import importlib.util
import json
import re
import sys
import types
from dataclasses import dataclass, is_dataclass
from typing import Any, Callable, get_origin


# --------------------------------------------------------------------------
# Storage-native types
# --------------------------------------------------------------------------


class Address:
    __slots__ = ("_bytes",)

    def __init__(self, value: bytes | str):
        if isinstance(value, str):
            raw = bytes.fromhex(value[2:] if value.startswith("0x") else value)
        else:
            raw = bytes(value)
        if len(raw) != 20:
            raise ValueError("address must be 20 bytes")
        self._bytes = raw

    @property
    def as_bytes(self) -> bytes:
        return self._bytes

    def __bytes__(self) -> bytes:
        return self._bytes

    def __str__(self) -> str:
        return "0x" + self._bytes.hex()

    __repr__ = __str__

    def __eq__(self, other: object) -> bool:
        if isinstance(other, Address):
            return self._bytes == other._bytes
        return NotImplemented

    def __lt__(self, other: "Address") -> bool:
        return self._bytes < other._bytes

    def __hash__(self) -> int:
        return hash(self._bytes)


class u256(int):
    def __new__(cls, value: int = 0):
        value = int(value)
        if value < 0 or value >= 2**256:
            raise ValueError("u256 out of range")
        return super().__new__(cls, value)


class _Generic:
    """Supports the `DynArray[T]` / `TreeMap[K, V]` annotation syntax."""

    def __class_getitem__(cls, _item):  # pragma: no cover - typing sugar
        return cls


class DynArray(list, _Generic):
    pass


class TreeMap(dict, _Generic):
    def get(self, key, default=None):
        return super().get(key, default)


def allow_storage(cls):
    return cls


# --------------------------------------------------------------------------
# Nondeterministic namespace + VM
# --------------------------------------------------------------------------


class UserError(Exception):
    pass


@dataclass
class Return:
    calldata: Any


@dataclass
class WebResponse:
    status: int
    body: bytes
    headers: dict[str, str]


class _GenVM:
    """Mutable execution context shared by the fake `gl` namespace."""

    def __init__(self) -> None:
        self.sender: Address | None = None
        self.now = _real_datetime.datetime(
            2026, 1, 2, 3, 4, 5, tzinfo=_real_datetime.timezone.utc
        )
        self.llm_mocks: list[tuple[re.Pattern[str], Callable[[str], str]]] = []
        self.web_mocks: dict[str, WebResponse] = {}
        self.prompts: list[str] = []
        self.web_calls: list[str] = []

    # -- mocking API used by tests -----------------------------------------
    def mock_llm(self, pattern: str, response: str) -> None:
        self.capture_llm(pattern, lambda _prompt: response)

    def capture_llm(self, pattern: str, handler: Callable[[str], str]) -> None:
        compiled = re.compile(pattern, re.DOTALL)
        self.llm_mocks = [m for m in self.llm_mocks if m[0].pattern != compiled.pattern]
        self.llm_mocks.append((compiled, handler))

    def mock_web(self, url: str, status: int, body: bytes) -> None:
        self.web_mocks[url] = WebResponse(status=status, body=body, headers={})

    def clear_web(self, url: str) -> None:
        self.web_mocks.pop(url, None)

    def warp(self, iso_timestamp: str) -> None:
        text = iso_timestamp.replace("Z", "+00:00")
        self.now = _real_datetime.datetime.fromisoformat(text)

    # -- runtime hooks ------------------------------------------------------
    def exec_prompt(self, prompt: str, response_format: str = "text"):
        self.prompts.append(prompt)
        for pattern, handler in reversed(self.llm_mocks):
            if pattern.search(prompt):
                raw = handler(prompt)
                if response_format == "json":
                    try:
                        return json.loads(raw)
                    except json.JSONDecodeError:
                        return raw
                return raw
        raise AssertionError("no LLM mock matched the audit prompt")

    def web_get(self, url: str) -> WebResponse:
        self.web_calls.append(url)
        if url not in self.web_mocks:
            return WebResponse(status=404, body=b"", headers={})
        return self.web_mocks[url]


VM = _GenVM()


def _run_nondet_unsafe(leader_fn, validate_fn):
    leader_result = leader_fn()
    if not validate_fn(Return(leader_result)):
        raise UserError("Consensus was not reached for the nondeterministic call")
    return leader_result


def _build_gl_namespace() -> types.SimpleNamespace:
    vm_ns = types.SimpleNamespace(
        UserError=UserError,
        Return=Return,
        run_nondet_unsafe=_run_nondet_unsafe,
    )
    web_ns = types.SimpleNamespace(get=lambda url: VM.web_get(url))
    nondet_ns = types.SimpleNamespace(
        exec_prompt=lambda prompt, response_format="text": VM.exec_prompt(
            prompt, response_format
        ),
        web=web_ns,
    )

    class _Message:
        @property
        def sender_address(self) -> Address:
            assert VM.sender is not None, "direct_vm.sender must be set"
            return VM.sender

    def _identity(fn):
        return fn

    public_ns = types.SimpleNamespace(write=_identity, view=_identity)

    class Contract:
        def __init_subclass__(cls, **kwargs):
            super().__init_subclass__(**kwargs)
            cls.__storage_fields__ = dict(getattr(cls, "__annotations__", {}))

        def __new__(cls, *args, **kwargs):
            instance = super().__new__(cls)
            for name, annotation in getattr(cls, "__storage_fields__", {}).items():
                # DynArray[T] / TreeMap[K, V] resolve to a GenericAlias, so the
                # concrete storage class comes from typing.get_origin.
                origin = get_origin(annotation) or annotation
                if origin is DynArray:
                    setattr(instance, name, DynArray())
                elif origin is TreeMap:
                    setattr(instance, name, TreeMap())
                elif origin is bool:
                    setattr(instance, name, False)
                elif origin is u256:
                    setattr(instance, name, u256(0))
                else:
                    setattr(instance, name, None)
            return instance

    return types.SimpleNamespace(
        vm=vm_ns,
        nondet=nondet_ns,
        message=_Message(),
        public=public_ns,
        Contract=Contract,
    )


gl = _build_gl_namespace()


# --------------------------------------------------------------------------
# Contract loading with transaction semantics
# --------------------------------------------------------------------------


def install_genlayer_module() -> None:
    """Expose the harness as the importable `genlayer` package."""
    module = types.ModuleType("genlayer")
    module.gl = gl
    module.Address = Address
    module.u256 = u256
    module.DynArray = DynArray
    module.TreeMap = TreeMap
    module.allow_storage = allow_storage
    module.__all__ = [
        "gl",
        "Address",
        "u256",
        "DynArray",
        "TreeMap",
        "allow_storage",
    ]
    sys.modules["genlayer"] = module


class _FakeDatetime(_real_datetime.datetime):
    @classmethod
    def now(cls, tz=None):  # type: ignore[override]
        return VM.now if tz is not None else VM.now.replace(tzinfo=None)


def _patch_clock(module: types.ModuleType) -> None:
    """Pin the contract clock to the deterministic transaction datetime."""
    fake_module = types.SimpleNamespace(
        datetime=_FakeDatetime, timezone=_real_datetime.timezone
    )
    module.datetime = fake_module  # type: ignore[attr-defined]


def _storage_snapshot(instance: Any) -> dict[str, Any]:
    return {
        name: copy.deepcopy(getattr(instance, name))
        for name in getattr(type(instance), "__storage_fields__", {})
    }


def _storage_restore(instance: Any, snapshot: dict[str, Any]) -> None:
    for name, value in snapshot.items():
        setattr(instance, name, copy.deepcopy(value))


class ContractProxy:
    """Wraps the contract so each public call behaves like a transaction."""

    def __init__(self, instance: Any):
        object.__setattr__(self, "_instance", instance)

    def __getattr__(self, name: str):
        attribute = getattr(self._instance, name)
        if not callable(attribute):
            return attribute

        def transaction(*args, **kwargs):
            snapshot = _storage_snapshot(self._instance)
            try:
                return attribute(*args, **kwargs)
            except Exception:
                # GenLayer rolls the entire transaction back on failure.
                _storage_restore(self._instance, snapshot)
                raise

        return transaction

    def snapshot(self) -> dict[str, Any]:
        return _storage_snapshot(self._instance)

    def restore(self, snapshot: dict[str, Any]) -> None:
        _storage_restore(self._instance, snapshot)


def load_contract(path: str, contract_class: str, deployer: Address) -> ContractProxy:
    install_genlayer_module()
    spec = importlib.util.spec_from_file_location("model_guard_contract", path)
    assert spec and spec.loader
    module = importlib.util.module_from_spec(spec)
    sys.modules["model_guard_contract"] = module
    spec.loader.exec_module(module)
    _patch_clock(module)

    previous_sender = VM.sender
    VM.sender = deployer
    try:
        instance = getattr(module, contract_class)()
    finally:
        VM.sender = previous_sender

    assert is_dataclass(module.ModelRecord)
    return ContractProxy(instance)

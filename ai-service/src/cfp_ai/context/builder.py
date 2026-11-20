"""Shared context builder (AI_TECHNICAL_SPEC.md §5.2).

1. Fetch only the requested slices, as the principal, in parallel (bounded by a
   per-slice timeout and the request deadline).
2. Slice failures become ``ContextGap``s; failures of *required* slices raise.
3. Gaps (skill gaps) are computed deterministically when role requirements and
   capability levels are both present.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any, TypeVar

from cfp_ai.auth.principal import Principal
from cfp_ai.context.cache import TtlCache
from cfp_ai.context.gaps import compute_gaps
from cfp_ai.context.models import SUPPORTED_SLICES, CapabilityContext, ContextRequest
from cfp_ai.errors import AppError
from cfp_ai.integrations.backend.client import BackendClient
from cfp_ai.integrations.backend.dto import SkillDTO
from cfp_ai.integrations.backend.errors import BackendError
from cfp_ai.observability.tracing import tracer
from cfp_ai.schemas.public import ContextGap, ContextGapReason, ContextSlice

log = logging.getLogger(__name__)
V = TypeVar("V")

_REASON: dict[str, ContextGapReason] = {
    "not_callable": "backend_unconfirmed",
    "forbidden": "forbidden",
    "not_found": "not_found",
}


class _SliceFailed(Exception):
    def __init__(self, slice_name: ContextSlice, reason: ContextGapReason, cause: BaseException) -> None:
        super().__init__(f"{slice_name}: {reason}")
        self.slice_name = slice_name
        self.reason = reason
        self.cause = cause


class ContextBuilder:
    def __init__(
        self,
        *,
        backend: BackendClient,
        cache: TtlCache,
        slice_timeout_s: float = 2.0,
        ttl_s: float = 300,
        reference_ttl_s: float = 3600,
    ) -> None:
        self._backend = backend
        self._cache = cache
        self._slice_timeout = slice_timeout_s
        self._ttl = ttl_s
        self._reference_ttl = reference_ttl_s

    def invalidate_subject(self, tenant_id: str, employee_id: str) -> int:
        """Drop every cached slice about one employee, for all principals (event-driven)."""
        prefix = f"ctx:{tenant_id}:"
        marker = f":{employee_id}|"
        return self._cache.invalidate_where(lambda k: k.startswith(prefix) and marker in k)

    async def _cached(
        self,
        principal: Principal,
        key: str,
        ttl: float,
        fetch: Callable[[], Awaitable[V]],
    ) -> V:
        full_key = f"ctx:{principal.tenant_id}:{principal.visibility_scope}|{key}|"
        hit = self._cache.get(full_key)
        if hit is not None:
            return hit  # type: ignore[no-any-return]
        value = await fetch()
        self._cache.set(full_key, value, ttl)
        return value

    async def _slice(
        self,
        slice_name: ContextSlice,
        principal: Principal,
        key: str,
        ttl: float,
        fetch: Callable[[], Awaitable[V]],
        deadline: float | None,
    ) -> V:
        timeout = self._slice_timeout
        if deadline is not None:
            timeout = min(timeout, max(0.0, deadline - time.monotonic()))
        try:
            async with asyncio.timeout(timeout):
                return await self._cached(principal, key, ttl, fetch)
        except BackendError as exc:
            if exc.kind == "unauthorized":
                raise AppError("unauthenticated", internal_detail=str(exc)) from exc
            raise _SliceFailed(slice_name, _REASON.get(exc.kind, "upstream_error"), exc) from exc
        except TimeoutError as exc:
            raise _SliceFailed(slice_name, "upstream_error", exc) from exc

    async def build(
        self, principal: Principal, request: ContextRequest, *, deadline: float | None = None
    ) -> CapabilityContext:
        unsupported = set(request.slices) - SUPPORTED_SLICES
        if unsupported:
            raise ValueError(f"unsupported context slices: {sorted(unsupported)}")
        with tracer().start_as_current_span("context.build") as span:
            span.set_attribute("context.slices_requested", ",".join(sorted(request.slices)))
            context = await self._build(principal, request, deadline)
            span.set_attribute(
                "context.slices_missing", ",".join(sorted(g.slice for g in context.gaps_in_context))
            )
            return context

    async def _build(
        self, principal: Principal, request: ContextRequest, deadline: float | None
    ) -> CapabilityContext:
        gaps: list[ContextGap] = []
        values: dict[str, Any] = {}
        subject_id = request.subject_employee_id
        slices = set(request.slices)

        def failed(err: _SliceFailed) -> None:
            if err.slice_name in request.required:
                if isinstance(err.cause, BackendError):
                    raise err.cause.to_app_error() from err
                raise AppError("upstream_unavailable", internal_detail=str(err)) from err
            log.info("context slice unavailable", extra={"slice": err.slice_name, "reason": err.reason})
            gaps.append(ContextGap(slice=err.slice_name, reason=err.reason))

        async def run(name: str, coro: Awaitable[Any]) -> None:
            try:
                values[name] = await coro
            except _SliceFailed as err:
                failed(err)

        # Phase A — subject (needed to resolve the default role).
        role_id = request.role_id
        need_subject = subject_id is not None and (
            "subject_profile" in slices or ("role_profile" in slices and role_id is None)
        )
        if need_subject and subject_id is not None:
            sid = subject_id
            await run(
                "subject",
                self._slice(
                    "subject_profile",
                    principal,
                    f"BE-010:{sid}",
                    self._ttl,
                    lambda: self._backend.get_employee(principal, sid),
                    deadline,
                ),
            )
        subject = values.get("subject")
        version = request.role_profile_version
        if role_id is None and subject is not None:
            role_id = subject.role_id
            version = version or subject.role_profile_version

        # Phase B — independent slices in parallel.
        tasks: list[Awaitable[None]] = []
        if "role_profile" in slices:
            if role_id is None:
                failed(_SliceFailed("role_profile", "not_found", LookupError("no role")))
            else:
                rid, ver = role_id, version
                tasks.append(
                    run(
                        "role_profile",
                        self._slice(
                            "role_profile",
                            principal,
                            f"BE-023:{rid}:{ver}",
                            self._reference_ttl,
                            lambda: self._backend.get_role_profile(principal, rid, ver),
                            deadline,
                        ),
                    )
                )
        if subject_id is not None:
            sid = subject_id
            if "capabilities" in slices:
                tasks.append(
                    run(
                        "capabilities",
                        self._slice(
                            "capabilities",
                            principal,
                            f"BE-030:{sid}",
                            self._ttl,
                            lambda: self._backend.get_capabilities(principal, sid),
                            deadline,
                        ),
                    )
                )
            if "learning_history" in slices:
                tasks.append(
                    run(
                        "learning_history",
                        self._slice(
                            "learning_history",
                            principal,
                            f"BE-042:{sid}",
                            self._ttl,
                            lambda: self._backend.get_learning_records(principal, sid),
                            deadline,
                        ),
                    )
                )
            if "development_plans" in slices:
                tasks.append(
                    run(
                        "development_plans",
                        self._slice(
                            "development_plans",
                            principal,
                            f"BE-050:{sid}",
                            self._ttl,
                            lambda: self._backend.get_development_plans(principal, sid),
                            deadline,
                        ),
                    )
                )
            if "team" in slices:
                tasks.append(
                    run(
                        "team",
                        self._slice(
                            "team",
                            principal,
                            f"BE-011:{sid}",
                            self._ttl,
                            lambda: self._backend.get_direct_reports(principal, sid),
                            deadline,
                        ),
                    )
                )
        if "framework" in slices:
            tasks.append(
                run(
                    "framework_levels",
                    self._slice(
                        "framework",
                        principal,
                        "BE-020",
                        self._reference_ttl,
                        lambda: self._backend.get_framework_levels(principal),
                        deadline,
                    ),
                )
            )
        await asyncio.gather(*tasks)

        # Phase C — skill definitions for the role's requirements.
        skills: dict[str, SkillDTO] = {}
        role_profile = values.get("role_profile")
        if "framework" in slices and role_profile is not None:
            skill_ids = sorted({r.skill_id for r in role_profile.requirements})

            def skill_fetcher(skill_id: str) -> Callable[[], Awaitable[SkillDTO]]:
                return lambda: self._backend.get_skill(principal, skill_id)

            results = await asyncio.gather(
                *(
                    self._slice(
                        "framework",
                        principal,
                        f"BE-022:{skill_id}",
                        self._reference_ttl,
                        skill_fetcher(skill_id),
                        deadline,
                    )
                    for skill_id in skill_ids
                ),
                return_exceptions=True,
            )
            first_failure: _SliceFailed | None = None
            for skill_id, result in zip(skill_ids, results, strict=True):
                if isinstance(result, SkillDTO):
                    skills[skill_id] = result
                elif isinstance(result, _SliceFailed):
                    first_failure = first_failure or result
                elif isinstance(result, BaseException):
                    raise result
            if first_failure is not None and all(g.slice != "framework" for g in gaps):
                failed(first_failure)

        skill_gaps = []
        if role_profile is not None and values.get("capabilities") is not None:
            skill_gaps = compute_gaps(role_profile.requirements, values["capabilities"], skills)

        return CapabilityContext(
            tenant_id=principal.tenant_id,
            subject_employee_id=subject_id,
            subject=subject if "subject_profile" in slices else None,
            role_profile=role_profile,
            framework_levels=values.get("framework_levels") or [],
            skills=skills,
            capabilities=values.get("capabilities"),
            learning_history=values.get("learning_history"),
            development_plans=values.get("development_plans"),
            team=values.get("team"),
            skill_gaps=skill_gaps,
            gaps_in_context=sorted(gaps, key=lambda g: g.slice),
            as_of=datetime.now(UTC),
        )

"""A contract-faithful fake of the conventional backend (the PROPOSED API in BACKEND_INTEGRATION_SPEC.md).

Used only by integration tests, served to the real ``HttpBackendClient`` through
``httpx.ASGITransport``. It enforces the permissions the real backend is expected to enforce
(self / manager-of / HR, tenant isolation), paginates with a small page size, serves ETags and
version headers, issues OAuth tokens, and can inject faults per path.
"""

from __future__ import annotations

import asyncio
import copy
import hashlib
import json
from collections import Counter, defaultdict
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qs

import jwt
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, Response

from cfp_ai.integrations.backend.mock import data

PAGE_SIZE = 2
TENANT_WIDE = {"hr_ld_admin", "organisation_admin", "platform_super_admin"}


@dataclass
class FakeState:
    hits: Counter[str] = field(default_factory=Counter)
    seen: list[dict[str, Any]] = field(default_factory=list)
    fail: dict[str, list[tuple[int, dict[str, str]]]] = field(default_factory=lambda: defaultdict(list))
    delay_s: dict[str, float] = field(default_factory=dict)
    override: dict[str, Any] = field(default_factory=dict)  # path → raw body (or Response)
    extra_headers: dict[str, str] = field(default_factory=dict)
    service_tokens: dict[str, str] = field(default_factory=dict)  # token → tenant
    exchanged: dict[str, dict[str, Any]] = field(default_factory=dict)  # token → user claims
    token_requests: Counter[str] = field(default_factory=Counter)
    events: dict[str, dict[str, Any]] = field(default_factory=dict)


def _page(request: Request, items: list[Any]) -> dict[str, Any]:
    start = int(request.query_params.get("cursor") or 0)
    end = start + PAGE_SIZE
    return {"items": items[start:end], "next_cursor": str(end) if end < len(items) else None}


def build_fake_backend() -> tuple[FastAPI, FakeState]:
    app = FastAPI()
    state = FakeState()

    def user(request: Request) -> dict[str, Any] | None:
        auth = request.headers.get("authorization", "")
        if not auth.startswith("Bearer "):
            return None
        token = auth[7:]
        if token in state.exchanged:
            return state.exchanged[token]
        if token in state.service_tokens:
            return {"service": True, "tenant_id": state.service_tokens[token]}
        try:  # a fake: trusts the forwarded JWT's claims (the real backend verifies the signature)
            return jwt.decode(token, options={"verify_signature": False})
        except jwt.PyJWTError:
            return None

    def can_see(claims: dict[str, Any], employee_id: str) -> bool:
        employee = data.EMPLOYEES.get(employee_id)
        if employee is None or employee["tenant_id"] != claims.get("tenant_id"):
            return False
        roles = set(claims.get("roles", []))
        return bool(
            roles & TENANT_WIDE
            or claims.get("employee_id") == employee_id
            or ("line_manager" in roles and employee["manager_id"] == claims.get("employee_id"))
        )

    @app.middleware("http")
    async def harness(request: Request, call_next: Any) -> Any:
        path = request.url.path
        state.hits[path] += 1
        state.seen.append(
            {
                "path": path,
                "method": request.method,
                "headers": dict(request.headers),
                "query": dict(request.query_params),
            }
        )
        if (delay := state.delay_s.get(path)) is not None:
            await asyncio.sleep(delay)
        if state.fail.get(path):
            status, headers = state.fail[path].pop(0)
            return JSONResponse({"error": {"code": "injected"}}, status_code=status, headers=headers)
        if path in state.override:
            body = state.override[path]
            return (
                body if isinstance(body, Response) else JSONResponse(body, headers={"X-API-Version": "1.3"})
            )
        if not path.startswith("/v1/oauth/") and user(request) is None:
            return JSONResponse({"error": {"code": "unauthenticated"}}, status_code=401)
        response = await call_next(request)
        response.headers.setdefault("X-API-Version", "1.3")
        for key, value in state.extra_headers.items():
            response.headers[key] = value
        return response

    def forbidden() -> JSONResponse:
        return JSONResponse({"error": {"code": "forbidden"}}, status_code=403)

    def not_found() -> JSONResponse:
        return JSONResponse({"error": {"code": "not_found"}}, status_code=404)

    # ── OAuth (BE-002 exchange, BE-003 client credentials) ──
    @app.post("/v1/oauth/token")
    async def token(request: Request) -> Any:
        form = {k: v[0] for k, v in parse_qs((await request.body()).decode()).items()}
        grant = form.get("grant_type", "")
        state.token_requests[grant] += 1
        if form.get("client_secret") != "s3cret":
            return JSONResponse({"error": "invalid_client"}, status_code=401)
        if grant == "client_credentials":
            issued = f"svc-{form['tenant_id']}-{state.token_requests[grant]}"
            state.service_tokens[issued] = str(form["tenant_id"])
            return {"access_token": issued, "token_type": "Bearer", "expires_in": 3600}
        if grant.endswith("token-exchange"):
            claims = jwt.decode(str(form["subject_token"]), options={"verify_signature": False})
            issued = "xchg-" + hashlib.sha256(str(form["subject_token"]).encode()).hexdigest()[:24]
            state.exchanged[issued] = claims
            return {"access_token": issued, "token_type": "Bearer", "expires_in": 600}
        return JSONResponse({"error": "unsupported_grant_type"}, status_code=400)

    # ── people & organisation ──
    @app.get("/v1/me")
    async def me(request: Request) -> Any:
        c = user(request) or {}
        return {
            "user_id": c.get("sub"),
            "employee_id": c.get("employee_id"),
            "tenant_id": c.get("tenant_id"),
            "roles": c.get("roles", []),
        }

    @app.get("/v1/employees/{employee_id}")
    async def employee(employee_id: str, request: Request) -> Any:
        return data.EMPLOYEES[employee_id] if can_see(user(request) or {}, employee_id) else forbidden()

    @app.get("/v1/managers/{manager_id}/direct-reports")
    async def reports(manager_id: str, request: Request) -> Any:
        c = user(request) or {}
        if c.get("employee_id") != manager_id and not set(c.get("roles", [])) & TENANT_WIDE:
            return forbidden()
        rows = [
            {"employee_id": e["id"], "name": e["name"], "role_id": e["role_id"]}
            for e in data.EMPLOYEES.values()
            if e["manager_id"] == manager_id
        ]
        return _page(request, rows)

    @app.get("/v1/org/units")
    async def org_units(request: Request) -> Any:
        c = user(request) or {}
        units = data.ORG_UNITS if c.get("tenant_id") == data.TENANT else []
        return _page(request, units)

    # ── framework (reference data: ETag + Cache-Control) ──
    @app.get("/v1/framework/levels")
    async def levels(request: Request) -> Any:
        return _page(request, data.FRAMEWORK_LEVELS)

    @app.get("/v1/skills/{skill_id}")
    async def skill(skill_id: str, request: Request) -> Any:
        if skill_id not in data.SKILLS:
            return not_found()
        body = data.SKILLS[skill_id]
        etag = '"' + hashlib.sha256(json.dumps(body, sort_keys=True).encode()).hexdigest()[:16] + '"'
        if request.headers.get("if-none-match") == etag:
            return Response(status_code=304, headers={"ETag": etag})
        return JSONResponse(body, headers={"ETag": etag, "Cache-Control": "max-age=600"})

    @app.get("/v1/skills")
    async def skills(request: Request) -> Any:
        c = user(request) or {}
        if c.get("tenant_id") != data.TENANT:
            return _page(request, [])
        q = (request.query_params.get("q") or "").lower()
        rows = [s for s in data.SKILLS.values() if not q or q in s["name"].lower()]
        return _page(request, rows)

    @app.get("/v1/roles/{role_id}/profile")
    async def role_profile(role_id: str) -> Any:
        return data.ROLE_PROFILES.get(role_id) or not_found()

    @app.get("/v1/roles/{role_id}")
    async def role(role_id: str) -> Any:
        return data.ROLES.get(role_id) or not_found()

    @app.get("/v1/roles")
    async def roles(request: Request) -> Any:
        c = user(request) or {}
        return _page(request, list(data.ROLES.values())) if c.get("service") else forbidden()

    # ── employee data ──
    def per_employee(source: dict[str, Any], employee_id: str, request: Request) -> Any:
        if not can_see(user(request) or {}, employee_id):
            return forbidden()
        return _page(request, source.get(employee_id, []))

    @app.get("/v1/employees/{employee_id}/capabilities")
    async def capabilities(employee_id: str, request: Request) -> Any:
        return per_employee(data.CAPABILITIES, employee_id, request)

    @app.get("/v1/employees/{employee_id}/assessment-history")
    async def history(employee_id: str, request: Request) -> Any:
        return per_employee(data.ASSESSMENT_HISTORY, employee_id, request)

    @app.get("/v1/employees/{employee_id}/learning-records")
    async def learning(employee_id: str, request: Request) -> Any:
        return per_employee(data.LEARNING_RECORDS, employee_id, request)

    @app.get("/v1/employees/{employee_id}/performance-summary")
    async def performance(employee_id: str, request: Request) -> Any:
        c = user(request) or {}
        if not can_see(c, employee_id) or employee_id not in data.PERFORMANCE:
            return forbidden()
        summary = copy.deepcopy(data.PERFORMANCE[employee_id])
        if c.get("employee_id") == employee_id:
            summary.update(visibility="summary", overall_rating=None, withheld_fields=["overall_rating"])
            summary["goals"] = [{**g, "rating": None} for g in summary["goals"]]
        return summary

    @app.get("/v1/development-plans")
    async def plans(request: Request) -> Any:
        employee_id = request.query_params.get("employee_id", "")
        return per_employee(data.DEVELOPMENT_PLANS, employee_id, request)

    @app.get("/v1/development-plans/{plan_id}")
    async def plan(plan_id: str, request: Request) -> Any:
        for employee_id, rows in data.DEVELOPMENT_PLANS.items():
            for row in rows:
                if row["id"] == plan_id:
                    return row if can_see(user(request) or {}, employee_id) else forbidden()
        return not_found()

    @app.get("/v1/learning/catalogue")
    async def catalogue(request: Request) -> Any:
        wanted = set((request.query_params.get("skill_id") or "").split(",")) - {""}
        rows = [
            i
            for i in data.CATALOGUE.values()
            if i["status"] == "active" and (not wanted or wanted & set(i["skill_ids"]))
        ]
        return _page(request, rows)

    @app.get("/v1/learning/catalogue/{item_id}")
    async def catalogue_item(item_id: str) -> Any:
        return data.CATALOGUE.get(item_id) or not_found()

    # ── service-identity endpoints ──
    @app.get("/v1/tenants/{tenant_id}/entitlements")
    async def entitlements(tenant_id: str, request: Request) -> Any:
        c = user(request) or {}
        if (
            not c.get("service")
            or c["tenant_id"] != tenant_id
            or request.headers.get("x-tenant-id") != tenant_id
        ):
            return forbidden()
        return {"ai_coaching": True, "ai_dev_plans": True, "ai_talent_assessment": False}

    @app.post("/v1/integrations/ai/events")
    async def events(request: Request) -> Any:
        c = user(request) or {}
        if not c.get("service"):
            return forbidden()
        key = request.headers.get("idempotency-key", "")
        state.events.setdefault(key, await request.json())  # idempotent
        return Response(status_code=202)

    return app, state

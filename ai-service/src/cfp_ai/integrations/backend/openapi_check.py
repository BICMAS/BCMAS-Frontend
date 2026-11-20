"""Check the backend team's OpenAPI document against our integration contract (BE-090).

When the backend publishes its API documentation, run::

    python -m cfp_ai.integrations.backend.openapi_check openapi.json [--prefix /v1] [--out report.md]

For every endpoint the AI service calls (registry ``caller: ai_service``), the report shows
whether the operation exists, whether it is authenticated, and whether its response schema
provides the fields our DTOs require (with basic type checks). The report is the input for
moving an endpoint to ``confirmed`` / ``available`` in the registry. It never changes the
registry itself: confirmation is a decision of both teams.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from pydantic import BaseModel

from cfp_ai.integrations.backend import dto
from cfp_ai.integrations.backend.registry import BackendEndpointRegistry
from cfp_ai.settings import DEFAULT_CONFIG_DIR, Environment

# Endpoint → (response DTO, is a paginated list). Only endpoints the AI service reads.
RESPONSE_MODELS: dict[str, tuple[type[BaseModel], bool]] = {
    "BE-004": (dto.MeDTO, False),
    "BE-005": (dto.TenantEntitlementsDTO, False),
    "BE-010": (dto.EmployeeDTO, False),
    "BE-011": (dto.DirectReportDTO, True),
    "BE-012": (dto.OrgUnitDTO, True),
    "BE-020": (dto.FrameworkLevelDTO, True),
    "BE-021": (dto.SkillDTO, True),
    "BE-022": (dto.SkillDTO, False),
    "BE-023": (dto.RoleProfileDTO, False),
    "BE-024": (dto.RoleDTO, False),
    "BE-025": (dto.RoleDTO, True),
    "BE-026": (dto.SkillDTO, True),
    "BE-030": (dto.CapabilityLevelDTO, True),
    "BE-031": (dto.AssessmentHistoryDTO, True),
    "BE-032": (dto.PerformanceSummaryDTO, False),
    "BE-040": (dto.CatalogueItemDTO, True),
    "BE-041": (dto.CatalogueItemDTO, False),
    "BE-042": (dto.LearningRecordDTO, True),
    "BE-050": (dto.DevelopmentPlanDTO, True),
    "BE-051": (dto.DevelopmentPlanDTO, False),
    "BE-060": (dto.TalentAssessmentDTO, False),
    "BE-061": (dto.AssessmentResponseDTO, True),
    "BE-064": (dto.LibraryItemDTO, True),
    "BE-068": (dto.AssessmentItemDTO, True),
    "BE-070": (dto.EvidenceDTO, False),
}
_JSON_TYPES = {str: "string", int: "integer", float: "number", bool: "boolean", list: "array", dict: "object"}


@dataclass
class EndpointCheck:
    endpoint_id: str
    method: str
    path: str
    status: str  # ok | missing | schema_mismatch | unauthenticated
    issues: list[str] = field(default_factory=list)


@dataclass
class Report:
    checks: list[EndpointCheck]

    @property
    def ok(self) -> bool:
        return all(c.status == "ok" for c in self.checks)

    def to_markdown(self) -> str:
        lines = [
            "| Endpoint | Operation | Result | Issues |",
            "|---|---|---|---|",
        ]
        for c in self.checks:
            lines.append(
                f"| {c.endpoint_id} | `{c.method} {c.path}` | {c.status} | {'; '.join(c.issues) or '—'} |"
            )
        summary = {
            s: sum(c.status == s for c in self.checks)
            for s in ("ok", "missing", "schema_mismatch", "unauthenticated")
        }
        return "\n".join([f"**Summary:** {summary}", "", *lines])


def _normalise(path: str, prefix: str = "") -> str:
    path = path.split("?", 1)[0]
    if prefix and path.startswith(prefix):
        path = path[len(prefix) :]
    return re.sub(r"\{[^}]+\}", "{}", path.rstrip("/") or "/")


def _resolve(spec: dict[str, Any], schema: dict[str, Any] | None, depth: int = 0) -> dict[str, Any]:
    while schema and "$ref" in schema and depth < 20:
        ref = schema["$ref"]
        node: Any = spec
        for part in ref.lstrip("#/").split("/"):
            node = node.get(part, {}) if isinstance(node, dict) else {}
        schema, depth = node, depth + 1
    if schema and "allOf" in schema:  # merge allOf properties
        merged: dict[str, Any] = {"type": "object", "properties": {}, "required": []}
        for part in schema["allOf"]:
            resolved = _resolve(spec, part, depth + 1)
            merged["properties"].update(resolved.get("properties", {}))
            merged["required"] += resolved.get("required", [])
        return merged
    return schema or {}


def _response_schema(spec: dict[str, Any], operation: dict[str, Any]) -> dict[str, Any]:
    responses = operation.get("responses", {})
    ok = responses.get("200") or responses.get("201") or {}
    ok = _resolve(spec, ok)
    content = ok.get("content", {})
    media: dict[str, Any] = content.get("application/json") or next(iter(content.values()), {})
    return _resolve(spec, media.get("schema"))


def _expected_type(annotation: Any) -> str | None:
    origin = getattr(annotation, "__origin__", None) or annotation
    return _JSON_TYPES.get(origin) if isinstance(origin, type) else None


def _compare(
    spec: dict[str, Any], schema: dict[str, Any], model: type[BaseModel], is_list: bool
) -> list[str]:
    if is_list:
        items = _resolve(spec, schema.get("properties", {}).get("items"))
        if items.get("type") != "array":
            return ["expected a page object {items: [...], next_cursor}"]
        schema = _resolve(spec, items.get("items"))
    props: dict[str, Any] = schema.get("properties", {})
    issues = []
    for name, info in model.model_fields.items():
        if name not in props:
            if info.is_required():
                issues.append(f"missing field `{name}`")
            continue
        expected = _expected_type(info.annotation)
        actual = _resolve(spec, props[name]).get("type")
        if expected and actual and actual != expected and not (expected == "number" and actual == "integer"):
            issues.append(f"`{name}` is {actual}, expected {expected}")
    return issues


def check(spec: dict[str, Any], registry: BackendEndpointRegistry, *, prefix: str = "") -> Report:
    operations: dict[tuple[str, str], dict[str, Any]] = {}
    for path, item in spec.get("paths", {}).items():
        for method, operation in item.items():
            if method.lower() in ("get", "post", "put", "patch", "delete"):
                operations[(method.upper(), _normalise(path, prefix))] = operation
    global_security = spec.get("security")
    checks = []
    for endpoint_id in registry.ids():
        entry = registry.entry(endpoint_id)
        assert entry is not None
        if entry.caller != "ai_service" or entry.auth == "hmac" or not entry.path.startswith("/"):
            continue
        key = (entry.method.upper(), _normalise(entry.path))
        operation = operations.get(key)
        if operation is None:
            checks.append(
                EndpointCheck(endpoint_id, entry.method, entry.path, "missing", ["operation not documented"])
            )
            continue
        issues: list[str] = []
        status = "ok"
        if entry.auth in ("user_token", "service_token") and not (
            operation.get("security") or global_security
        ):
            status, issues = "unauthenticated", ["no security requirement declared"]
        if endpoint_id in RESPONSE_MODELS:
            model, is_list = RESPONSE_MODELS[endpoint_id]
            mismatches = _compare(spec, _response_schema(spec, operation), model, is_list)
            if mismatches:
                status = "schema_mismatch" if status == "ok" else status
                issues += mismatches
        checks.append(EndpointCheck(endpoint_id, entry.method, entry.path, status, issues))
    return Report(checks)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("openapi", type=Path)
    parser.add_argument("--prefix", default="", help="path prefix to strip from the spec, e.g. /v1")
    parser.add_argument(
        "--registry", type=Path, default=DEFAULT_CONFIG_DIR / "backend-endpoints.registry.yaml"
    )
    parser.add_argument("--out", type=Path)
    args = parser.parse_args(argv)
    spec = json.loads(args.openapi.read_text(encoding="utf-8"))
    report = check(spec, BackendEndpointRegistry.load(args.registry, Environment.PROD), prefix=args.prefix)
    text = report.to_markdown()
    if args.out:
        args.out.write_text(text + "\n", encoding="utf-8")
    else:
        sys.stdout.write(text + "\n")
    return 0 if report.ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

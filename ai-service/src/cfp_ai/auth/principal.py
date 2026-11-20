"""Authenticated principal (AI_TECHNICAL_SPEC.md §10.2).

A Principal is built only from a verified token — never from request bodies.
"""

from __future__ import annotations

import hashlib
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from cfp_ai.schemas.public import Entitlement, Role

PrincipalType = Literal["user", "candidate", "service"]

ALL_ROLES: frozenset[str] = frozenset(
    {"employee", "line_manager", "hr_ld_admin", "organisation_admin", "platform_super_admin"}
)
ALL_ENTITLEMENTS: frozenset[str] = frozenset({"ai_coaching", "ai_dev_plans", "ai_talent_assessment"})


class Principal(BaseModel):
    model_config = ConfigDict(frozen=True, extra="forbid")

    type: PrincipalType
    subject: str
    tenant_id: str
    roles: frozenset[Role]
    employee_id: str | None
    scopes: frozenset[str] = frozenset()
    entitlements: frozenset[Entitlement] | None = None  # None = resolve from backend/config
    token: str = Field(repr=False, exclude=True)
    token_expires_at: datetime

    @property
    def visibility_scope(self) -> str:
        """Hash of everything that determines what this principal may see.

        Used in cache keys so two principals with different visibility never
        share cached backend data (AI_TECHNICAL_SPEC.md §5.4).
        """
        raw = "|".join(
            [
                self.tenant_id,
                self.type,
                ",".join(sorted(self.roles)),
                self.employee_id or "-",
                ",".join(sorted(self.scopes)),
            ]
        )
        return hashlib.sha256(raw.encode()).hexdigest()[:20]

    def has_any_role(self, *roles: str) -> bool:
        return any(role in self.roles for role in roles)

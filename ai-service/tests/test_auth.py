from __future__ import annotations

import time
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa

from cfp_ai.auth.verifier import DevTokenVerifier, JwksTokenVerifier
from cfp_ai.errors import AppError
from cfp_ai.settings import Environment
from tests.conftest import DEV_SECRET

ISSUER = "https://auth.example.com"
AUDIENCE = "cfp-api"


@pytest.fixture(scope="module")
def rsa_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def _jwks_verifier(key: rsa.RSAPrivateKey) -> JwksTokenVerifier:
    return JwksTokenVerifier(
        jwks_url="https://unused.example.com/jwks",
        issuers=[ISSUER],
        audiences=[AUDIENCE],
        algorithms=["RS256"],
        leeway_s=0,
        cache_s=600,
        key_resolver=lambda _token: key.public_key(),
    )


def _claims(**overrides: Any) -> dict[str, Any]:
    now = int(time.time())
    claims = {
        "iss": ISSUER,
        "aud": AUDIENCE,
        "sub": "user-james",
        "tenant_id": "org-gec",
        "roles": ["employee"],
        "employee_id": "emp-8721",
        "iat": now,
        "exp": now + 600,
    }
    claims.update(overrides)
    return claims


async def test_jwks_verifier_accepts_valid_token(rsa_key: rsa.RSAPrivateKey) -> None:
    token = jwt.encode(_claims(ai_entitlements=["ai_coaching", "bogus"]), rsa_key, algorithm="RS256")
    principal = await _jwks_verifier(rsa_key).verify(token)
    assert principal.subject == "user-james"
    assert principal.tenant_id == "org-gec"
    assert principal.roles == frozenset({"employee"})
    assert principal.entitlements == frozenset({"ai_coaching"})  # unknown entitlements dropped
    assert principal.token not in repr(principal)
    assert "token" not in principal.model_dump()


@pytest.mark.parametrize(
    "overrides",
    [{"iss": "https://evil.example.com"}, {"aud": "other-api"}, {"exp": int(time.time()) - 10}],
)
async def test_jwks_verifier_rejects_bad_tokens(
    rsa_key: rsa.RSAPrivateKey, overrides: dict[str, Any]
) -> None:
    token = jwt.encode(_claims(**overrides), rsa_key, algorithm="RS256")
    with pytest.raises(AppError) as err:
        await _jwks_verifier(rsa_key).verify(token)
    assert err.value.code == "unauthenticated"


async def test_jwks_verifier_rejects_wrong_signature(rsa_key: rsa.RSAPrivateKey) -> None:
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    token = jwt.encode(_claims(), other, algorithm="RS256")
    with pytest.raises(AppError):
        await _jwks_verifier(rsa_key).verify(token)


async def test_jwks_verifier_rejects_hs256_alg_confusion(rsa_key: rsa.RSAPrivateKey) -> None:
    token = jwt.encode(_claims(), "some-shared-secret-value-1234567890", algorithm="HS256")
    with pytest.raises(AppError):
        await _jwks_verifier(rsa_key).verify(token)


@pytest.mark.parametrize("missing", ["tenant_id", "roles"])
async def test_missing_required_claims(rsa_key: rsa.RSAPrivateKey, missing: str) -> None:
    claims = _claims()
    del claims[missing]
    with pytest.raises(AppError):
        await _jwks_verifier(rsa_key).verify(jwt.encode(claims, rsa_key, algorithm="RS256"))


async def test_candidate_token_requires_assessment_scope(rsa_key: rsa.RSAPrivateKey) -> None:
    verifier = _jwks_verifier(rsa_key)
    no_scope = jwt.encode(_claims(sub="candidate:c-1", roles=["employee"]), rsa_key, algorithm="RS256")
    with pytest.raises(AppError):
        await verifier.verify(no_scope)
    scoped = jwt.encode(
        _claims(sub="candidate:c-1", scope="assessment:recruit-12"), rsa_key, algorithm="RS256"
    )
    principal = await verifier.verify(scoped)
    assert principal.type == "candidate"
    assert principal.scopes == frozenset({"assessment:recruit-12"})


def test_dev_verifier_refuses_production() -> None:
    with pytest.raises(RuntimeError):
        DevTokenVerifier(secret=DEV_SECRET, environment=Environment.PROD)


async def test_dev_verifier_round_trip_and_expiry() -> None:
    verifier = DevTokenVerifier(secret=DEV_SECRET, environment=Environment.TEST)
    claims = {"sub": "user-james", "tenant_id": "org-gec", "roles": ["employee"], "employee_id": "emp-8721"}
    principal = await verifier.verify(verifier.mint(claims))
    assert principal.employee_id == "emp-8721"
    with pytest.raises(AppError):
        await verifier.verify(verifier.mint(claims, ttl_s=-10))


def test_visibility_scope_differs_by_role() -> None:
    from tests.conftest import make_principal

    james = make_principal("james")
    michael = make_principal("michael")
    assert james.visibility_scope != michael.visibility_scope
    assert james.visibility_scope == make_principal("james", token="another").visibility_scope

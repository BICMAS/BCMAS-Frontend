"""Coaching safety and privacy guards (docs/ai/COACHING_AGENT.md §6).

* Wellbeing guard: a deterministic pre-check. Messages indicating crisis, harm or
  a formal workplace complaint get a supportive, fixed response *without* a model
  call, and are excluded from learner memory and summaries.
* Sensitive-fact filter: learner memory must never store health, family,
  protected characteristics or performance judgements.
"""

from __future__ import annotations

import re
from typing import Literal

WellbeingFlag = Literal["none", "wellbeing_concern", "formal_complaint"]

_CRISIS = re.compile(
    r"\b(suicid\w*|kill myself|end my life|self[- ]?harm|hurt myself|want to die|can'?t go on|"
    r"overdose|panic attacks?|breakdown)\b",
    re.IGNORECASE,
)
_COMPLAINT = re.compile(
    r"\b(harass\w*|bull(?:y|ied|ying)|discriminat\w*|sexual(?:ly)? (?:assault|misconduct)|assault\w*|"
    r"abuse[ds]?|whistle[- ]?blow\w*|grievance)\b",
    re.IGNORECASE,
)

WELLBEING_RESPONSE = (
    "Thank you for telling me. This sounds important, and it is beyond what I can help with as a "
    "development coach. Please reach out to someone who can support you directly: your organisation's "
    "employee assistance programme, a trusted person, or local emergency services if you are in danger. "
    "When you are ready, I am here to continue with your development goals."
)
COMPLAINT_RESPONSE = (
    "Thank you for raising this. Concerns like this deserve proper handling, which a coaching "
    "conversation cannot provide. Please contact HR or your organisation's speak-up or reporting channel, "
    "who can help confidentially. When you are ready, we can continue with your development goals."
)

_SENSITIVE_FACT = re.compile(
    r"\b(health|medical|illness|diagnos\w*|pregnan\w*|disab\w*|religio\w*|faith|ethnic\w*|race|"
    r"sexual\w*|gender identity|political|union member\w*|divorce|family|children|salary|"
    r"underperform\w*|disciplinar\w*|lazy|incompetent)\b",
    re.IGNORECASE,
)


def wellbeing_check(text: str) -> WellbeingFlag:
    if _CRISIS.search(text):
        return "wellbeing_concern"
    if _COMPLAINT.search(text):
        return "formal_complaint"
    return "none"


def safe_response(flag: WellbeingFlag) -> str:
    return WELLBEING_RESPONSE if flag == "wellbeing_concern" else COMPLAINT_RESPONSE


def is_sensitive_fact(text: str) -> bool:
    return bool(_SENSITIVE_FACT.search(text))

"""Data models for claims, reports and job status (docs/SPEC.md sections 6 and 7).

Field names and shapes mirror frontend/src/lib/research/types.ts (ARCHITECTURE.md section 6). Everything beyond
that contract is optional, so the frontend keeps working when it ignores the extra fields.
"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

Assessment = Literal["low", "moderate", "elevated", "high"]
ClaimStatus = Literal["pending", "verified", "partial", "unsupported", "contradicted"]
JobStatus = Literal["queued", "needs_disambiguation", "running", "done", "failed"]
LaneName = Literal["news", "company", "legal", "science"]


class Claim(BaseModel):
    claim_id: str
    run_id: str | None = None
    dimension: str
    statement: str
    severity: Assessment
    quote: str = Field(min_length=1, description="Verbatim text from the source. A finding without a quote is not a claim.")
    source_url: str
    source_title: str | None = None
    publisher: str | None = None
    published: str | None = None
    event_date: str | None = Field(default=None, description="When the event happened, if the page states it (YYYY-MM-DD, YYYY-MM or YYYY).")
    retrieved_at: str | None = None
    agent: str
    status: ClaimStatus = "pending"
    corroborated_by: list[str] = Field(default_factory=list)
    simulated: bool = False


class Source(BaseModel):
    title: str
    url: str
    publisher: str | None = None
    accessed: str | None = None


class Company(BaseModel):
    legal_name: str
    country: str | None = None
    website: str | None = None
    lei: str | None = None


class RiskFlag(BaseModel):
    category: str
    dimension: str | None = None
    severity: Assessment
    title: str
    finding: str
    date: str | None = None
    claim_ids: list[str] = Field(default_factory=list)
    # Only verified claims reach the report body (CLAUDE.md research rules).
    verification: Literal["verified"] = "verified"
    sources: list[Source] = Field(min_length=1, description="Every flag needs at least one source.")


class CategoryAssessment(BaseModel):
    category: str
    assessment: Assessment
    rationale: str


class VerificationSummary(BaseModel):
    total: int
    verified: int
    partial: int
    dropped: int


class ResearchReport(BaseModel):
    company: Company
    summary: str
    overall_assessment: Assessment
    risk_flags: list[RiskFlag]
    category_assessment: list[CategoryAssessment]
    sources: list[Source]
    limitations: str
    # Additions (SPEC section 7), all optional for the frontend.
    job_id: str | None = None
    supplier_id: str | None = None
    simulated: bool = False
    claims: list[Claim] = Field(default_factory=list)
    verification_summary: VerificationSummary | None = None

    @model_validator(mode="after")
    def flags_cite_verified_claims(self):
        if not self.claims:
            return self
        by_id = {c.claim_id: c for c in self.claims}
        for flag in self.risk_flags:
            for cid in flag.claim_ids:
                claim = by_id.get(cid)
                if claim is None:
                    raise ValueError(f"flag '{flag.title}' cites unknown claim {cid}")
                if claim.status != "verified":
                    raise ValueError(f"flag '{flag.title}' cites {cid}, which is {claim.status}, not verified")
        return self


class ProgressStep(BaseModel):
    step: str
    message: str
    agent: str | None = None
    ts: str | None = None


class Candidate(BaseModel):
    candidate_id: str
    legal_name: str
    country: str | None = None
    website: str | None = None
    lei: str | None = None


class ResearchStatus(BaseModel):
    job_id: str
    status: JobStatus
    progress: list[ProgressStep] = Field(default_factory=list)
    candidates: list[Candidate] | None = None
    error: str | None = None
    supplier_id: str | None = None

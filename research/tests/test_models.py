import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from research_service.models import Claim, ResearchReport, ResearchStatus

MOCKS = Path(__file__).resolve().parents[2] / "mocks"


def load_report() -> dict:
    return json.loads((MOCKS / "research_report.json").read_text(encoding="utf-8"))


def test_report_mock_validates():
    report = ResearchReport.model_validate(load_report())
    assert report.simulated is True
    assert report.verification_summary.total == 5


def test_progress_mock_validates_every_snapshot():
    mock = json.loads((MOCKS / "research_progress.json").read_text(encoding="utf-8"))
    for snap in mock["snapshots"]:
        status = ResearchStatus.model_validate({"job_id": mock["job_id"], **snap})
        assert status.status in {"queued", "needs_disambiguation", "running", "done"}


def test_flag_cannot_cite_a_partial_claim():
    data = load_report()
    data["risk_flags"][0]["claim_ids"] = ["c_003"]  # c_003 is partial in the mock
    with pytest.raises(ValidationError, match="not verified"):
        ResearchReport.model_validate(data)


def test_flag_cannot_cite_an_unknown_claim():
    data = load_report()
    data["risk_flags"][0]["claim_ids"] = ["c_999"]
    with pytest.raises(ValidationError, match="unknown claim"):
        ResearchReport.model_validate(data)


def test_flag_needs_a_source():
    data = load_report()
    data["risk_flags"][0]["sources"] = []
    with pytest.raises(ValidationError):
        ResearchReport.model_validate(data)


def test_claim_without_quote_is_rejected():
    with pytest.raises(ValidationError):
        Claim(claim_id="c_1", dimension="quality_risk", statement="x", severity="high", quote="",
              source_url="https://example.com", agent="news")

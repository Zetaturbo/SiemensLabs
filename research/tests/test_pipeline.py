import pytest

from research_service import context, entity
from research_service.models import ResearchReport
from research_service.tools import TOOLS, confirm_entity, get_research_report, get_research_status, research_company

from .fakes import ScriptedChain, make_context, wait_for


@pytest.fixture
def run(tmp_path):
    made = []

    def start(chain=None, **kw):
        ctx = make_context(tmp_path, chain, **kw)
        context.set_context(ctx)
        made.append(ctx)
        return ctx

    yield start
    context.set_context(None)
    for ctx in made:
        ctx.executor.shutdown(wait=True)


def test_sandbox_company_runs_end_to_end(run):
    ctx = run()
    job_id = research_company({"company_name": "Fennic Railway Brakes GmbH", "supplier_id": "BRK_0049"})["data"]["job_id"]
    job = wait_for(ctx, job_id)
    assert job["status"] == "done", job["error"]
    report = ResearchReport.model_validate(get_research_report({"job_id": job_id})["data"])
    assert report.simulated is True and report.supplier_id == "BRK_0049"
    assert report.summary.startswith("Simulated example.")
    assert len(report.risk_flags) == 4 and all(f.verification == "verified" and f.sources for f in report.risk_flags)
    assert report.overall_assessment == "high"  # the legal lane's high-severity claim is corroborated by the news lane's different publisher? see next test
    steps = [p["step"] for p in job["progress"]]
    assert steps[0] == "entity" and "plan" in steps and "search" in steps and steps[-2:] == ["report", "report"] and "verify" in steps


def test_status_matches_what_the_frontend_reads(run):
    ctx = run()
    job_id = research_company({"company_name": "Pradova Friction GmbH"})["data"]["job_id"]
    wait_for(ctx, job_id)
    status = get_research_status({"job_id": job_id})["data"]
    assert status["status"] == "done" and status["simulated"] is True
    assert all({"step", "message"} <= p.keys() for p in status["progress"])


def test_fabricated_quote_is_dropped_and_counted(run):
    ctx = run(ScriptedChain(fabricate=True))
    job_id = research_company({"company_name": "Pradova Friction GmbH"})["data"]["job_id"]
    wait_for(ctx, job_id)
    report = get_research_report({"job_id": job_id})["data"]
    assert all("not in any page" not in c["quote"] for c in report["claims"])
    assert report["verification_summary"]["dropped"] == 4  # one invented claim per lane
    assert "dropped" in report["limitations"]


def test_high_severity_claim_with_one_source_stays_partial(run):
    ctx = run(ScriptedChain(same_fact=False))
    job_id = research_company({"company_name": "Fennic Railway Brakes GmbH"})["data"]["job_id"]
    wait_for(ctx, job_id)
    report = get_research_report({"job_id": job_id})["data"]
    legal = next(c for c in report["claims"] if c["agent"] == "legal")
    assert legal["status"] == "partial"
    assert legal["claim_id"] not in {i for f in report["risk_flags"] for i in f["claim_ids"]}
    assert report["verification_summary"]["partial"] == 1


def test_nothing_verified_gives_an_honest_empty_report(run):
    ctx = run(ScriptedChain(verify_label="unsupported"))
    job_id = research_company({"company_name": "Pradova Friction GmbH"})["data"]["job_id"]
    wait_for(ctx, job_id)
    report = get_research_report({"job_id": job_id})["data"]
    assert report["risk_flags"] == [] and report["overall_assessment"] == "low"
    assert "No findings" in report["summary"]


def test_a_failing_model_ends_the_job_as_failed(run):
    ctx = run(ScriptedChain(fail="agent"))
    job_id = research_company({"company_name": "Pradova Friction GmbH"})["data"]["job_id"]
    job = wait_for(ctx, job_id)
    assert job["status"] == "failed" and "Every lane failed" in job["error"]
    assert get_research_status({"job_id": job_id})["data"]["error"]


def test_a_failing_planner_falls_back_to_default_questions(run):
    ctx = run(ScriptedChain(fail="planner"))
    job_id = research_company({"company_name": "Pradova Friction GmbH"})["data"]["job_id"]
    job = wait_for(ctx, job_id)
    assert job["status"] == "done"
    assert any("default questions" in p["message"] for p in job["progress"])


def test_report_not_ready_and_unknown_job(run):
    run(workers=1)
    with pytest.raises(Exception) as e:
        get_research_report({"job_id": "res_nope"})
    assert getattr(e.value, "code", "") == "UNKNOWN_JOB"


def test_dataset_ids_are_refused_by_the_tool(run):
    run()
    with pytest.raises(Exception) as e:
        research_company({"company_name": "BRK_0049"})
    assert e.value.code == "SYNTHETIC_ENTITY"


def test_ambiguous_company_waits_for_the_buyer_then_continues(run, monkeypatch, tmp_path):
    from research_service.sources import SandboxAdapter  # noqa: F401

    ctx = run(live_folder=context.SANDBOX / "pradova-friction")
    candidates = [{"candidate_id": "529900AAA", "legal_name": "Acme Brakes AG", "country": "DE", "website": None, "lei": "529900AAA"},
                  {"candidate_id": "529900BBB", "legal_name": "Acme Brakes Ltd", "country": "GB", "website": None, "lei": "529900BBB"}]
    monkeypatch.setattr(entity, "resolve", lambda name, country=None, http=None: {"candidates": candidates})
    job_id = research_company({"company_name": "Acme Brakes", "supplier_id": "BRK_0010"})["data"]["job_id"]
    job = wait_for(ctx, job_id)
    assert job["status"] == "needs_disambiguation"
    assert get_research_status({"job_id": job_id})["data"]["candidates"][0]["legal_name"] == "Acme Brakes AG"
    confirm_entity({"job_id": job_id, "candidate_id": "529900BBB"})
    job = wait_for(ctx, job_id, states=("done", "failed"))
    assert job["status"] == "done", job["error"]
    report = get_research_report({"job_id": job_id})["data"]
    assert report["company"]["legal_name"] == "Acme Brakes Ltd" and report["company"]["lei"] == "529900BBB"
    assert report["supplier_id"] == "BRK_0010" and report["simulated"] is False


def test_confirm_entity_rejects_unknown_candidate(run, monkeypatch):
    ctx = run()
    monkeypatch.setattr(entity, "resolve", lambda name, country=None, http=None: {"candidates": [{"candidate_id": "A", "legal_name": "Acme AG", "country": "DE", "website": None, "lei": "A"}]})
    job_id = research_company({"company_name": "Acme"})["data"]["job_id"]
    wait_for(ctx, job_id)
    with pytest.raises(Exception) as e:
        confirm_entity({"job_id": job_id, "candidate_id": "ZZZ"})
    assert e.value.code == "INVALID_INPUT"


def test_registry_outage_does_not_stop_the_run(run, monkeypatch):
    ctx = run(live_folder=context.SANDBOX / "pradova-friction")

    def down(*a, **k):
        raise RuntimeError("gleif unreachable")

    monkeypatch.setattr(entity, "resolve", down)
    job_id = research_company({"company_name": "Some Real Company AG"})["data"]["job_id"]
    job = wait_for(ctx, job_id)
    assert job["status"] == "done" and any("unavailable" in p["message"] for p in job["progress"])


def test_all_tools_are_registered():
    assert set(TOOLS) == {"research_company", "get_research_status", "confirm_entity", "get_research_report", "get_research_claims", "list_research_jobs"}

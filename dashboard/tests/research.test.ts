import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { getResearchJob, startResearch } from "../lib/research";
import { isResearchable } from "../lib/research-types";

describe("research integration in replay mode (RESEARCH_API_URL unset)", () => {
  it("only allows research on suppliers with real names", () => {
    assert.equal(isResearchable("BRKR_0002"), true);
    assert.equal(isResearchable("SUPP_00018"), false);
    assert.equal(isResearchable("BRK_0020"), false);
  });

  it("runs a replay job to a simulated report", async () => {
    const { job_id, mode } = await startResearch({ company_name: "Knorr-Bremse AG", country: "Germany", supplier_id: "BRKR_0002" });
    assert.equal(mode, "replay");
    assert.equal((await getResearchJob(job_id)).status, "running");

    const realNow = Date.now;
    Date.now = () => realNow() + 10_000;
    try {
      const done = await getResearchJob(job_id);
      assert.equal(done.status, "done");
      assert.ok(done.report);
      assert.equal(done.report.simulated, true);
      assert.ok(["low", "moderate", "elevated", "high"].includes(done.report.overall_assessment));
      assert.ok(done.report.category_assessment.length > 0);
    } finally {
      Date.now = realNow;
    }
  });

  it("rejects unknown jobs", async () => {
    await assert.rejects(getResearchJob("res_replay_missing"), /Unknown research job/);
  });
});

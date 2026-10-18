"""Settings read from the environment. Variable names match the frontend (`LLM_*`) and the data service (`DATABASE_URL`)."""

import os
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


@dataclass(frozen=True)
class Settings:
    database_url: str
    llm_base_url: str
    llm_api_key: str
    llm_model: str
    tavily_api_key: str
    store_dir: Path
    max_concurrent_runs: int
    max_run_seconds: int
    max_lane_steps: int
    max_claims_per_lane: int
    max_tavily_calls: int

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_api_key)


def load_settings() -> Settings:
    env = os.environ.get
    return Settings(
        database_url=env("DATABASE_URL", "postgresql://siemens:siemens@localhost:5433/siemenslabs"),
        llm_base_url=env("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1"),
        llm_api_key=env("LLM_API_KEY", ""),
        llm_model=env("LLM_MODEL", "nvidia/nemotron-3-ultra-550b-a55b"),
        tavily_api_key=env("TAVILY_API_KEY", ""),
        store_dir=Path(env("RESEARCH_STORE_DIR", str(ROOT / "var" / "jobs"))),
        max_concurrent_runs=int(env("RESEARCH_MAX_CONCURRENT_RUNS", "3")),
        max_run_seconds=int(env("RESEARCH_MAX_RUN_SECONDS", "240")),
        max_lane_steps=int(env("RESEARCH_MAX_LANE_STEPS", "5")),
        max_claims_per_lane=int(env("RESEARCH_MAX_CLAIMS_PER_LANE", "6")),
        max_tavily_calls=int(env("RESEARCH_MAX_TAVILY_CALLS", "40")),
    )

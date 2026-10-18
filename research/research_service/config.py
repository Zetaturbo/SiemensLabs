"""Settings read from the environment. Variable names match the frontend (`LLM_*`) and the data service (`DATABASE_URL`)."""

import os
from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    database_url: str
    llm_base_url: str
    llm_api_key: str
    llm_model: str

    @property
    def llm_configured(self) -> bool:
        return bool(self.llm_api_key)


def load_settings() -> Settings:
    return Settings(
        database_url=os.environ.get("DATABASE_URL", "postgresql://siemens:siemens@localhost:5433/siemenslabs"),
        llm_base_url=os.environ.get("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1"),
        llm_api_key=os.environ.get("LLM_API_KEY", ""),
        llm_model=os.environ.get("LLM_MODEL", "nvidia/nemotron-3-ultra-550b-a55b"),
    )

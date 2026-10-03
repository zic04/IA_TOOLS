# Fixture: pydantic settings classes, for the `env` facts source. One v2 class (pydantic_settings, env_prefix in
# model_config, a Field alias override) and one v1-style class (a nested class Config, a Field env override).
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="ACME_")

    database_url: str
    secret_key: str = Field(..., alias="SECRET_KEY_OVERRIDE")
    debug: bool = False


class LegacySettings(BaseSettings):
    class Config:
        env_prefix = "LEGACY_"

    api_key: str = Field(..., env="LEGACY_API_KEY_OVERRIDE")
    timeout: int = 30

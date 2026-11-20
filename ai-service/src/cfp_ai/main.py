"""ASGI entrypoint: ``uvicorn cfp_ai.main:app``."""

from cfp_ai.api.app import create_app

app = create_app()

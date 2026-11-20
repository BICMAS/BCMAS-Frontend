"""In-process mock of the conventional backend — DEV/TEST ONLY.

Isolation guarantees:
  * ``MockBackendClient`` refuses to construct outside dev/test;
  * ``Settings`` rejects ``backend_mode=mock`` outside dev/test;
  * the app factory imports this package lazily, only in mock mode;
  * the production Docker image deletes this package entirely.

The seed data mirrors the frontend prototype's personas and mock records so the
two can be exercised together. It is NOT a database and is never persisted.
"""

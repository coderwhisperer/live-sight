import json
import logging
from logging.handlers import RotatingFileHandler

from livesight.shared.config import (
    API_LOG_BACKUP_COUNT,
    API_LOG_FILE,
    API_LOG_MAX_BYTES,
    LOGS_DIR,
)


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": self.formatTime(record, "%Y-%m-%dT%H:%M:%S"),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for key in ("method", "path", "status", "latency_ms", "event"):
            value = getattr(record, key, None)
            if value is not None:
                payload[key] = value
        return json.dumps(payload, separators=(",", ":"))


def configure_logging() -> logging.Logger:
    LOGS_DIR.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        API_LOG_FILE,
        maxBytes=API_LOG_MAX_BYTES,
        backupCount=API_LOG_BACKUP_COUNT,
    )
    handler.setFormatter(JsonFormatter())
    root = logging.getLogger("livesight")
    root.setLevel(logging.INFO)
    root.handlers = [handler]
    root.propagate = False
    return root

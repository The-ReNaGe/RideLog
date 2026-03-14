# Empty __init__ for routes package
import logging
import os
from pathlib import Path

_logger = logging.getLogger("ridelog.security")


def secure_delete(file_path: str | Path) -> None:
    """Overwrite a file with zeros then delete it so no residual data remains."""
    p = Path(file_path)
    try:
        if not p.is_file():
            return
        size = p.stat().st_size
        with open(p, "wb") as f:
            f.write(b"\x00" * size)
            f.flush()
            os.fsync(f.fileno())
        p.unlink()
    except OSError as e:
        _logger.warning("secure_delete failed for %s: %s", file_path, e)

"""Which browser origins may call the engine.

Pages served from this machine (localhost, any port) are always allowed; other sites only when listed
in settings.CORS_ORIGINS. Requests without an Origin header (the HUD, curl, servers) are not browsers
and are allowed. CORS headers do not cover WebSockets, so the WebSocket route checks this itself.
"""

import re
from typing import Optional

from ..config import settings

LOCAL_ORIGIN_REGEX = r"^https?://(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$"


def origin_allowed(origin: Optional[str]) -> bool:
    """True when a request with this Origin header may use the engine."""
    if origin is None:
        return True
    if "*" in settings.CORS_ORIGINS or origin in settings.CORS_ORIGINS:
        return True
    return re.fullmatch(LOCAL_ORIGIN_REGEX, origin) is not None

"""Site adapters, looked up by hostname. A site without adapter is unsupported."""

from types import ModuleType
from urllib.parse import urlparse

from . import kavak

_ADAPTERS: dict[str, tuple[str, ModuleType]] = {
    kavak.HOSTNAME: (kavak.PATH_PREFIX, kavak),
}


def get_adapter(url: str) -> ModuleType | None:
    parsed = urlparse(url)
    entry = _ADAPTERS.get((parsed.hostname or "").lower())
    if entry is None:
        return None
    prefix, module = entry
    return module if parsed.path.startswith(prefix) else None

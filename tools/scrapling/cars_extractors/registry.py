"""Site adapters, looked up by hostname. A site without adapter is unsupported."""

from types import ModuleType
from urllib.parse import urlparse

from . import carone, kavak

_ADAPTERS: dict[str, tuple[str, ModuleType]] = {
    kavak.HOSTNAME: (kavak.PATH_PREFIX, kavak),
    carone.HOSTNAME: (carone.PATH_PREFIX, carone),
}


def get_adapter(url: str) -> ModuleType | None:
    parsed = urlparse(url)
    entry = _ADAPTERS.get((parsed.hostname or "").lower())
    if entry is None:
        return None
    prefix, module = entry
    path = parsed.path
    return module if path == prefix or path.startswith(prefix + "/") else None


def list_sites() -> list[dict[str, str | None]]:
    """Every site a search can run on, with the URL its search starts from."""
    return [
        {"id": module.SITE_ID, "start_url": module.START_URL, "currency": getattr(module, "CARD_CURRENCY", None)}
        for _, module in _ADAPTERS.values()
    ]

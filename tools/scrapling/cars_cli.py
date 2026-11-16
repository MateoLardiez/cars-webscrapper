"""Command line entry point used by the backend. Prints one JSON object to stdout.

    python cars_cli.py list <url>
    python cars_cli.py details <url> [<url> ...]
"""

import contextlib
import json
import sys
from typing import Any

from cars_extractors.service import get_listing_details, list_listings


def run(argv: list[str]) -> dict[str, Any]:
    if len(argv) >= 2 and argv[0] == "list":
        return list_listings(argv[1])
    if len(argv) >= 2 and argv[0] == "details":
        return get_listing_details(argv[1:])
    return {"supported": True, "error": "Usage: cars_cli.py list <url> | details <url>..."}


def main() -> None:
    # Libraries may print to stdout: keep it clean for the JSON result
    with contextlib.redirect_stdout(sys.stderr):
        result = run(sys.argv[1:])
    sys.stdout.write(json.dumps(result))


if __name__ == "__main__":
    main()

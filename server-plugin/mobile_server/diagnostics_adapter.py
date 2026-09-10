"""Version-1 diagnostics profile adapter using public Hermes path APIs only.

This is a narrow transport adapter, not an alternate profile registry. Auth stays
in the existing compatibility probe. Never derive a home from client path data.
"""

from pathlib import Path

from fastapi import HTTPException


def diagnostics_home(profile: str | None) -> Path:
    try:
        from hermes_constants import get_hermes_home

        if profile is None:
            return Path(get_hermes_home())
        from hermes_cli.profiles import get_profile_dir, profile_exists, validate_profile_name

        validate_profile_name(profile)
        if not profile_exists(profile):
            raise HTTPException(404, "Diagnostics profile unavailable")
        return Path(get_profile_dir(profile))
    except (ImportError, AttributeError):
        raise HTTPException(503, "Diagnostics profile compatibility unavailable") from None
    except ValueError:
        raise HTTPException(400, "Invalid diagnostics profile") from None

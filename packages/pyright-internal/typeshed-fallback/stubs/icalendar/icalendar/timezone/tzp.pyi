import datetime
from typing import Final

from dateutil.rrule import rrule

from ..cal import Timezone
from ..prop import vRecur
from .provider import TZProvider

__all__ = ["TZP"]

DEFAULT_TIMEZONE_PROVIDER: Final = "zoneinfo"

class TZP:
    def __init__(self, provider: str | TZProvider = "zoneinfo") -> None: ...
    def use_pytz(self) -> None: ...
    def use_zoneinfo(self) -> None: ...
    def use(self, provider: str | TZProvider) -> None: ...
    def use_default(self) -> None: ...
    def localize_utc(self, dt: datetime.date) -> datetime.datetime: ...
    def localize(self, dt: datetime.date, tz: datetime.tzinfo | str) -> datetime.datetime: ...
    def cache_timezone_component(self, timezone_component: Timezone) -> None: ...
    def fix_rrule_until(self, rrule: rrule, ical_rrule: vRecur) -> None: ...
    def create_timezone(self, timezone_component: Timezone) -> datetime.tzinfo: ...
    def clean_timezone_id(self, tzid: str) -> str: ...
    def timezone(self, tz_id: str) -> datetime.tzinfo | None: ...
    def uses_pytz(self) -> bool: ...
    def uses_zoneinfo(self) -> bool: ...
    @property
    def name(self) -> str: ...

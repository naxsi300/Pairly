"""Bot package."""

from pairly.bot.admin import router as admin_router
from pairly.bot.handlers import router

__all__ = ["admin_router", "router"]

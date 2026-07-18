"""Small database-backed scheduler for watched procurement opportunities."""

from __future__ import annotations

import asyncio
import os

from loguru import logger

from construction_os.services.opportunity_monitoring import run_due_monitors_once


def scheduler_interval_seconds() -> int:
    raw = os.getenv("OPPORTUNITY_MONITOR_SCHEDULER_SECONDS", "60").strip()
    try:
        return max(15, int(raw))
    except ValueError:
        logger.warning(
            f"Invalid OPPORTUNITY_MONITOR_SCHEDULER_SECONDS={raw!r}; using 60"
        )
        return 60


async def run_scheduler() -> None:
    interval = scheduler_interval_seconds()
    logger.info(f"Opportunity monitor scheduler started with {interval}s interval")
    while True:
        try:
            result = await run_due_monitors_once()
            if result["claimed"] or result["failed"]:
                logger.info(f"Opportunity monitor scheduler pass: {result}")
        except Exception as exc:
            logger.exception(f"Opportunity monitor scheduler pass failed: {exc}")
        await asyncio.sleep(interval)


def main() -> None:
    asyncio.run(run_scheduler())


if __name__ == "__main__":
    main()

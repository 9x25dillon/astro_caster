"""
verify_ai.py
============
Quick smoke test for the live AI wiring. Computes a small real chart and asks
Astra one question, then reports whether the answer came from the LLM or the
offline fallback. Run after setting AAE_AI_API_KEY in .env:

    .venv/bin/python verify_ai.py
"""

import asyncio

try:
    from dotenv import load_dotenv

    load_dotenv()
except ImportError:
    pass

from ai import ai_status, interpret  # noqa: E402  (after dotenv load)
from ephemeris import calculate_chart  # noqa: E402
from models import ChartRequest  # noqa: E402


async def main() -> None:
    status = ai_status()
    print("AI status:", status)
    if not status["configured"]:
        print("\n⚠  No AAE_AI_API_KEY set — Astra will use the offline reflection.")
        print("   Add it to backend/.env, then re-run this script.")

    chart = calculate_chart(
        ChartRequest(year=1990, month=7, day=4, hour=14, minute=30,
                     lat=40.7128, lng=-74.006, tz_offset=-4)
    )
    print("\nAsking Astra about the Sun…\n")
    result = await interpret(
        query="What is the core theme of my Sun placement?",
        chart=chart.model_dump(),
        lens="psychological",
        selected_type="planet",
        selected_id="Sun",
    )
    print(f"source = {result['source']}   model = {result['model']}")
    if result.get("note"):
        print("note  =", result["note"])
    print("\n--- interpretation (first 600 chars) ---")
    print(result["interpretation"][:600])
    print("\n" + ("✅ LIVE MODEL responded." if result["source"] == "llm"
                   else "ℹ  Served by offline fallback."))


if __name__ == "__main__":
    asyncio.run(main())

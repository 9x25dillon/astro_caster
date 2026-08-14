"""/api/health must describe the ephemeris it HAS, not the folder it found.

The old check was `os.path.isdir(SE_EPHE_PATH)`. Swiss names its data files by
content and treats a missing class as a silent fallback to Moshier, so a
directory holding nothing but asteroids reported "swiss-files" while every
planet in every chart came from an analytic series. Track A3's JPL Horizons
anchors are what finally made that visible, and they put the cost at up to
3.13 arcsec — harmless to a reading, but the point is that no surface in the
system could tell you it was happening.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import ephemeris as E  # noqa: E402


def _touch(directory, *names):
    for n in names:
        (directory / n).write_bytes(b"")
    return str(directory)


def test_detects_each_file_class(tmp_path):
    present = E._swiss_files_present(
        _touch(tmp_path, "sepl_18.se1", "semo_18.se1", "seas_18.se1")
    )
    assert present == {"planets": True, "moon": True, "asteroids": True}


def test_asteroids_alone_do_not_count_as_planets(tmp_path):
    """The exact shape of the bug: Chiron has data, nothing else does."""
    present = E._swiss_files_present(_touch(tmp_path, "seas_18.se1"))
    assert present == {"planets": False, "moon": False, "asteroids": True}


def test_unrelated_files_are_not_mistaken_for_ephemeris(tmp_path):
    """A folder is not an ephemeris just because it has things in it."""
    present = E._swiss_files_present(
        _touch(tmp_path, "README.md", "swisseph.wasm", "sepl_notes.txt")
    )
    assert present == {"planets": False, "moon": False, "asteroids": False}
    # `sepl_notes.txt` shares the planet prefix and must still be rejected —
    # the .se1 extension is what makes it a data file.


def test_missing_directory_reports_nothing_rather_than_raising():
    """A health probe must never be the thing that takes the service down."""
    assert E._swiss_files_present("/nonexistent/ephe/path") == {
        "planets": False,
        "moon": False,
        "asteroids": False,
    }


@pytest.mark.parametrize(
    "using_files,present,expected",
    [
        (False, {"planets": False, "moon": False, "asteroids": False}, "moshier"),
        # A directory that exists but holds no data files is still Moshier.
        (True, {"planets": False, "moon": False, "asteroids": False}, "moshier"),
        # The configuration this project actually ships.
        (True, {"planets": False, "moon": False, "asteroids": True}, "swiss-partial"),
        # Planets without the Moon is still partial — the Moon is the body a
        # missing file hurts most, since it moves ~0.55 arcsec per second.
        (True, {"planets": True, "moon": False, "asteroids": True}, "swiss-partial"),
        (True, {"planets": True, "moon": True, "asteroids": True}, "swiss-files"),
    ],
)
def test_mode_reflects_where_the_bodies_come_from(
    monkeypatch, using_files, present, expected
):
    monkeypatch.setattr(E, "_USING_FILES", using_files)
    monkeypatch.setattr(E, "_SWISS_FILES", present)
    status = E.ephemeris_status()
    assert status["mode"] == expected
    assert status["planet_source"] == (
        "swiss-files" if present["planets"] else "moshier"
    )


def test_shipped_configuration_reports_itself_honestly():
    """Pin what THIS repo's pinned config actually says.

    conftest.py forces SE_EPHE_PATH to the vendored
    packages/astra-core/src/vendor/swisseph. It carried only seas_18.se1 until
    2026-08-14, so this asserted "swiss-partial" and every planet came from
    Moshier; sepl_18 and semo_18 were then vendored and it became true.

    Going red here means one of two things, and they need opposite responses:
    a data file was LOST from the vendor directory (fix the directory, and
    expect the tarot spreads of ~3.4% of charts to have moved), or the probe
    regressed to checking that a folder exists. Do not "fix" it by relaxing
    the assertion.
    """
    status = E.ephemeris_status()
    assert status["mode"] == "swiss-files"
    assert status["files"] == {"planets": True, "moon": True, "asteroids": True}
    assert status["planet_source"] == "swiss-files"
    assert status["moon_source"] == "swiss-files"
    assert status["asteroid_source"] == "swiss-files"

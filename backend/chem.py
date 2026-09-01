"""
=============================================================================
  YOUR FILE #1 — the chemistry math
=============================================================================

Every function here takes plain numbers and returns a CalcResult (see
models.py). The UI already knows how to display a CalcResult, so as soon as
you fill one of these in, it just works in the app.

I built `percent_error` all the way through as a worked example.
Copy its shape for the rest.

Rules of the road:
  - Return a CalcResult, don't print anything.
  - Fill in `work` with the actual numbers plugged in — that's what makes
    the report look like you did it by hand.
  - Raise ValueError with a clear message on bad input (like dividing by 0).
    The UI catches it and shows the message in red.

See BACKEND_GUIDE.md → Step 1.
"""

from __future__ import annotations

from .models import CalcResult, NotBuiltYet


# ---------------------------------------------------------------------------
# DONE — worked example. Read this one carefully, then copy the pattern.
# ---------------------------------------------------------------------------
def percent_error(experimental: float, accepted: float) -> CalcResult:
    """How far off your measurement was from the real/accepted value.

    Formula:  |experimental - accepted| / |accepted| x 100
    """
    if accepted == 0:
        raise ValueError("Accepted value can't be 0 — you'd be dividing by zero.")

    difference = abs(experimental - accepted)
    value = difference / abs(accepted) * 100

    return CalcResult(
        name="Percent Error",
        formula="|experimental - accepted| / |accepted| x 100",
        value=value,
        unit="%",
        work=(
            f"|{experimental} - {accepted}| / |{accepted}| x 100\n"
            f"= {difference:.4g} / {abs(accepted):.4g} x 100\n"
            f"= {value:.4g}%"
        ),
    )


# ---------------------------------------------------------------------------
# YOUR TURN — everything below is a stub.
# Delete the `raise NotBuiltYet(...)` line and write the real thing.
# ---------------------------------------------------------------------------


def percent_yield(actual_g: float, theoretical_g: float) -> CalcResult:
    """actual / theoretical x 100.

    Almost identical to percent_error — good one to do first.
    Guard against theoretical_g == 0.
    """
    raise NotBuiltYet("Step 1a — percent_yield in backend/chem.py")


def density(mass_g: float, volume_ml: float) -> CalcResult:
    """density = mass / volume.  Unit is "g/mL".

    Guard against volume_ml == 0.
    """
    raise NotBuiltYet("Step 1b — density in backend/chem.py")


def moles_from_grams(grams: float, molar_mass: float) -> CalcResult:
    """moles = grams / molar mass.  Unit is "mol".

    Guard against molar_mass <= 0 (a molar mass can never be zero or negative).
    """
    raise NotBuiltYet("Step 1c — moles_from_grams in backend/chem.py")


def molarity(moles: float, liters: float) -> CalcResult:
    """M = moles of solute / liters of solution.  Unit is "M".

    Heads up: labs usually give you mL. Decide whether you convert here or
    make the UI pass liters. (The UI currently passes whatever's in the box,
    and the field is labeled "liters", so you're fine.)
    """
    raise NotBuiltYet("Step 1d — molarity in backend/chem.py")


def average(values: list[float], label: str = "Average", unit: str = "") -> CalcResult:
    """Mean of a list of numbers — handy for averaging trials.

    Guard against an empty list.
    For `work`, something like "(12.4 + 12.6 + 12.5) / 3 = 12.5" reads nicely.
    """
    raise NotBuiltYet("Step 1e — average in backend/chem.py")


# ---------------------------------------------------------------------------
# The UI reads this to build its calculation menu.
# Each entry: key -> (display name, [input labels], function)
# When you finish a function above, it lights up in the dropdown automatically.
# Add your own entries here if you write extra calculations.
# ---------------------------------------------------------------------------
CALCULATIONS = {
    "percent_error": ("Percent Error", ["Experimental value", "Accepted value"], percent_error),
    "percent_yield": ("Percent Yield", ["Actual yield (g)", "Theoretical yield (g)"], percent_yield),
    "density": ("Density", ["Mass (g)", "Volume (mL)"], density),
    "moles_from_grams": ("Moles from Grams", ["Mass (g)", "Molar mass (g/mol)"], moles_from_grams),
    "molarity": ("Molarity", ["Moles of solute", "Liters of solution"], molarity),
}

"""
The chemistry math.

Every function here takes plain numbers and returns a CalcResult (see
models.py). The UI knows how to display a CalcResult, so filling one of
these in makes it work in the app straight away.

`percent_error` is written out in full as a worked example — copy its
shape for the rest.

Rules of the road:
  - Return a CalcResult, don't print anything.
  - Fill in `work` with the actual numbers plugged in — that's what makes
    the report look like you did it by hand.
  - Raise ValueError with a clear message on bad input (like dividing by 0).
    The UI catches it and shows the message in red.
"""

from __future__ import annotations

from .models import CalcResult, NotBuiltYet


# ---------------------------------------------------------------------------
# Worked example — the shape every calculation below follows.
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
        unit="g/mL",
        work=(
            f"|{experimental} - {accepted}| / |{accepted}| x 100\n"
            f"= {difference:.4g} / {abs(accepted):.4g} x 100\n"
            f"= {value:.4g}%"
        ),
    )


# ---------------------------------------------------------------------------
# Still stubs — delete the `raise NotBuiltYet(...)` line and write the
# real thing. The UI shows an amber notice for anything unfinished.
# ---------------------------------------------------------------------------


def percent_yield(actual_g: float, theoretical_g: float) -> CalcResult:
    if theoretical_g != 0:
        value = round((actual_g / theoretical_g) * 100)
        return CalcResult(
            name="Percent Yield",
            formula="(Theoretical g ÷ actual g) x 100",
            value=value,
            unit="g/mL",
            work=f"{theoretical_g} ÷ {actual_g} * 100 = {value:.4g}",
        )
    else:
        raise ValueError("You cannot Divide By Zero")


def density(mass_g: float, volume_ml: float) -> CalcResult:
    if volume_ml != 0:
        value = mass_g / volume_ml
        return CalcResult(
            name="Density",
            formula="Mass ÷ Volume",
            value=value,
            unit="g/mL",
            work=f"{mass_g} ÷ {volume_ml} = {value:.4g}",
        )
    else:
        raise ValueError("You cannot Divide By Zero")


def moles_from_grams(grams: float, molar_mass: float) -> CalcResult:

    # Guard against molar_mass <= 0 (a molar mass can never be zero or negative).
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

    `label` and `unit` come from the caller, because this one averages
    anything — masses, temperatures, volumes. Only the caller knows which.
    """
    if not values:
        raise ValueError("Nothing to average — add at least one value.")

    number = 0
    for num in values:
        number += num
    final_val = number / len(values)
    shown = " + ".join(f"{v:g}" for v in values)
    return CalcResult(
        name=label,
        formula="all values added, then divided by how many there are",
        value=final_val,
        unit=unit,
        work=f"({shown}) / {len(values)} = {final_val:.4g}",
    )


# ---------------------------------------------------------------------------
# The UI reads this to build its calculation menu.
# Each entry: key -> (display name, [input labels], function)
# When you finish a function above, it lights up in the dropdown automatically.
# Add your own entries here if you write extra calculations.
# ---------------------------------------------------------------------------
CALCULATIONS = {
    "percent_error": (
        "Percent Error",
        ["Experimental value", "Accepted value"],
        percent_error,
    ),
    "percent_yield": (
        "Percent Yield",
        ["Actual yield (g)", "Theoretical yield (g)"],
        percent_yield,
    ),
    "density": ("Density", ["Mass (g)", "Volume (mL)"], density),
    "moles_from_grams": (
        "Moles from Grams",
        ["Mass (g)", "Molar mass (g/mol)"],
        moles_from_grams,
    ),
    "molarity": ("Molarity", ["Moles of solute", "Liters of solution"], molarity),
    # Average takes a LIST, so the UI gives it a one-at-a-time value entry
    # instead of a box per label. See LIST_INPUTS in ui/app.py.
    "average": ("Average", ["Value"], average),
}

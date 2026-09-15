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

from .models import CalcResult


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
        unit="%",
        work=(
            f"|{experimental} - {accepted}| / |{accepted}| x 100\n"
            f"= {difference:.4g} / {abs(accepted):.4g} x 100\n"
            f"= {value:.4g}%"
        ),
    )


# ---------------------------------------------------------------------------
# The rest of the calculations. Guard the bad input first, do the maths,
# then wrap it in a CalcResult — same shape as percent_error above.
# ---------------------------------------------------------------------------


def percent_yield(actual_g: float, theoretical_g: float) -> CalcResult:
    if theoretical_g != 0:
        value = (actual_g / theoretical_g) * 100
        return CalcResult(
            name="Percent Yield",
            formula="(Actual g ÷ Thoeretical g) x 100",
            value=value,
            unit="%",
            work=f"{actual_g} ÷ {theoretical_g} * 100 = {value:.4g}",
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
    """moles = grams / molar mass.  Unit is "mol"."""
    if molar_mass <= 0:
        raise ValueError("Molar mass has to be more than 0.")

    value = grams / molar_mass

    return CalcResult(
        name="Moles from Grams",
        formula="grams / molar mass",
        value=value,
        unit="mol",
        work=f"{grams} g / {molar_mass} g/mol = {value:.4g} mol",
    )


def molarity(moles: float, liters: float) -> CalcResult:
    if liters <= 0:
        raise ValueError("Liters of solution has to be more than 0.")

    value = moles / liters

    return CalcResult(
        name="Molarity",
        formula="moles of solute / liters of solution",
        value=value,
        unit="M",
        work=f"{moles} mol / {liters} L = {value:.4g} M",
    )


def average(values: list[float], label: str = "Average", unit: str = "") -> CalcResult:
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

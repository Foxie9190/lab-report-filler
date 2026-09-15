"""
The scientific calculator behind the Calculator tab.

You hand it a typed expression like "sin(30) + log(100)" and it hands back
a number. Nothing here touches the lab report — it's a scratchpad.

Why this doesn't just call eval(): eval() on whatever someone types will
happily run `__import__("os").system(...)`. Instead the expression is
parsed into a syntax tree and walked one node at a time, and anything
that isn't arithmetic or a whitelisted function is refused. A name that
isn't in FUNCTIONS or CONSTANTS never gets looked up at all.
"""

from __future__ import annotations

import ast
import math
import re

MAX_LENGTH = 500          # a typed expression, not a program
MAX_EXPONENT = 1000       # 9 ** 9 ** 9 would hang the app
MAX_FACTORIAL = 170       # 171! overflows a float

# Characters people actually type, mapped to something Python understands.
_SUBSTITUTIONS = {
    "^": "**",      # everyone writes powers this way
    "×": "*",  # ×
    "÷": "/",  # ÷
    "−": "-",  # the real minus sign, e.g. pasted from a document
    "π": "pi",
}

# 10²³ -> 10**23, so an answer from the report can be pasted straight back in
_SUPERSCRIPTS = str.maketrans("⁰¹²³⁴⁵⁶⁷⁸⁹", "0123456789")
_SUPERSCRIPT_RUN = re.compile("[⁰¹²³⁴⁵⁶⁷⁸⁹]+")

# "x = 5" — one equals sign, not two, and a name on the left.
_ASSIGNMENT = re.compile(r"^\s*([A-Za-z_]\w*)\s*=(?!=)\s*(\S.*)$", re.S)


def _expand_degrees(text: str, degrees: bool) -> str:
    """Handle a ° written after a number or a bracketed group.

    ° means "this number is in degrees", whichever way the Degrees switch
    is set. In degrees mode the trig functions already expect degrees, so
    the ° just comes off. In radians mode the value gets converted, so
    sin(30°) is 0.5 either way.
    """
    result = text
    while True:
        mark = result.find("\u00b0")
        if mark == -1:
            return result

        end = mark
        while end > 0 and result[end - 1] == " ":
            end -= 1

        if end > 0 and result[end - 1] == ")":
            # (30+15)° — walk back to the bracket that opened it
            depth = 0
            start = end - 1
            while start >= 0:
                if result[start] == ")":
                    depth += 1
                elif result[start] == "(":
                    depth -= 1
                    if depth == 0:
                        break
                start -= 1
            start = max(start, 0)
        else:
            start = end
            while start > 0 and (result[start - 1].isdigit() or result[start - 1] == "."):
                start -= 1

        term = result[start:end]
        if not term:
            # a ° with nothing in front of it; drop it and carry on
            result = result[:mark] + result[mark + 1 :]
            continue
        swap = term if degrees else f"radians({term})"
        result = result[:start] + swap + result[mark + 1 :]


# The thing a √ applies to, when there are no brackets: a number or a name.
_ROOT_TERM = re.compile(r"\d+\.?\d*|[A-Za-z_]\w*")


def _expand_roots(text: str) -> str:
    """Put the brackets into √ for you: √81 -> sqrt(81).

    A regex can't do this safely — it backtracks and chops √sin(30) into
    sqrt(si)n(30). So this walks the string and, when the √ is followed by
    a function call, takes that call's whole bracketed argument with it.
    """
    out = []
    i = 0
    while i < len(text):
        if text[i] != "√":
            out.append(text[i])
            i += 1
            continue

        j = i + 1
        while j < len(text) and text[j] == " ":
            j += 1

        # already bracketed, or nothing to take — just rename it
        if j >= len(text) or text[j] == "(":
            out.append("sqrt")
            i = j
            continue

        term = _ROOT_TERM.match(text, j)
        if not term:
            out.append("sqrt")
            i = j
            continue

        end = term.end()
        if end < len(text) and text[end] == "(":
            # a call like √sin(30): swallow the matching brackets too
            depth = 0
            while end < len(text):
                if text[end] == "(":
                    depth += 1
                elif text[end] == ")":
                    depth -= 1
                    if depth == 0:
                        end += 1
                        break
                end += 1
        out.append(f"sqrt({text[j:end]})")
        i = end
    return "".join(out)

CONSTANTS = {
    "pi": math.pi,
    "e": math.e,
    "tau": math.tau,
}

# Only these nodes are allowed anywhere in the tree.
_ALLOWED_OPERATORS = (
    ast.Add, ast.Sub, ast.Mult, ast.Div, ast.FloorDiv, ast.Mod, ast.Pow,
    ast.USub, ast.UAdd,
)


class CalcError(ValueError):
    """Something the person typed doesn't work. The message is for them."""


def _build_functions(degrees: bool) -> dict:
    """The function table. In degrees mode the trig functions convert on the
    way in, and the inverse ones convert on the way out."""

    def wrap_in(fn):
        return (lambda x: fn(math.radians(x))) if degrees else fn

    def wrap_out(fn):
        return (lambda *a: math.degrees(fn(*a))) if degrees else fn

    return {
        # trigonometry
        "sin": wrap_in(math.sin),
        "cos": wrap_in(math.cos),
        "tan": wrap_in(math.tan),
        "asin": wrap_out(math.asin),
        "acos": wrap_out(math.acos),
        "atan": wrap_out(math.atan),
        "atan2": wrap_out(math.atan2),
        "sinh": math.sinh,
        "cosh": math.cosh,
        "tanh": math.tanh,
        # logs and exponents
        "log": lambda x, base=10.0: math.log(x, base),
        "ln": math.log,
        "log2": math.log2,
        "exp": math.exp,
        # roots and powers
        "sqrt": math.sqrt,
        "cbrt": lambda x: math.copysign(abs(x) ** (1 / 3), x),
        "pow": math.pow,
        "hypot": math.hypot,
        # rounding and odds and ends
        "abs": abs,
        "round": round,
        "floor": math.floor,
        "ceil": math.ceil,
        "trunc": math.trunc,
        "fmod": math.fmod,
        "gcd": math.gcd,
        "factorial": _factorial,
        "degrees": math.degrees,
        "radians": math.radians,
    }


def _factorial(x):
    if x != int(x) or x < 0:
        raise CalcError("factorial needs a whole number that isn't negative.")
    if x > MAX_FACTORIAL:
        raise CalcError(f"factorial({int(x)}) is too big to hold in a number.")
    return math.factorial(int(x))


def function_names(degrees: bool = True) -> list[str]:
    """For the on-screen cheat sheet."""
    return sorted(_build_functions(degrees))


def normalise(expression: str, degrees: bool = True) -> str:
    """Turn what someone typed into something Python can parse."""
    text = expression.strip()
    for old, new in _SUBSTITUTIONS.items():
        text = text.replace(old, new)
    # a run of superscript digits becomes an explicit power
    text = _SUPERSCRIPT_RUN.sub(
        lambda m: "**" + m.group(0).translate(_SUPERSCRIPTS), text
    )
    # √81 -> sqrt(81), √sin(30) -> sqrt(sin(30))
    text = _expand_roots(text)
    # 30° -> 30 in degrees mode, radians(30) in radians mode
    text = _expand_degrees(text, degrees)
    return text


def close_brackets(text: str) -> str:
    """Add any closing brackets that were left off.

    Tapping a `sin` button gives you `sin(` and it's easy to never type the
    `)`. Closing them at the end can't change an answer — there's only one
    place a missing bracket can go — so it's safe to just do it.
    """
    missing = text.count("(") - text.count(")")
    return text + ")" * missing if missing > 0 else text


def evaluate(
    expression: str, degrees: bool = True, variables: dict | None = None
) -> float:
    """Work out a typed expression. Raises CalcError with a readable message.

    degrees=True means sin(30) is 0.5, which is what a chemistry class
    wants. Set it False for radians. `variables` is any names the caller
    has stored, including `ans`.
    """
    if not expression or not expression.strip():
        raise CalcError("Nothing to work out yet.")
    if len(expression) > MAX_LENGTH:
        raise CalcError("That expression is too long.")

    functions = _build_functions(degrees)
    names = dict(variables or {})
    text = close_brackets(normalise(expression, degrees))

    try:
        tree = ast.parse(text, mode="eval")
    except SyntaxError:
        raise CalcError(
            "That isn't a complete expression — check your brackets and symbols."
        ) from None

    try:
        result = _walk(tree.body, functions, names)
    except CalcError:
        raise
    except ZeroDivisionError:
        raise CalcError("Can't divide by zero.") from None
    except ValueError:
        raise CalcError(
            "That's outside what the function accepts — like the square root "
            "of a negative number."
        ) from None
    except OverflowError:
        raise CalcError("The answer is too big to hold in a number.") from None
    except TypeError:
        raise CalcError("Wrong number of values for one of those functions.") from None

    if isinstance(result, bool) or not isinstance(result, (int, float)):
        raise CalcError("That didn't come out as a number.")
    if isinstance(result, float) and math.isnan(result):
        raise CalcError("That doesn't have a numeric answer.")
    if isinstance(result, float) and math.isinf(result):
        raise CalcError("The answer is too big to hold in a number.")
    return float(result)


def _walk(node, functions, variables=None):
    """Evaluate one node, refusing anything that isn't plain arithmetic."""
    variables = variables or {}

    if isinstance(node, ast.Constant):
        if isinstance(node.value, bool) or not isinstance(node.value, (int, float)):
            raise CalcError("Only numbers can go in an expression.")
        return node.value

    if isinstance(node, ast.Name):
        # a name you stored wins over a built-in constant of the same name
        if node.id in variables:
            return variables[node.id]
        if node.id in CONSTANTS:
            return CONSTANTS[node.id]
        if node.id in functions:
            raise CalcError(f"'{node.id}' needs brackets, like {node.id}(30).")
        raise CalcError(f"I don't know what '{node.id}' means.")

    if isinstance(node, ast.UnaryOp):
        if not isinstance(node.op, _ALLOWED_OPERATORS):
            raise CalcError("That operator isn't allowed here.")
        value = _walk(node.operand, functions, variables)
        return -value if isinstance(node.op, ast.USub) else +value

    if isinstance(node, ast.BinOp):
        if not isinstance(node.op, _ALLOWED_OPERATORS):
            raise CalcError("That operator isn't allowed here.")
        left = _walk(node.left, functions, variables)
        right = _walk(node.right, functions, variables)
        if isinstance(node.op, ast.Pow):
            if abs(right) > MAX_EXPONENT and abs(left) > 1:
                raise CalcError(f"That power is too big (over {MAX_EXPONENT}).")
            return left**right
        if isinstance(node.op, ast.Add):
            return left + right
        if isinstance(node.op, ast.Sub):
            return left - right
        if isinstance(node.op, ast.Mult):
            return left * right
        if isinstance(node.op, ast.Div):
            return left / right
        if isinstance(node.op, ast.FloorDiv):
            return left // right
        return left % right

    if isinstance(node, ast.Call):
        if not isinstance(node.func, ast.Name):
            raise CalcError("Only the built-in functions can be called.")
        name = node.func.id
        if name not in functions:
            raise CalcError(f"There's no function called '{name}'.")
        if node.keywords:
            raise CalcError("Functions here take plain numbers, not name=value.")
        args = [_walk(a, functions, variables) for a in node.args]
        return functions[name](*args)

    raise CalcError("That isn't something this calculator can work out.")


def reserved_names(degrees: bool = True) -> set[str]:
    """Names you can't use for a variable, because they already mean something."""
    return set(CONSTANTS) | set(_build_functions(degrees)) | {"ans"}


def evaluate_line(
    text: str, degrees: bool = True, variables: dict | None = None
) -> tuple[float, str | None]:
    """Work out one line, which may be an assignment.

    Returns (value, name) — name is the variable that was set, or None for
    a plain expression. The caller owns the variables dict; this only reads
    it and reports what should go in.
    """
    assignment = _ASSIGNMENT.match(text or "")
    if not assignment:
        return evaluate(text, degrees, variables), None

    name, expression = assignment.group(1), assignment.group(2)
    if name in reserved_names(degrees):
        raise CalcError(f"'{name}' already means something — pick another name.")
    return evaluate(expression, degrees, variables), name


def format_answer(value: float, digits: int = 10) -> str:
    """A readable answer: no float noise, no needless trailing zeros."""
    if value == int(value) and abs(value) < 1e15:
        return str(int(value))
    text = f"{value:.{digits}g}"
    return text

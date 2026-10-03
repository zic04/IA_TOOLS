# Fixture: evaluates a caller-provided expression directly — a code-injection risk.
def compute(expr):
    return eval(expr)

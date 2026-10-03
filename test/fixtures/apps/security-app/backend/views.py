# Fixture: an open redirect to a request parameter (security rule redirect.open).
from fastapi.responses import RedirectResponse


def go(request):
    return RedirectResponse(url=request.query_params.get("next"))

from django.core.paginator import Paginator
from django.core.mail import send_mail
from rest_framework import viewsets


def orders(request):
    q = request.GET.get("q", "")
    page = request.GET.get("page", 1)
    # Order.objects.filter(secret__icontains=q) is only a comment
    qs = Order.objects.filter(customer__name__icontains=q, owner=request.user).order_by("-created")
    return Paginator(qs, 25).get_page(page)


class OrderViewSet(viewsets.ModelViewSet):
    search_fields = ["customer__name", "reference"]
    ordering_fields = ("created", "total")
    page_size = 50


def notify(order):
    send_mail("Order shipped", "…", None, [order.email])

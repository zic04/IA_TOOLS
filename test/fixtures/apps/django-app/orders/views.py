from django.contrib.admin.views.decorators import staff_member_required
from django.contrib.auth.decorators import login_required, permission_required
from django.contrib.auth.mixins import LoginRequiredMixin, PermissionRequiredMixin
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.views.generic import DetailView, TemplateView
from rest_framework.decorators import api_view

from .models import Order


def home(request):
    return JsonResponse({"ok": True})


@login_required
def order_list(request):
    q = request.GET.get("q", "")
    orders = Order.objects.filter(customer__name__icontains=q).order_by("-created")
    return JsonResponse({"orders": list(orders.values("id"))})


class OrderDetail(LoginRequiredMixin, PermissionRequiredMixin, DetailView):
    model = Order
    permission_required = "orders.view_order"


@require_POST
@permission_required("orders.change_order")
def cancel_order(request, pk):
    return JsonResponse({"cancelled": pk})


@api_view(["GET"])
@staff_member_required
def export_orders(request):
    return JsonResponse({})


def yearly_report(request, year):
    return JsonResponse({"year": year})


class ProfileView(LoginRequiredMixin, TemplateView):
    template_name = "profile.html"

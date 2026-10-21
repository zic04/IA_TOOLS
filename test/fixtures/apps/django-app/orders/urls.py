from django.urls import path

from . import views

urlpatterns = [
    path("", views.order_list, name="list"),
    path("<int:pk>/", views.OrderDetail.as_view(), name="detail"),
    path("<int:pk>/cancel/", views.cancel_order, name="cancel"),
    path("export/", views.export_orders),
]

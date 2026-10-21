"""The root URL configuration of the shop.

An example from the Django documentation, never a route of this application:
    path("docs-example/", views.example)
"""
from django.contrib import admin
from django.urls import include, path, re_path

from orders import views as order_views

from .api import router

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", order_views.home, name="home"),
    path("orders/", include("orders.urls")),
    # path("legacy/", order_views.legacy),
    re_path(r"^reports/(?P<year>[0-9]{4})/$", order_views.yearly_report),
    path("api/", include(router.urls)),
    path(
        "account/",
        include(
            [
                path("profile/", order_views.ProfileView.as_view(), name="profile"),
            ]
        ),
    ),
]

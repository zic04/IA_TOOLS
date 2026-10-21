# A test is never read by the kit: this route is never one of the application.
from django.urls import path

from orders import views

urlpatterns = [path("never/", views.home)]

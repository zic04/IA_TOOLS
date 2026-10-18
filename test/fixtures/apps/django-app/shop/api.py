from rest_framework.routers import DefaultRouter

from orders.viewsets import CustomerViewSet, OrderViewSet

router = DefaultRouter()
router.register(r"orders", OrderViewSet)
router.register(r"customers", CustomerViewSet, basename="customer")

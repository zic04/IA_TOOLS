from django.db import models


class Customer(models.Model):
    name = models.CharField(max_length=80)
    slug = models.SlugField(unique=True)


class Order(models.Model):
    customer = models.ForeignKey(Customer, on_delete=models.CASCADE)
    created = models.DateTimeField(auto_now_add=True)

#!/usr/bin/env python
# Fixture: the Django project of the `django` stack adapter (test/unit/stack-other.test.mjs).
import os
import sys

if __name__ == "__main__":
    os.environ.setdefault("DJANGO_SETTINGS_MODULE", "shop.settings")
    from django.core.management import execute_from_command_line

    execute_from_command_line(sys.argv)

# Fixture: certificate verification disabled (security rule tls.disabled).
import requests


def fetch(url):
    return requests.get(url, verify=False)

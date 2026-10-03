# Fixture: a wildcard CORS origin together with credentials (security rule cors.wildcardCredentials), and debug
# mode left on (security rule debug.enabled).
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

DEBUG = True

app = FastAPI(debug=DEBUG)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True)

# Fixture: a JWT decoded without signature verification (security rule jwt.noVerify).
import jwt


def decode_token(token):
    return jwt.decode(token, options={"verify_signature": False}, algorithms=["none"])

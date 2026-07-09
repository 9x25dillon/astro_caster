"""
gen_ed25519_key.py — mint an Ed25519 keypair for token signing (roadmap §4.2).

Prints the private seed (server-side env) and the public key (safe to embed
in clients for offline verification). Run once, store the seed like AAE_SECRET.

    .venv/bin/python tools/gen_ed25519_key.py
"""
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey


def main() -> None:
    key = Ed25519PrivateKey.generate()
    seed = key.private_bytes(
        serialization.Encoding.Raw,
        serialization.PrivateFormat.Raw,
        serialization.NoEncryption(),
    ).hex()
    pub = key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw
    ).hex()
    print("── server .env (SECRET — treat like AAE_SECRET) ─────────────────")
    print("AAE_SIGN_ALGO=ed25519")
    print(f"AAE_ED25519_SEED={seed}")
    print()
    print("── public key (embeddable in clients, NOT secret) ──────────────")
    print(pub)
    print()
    print("Rotation note: rotating the seed invalidates ed25519-signed tokens")
    print("only; HMAC tokens keep verifying (dual-accept). Outstanding ed25519")
    print("tokens can be honored through a rotation only if you keep verifying")
    print("with the old public key — this spike keeps ONE active keypair.")


if __name__ == "__main__":
    main()

#!/bin/sh
# Guarantee /etc/nginx/certs contains SOMETHING nginx can start with.
#
# nginx refuses to start when ssl_certificate points at a missing file, so
# without this a developer running `docker compose up` with no certificates
# mounted gets a container that dies at boot — a confusing failure for a
# change they did not make.
#
# In production the real Cloudflare Origin CA certificate is mounted over this
# directory and the block below is skipped. The self-signed fallback is
# deliberately useless to Cloudflare: with SSL mode `strict` it is REJECTED, so
# a deploy that forgot to mount the real cert fails visibly at the edge rather
# than quietly serving traffic under a certificate nobody vetted.
#
# nginx's entrypoint runs everything in /docker-entrypoint.d/ in name order
# before starting the server, which is why this is a numbered script rather
# than a custom ENTRYPOINT.
set -e

CERT_DIR=/etc/nginx/certs
CERT="$CERT_DIR/origin.pem"
KEY="$CERT_DIR/origin.key"

if [ -s "$CERT" ] && [ -s "$KEY" ]; then
    echo "40-ensure-cert: using the mounted certificate"
    exit 0
fi

echo "40-ensure-cert: no certificate mounted — generating a SELF-SIGNED throwaway."
echo "40-ensure-cert: this is for local development only; Cloudflare 'strict' will reject it."
mkdir -p "$CERT_DIR"
openssl req -x509 -newkey rsa:2048 -nodes -days 365 \
    -keyout "$KEY" -out "$CERT" \
    -subj "/CN=astra.local" \
    -addext "subjectAltName=DNS:astra.local,DNS:localhost" >/dev/null 2>&1
chmod 600 "$KEY"

# Traefik in front of Anchor (HTTPS on your LAN)

Browsers only enable **Web Crypto** on a **secure context**. Plain `http://192.168.x.x` is not secure. Putting **Traefik** on ports **80/443** with **TLS** fixes registration and encrypted notes while keeping the app private on your network.

## 1. Create TLS certificates (mkcert)

On a machine that has Docker access to the cert paths:

```bash
# Install mkcert (see https://github.com/FiloSottile/mkcert)
mkcert -install
mkcert anchor.local 192.168.1.50 localhost 127.0.0.1
```

This produces something like `anchor.local+3.pem` and `anchor.local+3-key.pem`. Rename or copy them to this folder as:

- `certs/cert.pem`
- `certs/key.pem`

Every device that opens Anchor in the browser must **trust your mkcert CA** (run `mkcert -install` on that device, or install the generated root CA manually).

## 2. DNS / hosts

Point clients at the server:

- Add a line to each PC’s hosts file, e.g. `192.168.1.50 anchor.local`, **or**
- Use your router’s DNS / Pi-hole to resolve `anchor.local` → server IP.

Use **`https://anchor.local`** (or whatever names you put in the certificate).

## 3. Environment for Anchor

Set your real public-ish URL so redirects and OIDC match:

```env
APP_URL=https://anchor.local
```

Rebuild/restart Anchor after changing `.env`.

## 4. Run Traefik + Anchor

From the repo root:

```bash
docker compose -f docker-compose.yml -f examples/traefik/docker-compose.override.yml up -d
```

Compose resolves `./dynamic` and `./certs` relative to `examples/traefik/` (the override file’s directory).

Or merge the override file into your main `docker-compose.yml` once you are happy.

- Traefik listens on **80** and **443** on the host.
- Anchor is **not** published on 3000 to the host anymore in this example; only Traefik exposes **443**.
- Internal traffic: Traefik → `anchor:3000` on the Docker network.

## 5. Optional: HTTP → HTTPS

The example redirects port **80** to **443**.

## Troubleshooting

- **Certificate warnings**: Client does not trust mkcert CA — install CA on that device.
- **Still no crypto.subtle**: Open DevTools → Application → ensure the page URL starts with **`https://`** and matches a name on the certificate.

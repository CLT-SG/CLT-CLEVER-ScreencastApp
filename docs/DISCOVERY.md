# LAN discovery

ScreencastApp finds CLEVER-Service with the existing UDP protocol (`clever-service-discover` probes and `clever-service` announcements on UDP **8842**). It does not use mDNS as the primary mechanism.

## Why localhost worked and `192.168.1.x` did not

Discovery was never limited to `127.0.0.1` as a probe target. Two defects made remote LAN servers look unreachable:

1. **CLEVER-Service advertised a loopback IP.** `gethostbyname(hostname)` often returns `127.0.0.1` / `127.0.1.1` because of `/etc/hosts`. That value was placed in the announcement `ip` field.
2. **ScreencastApp trusted the advertised IP** over the UDP sender address. A reply from `192.168.1.44` with `"ip":"127.0.0.1"` caused the HTTP probe to go to `http://127.0.0.1:8000` instead of the machine that answered.

Additional issues that made remote discovery unreliable:

- Probes were sent from a single unbound socket. On Windows, `255.255.255.255` often does not leave every LAN interface.
- Directed broadcasts were computed only for `/8`, `/16`, and `/24`.
- The client listened on an ephemeral port, so unsolicited announcements to UDP 8842 were missed.
- Virtual adapters (Docker, Hyper-V default switch, VPN `tun`/`utun`) could be selected instead of Ethernet/Wi-Fi.

The client now prefers the UDP source IPv4 when it is a real LAN address, sends probes from each selected LAN interface, listens on UDP 8842 when possible, and keeps collecting servers for the whole discovery window instead of stopping at the first reply.

## Lifecycle

```
Starting discovery
      ↓
Search active LAN interfaces (Ethernet / Wi-Fi; skip loopback and virtual NICs)
      ↓
Send UDP probes (255.255.255.255, subnet broadcast, optional 127.0.0.1 fallback)
      ↓
Wait for server responses (configurable timeout, default 4s)
      ↓
Collect discovered servers (dedupe by hostname/port or server id)
      ↓
Show results — or “No CLEVER-Service servers discovered”
      ↓
Retry after configured interval (default 8s, backoff to 30s)
```

Network interface changes trigger an immediate rediscovery round.

## Configuration

[`config.js`](../config.js) `cleverService`:

| Key | Default | Purpose |
| --- | --- | --- |
| `discoveryPort` | `8842` | UDP probe / announce port |
| `defaultPort` | `8000` | HTTP port when an announcement omits it |
| `discoveryTimeoutMs` | `4000` | How long a round waits for replies |
| `retryIntervalMs` | `8000` | Delay before the next round |
| `maxRetryIntervalMs` | `30000` | Backoff ceiling |
| `fallbackAddresses` | `['127.0.0.1']` | Extra unicast probe targets (local service only) |

Host/IP of CLEVER-Service is never hardcoded. Manual host/port still uses the dashboard **Manual configuration** fields.

## Multi-server behaviour

Each discovered CLEVER-Service is tracked independently (Discovered → Connecting → Connected / Registered, or Unavailable / Error / Rejected). Failure of one server does not stop discovery or heartbeats to the others.

Registration still uses `POST /api/screencast-app/register` and heartbeat still uses `POST /api/screencast-app/heartbeat`. There is no second protocol. Each CLEVER-Service instance has its own registration store, so the same device can register with more than one server.

## Firewall

Allow **UDP 8842** (inbound and outbound) on both the ScreencastApp PC and the CLEVER-Service host, plus **TCP 8000** (or the configured HTTP port) from the ScreencastApp PC to CLEVER-Service.

### Windows

1. When Windows Firewall prompts for CLEVER Screencast, allow **Private** networks.
2. Or add an inbound rule: UDP 8842 for `CLEVER_Screencast.exe`.
3. On the CLEVER-Service host, allow UDP 8842 and TCP 8000.

### Linux

```bash
sudo ufw allow 8842/udp
sudo ufw allow 8000/tcp
```

If CLEVER-Service runs as `php artisan screencast:discover`, that process must be able to bind UDP 8842 (`ext-sockets` required).

### macOS

Grant the app incoming network permission if prompted. UDP 8842 and TCP 8000 must not be blocked by a third-party firewall.

IPv4 LAN discovery is used to match the existing CLEVER-Service protocol. IPv6 announcements are ignored.

## Logs

`~/clevervnc-log/YYYY-MM-DD.log` includes:

`Discovery started`, `Interface selected`, `Discovery request sent`, `Server response received`, `Server accepted`, `Server rejected`, `Duplicate server ignored`, `Connection established`, `Registration successful`, `Connection lost`, `Reconnect scheduled`, `Discovery retry`, `Discovery stopped`.

Credentials, tokens, and passwords are not logged.

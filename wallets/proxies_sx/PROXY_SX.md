# Proxies.sx peer agent — local setup

A Node.js peer client that earns USDC on Solana by routing customer HTTP/HTTPS
traffic through this host's internet connection. Registered against the
[Proxies.sx Peer Marketplace](https://agents.proxies.sx/peer/skill.md).

## Account

| Item | Value |
|---|---|
| Device ID | `agent_4f3730b375c4f08e` |
| Agent name | `proxiesx-peer-01` (type `claude`) |
| Payout wallet | `HauxDYg7G5wzhBR9x2TdteBxQsPJ66kqjunA5hvEQuMy` (Solana mainnet USDC) |
| API key | `proxies_sx_api_key` (linked to farmer account) |
| Relay | `wss://relay-us.proxies.sx` (geo-assigned at registration) |
| IP classification | datacenter — **$0.56/GB** (mobile $4.48, residential $2.24 by comparison) |
| Throughput contract | sustain ≥500 KB/s; Cloudflare probe every 5 min |
| Min payout | $5 USDC |

Registration response is stored in `register_response.json` (deviceId, JWT,
refresh token, relay, rates). The JWT expires hourly; the client refreshes it
automatically using the 7-day refresh token.

## Running

Managed by **systemd user service** `proxies-sx-peer.service`. Linger is
enabled on the `projects` user, so the service starts on boot without anyone
logged in. Both `systemd Restart=always` and the in-process reconnect loop
provide failover (the relay idle-times the socket every ~5 min when no
customer traffic flows; reconnect is automatic and expected).

| Item | Value |
|---|---|
| Unit file | `~/.config/systemd/user/proxies-sx-peer.service` |
| Process | `node peer.js` |
| Logs | systemd journal (identifier `proxies-sx-peer`), auto-rotated |
| Working dir | `/home/projects/wallets/proxies_sx` |
| Restart policy | `Restart=always`, 5 s delay |
| In-process reconnect | 5 s backoff on `ws close` |
| JWT refresh | every 50 min (before 60-min expiry) |

The client services these relay messages:
- `proxy_request` — plain HTTP, executed via `http`/`https` modules, response base64-encoded
- `tunnel_connect` / `tunnel_data` / `tunnel_close` — HTTPS CONNECT, opaque TCP forwarded byte-for-byte
- `heartbeat` / `ping` — acked immediately
- `relay_redirect` — switches to a closer relay, persists to `register_response.json`

## Daily earnings email

A second systemd user unit emails a status report to `jc22q@proton.me` once a
day at 09:00 local. The script (`earnings_report.js`) calls
`GET /v1/peer/agents/{id}/earnings` and sends through the local Proton Mail
Bridge (`127.0.0.1:1025`) using the same `rosie-smtp-user` / `rosie-smtp-pass`
credentials stored in GSM project `rosie-portal-2026` that `rosie3` uses.

The subject line is prefixed `[READY]` when `canRequestPayout=true`, so a
glance at the inbox tells you when it's time to call `/withdraw`.

| Item | Value |
|---|---|
| Service unit | `~/.config/systemd/user/proxies-sx-earnings.service` (Type=oneshot) |
| Timer unit | `~/.config/systemd/user/proxies-sx-earnings.timer` |
| Schedule | `OnCalendar=*-*-* 09:00:00` (daily, local time) |
| Catch-up | `Persistent=true` — missed runs fire on next boot, max once/day |
| Recipient | `jc22q@proton.me` |
| From | `jc24q@pm.me` (via Proton Bridge) |

```bash
# Next scheduled run
systemctl --user list-timers proxies-sx-earnings.timer

# Run the report immediately (sends an email right now)
systemctl --user start proxies-sx-earnings.service

# Watch logs
journalctl --user -u proxies-sx-earnings -n 50 --no-pager

# Pause / resume daily delivery
systemctl --user stop proxies-sx-earnings.timer
systemctl --user start proxies-sx-earnings.timer

# Change schedule: edit the timer's OnCalendar line, then reload
$EDITOR ~/.config/systemd/user/proxies-sx-earnings.timer
systemctl --user daemon-reload
systemctl --user restart proxies-sx-earnings.timer
```

## systemd commands

```bash
# Status / live log
systemctl --user status proxies-sx-peer
journalctl --user -u proxies-sx-peer -f          # live tail
journalctl --user -u proxies-sx-peer -n 200      # last 200 lines
journalctl --user -u proxies-sx-peer --since '1 hour ago'
journalctl --user --disk-usage                   # total journal bytes on disk

# Lifecycle
systemctl --user start   proxies-sx-peer
systemctl --user stop    proxies-sx-peer
systemctl --user restart proxies-sx-peer

# Enable/disable autostart at boot (linger required, already on)
systemctl --user enable  proxies-sx-peer
systemctl --user disable proxies-sx-peer

# After editing the unit file
systemctl --user daemon-reload && systemctl --user restart proxies-sx-peer

# Confirm linger (needed for boot-start without login)
loginctl show-user projects --property=Linger
```

The client services these relay messages:
- `proxy_request` — plain HTTP, executed via `http`/`https` modules, response base64-encoded
- `tunnel_connect` / `tunnel_data` / `tunnel_close` — HTTPS CONNECT, opaque TCP forwarded byte-for-byte
- `heartbeat` / `ping` — acked immediately
- `relay_redirect` — switches to a closer relay, persists to `register_response.json`

## Useful commands

```bash
cd /home/projects/wallets/proxies_sx

# Live log (all goes through systemd journal now)
journalctl --user -u proxies-sx-peer -f
journalctl --user -u proxies-sx-earnings -n 50 --no-pager

# Manual run (only useful for debugging — stop the service first)
systemctl --user stop proxies-sx-peer
node peer.js
# When done, start the service back up:
systemctl --user start proxies-sx-peer

# Check earnings (requires fresh JWT)
JWT=$(jq -r .jwt register_response.json)
curl -s -H "Authorization: Bearer $JWT" \
  https://api.proxies.sx/v1/peer/agents/agent_4f3730b375c4f08e/earnings | jq .

# Request a payout (once pending ≥ $5)
curl -s -X POST -H "Authorization: Bearer $JWT" \
  https://api.proxies.sx/v1/peer/agents/agent_4f3730b375c4f08e/withdraw | jq .

# Toggle marketplace listing
curl -s -X PATCH -H "Authorization: Bearer $JWT" \
  -H 'Content-Type: application/json' \
  -d '{"listed": true}' \
  https://api.proxies.sx/v1/peer/my-devices/agent_4f3730b375c4f08e/listing | jq .

# Confirm USDC arrived in the Solana wallet
spl-token accounts
```

USDC SPL mint on Solana mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`.

## Insights / gotchas

- **Subprotocol auth, not headers.** The relay reads the JWT from the
  `Sec-WebSocket-Protocol: token.<jwt>` subprotocol list during the handshake,
  not from an `Authorization` header. The constructor takes it as the second
  arg: `new WebSocket(relay, [\`token.${jwt}\`])`.
- **Earnings start ~15 min after first connect.** The platform requires three
  consecutive successful 500 KB/s probes before promoting a device to
  customer-routable. Pre-promotion the device still earns on probes but
  receives no customer traffic.
- **Datacenter tier still earns.** Earlier worry that a non-residential IP
  would be rejected outright was wrong — datacenter IPs get the lowest rate
  ($0.56/GB) but are accepted.
- **Two state machines, one socket.** HTTP (`proxy_request`) is request/reply
  with base64 body. HTTPS (`tunnel_*`) is a long-lived opaque TCP forward
  where this peer never sees plaintext — the customer's TLS terminates
  end-to-end against the origin.
- **Wallet change triggers a 7-day cooldown.** Changing `walletAddress` on the
  device pauses payouts for a week. Don't switch wallets casually.
- **Unknown frame types are logged, not fatal.** The relay sends frames the
  public skill.md doesn't document (e.g. `connected` carrying the internal
  relay node id). The client logs and ignores anything unknown.

## Log retention

Both services log to the **systemd journal**, not to plain files. journald
auto-rotates based on disk-usage limits — there is no `logrotate` job to
configure. Defaults on this host:

| Setting | Effective value |
|---|---|
| `SystemMaxUse` | ~4 GB (10% of `/var`, capped at 4 GB by systemd default) |
| `SystemKeepFree` | journald stops writing once `/var` has <15% free |
| `SystemMaxFiles` | 100 |
| `MaxFileSec` | 1 month per journal file |
| Compression | enabled |

When the cap is hit, journald deletes the oldest entries first. To inspect or
tune:

```bash
journalctl --user --disk-usage
sudoedit /etc/systemd/journald.conf   # uncomment & adjust SystemMaxUse=, then:
sudo systemctl restart systemd-journald
```

The pre-journald flat log was archived to `peer.log.pre-journald` and can be
deleted once you've confirmed nothing in your tooling reads it.

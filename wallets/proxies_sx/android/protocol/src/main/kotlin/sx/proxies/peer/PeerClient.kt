package sx.proxies.peer

// Kotlin port of the production wallets/proxies_sx/peer.js. Wire format
// mirrors peer.js (flat fields, no `payload` wrapper) because that is what
// the live relay accepts, even though the public skill.md documents a
// wrapped shape. If the relay ever stops accepting flat frames, swap to
// the wrapped shape — the message types themselves are unchanged.

import okhttp3.*
import okhttp3.RequestBody.Companion.toRequestBody
import okio.ByteString
import org.json.JSONObject
import java.io.File
import java.net.Socket
import java.net.URI
import java.util.Base64
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

class PeerClient(
    private val stateFile: File,
    private var state: PeerState,
    private val registration: Registration = Registration(),
    private val http: OkHttpClient = OkHttpClient.Builder()
        .pingInterval(30, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.MILLISECONDS)
        .build(),
    private val log: (String) -> Unit = { println("${java.time.Instant.now()} $it") },
) {
    private val tunnels = ConcurrentHashMap<String, Socket>()
    private val ioExec = Executors.newCachedThreadPool()
    private val sched = Executors.newSingleThreadScheduledExecutor()
    private val b64Enc: Base64.Encoder = Base64.getEncoder()
    private val b64Dec: Base64.Decoder = Base64.getDecoder()

    @Volatile private var ws: WebSocket? = null
    @Volatile private var stopped = false

    fun start() {
        // Refresh-on-need: poll every 5 min and only refresh when the JWT
        // has <5 min of life left. proxies.sx throttles /refresh per-token
        // (a refresh of a still-valid token returns 429), so refreshing on
        // a fixed 50-min cadence collides with their policy. The 4002
        // recovery path forces a refresh when the server actually rejects
        // the token, so this lazy approach stays safe even on flaky links.
        sched.scheduleAtFixedRate({
            try {
                val left = jwtSecondsLeft()
                if (left <= 300) {
                    registration.refresh(state); persist()
                    log("jwt refreshed (was ${left}s from expiry)")
                }
            } catch (e: Exception) { log("refresh error: ${e.message}") }
        }, 1, 5, TimeUnit.MINUTES)
        connect()
    }

    // proxies.sx tokens carry iat/exp in the standard JWT middle segment
    // (base64url JSON). Returns Long.MIN_VALUE on any parse failure so
    // the caller treats it as "definitely refresh now."
    private fun jwtSecondsLeft(): Long {
        return try {
            val parts = state.jwt.split('.')
            if (parts.size < 2) return Long.MIN_VALUE
            val pad = parts[1] + "=".repeat((4 - parts[1].length % 4) % 4)
            val payload = JSONObject(String(Base64.getUrlDecoder().decode(pad)))
            payload.optLong("exp") - (System.currentTimeMillis() / 1000)
        } catch (_: Exception) { Long.MIN_VALUE }
    }

    // Tear everything down so stopService() actually stops the work, not
    // just the Service object. Without this, the executors below are
    // non-daemon threads that keep the process alive AND keep re-posting
    // the notification via the log callback, making it look like the
    // service is still running. Idempotent — safe to call multiple times.
    fun shutdown() {
        if (stopped) return
        stopped = true
        runCatching { ws?.close(1000, "shutdown") }
        ws = null
        tunnels.values.forEach { runCatching { it.close() } }
        tunnels.clear()
        sched.shutdownNow()
        ioExec.shutdownNow()
    }

    private fun persist() = stateFile.writeText(state.toJson())

    private fun send(obj: JSONObject) {
        ws?.send(obj.toString())
    }

    private fun connect() {
        if (stopped) return
        // No refresh here — the standalone 50-min interval in start() keeps
        // the JWT fresh independent of WS reconnects, avoiding both the
        // stale-JWT loop AND the rate-limit storm a per-connect refresh
        // would cause on flaky networks.
        log("connecting to ${state.relay}")
        val req = Request.Builder()
            .url(state.relay.replaceFirst("wss://", "https://").replaceFirst("ws://", "http://"))
            .addHeader("Sec-WebSocket-Protocol", "token.${state.jwt}")
            .build()
        ws = http.newWebSocket(req, listener)
    }

    private val listener = object : WebSocketListener() {

        override fun onOpen(webSocket: WebSocket, response: Response) {
            log("ws open (subprotocol=${response.header("Sec-WebSocket-Protocol")})")
            send(JSONObject().apply {
                put("type", "device_info")
                put("country", System.getenv("PEER_COUNTRY") ?: "US")
                put("carrier", System.getenv("PEER_CARRIER") ?: "unknown")
                put("protocol", "json-v1")
                put("version", "1.0.0-kt")
            })
        }

        override fun onMessage(webSocket: WebSocket, text: String) = handle(text)
        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            log("non-text frame, len=${bytes.size}")
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) = onDown(code, reason)
        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) { webSocket.close(code, reason) }
        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            log("ws error: ${t.message}")
            onDown(-1, t.message ?: "")
        }

        private fun onDown(code: Int, reason: String) {
            log("ws closed $code $reason")
            tunnels.values.forEach { runCatching { it.close() } }
            tunnels.clear()
            if (stopped) return
            try {
                // 4002 = server says the token is invalid. Force a refresh
                // before reconnecting, otherwise we'd retry every 5 s with
                // the same dead token until the next 5-min poll.
                if (code == 4002) {
                    sched.schedule({
                        runCatching { registration.refresh(state); persist(); log("forced refresh after 4002") }
                            .onFailure { log("forced refresh failed: ${it.message}") }
                        sched.schedule({ connect() }, 5, TimeUnit.SECONDS)
                    }, 0, TimeUnit.SECONDS)
                } else {
                    sched.schedule({ connect() }, 5, TimeUnit.SECONDS)
                }
            } catch (_: java.util.concurrent.RejectedExecutionException) {
                // sched was shut down between the stopped check and now.
            }
        }
    }

    private fun handle(raw: String) {
        val msg = try { JSONObject(raw) } catch (_: Exception) { return log("non-json frame") }
        when (msg.optString("type")) {
            "heartbeat", "ping" -> send(JSONObject().put("type", "heartbeat_ack").put("ts", msg.opt("ts")))
            "proxy_request" -> handleProxyRequest(msg)
            "tunnel_connect" -> handleTunnelConnect(msg)
            "tunnel_data" -> handleTunnelData(msg)
            "tunnel_close" -> handleTunnelClose(msg)
            "relay_redirect" -> {
                val r = msg.optString("relay")
                log("relay_redirect -> $r")
                state.relay = r; persist()
                ws?.close(1000, "redirect")
            }
            "connected", "welcome", "verified", "status", "probe_result" -> log("${msg.optString("type")} $msg")
            else -> log("unhandled msg type: ${msg.optString("type")}")
        }
    }

    private fun handleProxyRequest(msg: JSONObject) {
        ioExec.submit {
            val id = msg.optString("id")
            try {
                val url = msg.getString("url")
                val method = msg.optString("method", "GET")
                val reqBuilder = Request.Builder().url(url)
                val headersJson = msg.optJSONObject("headers")
                headersJson?.keys()?.forEach { k ->
                    if (!k.equals("host", true) && !k.equals("proxy-connection", true))
                        reqBuilder.addHeader(k, headersJson.getString(k))
                }
                val body = msg.optString("body").takeIf { it.isNotEmpty() }
                    ?.let { b64Dec.decode(it).toRequestBody(null) }
                reqBuilder.method(method, body)
                http.newCall(reqBuilder.build()).execute().use { res ->
                    val bytes = res.body?.bytes() ?: ByteArray(0)
                    val outHeaders = JSONObject().apply {
                        res.headers.forEach { (k, v) -> put(k, v) }
                    }
                    send(JSONObject().apply {
                        put("type", "proxy_response")
                        put("id", id)
                        put("status", res.code)
                        put("headers", outHeaders)
                        put("body", b64Enc.encodeToString(bytes))
                    })
                }
            } catch (e: Exception) {
                send(JSONObject().apply {
                    put("type", "proxy_response"); put("id", id)
                    put("status", 502); put("error", e.message ?: "error")
                })
            }
        }
    }

    private fun handleTunnelConnect(msg: JSONObject) {
        val tid = msg.getString("tunnelId")
        val host = msg.getString("host")
        val port = msg.optInt("port", 443)
        ioExec.submit {
            try {
                val sock = Socket(host, port)
                tunnels[tid] = sock
                send(JSONObject().put("type", "tunnel_open").put("tunnelId", tid))
                val input = sock.getInputStream()
                val buf = ByteArray(16 * 1024)
                while (!sock.isClosed) {
                    val n = input.read(buf)
                    if (n <= 0) break
                    val chunk = buf.copyOf(n)
                    send(JSONObject().apply {
                        put("type", "tunnel_data"); put("tunnelId", tid)
                        put("data", b64Enc.encodeToString(chunk))
                    })
                }
            } catch (e: Exception) {
                send(JSONObject().apply {
                    put("type", "tunnel_error"); put("tunnelId", tid)
                    put("error", e.message ?: "error")
                })
            } finally {
                tunnels.remove(tid)?.runCatching { close() }
                send(JSONObject().put("type", "tunnel_close").put("tunnelId", tid))
            }
        }
    }

    private fun handleTunnelData(msg: JSONObject) {
        val tid = msg.getString("tunnelId")
        val sock = tunnels[tid] ?: return
        if (sock.isClosed) return
        runCatching { sock.getOutputStream().write(b64Dec.decode(msg.getString("data"))) }
    }

    private fun handleTunnelClose(msg: JSONObject) {
        tunnels.remove(msg.getString("tunnelId"))?.runCatching { close() }
    }
}

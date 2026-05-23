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

    fun start() = connect()

    private fun persist() = stateFile.writeText(state.toJson())

    private fun send(obj: JSONObject) {
        ws?.send(obj.toString())
    }

    private fun connect() {
        // Refresh JWT before every connect. The in-loop 50-min refresh timer
        // only runs while the WS is open; on flaky networks (cellular) the
        // socket churns fast enough that the timer never fires, the cached
        // JWT ages past its 1-hour lifetime, and the relay rejects every
        // reconnect with close code 4002 "Invalid token" — forever. Doing
        // a fresh refresh here costs one cheap HTTP call per reconnect and
        // makes the loop self-healing even after long offline periods.
        try {
            registration.refresh(state); persist()
            log("jwt refreshed pre-connect")
        } catch (e: Exception) {
            log("pre-connect refresh failed: ${e.message} — trying cached jwt")
        }
        log("connecting to ${state.relay}")
        val req = Request.Builder()
            .url(state.relay.replaceFirst("wss://", "https://").replaceFirst("ws://", "http://"))
            .addHeader("Sec-WebSocket-Protocol", "token.${state.jwt}")
            .build()
        ws = http.newWebSocket(req, listener)
    }

    private val listener = object : WebSocketListener() {
        private var refreshFuture: java.util.concurrent.ScheduledFuture<*>? = null

        override fun onOpen(webSocket: WebSocket, response: Response) {
            log("ws open (subprotocol=${response.header("Sec-WebSocket-Protocol")})")
            send(JSONObject().apply {
                put("type", "device_info")
                put("country", System.getenv("PEER_COUNTRY") ?: "US")
                put("carrier", System.getenv("PEER_CARRIER") ?: "unknown")
                put("protocol", "json-v1")
                put("version", "1.0.0-kt")
            })
            refreshFuture = sched.scheduleAtFixedRate({
                try { registration.refresh(state); persist(); log("jwt refreshed") }
                catch (e: Exception) { log("refresh error: ${e.message}") }
            }, 50, 50, TimeUnit.MINUTES)
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
            refreshFuture?.cancel(false)
            tunnels.values.forEach { runCatching { it.close() } }
            tunnels.clear()
            sched.schedule({ connect() }, 5, TimeUnit.SECONDS)
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

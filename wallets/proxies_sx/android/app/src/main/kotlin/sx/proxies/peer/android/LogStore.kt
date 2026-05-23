package sx.proxies.peer.android

import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Executors

// Rolling on-disk log so we have something to ship when the on-screen
// "last line" isn't enough. Two-file rotation: peer.log is live, when it
// crosses MAX_BYTES it's moved to peer.log.1 (the previous .1 is
// dropped). Reads concat .1 + live to give chronological order.
//
// All writes go through a single-threaded executor because the log
// callback fires from multiple OkHttp/scheduler threads — without
// serialization, lines interleave or a rotation races a write and
// truncates mid-line.
object LogStore {

    private const val MAX_BYTES = 2 * 1024 * 1024L  // ~2 MB live + ~2 MB rolled
    private const val LIVE = "peer.log"
    private const val ROLL = "peer.log.1"

    private val writer = Executors.newSingleThreadExecutor()
    private val ts = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US)

    @Volatile private var dir: File? = null

    fun init(filesDir: File) { dir = filesDir }

    fun append(line: String) {
        val d = dir ?: return
        val safe = redact(line)
        val stamp = ts.format(Date())
        writer.submit {
            try {
                val live = File(d, LIVE)
                if (live.exists() && live.length() > MAX_BYTES) {
                    val roll = File(d, ROLL)
                    if (roll.exists()) roll.delete()
                    live.renameTo(roll)
                }
                live.appendText("$stamp  $safe\n")
            } catch (_: Exception) { /* swallow — logging must never crash the peer */ }
        }
    }

    fun snapshot(): String {
        val d = dir ?: return "(log not initialized)"
        val sb = StringBuilder()
        val roll = File(d, ROLL); if (roll.exists()) sb.append(roll.readText())
        val live = File(d, LIVE); if (live.exists()) sb.append(live.readText())
        return if (sb.isEmpty()) "(empty)" else sb.toString()
    }

    // Returns a File pointing at a unified snapshot suitable for sharing.
    // Concatenates rolled + live into one peer-log-export.txt so the
    // recipient gets a single chronological file.
    fun exportFile(): File {
        val d = dir!!
        val out = File(d, "peer-log-export.txt")
        out.writeText(snapshot())
        return out
    }

    // Redact tokens before write — these grant peer-impersonation until
    // expiry / refresh, so a log file forwarded over email shouldn't
    // carry them. The patterns cover JWT JSON fields, refreshToken JSON
    // fields, the WS subprotocol form (`token.<jwt>`), and HTTP
    // Authorization headers.
    private val jwtJson = Regex("\"jwt\"\\s*:\\s*\"[^\"]+\"")
    private val refreshJson = Regex("\"refreshToken\"\\s*:\\s*\"[^\"]+\"")
    private val bearerHdr = Regex("Bearer\\s+[A-Za-z0-9._\\-]+", RegexOption.IGNORE_CASE)
    private val subprotoTok = Regex("token\\.[A-Za-z0-9._\\-]+")
    private val bareJwt = Regex("eyJ[A-Za-z0-9._\\-]{20,}")

    private fun redact(s: String): String = s
        .replace(jwtJson, "\"jwt\":\"<redacted>\"")
        .replace(refreshJson, "\"refreshToken\":\"<redacted>\"")
        .replace(bearerHdr, "Bearer <redacted>")
        .replace(subprotoTok, "token.<redacted>")
        .replace(bareJwt, "<redacted-jwt>")
}

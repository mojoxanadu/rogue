package sx.proxies.peer

import org.json.JSONObject
import java.io.File

data class PeerState(
    var deviceId: String,
    var jwt: String,
    var refreshToken: String,
    var relay: String,
) {
    fun toJson(): String = JSONObject().apply {
        put("deviceId", deviceId)
        put("jwt", jwt)
        put("refreshToken", refreshToken)
        put("relay", relay)
    }.toString(2)

    companion object {
        fun load(file: File): PeerState {
            val j = JSONObject(file.readText())
            return PeerState(
                deviceId = j.getString("deviceId"),
                jwt = j.getString("jwt"),
                refreshToken = j.getString("refreshToken"),
                relay = j.getString("relay"),
            )
        }
    }
}

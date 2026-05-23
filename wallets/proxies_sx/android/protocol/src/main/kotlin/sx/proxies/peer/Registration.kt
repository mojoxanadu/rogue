package sx.proxies.peer

import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject

private const val API = "https://api.proxies.sx"
private val JSON = "application/json".toMediaType()

class Registration(private val http: OkHttpClient = OkHttpClient()) {

    fun register(name: String, type: String, walletAddress: String, apiKey: String?): PeerState {
        val body = JSONObject().apply {
            put("name", name)
            put("type", type)
            put("walletAddress", walletAddress)
            if (apiKey != null) put("apiKey", apiKey)
        }.toString().toRequestBody(JSON)

        val req = Request.Builder()
            .url("$API/v1/peer/agents/register")
            .post(body)
            .build()

        http.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            check(res.isSuccessful) { "register failed: ${res.code} $text" }
            val j = JSONObject(text)
            return PeerState(
                deviceId = j.getString("deviceId"),
                jwt = j.getString("jwt"),
                refreshToken = j.getString("refreshToken"),
                relay = j.getString("relay"),
            )
        }
    }

    fun refresh(state: PeerState) {
        val body = JSONObject().put("refreshToken", state.refreshToken)
            .toString().toRequestBody(JSON)

        val req = Request.Builder()
            .url("$API/v1/peer/agents/${state.deviceId}/refresh")
            .post(body)
            .build()

        http.newCall(req).execute().use { res ->
            val text = res.body?.string().orEmpty()
            check(res.isSuccessful) { "refresh failed: ${res.code} $text" }
            val j = JSONObject(text)
            state.jwt = j.getString("jwt")
            if (j.has("refreshToken")) state.refreshToken = j.getString("refreshToken")
        }
    }
}

package com.sovereign.communications.data.network

import android.util.Log
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.io.BufferedReader
import java.io.OutputStreamWriter
import java.net.HttpURLConnection
import java.net.URL

class RoomClient {
    private val TAG = "RoomClient"
    private val BASE_URL = "https://sc.netlify.app/.netlify/functions/room"

    data class PeerInfo(
        val id: String,
        val metadata: JSONObject?,
    )

    data class Signal(
        val id: String,
        val from: String,
        val type: String,
        val payload: String,
    )

    suspend fun join(
        peerId: String,
        roomUrl: String? = null,
    ): List<PeerInfo> =
        withContext(Dispatchers.IO) {
            try {
                val urlStr = roomUrl ?: BASE_URL
                val payload =
                    JSONObject().apply {
                        put("action", "join")
                        put("peerId", peerId)
                        put(
                            "payload",
                            JSONObject().apply {
                                put(
                                    "metadata",
                                    JSONObject().apply {
                                        put("userAgent", "Android/1.0")
                                    },
                                )
                            },
                        )
                    }

                val response = postRequest(urlStr, payload)
                val json = JSONObject(response)
                val peersArray = json.optJSONArray("peers") ?: JSONArray()
                val peers = mutableListOf<PeerInfo>()

                for (i in 0 until peersArray.length()) {
                    val p = peersArray.getJSONObject(i)
                    peers.add(PeerInfo(p.getString("_id"), p.optJSONObject("metadata")))
                }

                Log.d(TAG, "Joined room, found ${peers.size} peers")
                peers
            } catch (e: Exception) {
                Log.e(TAG, "Failed to join room", e)
                emptyList()
            }
        }

    suspend fun poll(
        peerId: String,
        roomUrl: String? = null,
    ): Pair<List<Signal>, List<PeerInfo>> =
        withContext(Dispatchers.IO) {
            try {
                val urlStr = roomUrl ?: BASE_URL
                val payload =
                    JSONObject().apply {
                        put("action", "poll")
                        put("peerId", peerId)
                    }

                val response = postRequest(urlStr, payload)
                val json = JSONObject(response)

                val signalsArray = json.optJSONArray("signals") ?: JSONArray()
                val signals = mutableListOf<Signal>()
                for (i in 0 until signalsArray.length()) {
                    val s = signalsArray.getJSONObject(i)
                    signals.add(
                        Signal(
                            s.getString("id"),
                            s.getString("from"),
                            s.getString("type"),
                            s.optString("signal"), // serialized SDP or candidate
                        ),
                    )
                }

                val peersArray = json.optJSONArray("peers") ?: JSONArray()
                val peers = mutableListOf<PeerInfo>()
                for (i in 0 until peersArray.length()) {
                    val p = peersArray.getJSONObject(i)
                    peers.add(PeerInfo(p.getString("_id"), p.optJSONObject("metadata")))
                }

                Pair(signals, peers)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to poll room", e)
                Pair(emptyList(), emptyList())
            }
        }

    suspend fun sendSignal(
        fromPeerId: String,
        toPeerId: String,
        type: String,
        signalData: String,
        roomUrl: String? = null,
    ): Boolean =
        withContext(Dispatchers.IO) {
            try {
                val urlStr = roomUrl ?: BASE_URL
                val payload =
                    JSONObject().apply {
                        put("action", "signal")
                        put("peerId", fromPeerId)
                        put(
                            "payload",
                            JSONObject().apply {
                                put("to", toPeerId)
                                put("type", type)
                                put("signal", signalData)
                            },
                        )
                    }

                val response = postRequest(urlStr, payload)
                val json = JSONObject(response)
                json.optBoolean("success", false)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send signal", e)
                false
            }
        }

    private fun postRequest(
        urlStr: String,
        jsonBody: JSONObject,
    ): String {
        val url = URL(urlStr)
        val conn = url.openConnection() as HttpURLConnection
        conn.requestMethod = "POST"
        conn.doOutput = true
        conn.doInput = true
        conn.setRequestProperty("Content-Type", "application/json; charset=UTF-8")
        conn.readTimeout = 10000
        conn.connectTimeout = 10000

        OutputStreamWriter(conn.outputStream).use { it.write(jsonBody.toString()) }

        val responseCode = conn.responseCode
        if (responseCode in 200..299) {
            return BufferedReader(java.io.InputStreamReader(conn.inputStream)).use { it.readText() }
        } else {
            val error = BufferedReader(java.io.InputStreamReader(conn.errorStream)).use { it.readText() }
            throw Exception("HTTP $responseCode: $error")
        }
    }
}

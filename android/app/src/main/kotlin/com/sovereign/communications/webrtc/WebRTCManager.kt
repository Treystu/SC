package com.sovereign.communications.webrtc

import android.content.Context
import io.getstream.webrtc.android.createPeerConnectionFactory
import org.webrtc.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Manages WebRTC peer connections for the mesh network.
 * Handles peer connection creation, ICE candidate exchange, and data channels.
 */
class WebRTCManager(private val context: Context) {
    private var peerConnectionFactory: PeerConnectionFactory? = null
    private val peerConnections = mutableMapOf<String, PeerConnection>()
    private val dataChannels = mutableMapOf<String, DataChannel>()
    
    private val _connectionStates = MutableStateFlow<Map<String, PeerConnection.PeerConnectionState>>(emptyMap())
    val connectionStates: StateFlow<Map<String, PeerConnection.PeerConnectionState>> = _connectionStates
    
    private val maxConnections = 10
    
    /**
     * Initialize WebRTC components
     */
    fun initialize() {
        val options = PeerConnectionFactory.InitializationOptions.builder(context)
            .setEnableInternalTracer(true)
            .createInitializationOptions()
        PeerConnectionFactory.initialize(options)
        
        peerConnectionFactory = createPeerConnectionFactory(context)
    }
    
    /**
     * Create a new peer connection and generate an offer
     */
    fun createPeerConnection(
        peerId: String,
        onOfferCreated: (String) -> Unit
    ): PeerConnection? {
        if (peerConnections.size >= maxConnections) {
            return null
        }
        
        val rtcConfig = PeerConnection.RTCConfiguration(emptyList()).apply {
            sdpSemantics = PeerConnection.SdpSemantics.UNIFIED_PLAN
            continualGatheringPolicy = PeerConnection.ContinualGatheringPolicy.GATHER_CONTINUALLY
        }
        
        val observer = object : PeerConnectionObserver() {
            override fun onIceCandidate(candidate: IceCandidate) {
                // Send ICE candidate to peer via mesh network
                // This would be handled by the mesh network layer
            }
            
            override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {
                updateConnectionState(peerId, newState)
                
                if (newState == PeerConnection.PeerConnectionState.FAILED) {
                    // Attempt reconnection
                    reconnectPeer(peerId)
                }
            }
            
            override fun onDataChannel(dataChannel: DataChannel) {
                dataChannels[peerId] = dataChannel
                setupDataChannelObserver(peerId, dataChannel)
            }
        }
        
        val pc = peerConnectionFactory?.createPeerConnection(rtcConfig, observer)
        
        pc?.let {
            peerConnections[peerId] = it
            
            // Create data channel
            val dataChannelInit = DataChannel.Init().apply {
                ordered = true
                maxRetransmits = 3
            }
            val dataChannel = it.createDataChannel("mesh-data", dataChannelInit)
            dataChannels[peerId] = dataChannel
            setupDataChannelObserver(peerId, dataChannel)
            
            // Create offer
            it.createOffer(object : SdpObserver {
                override fun onCreateSuccess(sdp: SessionDescription) {
                    it.setLocalDescription(object : SdpObserver {
                        override fun onSetSuccess() {
                            onOfferCreated(sdp.description)
                        }
                        override fun onSetFailure(error: String) {}
                        override fun onCreateSuccess(sdp: SessionDescription) {}
                        override fun onCreateFailure(error: String) {}
                    }, sdp)
                }
                override fun onSetSuccess() {}
                override fun onCreateFailure(error: String) {}
                override fun onSetFailure(error: String) {}
            }, MediaConstraints())
        }
        
        return pc
    }
    
    /**
     * Handle remote offer and create answer
     */
    fun handleRemoteOffer(
        peerId: String,
        offerSdp: String,
        onAnswerCreated: (String) -> Unit
    ) {
        val pc = peerConnections[peerId] ?: createPeerConnection(peerId) {}
        
        pc?.let {
            val remoteDescription = SessionDescription(SessionDescription.Type.OFFER, offerSdp)
            it.setRemoteDescription(object : SdpObserver {
                override fun onSetSuccess() {
                    it.createAnswer(object : SdpObserver {
                        override fun onCreateSuccess(sdp: SessionDescription) {
                            it.setLocalDescription(object : SdpObserver {
                                override fun onSetSuccess() {
                                    onAnswerCreated(sdp.description)
                                }
                                override fun onSetFailure(error: String) {}
                                override fun onCreateSuccess(sdp: SessionDescription) {}
                                override fun onCreateFailure(error: String) {}
                            }, sdp)
                        }
                        override fun onSetSuccess() {}
                        override fun onCreateFailure(error: String) {}
                        override fun onSetFailure(error: String) {}
                    }, MediaConstraints())
                }
                override fun onCreateSuccess(sdp: SessionDescription) {}
                override fun onCreateFailure(error: String) {}
                override fun onSetFailure(error: String) {}
            }, remoteDescription)
        }
    }
    
    /**
     * Handle remote answer
     */
    fun handleRemoteAnswer(peerId: String, answerSdp: String) {
        val pc = peerConnections[peerId] ?: return
        val remoteDescription = SessionDescription(SessionDescription.Type.ANSWER, answerSdp)
        pc.setRemoteDescription(object : SdpObserver {
            override fun onSetSuccess() {}
            override fun onCreateSuccess(sdp: SessionDescription) {}
            override fun onCreateFailure(error: String) {}
            override fun onSetFailure(error: String) {}
        }, remoteDescription)
    }
    
    /**
     * Add ICE candidate from remote peer
     */
    fun addIceCandidate(peerId: String, candidate: IceCandidate) {
        peerConnections[peerId]?.addIceCandidate(candidate)
    }
    
    /**
     * Send data to peer via data channel
     */
    fun sendData(peerId: String, data: ByteArray): Boolean {
        val dataChannel = dataChannels[peerId] ?: return false
        if (dataChannel.state() != DataChannel.State.OPEN) return false
        
        val buffer = DataChannel.Buffer(
            java.nio.ByteBuffer.wrap(data),
            true
        )
        return dataChannel.send(buffer)
    }
    
    /**
     * Close connection to peer
     */
    fun closePeerConnection(peerId: String) {
        dataChannels[peerId]?.close()
        dataChannels.remove(peerId)
        
        peerConnections[peerId]?.close()
        peerConnections.remove(peerId)
        
        updateConnectionState(peerId, PeerConnection.PeerConnectionState.CLOSED)
    }
    
    /**
     * Cleanup all connections
     */
    fun cleanup() {
        peerConnections.keys.toList().forEach { closePeerConnection(it) }
        peerConnectionFactory?.dispose()
        peerConnectionFactory = null
    }
    
    private fun setupDataChannelObserver(peerId: String, dataChannel: DataChannel) {
        dataChannel.registerObserver(object : DataChannel.Observer {
            override fun onMessage(buffer: DataChannel.Buffer) {
                // Handle received data
                // This would be passed to the mesh network layer
            }
            
            override fun onBufferedAmountChange(previousAmount: Long) {}
            override fun onStateChange() {}
        })
    }
    
    private fun updateConnectionState(peerId: String, state: PeerConnection.PeerConnectionState) {
        val currentStates = _connectionStates.value.toMutableMap()
        currentStates[peerId] = state
        _connectionStates.value = currentStates
    }
    
    private fun reconnectPeer(peerId: String) {
        // Close existing connection
        closePeerConnection(peerId)
        
        // Create new connection
        // This would typically be initiated by the mesh network layer
    }
    
    private open class PeerConnectionObserver : PeerConnection.Observer {
        override fun onSignalingChange(state: PeerConnection.SignalingState) {}
        override fun onIceConnectionChange(state: PeerConnection.IceConnectionState) {}
        override fun onConnectionChange(newState: PeerConnection.PeerConnectionState) {}
        override fun onIceConnectionReceivingChange(receiving: Boolean) {}
        override fun onIceGatheringChange(state: PeerConnection.IceGatheringState) {}
        override fun onIceCandidate(candidate: IceCandidate) {}
        override fun onIceCandidatesRemoved(candidates: Array<out IceCandidate>) {}
        override fun onAddStream(stream: MediaStream) {}
        override fun onRemoveStream(stream: MediaStream) {}
        override fun onDataChannel(dataChannel: DataChannel) {}
        override fun onRenegotiationNeeded() {}
        override fun onAddTrack(receiver: RtpReceiver, streams: Array<out MediaStream>) {}
    }
}

package com.sovereign.communications.ui.screen

import android.app.Activity
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.sovereign.communications.sharing.*
import com.sovereign.communications.sharing.models.Invite
import kotlinx.coroutines.launch

/**
 * SharingScreen - Demonstrates all Android sharing methods
 * Provides UI for QR codes, NFC, Nearby Connections, and Share Sheet
 *
 * @param peerId The current user's peer ID
 * @param publicKey The current user's public key
 * @param displayName The current user's display name
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SharingScreen(
    peerId: String,
    publicKey: ByteArray,
    displayName: String?,
    onNavigateBack: () -> Unit,
    onNavigateToQRScanner: () -> Unit,
    onNavigateToQRDisplay: (String) -> Unit,
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()

    // Initialize managers with actual user data
    val shareManager = remember { ShareManager(context) }
    val nfcManager =
        remember {
            if (context is Activity) NFCShareManager(context) else null
        }
    val nearbyManager = remember { NearbyShareManager(context) }
    val apkExtractor = remember { APKExtractor(context) }
    val inviteManager =
        remember {
            InviteManager(context, peerId, publicKey, displayName)
        }

    var currentInvite by remember { mutableStateOf<Invite?>(null) }
    var showNearbyDialog by remember { mutableStateOf(false) }
    val discoveredDevices by nearbyManager.discoveredDevices.collectAsState()
    val connectionState by nearbyManager.connectionState.collectAsState()

    // Cache APK URI to avoid repeated file operations
    var cachedAPKUri by remember { mutableStateOf<android.net.Uri?>(null) }

    // Create an invite when screen opens
    LaunchedEffect(Unit) {
        currentInvite = inviteManager.createInvite()
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Share SC App") },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, "Back")
                    }
                },
            )
        },
    ) { paddingValues ->
        Column(
            modifier =
                Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
                    .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Text(
                text = "Share via",
                style = MaterialTheme.typography.headlineSmall,
                modifier = Modifier.padding(bottom = 8.dp),
            )

            // QR Code
            Card(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    currentInvite?.let { invite ->
                        val payload = inviteManager.createSharePayload(invite)
                        onNavigateToQRDisplay(payload.toJsonString())
                    }
                },
            ) {
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Default.QrCode,
                        contentDescription = null,
                        modifier = Modifier.size(40.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "QR Code",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            "Display QR code for scanning",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // Scan QR Code
            Card(
                modifier = Modifier.fillMaxWidth(),
                onClick = onNavigateToQRScanner,
            ) {
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Default.QrCodeScanner,
                        contentDescription = null,
                        modifier = Modifier.size(40.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Scan QR Code",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            "Scan someone's QR code",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // NFC
            Card(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    currentInvite?.let { invite ->
                        nfcManager?.enableNFCSharing(invite)
                    }
                },
                enabled = nfcManager?.isNFCAvailable() == true,
            ) {
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Default.Nfc,
                        contentDescription = null,
                        modifier = Modifier.size(40.dp),
                        tint =
                            if (nfcManager?.isNFCAvailable() == true) {
                                MaterialTheme.colorScheme.primary
                            } else {
                                MaterialTheme.colorScheme.onSurfaceVariant
                            },
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "NFC Tap to Share",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            if (nfcManager?.isNFCAvailable() == true) {
                                "Tap devices together to share"
                            } else {
                                "NFC not available"
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // Nearby Connections
            Card(
                modifier = Modifier.fillMaxWidth(),
                onClick = { showNearbyDialog = true },
            ) {
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Default.Sensors,
                        contentDescription = null,
                        modifier = Modifier.size(40.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Nearby Sharing",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            "Share with nearby devices (no internet needed)",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // Share Sheet
            Card(
                modifier = Modifier.fillMaxWidth(),
                onClick = {
                    currentInvite?.let { invite ->
                        shareManager.shareApp(invite, includeAPK = false)
                    }
                },
            ) {
                Row(
                    modifier =
                        Modifier
                            .fillMaxWidth()
                            .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        Icons.Default.Share,
                        contentDescription = null,
                        modifier = Modifier.size(40.dp),
                        tint = MaterialTheme.colorScheme.primary,
                    )
                    Spacer(modifier = Modifier.width(16.dp))
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            "Share via Apps",
                            style = MaterialTheme.typography.titleMedium,
                        )
                        Text(
                            "Share invite link via messaging apps",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                    }
                }
            }

            // Share APK
            if (apkExtractor.isAPKExtractionAvailable()) {
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    onClick = {
                        currentInvite?.let { invite ->
                            // Use cached URI or extract and cache on first use
                            if (cachedAPKUri == null) {
                                cachedAPKUri = apkExtractor.getCachedAPKUri()
                            }
                            shareManager.shareApp(invite, includeAPK = true)
                        }
                    },
                ) {
                    Row(
                        modifier =
                            Modifier
                                .fillMaxWidth()
                                .padding(16.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            Icons.Default.Android,
                            contentDescription = null,
                            modifier = Modifier.size(40.dp),
                            tint = MaterialTheme.colorScheme.primary,
                        )
                        Spacer(modifier = Modifier.width(16.dp))
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                "Share APK",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(
                                "Share app installer (${apkExtractor.getAPKSizeFormatted()})",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                            )
                        }
                    }
                }
            }

            // Current invite info
            currentInvite?.let { invite ->
                Spacer(modifier = Modifier.height(8.dp))
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    color = MaterialTheme.colorScheme.surfaceVariant,
                    shape = MaterialTheme.shapes.medium,
                ) {
                    Column(
                        modifier = Modifier.padding(12.dp),
                    ) {
                        Text(
                            "Active Invite",
                            style = MaterialTheme.typography.labelMedium,
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                        )
                        Text(
                            invite.code.take(16) + "...",
                            style = MaterialTheme.typography.bodySmall,
                            fontFamily = androidx.compose.ui.text.font.FontFamily.Monospace,
                        )
                    }
                }
            }
        }
    }

    // Nearby Connections Dialog
    if (showNearbyDialog) {
        NearbyConnectionsDialog(
            nearbyManager = nearbyManager,
            currentInvite = currentInvite,
            discoveredDevices = discoveredDevices,
            connectionState = connectionState,
            userName = displayName ?: "SC User",
            onDismiss = {
                showNearbyDialog = false
                nearbyManager.disconnectAll()
            },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NearbyConnectionsDialog(
    nearbyManager: NearbyShareManager,
    currentInvite: Invite?,
    discoveredDevices: List<NearbyShareManager.DiscoveredDevice>,
    connectionState: NearbyShareManager.ConnectionState,
    userName: String = "SC User",
    onDismiss: () -> Unit,
) {
    val scope = rememberCoroutineScope()
    var mode by remember { mutableStateOf<String>("advertise") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Nearby Sharing") },
        text = {
            Column {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly,
                ) {
                    FilterChip(
                        selected = mode == "advertise",
                        onClick = { mode = "advertise" },
                        label = { Text("Be Discoverable") },
                    )
                    FilterChip(
                        selected = mode == "discover",
                        onClick = { mode = "discover" },
                        label = { Text("Find Devices") },
                    )
                }

                Spacer(modifier = Modifier.height(16.dp))

                when (connectionState) {
                    is NearbyShareManager.ConnectionState.Advertising -> {
                        Text("Advertising... Other devices can now see you.")
                    }

                    is NearbyShareManager.ConnectionState.Discovering -> {
                        Text("Searching for nearby devices...")
                        if (discoveredDevices.isEmpty()) {
                            Text(
                                "No devices found yet",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        } else {
                            discoveredDevices.forEach { device ->
                                TextButton(
                                    onClick = {
                                        nearbyManager.connectToDevice(
                                            device.endpointId,
                                            device.name,
                                            userName,
                                        )
                                    },
                                ) {
                                    Text(device.name)
                                }
                            }
                        }
                    }

                    is NearbyShareManager.ConnectionState.Connected -> {
                        Text("Connected! Sharing invite...")
                    }

                    is NearbyShareManager.ConnectionState.Error -> {
                        Text(
                            "Error: ${connectionState.message}",
                            color = MaterialTheme.colorScheme.error,
                        )
                    }

                    else -> {
                        Text("Ready to share")
                    }
                }
            }
        },
        confirmButton = {
            TextButton(
                onClick = {
                    if (mode == "advertise") {
                        currentInvite?.let { invite ->
                            nearbyManager.startAdvertising(invite, userName)
                        }
                    } else {
                        nearbyManager.startDiscovery { receivedInvite ->
                            // Handle received invite
                        }
                    }
                },
            ) {
                Text("Start")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        },
    )
}

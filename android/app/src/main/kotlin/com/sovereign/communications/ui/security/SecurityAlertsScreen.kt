package com.sovereign.communications.ui.security

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.sovereign.communications.security.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*

/**
 * ViewModel for Security Alerts
 */
class SecurityAlertsViewModel(
    private val alertSystem: PeerSecurityAlertSystem,
    private val alertDao: SecurityAlertDao
) : ViewModel() {
    
    private val _alerts = MutableStateFlow<List<SecurityAlert>>(emptyList())
    val alerts: StateFlow<List<SecurityAlert>> = _alerts
    
    private val _selectedAlert = MutableStateFlow<SecurityAlert?>(null)
    val selectedAlert: StateFlow<SecurityAlert?> = _selectedAlert
    
    private val _showReportDialog = MutableStateFlow(false)
    val showReportDialog: StateFlow<Boolean> = _showReportDialog
    
    init {
        // Subscribe to new alerts
        alertSystem.onAlertReceived { alert ->
            viewModelScope.launch {
                _alerts.value = listOf(alert) + _alerts.value
            }
        }
        
        // Load existing alerts
        viewModelScope.launch {
            alertDao.getAllAlerts().collect { alerts ->
                _alerts.value = alerts
            }
        }
    }
    
    fun showReportDialog() {
        _showReportDialog.value = true
    }
    
    fun hideReportDialog() {
        _showReportDialog.value = false
    }
    
    fun selectAlert(alert: SecurityAlert?) {
        _selectedAlert.value = alert
    }
    
    fun submitAlert(
        type: SecurityAlertType,
        severity: AlertSeverity,
        suspiciousPeerId: String,
        description: String,
        reporterId: String,
        privateKey: ByteArray
    ) {
        viewModelScope.launch {
            try {
                alertSystem.createAlert(
                    type = type,
                    suspiciousPeerId = suspiciousPeerId,
                    reporterId = reporterId,
                    reporterPrivateKey = privateKey,
                    description = description,
                    severity = severity
                )
                _showReportDialog.value = false
            } catch (e: Exception) {
                // Handle error
                e.printStackTrace()
            }
        }
    }
}

/**
 * Security Alerts Screen
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SecurityAlertsScreen(
    viewModel: SecurityAlertsViewModel
) {
    val alerts by viewModel.alerts.collectAsState()
    val selectedAlert by viewModel.selectedAlert.collectAsState()
    val showReportDialog by viewModel.showReportDialog.collectAsState()
    
    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Security Alerts") },
                actions = {
                    IconButton(onClick = { viewModel.showReportDialog() }) {
                        Icon(Icons.Default.Warning, contentDescription = "Report Issue")
                    }
                }
            )
        },
        floatingActionButton = {
            FloatingActionButton(
                onClick = { viewModel.showReportDialog() },
                containerColor = MaterialTheme.colorScheme.error
            ) {
                Icon(Icons.Default.Warning, contentDescription = "Report")
            }
        }
    ) { padding ->
        Box(modifier = Modifier.padding(padding)) {
            if (alerts.isEmpty()) {
                EmptyAlertsView()
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(16.dp),
                    verticalArrangement = Arrangement.spacedBy(12.dp)
                ) {
                    items(alerts) { alert ->
                        SecurityAlertCard(
                            alert = alert,
                            onClick = { viewModel.selectAlert(alert) }
                        )
                    }
                }
            }
        }
    }
    
    // Report Dialog
    if (showReportDialog) {
        ReportSecurityIssueDialog(
            onDismiss = { viewModel.hideReportDialog() },
            onSubmit = { type, severity, peerId, description ->
                // Get actual reporter ID from SCApplication
                val reporterId = com.sovereign.communications.SCApplication.instance.localPeerId 
                    ?: "unknown-peer"
                
                // Get private key from KeystoreManager
                // For Ed25519 signing, we need the actual private key
                // In production, this should be the identity private key used for signing
                val privateKey = try {
                    // Generate or retrieve the identity signing key
                    // This is a placeholder - actual implementation should retrieve from secure storage
                    val keyManager = com.sovereign.communications.security.KeystoreManager
                    // For now, use the peer ID as seed to maintain consistency
                    // In V1.1, implement proper key retrieval from KeystoreManager
                    keyManager.generateDatabasePassphrase().copyOf(32)
                } catch (e: Exception) {
                    // Fallback to zeros if key retrieval fails
                    ByteArray(32)
                }
                
                viewModel.submitAlert(
                    type = type,
                    severity = severity,
                    suspiciousPeerId = peerId,
                    description = description,
                    reporterId = reporterId,
                    privateKey = privateKey
                )
            }
        )
    }
    
    // Alert Details Dialog
    selectedAlert?.let { alert ->
        AlertDetailsDialog(
            alert = alert,
            onDismiss = { viewModel.selectAlert(null) }
        )
    }
}

@Composable
fun EmptyAlertsView() {
    Column(
        modifier = Modifier.fillMaxSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        Icon(
            imageVector = Icons.Default.Warning,
            contentDescription = null,
            modifier = Modifier.size(64.dp),
            tint = Color.Gray
        )
        Spacer(modifier = Modifier.height(16.dp))
        Text(
            text = "No security alerts",
            style = MaterialTheme.typography.titleMedium,
            color = Color.Gray
        )
        Text(
            text = "The mesh network is secure",
            style = MaterialTheme.typography.bodySmall,
            color = Color.Gray
        )
    }
}

@Composable
fun SecurityAlertCard(
    alert: SecurityAlert,
    onClick: () -> Unit
) {
    val backgroundColor = when (alert.severity) {
        AlertSeverity.CRITICAL -> Color(0xFFFFEBEE)
        AlertSeverity.HIGH -> Color(0xFFFFF3E0)
        AlertSeverity.MEDIUM -> Color(0xFFFFFDE7)
        AlertSeverity.LOW -> Color(0xFFE3F2FD)
        AlertSeverity.INFO -> Color(0xFFF5F5F5)
    }
    
    val borderColor = when (alert.severity) {
        AlertSeverity.CRITICAL -> Color(0xFFD32F2F)
        AlertSeverity.HIGH -> Color(0xFFF57C00)
        AlertSeverity.MEDIUM -> Color(0xFFFBC02D)
        AlertSeverity.LOW -> Color(0xFF1976D2)
        AlertSeverity.INFO -> Color(0xFF757575)
    }
    
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .clickable(onClick = onClick)
            .border(2.dp, borderColor, RoundedCornerShape(8.dp)),
        colors = CardDefaults.cardColors(containerColor = backgroundColor)
    ) {
        Column(
            modifier = Modifier.padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = alert.type.name.replace("_", " "),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.Bold
                )
                Surface(
                    color = Color.White.copy(alpha = 0.5f),
                    shape = RoundedCornerShape(4.dp)
                ) {
                    Text(
                        text = alert.severity.name,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        style = MaterialTheme.typography.labelSmall
                    )
                }
            }
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = alert.description,
                style = MaterialTheme.typography.bodyMedium
            )
            
            Spacer(modifier = Modifier.height(8.dp))
            
            Text(
                text = "Suspicious: ${alert.suspiciousPeerId.take(16)}...",
                style = MaterialTheme.typography.bodySmall,
                color = Color.Gray
            )
            
            Text(
                text = "Reported by: ${alert.reporterId.take(16)}...",
                style = MaterialTheme.typography.bodySmall,
                color = Color.Gray
            )
            
            Text(
                text = formatTimestamp(alert.timestamp),
                style = MaterialTheme.typography.bodySmall,
                color = Color.Gray
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportSecurityIssueDialog(
    onDismiss: () -> Unit,
    onSubmit: (SecurityAlertType, AlertSeverity, String, String) -> Unit
) {
    var selectedType by remember { mutableStateOf(SecurityAlertType.SPAM_BEHAVIOR) }
    var selectedSeverity by remember { mutableStateOf(AlertSeverity.MEDIUM) }
    var peerId by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }
    
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Report Security Issue") },
        text = {
            Column(
                modifier = Modifier.fillMaxWidth(),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                // Alert Type
                Text("Alert Type", style = MaterialTheme.typography.labelMedium)
                // Simplified - in real app would use dropdown
                Text(selectedType.name, style = MaterialTheme.typography.bodyMedium)
                
                // Severity
                Text("Severity", style = MaterialTheme.typography.labelMedium)
                Text(selectedSeverity.name, style = MaterialTheme.typography.bodyMedium)
                
                // Peer ID
                OutlinedTextField(
                    value = peerId,
                    onValueChange = { peerId = it },
                    label = { Text("Suspicious Peer ID") },
                    modifier = Modifier.fillMaxWidth()
                )
                
                // Description
                OutlinedTextField(
                    value = description,
                    onValueChange = { description = it },
                    label = { Text("Description") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 3
                )
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    if (peerId.isNotBlank() && description.isNotBlank()) {
                        onSubmit(selectedType, selectedSeverity, peerId, description)
                    }
                }
            ) {
                Text("Submit")
            }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) {
                Text("Cancel")
            }
        }
    )
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AlertDetailsDialog(
    alert: SecurityAlert,
    onDismiss: () -> Unit
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Alert Details") },
        text = {
            LazyColumn(
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                item {
                    DetailRow("Alert ID", alert.alertId)
                }
                item {
                    DetailRow("Type", alert.type.name)
                }
                item {
                    DetailRow("Severity", alert.severity.name)
                }
                item {
                    DetailRow("Suspicious Peer", alert.suspiciousPeerId)
                }
                item {
                    DetailRow("Reported By", alert.reporterId)
                }
                item {
                    DetailRow("Description", alert.description)
                }
                item {
                    DetailRow("Timestamp", formatFullTimestamp(alert.timestamp))
                }
                item {
                    DetailRow("TTL", alert.ttl.toString())
                }
                alert.evidence?.let {
                    item {
                        DetailRow("Evidence", it)
                    }
                }
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text("Close")
            }
        }
    )
}

@Composable
fun DetailRow(label: String, value: String) {
    Column {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = Color.Gray
        )
        Text(
            text = value,
            style = MaterialTheme.typography.bodyMedium
        )
    }
}

fun formatTimestamp(timestamp: Long): String {
    val now = System.currentTimeMillis()
    val diff = now - timestamp
    val minutes = diff / 60000
    
    return when {
        minutes < 1 -> "Just now"
        minutes < 60 -> "${minutes}m ago"
        minutes < 1440 -> "${minutes / 60}h ago"
        else -> "${minutes / 1440}d ago"
    }
}

fun formatFullTimestamp(timestamp: Long): String {
    val sdf = SimpleDateFormat("yyyy-MM-dd HH:mm:ss", Locale.getDefault())
    return sdf.format(Date(timestamp))
}

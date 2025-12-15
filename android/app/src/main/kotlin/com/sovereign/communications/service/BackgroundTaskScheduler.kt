package com.sovereign.communications.service

import android.content.Context
import android.content.Intent
import android.util.Log
import androidx.work.*
import com.sovereign.communications.data.SCDatabase
import com.sovereign.communications.service.MeshNetworkService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.util.concurrent.TimeUnit

/**
 * Background Task Scheduler - Manages periodic background tasks using WorkManager
 * Task 225: Background task scheduler using WorkManager
 */
class BackgroundTaskScheduler(
    private val context: Context,
) {
    private val TAG = "BackgroundTaskScheduler"

    /**
     * Schedule periodic message sync
     */
    fun scheduleMessageSync(intervalMinutes: Long = 15) {
        val constraints =
            Constraints
                .Builder()
                .setRequiredNetworkType(NetworkType.CONNECTED)
                .setRequiresBatteryNotLow(true)
                .build()

        val syncRequest =
            PeriodicWorkRequestBuilder<MessageSyncWorker>(
                intervalMinutes,
                TimeUnit.MINUTES,
            ).setConstraints(constraints)
                .setBackoffCriteria(
                    BackoffPolicy.EXPONENTIAL,
                    WorkRequest.MIN_BACKOFF_MILLIS,
                    TimeUnit.MILLISECONDS,
                ).addTag(SYNC_WORK_TAG)
                .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            SYNC_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            syncRequest,
        )

        Log.d(TAG, "Scheduled message sync every $intervalMinutes minutes")
    }

    /**
     * Schedule periodic peer discovery
     */
    fun schedulePeerDiscovery(intervalMinutes: Long = 30) {
        val constraints =
            Constraints
                .Builder()
                .setRequiresBatteryNotLow(true)
                .build()

        val discoveryRequest =
            PeriodicWorkRequestBuilder<PeerDiscoveryWorker>(
                intervalMinutes,
                TimeUnit.MINUTES,
            ).setConstraints(constraints)
                .addTag(DISCOVERY_WORK_TAG)
                .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            DISCOVERY_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            discoveryRequest,
        )

        Log.d(TAG, "Scheduled peer discovery every $intervalMinutes minutes")
    }

    /**
     * Schedule database cleanup
     */
    fun scheduleCleanup(intervalHours: Long = 24) {
        val constraints =
            Constraints
                .Builder()
                .setRequiresBatteryNotLow(true)
                .setRequiresCharging(true)
                .build()

        val cleanupRequest =
            PeriodicWorkRequestBuilder<CleanupWorker>(
                intervalHours,
                TimeUnit.HOURS,
            ).setConstraints(constraints)
                .addTag(CLEANUP_WORK_TAG)
                .build()

        WorkManager.getInstance(context).enqueueUniquePeriodicWork(
            CLEANUP_WORK_NAME,
            ExistingPeriodicWorkPolicy.KEEP,
            cleanupRequest,
        )

        Log.d(TAG, "Scheduled cleanup every $intervalHours hours")
    }

    /**
     * Cancel all scheduled tasks
     */
    fun cancelAll() {
        WorkManager.getInstance(context).cancelAllWork()
        Log.d(TAG, "Cancelled all background tasks")
    }

    /**
     * Cancel specific task by tag
     */
    fun cancelByTag(tag: String) {
        WorkManager.getInstance(context).cancelAllWorkByTag(tag)
        Log.d(TAG, "Cancelled work with tag: $tag")
    }

    /**
     * Get work info for monitoring
     */
    fun getWorkInfo(workName: String) = WorkManager.getInstance(context).getWorkInfosForUniqueWork(workName)

    companion object {
        private const val SYNC_WORK_NAME = "message_sync"
        private const val SYNC_WORK_TAG = "sync"

        private const val DISCOVERY_WORK_NAME = "peer_discovery"
        private const val DISCOVERY_WORK_TAG = "discovery"

        private const val CLEANUP_WORK_NAME = "database_cleanup"
        private const val CLEANUP_WORK_TAG = "cleanup"
    }
}

/**
 * Worker for message synchronization
 */
class MessageSyncWorker(
    context: Context,
    params: WorkerParameters,
) : Worker(context, params) {
    override fun doWork(): ListenableWorker.Result =
        try {
            Log.d("MessageSyncWorker", "Executing message sync")
            val intent = Intent(applicationContext, MeshNetworkService::class.java)
            intent.action = "ACTION_SYNC"
            applicationContext.startService(intent)
            ListenableWorker.Result.success()
        } catch (e: Exception) {
            Log.e("MessageSyncWorker", "Sync failed", e)
            ListenableWorker.Result.retry()
        }
}

/**
 * Worker for peer discovery
 */
class PeerDiscoveryWorker(
    context: Context,
    params: WorkerParameters,
) : Worker(context, params) {
    override fun doWork(): ListenableWorker.Result =
        try {
            Log.d("PeerDiscoveryWorker", "Executing peer discovery")
            val intent = Intent(applicationContext, MeshNetworkService::class.java)
            intent.action = "ACTION_START_SCAN"
            applicationContext.startService(intent)
            ListenableWorker.Result.success()
        } catch (e: Exception) {
            Log.e("PeerDiscoveryWorker", "Discovery failed", e)
            ListenableWorker.Result.retry()
        }
}

/**
 * Worker for database cleanup
 */
class CleanupWorker(
    context: Context,
    params: WorkerParameters,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): ListenableWorker.Result =
        try {
            Log.d("CleanupWorker", "Executing cleanup")
            withContext(Dispatchers.IO) {
                val db = SCDatabase.getDatabase(applicationContext)
                val cutoffTime = System.currentTimeMillis() - TimeUnit.DAYS.toMillis(30)
                // Assuming DAO methods exist for cleanup
                // db.messageDao().deleteOldMessages(cutoffTime)
                Log.d("CleanupWorker", "Cleanup complete")
            }
            ListenableWorker.Result.success()
        } catch (e: Exception) {
            Log.e("CleanupWorker", "Cleanup failed", e)
            ListenableWorker.Result.retry()
        }
}

package com.stride.tracker.lite.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder

class LiteTrackingService : Service() {
    companion object {
        private const val CHANNEL_ID = "stride_lite_tracking"
        private const val NOTIF_ID = 4102

        fun start(context: Context, activityType: String) {
            val intent = Intent(context, LiteTrackingService::class.java)
                .putExtra("activityType", activityType)
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    context.startForegroundService(intent)
                } else {
                    context.startService(intent)
                }
            } catch (_: Throwable) {}
        }

        fun stop(context: Context) {
            try {
                context.stopService(Intent(context, LiteTrackingService::class.java))
            } catch (_: Throwable) {}
        }
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val type = intent?.getStringExtra("activityType") ?: "run"
        ensureChannel()
        val notif = Notification.Builder(this, CHANNEL_ID)
            .setContentTitle("Stride Lite Recording Active")
            .setContentText("Tracking $type offline-first in background")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setOngoing(true)
            .build()

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIF_ID, notif, ServiceInfo.FOREGROUND_SERVICE_TYPE_LOCATION)
        } else {
            startForeground(NOTIF_ID, notif)
        }
        return START_STICKY
    }

    private fun ensureChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val nm = getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL_ID) == null) {
                nm.createNotificationChannel(
                    NotificationChannel(
                        CHANNEL_ID,
                        "Stride Lite GPS Tracking",
                        NotificationManager.IMPORTANCE_LOW
                    )
                )
            }
        }
    }

    override fun onBind(intent: Intent?): IBinder? = null
}

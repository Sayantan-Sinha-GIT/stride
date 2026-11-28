package com.stride.tracker.lite.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.stride.tracker.lite.MainActivity
import com.stride.tracker.lite.R
import java.util.Locale

class LiteTrackingService : Service() {
    companion object {
        private const val CHANNEL_ID = "stride_lite_tracking_v2"
        private const val NOTIF_ID = 4202
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        ensureChannel()
        val distanceM = intent?.getDoubleExtra("distanceM", 0.0) ?: 0.0
        val elapsedS = intent?.getIntExtra("elapsedS", 0) ?: 0
        val pts = intent?.getIntExtra("pts", 0) ?: 0
        val text = String.format(Locale.US, "%.2f km · %d:%02d · %d GPS pts", distanceM / 1000.0, elapsedS / 60, elapsedS % 60, pts)

        val openIntent = PendingIntent.getActivity(
            this,
            0,
            Intent(this, MainActivity::class.java),
            PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT
        )
        val notif: Notification = NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_record)
            .setContentTitle("Stride Lite · Recording GPS")
            .setContentText(text)
            .setContentIntent(openIntent)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
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
                    NotificationChannel(CHANNEL_ID, "GPS Tracking", NotificationManager.IMPORTANCE_LOW)
                )
            }
        }
    }
}

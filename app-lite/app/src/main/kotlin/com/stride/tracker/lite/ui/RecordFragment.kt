package com.stride.tracker.lite.ui

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.core.view.isVisible
import androidx.fragment.app.Fragment
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import com.stride.tracker.lite.MainActivity
import com.stride.tracker.lite.R
import com.stride.tracker.lite.core.Formatters
import com.stride.tracker.lite.core.LiteStrings
import com.stride.tracker.lite.core.StrideAppContainer
import com.stride.tracker.lite.databinding.FragmentRecordBinding
import com.stride.tracker.lite.location.RecordingSnapshot
import org.json.JSONObject
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import java.util.UUID
import kotlin.concurrent.thread

class RecordFragment : Fragment(), RefreshableTab {
    private var _binding: FragmentRecordBinding? = null
    private val binding get() = _binding!!
    private var selectedSport = "run"
    private var recoveryChecked = false
    private val uiHandler = Handler(Looper.getMainLooper())
    private val timerTick = object : Runnable {
        override fun run() {
            val snap = StrideAppContainer.recorder.currentSnapshot()
            if (snap.active) {
                renderSnapshot(snap)
                uiHandler.postDelayed(this, 1000L)
            }
        }
    }

    private val permLauncher = registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { granted ->
        val ok = granted[Manifest.permission.ACCESS_FINE_LOCATION] == true ||
            granted[Manifest.permission.ACCESS_COARSE_LOCATION] == true
        if (ok) startRecordingNow()
        else Snackbar.make(binding.root, "Location permission required for GPS tracking.", Snackbar.LENGTH_SHORT).show()
    }

    private val gpxPickerLauncher = registerForActivityResult(ActivityResultContracts.OpenDocument()) { uri ->
        uri ?: return@registerForActivityResult
        thread {
            runCatching {
                val xml = requireContext().contentResolver.openInputStream(uri)?.bufferedReader()?.readText().orEmpty()
                if (xml.isBlank()) error("Empty GPX file")
                val res = StrideAppContainer.api.importGpxXml(xml, binding.etRecordTitle.text?.toString(), selectedSport)
                val createdId = res.optJSONObject("activity")?.optString("id") ?: res.optString("id")
                _binding?.root?.post {
                    Snackbar.make(binding.root, "GPX imported & matched segments!", Snackbar.LENGTH_SHORT).show()
                    if (createdId.isNotBlank()) {
                        startActivity(Intent(requireContext(), ActivityDetailActivity::class.java).putExtra("activityId", createdId))
                    }
                }
            }.onFailure { err ->
                _binding?.root?.post {
                    Snackbar.make(binding.root, "GPX import failed: ${err.message}", Snackbar.LENGTH_LONG).show()
                }
            }
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentRecordBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        binding.mapRecordLive.setInteractive(true)
        binding.chipSportRun.setOnClickListener { selectedSport = "run" }
        binding.chipSportRide.setOnClickListener { selectedSport = "ride" }
        binding.chipSportWalk.setOnClickListener { selectedSport = "walk" }
        binding.chipSportHike.setOnClickListener { selectedSport = "hike" }

        binding.btnStartRecord.setOnClickListener { requestLocationAndStart() }
        binding.btnPauseResume.setOnClickListener { StrideAppContainer.recorder.togglePause() }
        binding.btnFinishSave.setOnClickListener { finishAndSave() }
        binding.btnImportGpx.setOnClickListener { gpxPickerLauncher.launch(arrayOf("*/*")) }
        binding.btnManualEntry.setOnClickListener { openManualDialog() }
        binding.btnSyncPending.setOnClickListener { flushQueueNow() }

        StrideAppContainer.recorder.setListener { snap ->
            _binding?.root?.post { renderSnapshot(snap) }
        }
        applyLabels()
        renderSnapshot(StrideAppContainer.recorder.currentSnapshot())
        checkCrashRecovery()
    }

    private fun applyLabels() {
        val lang = StrideAppContainer.prefs.language
        binding.chipSportRun.text = LiteStrings[lang, "run"]
        binding.chipSportRide.text = LiteStrings[lang, "ride"]
        binding.chipSportWalk.text = LiteStrings[lang, "walk"]
        binding.chipSportHike.text = LiteStrings[lang, "hike"]
        binding.btnStartRecord.text = LiteStrings[lang, "startRecording"]
        binding.btnFinishSave.text = LiteStrings[lang, "finishSave"]
        binding.btnImportGpx.text = LiteStrings[lang, "importGpx"]
        binding.btnManualEntry.text = LiteStrings[lang, "manualWorkout"]
    }

    override fun refreshContent() {
        applyLabels()
        renderSnapshot(StrideAppContainer.recorder.currentSnapshot())
    }

    private fun checkCrashRecovery() {
        if (recoveryChecked) return
        recoveryChecked = true
        val draft = StrideAppContainer.recorder.checkDraft() ?: return
        val lang = StrideAppContainer.prefs.language
        MaterialAlertDialogBuilder(requireContext())
            .setTitle(LiteStrings[lang, "recoveryTitle"])
            .setMessage("${LiteStrings[lang, "recoveryBody"]} (${draft.points.size} GPS pts)")
            .setNegativeButton(LiteStrings[lang, "discard"]) { _, _ ->
                StrideAppContainer.recorder.discardDraft(draft.clientId)
            }
            .setPositiveButton(LiteStrings[lang, "recover"]) { _, _ ->
                selectedSport = draft.activityType
                binding.etRecordTitle.setText(draft.title)
                StrideAppContainer.recorder.recoverDraft(draft)
                uiHandler.post(timerTick)
            }
            .show()
    }

    private fun requestLocationAndStart() {
        val hasFine = ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
        if (hasFine) {
            startRecordingNow()
            return
        }
        val list = mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            list.add(Manifest.permission.POST_NOTIFICATIONS)
        }
        permLauncher.launch(list.toTypedArray())
    }

    private fun startRecordingNow() {
        val customTitle = binding.etRecordTitle.text?.toString().orEmpty()
        StrideAppContainer.recorder.start(selectedSport, customTitle)
        uiHandler.removeCallbacks(timerTick)
        uiHandler.post(timerTick)
    }

    private fun finishAndSave() {
        val customTitle = binding.etRecordTitle.text?.toString().orEmpty()
        binding.btnFinishSave.isEnabled = false
        thread {
            val (uploaded, createdId) = StrideAppContainer.recorder.finishAndEnqueueOrSync(customTitle)
            _binding?.root?.post {
                val cur = _binding ?: return@post
                cur.btnFinishSave.isEnabled = true
                uiHandler.removeCallbacks(timerTick)
                renderSnapshot(StrideAppContainer.recorder.currentSnapshot())
                val msg = if (uploaded) "Activity saved & synced!" else "Saved offline in SQLite sync queue."
                Snackbar.make(cur.root, msg, Snackbar.LENGTH_SHORT).show()
                if (!createdId.isNullOrBlank()) {
                    startActivity(Intent(requireContext(), ActivityDetailActivity::class.java).putExtra("activityId", createdId))
                }
            }
        }
    }

    private fun flushQueueNow() {
        thread {
            val count = StrideAppContainer.recorder.flushPendingQueue()
            _binding?.root?.post {
                renderSnapshot(StrideAppContainer.recorder.currentSnapshot())
                Snackbar.make(binding.root, "Synced $count queued activit(y/ies).", Snackbar.LENGTH_SHORT).show()
                (activity as? MainActivity)?.updateCachePill()
            }
        }
    }

    private fun openManualDialog() {
        val ctx = requireContext()
        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (resources.displayMetrics.density * 18).toInt()
            setPadding(pad, pad / 2, pad, 0)
        }
        val etTitle = TextInputEditText(ctx).apply {
            hint = "Workout Title"
            setText("Indoor / Treadmill Session")
        }
        val etDistKm = TextInputEditText(ctx).apply {
            hint = "Distance (km)"
            setText("5.0")
            inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
        }
        val etDurMin = TextInputEditText(ctx).apply {
            hint = "Duration (minutes)"
            setText("28")
            inputType = InputType.TYPE_CLASS_NUMBER
        }
        col.addView(etTitle)
        col.addView(etDistKm)
        col.addView(etDurMin)

        MaterialAlertDialogBuilder(ctx)
            .setTitle(LiteStrings[StrideAppContainer.prefs.language, "manualWorkout"])
            .setView(col)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Save") { _, _ ->
                val title = etTitle.text.toString().ifBlank { "Manual Workout" }
                val distM = (etDistKm.text.toString().toDoubleOrNull() ?: 5.0) * 1000.0
                val durS = (etDurMin.text.toString().toIntOrNull() ?: 30) * 60
                val cid = UUID.randomUUID().toString()
                val iso = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss'Z'", Locale.US).apply { timeZone = TimeZone.getTimeZone("UTC") }
                val payload = JSONObject()
                    .put("clientId", cid)
                    .put("title", title)
                    .put("activityType", selectedSport)
                    .put("source", "manual")
                    .put("visibility", "followers")
                    .put("startedAt", iso.format(Date()))
                    .put("durationS", durS)
                    .put("distanceM", distM)
                    .put("elevationGainM", 25)
                thread {
                    runCatching {
                        val res = StrideAppContainer.api.uploadActivityRaw(cid, payload)
                        val createdId = res.optJSONObject("activity")?.optString("id") ?: res.optString("id")
                        _binding?.root?.post {
                            Snackbar.make(binding.root, "Manual workout logged!", Snackbar.LENGTH_SHORT).show()
                            if (createdId.isNotBlank()) {
                                startActivity(Intent(ctx, ActivityDetailActivity::class.java).putExtra("activityId", createdId))
                            }
                        }
                    }.onFailure { err ->
                        _binding?.root?.post { Snackbar.make(binding.root, err.message ?: "Failed", Snackbar.LENGTH_LONG).show() }
                    }
                }
            }
            .show()
    }

    private fun renderSnapshot(snap: RecordingSnapshot) {
        val b = _binding ?: return
        val units = StrideAppContainer.prefs.units
        val lang = StrideAppContainer.prefs.language

        b.btnStartRecord.isVisible = !snap.active
        b.rowActiveControls.isVisible = snap.active
        b.btnPauseResume.text = if (snap.paused) LiteStrings[lang, "resume"] else LiteStrings[lang, "pause"]
        b.btnPauseResume.setIconResource(if (snap.paused) R.drawable.ic_play else R.drawable.ic_pause)

        b.tvGpsStatusPill.text = when {
            snap.active && snap.paused -> "❚❚ PAUSED"
            snap.active -> "● LIVE GPS"
            else -> "● READY GPS"
        }

        val queueCount = StrideAppContainer.guardian.pendingSyncCount()
        b.tvSyncQueuePill.isVisible = queueCount > 0
        b.btnSyncPending.isVisible = queueCount > 0
        b.tvSyncQueuePill.text = "$queueCount queued"

        b.tvLiveDist.text = Formatters.distance(snap.summary.distanceM, units)
        b.tvLiveTime.text = Formatters.duration(snap.wallElapsedS)
        b.tvLivePace.text = Formatters.paceOrSpeed(snap.summary.distanceM, snap.summary.movingTimeS, snap.sport, units)
        b.tvLiveElevPts.text = "${Formatters.elevation(snap.summary.elevationGainM, units)} · ${snap.points.size} pts"
        b.mapRecordLive.setRoute(snap.points, isLive = snap.active && !snap.paused, progress = 1f)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        uiHandler.removeCallbacks(timerTick)
        StrideAppContainer.recorder.setListener(null)
        _binding = null
    }
}

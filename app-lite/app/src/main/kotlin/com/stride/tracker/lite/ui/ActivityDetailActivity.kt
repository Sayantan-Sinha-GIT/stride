package com.stride.tracker.lite.ui

import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.LinearLayout
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.isVisible
import androidx.core.view.updatePadding
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import com.stride.tracker.lite.R
import com.stride.tracker.lite.core.*
import com.stride.tracker.lite.databinding.ActivityDetailBinding
import org.json.JSONObject
import kotlin.concurrent.thread
import kotlin.math.max

class ActivityDetailActivity : AppCompatActivity() {
    private lateinit var binding: ActivityDetailBinding
    private val replayHandler = Handler(Looper.getMainLooper())
    private var playing = false
    private var replayProgress = 100f
    private var activityId = ""
    private var activityObj: JSONObject? = null
    private var pointCount = 0

    private val replayTick = object : Runnable {
        override fun run() {
            if (!playing) return
            replayProgress += 2f
            if (replayProgress >= 100f) {
                replayProgress = 100f
                playing = false
                binding.btnReplayToggle.setIconResource(R.drawable.ic_play)
            }
            binding.sliderReplay.value = replayProgress
            val f = replayProgress / 100f
            binding.mapDetail.setProgressFraction(f)
            binding.elevationChart.setMarkerFraction(f)
            if (playing) replayHandler.postDelayed(this, 60L)
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        StrideAppContainer.ensure(this)
        StrideAppContainer.applyThemeMode(StrideAppContainer.prefs.themeMode)
        binding = ActivityDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val dark = StrideAppContainer.isDarkActive(this)
        val ctrl = WindowInsetsControllerCompat(window, window.decorView)
        ctrl.isAppearanceLightStatusBars = !dark
        ctrl.isAppearanceLightNavigationBars = !dark
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { v, insets ->
            val sys = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            binding.toolbarDetail.updatePadding(top = sys.top)
            v.updatePadding(bottom = sys.bottom)
            insets
        }

        activityId = intent.getStringExtra("activityId").orEmpty()
        binding.toolbarDetail.setNavigationOnClickListener { finish() }
        binding.mapDetail.setInteractive(true)

        val lang = StrideAppContainer.prefs.language
        binding.tvElevationHeader.text = LiteStrings[lang, "elevationProfile"]
        binding.tvSplitsHeader.text = LiteStrings[lang, "kmSplits"]
        binding.tvEffortsHeader.text = LiteStrings[lang, "matchedSegments"]
        binding.tvCommentsHeader.text = LiteStrings[lang, "comments"]
        binding.btnExportGpx.text = "GPX"

        binding.sliderReplay.addOnChangeListener { _, value, fromUser ->
            if (fromUser) {
                replayProgress = value
                val f = value / 100f
                binding.mapDetail.setProgressFraction(f)
                binding.elevationChart.setMarkerFraction(f)
            }
        }
        binding.btnReplayToggle.setOnClickListener {
            if (playing) {
                playing = false
                binding.btnReplayToggle.setIconResource(R.drawable.ic_play)
            } else {
                if (replayProgress >= 99f) replayProgress = 0f
                playing = true
                binding.btnReplayToggle.setIconResource(R.drawable.ic_pause)
                replayHandler.post(replayTick)
            }
        }
        binding.btnDetailKudos.setOnClickListener { toggleKudos() }
        binding.btnExportGpx.setOnClickListener { shareGpx() }
        binding.btnMoreOwner.setOnClickListener { openOwnerMenu() }
        binding.btnDetailSendComment.setOnClickListener { sendComment() }

        loadDetail()
    }

    override fun onDestroy() {
        super.onDestroy()
        replayHandler.removeCallbacks(replayTick)
    }

    private fun loadDetail() {
        thread {
            val data = runCatching { StrideAppContainer.api.fetchActivityDetail(activityId) }.getOrNull() ?: return@thread
            val act = data.optJSONObject("activity") ?: return@thread
            activityObj = act
            runOnUiThread { renderDetail(act, data) }
        }
    }

    private fun renderDetail(act: JSONObject, full: JSONObject) {
        val units = StrideAppContainer.prefs.units
        val sport = act.optString("activityType", "run")
        val dist = act.optDouble("distanceM", 0.0)
        val moving = act.optInt("movingTimeS", 0)
        val elev = act.optDouble("elevationGainM", 0.0)
        val cals = act.optInt("caloriesEstimate", 0)
        val author = act.optJSONObject("author")
        val authorName = author?.optString("displayName")?.ifBlank { author.optString("handle") } ?: "Athlete"

        binding.toolbarDetail.title = act.optString("title", "Activity")
        binding.tvDetailMeta.text = "$authorName · ${Formatters.sportLabel(sport, StrideAppContainer.prefs.language)} · ${act.optString("visibility")} · ${act.optString("startedAt").take(10)}"
        binding.tvDetailTitle.text = act.optString("title")
        binding.tvDetailStats.text = "${Formatters.distance(dist, units)}  ·  ${Formatters.duration(moving)}  ·  ${Formatters.paceOrSpeed(dist, moving, sport, units)}  ·  +${Formatters.elevation(elev, units)}  ·  ~$cals kcal"

        val liked = act.optBoolean("viewerHasKudos", false)
        binding.btnDetailKudos.text = if (liked) "${act.optInt("kudosCount")} Liked" else "${act.optInt("kudosCount")} Kudos"
        binding.btnMoreOwner.isVisible = act.optBoolean("canEdit", false)

        val ptsArr = act.optJSONArray("points")
        val pts = mutableListOf<GpsPoint>()
        if (ptsArr != null && ptsArr.length() > 0) {
            for (i in 0 until ptsArr.length()) {
                val p = ptsArr.optJSONObject(i) ?: continue
                pts.add(GpsPoint(p.optDouble("lat"), p.optDouble("lng"), if (p.isNull("ele")) null else p.optDouble("ele"), 0L))
            }
        }
        val poly = act.optString("encodedPolyline")
        val finalPts = if (pts.size >= 2) pts else TrackProcessorLite.decodePolyline(poly)
        pointCount = finalPts.size
        binding.mapDetail.isVisible = finalPts.size >= 2
        binding.replayBar.isVisible = finalPts.size >= 2
        if (finalPts.size >= 2) {
            binding.mapDetail.setRoute(finalPts)
        }

        val eles = finalPts.mapNotNull { it.ele }.ifEmpty {
            val stream = act.optJSONArray("stream")
            if (stream != null) List(stream.length()) { stream.optJSONObject(it)?.optDouble("ele") }.filterNotNull() else emptyList()
        }
        binding.cardElevation.isVisible = eles.size >= 2
        if (eles.size >= 2) binding.elevationChart.setElevations(eles)

        // KM splits
        binding.splitsContainer.removeAllViews()
        val splits = act.optJSONArray("splitsKm")
        if (splits != null && splits.length() > 0) {
            for (i in 0 until splits.length()) {
                val sp = splits.optJSONObject(i) ?: continue
                val paceSec = sp.optInt("paceSecPerKm", 0)
                val row = LinearLayout(this).apply {
                    orientation = LinearLayout.HORIZONTAL
                    setPadding(0, 8, 0, 8)
                }
                row.addView(TextView(this).apply {
                    text = "KM ${sp.optInt("kmIndex", i + 1)}"
                    layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                    setTextColor(getColor(R.color.stride_text_primary))
                })
                row.addView(TextView(this).apply {
                    text = "${Formatters.duration(paceSec)} /km"
                    setTypeface(null, android.graphics.Typeface.BOLD)
                    setTextColor(getColor(R.color.stride_accent))
                })
                binding.splitsContainer.addView(row)
            }
        } else {
            binding.splitsContainer.addView(TextView(this).apply {
                text = "—"
                setTextColor(getColor(R.color.stride_text_secondary))
            })
        }

        // Segment efforts
        binding.effortsContainer.removeAllViews()
        val efforts = full.optJSONArray("segmentEfforts")
        if (efforts != null && efforts.length() > 0) {
            for (i in 0 until efforts.length()) {
                val ef = efforts.optJSONObject(i) ?: continue
                val segId = ef.optString("segment_id")
                val row = TextView(this).apply {
                    val pr = if (ef.optBoolean("is_pr", false)) "  ★ PR" else ""
                    text = "${ef.optString("segment_name")} · ${Formatters.duration(ef.optInt("elapsed_time_s"))}$pr"
                    setPadding(0, 12, 0, 12)
                    setTextColor(getColor(if (ef.optBoolean("is_pr")) R.color.stride_accent else R.color.stride_text_primary))
                    setTypeface(null, android.graphics.Typeface.BOLD)
                    setOnClickListener {
                        startActivity(Intent(this@ActivityDetailActivity, SegmentDetailActivity::class.java).putExtra("segmentId", segId))
                    }
                }
                binding.effortsContainer.addView(row)
            }
        } else {
            binding.effortsContainer.addView(TextView(this).apply {
                text = "No matched segments."
                setTextColor(getColor(R.color.stride_text_secondary))
            })
        }

        // Comments
        binding.commentsContainer.removeAllViews()
        val comments = full.optJSONArray("comments")
        if (comments != null && comments.length() > 0) {
            for (i in 0 until comments.length()) {
                val cm = comments.optJSONObject(i) ?: continue
                val who = cm.optString("display_name").ifBlank { cm.optString("handle", "Athlete") }
                binding.commentsContainer.addView(TextView(this).apply {
                    text = "$who: ${cm.optString("body")}"
                    setPadding(0, 6, 0, 6)
                    setTextColor(getColor(R.color.stride_text_primary))
                })
            }
        } else {
            binding.commentsContainer.addView(TextView(this).apply {
                text = "No comments yet."
                setTextColor(getColor(R.color.stride_text_secondary))
            })
        }
    }

    private fun toggleKudos() {
        val act = activityObj ?: return
        val liked = act.optBoolean("viewerHasKudos", false)
        thread {
            runCatching {
                val res = StrideAppContainer.api.toggleKudos(activityId, liked)
                act.put("kudosCount", res.optInt("kudosCount", act.optInt("kudosCount")))
                act.put("viewerHasKudos", res.optBoolean("viewerHasKudos", !liked))
                runOnUiThread {
                    val nowLiked = act.optBoolean("viewerHasKudos", false)
                    binding.btnDetailKudos.text = if (nowLiked) "${act.optInt("kudosCount")} Liked" else "${act.optInt("kudosCount")} Kudos"
                }
            }
        }
    }

    private fun sendComment() {
        val msg = binding.etDetailComment.text?.toString().orEmpty().trim()
        if (msg.isBlank()) return
        binding.btnDetailSendComment.isEnabled = false
        thread {
            runCatching {
                StrideAppContainer.api.addComment(activityId, msg)
                runOnUiThread {
                    binding.etDetailComment.setText("")
                    binding.btnDetailSendComment.isEnabled = true
                    loadDetail()
                }
            }.onFailure {
                runOnUiThread { binding.btnDetailSendComment.isEnabled = true }
            }
        }
    }

    private fun shareGpx() {
        thread {
            val xml = runCatching { StrideAppContainer.api.fetchActivityGpx(activityId) }.getOrNull()
            runOnUiThread {
                if (xml.isNullOrBlank()) {
                    Snackbar.make(binding.root, "GPX unavailable for manual activities.", Snackbar.LENGTH_SHORT).show()
                } else {
                    startActivity(
                        Intent.createChooser(
                            Intent(Intent.ACTION_SEND).apply {
                                type = "text/xml"
                                putExtra(Intent.EXTRA_TEXT, xml)
                            },
                            "Export Stride GPX"
                        )
                    )
                }
            }
        }
    }

    private fun openOwnerMenu() {
        val options = arrayOf("Visibility: Public", "Visibility: Followers", "Visibility: Private", "Create Segment from Route", "Delete Activity")
        MaterialAlertDialogBuilder(this)
            .setTitle("Activity Options")
            .setItems(options) { _, which ->
                when (which) {
                    0 -> patchVisibility("public")
                    1 -> patchVisibility("followers")
                    2 -> patchVisibility("private")
                    3 -> promptCreateSegment()
                    4 -> confirmDelete()
                }
            }
            .show()
    }

    private fun patchVisibility(vis: String) {
        thread {
            runCatching {
                StrideAppContainer.api.updateActivityVisibility(activityId, vis)
                runOnUiThread {
                    Snackbar.make(binding.root, "Visibility updated to $vis", Snackbar.LENGTH_SHORT).show()
                    loadDetail()
                }
            }
        }
    }

    private fun promptCreateSegment() {
        if (pointCount < 5) {
            Snackbar.make(binding.root, "Activity needs at least 5 GPS points.", Snackbar.LENGTH_SHORT).show()
            return
        }
        val etName = TextInputEditText(this).apply { hint = "Segment Name (3+ chars)" }
        MaterialAlertDialogBuilder(this)
            .setTitle("Create Segment")
            .setView(etName)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Create") { _, _ ->
                val name = etName.text?.toString().orEmpty().trim()
                if (name.length < 3) return@setPositiveButton
                val endIdx = max(4, pointCount - 1)
                thread {
                    runCatching {
                        StrideAppContainer.api.createSegment(activityId, name, 0, endIdx)
                        runOnUiThread {
                            Snackbar.make(binding.root, "Segment created!", Snackbar.LENGTH_SHORT).show()
                            loadDetail()
                        }
                    }.onFailure { err ->
                        runOnUiThread {
                            Snackbar.make(binding.root, err.message ?: "Could not create segment", Snackbar.LENGTH_LONG).show()
                        }
                    }
                }
            }
            .show()
    }

    private fun confirmDelete() {
        MaterialAlertDialogBuilder(this)
            .setTitle("Delete Activity?")
            .setMessage("This permanently removes the activity and its segment efforts.")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Delete") { _, _ ->
                thread {
                    runCatching {
                        StrideAppContainer.api.deleteActivity(activityId)
                        runOnUiThread { finish() }
                    }
                }
            }
            .show()
    }
}

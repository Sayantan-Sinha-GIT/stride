package com.stride.tracker.lite.ui

import android.os.Bundle
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.appcompat.app.AppCompatActivity
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.core.view.updatePadding
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.snackbar.Snackbar
import com.stride.tracker.lite.core.Formatters
import com.stride.tracker.lite.core.StrideAppContainer
import com.stride.tracker.lite.databinding.ActivitySegmentDetailBinding
import com.stride.tracker.lite.databinding.ItemLeaderboardRowBinding
import org.json.JSONObject
import kotlin.concurrent.thread

class SegmentDetailActivity : AppCompatActivity() {
    private lateinit var binding: ActivitySegmentDetailBinding
    private var segmentId = ""
    private var range = "all"
    private val entries = mutableListOf<JSONObject>()
    private lateinit var adapter: LbAdapter

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        StrideAppContainer.ensure(this)
        StrideAppContainer.applyThemeMode(StrideAppContainer.prefs.themeMode)
        binding = ActivitySegmentDetailBinding.inflate(layoutInflater)
        setContentView(binding.root)

        val dark = StrideAppContainer.isDarkActive(this)
        val ctrl = WindowInsetsControllerCompat(window, window.decorView)
        ctrl.isAppearanceLightStatusBars = !dark
        ctrl.isAppearanceLightNavigationBars = !dark
        ViewCompat.setOnApplyWindowInsetsListener(binding.root) { v, insets ->
            val sys = insets.getInsets(WindowInsetsCompat.Type.systemBars())
            binding.toolbarSegment.updatePadding(top = sys.top)
            v.updatePadding(bottom = sys.bottom)
            insets
        }

        segmentId = intent.getStringExtra("segmentId").orEmpty()
        binding.toolbarSegment.setNavigationOnClickListener { finish() }
        binding.mapSegmentDetail.setInteractive(true)

        adapter = LbAdapter(entries) { entry -> promptFlag(entry) }
        binding.rvLeaderboard.layoutManager = LinearLayoutManager(this)
        binding.rvLeaderboard.adapter = adapter

        binding.chipLbAll.setOnClickListener { switchRange("all") }
        binding.chipLbYear.setOnClickListener { switchRange("year") }
        binding.chipLbMonth.setOnClickListener { switchRange("month") }
        binding.chipLbFollowing.setOnClickListener { switchRange("following") }

        loadSegmentAndLeaderboard()
    }

    private fun switchRange(r: String) {
        range = r
        loadLeaderboard()
    }

    private fun loadSegmentAndLeaderboard() {
        thread {
            val detail = runCatching { StrideAppContainer.api.fetchSegmentDetail(segmentId) }.getOrNull()
            val seg = detail?.optJSONObject("segment")
            runOnUiThread {
                if (seg != null) {
                    val units = StrideAppContainer.prefs.units
                    binding.toolbarSegment.title = seg.optString("name", "Segment")
                    binding.tvSegDetailSubtitle.text = "${Formatters.distance(seg.optDouble("distance_m"), units)} · +${Formatters.elevation(seg.optDouble("elevation_gain_m"), units)} · ${seg.optString("city")} · ${seg.optInt("effort_count")} efforts"
                    binding.mapSegmentDetail.setEncodedPolyline(seg.optString("encoded_polyline"))
                }
            }
        }
        loadLeaderboard()
    }

    private fun loadLeaderboard() {
        val activeRange = range
        thread {
            val arr = runCatching { StrideAppContainer.api.fetchSegmentLeaderboard(segmentId, activeRange) }.getOrNull()
            runOnUiThread {
                if (arr != null) {
                    entries.clear()
                    for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { entries.add(it) }
                    adapter.notifyDataSetChanged()
                }
            }
        }
    }

    private fun promptFlag(entry: JSONObject) {
        val effortId = entry.optString("effort_id")
        if (effortId.isBlank()) return
        MaterialAlertDialogBuilder(this)
            .setTitle("Flag Effort?")
            .setMessage("Flag ${entry.optString("display_name")} (${Formatters.duration(entry.optInt("elapsed_time_s"))}) for unrealistic speed/GPS telemetry?")
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Flag Effort") { _, _ ->
                thread {
                    runCatching {
                        StrideAppContainer.api.flagSegmentEffort(effortId, "Suspected GPS anomaly or vehicle speed")
                        runOnUiThread {
                            Snackbar.make(binding.root, "Effort flagged for moderation review.", Snackbar.LENGTH_SHORT).show()
                        }
                    }
                }
            }
            .show()
    }

    private class LbAdapter(
        private val list: List<JSONObject>,
        private val onLongClick: (JSONObject) -> Unit
    ) : RecyclerView.Adapter<LbAdapter.VH>() {
        class VH(val b: ItemLeaderboardRowBinding) : RecyclerView.ViewHolder(b.root)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
            VH(ItemLeaderboardRowBinding.inflate(LayoutInflater.from(parent.context), parent, false))

        override fun getItemCount(): Int = list.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val e = list[position]
            holder.b.tvLbRank.text = "#${position + 1}"
            holder.b.tvLbAthlete.text = e.optString("display_name").ifBlank { e.optString("handle", "Athlete") }
            holder.b.tvLbMeta.text = "@${e.optString("handle")} · ${e.optString("started_at").take(10)}"
            holder.b.tvLbTime.text = Formatters.duration(e.optInt("elapsed_time_s"))
            holder.b.root.setOnLongClickListener {
                onLongClick(e)
                true
            }
        }
    }
}

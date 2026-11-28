package com.stride.tracker.lite.ui

import android.content.Intent
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.core.view.isVisible
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.snackbar.Snackbar
import com.stride.tracker.lite.core.Formatters
import com.stride.tracker.lite.core.LiteStrings
import com.stride.tracker.lite.core.StrideAppContainer
import com.stride.tracker.lite.databinding.FragmentExploreBinding
import com.stride.tracker.lite.databinding.ItemRouteCardBinding
import com.stride.tracker.lite.databinding.ItemSegmentCardBinding
import com.stride.tracker.lite.ui.views.HeatPoint
import org.json.JSONObject
import kotlin.concurrent.thread

class ExploreFragment : Fragment(), RefreshableTab {
    private var _binding: FragmentExploreBinding? = null
    private val binding get() = _binding!!
    private var mode = 0 // 0=segments, 1=routes, 2=heatmap
    private val rows = mutableListOf<JSONObject>()
    private lateinit var segAdapter: SegmentAdapter
    private lateinit var routeAdapter: RouteAdapter

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentExploreBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        segAdapter = SegmentAdapter(rows) { seg ->
            startActivity(Intent(requireContext(), SegmentDetailActivity::class.java).putExtra("segmentId", seg.optString("id")))
        }
        routeAdapter = RouteAdapter(rows) { route -> saveRoute(route) }

        binding.rvExplore.layoutManager = LinearLayoutManager(requireContext())
        binding.rvExplore.adapter = segAdapter
        binding.swipeExplore.setOnRefreshListener { refreshContent() }

        binding.btnExploreSegments.setOnClickListener { setMode(0) }
        binding.btnExploreRoutes.setOnClickListener { setMode(1) }
        binding.btnExploreHeatmap.setOnClickListener { setMode(2) }

        applyLabels()
        refreshContent()
    }

    private fun setMode(m: Int) {
        mode = m
        binding.heatmapPanel.isVisible = (m == 2)
        binding.swipeExplore.isVisible = (m != 2)
        binding.rvExplore.adapter = if (m == 0) segAdapter else routeAdapter
        refreshContent()
    }

    private fun applyLabels() {
        val lang = StrideAppContainer.prefs.language
        binding.btnExploreSegments.text = LiteStrings[lang, "segments"]
        binding.btnExploreRoutes.text = LiteStrings[lang, "routes"]
        binding.btnExploreHeatmap.text = LiteStrings[lang, "heatmap"]
    }

    override fun refreshContent() {
        val b = _binding ?: return
        applyLabels()
        b.swipeExplore.isRefreshing = true
        val activeMode = mode
        thread {
            when (activeMode) {
                0 -> {
                    val arr = runCatching { StrideAppContainer.api.fetchSegments() }.getOrNull()
                    b.root.post {
                        val cur = _binding ?: return@post
                        cur.swipeExplore.isRefreshing = false
                        if (arr != null) {
                            rows.clear()
                            for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { rows.add(it) }
                            segAdapter.notifyDataSetChanged()
                        }
                    }
                }
                1 -> {
                    val data = runCatching { StrideAppContainer.api.fetchNearbyRoutes() }.getOrNull()
                    b.root.post {
                        val cur = _binding ?: return@post
                        cur.swipeExplore.isRefreshing = false
                        if (data != null) {
                            rows.clear()
                            val acts = data.optJSONArray("activities")
                            if (acts != null) for (i in 0 until acts.length()) acts.optJSONObject(i)?.let { rows.add(it) }
                            val segs = data.optJSONArray("segments")
                            if (segs != null) for (i in 0 until segs.length()) segs.optJSONObject(i)?.let { rows.add(it) }
                            routeAdapter.notifyDataSetChanged()
                        }
                    }
                }
                else -> {
                    val data = runCatching { StrideAppContainer.api.fetchHeatmap() }.getOrNull()
                    b.root.post {
                        val cur = _binding ?: return@post
                        cur.swipeExplore.isRefreshing = false
                        val cells = data?.optJSONArray("cells")
                        val heats = mutableListOf<HeatPoint>()
                        if (cells != null) {
                            for (i in 0 until cells.length()) {
                                val c = cells.optJSONObject(i) ?: continue
                                heats.add(HeatPoint(c.optDouble("lat"), c.optDouble("lng"), c.optDouble("weight", 1.0).toFloat()))
                            }
                        }
                        cur.tvHeatmapSummary.text = "Anonymized public heatmap · ${heats.size} active grid cells (>= 3 athletes/cell enforced)"
                        cur.heatmapView.setInteractive(true)
                        cur.heatmapView.setHeatmapPoints(heats)
                    }
                }
            }
        }
    }

    private fun saveRoute(route: JSONObject) {
        thread {
            runCatching {
                StrideAppContainer.api.saveRoute(
                    name = route.optString("name", "Saved Route"),
                    activityType = route.optString("activityType", "run"),
                    distanceM = route.optDouble("distanceM", 0.0),
                    elevationGainM = route.optDouble("elevationGainM", 0.0),
                    encodedPolyline = route.optString("encodedPolyline")
                )
                view?.post { Snackbar.make(binding.root, "Route saved!", Snackbar.LENGTH_SHORT).show() }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    private class SegmentAdapter(
        private val list: List<JSONObject>,
        private val onClick: (JSONObject) -> Unit
    ) : RecyclerView.Adapter<SegmentAdapter.VH>() {
        class VH(val b: ItemSegmentCardBinding) : RecyclerView.ViewHolder(b.root)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
            VH(ItemSegmentCardBinding.inflate(LayoutInflater.from(parent.context), parent, false))

        override fun getItemCount(): Int = list.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val s = list[position]
            val units = StrideAppContainer.prefs.units
            val lang = StrideAppContainer.prefs.language
            val dist = s.optDouble("distance_m", 0.0)
            val efforts = s.optInt("effort_count", 0)
            val kom = s.optInt("kom_time_s", 0)
            holder.b.tvSegmentName.text = s.optString("name", "Segment")
            val effLabel = if (efforts == 1) "effort" else "efforts"
            holder.b.tvSegmentMeta.text = "${Formatters.distance(dist, units)} · ${Formatters.sportLabel(s.optString("activity_type"), lang)} · $efforts $effLabel"
            holder.b.tvSegmentKom.text = if (kom > 0) "KOM ${Formatters.duration(kom)}" else s.optString("city", "Stride")
            holder.b.mapSegmentThumb.setEncodedPolyline(s.optString("encoded_polyline"))
            holder.b.root.setOnClickListener { onClick(s) }
        }
    }

    private class RouteAdapter(
        private val list: List<JSONObject>,
        private val onSave: (JSONObject) -> Unit
    ) : RecyclerView.Adapter<RouteAdapter.VH>() {
        class VH(val b: ItemRouteCardBinding) : RecyclerView.ViewHolder(b.root)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
            VH(ItemRouteCardBinding.inflate(LayoutInflater.from(parent.context), parent, false))

        override fun getItemCount(): Int = list.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val r = list[position]
            val units = StrideAppContainer.prefs.units
            val lang = StrideAppContainer.prefs.language
            holder.b.tvRouteName.text = r.optString("name", "Route")
            holder.b.tvRouteMeta.text = "${Formatters.distance(r.optDouble("distanceM"), units)} · +${Formatters.elevation(r.optDouble("elevationGainM"), units)} · ${r.optString("city")}"
            holder.b.btnSaveRoute.text = LiteStrings[lang, "save"]
            holder.b.mapRouteThumb.setEncodedPolyline(r.optString("encodedPolyline"))
            holder.b.btnSaveRoute.setOnClickListener { onSave(r) }
        }
    }
}

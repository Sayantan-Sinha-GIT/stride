package com.stride.tracker.lite.ui

import android.content.Intent
import android.graphics.drawable.GradientDrawable
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.view.isVisible
import androidx.fragment.app.Fragment
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.google.android.material.button.MaterialButton
import com.google.android.material.dialog.MaterialAlertDialogBuilder
import com.google.android.material.textfield.TextInputEditText
import com.stride.tracker.lite.R
import com.stride.tracker.lite.core.Formatters
import com.stride.tracker.lite.core.LiteStrings
import com.stride.tracker.lite.core.StrideAppContainer
import com.stride.tracker.lite.databinding.FragmentFeedBinding
import com.stride.tracker.lite.databinding.ItemActivityCardBinding
import org.json.JSONObject
import kotlin.concurrent.thread

interface RefreshableTab {
    fun refreshContent()
}

class FeedFragment : Fragment(), RefreshableTab {
    private var _binding: FragmentFeedBinding? = null
    private val binding get() = _binding!!
    private var scope = "following"
    private val items = mutableListOf<JSONObject>()
    private lateinit var adapter: ActivityAdapter

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentFeedBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        adapter = ActivityAdapter(
            items = items,
            onOpenDetail = { obj ->
                startActivity(Intent(requireContext(), ActivityDetailActivity::class.java).putExtra("activityId", obj.optString("id")))
            },
            onToggleKudos = { pos, obj -> toggleKudos(pos, obj) },
            onOpenComments = { pos, obj -> openCommentsSheet(pos, obj) },
            onOpenAuthor = { handle -> openAuthorSheet(handle) }
        )
        binding.rvFeed.layoutManager = LinearLayoutManager(requireContext())
        binding.rvFeed.adapter = adapter
        binding.swipeFeed.setOnRefreshListener { refreshContent() }

        binding.chipFeedFollowing.setOnClickListener { switchScope("following") }
        binding.chipFeedExplore.setOnClickListener { switchScope("explore") }
        binding.chipFeedMine.setOnClickListener { switchScope("mine") }

        applyLocalizedLabels()
        refreshContent()
    }

    private fun switchScope(next: String) {
        scope = next
        refreshContent()
    }

    private fun applyLocalizedLabels() {
        val lang = StrideAppContainer.prefs.language
        binding.chipFeedFollowing.text = LiteStrings[lang, "following"]
        binding.chipFeedExplore.text = LiteStrings[lang, "explore"]
        binding.chipFeedMine.text = LiteStrings[lang, "myActivities"]
        binding.tvFeedEmpty.text = LiteStrings[lang, "noItems"]
    }

    override fun refreshContent() {
        val b = _binding ?: return
        applyLocalizedLabels()
        b.swipeFeed.isRefreshing = true
        val activeScope = scope
        thread {
            val loaded = runCatching {
                val arr = StrideAppContainer.api.fetchFeed(activeScope)
                List(arr.length()) { arr.optJSONObject(it) }.filterNotNull()
            }.getOrNull()
            b.root.post {
                val cur = _binding ?: return@post
                cur.swipeFeed.isRefreshing = false
                if (loaded != null) {
                    items.clear()
                    items.addAll(loaded)
                    adapter.notifyDataSetChanged()
                    cur.tvFeedEmpty.isVisible = items.isEmpty()
                    (activity as? com.stride.tracker.lite.MainActivity)?.updateCachePill()
                } else if (items.isEmpty()) {
                    cur.tvFeedEmpty.isVisible = true
                }
            }
        }
    }

    private fun toggleKudos(pos: Int, item: JSONObject) {
        val id = item.optString("id")
        val liked = item.optBoolean("viewerHasKudos", false)
        thread {
            runCatching {
                val res = StrideAppContainer.api.toggleKudos(id, liked)
                item.put("kudosCount", res.optInt("kudosCount", item.optInt("kudosCount")))
                item.put("viewerHasKudos", res.optBoolean("viewerHasKudos", !liked))
                _binding?.root?.post { adapter.notifyItemChanged(pos) }
            }
        }
    }

    private fun openCommentsSheet(pos: Int, item: JSONObject) {
        val ctx = context ?: return
        val id = item.optString("id")
        val sheet = BottomSheetDialog(ctx)
        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (resources.displayMetrics.density * 18).toInt()
            setPadding(pad, pad, pad, pad)
        }
        val titleTv = TextView(ctx).apply {
            text = LiteStrings[StrideAppContainer.prefs.language, "comments"]
            textSize = 18f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(ctx.getColor(R.color.stride_text_primary))
        }
        val listBox = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
        val inputRow = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            val top = (resources.displayMetrics.density * 10).toInt()
            setPadding(0, top, 0, 0)
        }
        val etComment = TextInputEditText(ctx).apply {
            hint = "Write a comment..."
            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
        }
        val btnSend = MaterialButton(ctx).apply { text = "Send" }
        inputRow.addView(etComment)
        inputRow.addView(btnSend)
        root.addView(titleTv)
        root.addView(listBox)
        root.addView(inputRow)
        sheet.setContentView(root)
        sheet.show()

        fun renderComments(arr: org.json.JSONArray?) {
            listBox.removeAllViews()
            if (arr == null || arr.length() == 0) {
                listBox.addView(TextView(ctx).apply {
                    text = "No comments yet."
                    setPadding(0, 12, 0, 12)
                    setTextColor(ctx.getColor(R.color.stride_text_secondary))
                })
                return
            }
            for (i in 0 until arr.length()) {
                val cm = arr.optJSONObject(i) ?: continue
                val author = cm.optString("display_name").ifBlank { cm.optString("handle", "Athlete") }
                listBox.addView(TextView(ctx).apply {
                    text = "$author: ${cm.optString("body")}"
                    setPadding(0, 8, 0, 8)
                    setTextColor(ctx.getColor(R.color.stride_text_primary))
                })
            }
        }

        thread {
            val detail = runCatching { StrideAppContainer.api.fetchActivityDetail(id) }.getOrNull()
            root.post { renderComments(detail?.optJSONArray("comments")) }
        }

        btnSend.setOnClickListener {
            val text = etComment.text?.toString().orEmpty().trim()
            if (text.isBlank()) return@setOnClickListener
            btnSend.isEnabled = false
            thread {
                runCatching {
                    StrideAppContainer.api.addComment(id, text)
                    val fresh = StrideAppContainer.api.fetchActivityDetail(id)
                    item.put("commentCount", item.optInt("commentCount") + 1)
                    root.post {
                        etComment.setText("")
                        btnSend.isEnabled = true
                        renderComments(fresh.optJSONArray("comments"))
                        adapter.notifyItemChanged(pos)
                    }
                }.onFailure {
                    root.post { btnSend.isEnabled = true }
                }
            }
        }
    }

    private fun openAuthorSheet(handle: String) {
        if (handle.isBlank()) return
        val ctx = context ?: return
        thread {
            val data = runCatching { StrideAppContainer.api.fetchUserProfile(handle) }.getOrNull() ?: return@thread
            val prof = data.optJSONObject("profile") ?: return@thread
            view?.post {
                val uid = prof.optString("id")
                var following = prof.optString("followStatus") == "accepted" || prof.optString("followStatus") == "pending"
                val dlg = MaterialAlertDialogBuilder(ctx)
                    .setTitle("${prof.optString("displayName")} (@$handle)")
                    .setMessage(
                        "${prof.optString("homeCity")}\n" +
                            "Followers: ${prof.optInt("followersCount")} · Following: ${prof.optInt("followingCount")}\n" +
                            prof.optString("bio")
                    )
                    .setNegativeButton("Close", null)
                    .setPositiveButton(if (following) "Unfollow" else "Follow") { _, _ ->
                        thread { runCatching { StrideAppContainer.api.toggleFollow(uid, following) } }
                    }
                dlg.show()
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    private class ActivityAdapter(
        private val items: List<JSONObject>,
        private val onOpenDetail: (JSONObject) -> Unit,
        private val onToggleKudos: (Int, JSONObject) -> Unit,
        private val onOpenComments: (Int, JSONObject) -> Unit,
        private val onOpenAuthor: (String) -> Unit
    ) : RecyclerView.Adapter<ActivityAdapter.VH>() {

        class VH(val b: ItemActivityCardBinding) : RecyclerView.ViewHolder(b.root)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val b = ItemActivityCardBinding.inflate(LayoutInflater.from(parent.context), parent, false)
            return VH(b)
        }

        override fun getItemCount(): Int = items.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val item = items[position]
            val lang = StrideAppContainer.prefs.language
            val units = StrideAppContainer.prefs.units
            val b = holder.b
            val author = item.optJSONObject("author")
            val name = author?.optString("displayName")?.ifBlank { author.optString("handle") } ?: "Athlete"
            val handle = author?.optString("handle").orEmpty()
            val sport = item.optString("activityType", "run")
            val dist = item.optDouble("distanceM", 0.0)
            val movingS = item.optInt("movingTimeS", 0)
            val elev = item.optDouble("elevationGainM", 0.0)
            val kudos = item.optInt("kudosCount", 0)
            val comments = item.optInt("commentCount", 0)
            val liked = item.optBoolean("viewerHasKudos", false)
            val poly = item.optString("encodedPolyline")

            b.tvAvatar.text = name.firstOrNull()?.uppercase() ?: "S"
            (b.tvAvatar.background.mutate() as? GradientDrawable)?.setColor(Formatters.avatarColor(handle.ifBlank { name }))
            b.tvAuthorName.text = name
            b.tvAuthorMeta.text = "${if (handle.isNotBlank()) "@$handle · " else ""}${item.optString("startedAt").take(10)}"
            b.tvSportBadge.text = Formatters.sportLabel(sport, lang).uppercase()
            b.tvActivityTitle.text = item.optString("title", "Activity")

            b.lblDist.text = LiteStrings[lang, "distance"]
            b.lblTime.text = LiteStrings[lang, "time"]
            b.lblPace.text = LiteStrings[lang, "pace"]
            b.lblElev.text = LiteStrings[lang, "gain"]

            b.tvDistance.text = Formatters.distance(dist, units)
            b.tvDuration.text = Formatters.duration(movingS)
            b.tvPace.text = Formatters.paceOrSpeed(dist, movingS, sport, units)
            b.tvElevation.text = Formatters.elevation(elev, units)

            b.routePreview.isVisible = poly.isNotBlank()
            if (poly.isNotBlank()) b.routePreview.setEncodedPolyline(poly)

            b.btnKudos.text = if (liked) "$kudos Liked" else "$kudos"
            b.btnComments.text = "$comments"
            b.btnViewDetail.text = LiteStrings[lang, "details"]

            b.root.setOnClickListener { onOpenDetail(item) }
            b.btnViewDetail.setOnClickListener { onOpenDetail(item) }
            b.tvAuthorName.setOnClickListener { onOpenAuthor(handle) }
            b.tvAvatar.setOnClickListener { onOpenAuthor(handle) }
            b.btnKudos.setOnClickListener { onToggleKudos(position, item) }
            b.btnComments.setOnClickListener { onOpenComments(position, item) }
        }
    }
}

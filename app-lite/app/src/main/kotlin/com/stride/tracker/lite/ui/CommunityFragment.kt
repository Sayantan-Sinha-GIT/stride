package com.stride.tracker.lite.ui

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
import com.google.android.material.snackbar.Snackbar
import com.google.android.material.textfield.TextInputEditText
import com.stride.tracker.lite.R
import com.stride.tracker.lite.core.Formatters
import com.stride.tracker.lite.core.LiteStrings
import com.stride.tracker.lite.core.StrideAppContainer
import com.stride.tracker.lite.databinding.FragmentCommunityBinding
import com.stride.tracker.lite.databinding.ItemChallengeCardBinding
import com.stride.tracker.lite.databinding.ItemClubCardBinding
import org.json.JSONObject
import kotlin.concurrent.thread
import kotlin.math.roundToInt

class CommunityFragment : Fragment(), RefreshableTab {
    private var _binding: FragmentCommunityBinding? = null
    private val binding get() = _binding!!
    private var mode = 0 // 0=clubs, 1=challenges
    private val rows = mutableListOf<JSONObject>()
    private lateinit var clubAdapter: ClubAdapter
    private lateinit var challengeAdapter: ChallengeAdapter

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentCommunityBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        clubAdapter = ClubAdapter(
            list = rows,
            onOpenClub = { club -> openClubDetailSheet(club) },
            onToggleJoin = { club -> toggleClubJoin(club) }
        )
        challengeAdapter = ChallengeAdapter(rows) { ch -> toggleChallengeJoin(ch) }

        binding.rvCommunity.layoutManager = LinearLayoutManager(requireContext())
        binding.rvCommunity.adapter = clubAdapter
        binding.swipeCommunity.setOnRefreshListener { refreshContent() }

        binding.btnCommunityClubs.setOnClickListener { switchMode(0) }
        binding.btnCommunityChallenges.setOnClickListener { switchMode(1) }
        binding.btnCreateCommunityItem.setOnClickListener { openCreateClubDialog() }

        applyLabels()
        refreshContent()
    }

    private fun switchMode(m: Int) {
        mode = m
        binding.btnCreateCommunityItem.isVisible = (m == 0)
        binding.rvCommunity.adapter = if (m == 0) clubAdapter else challengeAdapter
        refreshContent()
    }

    private fun applyLabels() {
        val lang = StrideAppContainer.prefs.language
        binding.btnCommunityClubs.text = LiteStrings[lang, "clubs"]
        binding.btnCommunityChallenges.text = LiteStrings[lang, "challenges"]
    }

    override fun refreshContent() {
        val b = _binding ?: return
        applyLabels()
        b.swipeCommunity.isRefreshing = true
        val activeMode = mode
        thread {
            val arr = runCatching {
                if (activeMode == 0) StrideAppContainer.api.fetchClubs() else StrideAppContainer.api.fetchChallenges()
            }.getOrNull()
            b.root.post {
                val cur = _binding ?: return@post
                cur.swipeCommunity.isRefreshing = false
                if (arr != null) {
                    rows.clear()
                    for (i in 0 until arr.length()) arr.optJSONObject(i)?.let { rows.add(it) }
                    if (activeMode == 0) clubAdapter.notifyDataSetChanged() else challengeAdapter.notifyDataSetChanged()
                }
            }
        }
    }

    private fun toggleClubJoin(club: JSONObject) {
        val id = club.optString("id")
        val status = club.optString("membership_status")
        val joined = status == "accepted" || status == "pending"
        thread {
            runCatching {
                StrideAppContainer.api.toggleClubMembership(id, joined)
                refreshContent()
            }
        }
    }

    private fun toggleChallengeJoin(ch: JSONObject) {
        val id = ch.optString("id")
        val joined = ch.optBoolean("viewer_joined", false)
        thread {
            runCatching {
                StrideAppContainer.api.toggleChallengeMembership(id, joined)
                refreshContent()
            }
        }
    }

    private fun openCreateClubDialog() {
        val ctx = requireContext()
        val col = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (resources.displayMetrics.density * 18).toInt()
            setPadding(pad, pad / 2, pad, 0)
        }
        val etName = TextInputEditText(ctx).apply { hint = "Club Name (3+ chars)" }
        val etCity = TextInputEditText(ctx).apply {
            hint = "City"
            setText("Bengaluru")
        }
        col.addView(etName)
        col.addView(etCity)

        MaterialAlertDialogBuilder(ctx)
            .setTitle("Create Club")
            .setView(col)
            .setNegativeButton("Cancel", null)
            .setPositiveButton("Create") { _, _ ->
                val name = etName.text.toString().trim()
                val city = etCity.text.toString().trim()
                if (name.length < 3) return@setPositiveButton
                thread {
                    runCatching {
                        StrideAppContainer.api.createClub(name, city, "all")
                        refreshContent()
                    }
                }
            }
            .show()
    }

    private fun openClubDetailSheet(club: JSONObject) {
        val ctx = context ?: return
        val slug = club.optString("slug").ifBlank { club.optString("id") }
        val sheet = BottomSheetDialog(ctx)
        val root = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            val pad = (resources.displayMetrics.density * 18).toInt()
            setPadding(pad, pad, pad, pad)
        }
        val tvTitle = TextView(ctx).apply {
            text = club.optString("name")
            textSize = 19f
            setTypeface(null, android.graphics.Typeface.BOLD)
            setTextColor(ctx.getColor(R.color.stride_text_primary))
        }
        val tvBody = TextView(ctx).apply {
            text = "Loading club details..."
            setPadding(0, 8, 0, 10)
            setTextColor(ctx.getColor(R.color.stride_text_secondary))
        }
        val eventsBox = LinearLayout(ctx).apply { orientation = LinearLayout.VERTICAL }
        root.addView(tvTitle)
        root.addView(tvBody)
        root.addView(eventsBox)
        sheet.setContentView(root)
        sheet.show()

        thread {
            val detail = runCatching { StrideAppContainer.api.fetchClubDetail(slug) }.getOrNull() ?: return@thread
            root.post {
                val cObj = detail.optJSONObject("club") ?: club
                val members = detail.optJSONArray("members")?.length() ?: cObj.optInt("member_count")
                val feedLen = detail.optJSONArray("feed")?.length() ?: 0
                tvBody.text = "${cObj.optString("city")} · $members members · $feedLen recent public activities\n${cObj.optString("description")}"
                eventsBox.removeAllViews()
                val events = detail.optJSONArray("events")
                if (events != null && events.length() > 0) {
                    for (i in 0 until events.length()) {
                        val ev = events.optJSONObject(i) ?: continue
                        val evId = ev.optString("id")
                        var going = ev.optBoolean("viewer_going", false)
                        val row = LinearLayout(ctx).apply {
                            orientation = LinearLayout.HORIZONTAL
                            setPadding(0, 8, 0, 8)
                        }
                        val evTv = TextView(ctx).apply {
                            text = "${ev.optString("title")}\n${ev.optString("starts_at").take(16).replace('T', ' ')}"
                            layoutParams = LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f)
                            setTextColor(ctx.getColor(R.color.stride_text_primary))
                        }
                        val rsvpBtn = MaterialButton(ctx).apply {
                            text = if (going) "Going" else "RSVP"
                            setOnClickListener {
                                val next = !going
                                thread {
                                    runCatching {
                                        StrideAppContainer.api.rsvpEvent(evId, next)
                                        going = next
                                        root.post { text = if (going) "Going" else "RSVP" }
                                    }
                                }
                            }
                        }
                        row.addView(evTv)
                        row.addView(rsvpBtn)
                        eventsBox.addView(row)
                    }
                } else {
                    eventsBox.addView(TextView(ctx).apply {
                        text = "No upcoming events."
                        setTextColor(ctx.getColor(R.color.stride_text_secondary))
                    })
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }

    private class ClubAdapter(
        private val list: List<JSONObject>,
        private val onOpenClub: (JSONObject) -> Unit,
        private val onToggleJoin: (JSONObject) -> Unit
    ) : RecyclerView.Adapter<ClubAdapter.VH>() {
        class VH(val b: ItemClubCardBinding) : RecyclerView.ViewHolder(b.root)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
            VH(ItemClubCardBinding.inflate(LayoutInflater.from(parent.context), parent, false))

        override fun getItemCount(): Int = list.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val c = list[position]
            val lang = StrideAppContainer.prefs.language
            val name = c.optString("name", "Club")
            val status = c.optString("membership_status")
            val joined = status == "accepted" || status == "pending"

            holder.b.tvClubAvatar.text = name.firstOrNull()?.uppercase() ?: "C"
            (holder.b.tvClubAvatar.background.mutate() as? GradientDrawable)?.setColor(Formatters.avatarColor(name))
            holder.b.tvClubName.text = name
            val mCount = c.optInt("member_count")
            val mLabel = if (mCount == 1) "member" else "members"
            holder.b.tvClubMeta.text = "${c.optString("city")} · ${Formatters.sportLabel(c.optString("sport_focus"), lang)} · $mCount $mLabel"
            holder.b.btnClubJoin.text = if (joined) LiteStrings[lang, "joined"] else LiteStrings[lang, "join"]
            holder.b.root.setOnClickListener { onOpenClub(c) }
            holder.b.btnClubJoin.setOnClickListener { onToggleJoin(c) }
        }
    }

    private class ChallengeAdapter(
        private val list: List<JSONObject>,
        private val onToggleJoin: (JSONObject) -> Unit
    ) : RecyclerView.Adapter<ChallengeAdapter.VH>() {
        class VH(val b: ItemChallengeCardBinding) : RecyclerView.ViewHolder(b.root)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH =
            VH(ItemChallengeCardBinding.inflate(LayoutInflater.from(parent.context), parent, false))

        override fun getItemCount(): Int = list.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val ch = list[position]
            val lang = StrideAppContainer.prefs.language
            val units = StrideAppContainer.prefs.units
            val joined = ch.optBoolean("viewer_joined", false)
            val progress = ch.optDouble("viewer_progress", 0.0)
            val target = ch.optDouble("target_value", 1.0).coerceAtLeast(1.0)
            val pct = ((progress / target) * 100.0).roundToInt().coerceIn(0, 100)

            holder.b.tvChallengeTitle.text = ch.optString("title", "Challenge")
            holder.b.tvChallengeMeta.text = "${ch.optInt("participant_count")} athletes · $pct% (${Formatters.distance(progress, units)} / ${Formatters.distance(target, units)})"
            holder.b.progressChallenge.progress = pct
            holder.b.btnChallengeJoin.text = if (joined) LiteStrings[lang, "joined"] else LiteStrings[lang, "join"]
            holder.b.btnChallengeJoin.setOnClickListener { onToggleJoin(ch) }
        }
    }
}

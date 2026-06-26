# Overnight absorb — summarize staged videos on the Claude subscription

You are running unattended (scheduled, overnight). Do **ONE batch (~20 videos)**, be concise, then **STOP**.
Do not loop. This uses the Claude subscription, not the Anthropic API.

## Step 1 — stage transcripts (free, no API)
Run once:

```
node scripts/absorb.mjs --keep --no-llm --max 20
```

It writes up to 20 new valuable-bucket videos into
`C:\Users\vinic\Documents\Second Brain\05 - Knowledge\Absorbed\`
as notes containing the marker `⏳ AI summary pending`, each with the full transcript at the bottom.
(If it prints "Nothing new to absorb", there's nothing pending — stop here.)

## Step 2 — summarize each pending note (the subscription work)
Glob that folder for notes containing `⏳ AI summary pending`. For EACH (up to 20):

1. Read the note; find the `## 📝 Full transcript` section.
2. Edit the note to match the format of an already-summarized note in the same folder:
   - A one-line italic `*…*` summary right under the `> 🎬 …` line.
   - `## ⚡ Key points` — replace the pending bullet with **6–8 crisp, specific takeaways** (real insights +
     numbers, not fluff).
   - `## 🎯 Why it matters to you` — 1–2 sentences tying it to the operator's goals (**government contracting
     is #1**; also his other businesses, real estate, health, and building AI systems). "General interest" if none.
   - In the frontmatter set `worth_it:` to yes/skim/skip and fill `tags:` with 3–6 lowercase topic tags.
3. Append the video id (the `v=` value from the note's `url:`) as a key in `scripts/.absorb-done.json` with
   value `true`, so it's never reprocessed.

## Step 3 — stop
Print how many you summarized. Do **not** start another batch.

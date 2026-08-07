# AppSumo demo — voiceover script

**Record it naturally. Do not try to hit these timestamps.**

The timings below are what the video currently does, so you know roughly how much room each line has.
But every hold in `appsumo-demo.json` is a number I can change, so once you send me the audio I conform
the *video* to *your* delivery, not the other way round. Pause where you'd naturally pause.

- ~75 words, lands around 45–50 seconds at a normal pace.
- Every figure here came out of the product on 2026-08-06 and is asserted by the recorder. If any of
  them stops being true the run fails before it can render, so you can read them without checking.

---

## The script

> **[0:00 — the calculator, nothing typed yet]**
> Every calculator tells you a deal is bad.

> **[0:05 — the asking price goes in, the page recalculates]**
> This one tells you what would make it good.

> **[0:10 — score lands on 22, red]**
> Twenty-two. F. Walk away.
> It loses fifteen thousand dollars.

> **[0:17 — scroll to the cost breakdown]**
> Here is the part nobody else does.

> **[0:21 — the max offer line lights up]**
> It gives you the number.
> Buy it at a hundred and twenty-five thousand.

> **[0:28 — that price is typed in]**
> Same house. Same rehab. Same sale price.

> **[0:33 — score swings to 95, green]**
> Ninety-five. A.
> Ninety-seven thousand in profit.

> **[0:39 — hold on the green]**
> That is not a verdict. That is an offer.

> **[0:44 — the free calculators]**
> Free to try. Pay once, own it for life.

---

## Reading notes

- **Flat, not excited.** The numbers do the selling. An enthusiastic read on a 22/F makes it sound
  like an infomercial and undoes the credibility the asserts bought.
- **The two beats that matter** are "Here is the part nobody else does" and "That is not a verdict.
  That is an offer." Land those. Everything else can be plain.
- **Say the price once.** It is in the video, on screen, at the same moment. Don't repeat it later.
- Read "twenty-two", "ninety-five" as words, not "two two".
- Leave about a second of silence at the top and tail so I have something to trim into.

## Recording

Anything is fine as long as it is clean. If you have a choice:

- WAV or MP3, mono, 48kHz. Phone voice memos are acceptable, a USB mic is better.
- Quiet room, no fan or AC. Six to twelve inches off the mic, slightly off-axis so the plosives miss it.
- One take per line is fine, I'll assemble. Flub a line, just pause and say it again, I'll take the
  second one.
- Don't add music, reverb, or noise reduction. I'll level it, de-ess it, and duck the SFX under it.

Drop the file anywhere and tell me the path. `out/appsumo/` is as good a place as any.

## What I do with it

1. Level and trim your take.
2. Re-time every hold in `appsumo-demo.json` so the visual beat lands under the right line.
3. Re-run the recorder, which re-checks every number against the live product before it renders.
4. Mix: your voice up front, the UI sound effects tucked underneath it.

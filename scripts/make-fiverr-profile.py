# Generates a professional creative-services profile/portfolio PDF for Fiverr.
# Honest by design: skills, tools, process, deliverables — no fabricated clients or reviews.
# Edit the dicts below, then: python scripts/make-fiverr-profile.py
from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib import colors
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle,
                                HRFlowable, ListFlowable, ListItem)
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER

# ── EDIT THESE ───────────────────────────────────────────────────────────────
BRAND   = "Rodgate Creative"
TAGLINE = "Design, Content & Image Services"
NAME    = "Vinicio Rodriguez"
EMAIL   = "rodgategroup@gmail.com"
PORTFOLIO_NOTE = "Live samples available on request and in my Fiverr gig gallery."
OUTFILE = r"C:\Users\vinic\Desktop\jarvis\fiverr-assets\Rodgate-Creative-Profile.pdf"
# ─────────────────────────────────────────────────────────────────────────────

INK   = colors.HexColor("#1B2450")
GOLD  = colors.HexColor("#B8860B")
DIM   = colors.HexColor("#555B7A")
LINE  = colors.HexColor("#C9CEE2")

services = [
    ("YouTube Thumbnails",
     "Scroll-stopping, high-CTR thumbnails built for the algorithm and the click.",
     ["2–3 concept directions per order", "Bold focal subject, readable text, brand-consistent color",
      "A/B variants on request", "1080p PNG + source file", "Sized for YouTube (1280×720) and Shorts"],
     "Photoshop, generative tooling, type & color systems"),
    ("Book & eBook Covers",
     "Genre-accurate covers that look at home on Amazon and the shelf.",
     ["Front cover (eBook) or full wrap (print: front, spine, back)", "Genre-matched typography & mood",
      "KDP / IngramSpark-ready specs & bleed", "Print-ready PDF + JPG/PNG", "Up to 2 revision rounds"],
     "Photoshop, InDesign, licensed/AI imagery with usage rights"),
    ("SEO Blog Articles",
     "Search-optimized, genuinely readable articles that rank and convert.",
     ["Keyword & search-intent research", "Structured H2/H3 outline + meta title & description",
      "Original, fact-checked copy in your brand voice", "Internal-link suggestions",
      "Delivered in Google Doc / Markdown / HTML"],
     "Keyword research tools, SEO best practices, human editing pass"),
    ("Landing Pages & HTML",
     "Clean, fast, mobile-first pages built to convert visitors into action.",
     ["Single responsive landing page (HTML/CSS)", "Conversion-focused layout & clear CTA",
      "Mobile + desktop tested", "Lightweight, fast-loading code", "Easy-to-edit handoff files"],
     "HTML5, CSS, responsive frameworks, basic JS"),
    ("Photo Cleanup & Editing",
     "Professional retouching and product-photo edits with fast turnaround.",
     ["Background removal / replacement", "Blemish, object & distraction removal",
      "Color, exposure & white-balance correction", "Product-photo cleanup for e-commerce",
      "High-res export, web or print"],
     "Photoshop, Lightroom, AI-assisted retouching"),
]

doc = SimpleDocTemplate(OUTFILE, pagesize=LETTER,
                        topMargin=0.7*inch, bottomMargin=0.7*inch,
                        leftMargin=0.8*inch, rightMargin=0.8*inch)
ss = getSampleStyleSheet()
H1   = ParagraphStyle("H1", parent=ss["Title"], textColor=INK, fontSize=26, spaceAfter=2, leading=30)
TAG  = ParagraphStyle("TAG", parent=ss["Normal"], textColor=GOLD, fontSize=12, alignment=TA_CENTER,
                      spaceAfter=2)
CON  = ParagraphStyle("CON", parent=ss["Normal"], textColor=DIM, fontSize=9.5, alignment=TA_CENTER,
                      spaceAfter=10)
INTRO= ParagraphStyle("INTRO", parent=ss["Normal"], fontSize=10.5, leading=15, textColor=INK, spaceAfter=14)
SVC  = ParagraphStyle("SVC", parent=ss["Heading2"], textColor=INK, fontSize=13.5, spaceBefore=8, spaceAfter=1)
SUB  = ParagraphStyle("SUB", parent=ss["Normal"], textColor=DIM, fontSize=10, italic=True, leading=13, spaceAfter=4)
LI   = ParagraphStyle("LI", parent=ss["Normal"], fontSize=9.7, leading=13, textColor=INK)
TOOL = ParagraphStyle("TOOL", parent=ss["Normal"], fontSize=8.8, leading=12, textColor=GOLD, spaceAfter=2)
FOOT = ParagraphStyle("FOOT", parent=ss["Normal"], fontSize=9, leading=13, textColor=DIM, alignment=TA_CENTER)

S = []
S.append(Paragraph(BRAND, H1))
S.append(Paragraph(TAGLINE, TAG))
S.append(Paragraph(f"{NAME} &nbsp;·&nbsp; {EMAIL}", CON))
S.append(HRFlowable(width="100%", color=GOLD, thickness=1.4, spaceAfter=12))
S.append(Paragraph(
    "I help creators and small businesses ship polished visual and written assets — fast, "
    "on-brief, and revision-friendly. Every order includes a short brief check, original work "
    "delivered in ready-to-use formats, and clear communication from kickoff to handoff. "
    "Below is what I offer and how I work.", INTRO))

for title, sub, bullets, tools in services:
    S.append(Paragraph(title, SVC))
    S.append(Paragraph(sub, SUB))
    items = [ListItem(Paragraph(b, LI), leftIndent=6) for b in bullets]
    S.append(ListFlowable(items, bulletType="bullet", bulletColor=GOLD, leftIndent=10, bulletFontSize=7))
    S.append(Paragraph(f"Tools & method: {tools}", TOOL))
    S.append(HRFlowable(width="100%", color=LINE, thickness=0.6, spaceBefore=6, spaceAfter=4))

S.append(Spacer(1, 8))
S.append(Paragraph("How I work", SVC))
work = ["Brief check first — I confirm scope before starting so the first draft lands right.",
        "2–3 options on visual gigs; one strong draft on writing gigs.",
        "Every deliverable reviewed before it reaches you — no raw, unchecked output.",
        "Clear revision rounds included; extras quoted up front, never sprung on you.",
        "You own full rights to the final delivered work."]
S.append(ListFlowable([ListItem(Paragraph(w, LI), leftIndent=6) for w in work],
                      bulletType="bullet", bulletColor=GOLD, leftIndent=10, bulletFontSize=7))
S.append(Spacer(1, 14))
S.append(HRFlowable(width="100%", color=GOLD, thickness=1.0, spaceAfter=8))
S.append(Paragraph(PORTFOLIO_NOTE + f"  &nbsp;|&nbsp;  Contact: {EMAIL}", FOOT))

doc.build(S)
print("Wrote", OUTFILE)

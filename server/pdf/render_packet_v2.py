#!/usr/bin/env python3
# server/pdf/render_packet_v2.py
# PDF renderer v3:
# - Markdown-ish narrative
# - Bookmarks/Outline
# - Optional separator pages
# - Optional exhibit summary page per exhibit (THIS UPGRADE)

import json
import sys
from datetime import datetime

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    ListFlowable, ListItem, Preformatted
)

def safe(v, default=""):
    if v is None:
        return default
    return str(v)

def fmt_date(s):
    if not s:
        return ""
    try:
        return str(s)[:10]
    except Exception:
        return str(s)

def sanitize_text(s):
    s = safe(s)
    return (s.replace("&", "&amp;")
             .replace("<", "&lt;")
             .replace(">", "&gt;"))

def header_footer(canvas, doc, title):
    canvas.saveState()
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.grey)
    canvas.drawString(0.75 * inch, 0.5 * inch, title)
    canvas.drawRightString(7.75 * inch, 0.5 * inch, f"Page {doc.page}")
    canvas.restoreState()

def bookmark_key(prefix, idx=None):
    return f"{prefix}{'' if idx is None else '_' + str(idx)}"

def md_to_flowables(md_text, styles):
    text = safe(md_text).replace("\r\n", "\n").replace("\r", "\n")
    lines = text.split("\n")

    flow = []
    buf_para = []
    buf_bullets = []
    buf_nums = []
    in_code = False
    code_lines = []

    def flush_para():
        nonlocal buf_para
        if buf_para:
            p = "\n".join(buf_para).strip()
            if p:
                p = sanitize_text(p)
                p = p.replace("**", "§§BOLD§§")
                parts = p.split("§§BOLD§§")
                out = []
                bold = False
                for seg in parts:
                    out.append(f"<b>{seg}</b>" if bold else seg)
                    bold = not bold
                p = "".join(out).replace("\n", "<br/>")
                flow.append(Paragraph(p, styles["Body"]))
                flow.append(Spacer(1, 0.10 * inch))
        buf_para = []

    def flush_bullets():
        nonlocal buf_bullets
        if buf_bullets:
            items = []
            for b in buf_bullets:
                s = sanitize_text(b).replace("**", "§§BOLD§§")
                parts = s.split("§§BOLD§§")
                out = []
                bold = False
                for seg in parts:
                    out.append(f"<b>{seg}</b>" if bold else seg)
                    bold = not bold
                items.append(ListItem(Paragraph("".join(out), styles["Body"]), leftIndent=12))
            flow.append(ListFlowable(items, bulletType="bullet", leftIndent=14))
            flow.append(Spacer(1, 0.10 * inch))
        buf_bullets = []

    def flush_nums():
        nonlocal buf_nums
        if buf_nums:
            items = []
            for b in buf_nums:
                s = sanitize_text(b).replace("**", "§§BOLD§§")
                parts = s.split("§§BOLD§§")
                out = []
                bold = False
                for seg in parts:
                    out.append(f"<b>{seg}</b>" if bold else seg)
                    bold = not bold
                items.append(ListItem(Paragraph("".join(out), styles["Body"]), leftIndent=12))
            flow.append(ListFlowable(items, bulletType="1", leftIndent=14))
            flow.append(Spacer(1, 0.10 * inch))
        buf_nums = []

    for ln in lines:
        line = ln.rstrip("\n")

        if line.strip().startswith("```"):
            if not in_code:
                flush_bullets(); flush_nums(); flush_para()
                in_code = True
                code_lines = []
            else:
                in_code = False
                code = "\n".join(code_lines).rstrip()
                if code:
                    flow.append(Preformatted(code, styles["Code"]))
                    flow.append(Spacer(1, 0.12 * inch))
                code_lines = []
            continue

        if in_code:
            code_lines.append(line)
            continue

        if line.startswith("# "):
            flush_bullets(); flush_nums(); flush_para()
            flow.append(Paragraph(sanitize_text(line[2:].strip()), styles["H1"]))
            flow.append(Spacer(1, 0.12 * inch))
            continue
        if line.startswith("## "):
            flush_bullets(); flush_nums(); flush_para()
            flow.append(Paragraph(sanitize_text(line[3:].strip()), styles["H2"]))
            flow.append(Spacer(1, 0.10 * inch))
            continue
        if line.startswith("### "):
            flush_bullets(); flush_nums(); flush_para()
            flow.append(Paragraph(sanitize_text(line[4:].strip()), styles["H3"]))
            flow.append(Spacer(1, 0.08 * inch))
            continue

        stripped = line.strip()
        if stripped.startswith("- ") or stripped.startswith("* "):
            flush_nums(); flush_para()
            buf_bullets.append(stripped[2:].strip())
            continue

        if len(stripped) > 3 and stripped[0].isdigit() and stripped[1:3] == ". ":
            flush_bullets(); flush_para()
            buf_nums.append(stripped[3:].strip())
            continue

        if not stripped:
            flush_bullets(); flush_nums(); flush_para()
            continue

        buf_para.append(line)

    flush_bullets(); flush_nums(); flush_para()
    return flow

# -------- Exhibit Summary helpers --------

ROLE_LABELS = [
    ("nexus", "Nexus / Medical Opinion", ["at least as likely", "more likely", "medical opinion", "nexus", "due to", "caused by", "aggravated by", "secondary", "proximately"]),
    ("diagnosis", "Diagnosis / Findings", ["diagnos", "icd", "problem list", "dx", "mri", "xray", "ct", "imaging"]),
    ("in_service", "In-Service Event / Exposure", ["str", "service treatment", "dd214", "deployment", "incident", "line of duty", "lod", "exposure", "burn pit", "mos"]),
    ("impact", "Functional Impact / Severity", ["functional", "limitations", "adl", "work", "missed", "cannot", "standing", "walking", "lifting", "impairment"]),
    ("symptoms", "Symptoms / Continuity", ["symptom", "pain", "frequency", "severity", "flare", "onset", "continuous", "persist"]),
    ("treatment", "Treatment / Care", ["treatment", "clinic", "follow up", "therapy", "pt ", "medication", "referral"])
]

def infer_role(ex):
    blob = f"{safe(ex.get('title'))} {safe(ex.get('type'))} {safe(ex.get('snippet'))}".lower()
    best = ("other", "General Evidence", 0)
    for key, label, words in ROLE_LABELS:
        hits = sum(1 for w in words if w in blob)
        if hits > best[2]:
            best = (key, label, hits)
    return best[0], best[1]

def suggested_proves(role_key, cond_name):
    if role_key == "diagnosis":
        return f"Confirms a current diagnosis/findings for {cond_name}."
    if role_key == "in_service":
        return f"Supports an in-service event/exposure/onset relevant to {cond_name}."
    if role_key == "nexus":
        return f"Links {cond_name} to service (direct/secondary/aggravation) with medical reasoning."
    if role_key == "impact":
        return f"Documents severity and functional impact of {cond_name} (work/ADLs/frequency)."
    if role_key == "symptoms":
        return f"Shows symptom history/continuity and how {cond_name} presents over time."
    if role_key == "treatment":
        return f"Shows ongoing treatment and course/progression for {cond_name}."
    return f"Supports the claim for {cond_name}."

def suggested_best_edge(role_key):
    # A sane default edge suggestion to strengthen the chain.
    # You can tweak these to match your exact edge types.
    if role_key == "in_service":
        return "timeline → connect to Symptoms or Diagnosis"
    if role_key == "symptoms":
        return "supports → connect to Diagnosis"
    if role_key == "diagnosis":
        return "supports → connect to Nexus"
    if role_key == "nexus":
        return "supports → connect to Impact"
    if role_key == "impact":
        return "corroborates → connect back to Symptoms/Diagnosis"
    if role_key == "treatment":
        return "corroborates → connect to Symptoms/Diagnosis"
    return "supports → connect to most relevant node"

def exhibit_summary_page(ex, cond_name, styles, include_snip_preview=True):
    role_key, role_label = infer_role(ex)

    # Title
    flows = []
    flows.append(Paragraph(f"Exhibit Summary: {sanitize_text(safe(ex.get('exhibitId')))}", styles["H1"]))
    flows.append(Paragraph(sanitize_text(safe(ex.get("title"))), styles["H2"]))
    flows.append(Spacer(1, 0.12 * inch))

    # Info table (wrap-friendly)
    rows = [
        ["Exhibit", safe(ex.get("exhibitId"))],
        ["Evidence ID", safe(ex.get("evidenceId"))],
        ["Date", fmt_date(ex.get("date")) or "Undated"],
        ["Type", safe(ex.get("type")) or "unknown"],
        ["Role", safe(ex.get("roleLabel")) or role_label],
        ["Role confidence", safe(ex.get("roleConfidence")) or ""],
        ["Graph connections", safe(ex.get("edgeCount"), "0")]
    ]

    data = [[Paragraph(f"<b>{sanitize_text(a)}</b>", styles["Small"]),
             Paragraph(sanitize_text(b), styles["Small"])] for a, b in rows]

    tbl = Table(data, colWidths=[1.45*inch, 5.35*inch])
    tbl.setStyle(TableStyle([
        ("GRID", (0,0), (-1,-1), 0.25, colors.lightgrey),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [colors.whitesmoke, colors.white]),
        ("LEFTPADDING", (0,0), (-1,-1), 6),
        ("RIGHTPADDING", (0,0), (-1,-1), 6),
        ("TOPPADDING", (0,0), (-1,-1), 5),
        ("BOTTOMPADDING", (0,0), (-1,-1), 5),
    ]))
    flows.append(tbl)
    flows.append(Spacer(1, 0.15 * inch))

    # "What this proves" / "Best edge" / Notes boxes
    proves = suggested_proves(role_key, cond_name)
    best_edge = suggested_best_edge(role_key)

    flows.append(Paragraph("<b>What this proves (suggested)</b>", styles["Body"]))
    flows.append(Paragraph(sanitize_text(proves), styles["Body"]))
    flows.append(Spacer(1, 0.10 * inch))

    flows.append(Paragraph("<b>Best edge to add (suggested)</b>", styles["Body"]))
    flows.append(Paragraph(sanitize_text(best_edge), styles["Body"]))
    flows.append(Spacer(1, 0.10 * inch))

    # Connected to (graph neighbors)
    neighbors = ex.get("neighbors") or []
    flows.append(Paragraph("<b>Connected to (graph)</b>", styles["Body"]))
    if neighbors:
        items = []
        for n in neighbors[:10]:
            t = safe(n.get("title") or n.get("evidenceId") or "")
            ty = safe(n.get("type") or "")
            line = f"{t}" + (f" ({ty})" if ty else "")
            items.append(ListItem(Paragraph(sanitize_text(line), styles["Small"]), leftIndent=12))
        flows.append(ListFlowable(items, bulletType="bullet", leftIndent=14))
    else:
        flows.append(Paragraph("None (this exhibit is currently disconnected).", styles["Small"]))
    flows.append(Spacer(1, 0.10 * inch))

    # Recommended links (graph-derived)
    recs = ex.get("recommendedLinks") or []
    flows.append(Paragraph("<b>Recommended links (graph-derived)</b>", styles["Body"]))
    if recs:
        items = []
        for r in recs[:6]:
            edge_t = safe(r.get("type") or "supports")
            to_title = safe(r.get("toTitle") or r.get("toEvidenceId") or "")
            reason = safe(r.get("reason") or "")
            line = f"{edge_t}: {to_title} — {reason}"
            items.append(ListItem(Paragraph(sanitize_text(line), styles["Small"]), leftIndent=12))
        flows.append(ListFlowable(items, bulletType="bullet", leftIndent=14))
    else:
        flows.append(Paragraph("No suggestions available (already well-connected or insufficient candidates).", styles["Small"]))
    flows.append(Spacer(1, 0.10 * inch))

    # Notes area (visual box)
    flows.append(Paragraph("<b>Notes</b> (fill in)", styles["Body"]))
    notes_box = Table([[" "], [" "], [" "], [" "], [" "], [" "]], colWidths=[6.8*inch], rowHeights=[0.35*inch]*6)
    notes_box.setStyle(TableStyle([
        ("GRID", (0,0), (-1,-1), 0.5, colors.HexColor("#999999")),
        ("BACKGROUND", (0,0), (-1,-1), colors.white),
    ]))
    flows.append(notes_box)

    if include_snip_preview:
        snip = safe(ex.get("snippet")).strip()
        if snip:
            flows.append(Spacer(1, 0.15 * inch))
            flows.append(Paragraph("<b>Snippet preview</b>", styles["Body"]))
            flows.append(Paragraph(sanitize_text(snip[:600]).replace("\n", "<br/>"), styles["Small"]))

    flows.append(PageBreak())
    return flows

# -------- Main builder --------

def build_pdf(bundle, out_path):
    condition = bundle.get("condition", {}) or {}
    cond_name = safe(condition.get("name"), "Claim Packet")

    readiness = bundle.get("readiness", {}) or {}
    score = readiness.get("score")

    cfr = (readiness.get("cfr", {}) or {})
    cfr_refs = cfr.get("cfrRefs") or []
    dcs = cfr.get("dcs") or []

    exhibits = bundle.get("exhibits") or []
    narrative_md = safe(bundle.get("export", {}).get("narrativeMarkdown")) or safe(bundle.get("narrativeMarkdown")) or ""

    pdf_opts = bundle.get("pdfOptions") or {}
    separator_pages = bool(pdf_opts.get("separatorPages", True))
    include_snippets = bool(pdf_opts.get("includeSnippets", True))
    summary_pages = bool(pdf_opts.get("summaryPages", True))
    summary_snip_preview = bool(pdf_opts.get("summarySnippetPreview", True))

    title = f"Claim Packet: {cond_name}"

    doc = SimpleDocTemplate(
        out_path,
        pagesize=LETTER,
        leftMargin=0.75 * inch,
        rightMargin=0.75 * inch,
        topMargin=0.80 * inch,
        bottomMargin=0.80 * inch
    )

    base = getSampleStyleSheet()
    styles = {
        "H1": ParagraphStyle(
            "H1", parent=base["Heading1"], fontName="Helvetica-Bold",
            fontSize=16, leading=20, spaceAfter=10
        ),
        "H2": ParagraphStyle(
            "H2", parent=base["Heading2"], fontName="Helvetica-Bold",
            fontSize=12.5, leading=16, spaceBefore=10, spaceAfter=6
        ),
        "H3": ParagraphStyle(
            "H3", parent=base["Heading3"], fontName="Helvetica-Bold",
            fontSize=11, leading=14, spaceBefore=8, spaceAfter=4
        ),
        "Body": ParagraphStyle(
            "Body", parent=base["BodyText"], fontName="Helvetica",
            fontSize=10.2, leading=13.5, spaceAfter=0
        ),
        "Small": ParagraphStyle(
            "Small", parent=base["BodyText"], fontName="Helvetica",
            fontSize=9.2, leading=12.2, textColor=colors.HexColor("#333333")
        ),
        "Code": ParagraphStyle(
            "Code", parent=base["BodyText"], fontName="Courier",
            fontSize=9.0, leading=11.5, backColor=colors.whitesmoke,
            leftIndent=6, rightIndent=6, spaceBefore=6, spaceAfter=6
        )
    }

    story = []

    # Cover
    story.append(Paragraph(title, styles["H1"]))
    story.append(Paragraph(f"<b>Readiness:</b> {safe(score, '--')}/100", styles["Body"]))
    if cfr_refs:
        story.append(Paragraph(f"<b>CFR:</b> {sanitize_text(', '.join(map(safe, cfr_refs)))}", styles["Body"]))
    if dcs:
        story.append(Paragraph(f"<b>Diagnostic Codes:</b> {sanitize_text(', '.join(map(safe, dcs)))}", styles["Body"]))
    story.append(Paragraph(f"<b>Generated:</b> {datetime.utcnow().strftime('%Y-%m-%d %H:%M UTC')}", styles["Body"]))
    story.append(Spacer(1, 0.18 * inch))

    story.append(Paragraph("Exhibit List", styles["H2"]))

    if exhibits:
        data = [[
            Paragraph("<b>Exhibit</b>", styles["Small"]),
            Paragraph("<b>Date</b>", styles["Small"]),
            Paragraph("<b>Title</b>", styles["Small"]),
            Paragraph("<b>Type</b>", styles["Small"])
        ]]
        for ex in exhibits:
            data.append([
                Paragraph(sanitize_text(safe(ex.get("exhibitId"))), styles["Small"]),
                Paragraph(sanitize_text(fmt_date(ex.get("date")) or "Undated"), styles["Small"]),
                Paragraph(sanitize_text(safe(ex.get("title"))), styles["Small"]),
                Paragraph(sanitize_text(safe(ex.get("type")) or "unknown"), styles["Small"]),
            ])

        tbl = Table(data, colWidths=[0.95*inch, 0.95*inch, 3.85*inch, 1.10*inch], repeatRows=1)
        tbl.setStyle(TableStyle([
            ("BACKGROUND", (0,0), (-1,0), colors.black),
            ("TEXTCOLOR", (0,0), (-1,0), colors.white),
            ("GRID", (0,0), (-1,-1), 0.25, colors.lightgrey),
            ("VALIGN", (0,0), (-1,-1), "TOP"),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.whitesmoke, colors.white]),
            ("LEFTPADDING", (0,0), (-1,-1), 6),
            ("RIGHTPADDING", (0,0), (-1,-1), 6),
            ("TOPPADDING", (0,0), (-1,-1), 4),
            ("BOTTOMPADDING", (0,0), (-1,-1), 4),
        ]))
        story.append(tbl)
    else:
        story.append(Paragraph("No exhibits selected.", styles["Body"]))

    story.append(PageBreak())

    # Narrative
    story.append(Paragraph("Narrative Draft", styles["H2"]))
    narrative_flow = md_to_flowables(narrative_md, styles)
    story.extend(narrative_flow if narrative_flow else [Paragraph("No narrative provided.", styles["Body"])])
    story.append(PageBreak())

    # Exhibits section
    story.append(Paragraph("Exhibits", styles["H2"]))

    if exhibits:
        for ex in exhibits:
            ex_id = safe(ex.get("exhibitId"))
            ex_title = safe(ex.get("title"))
            ev_id = safe(ex.get("evidenceId"))
            ex_date = fmt_date(ex.get("date")) or "Undated"
            ex_type = safe(ex.get("type")) or "unknown"
            edge_count = safe(ex.get("edgeCount"), "0")

            # Separator page (optional)
            if separator_pages:
                story.append(Paragraph(f"{sanitize_text(ex_id)}", styles["H1"]))
                story.append(Paragraph(sanitize_text(ex_title), styles["H2"]))
                story.append(Spacer(1, 0.15 * inch))
                story.append(Paragraph(f"<b>Date:</b> {sanitize_text(ex_date)}", styles["Body"]))
                story.append(Paragraph(f"<b>Type:</b> {sanitize_text(ex_type)}", styles["Body"]))
                story.append(PageBreak())

            # Summary page (NEW)
            if summary_pages:
                story.extend(exhibit_summary_page(ex, cond_name, styles, include_snip_preview=summary_snip_preview))

            # Exhibit content page
            story.append(Paragraph(f"{sanitize_text(ex_id)}: {sanitize_text(ex_title)}", styles["H2"]))
            meta_lines = [
                f"<b>Evidence ID:</b> <font name='Courier'>{sanitize_text(ev_id)}</font>",
                f"<b>Date:</b> {sanitize_text(ex_date)}",
                f"<b>Type:</b> {sanitize_text(ex_type)}",
                f"<b>Graph connections:</b> {sanitize_text(edge_count)}"
            ]
            story.append(Paragraph("<br/>".join(meta_lines), styles["Body"]))
            story.append(Spacer(1, 0.10 * inch))

            if include_snippets:
                snippet = safe(ex.get("snippet")).strip()
                if snippet:
                    story.append(Paragraph("<b>Snippet:</b>", styles["Body"]))
                    story.append(Paragraph(sanitize_text(snippet).replace("\n", "<br/>"), styles["Body"]))
                else:
                    story.append(Paragraph("<b>Snippet:</b> (none)", styles["Body"]))

            story.append(PageBreak())
    else:
        story.append(Paragraph("No exhibits selected.", styles["Body"]))

    # Outline/bookmarks via anchors + afterFlowable
    outline = [
        ("Cover", bookmark_key("cover")),
        ("Narrative Draft", bookmark_key("narrative")),
        ("Exhibits", bookmark_key("exhibits"))
    ]
    for ex in exhibits:
        outline.append((f"{safe(ex.get('exhibitId'))}: {safe(ex.get('title'))[:50]}", bookmark_key("ex", safe(ex.get("exhibitId")))))

    def on_page(canvas, doc_):
        header_footer(canvas, doc_, title)

    def anchor(name):
        return Paragraph(f"<a name='{name}'/>", styles["Small"])

    anchored = []
    anchored.append(anchor(bookmark_key("cover")))
    anchored.extend(story)

    final = []
    inserted_narr = False
    inserted_exhibits = False
    inserted_ex_ids = set()

    for fl in anchored:
        if isinstance(fl, Paragraph):
            txt = fl.getPlainText().strip()
            if (not inserted_narr) and txt == "Narrative Draft":
                final.append(anchor(bookmark_key("narrative")))
                inserted_narr = True
            if (not inserted_exhibits) and txt == "Exhibits":
                final.append(anchor(bookmark_key("exhibits")))
                inserted_exhibits = True

            if txt.startswith("EX-") and ":" in txt:
                exid = txt.split(":", 1)[0].strip()
                if exid and exid not in inserted_ex_ids:
                    final.append(anchor(bookmark_key("ex", exid)))
                    inserted_ex_ids.add(exid)

        final.append(fl)

    def after_flowable(flowable):
        if isinstance(flowable, Paragraph):
            if "<a name=" in flowable.text:
                t = flowable.text
                start = t.find("name='")
                if start != -1:
                    start += len("name='")
                    end = t.find("'", start)
                    if end != -1:
                        key = t[start:end]
                        doc.canv.bookmarkPage(key)
                        for title_, key_ in outline:
                            if key_ == key:
                                doc.canv.addOutlineEntry(title_, key, level=0, closed=False)
                                break

    doc.afterFlowable = after_flowable
    doc.build(final, onFirstPage=on_page, onLaterPages=on_page)

def main():
    if len(sys.argv) < 2:
        print("Usage: render_packet_v2.py output.pdf", file=sys.stderr)
        sys.exit(2)

    out_path = sys.argv[1]
    raw = sys.stdin.read()
    bundle = json.loads(raw) if raw.strip() else {}

    build_pdf(bundle, out_path)
    print(out_path)

if __name__ == "__main__":
    main()

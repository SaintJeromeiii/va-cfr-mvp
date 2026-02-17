#!/usr/bin/env python3
# server/pdf/render_packet_v2.py
# Upgraded PDF renderer:
# - Better wrapping/typography
# - Markdown-ish parsing (headings, bullets, numbered lists, code blocks)
# - Bookmarks/Outline entries
# - Optional exhibit separator pages

import json
import sys
from datetime import datetime

from reportlab.lib.pagesizes import LETTER
from reportlab.lib.units import inch
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak,
    ListFlowable, ListItem, Preformatted, KeepTogether
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
    # basic XML escaping for Paragraph
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
    """
    Minimal markdown-ish parser:
    - #, ##, ### headings
    - bullets starting with '-' or '*'
    - numbered list like '1. '
    - fenced code blocks ``` ```
    - **bold** (converted to <b> for Paragraph)
    """
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
                # bold: **x**
                p = p.replace("**", "§§BOLD§§")
                parts = p.split("§§BOLD§§")
                # toggle <b> every other segment
                out = []
                bold = False
                for seg in parts:
                    if bold:
                        out.append(f"<b>{seg}</b>")
                    else:
                        out.append(seg)
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
                flush_bullets()
                flush_nums()
                flush_para()
                in_code = True
                code_lines = []
            else:
                # end code
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

        # headings
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

        # bullets
        stripped = line.strip()
        if stripped.startswith("- ") or stripped.startswith("* "):
            flush_nums()
            flush_para()
            buf_bullets.append(stripped[2:].strip())
            continue

        # numbered
        if len(stripped) > 3 and stripped[0].isdigit():
            # crude: "1. "
            if stripped[1:3] == ". ":
                flush_bullets()
                flush_para()
                buf_nums.append(stripped[3:].strip())
                continue

        # blank line
        if not stripped:
            flush_bullets()
            flush_nums()
            flush_para()
            continue

        # normal paragraph accumulation
        buf_para.append(line)

    flush_bullets()
    flush_nums()
    flush_para()

    return flow

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

    # Cover (bookmark)
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

    # Narrative (bookmark)
    story.append(Paragraph("Narrative Draft", styles["H2"]))
    story.extend(md_to_flowables(narrative_md, styles) or [Paragraph("No narrative provided.", styles["Body"])])
    story.append(PageBreak())

    # Exhibits (bookmark)
    story.append(Paragraph("Exhibits", styles["H2"]))

    if exhibits:
        for idx, ex in enumerate(exhibits, start=1):
            ex_id = safe(ex.get("exhibitId"))
            ex_title = safe(ex.get("title"))
            ev_id = safe(ex.get("evidenceId"))
            ex_date = fmt_date(ex.get("date")) or "Undated"
            ex_type = safe(ex.get("type")) or "unknown"
            edge_count = safe(ex.get("edgeCount"), "0")

            if separator_pages:
                story.append(Paragraph(f"{ex_id}", styles["H1"]))
                story.append(Paragraph(sanitize_text(ex_title), styles["H2"]))
                story.append(Spacer(1, 0.15 * inch))
                story.append(Paragraph(f"<b>Date:</b> {sanitize_text(ex_date)}", styles["Body"]))
                story.append(Paragraph(f"<b>Type:</b> {sanitize_text(ex_type)}", styles["Body"]))
                story.append(PageBreak())

            # Exhibit page
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
                snippet = safe(ex.get("snippet"))
                if snippet:
                    story.append(Paragraph("<b>Snippet:</b>", styles["Body"]))
                    story.append(Paragraph(sanitize_text(snippet).replace("\n", "<br/>"), styles["Body"]))
                else:
                    story.append(Paragraph("<b>Snippet:</b> (none)", styles["Body"]))

            story.append(PageBreak())
    else:
        story.append(Paragraph("No exhibits selected.", styles["Body"]))

    # ---- Outline / bookmarks ----
    # Create bookmarks based on "anchor" paragraphs we insert using hidden tags.
    # We'll do it via doc.afterFlowable.

    outline = [
        ("Cover", bookmark_key("cover")),
        ("Narrative Draft", bookmark_key("narrative")),
        ("Exhibits", bookmark_key("exhibits"))
    ]
    for ex in exhibits:
        outline.append((f"{safe(ex.get('exhibitId'))}: {safe(ex.get('title'))[:50]}", bookmark_key("ex", safe(ex.get("exhibitId")))))

    def on_page(canvas, doc_):
        header_footer(canvas, doc_, title)

    # Inject anchor flowables at known points:
    # We'll rebuild story with anchors:
    anchored = []

    def anchor(name):
        # zero-height paragraph used for bookmarking
        return Paragraph(f"<a name='{name}'/>", styles["Small"])

    # Cover anchor at very top:
    # (story starts with title paragraph already; we put anchor first)
    anchored.append(anchor(bookmark_key("cover")))
    anchored.extend(story)

    # But we want anchors for narrative and exhibits and each exhibit.
    # We'll insert them by scanning and inserting after matching headings:
    final = []
    inserted_narr = False
    inserted_exhibits = False
    inserted_ex_ids = set()

    for fl in anchored:
        # fl might be Paragraph with getPlainText
        if isinstance(fl, Paragraph):
            txt = fl.getPlainText().strip()
            if (not inserted_narr) and txt == "Narrative Draft":
                final.append(anchor(bookmark_key("narrative")))
                inserted_narr = True
            if (not inserted_exhibits) and txt == "Exhibits":
                final.append(anchor(bookmark_key("exhibits")))
                inserted_exhibits = True

            # Exhibit anchor on lines like "EX-001: ..."
            if txt.startswith("EX-") and ":" in txt:
                exid = txt.split(":", 1)[0].strip()
                if exid and exid not in inserted_ex_ids:
                    final.append(anchor(bookmark_key("ex", exid)))
                    inserted_ex_ids.add(exid)

        final.append(fl)

    def after_flowable(flowable):
        if isinstance(flowable, Paragraph):
            # anchor paragraphs:
            if "<a name=" in flowable.text:
                # Extract name='...'
                t = flowable.text
                start = t.find("name='")
                if start != -1:
                    start += len("name='")
                    end = t.find("'", start)
                    if end != -1:
                        key = t[start:end]
                        doc.canv.bookmarkPage(key)
                        # Add outline entries
                        # Map key to title
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

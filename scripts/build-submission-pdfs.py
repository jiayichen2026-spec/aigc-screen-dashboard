#!/usr/bin/env python3
"""Build the two submission PDFs. Requires reportlab, pypdf and a CJK TTF font.

This is documentation tooling only; running the web app does not need Python.
Usage: python3 scripts/build-submission-pdfs.py --font /path/to/cjk-font.ttf
"""
import argparse
import json
from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[1]
URL = 'https://aigc-screen-dashboard.vercel.app/'
REPO = 'https://github.com/jiayichen2026-spec/aigc-screen-dashboard'
parser = argparse.ArgumentParser()
parser.add_argument('--font', default='/Library/Fonts/Arial Unicode.ttf')
args = parser.parse_args()
if not Path(args.font).is_file():
    raise SystemExit('Provide a CJK TrueType font with --font; the font is not distributed with this project.')
pdfmetrics.registerFont(TTFont('CJK', args.font))
pdfmetrics.registerFontFamily('CJK', normal='CJK', bold='CJK', italic='CJK', boldItalic='CJK')
DATA = json.loads((ROOT / 'docs/submission-content.json').read_text(encoding='utf-8'))
OUT = ROOT / 'output/pdf'
OUT.mkdir(parents=True, exist_ok=True)
INK = colors.HexColor('#213D32')
GREEN = colors.HexColor('#20785A')
MUTED = colors.HexColor('#52685C')
WIDTH = A4[0] - 72
styles = {
    'title': ParagraphStyle('title', fontName='CJK', fontSize=19, leading=27, textColor=INK, spaceAfter=7),
    'subtitle': ParagraphStyle('subtitle', fontName='CJK', fontSize=9.5, leading=15, textColor=MUTED, spaceAfter=15),
    'body': ParagraphStyle('body', fontName='CJK', fontSize=10, leading=15.5, textColor=INK, wordWrap='CJK', spaceAfter=6),
    'cell': ParagraphStyle('cell', fontName='CJK', fontSize=9.5, leading=15, textColor=INK, wordWrap='CJK'),
    'head': ParagraphStyle('head', fontName='CJK', fontSize=9.4, leading=14, textColor=colors.white),
    'label': ParagraphStyle('label', fontName='CJK', fontSize=10.5, leading=16, textColor=GREEN, spaceBefore=11, spaceAfter=6),
    'note': ParagraphStyle('note', fontName='CJK', fontSize=9.2, leading=14, textColor=MUTED, wordWrap='CJK', spaceAfter=6),
}

def p(text, style='body'):
    return Paragraph(escape(text), styles[style])

def footer(canvas, doc):
    canvas.setStrokeColor(colors.HexColor('#DCE6DF'))
    canvas.line(36, 35, A4[0] - 36, 35)
    canvas.setFont('CJK', 8)
    canvas.setFillColor(MUTED)
    canvas.drawString(36, 22, 'ScreenPulse  |  模拟数据原型')
    canvas.drawRightString(A4[0] - 36, 22, f'{doc.page} / 1')

def links():
    return Paragraph(f'<link href="{URL}" color="#20785A">在线演示</link>　 /　 <link href="{REPO}" color="#20785A">源码仓库</link>', styles['note'])

def build(name, title, story):
    path = OUT / name
    doc = SimpleDocTemplate(str(path), pagesize=A4, leftMargin=36, rightMargin=36, topMargin=35, bottomMargin=47, title=title, author='ScreenPulse', allowSplitting=0)
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    reader = PdfReader(path)
    assert len(reader.pages) == 1, f'{name} must fit on one page; got {len(reader.pages)}'
    assert len(reader.pages[0].extract_text()) > 500
    print(f'{name}: 1 page, {path.stat().st_size} bytes')

m = DATA['metrics']
story = [p(m['title'], 'title'), p(m['subtitle'], 'subtitle'), p(m['intro']), Spacer(1, 9)]
table_data = [[p(v, 'head') for v in ['指标', '定义与计算口径', '运营人员可采取的行动']]]
table_data += [[p(v, 'cell') for v in row] for row in m['rows']]
table = Table(table_data, colWidths=[80, 250, WIDTH - 330], hAlign='LEFT')
table.setStyle(TableStyle([
    ('BACKGROUND', (0,0), (-1,0), GREEN),
    ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.HexColor('#F2F6F2'), colors.white]),
    ('VALIGN', (0,0), (-1,-1), 'TOP'),
    ('LEFTPADDING', (0,0), (-1,-1), 10), ('RIGHTPADDING', (0,0), (-1,-1), 10),
    ('TOPPADDING', (0,0), (-1,-1), 10), ('BOTTOMPADDING', (0,0), (-1,-1), 10),
    ('LINEBELOW', (0,1), (-1,-1), 0.35, colors.HexColor('#DFE8DF')),
]))
story += [table, Spacer(1, 10)] + [p(note, 'note') for note in m['notes']] + [links()]
build('01-metrics-one-page.pdf', m['title'], story)

a = DATA['ai_usage']
story = [p(a['title'], 'title'), p(a['subtitle'], 'subtitle'), p('01  使用的工具', 'label'), p(a['tools']), p('02  关键提示词', 'label')]
for label, prompt in a['prompts']:
    story += [p(label, 'note'), p(prompt)]
story += [p('03  本人完成的主要修改', 'label')]
story += [p(text) for text in a['contributions']]
story += [Spacer(1, 4), p(a['division'], 'note'), p(a['validation'], 'note'), links()]
build('02-ai-tool-usage.pdf', a['title'], story)

# Editable text and PDFs share one content source to avoid diverging explanations.
md = '# ' + m['title'] + '\n\n' + m['intro'] + '\n\n| 指标 | 定义与计算口径 | 运营行动 |\n| --- | --- | --- |\n'
md += '\n'.join('| ' + ' | '.join(row) + ' |' for row in m['rows']) + '\n\n' + '\n\n'.join(m['notes']) + '\n'
(ROOT / 'docs/METRICS_ONE_PAGE.md').write_text(md, encoding='utf-8')
md = '# ' + a['title'] + '\n\n## 使用的工具\n\n' + a['tools'] + '\n\n## 关键提示词\n\n'
md += '\n\n'.join(f'**{label}**\n\n{prompt}' for label, prompt in a['prompts'])
md += '\n\n## 本人完成的主要修改\n\n' + '\n\n'.join(a['contributions']) + '\n\n' + a['division'] + '\n\n' + a['validation'] + '\n'
(ROOT / 'docs/AI_USAGE_SUBMISSION.md').write_text(md, encoding='utf-8')

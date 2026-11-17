"""Build the static Arabic landing page from the shared English markup and Arabic copy.

Run after changing site/index.html or site/locales/ar.json. --check detects stale output.
Only text and asset paths differ; both pages share styles, interaction and downloads.
"""
import argparse
from html import escape
from html.parser import HTMLParser
import json
from pathlib import Path
import re

ROOT = Path(__file__).resolve().parents[1]
COPY = json.loads((ROOT / 'site/locales/ar.json').read_text(encoding='utf-8'))


class ArabicPage(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.output = []

    def handle_starttag(self, tag, attrs):
        raw = self.get_starttag_text()
        values = dict(attrs)
        def attribute(match):
            name, quote, value = match.groups()
            if name in ('alt', 'title', 'aria-label', 'content'):
                value = COPY.get(value, value)
            if name in ('src', 'href') and (value.startswith('assets/') or value in ('platform.js', 'main.js', 'downloads.js', 'scenes.js', 'styles.css')):
                value = '../' + value
            if name == 'srcset':
                value = value.replace('assets/', '../assets/')
            if tag == 'html' and name == 'lang':
                value = 'ar'
            if tag == 'link' and values.get('rel') == 'canonical' and name == 'href':
                value += 'ar/'
            if 'language-switch' in values.get('class', '').split():
                if name == 'href': value = '../'
                if name in ('lang', 'hreflang'): value = 'en'
            return f'{name}={quote}{escape(value, quote=True)}{quote}'
        raw = re.sub(r'''([\w-]+)=(['"])(.*?)\2''', attribute, raw)
        if tag == 'html':
            raw = raw[:-1] + ' dir="rtl" data-asset-prefix="../">'
        self.output.append(raw)

    handle_startendtag = handle_starttag

    def handle_endtag(self, tag): self.output.append(f'</{tag}>')
    def handle_data(self, data):
        text = data.strip()
        self.output.append(data.replace(text, COPY[text], 1) if text in COPY else data)
    def handle_entityref(self, name): self.output.append(f'&{name};')
    def handle_charref(self, name): self.output.append(f'&#{name};')
    def handle_comment(self, data): self.output.append(f'<!--{data}-->')
    def handle_decl(self, decl): self.output.append(f'<!{decl}>')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    page = ArabicPage()
    page.feed((ROOT / 'site/index.html').read_text(encoding='utf-8'))
    result = ''.join(page.output)
    target = ROOT / 'site/ar/index.html'
    if args.check:
        if not target.exists() or target.read_text(encoding='utf-8') != result:
            raise SystemExit('Arabic page is stale. Run python scripts/build_site_ar.py')
        print('Arabic page matches its template and translations.')
    else:
        target.parent.mkdir(exist_ok=True)
        target.write_text(result, encoding='utf-8')


if __name__ == '__main__':
    main()

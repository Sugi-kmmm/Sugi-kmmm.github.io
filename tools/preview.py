"""サイトを手元で確認するための簡易サーバー（Jekyll / Ruby は不要）．

使い方（リポジトリのルートで）:
    python tools/preview.py          （ポート 4000）
    python tools/preview.py 8080     （ポートを指定する場合）
表示された URL をブラウザで開く．終了は Ctrl+C．

GitHub Pages（Jekyll）がビルド時に行う次のことを，アクセスのたびに再現する．
  - news/ ・ collection/ ・ research/ の .md に _layouts/ のレイアウトを当てて，ページ（.html）にする
  - news/index.json ・ collection/index.json ・ research/index.json（一覧用のデータ）を作る
.md を保存してブラウザを再読み込みすれば反映される．

※ Markdown の変換は簡易版（見出し・段落・改行・箇条書き・番号付きリスト・引用・コード・表・
   リンク・画像・太字・斜体・HTML の直書き）．本番（GitHub Pages）とは細部が異なることがある．
"""
import functools
import html
import http.server
import json
import pathlib
import re
import sys
import urllib.parse

ROOT = pathlib.Path(__file__).resolve().parent.parent
LAYOUTS = ROOT / "_layouts"
# フォルダ → レイアウト（_config.yml の defaults と同じ）
SECTIONS = {"news": "news", "collection": "collection-item", "research": "research-item"}
# index.json に入れる項目（各フォルダの index.json の keys と同じ）
INDEX_KEYS = {
    "news": ["タイトル", "日付"],
    "collection": ["タイトル", "日付", "説明"],
    "research": ["タイトル", "種別", "査読", "著者", "言語", "掲載誌", "巻号ページ", "日付",
                 "出版社", "表彰機関", "関連業績", "DOI", "URL", "PDF"],
}
FM = re.compile(r"\A---\r?\n(.*?)\r?\n?---[ \t]*(?:\r?\n|\Z)", re.S)


def warn(msg):
    print(f"[警告] {msg}", flush=True)


# ---------------------------------------------------------------- front matter
def split_front_matter(path):
    """(項目の辞書, 本文) を返す．先頭に --- が無ければ (None, 全文)"""
    text = path.read_text(encoding="utf-8-sig")
    m = FM.match(text)
    if not m:
        return None, text
    data = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        kv = re.match(r"^([^:#]+?)\s*:\s*(.*?)\s*$", line)
        if not kv:
            warn(f"読めない行: {rel(path)}: {line}")
            continue
        key, v = kv.group(1).strip(), kv.group(2)
        if v.startswith('"'):
            try:
                v = json.loads(v)
            except json.JSONDecodeError:
                warn(f"\" の閉じ忘れ？: {rel(path)}: {line}")
                v = v.strip('"')
        elif v.startswith("'") and v.endswith("'") and len(v) >= 2:
            v = v[1:-1].replace("''", "'")
        data[key] = v if v != "" else None
    return data, text[m.end():]


def rel(path):
    return path.relative_to(ROOT).as_posix()


# ---------------------------------------------------------------- Markdown（簡易版）
def inline(text):
    """行内の Markdown を HTML にする"""
    codes = []

    def keep_code(m):
        codes.append("<code>" + html.escape(m.group(1)) + "</code>")
        return f"\x00{len(codes) - 1}\x00"

    text = re.sub(r"`([^`]+)`", keep_code, text)
    # HTML タグ・実体参照はそのまま，それ以外の < & は文字として扱う
    text = re.sub(r"&(?!#?\w+;)", "&amp;", text)
    text = re.sub(r"<(?![a-zA-Z/!]|https?:)", "&lt;", text)

    def attr(s):
        return html.escape(s, quote=True)

    def image(m):
        alt, src, title = m.group(1), m.group(2), m.group(3)
        t = f' title="{attr(title)}"' if title else ""
        return f'<img src="{attr(src)}" alt="{attr(alt)}"{t} />'

    def link(m):
        label, href, title = m.group(1), m.group(2), m.group(3)
        t = f' title="{attr(title)}"' if title else ""
        return f'<a href="{attr(href)}"{t}>{label}</a>'

    text = re.sub(r'!\[([^\]]*)\]\(\s*<?([^\s)>]+)>?(?:\s+"([^"]*)")?\s*\)', image, text)
    text = re.sub(r'\[([^\]]+)\]\(\s*<?([^\s)>]+)>?(?:\s+"([^"]*)")?\s*\)', link, text)
    text = re.sub(r"<(https?://[^>\s]+)>", lambda m: f'<a href="{attr(m.group(1))}">{m.group(1)}</a>', text)
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"(?<![\*\w])\*(?!\s)(.+?)(?<!\s)\*(?!\*)", r"<em>\1</em>", text)
    text = re.sub(r"~~(.+?)~~", r"<del>\1</del>", text)
    return re.sub(r"\x00(\d+)\x00", lambda m: codes[int(m.group(1))], text)


def para(lines):
    # 改行はそのまま <br>（_config.yml の hard_wrap: true と同じ）
    return "<p>" + "<br />\n".join(inline(l.strip(" \t")) for l in lines) + "</p>"


LIST_ITEM = re.compile(r"^(\s*)([-*+]|\d+\.)\s+(.*)$")


def render_list(lines):
    """箇条書き（入れ子は字下げで判定）"""
    out, stack = [], []  # stack: [(indent, tag)]
    for line in lines:
        m = LIST_ITEM.match(line)
        if not m:  # 続きの行
            if out:
                out[-1] = out[-1][:-5] + "<br />\n" + inline(line.strip(" \t")) + "</li>"
            continue
        indent, tag = len(m.group(1)), ("ol" if m.group(2)[0].isdigit() else "ul")
        while stack and indent < stack[-1][0]:
            _, t, nested = stack.pop()
            out.append(f"</{t}>" + ("</li>" if nested else ""))
        if not stack or indent > stack[-1][0]:
            if stack and out and out[-1].endswith("</li>"):
                out[-1] = out[-1][:-5]
                stack.append((indent, tag, True))
            else:
                stack.append((indent, tag, False))
            out.append(f"<{tag}>")
        out.append("<li>" + inline(m.group(3)) + "</li>")
    while stack:
        _, tag, nested = stack.pop()
        out.append(f"</{tag}>" + ("</li>" if nested else ""))
    return "\n".join(out)


def render_table(lines):
    rows = [[c.strip() for c in l.strip().strip("|").split("|")] for l in lines]
    head, body = rows[0], rows[2:]
    out = ["<table>", "<thead><tr>" + "".join(f"<th>{inline(c)}</th>" for c in head) + "</tr></thead>", "<tbody>"]
    out += ["<tr>" + "".join(f"<td>{inline(c)}</td>" for c in r) + "</tr>" for r in body]
    return "\n".join(out + ["</tbody>", "</table>"])


def markdown(text):
    lines = text.replace("\r\n", "\n").split("\n")
    out, i = [], 0
    while i < len(lines):
        line = lines[i]
        s = line.strip(" \t")
        if not s:
            i += 1
            continue
        # コード（``` で囲む）
        if s.startswith("```"):
            j = i + 1
            while j < len(lines) and not lines[j].strip().startswith("```"):
                j += 1
            out.append("<pre><code>" + html.escape("\n".join(lines[i + 1:j])) + "</code></pre>")
            i = j + 1
            continue
        # 見出し
        m = re.match(r"^(#{1,6})\s+(.*?)\s*#*$", s)
        if m:
            n = len(m.group(1))
            out.append(f"<h{n}>{inline(m.group(2))}</h{n}>")
            i += 1
            continue
        # 区切り線
        if re.match(r"^([-*_])(\s*\1){2,}$", s):
            out.append("<hr />")
            i += 1
            continue
        # HTML の直書き（空行まで）
        if re.match(r"^<(/?[a-zA-Z][\w-]*|!--)", s) and not re.match(r"^<(a|img|strong|em|span|br|code|b|i|https?:)\b", s):
            j = i
            while j < len(lines) and lines[j].strip():
                j += 1
            out.append("\n".join(lines[i:j]))
            i = j
            continue
        # 引用
        if s.startswith(">"):
            j = i
            while j < len(lines) and lines[j].strip().startswith(">"):
                j += 1
            inner = "\n".join(re.sub(r"^\s*>\s?", "", l) for l in lines[i:j])
            out.append("<blockquote>\n" + markdown(inner) + "\n</blockquote>")
            i = j
            continue
        # 箇条書き・番号付きリスト
        if LIST_ITEM.match(line):
            j = i
            while j < len(lines) and lines[j].strip():
                j += 1
            out.append(render_list(lines[i:j]))
            i = j
            continue
        # 表（2行目が |---|---| ）
        if "|" in s and i + 1 < len(lines) and re.match(r"^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$", lines[i + 1]):
            j = i
            while j < len(lines) and "|" in lines[j]:
                j += 1
            out.append(render_table(lines[i:j]))
            i = j
            continue
        # 段落（空行・見出し・リストまで）
        j = i
        while j < len(lines) and lines[j].strip() and not re.match(r"^\s*(#{1,6}\s|```|>)", lines[j]) \
                and not (j > i and LIST_ITEM.match(lines[j])):
            j += 1
        out.append(para(lines[i:j]))
        i = j
    return "\n".join(out)


# ---------------------------------------------------------------- ページ・一覧データ
def content_files(section):
    """一覧に載せる .md（_ で始まるフォルダ・ファイルと README は除く）"""
    base = ROOT / section
    for p in sorted(base.rglob("*.md")):
        if p.name == "README.md" or any(part.startswith("_") for part in p.relative_to(base).parts):
            continue
        yield p


def page_url(path):
    return "/" + rel(path)[:-3] + ".html"


def index_json(section):
    entries = []
    for p in content_files(section):
        data, _ = split_front_matter(p)
        if data is None:
            warn(f"先頭の --- が見つからない: {rel(p)}")
            continue
        if not data.get("タイトル"):
            warn(f"タイトルが空: {rel(p)}")
        for k in data:
            if k not in INDEX_KEYS[section] and k != "redirect_from":
                warn(f"知らない項目「{k}」（{section}/index.json の keys に追加しないと使われません）: {rel(p)}")
        entries.append({"file": rel(p), "url": page_url(p),
                        "data": {k: data.get(k) for k in INDEX_KEYS[section]}})
    if section == "research":
        ids = {}
        for e in entries:
            ids.setdefault(e["file"].split("/")[-1], []).append(e["file"])
        for name, files in ids.items():
            if len(files) > 1:
                warn(f"ファイル名が重複しています（関連業績が正しく結びつきません）: {', '.join(files)}")
    return json.dumps(entries, ensure_ascii=False, indent=1)


def fill(template, data, content):
    def value(m):
        v = data.get(m.group(1))
        v = "" if v is None else str(v)
        f = m.group(2)
        if f.startswith("date"):
            d = re.match(r"(\d{4})\D+(\d{1,2})\D+(\d{1,2})", v)
            return f"{d[1]}.{int(d[2]):02d}.{int(d[3]):02d}" if d else html.escape(v)
        return html.escape(v)

    template = re.sub(r'\{\{ page\["([^"]+)"\] \| (escape|date: "[^"]*") \}\}', value, template)
    return template.replace("{{ content }}", content)


def render_page(md, section):
    data, body = split_front_matter(md)
    data = data or {}
    content = markdown(body)
    name = SECTIONS[section]
    while name:  # レイアウトの入れ子（layout: default）をたどる
        meta, tpl = split_front_matter(LAYOUTS / f"{name}.html")
        content = fill(tpl, data, content)
        name = (meta or {}).get("layout")
    return content


def redirects():
    table = {}
    for section in SECTIONS:
        for p in content_files(section):
            data, _ = split_front_matter(p)
            if data and data.get("redirect_from"):
                table[data["redirect_from"]] = page_url(p)
    return table


class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        # ファイルを直した直後でも古い内容が表示されないようにする
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def send_text(self, body, ctype):
        data = body.encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        path = urllib.parse.unquote(urllib.parse.urlparse(self.path).path)
        section = path.strip("/").split("/")[0]
        if section in SECTIONS:
            if path == f"/{section}/index.json":
                return self.send_text(index_json(section), "application/json; charset=utf-8")
            md = ROOT / (path.lstrip("/").removesuffix(".html") + ".md")
            if md in set(content_files(section)):
                return self.send_text(render_page(md, section), "text/html; charset=utf-8")
            target = redirects().get(path)
            if target:
                self.send_response(301)
                self.send_header("Location", target)
                return self.end_headers()
        return super().do_GET()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
    handler = functools.partial(Handler, directory=str(ROOT))
    # Windows では同じポートで2つ目のサーバーが起動できてしまい，古い方が応答し続けることがあるので禁止する
    http.server.ThreadingHTTPServer.allow_reuse_address = False
    try:
        server = http.server.ThreadingHTTPServer(("localhost", port), handler)
    except OSError:
        sys.exit(f"ポート {port} は使用中です．前に起動したプレビューを Ctrl+C で止めるか，別のポートを指定してください（例 python tools/preview.py 4001）．")
    print(f"http://localhost:{port}/ で確認できます（Ctrl+C で終了）", flush=True)
    server.serve_forever()

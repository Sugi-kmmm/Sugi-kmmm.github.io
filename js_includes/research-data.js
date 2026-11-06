// 研究業績データ（research/<年>/*.md）を読み込み，一覧（research.html）と個別ページ（_layouts/research-item.html）で使う形にする．
//
// 全業績は GitHub Pages がビルド時に research/index.json にまとめるので，それを1回読むだけ．
// 書き方は research/README.md を参照．

const RESEARCH_INDEX_URL = '/research/index.json';

// ---- 日付: "2024-03-22" → 年・並び替え用キー・表示用（2024年3月22日）
function parseDate(text) {
    const m = (text || '').match(/(\d{4})(?:\D+(\d{1,2}))?(?:\D+(\d{1,2}))?/);
    const pad = n => String(n || 0).padStart(2, '0');
    if (!m) return { year: '年不明', sortKey: '0000', label: text || '' };
    const label = m[1] + '年' + (m[2] ? Number(m[2]) + '月' : '') + (m[3] ? Number(m[3]) + '日' : '');
    return { year: m[1], sortKey: m[1] + pad(m[2]) + pad(m[3]), label };
}

// ---- 表のセルに入れる値（文字列，またはリンク {text, href, external}）
const link = (text, href, external) => ({ text, href, external: !!external });
const doiUrl = doi => 'https://doi.org/' + doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');

// 関連業績の書き方: ファイル名（.md なし）．";" 区切りで複数
const relatedIds = text => (text || '').split(/[;；,，\s]+/).filter(Boolean).map(v => v.replace(/\.md$/, ''));

// 種別ごとの日付の見出し
function dateLabel(kind) {
    if (kind === '受賞') return '受賞日';
    if (kind === '学位論文') return '学位取得日';
    if (/発表$/.test(kind)) return '発表日';
    if (/^(論文|解説・総説|著作)$/.test(kind)) return '出版日';
    return '日付';
}

// ---- 1件分のファイルの項目から業績データを作る
//   種別「国内会議発表（口頭）」→ kind「国内会議発表」，tag「口頭」（一覧の小ラベル）
//   category: 一覧のグループ名（kind ＋ 査読）/ rows: 個別ページの表（[見出し, 値]）
function buildItem(r) {
    const d = parseDate(r['日付']);
    const sub = (r['種別'] || 'その他').match(/^(.*?)（(.+)）$/);
    const kind = sub ? sub[1] : (r['種別'] || 'その他');
    const tag = sub ? sub[2] : '';
    const doi = r['DOI'];
    const isAward = kind === '受賞';
    const readUrl = isAward ? '' : (doi ? doiUrl(doi) : r['URL']);
    return {
        kind, tag,
        category: kind + (/^査読(あり|なし)$/.test(r['査読']) ? '（' + r['査読'] + '）' : ''),
        authors: r['著者'], venue: r['掲載誌'] || r['表彰機関'], volume: r['巻号ページ'], date: d,
        topButton: readUrl ? link('論文を読む', readUrl, true) : null,
        pdf: r['PDF'],
        related: relatedIds(r['関連業績']),
        rows: [
            ['種別', r['種別']], ['査読', r['査読']], ['著者', r['著者']], ['言語', r['言語']],
            ['掲載誌', r['掲載誌']], ['巻，号，ページ', r['巻号ページ']],
            [dateLabel(kind), d.label],
            ['出版社', r['出版社']], ['表彰機関', r['表彰機関']],
            ['受賞', '@awards'], ['関連研究', '@related'],
            ['DOI', doi ? link(doi, doiUrl(doi), true) : ''],
            ['URL', r['URL'] ? link(r['URL'], r['URL'], true) : '']
        ]
    };
}

// ---- 全データを読み込む（1回だけ）
let publicationsPromise;
function loadPublications() {
    if (!publicationsPromise) publicationsPromise = (async () => {
        const res = await fetch(RESEARCH_INDEX_URL, { cache: 'no-cache' });
        if (!res.ok) throw new Error(RESEARCH_INDEX_URL + ' を読み込めませんでした（' + res.status + '）');
        const items = [];
        (await res.json()).forEach(entry => {
            // ファイル名（例 research/2024/2024robomech_1.md）が ID になる
            const id = entry.file.split('/').pop().replace(/\.md$/, '');
            // 値はすべて文字列にそろえる（空欄は ''）
            const r = {};
            Object.entries(entry.data || {}).forEach(([k, v]) => { r[k] = v == null ? '' : String(v).trim(); });
            if (!r['タイトル']) return;
            const it = buildItem(r);
            Object.assign(it, { id, title: r['タイトル'], url: entry.url, year: it.date.year, sortKey: it.date.sortKey });
            it.detail = [it.venue, it.volume, it.date.label].filter(Boolean).join(', ');
            items.push(it);
        });
        // 受賞 ⇔ 関連業績 を相互にリンクする
        const byId = new Map(items.map(it => [it.id, it]));
        items.forEach(it => { it.awards = []; });
        items.filter(it => it.kind === '受賞').forEach(a => {
            a.relatedItems = a.related.map(id => byId.get(id)).filter(Boolean);
            a.relatedItems.forEach(p => p.awards.push(a));
        });
        return items;
    })();
    return publicationsPromise;
}

// ---- 個別ページの表の値を DOM にする（文字はすべて文字として扱い，HTML としては解釈しない）
function cellNodes(it, value) {
    const toNode = v => {
        if (typeof v === 'string') return document.createTextNode(v);
        const a = document.createElement('a');
        a.href = v.href;
        a.textContent = v.text;
        if (v.external) { a.target = '_blank'; a.rel = 'noopener'; }
        return a;
    };
    let values;
    if (value === '@awards') values = it.awards.map(a => link(a.title + (a.venue ? '（' + a.venue + '）' : ''), a.url));
    else if (value === '@related') values = (it.relatedItems || []).map(p => link(p.title, p.url));
    else values = value ? [value] : [];
    const nodes = [];
    values.forEach((v, i) => {
        if (i) nodes.push(document.createElement('br'));
        nodes.push(toNode(v));
    });
    return nodes;
}

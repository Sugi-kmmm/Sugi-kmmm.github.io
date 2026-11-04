// 研究業績一覧（research.html）のタブ表示．
// research/ 配下の各ページの publication-table を読み取り，年タブ・種別ごとに表示する．

// 種別の表示順（必要に応じて追加・変更してください）
const CATEGORY_ORDER = ['論文（査読あり）', '論文（査読なし）', '国際会議発表（査読あり）', '国際会議発表（査読なし）', '国内会議発表（査読あり）', '国内会議発表（査読なし）', '解説・総説', '著作','特許', '受賞', '学位論文','その他'];

(async function () {
    const status = document.getElementById('publication-status');
    const wrap = document.getElementById('publication-tabs');
    const tablist = wrap.querySelector('.pub-tablist');
    const panel = wrap.querySelector('.pub-panel');
    const ALL = 'all';

    // research/ 配下のページ一覧（Jekyll がビルド時に埋め込む）
    let urls;
    try {
        urls = JSON.parse(document.getElementById('publication-urls').textContent);
    } catch (e) {
        status.textContent = '業績一覧を読み込めませんでした（GitHub Pages / jekyll serve 上で表示してください）．';
        return;
    }

    // 各ページの publication-table を読み取る
    const parser = new DOMParser();
    const results = await Promise.all(urls.map(async url => {
        try {
            const res = await fetch(url);
            if (!res.ok) return null;
            const doc = parser.parseFromString(await res.text(), 'text/html');
            const table = doc.querySelector('.publication-table');
            if (!table) return null;
            const row = {};
            table.querySelectorAll('tr').forEach(tr => {
                const th = tr.querySelector('th');
                const td = tr.querySelector('td');
                if (th && td) row[th.textContent.replace(/\s/g, '')] = td.textContent.trim().replace(/\s+/g, ' ');
            });
            return toItem(url, row, doc);
        } catch (e) {
            return null;
        }
    }));
    const items = results.filter(Boolean)
        // 日付の新しい順．同じ日付なら 口頭 → ポスター → その他 の順，それでも同じならタイトル順
        .sort((a, b) => b.sortKey.localeCompare(a.sortKey)
            || tagIndex(a.tag) - tagIndex(b.tag)
            || a.title.localeCompare(b.title, 'ja'));

    function tagIndex(tag) {
        const i = ['口頭', 'ポスター'].indexOf(tag);
        return i === -1 ? 2 : i;
    }

    function toItem(url, row, doc) {
        const dateText = row['出版日'] || row['発表日'] || row['学位取得日'] || row['受賞日'] || row['日付'] || row['年'] || '';
        const m = dateText.match(/(\d{4})(?:\D+(\d{1,2}))?(?:\D+(\d{1,2}))?/);
        const pad = n => String(n || 0).padStart(2, '0');
        const year = m ? m[1] : '年不明';
        const vol = row['巻，号，ページ'] || row['巻,号,ページ'] || '';
        const venue = row['掲載誌'] || row['会議名'] || row['発表会'] || row['表彰機関'] || '';
        // 種別の（）内はラベルとして表示し，グループは（）の前の部分でまとめる
        // 「査読」行があれば，グループ名に付け加える
        //   例: 種別「国内会議発表（口頭）」＋ 査読「査読なし」→ グループ「国内会議発表（査読なし）」，ラベル「口頭」
        //       種別「学位論文（修士）」→ グループ「学位論文」，ラベル「修士」
        const rawCategory = row['種別'] || 'その他';
        const review = row['査読'] || '';
        const sub = rawCategory.match(/^(.*?)（(.+)）$/);
        let category = sub ? sub[1] : rawCategory;
        const tag = sub ? sub[2] : '';
        if (/^査読(あり|なし)$/.test(review)) category += '（' + review + '）';
        return {
            url,
            title: row['タイトル'] || doc.title || url,
            authors: row['著者'] || '',
            detail: [venue, vol, dateText].filter(Boolean).join(', '),
            category,
            tag,
            year,
            sortKey: m ? m[1] + pad(m[2]) + pad(m[3]) : '0000'
        };
    }

    if (items.length === 0) {
        status.textContent = '現在掲載している業績はありません．';
        return;
    }

    // 年の一覧（新しい順）＋全件表示
    const years = [...new Set(items.map(it => it.year))]
        .sort((a, b) => (/^\d+$/.test(b) - /^\d+$/.test(a)) || b.localeCompare(a, undefined, { numeric: true }));
    const tabs = years.map(y => ({ key: y, label: y }))
        .concat({ key: ALL, label: '全件表示' });

    const itemsOf = key => key === ALL ? items : items.filter(it => it.year === key);
    const categoryIndex = c => {
        // 完全一致を優先し，次に先頭一致（例:「国内会議発表（口頭）」→「国内会議発表」）
        let i = CATEGORY_ORDER.indexOf(c);
        if (i === -1) i = CATEGORY_ORDER.findIndex(o => c.startsWith(o));
        return i === -1 ? CATEGORY_ORDER.length : i;
    };

    function buildLi(it, showYear) {
        const li = document.createElement('li');
        if (showYear) {
            const y = document.createElement('span');
            y.className = 'pub-year';
            y.textContent = it.year;
            li.appendChild(y);
        }
        if (it.tag) {
            const t = document.createElement('span');
            t.className = 'pub-tag';
            t.textContent = it.tag;
            li.appendChild(t);
        }
        const a = document.createElement('a');
        a.href = it.url;
        a.textContent = it.title;
        li.appendChild(a);
        [it.authors, it.detail].filter(Boolean).forEach(text => {
            const s = document.createElement('span');
            s.className = 'pub-meta';
            s.textContent = text;
            li.appendChild(s);
        });
        return li;
    }

    function render(key) {
        const groups = new Map();
        itemsOf(key).forEach(it => {
            if (!groups.has(it.category)) groups.set(it.category, []);
            groups.get(it.category).push(it);
        });

        panel.innerHTML = '';
        [...groups.keys()].sort((a, b) => categoryIndex(a) - categoryIndex(b) || a.localeCompare(b, 'ja')).forEach(c => {
            const h = document.createElement('h3');
            h.className = 'pub-category';
            h.textContent = c + '（' + groups.get(c).length + '件）';
            const ul = document.createElement('ul');
            ul.className = 'publication-list';
            groups.get(c).forEach(it => ul.appendChild(buildLi(it, key === ALL)));
            panel.append(h, ul);
        });

        tablist.querySelectorAll('button').forEach(b => {
            const on = b.dataset.key === key;
            b.setAttribute('aria-selected', on);
            b.tabIndex = on ? 0 : -1;
            if (on) panel.setAttribute('aria-labelledby', b.id);
        });
    }

    function select(key, updateHash) {
        if (!tabs.some(t => t.key === key)) key = tabs[0].key;
        render(key);
        if (updateHash) history.replaceState(null, '', '#' + key);
    }

    tabs.forEach(t => {
        const b = document.createElement('button');
        b.type = 'button';
        b.setAttribute('role', 'tab');
        b.id = 'pub-tab-' + t.key;
        b.dataset.key = t.key;
        b.textContent = t.label;
        const count = document.createElement('span');
        count.className = 'pub-count';
        count.textContent = itemsOf(t.key).length;
        b.appendChild(count);
        b.addEventListener('click', () => select(t.key, true));
        tablist.appendChild(b);
    });

    // 左右キーでタブ移動
    tablist.addEventListener('keydown', e => {
        if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
        const btns = [...tablist.querySelectorAll('button')];
        const i = btns.indexOf(document.activeElement);
        const next = btns[(i + (e.key === 'ArrowRight' ? 1 : -1) + btns.length) % btns.length];
        next.focus();
        next.click();
    });

    status.hidden = true;
    wrap.hidden = false;
    // URL の #2025 や #all で初期タブを指定可能．指定がなければ最新年
    select(decodeURIComponent(location.hash.slice(1)), false);
})();

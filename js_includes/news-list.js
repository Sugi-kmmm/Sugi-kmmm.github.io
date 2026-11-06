// トップページ（index.html）の「トピックス」一覧．
// news/*.md の全お知らせ（GitHub Pages がビルド時に news/index.json にまとめる）を，日付の新しい順に並べる．
(async function () {
    const ul = document.getElementById('news-list');
    const fmt = text => {
        const m = (text || '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
        return m ? m[1] + '.' + m[2].padStart(2, '0') + '.' + m[3].padStart(2, '0') : (text || '');
    };
    const cmp = (x, y) => (x < y ? -1 : x > y ? 1 : 0);
    let entries;
    try {
        const res = await fetch('/news/index.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(res.status);
        entries = await res.json();
    } catch (e) {
        ul.append(Object.assign(document.createElement('li'), { textContent: 'トピックスを読み込めませんでした．' }));
        return;
    }
    entries
        .map(e => ({ url: e.url, title: String(e.data['タイトル'] || ''), date: fmt(String(e.data['日付'] || '')) }))
        .filter(e => e.title)
        // 日付の新しい順．同じ日付ならファイル名の逆順（20260326-2 → 20260326）
        .sort((a, b) => b.date.localeCompare(a.date) || cmp(b.url.replace(/\.html$/, ''), a.url.replace(/\.html$/, '')))
        .forEach(e => {
            const a = Object.assign(document.createElement('a'), { href: e.url, textContent: e.date + ': ' + e.title });
            const li = document.createElement('li');
            li.append(a);
            ul.append(li);
        });
})();

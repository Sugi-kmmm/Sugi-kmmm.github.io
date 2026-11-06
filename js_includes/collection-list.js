// 作品一覧（collection.html）．
// collection/<作品名>/<作品名>.md の全作品（GitHub Pages がビルド時に collection/index.json にまとめる）を，日付の新しい順に並べる．
(async function () {
    const root = document.getElementById('collection-list');
    let entries;
    try {
        const res = await fetch('/collection/index.json', { cache: 'no-cache' });
        if (!res.ok) throw new Error(res.status);
        entries = await res.json();
    } catch (e) {
        root.append(Object.assign(document.createElement('p'), { textContent: '作品一覧を読み込めませんでした．' }));
        return;
    }
    const key = text => {
        const m = (text || '').match(/(\d{4})(?:\D+(\d{1,2}))?(?:\D+(\d{1,2}))?/);
        return m ? m[1] + (m[2] || '0').padStart(2, '0') + (m[3] || '0').padStart(2, '0') : '0';
    };
    entries
        .map(e => ({ url: e.url, title: String(e.data['タイトル'] || ''), desc: String(e.data['説明'] || ''), key: key(String(e.data['日付'] || '')) }))
        .filter(e => e.title)
        // 日付の新しい順．同じ日付ならファイル名順
        .sort((a, b) => b.key.localeCompare(a.key) || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0))
        .forEach(e => {
            const h2 = document.createElement('h2');
            h2.append(Object.assign(document.createElement('a'), { href: e.url, textContent: e.title }));
            root.append(h2);
            if (e.desc) root.append(Object.assign(document.createElement('p'), { textContent: e.desc }));
        });
})();

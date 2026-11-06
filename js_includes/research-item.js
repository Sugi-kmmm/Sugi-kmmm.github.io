// 研究業績1件の個別ページ（_layouts/research-item.html）の表示．
// research/index.json から，今のページの URL に対応する業績を探して表を作る．
(async function () {
    const root = document.getElementById('item');
    const status = document.getElementById('item-status');
    const abstract = document.getElementById('item-abstract');
    const el = (tag, props, children) => {
        const e = Object.assign(document.createElement(tag), props || {});
        (children || []).forEach(c => e.append(c));
        return e;
    };
    const backButton = () => el('p', {}, [el('a', { href: '/research.html', className: 'back-to-top-button', textContent: '研究業績一覧へ戻る' })]);

    let items;
    try {
        items = await loadPublications();
    } catch (e) {
        status.textContent = '業績データを読み込めませんでした（' + e.message + '）．';
        root.append(backButton());
        return;
    }
    // 今のページの URL に対応する業績を探す（.html の有無は区別しない）
    const strip = u => u.replace(/\.html$/, '');
    const path = strip(decodeURIComponent(location.pathname));
    const it = items.find(x => path === strip(x.url));
    if (!it) {
        status.textContent = '指定された業績が見つかりませんでした．';
        root.append(backButton());
        return;
    }
    status.remove();

    if (it.topButton) {
        root.append(el('a', {
            href: it.topButton.href, className: 'paper-link-button',
            target: '_blank', rel: 'noopener', textContent: it.topButton.text
        }));
    }

    const table = el('table', { className: 'publication-table' });
    [['タイトル', it.title]].concat(it.rows).forEach(([th, value]) => {
        const nodes = cellNodes(it, value);
        if (nodes.length) table.append(el('tr', {}, [el('th', { textContent: th }), el('td', {}, nodes)]));
    });
    // 本文（抄録）があれば表の最後に入れる
    if (abstract && abstract.textContent.trim()) {
        const td = el('td', { className: 'abstract' });
        td.append(...abstract.childNodes);
        table.append(el('tr', {}, [el('th', { textContent: '抄録' }), td]));
    }
    if (abstract) abstract.remove();
    root.append(table);

    // PDF（本文ファイルの URL）があるときだけ表示
    if (it.pdf) {
        root.append(el('a', { href: it.pdf, className: 'paper-link-button', target: '_blank', rel: 'noopener', textContent: 'PDFをダウンロード' }));
    }
    root.append(backButton());
})();

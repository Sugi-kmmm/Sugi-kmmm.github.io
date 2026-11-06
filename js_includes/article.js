// news/ ・ collection/ の本文（Markdown から作った HTML）の見た目を整える．
// 「1行（1段落）に〇〇だけ」を書いたときに，次のように置き換える．書き方は news/README.md を参照．
//
//   ![キャプション](画像のパス)            → キャプション付きの画像
//   ![キャプション](画像のパス "60%")      → 幅を指定した画像
//   ![キャプション](動画のパス.mp4)        → キャプション付きの動画（mp4 / webm / mov / m4v）
//   https://youtu.be/xxxx                 → YouTube の埋め込み
//   [キャプション](YouTube の URL)         → キャプション付きの YouTube の埋め込み
//   [ボタンの文字](https://github.com/…)  → GitHub ボタン
//   [ボタンの文字](その他の URL)           → ボタン
(function () {
    const VIDEO_EXT = /\.(mp4|webm|mov|m4v)(\?.*)?$/i;
    const WIDTH = /^\d+(\.\d+)?(%|px)$/;

    const el = (tag, props, children) => {
        const e = Object.assign(document.createElement(tag), props || {});
        (children || []).forEach(c => e.append(c));
        return e;
    };

    // YouTube の URL から埋め込み用 URL を作る（YouTube でなければ null）
    function youtubeEmbed(href) {
        let u;
        try { u = new URL(href, location.href); } catch (e) { return null; }
        const host = u.hostname.replace(/^(www\.|m\.)/, '');
        let id = null;
        if (host === 'youtu.be') id = u.pathname.slice(1);
        else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
            if (u.pathname === '/watch') id = u.searchParams.get('v');
            else {
                const m = u.pathname.match(/^\/(shorts|embed|live)\/([^/]+)/);
                if (m) id = m[2];
            }
        }
        if (!id) return null;
        const start = parseInt(u.searchParams.get('t') || u.searchParams.get('start') || '', 10);
        return 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + (start ? '?start=' + start : '');
    }

    const caption = text => el('p', { className: 'image-caption', textContent: text });

    function figure(media, captionText) {
        const box = el('div', { className: 'image-caption-container' }, [media]);
        if (captionText) box.append(caption(captionText));
        return box;
    }

    function fromImage(img) {
        const width = WIDTH.test(img.title) ? img.title : '';
        let media;
        if (VIDEO_EXT.test(img.getAttribute('src'))) {
            media = el('video', { src: img.getAttribute('src'), controls: true, playsInline: true, preload: 'metadata', className: 'captioned-image' });
        } else {
            media = el('img', { src: img.getAttribute('src'), alt: img.alt, className: 'captioned-image', loading: 'lazy' });
        }
        if (width) media.style.width = width;
        return figure(media, img.alt);
    }

    function fromYoutube(embedUrl, captionText) {
        const frame = el('iframe', {
            src: embedUrl, title: captionText || 'YouTube',
            allow: 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share',
            allowFullscreen: true, loading: 'lazy'
        });
        frame.setAttribute('frameborder', '0');
        return figure(el('div', { className: 'video-embed' }, [frame]), captionText);
    }

    function fromLink(a) {
        const href = a.getAttribute('href');
        const text = a.textContent.trim();
        const label = text && text !== href ? text : '';
        const yt = youtubeEmbed(href);
        if (yt) return fromYoutube(yt, label);
        const external = /^https?:\/\//.test(href) && new URL(href).host !== location.host;
        const props = external ? { target: '_blank', rel: 'noopener' } : {};
        if (/^https?:\/\/(www\.)?github\.com\//.test(href)) {
            const btn = el('a', Object.assign({ href, className: 'github-link-button' }, props), [
                el('img', { src: '/figures/github-mark-white.svg', alt: 'GitHub', className: 'github-icon' }),
                label || href.replace(/^https?:\/\/(www\.)?github\.com\//, '')
            ]);
            return el('div', { className: 'center-github-link' }, [btn]);
        }
        return el('a', Object.assign({ href, className: 'paper-link-button', textContent: label || href }, props));
    }

    // 段落の中身が「要素1つだけ」ならその要素を返す（空白・改行は無視）
    function onlyChild(p) {
        const nodes = [...p.childNodes].filter(n => !(n.nodeType === 3 && !n.textContent.trim()) && n.nodeName !== 'BR');
        return nodes.length === 1 ? nodes[0] : null;
    }

    document.querySelectorAll('.article-body').forEach(body => {
        body.querySelectorAll('p').forEach(p => {
            const node = onlyChild(p);
            if (!node) return;
            let repl = null;
            if (node.nodeName === 'IMG') repl = fromImage(node);
            else if (node.nodeName === 'A') repl = fromLink(node);
            else if (node.nodeType === 3 && /^https?:\/\/\S+$/.test(node.textContent.trim())) {
                // URL をそのまま書いた場合（YouTube のときだけ埋め込む）
                const yt = youtubeEmbed(node.textContent.trim());
                if (yt) repl = fromYoutube(yt, '');
            }
            if (repl) p.replaceWith(repl);
        });
    });
})();

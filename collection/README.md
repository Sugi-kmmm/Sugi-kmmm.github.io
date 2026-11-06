# 作品ページの書き方

作品は **1件につき1つのフォルダ** で，`collection/<作品名>/<作品名>.md` に置きます．
ファイルを追加・修正して GitHub に push すると，数分でサイトに反映されます（**HTML を書く必要はありません**）．
作品一覧ページ（collection.html）にも自動で載ります（日付の新しい順）．

```
collection/
├─ BaseNoid/
│   ├─ BaseNoid.md      作品ページ（URL は /collection/BaseNoid/BaseNoid.html になる）
│   └─ figures/         この作品の画像・動画
├─ _template/           ひな形（コピーして使う．サイトには表示されない）
└─ index.json           全作品の一覧（GitHub Pages が自動で作る．編集しない）
```

## 追加のしかた

1. `collection/<作品名>/` フォルダを作る
2. `_template/作品名.md` をコピーして `collection/<作品名>/<作品名>.md` にする
3. タイトル・日付・説明と本文を書く．画像・動画は `collection/<作品名>/figures/` に置く
4. push する

## ファイルの形

```
---
タイトル: "初学者向けヒューマノイドロボット開発プラットフォーム BaseNoid"
日付: "2025-07-23"
説明: "BaseNoidは，……"
---
（本文）
```

| 項目 | 書き方 |
|---|---|
| タイトル | 作品名．ページの見出しと作品一覧に使われる |
| 日付 | `"2025-07-23"` の形．ページ上部の日付と一覧の並び順に使われる |
| 説明 | 作品一覧ページに表示する1〜2文 |

本文の書き方（画像・動画・YouTube・GitHub ボタンなど）は [news/README.md](../news/README.md#本文の書き方markdown) と同じです．

## 手元で確認する

`python tools/preview.py` を実行して http://localhost:4000/collection.html を開きます．

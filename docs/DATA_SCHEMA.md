# データの書き方

`data/questions.js` は**人が書く**唯一のデータファイル。他の2つ（`data/world.js`、`img/manifest.js`）は自動生成なので手で触らない。

JSON ではなくグローバル変数を代入する `.js` にしてあるのは、`file://` でダブルクリックしても動くため（`fetch` はローカルファイルだと CORS で弾かれる）。

---

## 1. 1問の形

```js
{
  id: 'richat',
  adopted: true,
  wikipedia: 'Richat Structure',

  answer: {
    lat: 21.124,
    lon: -11.401,
    place: 'リシャット構造',
    region: 'モーリタニア・アドラール州',
    country: 'MR',
  },

  frame: { areaKm2: 2000, sensor: 'landsat', meters: 30 },

  headline: '砂漠に浮かぶ巨大な同心円',
  caption: '硬い岩と柔らかい岩が交互に…（2文）',
  term: 'ドーム構造',

  scores: { distinct: 0.569, fame: 0.546, difficulty: 3 },

  image: {
    key: 'q/richat.jpg',
    width: 1400,
    date: '2000-12-01',
    credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.',
  },
}
```

| 項目 | 誰が書くか | 意味 |
| --- | --- | --- |
| `id` | 人 | 英小文字とハイフン。画像ファイル名にもなる |
| `adopted` | 人 | `true` 採用 / `false` 不採用 / 書かない＝未決定 |
| `wikipedia` | 人 | 英語版 Wikipedia の記事名。`npm run fame` が知名度を測るのに使う |
| `answer` | 人 | 正解の座標と地名 |
| `frame` | 人 | 切り出す範囲。`areaKm2` は `config/pipeline.json` の `frame.sizesKm2` から選ぶ |
| `headline` | 人 | 見たまま |
| `caption` | 人 | 2文の解説 |
| `term` | 人 | 用語 |
| `reject` | 人 | `adopted: false` のときの理由 |
| `scores` | `npm run score` | 弁別性・知名度・難易度 |
| `image` | `npm run fetch` | 画像の情報。値は `img/manifest.js` と一致していないと検査に落ちる |

`wikipedia` と `reject` は仕様 §6.1 に無い項目。前者は知名度の実測に、後者は不採用の理由を残すために足した。

---

## 2. 文章の規約

仕様 §6.1 と 原則3。**説明のない問題は入れない。**

### `headline` ── 見たままを言う

専門用語を使わない。写真を見た人が最初に口にする言葉を書く。

```
○ 砂漠に浮かぶ巨大な同心円
○ 森の中を一周する細い黒い輪
× ドーム構造の削剥地形          ← 用語で言っている
× アドラール州の環状構造        ← 地名を言ってしまっている
```

`term` の語をそのまま入れてはいけない。入れると検査に落ちる。答えを先に言ってしまうため。

### `caption` ── 2文まで、1文目は必ず理由から

**1文目は「なぜそう見えるか」。** 何であるかではない。

```
○ 硬い岩と柔らかい岩が交互に重なった地層がドーム状に持ち上がり、上から削られたので、
  硬い層だけが輪の形で残りました。
× モーリタニアにある直径40kmの環状構造です。   ← 事実を並べただけで、理由がない
```

2文目は自由。大きさ、見どころ、写真の中の別の要素などを足す。

3文以上書くと検査に落ちる。

### `term` ── 本文の外

読まなくても解説が成立するようにする。結果画面では「── ◯◯ と呼ばれています」と別行に出る。

### 書いてはいけないこと

仕様 §14。

- 気候変動や環境問題への言及。**記録であって主張ではない。**
- 未確認のことを断定する書き方。確かめられないなら書かない。

---

## 3. 座標と枠

`answer.lat` / `answer.lon` は **`data/world.js` の陸地ポリゴンの内側**でなければならない。検査で落ちる。

海峡や湾を出題したいときは、この検査に引っかかる。いまは避けている（仕様 §10 の検査を緩めないため）。

`answer.country` は表示と検査に使う。**定性的な帯（「国まで当たっています」など）の判定には使っていない。** 判定には正解座標に対する point-in-polygon の結果を使う。Natural Earth 1:110m の国境と手で書いた ISO コードがずれても、プレイヤーから見て矛盾しないようにするため。

`frame.areaKm2` は `config/pipeline.json` の `frame.sizesKm2`（50 / 100 / 200 / 500 / 1000 / 2000 / 5000 / 10000 / 20000）から選ぶ。枠を変えたら `npm run fetch -- --force --only=<id>` で取り直す。

差し渡し 100km を超える地物（内陸デルタ、三角州、塩湖）は 10000〜20000 km² が要る。仕様 §5.4 の表は 2000 km² までだが、それでは扇の内側しか写らない（docs/IMAGERY.md §2）。

---

## 4. 手順

新しい問題を1問足すとき。

```bash
# 1. data/questions.js に adopted を書かずに追記する（座標と frame と headline だけでよい）
# 2. 画像を取る
npm run fetch -- --only=<id>
# 3. 目視する
npm run sheet
npm run serve      # http://localhost:4173/work/contact-sheet.html
# 4. 採否を決めて adopted を書く。落とすなら reject に理由を書く
# 5. 知名度を測る
npm run fame -- <id>
# 6. 全問を採点し直して scores を書き戻す（難易度は相対値なので既存の問題も動く）
npm run score -- --write
# 7. 検査する
npm run check
```

`npm run score` の難易度が候補集合に対する相対値である理由は docs/SCORING.md §4。

---

## 5. 自動生成されるファイル

### `data/world.js`

```bash
npm run world
node scripts/verify-world.mjs   # 隣接国と国判定の抜き取り検査
```

Natural Earth 1:110m から陸地ポリゴン、国境、日本語国名、大陸、隣接国を作る。**回答用の地図に衛星画像は使わない**（原則2）。ここにあるのは線だけ。

隣接国は、簡略化する前の座標を丸めて突き合わせ、頂点を共有している国どうしを隣接とみなしている。海を挟んだ国は隣接にならない（イギリスとフランスは非隣接）。

### `img/manifest.js`

```bash
npm run fetch
```

R2 に上げた（またはリポジトリに同梱した）画像の一覧。出典もここに記録され、結果画面と `CREDITS.md` の両方に出る。

---

## 6. 検査（`npm run validate`）

Cloudflare Pages のビルドで走る。**通らなければ公開されない。**

| 検査 | 落とす条件 |
| --- | --- |
| 必須項目 | `id` `answer` `frame` `headline` `caption` `term` `image` のいずれかが欠けている |
| id の重複 | 同じ id が2件以上 |
| 座標 | 陸地ポリゴンの外／南極／表示範囲の外 |
| 文章 | `caption` が3文以上 |
| 文章 | `headline` に `term` の語がそのまま入っている |
| 出典 | `credit` に `Google` を含む |
| 難易度 | `difficulty` が1〜5の整数でない |
| 画像 | `img/manifest.js` に該当キーがない／`width`・`date`・`credit` が食い違う／ファイルが無い |
| 出題順 | 同じ国が3問連続する |
| 問数 | 1セットを組めるだけの採用が無い |

`adopted: false` の項目は記録として扱い、id の重複と `reject` の有無だけを見る。

**検査を緩めて通すのは禁止。** 落ちたらデータを直す。

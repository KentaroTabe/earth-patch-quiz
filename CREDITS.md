# 出典

仕様 §12 に対応。出典は取得時に `img/manifest.js` へ記録し、結果画面とこのファイルの両方に出す。

---

## 問題画像

**NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.**

- レイヤ: `Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual`（年次無雲モザイク、30 m/px）
- 提供: NASA EOSDIS Global Imagery Browse Services (GIBS)
- 条件: 米国政府の著作物。出典表記のうえ自由に使える

現在同梱している20枚はすべてこの取得元。内訳は `img/manifest.js` を参照。

---

## 陸地・国境ポリゴン

**Natural Earth 1:110m**

- `ne_110m_land.geojson` / `ne_110m_admin_0_countries.geojson`
- 条件: パブリックドメイン
- 日本語の国名は Natural Earth の `NAME_JA` 属性をそのまま使っている

---

## 候補点と知名度

**Wikidata**

- 条件: CC0
- 用途: 候補点の座標（P625）と、Wikipedia の言語版数

---

## このリポジトリのもの

| 対象 | 条件 |
| --- | --- |
| コード（`index.html` / `assets/` / `scripts/`） | MIT（LICENSE） |
| 解説文（`data/questions.js` の `headline` / `caption` / `term`） | CC BY 4.0 |

---

## 使っていないもの

**Google マップおよび Google Earth の画面キャプチャは、どんな形でも使っていない**（仕様 原則1 / §12）。

結果画面から Google マップへリンクを張っているが、これは座標から URL を組み立てているだけで、画像は取得していない。

---

## 検討したが採用しなかった取得元

| 候補 | 条件 | 見送った理由 |
| --- | --- | --- |
| EOX Sentinel-2 cloudless | CC BY-NC-SA 4.0 | 非商用限定。配布元が第三者 |
| Copernicus Data Space / Sentinel-2 | Copernicus | 認証情報が要る。取れ次第こちらへ移す |

詳細は docs/IMAGERY.md。

// 問題データ。人が書く。書き方の規約は docs/DATA_SCHEMA.md を参照。
//
//   headline … 見たままを言う。専門用語を使わない。term の語をそのまま入れない。
//   caption  … 2文まで。1文目は必ず「なぜそう見えるか」から書く。
//   term     … 本文の外。読まなくても解説が成立するようにする。
//   adopted  … true 採用 / false 不採用 / 書かない＝未決定。
//              不採用を消さずに残すのは、取得のたびに同じ画像が戻ってくるのを避けるため。
//
// scores は npm run score、image の width/date/credit は npm run fetch の実測値。
// 手で書き換えると npm run validate が落ちる。
//
// 解説文のライセンスは CC BY 4.0（CREDITS.md）。

window.EARTH_PATCH_QUESTIONS = [
  {
    id: 'richat',
    adopted: true,
    wikipedia: 'Richat Structure',
    answer: { lat: 21.124, lon: -11.401, place: 'リシャット構造', region: 'モーリタニア・アドラール州', country: 'MR' },
    frame: { areaKm2: 2000, sensor: 'landsat', meters: 30 },
    headline: '砂漠に浮かぶ巨大な同心円',
    caption:
      '硬い岩と柔らかい岩が交互に重なった地層がドーム状に持ち上がり、上から削られたので、硬い層だけが輪の形で残りました。差し渡しは40kmほどあり、宇宙から自分の位置を確かめる目印として使われてきました。',
    term: 'ドーム構造',
    scores: { distinct: 0.337, fame: 0.404, difficulty: 3 },
    image: { key: 'q/richat.jpg', width: 1400, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/richat.jpg', width: 1400, areaKm2: 18000 } },
  },
  {
    id: 'fuji',
    adopted: true,
    wikipedia: 'Mount Fuji',
    answer: { lat: 35.3606, lon: 138.7274, place: '富士山', region: '日本・静岡県と山梨県', country: 'JP' },
    frame: { areaKm2: 500, sensor: 'landsat', meters: 30 },
    headline: '裾を長く引いた円すいの山',
    caption:
      '同じ火口から溶岩と火山灰が何度も噴き出して四方に積み重なったので、どちらから見てもほぼ同じ傾きの円すいになりました。頂の周りだけ茶色いのは、傾斜が急で植物が根づかないからです。',
    term: '成層火山',
    scores: { distinct: 0.075, fame: 0.933, difficulty: 1 },
    image: { key: 'q/fuji.jpg', width: 745, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/fuji.jpg', width: 1400, areaKm2: 4500 } },
  },
  {
    id: 'vesuvio',
    adopted: true,
    wikipedia: 'Mount Vesuvius',
    answer: { lat: 40.821, lon: 14.426, place: 'ヴェスヴィオ山', region: 'イタリア・カンパニア州', country: 'IT' },
    frame: { areaKm2: 500, sensor: 'landsat', meters: 30 },
    headline: '街にすき間なく囲まれた二重の火口',
    caption:
      '古い山体が大きく崩れたあと、その内側に新しい火口が育ったので、輪の中にもう一つ輪が入った形になりました。周りを埋める灰色は、火口から10kmと離れていない場所まで広がった市街地です。',
    term: '外輪山',
    scores: { distinct: 0.814, fame: 0.909, difficulty: 1 },
    image: { key: 'q/vesuvio.jpg', width: 745, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/vesuvio.jpg', width: 1400, areaKm2: 4500 } },
  },
  {
    id: 'grand-canyon',
    adopted: true,
    wikipedia: 'Grand Canyon',
    answer: { lat: 36.1, lon: -112.1, place: 'グランド・キャニオン', region: 'アメリカ・アリゾナ州', country: 'US' },
    frame: { areaKm2: 1000, sensor: 'landsat', meters: 30 },
    headline: '大地に刻まれた枝分かれの深い溝',
    caption:
      '台地がゆっくり持ち上がるあいだも川が同じ場所を削り続けたので、蛇行した形のまま地面へ食い込み、深い谷になりました。谷底を横切る細い線が、その川そのものです。',
    term: '先行谷',
    scores: { distinct: 0.284, fame: 0.865, difficulty: 1 },
    image: { key: 'q/grand-canyon.jpg', width: 1054, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/grand-canyon.jpg', width: 1400, areaKm2: 9000 } },
  },
  {
    id: 'dead-sea',
    adopted: true,
    wikipedia: 'Dead Sea',
    answer: { lat: 31.4, lon: 35.47, place: '死海', region: 'ヨルダンとイスラエルの境', country: 'JO' },
    frame: { areaKm2: 2000, sensor: 'landsat', meters: 30 },
    headline: '砂漠にはまった濃い青の細長い水面',
    caption:
      '流れ込んだ水が出口を持たずに蒸発し続けるので、塩分が濃くなり、乾いた周りとの境がはっきり出ます。南側にある格子模様は、その塩を採るために仕切られた浅い池です。',
    term: '内陸塩湖',
    scores: { distinct: 0.81, fame: 1, difficulty: 1 },
    image: { key: 'q/dead-sea.jpg', width: 1400, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/dead-sea.jpg', width: 1400, areaKm2: 18000 } },
  },
  {
    id: 'etna',
    adopted: true,
    wikipedia: 'Mount Etna',
    answer: { lat: 37.751, lon: 14.993, place: 'エトナ山', region: 'イタリア・シチリア州', country: 'IT' },
    frame: { areaKm2: 500, sensor: 'landsat', meters: 30 },
    headline: '緑の中に黒く広がった扇',
    caption:
      '溶岩が同じ斜面を何度も流れ下ったので、新しく流れたものほど黒く、古いものほど植物に覆われて緑に近づきます。頂の周りがいちばん暗いのは、そこが最も新しいからです。',
    term: '溶岩流',
    scores: { distinct: 0.346, fame: 0.872, difficulty: 1 },
    image: { key: 'q/etna.jpg', width: 745, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/etna.jpg', width: 1400, areaKm2: 4500 } },
  },
  {
    id: 'suez',
    adopted: true,
    wikipedia: 'Suez Canal',
    answer: { lat: 30.55, lon: 32.33, place: 'スエズ運河', region: 'エジプト・イスマイリア県', country: 'EG' },
    frame: { areaKm2: 1000, sensor: 'landsat', meters: 30 },
    headline: '砂漠をまっすぐ貫く一本の水路',
    caption:
      '人が地面を掘って二つの海をつないだので、自然の川では起こらないほどまっすぐな線になりました。途中で幅が広がっているところは、もとからあった湖をそのまま航路に取り込んだ部分です。',
    term: '運河',
    scores: { distinct: 0.604, fame: 1, difficulty: 1 },
    image: { key: 'q/suez.jpg', width: 1054, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/suez.jpg', width: 1400, areaKm2: 9000 } },
  },
  {
    id: 'brasilia',
    adopted: true,
    wikipedia: 'Brasília',
    answer: { lat: -15.79, lon: -47.88, place: 'ブラジリア', region: 'ブラジル・連邦直轄区', country: 'BR' },
    frame: { areaKm2: 200, sensor: 'landsat', meters: 30 },
    headline: '弓なりに反った帯の形に並ぶ街',
    caption:
      '何もない台地に一から設計して建てた街なので、住宅の区画が図面どおりの曲線に沿って並んでいます。右側で細く枝分かれしている水面は、街に合わせて造られた人造湖です。',
    term: '計画都市',
    scores: { distinct: 0.416, fame: 1, difficulty: 1 },
    image: { key: 'q/brasilia.jpg', width: 471, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/brasilia.jpg', width: 1400, areaKm2: 1800 } },
  },
  {
    id: 'crater-lake',
    adopted: true,
    wikipedia: 'Crater Lake',
    answer: { lat: 42.94, lon: -122.11, place: 'クレーター・レイク', region: 'アメリカ・オレゴン州', country: 'US' },
    frame: { areaKm2: 200, sensor: 'landsat', meters: 30 },
    headline: '円い深い青の水面に浮かぶ小さな島',
    caption:
      '山の中身が噴き出して空になり、頂が丸ごと落ち込んだ窪みに水がたまったので、ほぼ円い湖になりました。流れ込む川がなく雨と雪だけで満たされるため、濁りがなく色が濃く出ます。',
    term: 'カルデラ湖',
    scores: { distinct: 0.778, fame: 0.527, difficulty: 3 },
    image: { key: 'q/crater-lake.jpg', width: 471, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/crater-lake.jpg', width: 1400, areaKm2: 1800 } },
  },
  {
    id: 'venezia',
    adopted: true,
    wikipedia: 'Venetian Lagoon',
    answer: { lat: 45.42, lon: 12.35, place: 'ヴェネツィアの潟', region: 'イタリア・ヴェネト州', country: 'IT' },
    frame: { areaKm2: 500, sensor: 'landsat', meters: 30 },
    headline: '細い砂の帯で海から仕切られた浅い水面',
    caption:
      '川が運んだ砂が沿岸の流れで細長く伸びて外海をふさいだので、内側に浅い水面が閉じ込められました。潟の真ん中にある小さな塊が、水路で細かく分かれた市街地です。',
    term: 'ラグーン',
    scores: { distinct: 0.73, fame: 0.519, difficulty: 3 },
    image: { key: 'q/venezia.jpg', width: 745, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/venezia.jpg', width: 1400, areaKm2: 4500 } },
  },
  {
    id: 'musandam',
    adopted: true,
    wikipedia: 'Musandam Governorate',
    answer: { lat: 26.2, lon: 56.25, place: 'ムサンダム半島', region: 'オマーン・ムサンダム県', country: 'OM' },
    frame: { areaKm2: 1000, sensor: 'landsat', meters: 30 },
    headline: '海が細く入り込んだぎざぎざの岩山',
    caption:
      '山地がゆっくり沈み込んで谷の底まで海水が入ったので、入り江が枝分かれしたまま奥深くまで届いています。陸に緑がほとんど無いのは、雨がめったに降らないからです。',
    term: '沈水海岸',
    scores: { distinct: 0.957, fame: 0.484, difficulty: 3 },
    image: { key: 'q/musandam.jpg', width: 1054, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/musandam.jpg', width: 1400, areaKm2: 9000 } },
  },
  {
    id: 'nasser',
    adopted: true,
    wikipedia: 'Lake Nasser',
    answer: { lat: 23.5, lon: 32.85, place: 'ナセル湖', region: 'エジプト・アスワン県', country: 'EG' },
    frame: { areaKm2: 2000, sensor: 'landsat', meters: 30 },
    headline: '砂漠の中で枝を伸ばす細長い水面',
    caption:
      '川をせき止めて谷を水で満たしたので、もとの谷筋の形がそのまま水際の輪郭として残りました。岸のすぐ外まで砂色なのは、雨が降らず、水の届く幅がごく狭いからです。',
    term: '人造湖',
    scores: { distinct: 0.855, fame: 0.575, difficulty: 3 },
    image: { key: 'q/nasser.jpg', width: 1400, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/nasser.jpg', width: 1400, areaKm2: 18000 } },
  },
  {
    id: 'great-salt-lake',
    adopted: true,
    wikipedia: 'Great Salt Lake',
    answer: { lat: 41.1, lon: -112.5, place: 'グレートソルト湖', region: 'アメリカ・ユタ州', country: 'US' },
    frame: { areaKm2: 2000, sensor: 'landsat', meters: 30 },
    headline: 'まっすぐな線を境に色が変わる湖',
    caption:
      '湖を横切る堤が水の行き来をさえぎり、南北で塩分が変わったので、そこに育つ生き物の色の差がそのまま境目として出ました。左下の四角く区切られた浅い水面は、塩を採るための仕切りです。',
    term: '塩湖',
    scores: { distinct: 0.905, fame: 0.65, difficulty: 2 },
    image: { key: 'q/great-salt-lake.jpg', width: 1400, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/great-salt-lake.jpg', width: 1400, areaKm2: 18000 } },
  },
  {
    id: 'toba',
    adopted: true,
    wikipedia: 'Lake Toba',
    answer: { lat: 2.68, lon: 98.86, place: 'トバ湖', region: 'インドネシア・北スマトラ州', country: 'ID' },
    frame: { areaKm2: 2000, sensor: 'landsat', meters: 30 },
    headline: '湖の真ん中に横たわる細長い島',
    caption:
      '巨大な噴火で地下が空になって陥没したあと、底がふたたび押し上げられたので、湖の中に島ができました。湖の縁がまっすぐに切れているのは、陥没したときの崖がそのまま残っているからです。',
    term: '再生ドーム',
    scores: { distinct: 0.347, fame: 0.674, difficulty: 2 },
    image: { key: 'q/toba.jpg', width: 1400, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/toba.jpg', width: 1400, areaKm2: 18000 } },
  },
  {
    id: 'capetown',
    adopted: true,
    wikipedia: 'Cape Peninsula',
    answer: { lat: -33.93, lon: 18.45, place: 'ケープ半島', region: '南アフリカ・西ケープ州', country: 'ZA' },
    frame: { areaKm2: 1000, sensor: 'landsat', meters: 30 },
    headline: '海に突き出た平らな頂の山と、その足元の街',
    caption:
      '硬い砂岩の層が水平に積もったまま持ち上がり、上面がまんべんなく削られたので、頂が平らな山になりました。その北側に密集した灰色が、山の裾から湾まで広がる市街地です。',
    term: 'テーブルマウンテン',
    scores: { distinct: 0.975, fame: 0.305, difficulty: 4 },
    image: { key: 'q/capetown.jpg', width: 1054, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/capetown.jpg', width: 1400, areaKm2: 9000 } },
  },
  {
    id: 'betsiboka',
    adopted: true,
    wikipedia: 'Betsiboka River',
    answer: { lat: -15.8, lon: 46.35, place: 'ベツィボカ川の河口', region: 'マダガスカル・ボエニ地方', country: 'MG' },
    frame: { areaKm2: 1000, sensor: 'landsat', meters: 30 },
    headline: '海へ流れ出す赤茶色の枝分かれ',
    caption:
      '上流で地面がむき出しになり、赤い土が雨のたびに川へ流れ込むので、河口まで濁ったまま届きます。細長い中州が何本も平行に並んでいるのは、運ばれてきた土がそこで積もるからです。',
    term: '土壌侵食',
    scores: { distinct: 0.408, fame: 0.345, difficulty: 4 },
    image: { key: 'q/betsiboka.jpg', width: 1054, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/betsiboka.jpg', width: 1400, areaKm2: 9000 } },
  },
  {
    id: 'manicouagan',
    adopted: true,
    wikipedia: 'Manicouagan Reservoir',
    answer: { lat: 51.42, lon: -68.7, place: 'マニクアガン湖', region: 'カナダ・ケベック州', country: 'CA' },
    frame: { areaKm2: 2000, sensor: 'landsat', meters: 30 },
    headline: '森の中を一周する細い黒い輪',
    caption:
      '大きな天体がぶつかってできた円い窪地を下流でせき止めたので、水が輪の形にたまり、中央の高まりが島として残りました。輪の差し渡しは70kmほどあります。',
    term: '衝突クレーター',
    scores: { distinct: 0.048, fame: 0.262, difficulty: 4 },
    image: { key: 'q/manicouagan.jpg', width: 1400, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/manicouagan.jpg', width: 1400, areaKm2: 18000 } },
  },
  {
    id: 'sossusvlei',
    adopted: true,
    wikipedia: 'Sossusvlei',
    answer: { lat: -24.73, lon: 15.35, place: 'ソススフレイ', region: 'ナミビア・ナミブ砂漠', country: 'NA' },
    frame: { areaKm2: 1000, sensor: 'landsat', meters: 30 },
    headline: '同じ向きに並んだ赤い砂の峰',
    caption:
      '風がほぼ一定の向きに吹き続けるので、砂の山が向きをそろえて何十kmも伸びます。真ん中を横切る白い帯は、砂に行く手をふさがれて干上がった川の跡です。',
    term: '縦列砂丘',
    scores: { distinct: 0.423, fame: 0.179, difficulty: 5 },
    image: { key: 'q/sossusvlei.jpg', width: 1054, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/sossusvlei.jpg', width: 1400, areaKm2: 9000 } },
  },
  {
    id: 'lena-delta',
    adopted: true,
    wikipedia: 'Lena Delta Wildlife Reserve',
    answer: { lat: 72.6, lon: 126.5, place: 'レナ川デルタ', region: 'ロシア・サハ共和国', country: 'RU' },
    frame: { areaKm2: 2000, sensor: 'landsat', meters: 30 },
    headline: '北の海へ広がる無数の細い水路',
    caption:
      '地面が深くまで凍っていて水がしみ込めないので、川は地表を細かく枝分かれしながら海へ向かいます。網目がどこも同じ細かさなのは、傾きがほとんどない平らな土地だからです。',
    term: '永久凍土',
    scores: { distinct: 0.349, fame: 0, difficulty: 5 },
    image: { key: 'q/lena-delta.jpg', width: 1400, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/lena-delta.jpg', width: 1400, areaKm2: 18000 } },
  },
  {
    id: 'ngorongoro',
    adopted: true,
    wikipedia: 'Ngorongoro Crater',
    answer: { lat: -3.17, lon: 35.58, place: 'ンゴロンゴロ・クレーター', region: 'タンザニア・アルーシャ州', country: 'TZ' },
    frame: { areaKm2: 500, sensor: 'landsat', meters: 30 },
    headline: '草原に開いた円い窪み',
    caption:
      '火山が噴火のあとに自分の重みで陥没したので、外側の縁だけが円く残り、内側は平らな盆地になりました。底の白っぽい部分は、乾いた季節に塩が浮き出る浅い湖です。',
    term: 'カルデラ',
    scores: { distinct: 0.358, fame: 0, difficulty: 5 },
    image: { key: 'q/ngorongoro.jpg', width: 745, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/ngorongoro.jpg', width: 1400, areaKm2: 4500 } },
  },

  // 枠の上限を 20000km²（一辺141km）まで伸ばして拾い直したもの。
  // 2000km² では扇や三角州の内側だけが写り、模様にしか見えなかった。
  {
    id: 'panama',
    adopted: true,
    wikipedia: 'Panama Canal',
    answer: { lat: 9.16, lon: -79.75, place: 'パナマ運河', region: 'パナマ・コロン県', country: 'PA' },
    frame: { areaKm2: 10000, sensor: 'landsat', meters: 30 },
    headline: '二つの海にはさまれた細い陸地と、その中の黒い枝分かれ',
    caption:
      '谷をせき止めて人造湖を作り、そこを船が通れるようにしたので、もとの川筋の形がそのまま水面として残りました。左上の海と右下の海のあいだは、大陸がいちばん細くなっている場所のひとつです。',
    term: '閘門',
    scores: { distinct: 0.582, fame: 1, difficulty: 1 },
    image: { key: 'q/panama.jpg', width: 1400, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/panama.jpg', width: 1400, areaKm2: 90000 } },
  },
  {
    id: 'danube-delta',
    adopted: true,
    wikipedia: 'Danube Delta',
    answer: { lat: 45.15, lon: 29.3, place: 'ドナウ・デルタ', region: 'ルーマニア・トゥルチャ県', country: 'RO' },
    frame: { areaKm2: 10000, sensor: 'landsat', meters: 30 },
    headline: '海へ張り出した緑の土地と、その中の細かい水路',
    caption:
      '川が運んできた砂と泥が河口に積もり続けるので、陸が海のほうへ押し出され、流れがその中でいくつにも分かれます。緑の中に扇のような筋が並んでいるのは、かつての波打ち際が順に取り残されたあとです。',
    term: '三角州',
    scores: { distinct: 0.566, fame: 0.596, difficulty: 3 },
    image: { key: 'q/danube-delta.jpg', width: 1400, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/danube-delta.jpg', width: 1400, areaKm2: 90000 } },
  },
  {
    id: 'etosha',
    adopted: true,
    wikipedia: 'Etosha Pan',
    answer: { lat: -18.75, lon: 16.35, place: 'エトーシャ塩湖', region: 'ナミビア・オシコト州', country: 'NA' },
    frame: { areaKm2: 20000, sensor: 'landsat', meters: 30 },
    headline: '草原に横たわる巨大な白い皿',
    caption:
      'かつて湖だった窪地が干上がり、あとに残った塩と泥が地面を覆ったので、赤茶けた周りとくっきり分かれます。周囲に小さな白い点が散らばっているのは、同じようにできた小さな窪地です。',
    term: '塩性湿地',
    scores: { distinct: 0.421, fame: 0.23, difficulty: 4 },
    image: { key: 'q/etosha.jpg', width: 1400, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/etosha.jpg', width: 1400, areaKm2: 180000 } },
  },
  {
    id: 'okavango',
    adopted: true,
    wikipedia: 'Okavango Delta',
    answer: { lat: -19.35, lon: 22.85, place: 'オカバンゴ・デルタ', region: 'ボツワナ・北西地区', country: 'BW' },
    frame: { areaKm2: 20000, sensor: 'landsat', meters: 30 },
    headline: '乾いた土地に広がる緑の扇',
    caption:
      '川が海にたどり着かないまま砂の中へ広がって消えるので、水が扇の形に分かれて内陸に残ります。周りが乾いた色なのに扇の中だけ緑なのは、そこにだけ水が届いているからです。',
    term: '内陸デルタ',
    scores: { distinct: 0.376, fame: 0.617, difficulty: 2 },
    image: { key: 'q/okavango.jpg', width: 1400, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/okavango.jpg', width: 1400, areaKm2: 180000 } },
  },
  {
    id: 'lake-eyre',
    adopted: true,
    wikipedia: 'Kati Thanda–Lake Eyre',
    answer: { lat: -28.4, lon: 137.35, place: 'エア湖', region: 'オーストラリア・南オーストラリア州', country: 'AU' },
    frame: { areaKm2: 20000, sensor: 'landsat', meters: 30 },
    headline: '赤い大地にできた白い窪み',
    caption:
      'めったに水が来ない窪地で、たまに流れ込んだ水がそのまま蒸発して塩を残すので、地面が白く塗られたようになります。上から細く伸びている筋は、内陸から水を運んでくる川の跡です。',
    term: '内陸湖',
    scores: { distinct: 0.388, fame: 0.662, difficulty: 2 },
    image: { key: 'q/lake-eyre.jpg', width: 1400, date: '2000-12-01', credit: 'NASA Worldview / GIBS. Landsat data courtesy of the U.S. Geological Survey.', context: { key: 'ctx/lake-eyre.jpg', width: 1400, areaKm2: 180000 } },
  },

  // ────────────────────────────────────────────────────────────────
  // 以下は不採用。取得のたびに同じ画像が戻ってくるのを避けるために残す。
  // 落とした理由は reject に書く。判断の経緯は docs/IMAGERY.md にまとめてある。
  // ────────────────────────────────────────────────────────────────
  { id: 'kondyor', adopted: false, wikipedia: 'Kondyor Massif', answer: { lat: 57.58, lon: 134.66, place: 'コンダー山塊', region: 'ロシア・ハバロフスク地方', country: 'RU' }, frame: { areaKm2: 100, sensor: 'landsat', meters: 30 }, reject: '枠の右端に走査線状の欠測が残る' },
  { id: 'ounianga', adopted: false, wikipedia: 'Lakes of Ounianga', answer: { lat: 19.09, lon: 20.51, place: 'ウニアンガ湖群', region: 'チャド・エネディ地方', country: 'TD' }, frame: { areaKm2: 100, sensor: 'landsat', meters: 30 }, reject: '湖が枠の一部にしか写らず、周りの砂に埋もれる' },
  { id: 'dasht-e-kavir', adopted: false, wikipedia: 'Dasht-e Kavir', answer: { lat: 34.0, lon: 54.5, place: 'ダシュテ・カヴィール', region: 'イラン中央部', country: 'IR' }, frame: { areaKm2: 2000, sensor: 'landsat', meters: 30 }, reject: '靄がかかってコントラストが立たない' },
  { id: 'danakil', adopted: false, wikipedia: 'Danakil Depression', answer: { lat: 14.24, lon: 40.3, place: 'ダナキル低地', region: 'エチオピア・アファール州', country: 'ET' }, frame: { areaKm2: 1000, sensor: 'landsat', meters: 30 }, reject: '全体が白っぽく、地溝の段差が読めない' },
  { id: 'aral', adopted: false, wikipedia: 'Aral Sea', answer: { lat: 45, lon: 59, place: 'アラル海', region: 'ウズベキスタンとカザフスタンの境', country: 'UZ' }, frame: { areaKm2: 20000, sensor: 'landsat', meters: 30 }, reject: "水面と塩の平地の関係を、環境問題に触れずに2文で書けない（仕様 §14）" },
  { id: 'salar-atacama', adopted: false, wikipedia: 'Salar de Atacama', answer: { lat: -23.5, lon: -68.25, place: 'アタカマ塩湖', region: 'チリ・アントファガスタ州', country: 'CL' }, frame: { areaKm2: 10000, sensor: 'landsat', meters: 30 }, reject: "枠の左右の端に欠測の縞が入る" },
  { id: 'uyuni', adopted: false, wikipedia: 'Salar de Uyuni', answer: { lat: -20.2, lon: -67.6, place: 'ウユニ塩原', region: 'ボリビア・ポトシ県', country: 'BO' }, frame: { areaKm2: 10000, sensor: 'landsat', meters: 30 }, reject: "枠を広げても年次モザイクの白飛びが取れず、塩原が濁った色にしか写らない" },
  { id: 'chuquicamata', adopted: false, wikipedia: 'Chuquicamata', answer: { lat: -22.3, lon: -68.9, place: 'チュキカマタ銅山', region: 'チリ・アントファガスタ州', country: 'CL' }, frame: { areaKm2: 200, sensor: 'landsat', meters: 30 }, reject: '30m ではコントラストが立たず、穴の輪郭が読めない' },
  { id: 'vatnajokull', adopted: false, wikipedia: 'Vatnajökull', answer: { lat: 64.41, lon: -16.8, place: 'ヴァトナヨークトル', region: 'アイスランド南東部', country: 'IS' }, frame: { areaKm2: 2000, sensor: 'landsat', meters: 30 }, reject: '雪氷で全面が白飛びする' },
  { id: 'manaus', adopted: false, wikipedia: 'Meeting of Waters', answer: { lat: -3.14, lon: -59.9, place: 'ネグロ川とソリモンイス川の合流点', region: 'ブラジル・アマゾナス州', country: 'BR' }, frame: { areaKm2: 500, sensor: 'landsat', meters: 30 }, reject: '走査線状の欠測が画面を覆っている' },
  { id: 'everest', adopted: false, wikipedia: 'Mount Everest', answer: { lat: 27.95, lon: 86.9, place: 'エベレスト', region: 'ネパール・サガルマタ国立公園', country: 'NP' }, frame: { areaKm2: 500, sensor: 'landsat', meters: 30 }, reject: '雪と岩が入り乱れ、どれが頂か分からない' },
  { id: 'lencois', adopted: false, wikipedia: 'Lençóis Maranhenses National Park', answer: { lat: -2.55, lon: -43.13, place: 'レンソイス・マラニャンセス', region: 'ブラジル・マラニョン州', country: 'BR' }, frame: { areaKm2: 500, sensor: 'landsat', meters: 30 }, reject: '走査線状の欠測が画面を覆っている' },
  { id: 'balkhash', adopted: false, wikipedia: 'Lake Balkhash', answer: { lat: 46.8, lon: 74.9, place: 'バルハシ湖', region: 'カザフスタン・カラガンダ州', country: 'KZ' }, frame: { areaKm2: 20000, sensor: 'landsat', meters: 30 }, reject: "湖面を横切る色付きの筋（欠測）が残る" },
  { id: 'natron', adopted: false, wikipedia: 'Lake Natron', answer: { lat: -2.4, lon: 36.0, place: 'ナトロン湖', region: 'タンザニア・アルーシャ州', country: 'TZ' }, frame: { areaKm2: 1000, sensor: 'landsat', meters: 30 }, reject: '水面全体に斑点状の欠測が出ている' },
];

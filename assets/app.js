// 出題・採点・進行（仕様 §7）。
//
// ランキングは作らない（原則7）。競技性を入れると、外した人が離脱する方向に力がかかる。
// 確かめたいのは逆のこと ──「大きく外しても次をめくるか」。

(function () {
  'use strict';

  const config = window.EARTH_PATCH_CONFIG;
  const world = window.EARTH_PATCH_WORLD;
  const manifest = window.EARTH_PATCH_MANIFEST || {};
  const allQuestions = window.EARTH_PATCH_QUESTIONS || [];
  const { WorldMap, haversine } = window.EarthPatchMap;

  const el = (id) => document.getElementById(id);

  const dom = {
    body: document.body,
    progress: el('progress'),
    photo: el('photo'),
    photoImg: el('photo-img'),
    ask: el('ask'),
    verdict: el('verdict'),
    hintBtn: el('hint-btn'),
    hint: el('hint'),
    labelsToggle: el('labels-toggle'),
    map: el('map'),
    submitBtn: el('submit-btn'),
    submitNote: el('submit-note'),
    score: el('score'),
    place: el('place'),
    region: el('region'),
    coord: el('coord'),
    headline: el('headline'),
    caption: el('caption'),
    term: el('term'),
    context: el('context'),
    contextImg: el('context-img'),
    contextBox: el('context-box'),
    contextCaption: el('context-caption'),
    mapsLink: el('maps-link'),
    credit: el('credit'),
    nextBtn: el('next-btn'),
    total: el('total'),
    summaryNote: el('summary-note'),
    missed: el('missed'),
    restartBtn: el('restart-btn'),
  };

  // ── 保存（仕様 §7.3）──────────────────────────────
  // localStorage が使えない環境ではメモリだけで動かし、落とさない。
  const store = (function () {
    let memory = null;
    const empty = { recent: [], sets: 0 };
    function read() {
      try {
        const raw = window.localStorage.getItem(config.storage.key);
        return raw ? Object.assign({}, empty, JSON.parse(raw)) : Object.assign({}, empty);
      } catch (error) {
        return memory ? Object.assign({}, memory) : Object.assign({}, empty);
      }
    }
    function write(value) {
      memory = value;
      try {
        window.localStorage.setItem(config.storage.key, JSON.stringify(value));
      } catch (error) {
        /* 保存できなくても続行する */
      }
    }
    return { read: read, write: write };
  })();

  // ── 出題セットを組む（仕様 §5.5 / §7.3）──────────
  function playable() {
    return allQuestions.filter(
      (q) => q.adopted === true && q.image && manifest[q.image.key] !== undefined,
    );
  }

  function pickSet() {
    const pool = playable();
    const plan = config.set.difficultyPlan;
    const size = Math.min(config.set.size, pool.length);
    const saved = store.read();

    // 直近に出したものを避ける。数が足りなければ古いものから解禁する。
    let excluded = new Set(saved.recent.slice(-config.set.recentExclude));
    let available = pool.filter((q) => !excluded.has(q.id));
    let release = saved.recent.slice(-config.set.recentExclude);
    while (available.length < size && release.length) {
      release = release.slice(1);
      excluded = new Set(release);
      available = pool.filter((q) => !excluded.has(q.id));
    }

    const remaining = shuffle(available.slice());
    const chosen = [];
    for (let i = 0; i < size; i++) {
      const wanted = plan[Math.min(i, plan.length - 1)];
      const index = bestIndex(remaining, wanted, chosen);
      if (index < 0) break;
      chosen.push(remaining.splice(index, 1)[0]);
    }

    // 出題は易しい順（仕様 §5.5）。
    chosen.sort((a, b) => a.scores.difficulty - b.scores.difficulty);
    return spreadCountries(chosen);
  }

  /** 望む難易度にいちばん近いものを選ぶ。同じ国が続きにくいよう軽く避ける。 */
  function bestIndex(list, wanted, chosen) {
    let best = -1;
    let bestCost = Infinity;
    const lastCountry = chosen.length ? chosen[chosen.length - 1].answer.country : null;
    for (let i = 0; i < list.length; i++) {
      let cost = Math.abs(list[i].scores.difficulty - wanted) * 10;
      if (list[i].answer.country === lastCountry) cost += 3;
      if (cost < bestCost) {
        bestCost = cost;
        best = i;
      }
    }
    return best;
  }

  /** 同じ国が3問続くと検査に落ちる（仕様 §10）。並べ替えで解消する。 */
  function spreadCountries(list) {
    for (let i = 2; i < list.length; i++) {
      const country = list[i].answer.country;
      if (list[i - 1].answer.country !== country || list[i - 2].answer.country !== country) continue;
      for (let j = i + 1; j < list.length; j++) {
        if (list[j].answer.country === country) continue;
        const moved = list.splice(j, 1)[0];
        list.splice(i, 0, moved);
        break;
      }
    }
    return list;
  }

  function shuffle(list) {
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const t = list[i];
      list[i] = list[j];
      list[j] = t;
    }
    return list;
  }

  // ── 状態 ─────────────────────────────────────────
  const state = {
    set: [],
    index: 0,
    results: [],
    guess: null,
    hintUsed: false,
    phase: 'question',
  };

  const map = new WorldMap(dom.map, world, config);
  map.onPin = function (coord) {
    if (state.phase !== 'question') return;
    state.guess = coord;
    dom.submitBtn.disabled = false;
    dom.submitNote.textContent = '';
  };

  // ── 画面 ─────────────────────────────────────────
  function startSet() {
    state.set = pickSet();
    state.index = 0;
    state.results = [];
    if (!state.set.length) {
      dom.body.dataset.phase = 'question';
      dom.ask.textContent = '出題できる問題がありません。npm run fetch を走らせてください。';
      return;
    }
    showQuestion();
  }

  function currentQuestion() {
    return state.set[state.index];
  }

  function showQuestion() {
    const question = currentQuestion();
    state.phase = 'question';
    state.guess = null;
    state.hintUsed = false;
    dom.body.dataset.phase = 'question';

    dom.progress.textContent = `${state.index + 1} / ${state.set.length}`;
    dom.ask.textContent = 'ここはどこ？';
    dom.verdict.textContent = '';
    dom.hint.hidden = true;
    dom.hintBtn.disabled = false;
    dom.hintBtn.hidden = false;
    dom.submitBtn.disabled = true;
    dom.submitNote.textContent = '地図をタップしてピンを立ててください';

    // 引き伸ばさない。枠が小さい問題は小さく出す（仕様 §5.4）。
    dom.photoImg.src = imageUrl(question.image.key);
    dom.photoImg.alt = `衛星画像（${question.frame.areaKm2} km² の範囲）`;
    dom.photoImg.style.maxWidth = `min(100%, ${question.image.width}px)`;

    map.pins = { guess: null, answer: null };
    map.interactive = true;
    map.resetView();
    // 終了画面のあいだ地図は非表示で、その間に窓の大きさが変わっても測り直せない。
    // 出題画面に戻ったここで測り直す。
    map.resize();
    // 左の列で画像が入れ替わると、右の地図の幅も変わりうる。
    window.requestAnimationFrame(function () {
      map.resize();
    });
  }

  function imageUrl(key) {
    return config.imageBase + key;
  }

  /**
   * 結果画面の広域画像。出題した枠を白い四角で重ねる。
   * 枠の一辺は広域の 1 / sideScale なので、位置と大きさは計算で出せる。
   */
  function showContext(question) {
    const context = question.image.context;
    const scale = config.context.sideScale;
    const share = 100 / scale;

    dom.contextImg.src = imageUrl(context.key);
    dom.contextImg.alt = `もっと広い範囲の衛星画像（${context.areaKm2} km²）`;
    dom.contextImg.style.maxWidth = `min(100%, ${context.width}px)`;

    dom.contextBox.style.left = `${(100 - share) / 2}%`;
    dom.contextBox.style.top = `${(100 - share) / 2}%`;
    dom.contextBox.style.width = `${share}%`;
    dom.contextBox.style.height = `${share}%`;

    const sideKm = Math.sqrt(question.frame.areaKm2);
    dom.contextCaption.textContent =
      `白い枠の中が、さっき出した範囲（一辺 約${sideKm.toFixed(0)} km）。` +
      `まわりはその${scale}倍の広さです。`;
  }

  // ── ヒント（仕様 §7.1）──────────────────────────
  function showHint() {
    if (state.phase !== 'question' || state.hintUsed) return;
    const question = currentQuestion();
    const sideKm = Math.sqrt(question.frame.areaKm2);
    const reference = nearestReference(sideKm);
    state.hintUsed = true;
    dom.hint.hidden = false;
    dom.hint.textContent =
      `この画像の幅はおよそ ${sideKm.toFixed(0)} km。` +
      `${reference.label}（約 ${reference.km} km）とだいたい同じです。`;
    dom.hintBtn.disabled = true;
  }

  function nearestReference(sideKm) {
    const list = config.hint.references;
    let best = list[0];
    let bestGap = Infinity;
    for (let i = 0; i < list.length; i++) {
      const gap = Math.abs(Math.log(list[i].km / sideKm));
      if (gap < bestGap) {
        bestGap = gap;
        best = list[i];
      }
    }
    return best;
  }

  // ── 採点（仕様 §8.2 / §8.3）──────────────────────
  function submit() {
    if (state.phase !== 'question' || !state.guess) return;
    const question = currentQuestion();
    const answer = { lat: question.answer.lat, lon: question.answer.lon };
    const distanceKm = haversine(state.guess, answer, config.score.earthRadiusKm);
    const score = Math.round(config.score.max * Math.exp(-distanceKm / config.score.decayKm));
    const band = judgeBand(state.guess, question);

    state.results.push({
      question: question,
      guess: state.guess,
      distanceKm: distanceKm,
      score: score,
      hintUsed: state.hintUsed,
    });
    showResult(question, distanceKm, score, band);
  }

  /**
   * 定性的な帯（仕様 §8.3）。数字だけを返すのは冷たいので言葉を添える。
   * 正解側の国も同じ point-in-polygon で決める。data の country と
   * 判定がずれても、プレイヤーから見て矛盾しないようにするため。
   */
  function judgeBand(guess, question) {
    const bands = config.result.bands;
    const answerCountry =
      map.countryAt(question.answer.lon, question.answer.lat) ||
      findByIso(question.answer.country);
    const guessCountry = map.countryAt(guess.lon, guess.lat);

    if (!guessCountry) return bands.ocean;
    if (!answerCountry) return bands.other;
    if (guessCountry.iso === answerCountry.iso) return bands.sameCountry;
    if (guessCountry.continent === answerCountry.continent) {
      const adjacent =
        answerCountry.neighbors.indexOf(guessCountry.iso) >= 0 ||
        guessCountry.neighbors.indexOf(answerCountry.iso) >= 0;
      return adjacent ? bands.neighborCountry : bands.sameContinent;
    }
    return bands.other;
  }

  function findByIso(iso) {
    for (let i = 0; i < world.countries.length; i++) {
      if (world.countries[i].iso === iso) return world.countries[i];
    }
    return null;
  }

  function showResult(question, distanceKm, score, band) {
    state.phase = 'result';
    dom.body.dataset.phase = 'result';

    showContext(question);

    map.pins.answer = { lat: question.answer.lat, lon: question.answer.lon };
    map.interactive = false;
    map.framePoints([state.guess, map.pins.answer]);

    dom.ask.textContent = '';
    dom.verdict.textContent = band;
    dom.hintBtn.hidden = true;
    dom.hint.hidden = true;
    dom.score.textContent = `${formatKm(distanceKm)} ／ ${score.toLocaleString('ja-JP')} 点`;

    dom.place.textContent = question.answer.place;
    dom.region.textContent = question.answer.region;
    dom.coord.textContent = formatCoord(question.answer.lat, question.answer.lon);
    dom.headline.textContent = question.headline;
    dom.caption.textContent = question.caption;
    dom.term.textContent = `── ${question.term} と呼ばれています`;

    dom.mapsLink.href =
      `https://www.google.com/maps/@${question.answer.lat},${question.answer.lon},` +
      `${config.result.mapsZoom}z/data=!3m1!1e3`;

    const entry = manifest[question.image.key] || {};
    const hint = state.hintUsed ? '　ヒントを使いました' : '';
    dom.credit.textContent = `${question.image.date} ／ ${entry.credit || question.image.credit}${hint}`;

    dom.nextBtn.textContent = state.index + 1 < state.set.length ? '次へ' : '結果を見る';
  }

  function next() {
    if (state.phase !== 'result') return;
    if (state.index + 1 < state.set.length) {
      state.index++;
      showQuestion();
      return;
    }
    showSummary();
  }

  // ── 終了画面（仕様 §7.3）────────────────────────
  function showSummary() {
    state.phase = 'summary';
    dom.body.dataset.phase = 'summary';

    const total = state.results.reduce((sum, r) => sum + r.score, 0);
    dom.total.textContent = `${total.toLocaleString('ja-JP')} 点 ／ ${state.set.length} 問`;

    const missed = state.results
      .filter((r) => r.distanceKm >= config.summary.missedKm)
      .sort((a, b) => b.distanceKm - a.distanceKm);

    dom.summaryNote.textContent = missed.length
      ? '大きく外した場所です。もう一度見ておくと、次はどこかで効きます。'
      : 'すべて近くまで寄せています。';

    dom.missed.textContent = '';
    for (let i = 0; i < missed.length; i++) {
      dom.missed.appendChild(missedItem(missed[i]));
    }

    const saved = store.read();
    saved.recent = saved.recent.concat(state.set.map((q) => q.id)).slice(-config.set.recentExclude * 2);
    saved.sets = (saved.sets || 0) + 1;
    store.write(saved);
  }

  function missedItem(result) {
    const item = document.createElement('li');

    const img = document.createElement('img');
    img.src = imageUrl(result.question.image.key);
    img.alt = '';
    img.loading = 'lazy';

    const text = document.createElement('div');
    const place = document.createElement('b');
    place.textContent = result.question.answer.place;
    const meta = document.createElement('span');
    meta.textContent = `${result.question.answer.region}　${formatKm(result.distanceKm)}`;
    text.appendChild(place);
    text.appendChild(meta);

    item.appendChild(img);
    item.appendChild(text);
    return item;
  }

  // ── 表示の整形 ───────────────────────────────────
  function formatKm(km) {
    if (km < 10) return `${km.toFixed(1)} km`;
    return `${Math.round(km).toLocaleString('ja-JP')} km`;
  }

  function formatCoord(lat, lon) {
    const ns = lat >= 0 ? 'N' : 'S';
    const ew = lon >= 0 ? 'E' : 'W';
    return `${Math.abs(lat).toFixed(2)}${ns} ${Math.abs(lon).toFixed(2)}${ew}`;
  }

  // ── 入力 ─────────────────────────────────────────
  dom.submitBtn.addEventListener('click', submit);
  dom.nextBtn.addEventListener('click', next);
  dom.hintBtn.addEventListener('click', showHint);
  dom.restartBtn.addEventListener('click', startSet);

  el('zoom-in').addEventListener('click', () => map.zoomAt(config.map.zoomStep));
  el('zoom-out').addEventListener('click', () => map.zoomAt(1 / config.map.zoomStep));
  el('zoom-reset').addEventListener('click', () => map.resetView());

  dom.labelsToggle.checked = config.map.showCountryLabels;
  dom.labelsToggle.addEventListener('change', function () {
    map.showLabels = dom.labelsToggle.checked;
    map.draw();
  });

  // キーボード（仕様 §7.1）: Enter 決定、H ヒント。
  document.addEventListener('keydown', function (event) {
    if (event.target.matches('input, textarea, a, button')) return;
    if (event.key === config.keys.submit) {
      if (state.phase === 'question') submit();
      else if (state.phase === 'result') next();
      return;
    }
    if (event.key.toLowerCase() === config.keys.hint) showHint();
  });

  window.addEventListener('resize', function () {
    map.resize();
  });

  dom.photoImg.addEventListener('error', function () {
    dom.photo.classList.add('broken');
  });
  dom.photoImg.addEventListener('load', function () {
    dom.photo.classList.remove('broken');
  });

  // ── 起動 ─────────────────────────────────────────
  map.resize();
  startSet();
  // 初回はレイアウトが決まってから測り直す。
  window.requestAnimationFrame(function () {
    map.resize();
  });
})();

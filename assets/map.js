// 投影・描画・point-in-polygon（仕様 §8）。
//
// 回答用の地図に衛星画像は使わない（原則2）。ここで描くのは陸地と国境の線だけ。
// 投影は正距円筒図法。Web メルカトルだと高緯度が引き伸ばされ、
// 砂漠・シベリア・カナダ北部にピンを置くのが不当に易しくなる（仕様 §8.1）。

(function () {
  'use strict';

  const RAD = Math.PI / 180;

  const COLORS = {
    ocean: '#0e1319',
    land: '#232a33',
    border: '#39424f',
    coast: '#4a5563',
    label: '#8b94a3',
    guess: '#f0b429',
    answer: '#57c07f',
    link: '#8d95a3',
  };

  /** 経度差を -180〜180 に畳む。日付変更線をまたぐ計算で必ず通す（仕様 §8.2）。 */
  function normalizeLonDelta(deltaDeg) {
    return ((deltaDeg + 540) % 360) - 180;
  }

  /** 大圏距離（km）。地図上のピクセル距離は使わない（仕様 §8.2）。 */
  function haversine(a, b, earthRadiusKm) {
    const dLat = (b.lat - a.lat) * RAD;
    const dLon = normalizeLonDelta(b.lon - a.lon) * RAD;
    const h =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(a.lat * RAD) * Math.cos(b.lat * RAD) * Math.sin(dLon / 2) ** 2;
    return 2 * earthRadiusKm * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  /** 交差数による内外判定（ray casting）。穴を持つ多角形も偶奇で扱える。 */
  function pointInRings(lon, lat, rings) {
    let inside = false;
    for (let r = 0; r < rings.length; r++) {
      const ring = rings[r];
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const xi = ring[i][0];
        const yi = ring[i][1];
        const xj = ring[j][0];
        const yj = ring[j][1];
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
          inside = !inside;
        }
      }
    }
    return inside;
  }

  function WorldMap(canvas, world, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.config = config;
    this.mapCfg = config.map;

    this.showLabels = this.mapCfg.showCountryLabels;
    this.view = { scale: 1, x: 0, y: 0 };
    this.pins = { guess: null, answer: null };
    this.interactive = true;
    this.onPin = null;

    this.width = 0;
    this.height = 0;
    this.drag = null;

    this.bindEvents();
  }

  WorldMap.prototype.lonSpan = function () {
    return this.mapCfg.lonMax - this.mapCfg.lonMin;
  };

  WorldMap.prototype.latSpan = function () {
    return this.mapCfg.latMax - this.mapCfg.latMin;
  };

  // ── 投影（仕様 §8.1）──────────────────────────────
  WorldMap.prototype.project = function (lon, lat) {
    return {
      x: ((lon - this.mapCfg.lonMin) / this.lonSpan()) * this.width,
      y: ((this.mapCfg.latMax - lat) / this.latSpan()) * this.height,
    };
  };

  WorldMap.prototype.unproject = function (x, y) {
    return {
      lon: (x / this.width) * this.lonSpan() + this.mapCfg.lonMin,
      lat: this.mapCfg.latMax - (y / this.height) * this.latSpan(),
    };
  };

  /** 画面座標 → 地図座標。ズームと移動を戻す。 */
  WorldMap.prototype.toMapSpace = function (clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: (clientX - rect.left - this.view.x) / this.view.scale,
      y: (clientY - rect.top - this.view.y) / this.view.scale,
    };
  };

  // ── 表示サイズ ────────────────────────────────────
  WorldMap.prototype.resize = function () {
    const rect = this.canvas.getBoundingClientRect();
    if (!rect.width) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    this.width = rect.width;
    this.height = rect.height;
    this.canvas.width = Math.round(rect.width * ratio);
    this.canvas.height = Math.round(rect.height * ratio);
    this.ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    this.clampView();
    this.draw();
  };

  // ── ズームと移動（仕様 §8.1: scale と translate だけ）──
  WorldMap.prototype.clampView = function () {
    const scale = Math.max(this.mapCfg.minZoom, Math.min(this.mapCfg.maxZoom, this.view.scale));
    this.view.scale = scale;
    const maxX = 0;
    const minX = this.width - this.width * scale;
    const maxY = 0;
    const minY = this.height - this.height * scale;
    this.view.x = Math.min(maxX, Math.max(minX, this.view.x));
    this.view.y = Math.min(maxY, Math.max(minY, this.view.y));
  };

  WorldMap.prototype.zoomAt = function (factor, clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const px = clientX === undefined ? this.width / 2 : clientX - rect.left;
    const py = clientY === undefined ? this.height / 2 : clientY - rect.top;
    const before = { x: (px - this.view.x) / this.view.scale, y: (py - this.view.y) / this.view.scale };
    this.view.scale = Math.max(
      this.mapCfg.minZoom,
      Math.min(this.mapCfg.maxZoom, this.view.scale * factor),
    );
    this.view.x = px - before.x * this.view.scale;
    this.view.y = py - before.y * this.view.scale;
    this.clampView();
    this.draw();
  };

  WorldMap.prototype.resetView = function () {
    this.view = { scale: 1, x: 0, y: 0 };
    this.draw();
  };

  /** 2点が両方入るところまで寄せる。結果画面で使う。 */
  WorldMap.prototype.framePoints = function (points) {
    this.view = { scale: 1, x: 0, y: 0 };
    if (points.length < 2) return this.draw();
    const projected = points.map((p) => this.project(p.lon, p.lat));
    const minX = Math.min.apply(null, projected.map((p) => p.x));
    const maxX = Math.max.apply(null, projected.map((p) => p.x));
    const minY = Math.min.apply(null, projected.map((p) => p.y));
    const maxY = Math.max.apply(null, projected.map((p) => p.y));
    const margin = 0.35;
    const spanX = Math.max(maxX - minX, this.width * 0.06) * (1 + margin);
    const spanY = Math.max(maxY - minY, this.height * 0.06) * (1 + margin);
    const scale = Math.max(
      this.mapCfg.minZoom,
      Math.min(this.mapCfg.maxZoom, Math.min(this.width / spanX, this.height / spanY)),
    );
    this.view.scale = scale;
    this.view.x = this.width / 2 - ((minX + maxX) / 2) * scale;
    this.view.y = this.height / 2 - ((minY + maxY) / 2) * scale;
    this.clampView();
    this.draw();
  };

  // ── 描画 ─────────────────────────────────────────
  WorldMap.prototype.draw = function () {
    if (!this.width) return;
    const ctx = this.ctx;
    const scale = this.view.scale;

    ctx.save();
    ctx.fillStyle = COLORS.ocean;
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.translate(this.view.x, this.view.y);
    ctx.scale(scale, scale);

    // 陸地のシルエット。1本のパスにまとめて塗ると継ぎ目が出ない。
    ctx.beginPath();
    for (let i = 0; i < this.world.land.length; i++) this.tracePath(ctx, this.world.land[i]);
    ctx.fillStyle = COLORS.land;
    ctx.fill();

    // 国境。線幅はズームで割り、見た目の太さを一定に保つ。
    ctx.lineWidth = 0.7 / scale;
    ctx.strokeStyle = COLORS.border;
    ctx.beginPath();
    for (let i = 0; i < this.world.countries.length; i++) {
      const rings = this.world.countries[i].rings;
      for (let j = 0; j < rings.length; j++) this.tracePath(ctx, rings[j]);
    }
    ctx.stroke();

    // 海岸線を少し明るく。陸の輪郭が地図の骨格になる。
    ctx.lineWidth = 0.9 / scale;
    ctx.strokeStyle = COLORS.coast;
    ctx.beginPath();
    for (let i = 0; i < this.world.land.length; i++) this.tracePath(ctx, this.world.land[i]);
    ctx.stroke();

    ctx.restore();

    if (this.showLabels) this.drawLabels();
    this.drawPins();
  };

  WorldMap.prototype.tracePath = function (ctx, ring) {
    const first = this.project(ring[0][0], ring[0][1]);
    ctx.moveTo(first.x, first.y);
    for (let i = 1; i < ring.length; i++) {
      const p = this.project(ring[i][0], ring[i][1]);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
  };

  /**
   * 国名ラベル。仕様 §8.4 の「難易度の調整弁」。
   * ラベルがないと、地理に不慣れな人には地図が模様にしか見えない。
   */
  WorldMap.prototype.drawLabels = function () {
    const ctx = this.ctx;
    const scale = this.view.scale;
    // 地図が狭いほどラベルが詰まるので、しきい値を幅に反比例させる。
    const density = Math.max(1, this.mapCfg.labelReferenceWidth / this.width);
    const minArea =
      (scale > 1.6 ? this.mapCfg.labelMinAreaDeg2Zoomed : this.mapCfg.labelMinAreaDeg2) * density;

    ctx.save();
    ctx.fillStyle = COLORS.label;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '11px system-ui, -apple-system, "Hiragino Sans", sans-serif';

    const placed = [];
    for (let i = 0; i < this.world.countries.length; i++) {
      const country = this.world.countries[i];
      if (country.area < minArea) continue;
      const p = this.project(country.label[0], country.label[1]);
      const x = p.x * scale + this.view.x;
      const y = p.y * scale + this.view.y;
      if (x < 4 || x > this.width - 4 || y < 8 || y > this.height - 8) continue;

      // 重なったラベルは後から来たほうを落とす。
      const width = ctx.measureText(country.name).width;
      let overlaps = false;
      for (let j = 0; j < placed.length; j++) {
        const q = placed[j];
        if (Math.abs(q.x - x) < (q.width + width) / 2 + 4 && Math.abs(q.y - y) < 13) {
          overlaps = true;
          break;
        }
      }
      if (overlaps) continue;
      placed.push({ x: x, y: y, width: width });
      ctx.fillText(country.name, x, y);
    }
    ctx.restore();
  };

  WorldMap.prototype.drawPins = function () {
    const ctx = this.ctx;
    const guess = this.pins.guess;
    const answer = this.pins.answer;
    if (!guess && !answer) return;

    const toScreen = (point) => {
      const p = this.project(point.lon, point.lat);
      return { x: p.x * this.view.scale + this.view.x, y: p.y * this.view.scale + this.view.y };
    };

    ctx.save();
    if (guess && answer) {
      const a = toScreen(guess);
      const b = toScreen(answer);
      ctx.strokeStyle = COLORS.link;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (guess) this.drawPin(toScreen(guess), COLORS.guess);
    if (answer) this.drawPin(toScreen(answer), COLORS.answer);
    ctx.restore();
  };

  WorldMap.prototype.drawPin = function (point, color) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.arc(point.x, point.y, 6, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#0e1319';
    ctx.stroke();
  };

  // ── 操作 ─────────────────────────────────────────
  WorldMap.prototype.bindEvents = function () {
    const self = this;

    this.canvas.addEventListener('pointerdown', function (event) {
      self.drag = {
        id: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        viewX: self.view.x,
        viewY: self.view.y,
        moved: false,
      };
      self.canvas.setPointerCapture(event.pointerId);
    });

    this.canvas.addEventListener('pointermove', function (event) {
      if (!self.drag || self.drag.id !== event.pointerId) return;
      const dx = event.clientX - self.drag.startX;
      const dy = event.clientY - self.drag.startY;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) self.drag.moved = true;
      if (!self.drag.moved) return;
      self.view.x = self.drag.viewX + dx;
      self.view.y = self.drag.viewY + dy;
      self.clampView();
      self.draw();
    });

    const finish = function (event) {
      if (!self.drag || self.drag.id !== event.pointerId) return;
      const moved = self.drag.moved;
      self.drag = null;
      if (moved || !self.interactive) return;
      const point = self.toMapSpace(event.clientX, event.clientY);
      if (point.x < 0 || point.y < 0 || point.x > self.width || point.y > self.height) return;
      const coord = self.unproject(point.x, point.y);
      coord.lon = ((coord.lon + 540) % 360) - 180;
      self.pins.guess = coord;
      self.draw();
      if (self.onPin) self.onPin(coord);
    };
    this.canvas.addEventListener('pointerup', finish);
    this.canvas.addEventListener('pointercancel', function () {
      self.drag = null;
    });

    this.canvas.addEventListener(
      'wheel',
      function (event) {
        event.preventDefault();
        self.zoomAt(event.deltaY < 0 ? 1.15 : 1 / 1.15, event.clientX, event.clientY);
      },
      { passive: false },
    );
  };

  // ── 国の判定（仕様 §8.3）─────────────────────────
  WorldMap.prototype.countryAt = function (lon, lat) {
    for (let i = 0; i < this.world.countries.length; i++) {
      if (pointInRings(lon, lat, this.world.countries[i].rings)) return this.world.countries[i];
    }
    // Natural Earth 1:110m は海岸線が粗く、沿岸の都市を指しても陸から外れる。
    // 一定距離までなら最寄りの国とみなす（assets/config.js の map.coastSnapKm）。
    return this.nearestCountry(lon, lat, this.mapCfg.coastSnapKm);
  };

  WorldMap.prototype.nearestCountry = function (lon, lat, maxKm) {
    const here = { lat: lat, lon: lon };
    const radius = this.config.score.earthRadiusKm;
    let best = null;
    let bestKm = maxKm;
    for (let i = 0; i < this.world.countries.length; i++) {
      const country = this.world.countries[i];
      for (let j = 0; j < country.rings.length; j++) {
        const ring = country.rings[j];
        for (let k = 0; k < ring.length; k++) {
          const km = haversine(here, { lat: ring[k][1], lon: ring[k][0] }, radius);
          if (km < bestKm) {
            bestKm = km;
            best = country;
          }
        }
      }
    }
    return best;
  };

  window.EarthPatchMap = {
    WorldMap: WorldMap,
    haversine: haversine,
    normalizeLonDelta: normalizeLonDelta,
    pointInRings: pointInRings,
  };
})();

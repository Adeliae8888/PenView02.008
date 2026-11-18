# PenView02.008 (TacView02) 仕様書

> 元リポジトリ: https://github.com/Adeliae8888/PenView02.008
> 本書は既存実装（`app.js` 約5,000行 / `index.html` / `styles.css` / `sw.js` / `manifest.webmanifest` / `DATA/`）を読み取って逆起こしした、再実装用の仕様書。
> 「§17 既存実装の癖・未使用コード」は再実装時に踏襲不要／要判断の項目。

---

## 1. 概要

| 項目 | 内容 |
|---|---|
| アプリ名 | TacView02（リポジトリ名: PenView02.008）|
| 種別 | 航空戦術状況認識のための単一ページ PWA（日本語UI）|
| 目的 | 地図上に空域・敵味方・脅威圏・自機位置を重ねて表示し、B/E(Bullseye)・Hook・TOT・SEAD(HARM)・MEZ警報・タイムラインを支援する |
| 想定端末 | タブレット/スマホ（タッチ・ピンチ操作）＋PC（右クリック・ホイール）|
| 技術 | 素のHTML/CSS/JS（フレームワーク・ビルド・外部ライブラリ・外部地図タイル なし）。描画はSVG。永続化は `localStorage` |
| 動作 | 完全オフライン動作（ネットワーク不要）。GPSは `navigator.geolocation` |
| 言語/単位 | UI日本語。距離=海里(nm)、速度=ノット(kt)、方位=度（磁方位表示が基本）|

### 1.1 用語
- **B/E**: Bullseye（基準点）。ここからの方位/距離で位置を表現。
- **Hook**: 地図上のオブジェクト/点を選択し、自機からの方位/距離を表示する機能。
- **S/H**: 自機Hook（Self Hook）ウィンドウ。
- **DOL**: Dynamic Object List。動的オブジェクトの簡易編集ウィンドウ。
- **MEZ**: ミサイル交戦圏。動的オブジェクトの赤い円。自機が円内に入ると警報。
- **SEAD/HARM**: 対レーダーミサイル管理（発射後ToFカウントダウン）。
- **TOT**: Time On Target。指定時刻に目標へ到達するための必要速度。
- **TOS**: Time On Station。現在速度で目標へ到達する時刻。
- **MARK**: 地図上の任意点に素早く置く動的オブジェクト。
- **SO / DO**: 長押しメニューの Static Object追加 / Dynamic Object追加。

---

## 2. ファイル構成

```
index.html               画面骨格・設定モーダル・テンキー・各パネルのDOM
styles.css               ダークテーマCSS（CSS変数）
app.js                   全ロジック（単一ファイル）
manifest.webmanifest     PWAマニフェスト（name TacView02 / short_name TacView / standalone / theme #0f172a / bg #07111d / icons 192,512）
sw.js                    Service Worker（cache-first、キャッシュ名 tacview02-vNNN-日付）※app.js側で起動時に登録解除している（§17）
icons/icon-192.png, icon-512.png   （manifest/swが参照。リポジトリには未同梱）
DATA/TacView02-current-preset.json   プリセット例（約1,185件の基本レイヤー）
DATA/jp_apt.geojson  空港 Point 167件（OpenAIP形式）
DATA/jp_asp.geojson  空域 Polygon 1182件（OpenAIP形式。基本レイヤー取込の対象）
DATA/jp_nav.geojson  航法援助施設 Point 127件
DATA/jp_obs.geojson  障害物 Point 2555件
```
※ `jp_apt/nav/obs` は現行アプリからは読み込まれない（ユーザーがGeoJSON取込で選べるのはPolygon/MultiPolygonのみ）。再実装で拡張する場合の素材。

---

## 3. 画面レイアウト

```
┌───────────────────────────────────────────────┐
│ [自機中央ボタン ◎] [設定 ⚙]  (panel-header)  │
│  floating windows (ドラッグ可)                │
│  ┌──────────── MAP (SVG 1000x700) ───────────┐ │
│  │ グリッド/ラベル・各レイヤー・自機・Hook線 │ │
│  │ カーソル座標 / スケールバー               │ │
│  └────────────────────────────────────────────┘ │
│  RANGE WARNING / TIMELINE ALERT (浮動)         │
│  テンキー(下部モーダル) / 長押しメニュー        │
└───────────────────────────────────────────────┘
設定モーダル(⚙)：各種設定＋レイヤー管理パネル
```

- 地図は画面全体（`main.map-panel`）。SVG `viewBox` は **1000×700**。
- 画面上に常時：カーソル座標（緯度/経度、現在の座標系で表示）、スケールバー（`n nm`）、選択中オブジェクト名（「未選択」/`レイヤー名 / オブジェクト名`）。
- 配色：背景 `#07111d`、パネル `#0f1d2f`、強調 `#132943`、文字 `#e2e8f0`、青 `#60a5fa`、緑 `#34d399`、赤 `#f87171`、琥珀 `#fbbf24`、紫 `#a78bfa`。`.hidden{display:none!important}`。

---

## 4. データモデル

### 4.1 localStorage キー
| キー | 内容 |
|---|---|
| `tacview02-state` | アプリ状態（§4.2）|
| `tacview02-windows` | ウィンドウ位置/表示/ドラッグ可否/カスタム定義 |
| `tacview02-view` | `{scale, panX, panY}` |
| `tacview02-initial-state` | 「初期値」スナップショット `{state, windows, view}`（初回起動時に自動作成）|

### 4.2 state
```
state = {
  basic:   BasicItem[],      // 基本レイヤー
  static:  MapObject[],      // 静的レイヤー
  dynamic: MapObject[],      // 動的レイヤー
  self: { enabled, lat, lon, x, y, heading(真方位°), speed(kt),
          gpsAvailable, gpsAccuracy(m), gpsUpdatedAt(ms) },
  markSettings: { name, type, symbol, circles:[{radius,color}×3] },
  basicVisible, staticVisible, dynamicVisible: boolean,
  seadLaunches: [{id, objectId, name, launchedAt(ms)}],
  seadInitialHarmRemain: number,
  settings: {
    mapCenter:{lat,lon}, bullseye:{lat,lon},
    coordSystem: 'DDMM.MMM'|'DDMMSS'|'MGRS'|'GARS',
    deviationMode: 'auto'|'manual', manualDeviation: number(度, W=-,E=+),
    displayScale: 100(固定扱い), symbolScaleBase: 0.5(固定),
    seadHarmTof: 秒, seadHarmRemain: 本数, seadArizona: 本数,
    totTime:'HH:MM:SS', totTof: 秒, totLaunchEnabled: boolean,
    timelineEvents: TimelineEvent[],
    notifications: { items: ('sead'|'mez'|'tot')[], text: string }
  }
}
```
- 保存時（`getPersistentState`）に **x,y（画面比率座標）は除去**し、緯度経度（lat/lon, geoPoints）を正とする。ロード時に x,y のみ持つ旧データは `mapCenter` を基準に lat/lon へ変換（互換）。
- **GPS未確定（`gpsAvailable!==true`）の間、自機は常に mapCenter の位置・画面中央(50,50)に固定**。
- 既定値: mapCenter (35,136)、bullseye (35.6895,139.6917)、coordSystem `DDMM.MMM`、deviationMode `auto`、manualDeviation 0、seadHarmTof 180、seadHarmRemain 10、seadArizona 2、totTof 0。
- サンプル初期データ：基本（CTR/ATZ空域、A/B基地、航路1）、静的（交戦帯・補給点・友軍A）、動的（敵機1/2・友軍B）。自機 enabled。

### 4.3 BasicItem（基本レイヤー）
共通: `id, type('airspace'|'base'|'route'), name, visible(既定true)`
- `airspace`: `kind('controlled'=CTR | 'control-zone'=ATZ), label(≤12字), displayName, displayNameVisible, fill(rgba), geoPoints:[[lat,lon]...], source('geojson'|undefined)`
- `base`: `lat, lon`（なければ x,y）
- `route`: `geoPoints`（破線ポリライン）
- 塗り: CTR `rgba(96,165,250,.08)`、ATZ `rgba(52,211,153,.09)`。

### 4.4 MapObject（静的/動的）
```
{ id, type:'enemy'|'neutral'|'ally'|'waypoint'|'line', name, layer,
  lat, lon, coordinateSystem,
  symbol:'diamond'|'square'|'triangle'|'circle'|'cross'|'missile'|'ddg'|'cv',
  geometryType:'none'|'circle'|'sector'|'ring', geometryRadius(nm),
  geometryStartBearing, geometryEndBearing,        // sector（真方位で保持）
  threat?:boolean, visible?:boolean,
  status?: 'ACTIVE'|'AWAKE'|'DOWN'|'DESTROYED'|'ASLEEP',  // 動的のみ実質使用
  circleConfig: [{radius(nm>0), color:'red'|'yellow'|'blue'|'green'}] (最大3),
  circleRadius1..3 / circleColor1..3 （互換用に同値を保持）,
  // type==='line'
  linePoints:[{lat,lon}...] (最大50), start/end（旧形式）, lineStyle:'solid'|'dashed'|'dotted',
  lineColor, lineWidth(1-5) }
```
- 同一エディタで静的・動的を管理（`managedLayer`で切替）。動的レイヤーは「円（最大3重）」設定を使い、保存時に `geometryType='circle'`、`geometryRadius=円1半径` へ正規化。

### 4.5 TimelineEvent
`{ id, name, time:'HH:MM:SS', alerts:[{id, alertColor:'GREEN'|'YELLOW'|'RED', alertOffset:秒(負可), alertEnabled}] }`
旧形式 `alertColor/alertOffset/alertEnabled` 直置きは alerts[0] に移行。

### 4.6 プリセットJSON
```
{ version:1, exportedAt:ISO8601, state, windows, view, initialState:{state,windows,view}|null }
```
ファイル名 `TacView02-current-preset.json`。読込時は `state.settings` の存在を検証し、4キーへ書き込んで **ページをリロード**。

---

## 5. 座標・投影・計算

### 5.1 地図投影（実際に描画に使用）
- 画面比率座標 (x,y) は 0–100（SVG座標は x×10, y×7）。
- `MAP_VIEW_SPAN = { lat:24°, lon:24×(1000/700)° }`。
- `geoToMapPosition(lat,lon)`（等距円筒＋中心緯度のcos補正、0–100にクランプ）
  - `f = max(0.1, cos(center.lat))`
  - `x = 50 + (lon-center.lon)/SPAN.lon × 100 × f`
  - `y = 50 - (lat-center.lat)/SPAN.lat × 100`
- 逆変換 `mapPositionToGeo`: `lat = c.lat + (50-y)/100×SPAN.lat`、`lon = c.lon + (x-50)/(100 f)×SPAN.lon`。
- 結果として初期表示は縦24° ≒ 1440nm 相当、縮尺は `scale`（0.25〜32）で変更。
- 円/扇の半径（nm）→画面単位：`r_map = nm×100/(SPAN.lat×60)`（x方向×10換算）。

### 5.2 距離・方位（球面）
- 地球半径 3440.065nm。
- `getGeoDistance`（haversine, nm）、`getGeoBearing`（初期方位, 0–360）、`getGeographicDestination(origin,bearing,distNm)`（球面直接解）。
- 地理円パスは **5°刻み(0〜360)の72角形**を `geoToMapPosition` で投影して作る。
- `calculateDistance` は 0.1nm丸め。`calculateBearing(from,to,deviation)` は **真方位−偏差**を四捨五入して磁方位化。
- 偏差: `toMagneticBearing(t)=(t−manualDeviation+360)%360`、`magneticToTrue(m)=(m+manualDeviation+360)%360`。**入力・表示の方位はすべて磁方位、内部保持は真方位**。
- B/E関連（平面近似）:
  - `bullseyeOffsetToGeo(bearing(真), dist)`: `lat = b.lat + d·cosθ/60`、`lon = b.lon + d·sinθ/(60·cos(b.lat))`
  - `geoToBullseyeOffset`: 逆。

### 5.3 座標フォーマット/パース（4系統）
| 系統 | 例 | 備考 |
|---|---|---|
| DDMM.MMM | `3541.234` / `13941.234` | 度(緯2桁/経3桁)+分3桁小数。符号は先頭`-`|
| DDMMSS | `354112.4N` / `1394112.4E` | 秒は小数1桁、末尾に半球文字 |
| MGRS | `54SUE1234567890` | UTM→MGRS（ゾーン例外 32V/31-37X 対応、1m精度）。WGS84 |
| GARS | `361LN34` 形式 | 30′セル+象限+キーパッド(1–9) |
- 入力パースは `parseDdmmm/Ddmmss/Mgrs/Gars`。MGRS/GARS は緯度欄に1本の文字列を入力し、経度も同じ文字列から復元。
- グリッド目盛ラベル: `DDD°MM′N/S/E/W`。

---

## 6. 地図描画

### 6.1 描画順（`renderMap`）
1. 緯度経度グリッド（`#mapViewport` 内）
2. B/Eマーカー（橙の同心円 r=16/11/6）
3. 基本レイヤー（`basicVisible`）
4. 静的レイヤー（`staticVisible`）
5. 動的レイヤー（`dynamicVisible`）
6. 線追加中のプレビュー
7. `#dynamicRangeOverlay`（動的レンジ円。`pointer-events:visibleStroke`）
8. 自機マーカー → Hookロケーター線
9. グリッド端ラベル（画面外オーバーレイ`#gridEdgeLabels`）、変換適用、選択情報/自機情報更新
- 再描画前に `updateDynamicWarnings()` を呼ぶ。

### 6.2 グリッド間隔（表示範囲の長辺°）
≥12°→60′、≥6°→30′、≥2°→15′、≥0.75°→5′、それ未満→1′。ラベルは左端(緯度)・下端(経度)にDOMオーバーレイ。

### 6.3 パン/ズーム
- ビューポート `transform = translate(panX panY) scale(scale)`。`scale` 範囲 0.25–32、ホイール係数 1.1。
- 1本指/マウスドラッグ=パン、2本指ピンチ=ズーム（中点基準）、ホイール=カーソル基準ズーム。
- 状態は `tacview02-view` に保存（「初期値に設定」時）。
- スケールバー：`nm/pixel`から候補 [0.5,1,2,5,10,20,50,100,200,500]nm のうち幅≤180pxの最大を採用。
- 注記（シンボル/ラベル/B/E/自機）は `getAnnotationScale = clamp(√zoom,0.45,2.5)` を逆スケールして、ズームしても見た目サイズが緩やかに変化。線幅は `getAdaptiveStrokeWidth`。`vector-effect:non-scaling-stroke` を使用。
- 表示スケール `getDisplayScale = clamp(symbolScaleBase(0.5) × displayScale/100, 0.05, 1.0)`。

### 6.4 基本レイヤー表示
- 空域: ポリゴン、黒枠(2)、塗りは`fill`。ラベル（`displayName||name`、`displayNameVisible!==false`時）は外接矩形中心、フォントは `clamp(min(12·scale, 幅×0.82/(文字数×0.62), 高さ×0.24), 6, 12·scale)`。
- 基地: 円(r24·scale)+三角+名称。
- 航路: 黒破線 `12 10`。
- 各要素クリック → `handleMapObjectClick(item,'basic')`。

### 6.5 静的/動的オブジェクト表示
- シンボル：`getSymbolPath`（diamond/triangle/square/cross/missile/ddg/cv/circle）、サイズ `(waypoint?12:15)×displayScale`、白枠。
- 色：enemy `#ef4444`、neutral `#f8fafc`、ally `#3b82f6`、waypoint `#22c55e`、base `#60a5fa`、その他 `#fbbf24`。
- ラベル: オブジェクト名（右上オフセット、24×scale px）。
- `status==='DESTROYED'` は**何も描画しない**。`DOWN` は円/リングを**破線 `6 6`**。
- ジオメトリ:
  - 動的の`circleConfig`あり → 地理円(72角形)をオーバーレイに描画。色 red `#ef4444`/yellow `#facc15`/blue `#60a5fa`/green `#22c55e`、線幅1.5、非スケール線。
  - なければ `circle`（薄灰塗り＋灰線）。
  - 静的の `ring`/`threat` → `threat-ring`（CSS）。
  - 静的の `sector` → 開始〜終了方位の扇（青系）。
- 線オブジェクト（`type==='line'`）：`linePoints` を折線で描画。色は読みやすい濃色へ補正（例 #ef4444→#b91c1c）。破線パターン solid `none` / dashed `14 8` / dotted `2 8`（丸キャップ）。

### 6.6 自機マーカー
- 機首方位 `heading`（真方位）で回転する矢尻形（紺 `#0b2a5b`、白枠）＋中心白点。
- 位置：GPS/模擬が有効なら lat/lon、無ければ画面中央。

### 6.7 Hookロケーター
- 各ウィンドウに保持されたHook対象へ、自機→対象の**黄(`#fbbf24`、S/H固定)/その他パレット循環**の破線(10 8)。2点Hookは始点→終点の線。
- パレット `['#34d399','#60a5fa','#f87171','#a78bfa','#fb7185','#fbbf24']`。

---

## 7. フローティングウィンドウ

### 7.1 共通仕様
- ヘッダ（タイトル、ドラッグ可トグル `⋮⋮`、閉じる×）＋コンテンツ。ポインタドラッグで移動、画面内にクランプ（余白12px）。
- 最前面制御（クリック/ドラッグで z-index 最大+1）。
- 位置・表示・ドラッグ可否を `tacview02-windows` に保存。×で非表示（Hook状態も解除）。
- 幅は内容にフィット、高さは画面下端まで。`dynamicList`は利用可能幅まで。
- ウィンドウ設定パネルから**機能を選んで追加（名前任意、最大数制限なし）**、表示/非表示切替。カスタムは `custom:true,title,feature` で保存・復元。

### 7.2 既定ウィンドウ
| key | 初期位置 | 機能 |
|---|---|---|
| layers | (12,12) | Base/Static/Dynamic 表示チェック |
| selfinfo | (12,160) | B/E（自機のBullseye方位/距離）|
| hook | (12,320) | S/H：自機Hook |
| dynamic-warning | (280,72) | RANGE WARNING（MEZ警報）|
| timeline-alert | (280,250) | タイムラインアラート |

### 7.3 追加可能な機能（`WINDOW_FEATURE_LABELS`）
`layers / hook（S/H）/ hook2（2点Hook）/ be / track / gs / tos / tot / dynamicList(DOL) / sead`

| 機能 | 表示内容・動作 |
|---|---|
| layers | Base/Static/Dynamic チェックボックス（`xxxVisible`）|
| hook | 「フック」ボタン→地図のオブジェクト/動的円を選択。対象名、`方位°/距離nm`（自機→対象）。再押下でキャンセル |
| hook2 | 「2点を選択」→地図上の2点（オブジェクト or 任意点）を選び、始点/終点名と 始点→終点の方位/距離。任意点は動的円の線上に近ければ**スナップ**(§8.3) |
| be | `BBB° / DD.Dnm`（B/E→自機）|
| track | 自機磁針路 `NNN°M` |
| gs | 対地速度 `Nkt`（四捨五入）|
| tos | NOW（地図中心経度から求めたゾーン時刻 `UTC+floor((lon+7.5)/15)`）と TOS（S/H対象までの距離÷現在速度の到達時刻）|
| tot | 時:分:秒入力、必要速度kt、（発射TOT有効時）発射TOT=TOT−ToF |
| dynamicList | DOL。動的全件を行表示（§9）|
| sead | HARM残数、MAGNUMボタン、発射一覧とカウントダウン（§10）|

### 7.4 TOT計算
- `target`=本日の指定時刻（現在以前なら翌日）。`totLaunchEnabled`なら `speedTarget = target − totTof秒`。
- 必要速度 = 自機〜S/H対象距離(nm) ÷ ((speedTarget−now)[h])。S/H未設定・入力不正時は `--kt`。
- 入力はTOT設定パネルと各TOTウィンドウで同期。

---

## 8. 操作仕様

### 8.1 オブジェクト選択
オブジェクト（シンボル・基本レイヤー要素・線）をタップ→`selectedId/selectedLayer`設定、情報表示。シンボルは再描画で `selected` クラス。

### 8.2 Hook
- モード `hookMode: false|'hook'|'hook2'`、地図に `data-hook-selecting` 属性（カーソル変更用）。
- Hook対象の種類: `object`(静的/動的/基本のオブジェクト)、`dynamicRange`(動的円。位置は**中心→自機方向の円周上の点**)、`self`、`bullseye`、任意点(lat/lon)。
- 判定順: ①画面上のオブジェクト（`getHookScreenTarget`）②動的円の近接（|距離−半径| ≤ max(0.5nm, 半径×1.5%)）③hook2のみ任意点。
- ウィンドウごとに対象を `Map(windowKey→target)` で保持（`hookWindowTargets`, `hook2WindowTargets`）。`hook`キーのみ `hookTarget`（TOS/TOT計算で使用）。

### 8.3 円スナップ
任意点が動的円(非DESTROYED/非非表示)の周から閾値（上記）以内なら、中心→点の方位×半径の円周上に補正。

### 8.4 長押し/右クリックメニュー
- PC: 右クリック、タッチ: **550ms長押し**（2本指・移動で中断）→ `MARK / DO / SO` メニュー。
- **MARK**: その位置に `markSettings` に従う動的オブジェクトを即追加（円半径>0があれば `ACTIVE`、なければ `ASLEEP`、円は最大3）。
- **SO**: 設定モーダル→静的エディタを開き、タップ位置のDDMM.MMMを緯度/経度欄へ入力済みにする。
- **DO**: 「B/E / LAT/LON」選択 → テンキー入力 → MARKとして動的に追加。
  - B/E: 磁方位＋距離を入力→真方位に変換せず `bullseyeOffsetToGeo`（※実装は入力値をそのまま使用）。
  - LAT/LON: 現在の座標系の入力。

### 8.5 SEAD選択
MAGNUM押下で選択モード → 動的オブジェクト（マーカー）タップで発射（§10）。

### 8.6 MAP座標指定（Pick）
`mapPickTarget`: `bullseye | mapCenter | selfPosition | static | staticLinePoints | basicDisplayRange`。設定モーダルを閉じ、地図タップ位置で値を設定→モーダルへ復帰。
- 線地点追加: 連続タップで追加（最大50点、タッチは移動≤12pxのみタップ扱い）。Enterで完了、「直前を削除」「全消去」あり。保存には**3点以上必須**。
- 基本レイヤー表示範囲: 地図で4点指定→その四角形と交差する空域/ルート/点だけ `visible=true`、他は`false`。交差判定は多角形の辺交差＋内包判定（`polygonsIntersect`）。

### 8.7 自機位置の更新モード（排他）
1. **GPS**: `watchPosition({enableHighAccuracy:true,maximumAge:1000,timeout:15000})`。HTTPSまたはlocalhost必須。速度 m/s→kt(×1.943844)、heading は速度>0.5m/s のとき更新。状態表示 `GPS受信中: 精度 Nm / N秒前`（精度>100mで警告、更新10秒超でエラー表示）。
2. **飛行模擬**: 1秒ごとに `speed/3600` nm を `heading` 方向へ進める。方位(磁)・速度(0–2000kt)・開始位置(MAP指定)を設定。
3. **中央ボタン◎**: 自機を画面中央に（GPS有効なら位置へ）→ GPS受信中なら停止、停止中なら次の測位で中央化してGPS開始。
- GPS無効時は自機=mapCenter固定。

### 8.8 テンキー
- 専用の下部テンキー（0-9, `-`, `.`, ⌫, AC, ENTER, ×）。`inputmode="none"`でOSキーボードを抑止。
- モード: `standard`（単一欄）、`dol`（方位+距離の2欄）、`latlon`（緯度経度2欄＋半球切替）。
- ENTERで確定、×/不正値は元値に復元。方位は 0 ≤ 値 < 360 を検証（`validateBearingInput`）。
- DOL/DO(B/E)入力は方位・距離を同時に編集。

---

## 9. DOL（動的オブジェクト簡易設定）
行ごとに：名称、状態セレクト（ACTIVE/AWAKE/DOWN/DESTROYED/ASLEEP、既定ASLEEP）、磁方位(整数)、距離(0–999nm、整数)、半径表示。
- 方位/距離は **B/E基準**。変更で位置更新（真方位へ変換→`bullseyeOffsetToGeo`）。
- 状態変更は即時再描画。

---

## 10. SEAD / HARM

設定（SEAD管理パネル）: `HARM ToF`(mm:ss、既定03:00=180s)、`残弾`(0–99、既定10)、`ARIZONA閾値`(0–9、既定2)、`SEADリセット`。
- 初弾前の残弾を `seadInitialHarmRemain` に保持（リセットで復元、`seadLaunches` 全消去）。
- **発射**: MAGNUM→動的オブジェクトをタップ。残弾>0なら −1、同一オブジェクトは**上書き**で `launchedAt=now`。
- 残り秒 = `ToF − floor((now−launchedAt)/1000)`。表示 `MM:SS`（負は`-MM:SS`）。
- ウィンドウ表示：`HARM REMAIN n`。`n ≤ ARIZONA` で警告色、`n==0` で「ARIZONA」表示・MAGNUMボタン無効風。
- 対象の動的円：残り>30秒は `sead-range-active`、5〜30秒は `sead-range-warning`、5秒未満はクラスなし（消灯）。
- MEZ警報パネルでは、SEAD中の対象は **HARMカウントダウンを表示**（なければ滞在秒数）。

---

## 11. MEZ警報（RANGE WARNING）
- 条件: 自機位置が有効かつ `self.enabled!==false`。対象は動的で `visible!==false` かつ `status==='ACTIVE'`。その **赤(`red`)円**の内側（距離 ≤ 半径）。
- 入ったとき `enteredAt` を記録、パネル行 `名称 経過秒/HARM残り`、クラス `dynamic-warning-normal`/SEAD色。パネルは1件以上で表示、`body.dynamic-warning-active` 付与。
- 円自体もクラス `dynamic-range-circle-warning` で強調。
- 通知設定 `mez` 有効時、**新規進入時のみ**1回通知（初回描画の誤発報を避けるため`notificationStateReady`後）。

---

## 12. タイムライン（TIME LINE）
- TOT設定パネルの TIME LINE で EVENT追加（既定: 現在の時:分:00）。名前（40字）、時刻（時:分:秒）、ALERT（複数）。ALERT: 有効/色(GREEN,YELLOW,RED)/差分 `MM:SS`（負可、−で事前）。
- 毎秒判定：`now ≥ eventTime + offset` のALERTを**イベントごとに最新1件**だけ表示。行 `EVENT名  ±MM:SS`（イベント時刻との差）。色別CSS `timeline-alert-GREEN/YELLOW/RED`。
- 時刻は「本日」のローカル時刻解釈。アラートウィンドウを**ダブルクリックで全消去**（そのalertKeyは再表示しない）。
- 値変更は即保存。

---

## 13. 通知
- 設定パネル: 項目 `SEAD / MEZ / TOT` のチェック、通知本文（80字）、「通知を許可」ボタン（`Notification.requestPermission`）。
- 発報: `new Notification(title,{body:本文})`、`notifyOnce(key,...)` で同一キーは1回のみ。
  - SEAD: `SEAD 名称`（残り≤30秒）。
  - TOT: `TOT ウィンドウ名`（指定時刻到達時。前回チェック以降に通過した場合）。
  - MEZ: `MEZ 名称`（進入時）。
- 1秒タイマーで SEAD/TOT/タイムラインを判定、`updateFeatureWindows(false)`も更新。

---

## 14. 設定モーダル項目
1. 表示（座標系セレクト、`displayScale`スライダー10–200※実質固定）
2. **Bullseye**（緯度経度入力＋MAPから指定）
3. **座標系**（DDMM.MMM/DDMMSS/MGRS/GARS）
4. **MAPセンター**（緯度経度＋MAPから指定）
5. **自機**（飛行模擬：方位/速度/開始位置/開始停止、GPS開始停止、状態表示）
6. **偏差**（自動取得/手動、手動値 −100〜100°、W=−8/E=+8）
7. ボタン群：SEAD管理、TOT設定、MARKオブジェクト設定、基本/静的/動的レイヤー設定、ウィンドウ設定、通知設定
8. データ：プリセット保存(JSON書出)、プリセット読込、**現在の状態を初期値に設定**、**アプリを初期化**（確認ダイアログ後、初期値スナップショットへ戻してリロード）
9. ステータス行（`settingsStatus`）に操作結果メッセージ

### 14.1 基本レイヤー管理
- フィルタ（全件/CTR/ATZ）、表示トグル、空域追加、**GeoJSON読込**、GeoJSON一括クリア、表示範囲限定、リスト（編集/削除/表示切替）。
- エディタ項目: 名称(40)、ラベル(12)、表示名、表示名表示ON/OFF、種別(CTR/ATZ)、表示/非表示、座標点リスト（`points`テキスト）。
- **GeoJSON取込仕様**:
  - `FeatureCollection` または単一 `Feature`。**Polygon/MultiPolygonのみ**対象（外周リングのみ使用、頂点3未満は除外）。
  - 名称 = `properties.name || properties.title || "GeoJSON空域 N"`（ラベルは12字まで）。MultiPolygon は `-1,-2…` を付与。
  - 種別 = `properties.type===1 || properties.kind==='control-zone'` → ATZ、他 CTR。
  - 座標 [lon,lat] → `geoPoints:[lat,lon]`。`source:'geojson'`。
  - 取込時、既存の `source==='geojson'` を**全削除して置換**（手動作成分は保持）。

### 14.2 静的/動的レイヤー管理
- フィルタ（全件/WAYPOINT/味方/敵/中立）、表示トグル、オブジェクト追加、リスト（名称・種別・座標を現在系で表示、編集/削除）。
- エディタ項目：名称(40)、種別(WAYPOINT/味方/敵/中立/線)、座標系（DDMM.MMM/DDMMSS/MGRS/GARS/**B/E**）、緯度経度（B/E時は磁方位+距離）、MAPから指定、シンボル（Diamond/Square/Triangle/Circle/Cross/船DDG/船CV）、ジオメトリ（なし/円/扇＋半径nm＋開始/終了方位）、動的円1〜3（半径nm＋色）、線（点追加/削除/全消去、線種、色[黒/青/緑/橙/赤/白/黄]、太さ1–5）。
- 「線」は3点以上必須。方位は検証して不正なら保存拒否。

### 14.3 MARKオブジェクト設定
名称(既定MARK)・種別・シンボル(既定diamond)・円1〜3（半径nm＋色）を保存し、MARK作成時に適用。

### 14.4 ウィンドウ設定
一覧（表示/非表示、削除相当）＋新規追加（名前 ≤24字、機能セレクト）。

---

## 15. PWA / キャッシュ
- `manifest.webmanifest`: `start_url:"."`, `display:"standalone"`, アイコン 192/512。
- `apple-touch-icon`、`theme-color #0f172a`、`lang="ja"`、viewport `width=device-width, initial-scale=1`。
- `sw.js`: install で App Shell を `cache.addAll`、activate で旧キャッシュ削除、fetch は cache-first（失敗時 `./index.html`）。バージョン付きクエリ `?v=…` でキャッシュ更新。
- **現行app.jsは起動時に既存 Service Worker を全て unregister する**（開発時の古いキャッシュ回避）。再実装ではPWAオフライン要件に合わせて方針を決めること。

---

## 16. 非機能・制約
- 外部通信なし（オフライン完結）。HTTPS/localhostでのみGPS・通知が動作。
- データ量：基本レイヤーは 1,000件超でも動くが、全要素を再描画する単純実装（`renderMap`毎に`innerHTML=''`で再構築）。大量データでの性能最適化は未実装。
- iPad/iPhone Safari を主要ターゲット（ポインタイベントでタッチ/マウス統一、`touch-action`で制御）。
- 色覚・コントラスト：暗背景に高彩度の色。線色は地図上で読める濃色に補正。
- アクセシビリティ：主要ボタンに `aria-label`。

---

## 17. 既存実装の癖・未使用コード（再実装時の判断メモ）
1. `projectLambert/inverseLambert/getLambertConstants`、`LCC_STANDARD_PARALLELS`、`GRID_MAP_BOUNDS`、`MAP_VERTICAL_ASPECT`、`handleAddMarker`、`resetSampleData`、`requestGps` は**描画に使われていない**（過去の仕様の残骸）。実描画は §5.1 の等距円筒。ランベルト図法へ移行する場合は別途設計が必要。
2. 偏差「自動取得」は **未実装**（ラジオはあるが `manualDeviation` のみ使用）。再実装では磁気偏差モデル(WMM)導入か、`jp_apt/jp_nav` の `magneticDeclination` 利用を検討。
3. `geoToMapPosition` は 0–100 に**クランプ**するため範囲外の点は端に貼り付く。
4. 動的円の描画は `getGeographicCirclePath` の 72点近似、円の実半径は球面計算なので、等距円筒上では歪んで見える（高緯度ほど顕著）。
5. DOのB/E入力は磁方位→真方位変換を行わずに `bullseyeOffsetToGeo` へ渡している箇所がある（DOLや静的エディタは変換する）。再実装では**常に磁方位入力→真方位変換**に統一するのが望ましい。
6. TOS は `hook` ウィンドウの対象を使用、カスタムHookは対象外。
7. `tacview02-windows` は初期値スナップショットにも含め、初期化で復元。
8. ウィンドウ追加の `createCustomWindow` はキー `custom-<timestamp>`。
9. キャッシュ版数（`v122-…`）と HTML内クエリ版数（`114-…`）が不一致のまま運用されている。
10. `DATA/jp_*.geojson` のうち apt/nav/obs（Point）は現行UIでは未使用。

---

## 18. 再実装のための推奨ステップ
1. **コア**: 投影（§5）・SVG地図・パン/ズーム・グリッド・スケールバー・座標系変換。
2. **状態**: §4のスキーマ＋localStorage＋プリセット入出力＋初期値スナップショット。
3. **レイヤー**: 基本（GeoJSON取込含む）→静的→動的（円×3、状態）。
4. **自機**: GPS/模擬/中央化、B/E・Hook・Hook2・円スナップ。
5. **ウィンドウ**: ドラッグ基盤＋機能ウィンドウ（layers/hook/hook2/be/track/gs/tos/tot/dol/sead）。
6. **警報**: MEZ、SEAD、タイムライン、通知。
7. **入力**: テンキー、長押しメニュー(MARK/DO/SO)、MAPピック。
8. **PWA**: manifest/アイコン/SW方針の確定。
9. 受け入れテスト観点：座標系の往復変換（4系統）、方位の磁↔真変換、円スナップ閾値、SEADカウントダウン(≤30s/5s)、MEZ新規進入のみ通知、プリセット往復、GeoJSON置換の挙動。

---

## 付録A: 主要定数
| 定数 | 値 |
|---|---|
| `MAP_VIEW_SPAN` | lat 24°, lon 24×(1000/700)° |
| `MAP_MAX_SCALE` / 最小 | 32 / 0.25 |
| `MAP_ZOOM_FACTOR` | 1.1 |
| 地球半径 | 3440.065 nm |
| 速度換算 | 1 m/s = 1.943844 kt |
| 長押し時間 | 550 ms |
| 線の最大点数 / 最小点数 | 50 / 3 |
| 円の最大数 | 3 |
| スナップ閾値 | max(0.5nm, 半径×1.5%) |
| 状態更新タイマー | 1秒（警報/通知/ウィンドウ）、模擬飛行1秒 |
| HARM ToF既定 / 残弾既定 / ARIZONA既定 | 180s / 10 / 2 |
| ウィンドウ余白 | 12px |

## 付録B: 状態(status)の意味
| status | 描画 | MEZ警報 | スナップ/Hook |
|---|---|---|---|
| ACTIVE | 実線の円 | **対象** | 対象 |
| AWAKE | 実線の円 | 対象外 | 対象 |
| ASLEEP | 実線の円 | 対象外 | 対象 |
| DOWN | **破線**の円 | 対象外 | 対象 |
| DESTROYED | 非表示（シンボル/円なし）| 対象外 | 対象外 |

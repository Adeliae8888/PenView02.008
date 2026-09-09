const STORAGE_KEY = 'tacview02-state';
const WINDOWS_STORAGE_KEY = 'tacview02-windows';
const INITIAL_STATE_STORAGE_KEY = 'tacview02-initial-state';
const VIEW_STORAGE_KEY = 'tacview02-view';
const MAP_VIEW_SPAN = { lat: 24, lon: 24 * (1000 / 700) };
const MAP_MAX_SCALE = 32;
const MAP_ZOOM_FACTOR = 1.1;
const MAP_VERTICAL_ASPECT = 0.88;
const GRID_MAP_BOUNDS = { minX: -400, maxX: 500, minY: -400, maxY: 500 };
const LCC_STANDARD_PARALLELS = [30, 60];
const LAYER_LABELS = {
  basic: '基本レイヤー',
  static: '静的レイヤー',
  dynamic: '動的レイヤー',
};

const OBJECT_TYPE_LABELS = {
  enemy: '敵',
  neutral: '中立',
  ally: '味方',
  waypoint: 'WAYPOINT',
  line: '線',
};

const defaultSettings = {
  mapCenter: { lat: 35, lon: 136 },
  bullseye: { lat: 35.6895, lon: 139.6917 },
  coordSystem: 'DDMM.MMM',
  deviationMode: 'auto',
  manualDeviation: 0,
  displayScale: 100,
  symbolScaleBase: 0.5,
  seadHarmTof: 180,
  seadHarmRemain: 10,
  seadArizona: 2,
  totTime: '',
  totTof: 0,
  totLaunchEnabled: false,
  timelineEvents: [],
  notifications: { items: [], text: '' },
};

const defaultWindowsState = {
  layers: { x: 12, y: 12, draggable: true, feature: 'layers' },
  selfinfo: { x: 12, y: 160, draggable: true, feature: 'be' },
  hook: { x: 12, y: 320, draggable: true, feature: 'hook' },
  'dynamic-warning': { x: 280, y: 72, draggable: true, feature: 'warning' },
  'timeline-alert': { x: 280, y: 250, draggable: true, feature: 'warning' },
};

const WINDOW_FEATURE_LABELS = {
  layers: 'Layers',
  hook: 'S/H',
  hook2: 'Hook',
  be: 'B/E',
  track: 'Track',
  gs: 'GS',
  tos: 'TOS',
  tot: 'TOT',
  dynamicList: 'DOL',
  sead: 'SEAD',
  warning: 'RANGE WARNING',
};

const DYNAMIC_STATUSES = ['ACTIVE', 'AWAKE', 'DOWN', 'DESTROYED', 'ASLEEP'];

const sampleState = {
  basic: [
    {
      id: 'aip-ctr',
      type: 'airspace',
      name: 'CTR / AIP区域',
      kind: 'controlled',
      fill: 'rgba(96, 165, 250, 0.08)',
      points: [[20, 18], [38, 24], [53, 17], [68, 32], [60, 60], [34, 58], [19, 38]],
      label: 'CTR',
    },
    {
      id: 'aip-atz',
      type: 'airspace',
      name: 'ATZ / AIP区域',
      kind: 'control-zone',
      fill: 'rgba(52, 211, 153, 0.09)',
      points: [[55, 18], [82, 28], [88, 58], [74, 68], [52, 62], [46, 42]],
      label: 'ATZ',
    },
    { id: 'base-a', type: 'base', name: 'A基地', x: 22, y: 70 },
    { id: 'base-b', type: 'base', name: 'B基地', x: 78, y: 30 },
    { id: 'airway-1', type: 'route', name: '航路1', points: [[25, 25], [40, 35], [60, 42], [75, 58]] },
  ],
  static: [
    { id: 'wp-1', type: 'waypoint', name: '交戦帯', x: 45, y: 46, layer: 'static', symbol: 'diamond', geometryType: 'ring', geometryRadius: 18 },
    { id: 'wp-2', type: 'waypoint', name: '補給点', x: 60, y: 60, layer: 'static', symbol: 'square', geometryType: 'circle', geometryRadius: 14 },
    { id: 'ally-1', type: 'ally', name: '友軍A', x: 50, y: 20, layer: 'static', symbol: 'triangle', geometryType: 'circle', geometryRadius: 12 },
  ],
  dynamic: [
    { id: 'enemy-1', type: 'enemy', name: '敵機1', x: 65, y: 48, layer: 'dynamic', threat: true, symbol: 'cross', geometryType: 'ring', geometryRadius: 18 },
    { id: 'enemy-2', type: 'enemy', name: '敵機2', x: 78, y: 62, layer: 'dynamic', threat: true, symbol: 'missile', geometryType: 'circle', geometryRadius: 16 },
    { id: 'ally-2', type: 'ally', name: '友軍B', x: 35, y: 63, layer: 'dynamic', symbol: 'circle', geometryType: 'none', geometryRadius: 0 },
  ],
  self: {
    enabled: true,
    lat: 35.6895,
    lon: 139.6917,
    x: 52,
    y: 48,
    heading: 0,
    speed: 0,
  },
  markSettings: { name: 'MARK', type: 'neutral', symbol: 'diamond', circles: [{ radius: 0, color: 'red' }, { radius: 0, color: 'red' }, { radius: 0, color: 'red' }] },
};

const state = loadState();
ensureInitialStateSnapshot();
let selectedId = null;
let selectedLayer = null;
let hookMode = false;
let hookTarget = null;
let mapPickTarget = null;
let mapPickReturnPanel = null;
let mapPickFormValues = null;
let selfSimulationTimer = null;
let gpsWatchId = null;
let gpsStatusTimer = null;
let centerOnNextGpsPosition = false;
let basicDisplayRangePoints = [];
let managedLayer = 'static';
const hookWindowTargets = new Map();
const hook2WindowTargets = new Map();
let activeHookWindowKey = 'hook';
const fixedShLocatorColor = '#fbbf24';
const hookLocatorPalette = ['#34d399', '#60a5fa', '#f87171', '#a78bfa', '#fb7185', '#fbbf24'];

function getHookLineColor(key, index) {
  if (key === 'hook') return fixedShLocatorColor;
  return hookLocatorPalette[index % hookLocatorPalette.length];
}

const mapInteraction = {
  ...loadSavedView(),
  viewport: null,
  dynamicRangeOverlay: null,
  pointers: new Map(),
  lastPoint: null,
  pinchDistance: 0,
  pinchScaleStart: 1,
  pinchMapAnchor: null,
};

const elements = {
  svg: document.getElementById('mapSvg'),
  scaleBar: document.getElementById('scaleBar'),
  scaleBarLabel: document.getElementById('scaleBarLabel'),
  scaleBarFill: document.getElementById('scaleBarFill'),
  cursorCoordinates: document.getElementById('cursorCoordinates'),
  cursorLatitude: document.getElementById('cursorLatitude'),
  cursorLongitude: document.getElementById('cursorLongitude'),
  selectedInfo: document.getElementById('selectedInfo'),
  selfBearing: document.getElementById('selfBearing'),
  selfDistance: document.getElementById('selfDistance'),
  selfHeading: document.getElementById('selfHeading'),
  selfSpeed: document.getElementById('selfSpeed'),
  hookButton: document.getElementById('hookButton'),
  hookInfo: document.getElementById('hookInfo'),
  hookName: document.getElementById('hookName'),
  hookBearing: document.getElementById('hookBearing'),
  hookDistance: document.getElementById('hookDistance'),
  toggleBasic: document.getElementById('toggle-basic'),
  toggleStatic: document.getElementById('toggle-static'),
  toggleDynamic: document.getElementById('toggle-dynamic'),
  centerOnSelfButton: document.getElementById('centerOnSelfButton'),
  settingsButton: document.getElementById('settingsButton'),
  settingsModal: document.getElementById('settingsModal'),
  saveInitialStateButton: document.getElementById('saveInitialStateButton'),
  exportPresetButton: document.getElementById('exportPresetButton'),
  importPresetButton: document.getElementById('importPresetButton'),
  presetFileInput: document.getElementById('presetFileInput'),
  resetAppButton: document.getElementById('resetAppButton'),
  closeSettings: document.getElementById('closeSettings'),
  windowSettingsPanel: document.getElementById('windowSettingsPanel'),
  windowSettingsList: document.getElementById('windowSettingsList'),
  windowNameInput: document.getElementById('windowNameInput'),
  windowFeatureSelect: document.getElementById('windowFeatureSelect'),
  addWindowButton: document.getElementById('addWindowButton'),
  basicLayerPanel: document.getElementById('basicLayerPanel'),
  staticLayerPanel: document.getElementById('staticLayerPanel'),
  seadSettingsPanel: document.getElementById('seadSettingsPanel'),
  totSettingsPanel: document.getElementById('totSettingsPanel'),
  totTimeHour: document.getElementById('totTimeHour'),
  totTimeMinute: document.getElementById('totTimeMinute'),
  totTimeSecond: document.getElementById('totTimeSecond'),
  totTofMinute: document.getElementById('totTofMinute'),
  totTofSecond: document.getElementById('totTofSecond'),
  totLaunchEnabled: document.getElementById('totLaunchEnabled'),
  markSettingsPanel: document.getElementById('markSettingsPanel'),
  markObjectName: document.getElementById('markObjectName'),
  markObjectType: document.getElementById('markObjectType'),
  markObjectSymbol: document.getElementById('markObjectSymbol'),
  markCircleRadius1: document.getElementById('markCircleRadius1'),
  markCircleColor1: document.getElementById('markCircleColor1'),
  markCircleRadius2: document.getElementById('markCircleRadius2'),
  markCircleColor2: document.getElementById('markCircleColor2'),
  markCircleRadius3: document.getElementById('markCircleRadius3'),
  markCircleColor3: document.getElementById('markCircleColor3'),
  saveMarkSettings: document.getElementById('saveMarkSettings'),
  mapActionMenu: document.getElementById('mapActionMenu'),
  coordinateActionMenu: document.getElementById('coordinateActionMenu'),
  coordinateInputPanel: document.getElementById('coordinateInputPanel'),
  staticLayerVisibleToggle: document.getElementById('staticLayerVisibleToggle'),
  staticLayerFilter: document.getElementById('staticLayerFilter'),
  addStaticObject: document.getElementById('addStaticObject'),
  staticLayerList: document.getElementById('staticLayerList'),
  staticLayerForm: document.getElementById('staticLayerForm'),
  staticLayerId: document.getElementById('staticLayerId'),
  staticLayerName: document.getElementById('staticLayerName'),
  staticLayerType: document.getElementById('staticLayerType'),
  staticLayerCoordSystem: document.getElementById('staticLayerCoordSystem'),
  staticLayerLat: document.getElementById('staticLayerLat'),
  staticLayerLon: document.getElementById('staticLayerLon'),
  staticLayerSymbol: document.getElementById('staticLayerSymbol'),
  staticLayerGeometryType: document.getElementById('staticLayerGeometryType'),
  staticLayerGeometryRadius: document.getElementById('staticLayerGeometryRadius'),
  staticLayerGeometryStartBearing: document.getElementById('staticLayerGeometryStartBearing'),
  staticLayerGeometryEndBearing: document.getElementById('staticLayerGeometryEndBearing'),
  dynamicCircleSettings: document.querySelector('[data-dynamic-circle-settings]'),
  dynamicCircleRadius1: document.getElementById('dynamicCircleRadius1'),
  dynamicCircleColor1: document.getElementById('dynamicCircleColor1'),
  dynamicCircleRadius2: document.getElementById('dynamicCircleRadius2'),
  dynamicCircleColor2: document.getElementById('dynamicCircleColor2'),
  dynamicCircleRadius3: document.getElementById('dynamicCircleRadius3'),
  dynamicCircleColor3: document.getElementById('dynamicCircleColor3'),
  legacyGeometryFields: document.querySelectorAll('[data-legacy-geometry-fields]'),
  cancelStaticLayerForm: document.getElementById('cancelStaticLayerForm'),
  basicLayerVisibleToggle: document.getElementById('basicLayerVisibleToggle'),
  basicLayerFilter: document.getElementById('basicLayerFilter'),
  addBasicAirspace: document.getElementById('addBasicAirspace'),
  importBasicGeoJson: document.getElementById('importBasicGeoJson'),
  clearBasicGeoJson: document.getElementById('clearBasicGeoJson'),
  limitBasicDisplayRange: document.getElementById('limitBasicDisplayRange'),
  basicGeoJsonFile: document.getElementById('basicGeoJsonFile'),
  basicLayerList: document.getElementById('basicLayerList'),
  basicLayerForm: document.getElementById('basicLayerForm'),
  basicLayerId: document.getElementById('basicLayerId'),
  basicLayerName: document.getElementById('basicLayerName'),
  basicLayerLabel: document.getElementById('basicLayerLabel'),
  basicLayerDisplayName: document.getElementById('basicLayerDisplayName'),
  basicLayerDisplayNameVisible: document.getElementById('basicLayerDisplayNameVisible'),
  basicLayerKind: document.getElementById('basicLayerKind'),
  basicLayerVisible: document.getElementById('basicLayerVisible'),
  basicLayerPoints: document.getElementById('basicLayerPoints'),
  cancelBasicLayerForm: document.getElementById('cancelBasicLayerForm'),
  mapCenterLat: document.getElementById('mapCenterLat'),
  mapCenterLon: document.getElementById('mapCenterLon'),
  selfSimulationHeading: document.getElementById('selfSimulationHeading'),
  selfSimulationSpeed: document.getElementById('selfSimulationSpeed'),
  pickSelfPositionOnMap: document.getElementById('pickSelfPositionOnMap'),
  toggleSelfSimulation: document.getElementById('toggleSelfSimulation'),
  toggleGpsTracking: document.getElementById('toggleGpsTracking'),
  gpsStatus: document.getElementById('gpsStatus'),
    bullseyeLat: document.getElementById('bullseyeLat'),
    bullseyeLon: document.getElementById('bullseyeLon'),
    pickBullseyeOnMap: document.getElementById('pickBullseyeOnMap'),
    pickMapCenterOnMap: document.getElementById('pickMapCenterOnMap'),
    staticLayerGeoFields: document.querySelectorAll('[data-static-geo-field]'),
    staticLayerBeFields: document.querySelector('[data-static-be-fields]'),
    staticLayerBeBearing: document.getElementById('staticLayerBeBearing'),
    staticLayerBeDistance: document.getElementById('staticLayerBeDistance'),
    staticLayerLineFields: document.querySelector('[data-static-line-fields]'),
    staticLayerLinePoints: document.getElementById('staticLayerLinePoints'),
    staticLayerLinePointSummary: document.getElementById('staticLayerLinePointSummary'),
    pickStaticLinePointsOnMap: document.getElementById('pickStaticLinePointsOnMap'),
    undoStaticLinePoint: document.getElementById('undoStaticLinePoint'),
    clearStaticLinePoints: document.getElementById('clearStaticLinePoints'),
    staticLayerLineStyle: document.getElementById('staticLayerLineStyle'),
    staticLayerLineColor: document.getElementById('staticLayerLineColor'),
    staticLayerLineWidth: document.getElementById('staticLayerLineWidth'),
    staticLayerLineWidthValue: document.getElementById('staticLayerLineWidthValue'),
    pickStaticPositionOnMap: document.getElementById('pickStaticPositionOnMap'),
  coordinateSystem: document.getElementById('coordinateSystem'),
  manualDeviation: document.getElementById('manualDeviation'),
  settingsStatus: document.getElementById('settingsStatus'),
  displayScale: document.getElementById('displayScale'),
  displayScaleValue: document.getElementById('displayScaleValue'),
  numericKeypad: document.getElementById('numericKeypad'),
  seadHarmTof: document.getElementById('seadHarmTof'),
  seadHarmRemain: document.getElementById('seadHarmRemain'),
  seadArizona: document.getElementById('seadArizona'),
  seadResetButton: document.getElementById('seadResetButton'),
  notificationSettingsPanel: document.getElementById('notificationSettingsPanel'),
  notificationText: document.getElementById('notificationText'),
  notificationPermissionButton: document.getElementById('notificationPermissionButton'),
  latLonKeypadFields: document.querySelector('[data-latlon-keypad-fields]'),
  dynamicWarning: document.getElementById('dynamicWarning'),
  dynamicWarningItems: document.getElementById('dynamicWarningItems'),
  timelineAlertWindow: document.getElementById('timelineAlertWindow'),
  timelineAlertItems: document.getElementById('timelineAlertItems'),
  timelineSettingsList: document.getElementById('timelineSettingsList'),
  addTimelineEventButton: document.getElementById('addTimelineEventButton'),
};

let keypadTarget = null;
let keypadInitialValue = '';
let keypadInitialPlaceholder = '';
let keypadCleared = false;
let keypadMode = 'standard';
let seadSelectionMode = false;
let mapActionPosition = null;
let longPressTimer = null;
let activeTouchPointers = new Set();
let staticLineTouchStart = null;
let suppressNextMapPickClick = false;
let doBeKeypadActive = false;
let dolKeypadSources = null;
let dolKeypadInitialValues = null;
let latLonKeypadSources = null;
let latLonKeypadInitialValues = null;
let latLonKeypadMode = '';
const activeDynamicWarnings = new Map();
const notificationEvents = new Set();
const dismissedTimelineAlerts = new Set();
let lastNotificationCheck = Date.now();
let notificationStateReady = false;

initialize();

function initialize() {
  if (!Number.isFinite(state.seadInitialHarmRemain)) {
    state.seadInitialHarmRemain = clampNumber(Number(state.settings.seadHarmRemain), 0, 99, 0);
  }
  bindEvents();
  bindTimelineSettings();
  setActiveSettingsButton(document.querySelector('[data-layer-target="basic"]'));
  updateSettingsFields();
  renderLayerToggles();
  renderMap();
  updateSelfInfoDisplay();
  setupDraggableWindows();
  startDynamicWarningClock();
  updateTimelineAlerts();
}

function setupDraggableWindows() {
  const saved = JSON.parse(localStorage.getItem(WINDOWS_STORAGE_KEY) || '{}');

  Object.entries(saved)
    .filter(([, config]) => config.custom)
    .forEach(([key, config]) => createCustomWindow(config.title, config.feature || 'be', key));

  Object.keys(defaultWindowsState).forEach((key) => {
    const windowEl = document.querySelector(`[data-window="${key}"]`);
    if (windowEl) setupDraggableWindow(windowEl, saved);
  });
  updateFeatureWindows();
}

function bringWindowToFront(windowEl) {
  if (!windowEl) return;
  const windows = [...document.querySelectorAll('.draggable-window')];
  const highestIndex = windows.reduce((max, candidate) => {
    const value = Number.parseInt(candidate.style.zIndex || '0', 10);
    return Number.isFinite(value) ? Math.max(max, value) : max;
  }, 0);
  windowEl.style.zIndex = String(highestIndex + 1);
}

function setupDraggableWindow(windowEl, saved = {}) {
  const key = windowEl.dataset.window;
  const defaultConfig = defaultWindowsState[key] || { x: 24, y: 24, draggable: true, visible: true };
  const config = { ...defaultConfig, ...(saved[key] || {}) };
  const feature = config.feature || windowEl.dataset.feature || 'be';
  windowEl.dataset.feature = feature;
  if (feature === 'dynamicList') windowEl.querySelector('.window-title').textContent = 'DOL';
  const header = windowEl.querySelector('.window-header');
  const toggle = windowEl.querySelector('.drag-toggle');

  windowEl.style.left = `${config.x ?? 12}px`;
  windowEl.style.top = `${config.y ?? 12}px`;
  windowEl.style.display = config.visible === false ? 'none' : '';
  windowEl.style.zIndex = String(Number.parseInt(windowEl.style.zIndex || '0', 10) || (document.querySelectorAll('.draggable-window').length + 1));
  updateWindowGeometry(windowEl);
  constrainWindowPosition(windowEl);
  header.dataset.draggable = String(config.draggable !== false);
  toggle.checked = config.draggable !== false;

  const saveWindowState = () => {
    const windowStates = JSON.parse(localStorage.getItem(WINDOWS_STORAGE_KEY) || '{}');
    windowStates[key] = {
      ...(windowStates[key] || {}),
      x: Number.parseFloat(windowEl.style.left || '12'),
      y: Number.parseFloat(windowEl.style.top || '12'),
      draggable: toggle.checked,
      visible: windowEl.style.display !== 'none',
    };
    localStorage.setItem(WINDOWS_STORAGE_KEY, JSON.stringify(windowStates));
  };

  header.addEventListener('pointerdown', (event) => {
    if (!toggle.checked || event.target.closest('.window-controls')) return;
    bringWindowToFront(windowEl);
    event.preventDefault();
    event.stopPropagation();
    header.setPointerCapture(event.pointerId);

    const startX = event.clientX;
    const startY = event.clientY;
    const startLeft = Number.parseFloat(windowEl.style.left || '12');
    const startTop = Number.parseFloat(windowEl.style.top || '12');
    const pointerId = event.pointerId;

    windowEl.dataset.dragging = 'true';
    header.dataset.draggable = 'true';

    const onMove = (moveEvent) => {
      if (moveEvent.pointerId !== pointerId) return;
      moveEvent.preventDefault();
      const dx = moveEvent.clientX - startX;
      const dy = moveEvent.clientY - startY;
      const maxLeft = Math.max(0, window.innerWidth - windowEl.offsetWidth);
      const maxTop = Math.max(0, window.innerHeight - windowEl.offsetHeight);
      windowEl.style.left = `${clampNumber(startLeft + dx, 0, maxLeft, 0)}px`;
      windowEl.style.top = `${clampNumber(startTop + dy, 0, maxTop, 0)}px`;
      updateWindowGeometry(windowEl);
    };

    const onUp = (upEvent) => {
      if (upEvent.pointerId !== pointerId) return;
      windowEl.removeAttribute('data-dragging');
      if (header.hasPointerCapture(pointerId)) header.releasePointerCapture(pointerId);
      header.removeEventListener('pointermove', onMove);
      header.removeEventListener('pointerup', onUp);
      header.removeEventListener('pointercancel', onUp);
      saveWindowState();
    };

    header.addEventListener('pointermove', onMove);
    header.addEventListener('pointerup', onUp);
    header.addEventListener('pointercancel', onUp);
  });

  toggle.addEventListener('change', () => {
    header.dataset.draggable = String(toggle.checked);
    bringWindowToFront(windowEl);
    saveWindowState();
  });

  windowEl.querySelector('.window-close-btn')?.addEventListener('click', () => {
    clearHookStateForWindow(windowEl);
    windowEl.style.display = 'none';
    saveWindowState();
    renderWindowSettings();
  });

  bindFeatureWindow(windowEl);
}

function updateWindowGeometry(windowEl) {
  if (!windowEl || windowEl.style.display === 'none') return;
  const left = Number.parseFloat(windowEl.style.left || '12');
  const top = Number.parseFloat(windowEl.style.top || '12');
  const margin = 12;
  const availableHeight = Math.max(0, window.innerHeight - top - margin);
  if (windowEl.dataset.feature === 'dynamicList') {
    windowEl.style.width = 'fit-content';
    const naturalWidth = windowEl.offsetWidth;
    const availableWidth = Math.max(0, window.innerWidth - left - margin);
    windowEl.style.width = `${Math.min(naturalWidth, availableWidth)}px`;
    windowEl.style.setProperty('--window-available-width', `${availableWidth}px`);
  } else {
    windowEl.style.width = 'fit-content';
    windowEl.style.removeProperty('--window-available-width');
  }
  windowEl.style.maxHeight = `${availableHeight}px`;
  windowEl.style.setProperty('--window-available-height', `${availableHeight}px`);
}

function constrainWindowPosition(windowEl) {
  if (!windowEl || windowEl.style.display === 'none') return;
  const margin = 12;
  const maxLeft = Math.max(0, window.innerWidth - windowEl.offsetWidth - margin);
  const maxTop = Math.max(0, window.innerHeight - windowEl.offsetHeight - margin);
  const left = clampNumber(Number.parseFloat(windowEl.style.left || '12'), 0, maxLeft, 0);
  const top = clampNumber(Number.parseFloat(windowEl.style.top || '12'), 0, maxTop, 0);
  windowEl.style.left = `${left}px`;
  windowEl.style.top = `${top}px`;
  updateWindowGeometry(windowEl);
}

function createCustomWindow(title, feature, key = `custom-${Date.now()}`) {
  if (document.querySelector(`[data-window="${key}"]`)) return;

  const windowEl = document.createElement('div');
  windowEl.className = 'draggable-window';
  windowEl.dataset.window = key;
  windowEl.dataset.feature = feature;
  windowEl.innerHTML = `
    <div class="window-header">
      <span class="window-title"></span>
      <div class="window-controls">
        <label class="drag-toggle-label">
          <input type="checkbox" class="drag-toggle" checked />
          <span class="drag-icon">⋮⋮</span>
        </label>
        <button class="window-close-btn" type="button" aria-label="ウィンドウを閉じる">×</button>
      </div>
    </div>
    <div class="window-content" data-feature-content="${feature}"></div>
  `;
  windowEl.querySelector('.window-title').textContent = title;
  renderFeatureContent(windowEl, feature);
  document.querySelector('.floating-windows-container').appendChild(windowEl);

  const saved = JSON.parse(localStorage.getItem(WINDOWS_STORAGE_KEY) || '{}');
  const windowIndex = document.querySelectorAll('.draggable-window').length - 3;
  const column = Math.max(0, windowIndex % 3);
  const row = Math.floor(Math.max(0, windowIndex) / 3);
  saved[key] = saved[key] || { x: 240 + column * 230, y: 24 + row * 160, draggable: true, visible: true, custom: true, title, feature };
  localStorage.setItem(WINDOWS_STORAGE_KEY, JSON.stringify(saved));
  setupDraggableWindow(windowEl, saved);
  constrainWindowPosition(windowEl);
  updateFeatureWindows();
  renderWindowSettings();
  return windowEl;
}

function renderFeatureContent(windowEl, feature) {
  const content = windowEl.querySelector('[data-feature-content]');
  if (!content) return;

  if (feature === 'layers') {
    content.innerHTML = '<div class="layer-controls"><label class="compact-toggle"><input type="checkbox" data-layer-toggle="basic" checked /><span>Base</span></label><label class="compact-toggle"><input type="checkbox" data-layer-toggle="static" checked /><span>Static</span></label><label class="compact-toggle"><input type="checkbox" data-layer-toggle="dynamic" checked /><span>Dynamic</span></label></div>';
    return;
  }
  if (feature === 'hook') {
    content.innerHTML = '<button type="button" class="compact-btn" data-hook-start>フック</button><div class="feature-value"><span class="info-label">自機Hook</span> <strong data-feature-value="hook-name">--</strong></div><div class="feature-value"><strong data-feature-value="hook-bearing">---°</strong> / <strong data-feature-value="hook-distance">--nm</strong></div>';
    return;
  }
  if (feature === 'hook2') {
    content.innerHTML = '<button type="button" class="compact-btn" data-hook2-start>2点を選択</button><div class="feature-value"><span data-hook2-names>始点: -- / 終点: --</span></div><div class="feature-value"><strong data-hook2-bearing>---°</strong> / <strong data-hook2-distance>--nm</strong></div>';
    return;
  }
  if (feature === 'tot') {
    const [hour, minute, second] = getTotTimeParts();
    content.innerHTML = `
      <div class="tot-time-inputs" aria-label="TOT時刻">
        <label>時<input data-tot-hour type="number" min="0" max="23" step="1" value="${hour}" /></label>
        <span>:</span>
        <label>分<input data-tot-minute type="number" min="0" max="59" step="1" value="${minute}" /></label>
        <span>:</span>
        <label>秒<input data-tot-second type="number" min="0" max="59" step="1" value="${second}" /></label>
      </div>
      <div class="feature-value tot-launch-value" data-tot-launch-row><span class="info-label">発射TOT</span> <strong data-feature-value="tot-launch">--:--:--</strong></div>
      <div class="feature-value"><span class="info-label">必要速度</span> <strong data-feature-value="tot">--kt</strong></div>`;
    return;
  }
  if (feature === 'dynamicList') {
    content.innerHTML = '<div class="dynamic-list" data-dynamic-list></div>';
    renderDynamicListWindow(windowEl);
    return;
  }
  if (feature === 'sead') {
    content.innerHTML = '<div class="sead-window-summary"><span data-sead-remain-label>HARM REMAIN</span><strong data-sead-remain>--</strong></div><button type="button" class="compact-btn sead-magnum-button" data-sead-magnum>MAGNUM</button><div class="sead-launch-list" data-sead-launch-list></div>';
    renderSeadWindow(windowEl);
    return;
  }
  if (feature === 'tos') {
    content.innerHTML = `
      <div class="feature-value"><span class="info-label">NOW</span> <strong data-feature-value="tos-now">--:--:--</strong></div>
      <div class="feature-value"><span class="info-label">TOS</span> <strong data-feature-value="tos">--:--:--</strong></div>
    `;
    return;
  }
  const labels = { be: 'B/E', track: 'Track', gs: 'GS', tos: 'TOS' };
  content.innerHTML = `<div class="feature-value"><span class="info-label">${labels[feature] || feature}</span> <strong data-feature-value="${feature}">--</strong></div>`;
}

function bindFeatureWindow(windowEl) {
  const feature = windowEl.dataset.feature;
  windowEl.querySelectorAll('[data-layer-toggle]').forEach((toggle) => {
    const layer = toggle.dataset.layerToggle;
    toggle.checked = state[`${layer}Visible`];
    toggle.addEventListener('change', () => {
      state[`${layer}Visible`] = toggle.checked;
      saveState();
      renderMap();
    });
  });
  windowEl.querySelector('[data-hook-start]')?.addEventListener('click', () => {
    const wasActive = hookMode === 'hook' && activeHookWindowKey === windowEl.dataset.window;
    activeHookWindowKey = windowEl.dataset.window;
    hookMode = wasActive ? false : 'hook';
    elements.svg.toggleAttribute('data-hook-selecting', hookMode === 'hook');
    setSettingsStatus('フック対象を選択: オブジェクトをタップしてください');
  });
  if (feature === 'hook2') {
    windowEl.querySelector('[data-hook2-start]')?.addEventListener('click', () => {
      activeHookWindowKey = windowEl.dataset.window;
      hook2WindowTargets.set(activeHookWindowKey, []);
      hookMode = 'hook2';
      elements.svg.setAttribute('data-hook-selecting', '');
      updateFeatureWindows();
      setSettingsStatus('2点HOOK: MAP上の地点を2点タップしてください');
    });
  }
  if (feature === 'tot') {
    windowEl.querySelectorAll('[data-tot-hour], [data-tot-minute], [data-tot-second]').forEach((input) => {
      input.addEventListener('input', () => updateTotFromWindow(windowEl));
      input.addEventListener('change', () => updateTotFromWindow(windowEl));
    });
    updateTotWindow(windowEl);
  }
  if (feature === 'dynamicList') {
    renderDynamicListWindow(windowEl);
  }
  if (feature === 'sead') renderSeadWindow(windowEl);
}

function getSeadLaunches() {
  if (!Array.isArray(state.seadLaunches)) state.seadLaunches = [];
  return state.seadLaunches;
}

function getSeadLaunchRemaining(objectId) {
  const launch = getSeadLaunches().find((entry) => entry.objectId === objectId);
  return launch ? Number(state.settings.seadHarmTof) - Math.floor((Date.now() - launch.launchedAt) / 1000) : null;
}

function getSeadCircleClass(objectId) {
  const remaining = getSeadLaunchRemaining(objectId);
  if (remaining === null || remaining < 5) return '';
  return remaining <= 30 ? 'sead-range-warning' : 'sead-range-active';
}

function renderSeadWindow(windowEl) {
  const list = windowEl.querySelector('[data-sead-launch-list]');
  const remainLabel = windowEl.querySelector('[data-sead-remain-label]');
  const remain = windowEl.querySelector('[data-sead-remain]');
  const magnum = windowEl.querySelector('[data-sead-magnum]');
  if (!list || !remain || !remainLabel || !magnum) return;
  const harmRemain = clampNumber(Number(state.settings.seadHarmRemain), 0, 99, 0);
  const arizona = clampNumber(Number(state.settings.seadArizona), 0, 9, 0);
  const isArizona = harmRemain <= arizona;
  const isEmpty = harmRemain === 0;
  remainLabel.textContent = isEmpty ? '' : 'HARM REMAIN';
  remain.textContent = isEmpty ? 'ARIZONA' : String(harmRemain);
  remainLabel.classList.toggle('sead-remain-warning', isArizona && !isEmpty);
  remain.classList.toggle('sead-remain-warning', isArizona && !isEmpty);
  remainLabel.classList.toggle('sead-remain-empty', isEmpty);
  remain.classList.toggle('sead-remain-empty', isEmpty);
  magnum.classList.toggle('sead-magnum-empty', isEmpty);
  list.innerHTML = '';
  getSeadLaunches().forEach((launch) => {
    const row = document.createElement('div');
    const remaining = Number(state.settings.seadHarmTof) - Math.floor((Date.now() - launch.launchedAt) / 1000);
    row.className = `sead-launch-item${remaining <= 30 ? ' sead-launch-warning' : ''}`;
    row.innerHTML = '<strong></strong><span></span>';
    row.querySelector('strong').textContent = launch.name;
    row.querySelector('span').textContent = formatSeadCountdown(remaining);
    list.appendChild(row);
  });
}

function formatSeadCountdown(seconds) {
  const sign = seconds < 0 ? '-' : '';
  const absolute = Math.abs(seconds);
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function launchSeadHarm(item) {
  const remain = clampNumber(Number(state.settings.seadHarmRemain), 0, 99, 0);
  if (remain <= 0) return;
  state.settings.seadHarmRemain = remain - 1;
  const launches = getSeadLaunches();
  const existingLaunch = launches.find((launch) => launch.objectId === item.id);
  const launch = { id: existingLaunch?.id || `${item.id}-${Date.now()}`, objectId: item.id, name: item.name, launchedAt: Date.now() };
  if (existingLaunch) Object.assign(existingLaunch, launch);
  else launches.push(launch);
  seadSelectionMode = false;
  document.querySelectorAll('[data-sead-magnum]').forEach((button) => { button.style.background = ''; });
  saveState();
  updateDynamicRangeCircleAppearance();
  updateFeatureWindows();
}

function resetSead() {
  state.settings.seadHarmRemain = clampNumber(Number(state.seadInitialHarmRemain), 0, 99, 0);
  state.seadLaunches = [];
  seadSelectionMode = false;
  document.querySelectorAll('[data-sead-magnum]').forEach((button) => { button.style.background = ''; });
  saveState();
  updateSettingsFields();
  updateFeatureWindows();
  setSettingsStatus('SEADを初弾発射前の状態に戻しました');
}

function isNotificationEnabled(item) {
  return state.settings.notifications?.items?.includes(item);
}

function sendAppNotification(title) {
  if (!('Notification' in window) || Notification.permission !== 'granted') return;
  const text = String(state.settings.notifications?.text || '').trim();
  new Notification(title, { body: text });
}

function notifyOnce(eventKey, title) {
  if (notificationEvents.has(eventKey)) return;
  notificationEvents.add(eventKey);
  sendAppNotification(title);
}

function checkSeadNotifications() {
  if (!isNotificationEnabled('sead')) return;
  getSeadLaunches().forEach((launch) => {
    const remaining = Number(state.settings.seadHarmTof) - Math.floor((Date.now() - launch.launchedAt) / 1000);
    if (remaining <= 30) notifyOnce(`sead:${launch.id}`, `SEAD ${launch.name}`);
  });
}

function getTotTargetDate(windowEl, now) {
  const hour = Number(windowEl.querySelector('[data-tot-hour]')?.value);
  const minute = Number(windowEl.querySelector('[data-tot-minute]')?.value);
  const second = Number(windowEl.querySelector('[data-tot-second]')?.value);
  if (![hour, minute, second].every(Number.isInteger) || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null;
  const target = new Date(now);
  target.setHours(hour, minute, second, 0);
  return target;
}

function checkTotNotifications(now) {
  if (!isNotificationEnabled('tot')) return;
  document.querySelectorAll('.draggable-window[data-feature="tot"]').forEach((windowEl) => {
    const target = getTotTargetDate(windowEl, now);
    if (!target || target.getTime() > now.getTime() || target.getTime() <= lastNotificationCheck) return;
    notifyOnce(`tot:${windowEl.dataset.window}:${target.getTime()}`, `TOT ${windowEl.querySelector('.window-title')?.textContent || ''}`.trim());
  });
}

function renderDynamicListWindow(windowEl) {
  const list = windowEl.querySelector('[data-dynamic-list]');
  if (!list) return;
  list.innerHTML = '';

  state.dynamic.forEach((item) => {
    const coordinates = getItemGeoCoordinates(item);
    const position = geoToBullseyeOffset(coordinates.lat, coordinates.lon);
    const magneticBearing = Math.round(toMagneticBearing(position.bearing));
    const distance = Math.min(999, Math.max(0, Math.round(position.distance)));
    const row = document.createElement('div');
    row.className = 'dynamic-list-item';
    row.innerHTML = `
      <div class="dynamic-list-heading"><strong></strong><label><select data-dynamic-status>${DYNAMIC_STATUSES.map((status) => `<option value="${status}">${status}</option>`).join('')}</select></label></div>
      <div class="dynamic-list-grid">
        <label>方位<input data-dynamic-bearing data-bearing-input type="text" inputmode="none" value="${magneticBearing}" /></label>
        <label>距離<input data-dynamic-distance type="text" inputmode="none" value="${distance}" /></label>
        <label>半径<span data-dynamic-radius></span></label>
      </div>`;
    row.querySelector('strong').textContent = item.name;
    row.querySelector('[data-dynamic-radius]').textContent = `${Number(item.geometryRadius || 0)}nm`;
    row.querySelector('[data-dynamic-status]').value = item.status || 'ASLEEP';

    const savePosition = () => {
      const bearingInput = row.querySelector('[data-dynamic-bearing]');
      const distanceInput = row.querySelector('[data-dynamic-distance]');
      if (!validateBearingInput(bearingInput)) return;
      const bearing = magneticToTrue(Number(bearingInput.value));
      const distance = Math.max(0, Number(distanceInput.value) || 0);
      const geo = bullseyeOffsetToGeo(bearing, distance);
      const mapPosition = geoToMapPosition(geo.lat, geo.lon);
      item.lat = geo.lat;
      item.lon = geo.lon;
      item.x = mapPosition.x;
      item.y = mapPosition.y;
      saveState();
      renderMap();
    };
    row.querySelector('[data-dynamic-bearing]').addEventListener('input', () => validateBearingInput(row.querySelector('[data-dynamic-bearing]')));
    row.querySelector('[data-dynamic-bearing]').addEventListener('change', savePosition);
    row.querySelector('[data-dynamic-distance]').addEventListener('change', savePosition);
    row.querySelector('[data-dynamic-status]').addEventListener('change', (event) => {
      item.status = event.target.value;
      saveState();
      renderMap();
    });
    list.appendChild(row);
  });
}

function updateFeatureWindows(includeDynamicList = true) {
  document.querySelectorAll('.draggable-window').forEach((windowEl) => {
    const feature = windowEl.dataset.feature;
    if (feature === 'hook') {
      const targetData = hookWindowTargets.get(windowEl.dataset.window)
        || (windowEl.dataset.window === 'hook' ? hookTarget : null);
      const targetCoordinates = targetData ? getHookTargetCoordinates(targetData) : null;
      const target = windowEl.querySelector('[data-feature-value="hook-name"]');
      if (target) target.textContent = targetData?.name || '--';
      const bearing = windowEl.querySelector('[data-feature-value="hook-bearing"]');
      const distance = windowEl.querySelector('[data-feature-value="hook-distance"]');
      if (bearing) bearing.textContent = targetCoordinates ? `${formatBearing(calculateBearing(state.self, targetCoordinates, state.settings.manualDeviation || 0))}°` : '---°';
      if (distance) distance.textContent = targetCoordinates ? `${calculateDistance(state.self, targetCoordinates).toFixed(1)}nm` : '--nm';
    }
    if (feature === 'be') {
      const bearing = windowEl.querySelector('[data-feature-value="be"]');
      const bullseye = getBullseyeMapPosition();
      if (bearing) bearing.textContent = `${formatBearing(calculateBearing(bullseye, state.self, state.settings.manualDeviation || 0))}° / ${calculateDistance(bullseye, state.self).toFixed(1)}nm`;
    }
    if (feature === 'track') windowEl.querySelector('[data-feature-value="track"]')?.replaceChildren(`${formatBearing(toMagneticBearing(state.self.heading || 0))}°M`);
    if (feature === 'gs') windowEl.querySelector('[data-feature-value="gs"]')?.replaceChildren(`${Math.round(state.self.speed || 0)}kt`);
    if (feature === 'tos') {
      const nowValue = windowEl.querySelector('[data-feature-value="tos-now"]');
      if (nowValue) nowValue.textContent = getMapReferenceStandardTime();
      const value = windowEl.querySelector('[data-feature-value="tos"]');
      if (value) value.textContent = getTimeOnStation();
    }
    if (feature === 'tot') updateTotWindow(windowEl);
    if (feature === 'hook2') {
      const [first, second] = hook2WindowTargets.get(windowEl.dataset.window) || [];
      const firstCoordinates = first ? getHookTargetCoordinates(first) : null;
      const secondCoordinates = second ? getHookTargetCoordinates(second) : null;
      const names = windowEl.querySelector('[data-hook2-names]');
      if (names) names.textContent = `始点: ${first?.name || '--'} / 終点: ${second?.name || '--'}`;
      const bearing = windowEl.querySelector('[data-hook2-bearing]');
      const distance = windowEl.querySelector('[data-hook2-distance]');
      if (bearing) bearing.textContent = firstCoordinates && secondCoordinates ? `${formatBearing(calculateBearing(firstCoordinates, secondCoordinates, state.settings.manualDeviation || 0))}°` : '---°';
      if (distance) distance.textContent = firstCoordinates && secondCoordinates ? `${calculateDistance(firstCoordinates, secondCoordinates).toFixed(1)}nm` : '--nm';
    }
    if (includeDynamicList && feature === 'dynamicList') renderDynamicListWindow(windowEl);
    if (feature === 'sead') renderSeadWindow(windowEl);
  });
}

function getMapReferenceStandardTime(date = new Date()) {
  const mapCenterLon = Number.isFinite(state.settings.mapCenter?.lon) ? Number(state.settings.mapCenter.lon) : 136;
  const offsetHours = Math.floor((mapCenterLon + 7.5) / 15);
  const utcTimestamp = Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate(),
    date.getUTCHours(),
    date.getUTCMinutes(),
    date.getUTCSeconds(),
  ) + offsetHours * 60 * 60 * 1000;
  const localDate = new Date(utcTimestamp);
  return `${String(localDate.getUTCHours()).padStart(2, '0')}:${String(localDate.getUTCMinutes()).padStart(2, '0')}:${String(localDate.getUTCSeconds()).padStart(2, '0')}`;
}

function getTimeOnStation() {
  if (!hookTarget || !(state.self.speed > 0)) return '--:--:--';
  const targetCoordinates = getHookTargetCoordinates(hookTarget);
  const hours = calculateDistance(state.self, targetCoordinates) / state.self.speed;
  return new Date(Date.now() + hours * 60 * 60 * 1000).toLocaleTimeString('ja-JP', { hour12: false });
}

function updateTotWindow(windowEl) {
  const value = windowEl.querySelector('[data-feature-value="tot"]');
  if (!value) return;
  const [hour, minute, second] = getTotTimeParts(windowEl);
  const targetTime = getTotTargetDate(windowEl, new Date());
  const launchTime = targetTime ? new Date(targetTime.getTime() - Number(state.settings.totTof || 0) * 1000) : null;
  const launchRow = windowEl.querySelector('[data-tot-launch-row]');
  const launchValue = windowEl.querySelector('[data-feature-value="tot-launch"]');
  if (launchRow) launchRow.classList.toggle('hidden', !state.settings.totLaunchEnabled);
  if (launchValue) launchValue.textContent = launchTime ? formatClockTime(launchTime) : '--:--:--';
  if (!hookTarget) {
    value.textContent = '--kt';
    return;
  }
  if (!Number.isInteger(hour) || hour < 0 || hour > 23 || !Number.isInteger(minute) || minute < 0 || minute > 59 || !Number.isInteger(second) || second < 0 || second > 59) {
    value.textContent = '--kt';
    return;
  }
  const now = new Date();
  if (![hour, minute, second].every(Number.isInteger) || !targetTime) {
    value.textContent = '--kt';
    return;
  }
  if (targetTime <= now) targetTime.setDate(targetTime.getDate() + 1);
  const speedTarget = state.settings.totLaunchEnabled
    ? new Date(targetTime.getTime() - Number(state.settings.totTof || 0) * 1000)
    : targetTime;
  const hoursRemaining = (speedTarget.getTime() - now.getTime()) / 3600000;
  const targetCoordinates = getHookTargetCoordinates(hookTarget);
  const speedKt = calculateDistance(state.self, targetCoordinates) / hoursRemaining;
  value.textContent = Number.isFinite(speedKt) ? `${Math.round(speedKt)}kt` : '--kt';
}

function getTotTimeParts(windowEl = null) {
  if (windowEl) return ['hour', 'minute', 'second'].map((part) => Number(windowEl.querySelector(`[data-tot-${part}]`)?.value));
  const match = String(state.settings.totTime || '').match(/^(\d{2}):(\d{2}):(\d{2})$/);
  if (match) return match.slice(1).map(Number);
  const now = new Date();
  return [now.getHours(), now.getMinutes(), 0];
}

function formatClockTime(date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:${String(date.getSeconds()).padStart(2, '0')}`;
}

function updateTotFromWindow(windowEl) {
  const [hour, minute, second] = getTotTimeParts(windowEl);
  if ([hour, minute, second].every(Number.isInteger) && hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 && second >= 0 && second <= 59) {
    state.settings.totTime = `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
    updateSettingsFields();
    saveState();
  }
  updateFeatureWindows(false);
}

function showWindowSettings() {
  hideSettingsPanels();
  elements.windowSettingsPanel.classList.remove('hidden');
  renderWindowSettings();
  setSettingsStatus('ウィンドウ設定を表示中');
}

function hideSettingsPanels() {
  elements.basicLayerPanel.classList.add('hidden');
  elements.staticLayerPanel.classList.add('hidden');
  elements.seadSettingsPanel.classList.add('hidden');
  elements.totSettingsPanel.classList.add('hidden');
  elements.markSettingsPanel.classList.add('hidden');
  elements.windowSettingsPanel.classList.add('hidden');
  elements.notificationSettingsPanel.classList.add('hidden');
}

function showMarkSettingsPanel() {
  const config = state.markSettings || sampleState.markSettings;
  elements.markSettingsPanel.classList.remove('hidden');
  elements.markObjectName.value = config.name || 'MARK';
  elements.markObjectType.value = config.type || 'neutral';
  elements.markObjectSymbol.value = config.symbol || 'diamond';
  [1, 2, 3].forEach((index) => {
    const circle = config.circles?.[index - 1] || {};
    elements[`markCircleRadius${index}`].value = circle.radius || 0;
    elements[`markCircleColor${index}`].value = circle.color || 'red';
  });
  setSettingsStatus('MARKオブジェクト設定を表示中');
}

function saveMarkSettings() {
  state.markSettings = {
    name: elements.markObjectName.value.trim() || 'MARK',
    type: elements.markObjectType.value,
    symbol: elements.markObjectSymbol.value,
    circles: [1, 2, 3].map((index) => ({ radius: Math.max(0, Number(elements[`markCircleRadius${index}`].value) || 0), color: elements[`markCircleColor${index}`].value })),
  };
  saveState();
  setSettingsStatus('MARKオブジェクト設定を保存しました');
}

function createMarkObject(coordinates, layer = 'dynamic') {
  const config = state.markSettings || sampleState.markSettings;
  const position = geoToMapPosition(coordinates.lat, coordinates.lon);
  const circles = config.circles.map((circle) => ({ ...circle }));
  const hasCircle = circles.some((circle) => Number(circle.radius) > 0);
  const item = { id: `mark-${Date.now()}`, type: config.type, name: config.name, symbol: config.symbol, layer, lat: coordinates.lat, lon: coordinates.lon, x: position.x, y: position.y, status: hasCircle ? 'ACTIVE' : 'ASLEEP', geometryType: 'circle', geometryRadius: circles[0]?.radius || 0, circleConfig: circles };
  state[layer].push(item);
  saveState();
  renderMap();
}

function showMapActionMenu(clientX, clientY) {
  mapActionPosition = { clientX, clientY, ...mapPositionToGeo(screenPointToMapPosition(clientX, clientY).x, screenPointToMapPosition(clientX, clientY).y) };
  elements.mapActionMenu.style.left = `${clientX}px`;
  elements.mapActionMenu.style.top = `${clientY}px`;
  elements.mapActionMenu.classList.remove('hidden');
}

function hideMapActionMenus() {
  elements.mapActionMenu.classList.add('hidden');
  elements.coordinateActionMenu.classList.add('hidden');
  elements.coordinateInputPanel.classList.add('hidden');
}

function openCoordinateInput(mode) {
  elements.mapActionMenu.classList.add('hidden');
  elements.coordinateActionMenu.classList.add('hidden');
  const fields = document.querySelector('[data-coordinate-input-fields]');
  document.querySelector('[data-coordinate-input-title]').textContent = mode === 'be' ? 'B/E' : 'LAT/LON';
  fields.innerHTML = mode === 'be'
    ? '<div class="dynamic-list-item"><label>方位<input data-coordinate-bearing data-dynamic-bearing type="text" inputmode="none" readonly placeholder="方位" /></label><label>距離<input data-coordinate-distance data-dynamic-distance type="text" inputmode="none" readonly placeholder="距離nm" /></label></div>'
    : '<input data-coordinate-lat type="text" inputmode="none" readonly placeholder="緯度" /><input data-coordinate-lon type="text" inputmode="none" readonly placeholder="経度" />';
  fields.querySelectorAll('input').forEach((input) => {
    if (mode !== 'be') {
      configureNumericKeypadTarget(input);
      input.addEventListener('focus', () => openLatLonKeypad(fields.querySelector('[data-coordinate-lat]'), fields.querySelector('[data-coordinate-lon]')));
      input.addEventListener('click', () => openLatLonKeypad(fields.querySelector('[data-coordinate-lat]'), fields.querySelector('[data-coordinate-lon]')));
    }
  });
  elements.coordinateInputPanel.dataset.mode = mode;
  elements.coordinateInputPanel.classList.remove('hidden');
  if (mode === 'be') {
    const bearing = fields.querySelector('[data-coordinate-bearing]');
    doBeKeypadActive = true;
    openDynamicKeypad(bearing);
  }
  if (mode === 'latlon') openLatLonKeypad(fields.querySelector('[data-coordinate-lat]'), fields.querySelector('[data-coordinate-lon]'));
}

function submitCoordinateInput() {
  const mode = elements.coordinateInputPanel.dataset.mode;
  const fields = elements.coordinateInputPanel;
  const coordinates = mode === 'be'
    ? (() => { const bearing = Number(fields.querySelector('[data-coordinate-bearing]').value); const distance = Number(fields.querySelector('[data-coordinate-distance]').value); return Number.isFinite(bearing) && Number.isFinite(distance) ? bullseyeOffsetToGeo(bearing, distance) : null; })()
    : getLatLonKeypadCoordinates(fields.querySelector('[data-coordinate-lat]').value, fields.querySelector('[data-coordinate-lon]').value, state.settings.coordSystem);
  if (!coordinates || !Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lon)) return;
  createMarkObject(coordinates);
  hideMapActionMenus();
}

function getCoordinateExample(axis, system) {
  if (system === 'MGRS' || system === 'GARS') return axis === 'lat' ? '座標' : '座標';
  return system === 'DDMMSS' ? (axis === 'lat' ? '354123' : '1394123') : (axis === 'lat' ? '3541.234' : '13941.234');
}

function openLatLonKeypad(latitudeSource, longitudeSource) {
  if (!latitudeSource || !longitudeSource) return;
  const isDoInput = latitudeSource.matches('[data-coordinate-lat]');
  const system = isDoInput ? (state.settings.coordSystem || 'DDMM.MMM') : (elements.staticLayerCoordSystem?.value || state.settings.coordSystem || 'DDMM.MMM');
  const fields = elements.latLonKeypadFields;
  const latTarget = fields.querySelector('[data-latlon-keypad-target="lat"]');
  const lonTarget = fields.querySelector('[data-latlon-keypad-target="lon"]');
  latLonKeypadSources = { lat: latitudeSource, lon: longitudeSource };
  latLonKeypadInitialValues = { lat: latitudeSource.value, lon: longitudeSource.value };
  latLonKeypadMode = system;
  latTarget.value = '';
  lonTarget.value = '';
  latTarget.placeholder = getCoordinateExample('lat', system);
  lonTarget.placeholder = getCoordinateExample('lon', system);
  fields.querySelector('[data-latlon-hemisphere="lat"]').textContent = state.settings.mapCenter.lat < 0 ? 'S' : 'N';
  fields.querySelector('[data-latlon-hemisphere="lon"]').textContent = state.settings.mapCenter.lon < 0 ? 'W' : 'E';
  keypadMode = 'latlon';
  keypadTarget = latTarget;
  elements.numericKeypad.querySelector('[data-dol-keypad-fields]').classList.add('hidden');
  fields.classList.remove('hidden');
  elements.numericKeypad.classList.add('dol-keypad-mode');
  elements.numericKeypad.classList.remove('hidden');
  updateNumericKeypadDisplay();
}

function stripCoordinateSign(value) {
  return String(value || '').replace(/^-/, '').replace(/[NSWE]$/i, '');
}

function getLatLonKeypadCoordinates(latitudeValue, longitudeValue, system) {
  const latitude = parseCoordinate(latitudeValue, 'lat', system, NaN);
  const longitude = parseCoordinate(longitudeValue, 'lon', system, NaN);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return {
    lat: (state.settings.mapCenter.lat < 0 ? -1 : 1) * Math.abs(latitude),
    lon: (state.settings.mapCenter.lon < 0 ? -1 : 1) * Math.abs(longitude),
  };
}

function submitDoBeKeypadInput(bearing, distance) {
  const coordinates = bullseyeOffsetToGeo(Number(bearing), Number(distance));
  if (!Number.isFinite(coordinates.lat) || !Number.isFinite(coordinates.lon)) return false;
  createMarkObject(coordinates);
  hideMapActionMenus();
  elements.numericKeypad.classList.add('hidden');
  return true;
}

function showSeadSettingsPanel() {
  elements.seadSettingsPanel.classList.remove('hidden');
  updateSettingsFields();
  setSettingsStatus('SEAD管理を表示中');
}

function showTotSettingsPanel() {
  elements.totSettingsPanel.classList.remove('hidden');
  updateSettingsFields();
  setSettingsStatus('TOT設定を表示中');
}

function showNotificationSettings() {
  hideSettingsPanels();
  elements.notificationSettingsPanel.classList.remove('hidden');
  const settings = state.settings.notifications || defaultSettings.notifications;
  document.querySelectorAll('[data-notification-item]').forEach((input) => {
    input.checked = settings.items.includes(input.dataset.notificationItem);
  });
  elements.notificationText.value = settings.text || '';
  const permission = 'Notification' in window ? Notification.permission : 'unsupported';
  elements.notificationPermissionButton.textContent = permission === 'granted' ? '通知は許可済み' : '通知を許可';
  setSettingsStatus('通知設定を表示中');
}

function setActiveSettingsButton(button) {
  document.querySelectorAll('.settings-buttons button').forEach((entry) => {
    entry.classList.toggle('active', entry === button);
  });
}

function clearHookStateForWindow(windowEl) {
  if (!windowEl) return;
  const key = windowEl.dataset.window;
  if (!key) return;

  if (windowEl.dataset.feature === 'hook' || windowEl.dataset.feature === 'hook2') {
    hookWindowTargets.delete(key);
    hook2WindowTargets.delete(key);

    if (key === 'hook') {
      hookTarget = null;
    }

    if (activeHookWindowKey === key) {
      activeHookWindowKey = 'hook';
    }

    if (hookMode === 'hook') {
      hookMode = false;
      elements.svg.removeAttribute('data-hook-selecting');
      elements.hookButton.style.background = '';
    }

    if (hookMode === 'hook2' && (!hook2WindowTargets.get(activeHookWindowKey) || hook2WindowTargets.get(activeHookWindowKey).length === 0)) {
      hookMode = false;
      elements.svg.removeAttribute('data-hook-selecting');
    }

    updateHookDisplay();
    updateFeatureWindows();
    renderMap();
  }
}

function renderWindowSettings() {
  if (!elements.windowSettingsList) return;
  elements.windowSettingsList.innerHTML = '';

  document.querySelectorAll('.draggable-window').forEach((windowEl) => {
    const row = document.createElement('div');
    row.className = 'layer-item';
    const title = windowEl.querySelector('.window-title')?.textContent || windowEl.dataset.window;
    const feature = WINDOW_FEATURE_LABELS[windowEl.dataset.feature] || windowEl.dataset.feature;
    const visible = windowEl.style.display !== 'none';
    const isCustom = windowEl.dataset.window.startsWith('custom-');
    row.innerHTML = `
      <div class="layer-item-main"><strong></strong><span>${feature} / ${visible ? '表示中' : '非表示'}</span></div>
      <label class="mini-toggle"><input type="checkbox" ${visible ? 'checked' : ''} /> 表示</label>
      ${isCustom ? '<button type="button" class="danger-btn small-btn" data-window-delete>削除</button>' : ''}
    `;
    row.querySelector('strong').textContent = title;
    row.querySelector('input').addEventListener('change', (event) => {
      const shouldShow = event.target.checked;
      if (!shouldShow) clearHookStateForWindow(windowEl);
      windowEl.style.display = shouldShow ? '' : 'none';
      const saved = JSON.parse(localStorage.getItem(WINDOWS_STORAGE_KEY) || '{}');
      saved[windowEl.dataset.window] = {
        ...(saved[windowEl.dataset.window] || {}),
        visible: shouldShow,
      };
      localStorage.setItem(WINDOWS_STORAGE_KEY, JSON.stringify(saved));
      renderWindowSettings();
    });
    if (isCustom) {
      row.querySelector('[data-window-delete]').addEventListener('click', () => {
        clearHookStateForWindow(windowEl);
        const saved = JSON.parse(localStorage.getItem(WINDOWS_STORAGE_KEY) || '{}');
        delete saved[windowEl.dataset.window];
        localStorage.setItem(WINDOWS_STORAGE_KEY, JSON.stringify(saved));
        windowEl.remove();
        renderWindowSettings();
        setSettingsStatus(`${title} ウィンドウを削除しました`);
      });
    }
    elements.windowSettingsList.appendChild(row);
  });
}

function bindEvents() {
  setupNumericKeypad();
  elements.centerOnSelfButton.addEventListener('click', centerMapOnSelf);
  elements.settingsButton.addEventListener('click', () => toggleSettings(true));
  elements.closeSettings.addEventListener('click', () => toggleSettings(false));
  elements.saveInitialStateButton.addEventListener('click', saveCurrentAsInitialState);
  elements.exportPresetButton.addEventListener('click', exportCurrentPreset);
  elements.importPresetButton.addEventListener('click', () => elements.presetFileInput.click());
  elements.presetFileInput.addEventListener('change', importPresetFile);
  elements.resetAppButton.addEventListener('click', resetAppState);
  elements.settingsModal.addEventListener('click', (event) => {
    if (event.target === elements.settingsModal) toggleSettings(false);
  });

  document.querySelector('[data-window-settings]').addEventListener('click', (event) => {
    setActiveSettingsButton(event.currentTarget);
    showWindowSettings();
  });
  document.querySelector('[data-notification-settings]').addEventListener('click', (event) => {
    setActiveSettingsButton(event.currentTarget);
    showNotificationSettings();
  });
  document.querySelectorAll('[data-notification-item]').forEach((input) => {
    input.addEventListener('change', () => {
      const items = [...document.querySelectorAll('[data-notification-item]:checked')].map((entry) => entry.dataset.notificationItem);
      state.settings.notifications.items = items;
      saveState();
    });
  });
  elements.notificationText.addEventListener('input', () => {
    state.settings.notifications.text = elements.notificationText.value;
    saveState();
  });
  elements.notificationPermissionButton.addEventListener('click', async () => {
    if (!('Notification' in window)) {
      setSettingsStatus('この端末・ブラウザは通知に対応していません');
      return;
    }
    const permission = await Notification.requestPermission();
    elements.notificationPermissionButton.textContent = permission === 'granted' ? '通知は許可済み' : '通知を許可';
    setSettingsStatus(permission === 'granted' ? '通知を許可しました' : '通知は許可されませんでした');
  });
  elements.addWindowButton.addEventListener('click', () => {
    const title = elements.windowNameInput.value.trim() || WINDOW_FEATURE_LABELS[elements.windowFeatureSelect.value];
    createCustomWindow(title, elements.windowFeatureSelect.value);
    elements.windowNameInput.value = '';
    setSettingsStatus(`${title} ウィンドウを追加しました`);
  });

  document.addEventListener('click', (event) => {
    const actionButton = event.target.closest('[data-map-action]');
    if (actionButton && mapActionPosition) {
      const action = actionButton.dataset.mapAction;
      if (action === 'mark') createMarkObject(mapActionPosition);
      if (action === 'so') {
        mapPickTarget = 'static';
        mapPickReturnPanel = 'static';
        toggleSettings(true);
        showStaticLayerPanel();
        openStaticLayerEditor();
        elements.staticLayerLat.value = formatDdmmm(mapActionPosition.lat, 'lat');
        elements.staticLayerLon.value = formatDdmmm(mapActionPosition.lon, 'lon');
        mapPickTarget = null;
        setSettingsStatus('SO: 静的オブジェクトの内容を設定して保存してください');
      }
      if (action === 'do') {
        elements.mapActionMenu.classList.add('hidden');
        elements.coordinateActionMenu.style.left = `${mapActionPosition.clientX}px`;
        elements.coordinateActionMenu.style.top = `${mapActionPosition.clientY}px`;
        elements.coordinateActionMenu.classList.remove('hidden');
      }
      if (action !== 'do') hideMapActionMenus();
      return;
    }
    const coordinateButton = event.target.closest('[data-coordinate-action]');
    if (coordinateButton) {
      openCoordinateInput(coordinateButton.dataset.coordinateAction);
      return;
    }
    if (event.target.closest('[data-coordinate-submit]')) {
      submitCoordinateInput();
      return;
    }
    if (event.target.closest('[data-coordinate-cancel]')) {
      hideMapActionMenus();
      return;
    }
    if (!event.target.closest('#mapActionMenu, #coordinateActionMenu, #coordinateInputPanel')) hideMapActionMenus();
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('[data-sead-magnum]');
    if (!button) return;
    seadSelectionMode = !seadSelectionMode;
    button.style.background = seadSelectionMode ? 'rgba(248, 113, 113, 0.35)' : '';
    setSettingsStatus(seadSelectionMode ? 'MAGNUM: HARM発射対象をタップしてください' : 'MAGNUM選択を解除しました');
  });

  elements.hookButton.addEventListener('click', () => {
    activeHookWindowKey = 'hook';
    hookMode = 'hook';
    if (hookMode) {
      elements.hookButton.style.background = 'rgba(167, 139, 250, 0.3)';
      setSettingsStatus('フック対象を選択: オブジェクトをタップしてください');
    } else {
      elements.hookButton.style.background = '';
      setSettingsStatus('フック設定をキャンセルしました');
    }
  });

  elements.mapCenterLat.addEventListener('change', () => {
    state.settings.mapCenter.lat = parseDdmmm(elements.mapCenterLat.value, 'lat', state.settings.mapCenter.lat);
    syncSelfToMapCenterIfNoGps();
    saveState();
    updateSettingsFields();
    renderMap();
    setSettingsStatus('初期マップ中心の緯度を更新しました');
  });

  elements.mapCenterLon.addEventListener('change', () => {
    state.settings.mapCenter.lon = parseDdmmm(elements.mapCenterLon.value, 'lon', state.settings.mapCenter.lon);
    syncSelfToMapCenterIfNoGps();
    saveState();
    updateSettingsFields();
    renderMap();
    setSettingsStatus('初期マップ中心の経度を更新しました');
  });

  elements.bullseyeLat.addEventListener('change', () => {
    state.settings.bullseye.lat = parseDdmmm(elements.bullseyeLat.value, 'lat', state.settings.bullseye.lat);
    saveState();
    updateSettingsFields();
    renderMap();
  });

  elements.bullseyeLon.addEventListener('change', () => {
    state.settings.bullseye.lon = parseDdmmm(elements.bullseyeLon.value, 'lon', state.settings.bullseye.lon);
    saveState();
    updateSettingsFields();
    renderMap();
  });

  elements.pickBullseyeOnMap.addEventListener('click', () => startMapPick('bullseye'));
  elements.pickMapCenterOnMap.addEventListener('click', () => startMapPick('mapCenter'));
  elements.pickSelfPositionOnMap.addEventListener('click', () => startMapPick('selfPosition'));
  elements.toggleSelfSimulation.addEventListener('click', toggleSelfSimulation);
  elements.toggleGpsTracking.addEventListener('click', toggleGpsTracking);
  elements.selfSimulationHeading.addEventListener('change', updateSelfSimulationSettings);
  elements.selfSimulationSpeed.addEventListener('change', updateSelfSimulationSettings);

  elements.coordinateSystem.addEventListener('change', () => {
    state.settings.coordSystem = elements.coordinateSystem.value;
    saveState();
    renderStaticLayerSettings();
    renderMap();
    setSettingsStatus('座標系を更新しました');
  });

  document.querySelectorAll('input[name="deviationMode"]').forEach((radio) => {
    radio.addEventListener('change', () => {
      state.settings.deviationMode = radio.value;
      updateDeviationControls();
      saveState();
      setSettingsStatus(`偏差設定を ${radio.value === 'auto' ? '自動取得' : '手動入力'} に切り替えました`);
    });
  });

  elements.manualDeviation.addEventListener('change', () => {
    state.settings.manualDeviation = Number(elements.manualDeviation.value || 0);
    saveState();
    setSettingsStatus('手動偏差値を更新しました');
  });

  elements.seadHarmTof.addEventListener('change', () => {
    const seconds = parseSeadTof(elements.seadHarmTof.value);
    if (seconds === null) {
      updateSettingsFields();
      setSettingsStatus('HARM TOFはMM:SS形式で入力してください');
      return;
    }
    state.settings.seadHarmTof = seconds;
    updateSettingsFields();
    saveState();
    updateFeatureWindows();
  });
  elements.seadHarmRemain.addEventListener('change', () => {
    state.settings.seadHarmRemain = clampNumber(Number(elements.seadHarmRemain.value), 0, 99, 0);
    state.seadInitialHarmRemain = state.settings.seadHarmRemain;
    updateSettingsFields();
    saveState();
    updateFeatureWindows();
  });
  elements.seadResetButton.addEventListener('click', resetSead);
  elements.seadArizona.addEventListener('change', () => {
    state.settings.seadArizona = clampNumber(Number(elements.seadArizona.value), 0, 9, 0);
    updateSettingsFields();
    saveState();
    updateFeatureWindows();
  });
  [elements.totTimeHour, elements.totTimeMinute, elements.totTimeSecond, elements.totTofMinute, elements.totTofSecond].forEach((input) => {
    input.addEventListener('change', updateTotSettings);
    input.addEventListener('input', updateTotSettings);
  });
  elements.totLaunchEnabled.addEventListener('change', () => {
    state.settings.totLaunchEnabled = elements.totLaunchEnabled.checked;
    saveState();
    updateFeatureWindows();
  });
  elements.saveMarkSettings.addEventListener('click', saveMarkSettings);

  elements.displayScale.addEventListener('input', () => {
    state.settings.displayScale = clampNumber(Number(elements.displayScale.value), 10, 200, 100);
    updateSettingsFields();
    saveState();
    renderMap();
  });

  document.querySelectorAll('[data-layer-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const layer = button.dataset.layerTarget;
        setActiveSettingsButton(button);
        hideSettingsPanels();
      if (layer === 'basic') {
        showBasicLayerPanel();
      } else if (layer === 'static') {
        showStaticLayerPanel();
      } else if (layer === 'dynamic') {
        showDynamicLayerPanel();
      } else if (layer === 'sead') {
        showSeadSettingsPanel();
      } else if (layer === 'tot') {
        showTotSettingsPanel();
      } else if (layer === 'mark') {
        showMarkSettingsPanel();
      } else {
        setSettingsStatus(`${LAYER_LABELS[layer]}設定は後続実装予定です`);
      }
    });
  });

  elements.basicLayerVisibleToggle.addEventListener('change', () => {
    state.basicVisible = elements.basicLayerVisibleToggle.checked;
    elements.toggleBasic.checked = state.basicVisible;
    saveState();
    renderMap();
  });

  elements.basicLayerFilter.addEventListener('change', renderBasicLayerSettings);
  elements.addBasicAirspace.addEventListener('click', () => openBasicLayerEditor());
  elements.importBasicGeoJson.addEventListener('click', () => elements.basicGeoJsonFile.click());
  elements.basicGeoJsonFile.addEventListener('change', handleBasicGeoJsonImport);
  elements.clearBasicGeoJson.addEventListener('click', clearBasicGeoJson);
  elements.limitBasicDisplayRange.addEventListener('click', startBasicDisplayRangeSelection);
  elements.cancelBasicLayerForm.addEventListener('click', () => hideBasicLayerEditor());
  elements.basicLayerForm.addEventListener('submit', handleBasicLayerSubmit);

  elements.staticLayerVisibleToggle.addEventListener('change', () => {
    const visible = elements.staticLayerVisibleToggle.checked;
    state[`${managedLayer}Visible`] = visible;
    elements[`toggle${managedLayer === 'static' ? 'Static' : 'Dynamic'}`].checked = visible;
    saveState();
    renderMap();
  });
  elements.staticLayerFilter.addEventListener('change', renderStaticLayerSettings);
  elements.staticLayerCoordSystem.addEventListener('change', () => {
    const previousSystem = elements.staticLayerCoordSystem.dataset.previousValue || 'DDMM.MMM';
    const nextSystem = elements.staticLayerCoordSystem.value;
    const latitude = parseCoordinate(elements.staticLayerLat.value, 'lat', previousSystem, state.settings.mapCenter.lat);
    const longitude = ['MGRS', 'GARS'].includes(previousSystem)
      ? parseCoordinate(elements.staticLayerLat.value, 'lon', previousSystem, state.settings.mapCenter.lon)
      : parseCoordinate(elements.staticLayerLon.value, 'lon', previousSystem, state.settings.mapCenter.lon);
    if (['MGRS', 'GARS'].includes(nextSystem)) {
      elements.staticLayerLat.value = formatCoordinatePair(latitude, longitude, nextSystem);
      elements.staticLayerLon.value = '';
    } else {
      elements.staticLayerLat.value = formatCoordinate(latitude, 'lat', nextSystem);
      elements.staticLayerLon.value = formatCoordinate(longitude, 'lon', nextSystem);
    }
    elements.staticLayerCoordSystem.dataset.previousValue = nextSystem;
    updateStaticCoordinateFields();
  });
  elements.staticLayerType.addEventListener('change', updateStaticCoordinateFields);
  elements.staticLayerType.addEventListener('change', updateStaticCoordinateFields);
  elements.pickStaticPositionOnMap.addEventListener('click', () => startMapPick('static'));
  elements.pickStaticLinePointsOnMap.addEventListener('click', () => {
    if (mapPickTarget === 'staticLinePoints') {
      finishStaticLinePointPicking();
      return;
    }
    startMapPick('staticLinePoints');
  });
  elements.undoStaticLinePoint.addEventListener('click', () => {
    const points = getStaticLinePointsFromForm();
    points.pop();
    setStaticLinePointsInForm(points);
  });
  elements.clearStaticLinePoints.addEventListener('click', () => setStaticLinePointsInForm([]));
  elements.staticLayerLineWidth.addEventListener('input', () => {
    elements.staticLayerLineWidthValue.value = elements.staticLayerLineWidth.value;
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && mapPickTarget === 'staticLinePoints') {
      event.preventDefault();
      finishStaticLinePointPicking();
    }
  });
  elements.addStaticObject.addEventListener('click', () => openStaticLayerEditor());
  elements.cancelStaticLayerForm.addEventListener('click', hideStaticLayerEditor);
  elements.staticLayerForm.addEventListener('submit', handleStaticLayerSubmit);

  elements.toggleBasic.addEventListener('change', () => {
    state.basicVisible = elements.toggleBasic.checked;
    renderMap();
    saveState();
  });

  elements.toggleStatic.addEventListener('change', () => {
    state.staticVisible = elements.toggleStatic.checked;
    elements.staticLayerVisibleToggle.checked = state.staticVisible;
    renderMap();
    saveState();
  });

  elements.toggleDynamic.addEventListener('change', () => {
    state.dynamicVisible = elements.toggleDynamic.checked;
    renderMap();
    saveState();
  });

  setupMapInteraction();
  window.addEventListener('resize', () => {
    document.querySelectorAll('.draggable-window').forEach(constrainWindowPosition);
    updateScaleBar();
  });
  updateScaleBar();
}

function setupNumericKeypad() {
  const keypadTargets = document.querySelectorAll('input[type="number"], #bullseyeLat, #bullseyeLon, #mapCenterLat, #mapCenterLon, #staticLayerLat, #staticLayerLon');
  keypadTargets.forEach((input) => {
    configureNumericKeypadTarget(input);
    input.addEventListener('input', () => validateBearingInput(input));
    input.addEventListener('change', () => validateBearingInput(input));
    const openKeypad = () => isLatLonCoordinateInput(input)
      ? openLatLonKeypad(elements.staticLayerLat, elements.staticLayerLon)
      : input.matches('#staticLayerBeBearing, #staticLayerBeDistance')
        ? (doBeKeypadActive = true, openDynamicKeypad(input))
        : openNumericKeypad(input);
    input.addEventListener('focus', openKeypad);
    input.addEventListener('click', openKeypad);
  });
  document.addEventListener('focusin', (event) => {
    if (isNumericKeypadTarget(event.target)) {
      configureNumericKeypadTarget(event.target);
      if (event.target.matches('[data-dynamic-bearing], [data-dynamic-distance]')) {
        if (event.target.matches('#staticLayerBeBearing, #staticLayerBeDistance')) doBeKeypadActive = true;
        openDynamicKeypad(event.target);
      }
      else if (!event.target.matches('[data-dol-keypad-target]')) {
        if (isLatLonCoordinateInput(event.target)) openLatLonKeypad(elements.staticLayerLat, elements.staticLayerLon);
        else openNumericKeypad(event.target);
      }
    }
  });
  document.addEventListener('pointerdown', (event) => {
    if (isNumericKeypadTarget(event.target)) {
      configureNumericKeypadTarget(event.target);
      if (event.target.matches('[data-dynamic-bearing], [data-dynamic-distance]')) {
        if (event.target.matches('#staticLayerBeBearing, #staticLayerBeDistance')) doBeKeypadActive = true;
        openDynamicKeypad(event.target);
      }
    }
  }, true);
  elements.numericKeypad.addEventListener('click', (event) => {
    const dolTarget = event.target.closest('[data-dol-keypad-target]');
    const latLonTarget = event.target.closest('[data-latlon-keypad-target]');
    if (dolTarget && keypadMode === 'dol') {
      keypadTarget = dolTarget;
      updateNumericKeypadDisplay();
      return;
    }
    if (latLonTarget && keypadMode === 'latlon') {
      completeLatLonKeypadTarget(keypadTarget);
      keypadTarget = latLonTarget;
      updateNumericKeypadDisplay();
      return;
    }
    const key = event.target.closest('[data-keypad-key]')?.dataset.keypadKey;
    const action = event.target.closest('[data-keypad-action]')?.dataset.keypadAction;
    if (key) appendNumericKey(key);
    if (action === 'backspace') backspaceNumericKey();
    if (action === 'clear') clearNumericKey();
    if (action === 'cancel') closeNumericKeypad(false);
    if (action === 'done' && keypadMode === 'latlon') {
      closeLatLonKeypad(true);
      return;
    }
    if (action === 'done' && keypadMode === 'dol') {
      if (doBeKeypadActive) {
        const bearing = elements.numericKeypad.querySelector('[data-dol-keypad-target="bearing"]');
        const distance = elements.numericKeypad.querySelector('[data-dol-keypad-target="distance"]');
        if (bearing.value && distance.value && validateBearingInput(bearing) && /^\d*(?:\.\d+)?$/.test(distance.value)) {
          submitDoBeKeypadInput(bearing.value, distance.value);
          closeDolKeypad(false);
          doBeKeypadActive = false;
        }
      } else {
        validateNumericKeypadInput(keypadTarget);
      }
      return;
    }
    if (action === 'done') closeNumericKeypad(true);
  });
  elements.numericKeypad.querySelector('[data-keypad-close]').addEventListener('click', () => closeNumericKeypad(keypadMode === 'dol'));
}

function isLatLonCoordinateInput(input) {
  return input?.id === 'staticLayerLat' || input?.id === 'staticLayerLon';
}

function isNumericKeypadTarget(input) {
  return input instanceof HTMLInputElement
    && (input.dataset.numericKeypad === 'true' || input.type === 'number'
      || input.matches('[data-dynamic-position], [data-dynamic-bearing], [data-dynamic-distance], [data-dol-keypad-target]')
      || ['bullseyeLat', 'bullseyeLon', 'mapCenterLat', 'mapCenterLon', 'staticLayerLat', 'staticLayerLon'].includes(input.id));
}

function configureNumericKeypadTarget(input) {
  input.dataset.numericKeypad = 'true';
  if (input.type === 'number') input.type = 'text';
  input.inputMode = 'none';
  input.readOnly = true;
}

function validateBearingInput(input) {
  if (!input?.matches('[data-bearing-input]')) return true;
  const value = Number(input.value);
  const valid = input.value === '' || (Number.isFinite(value) && value >= 0 && value <= 360);
  input.setAttribute('aria-invalid', String(!valid));
  if (input === keypadTarget) {
    elements.numericKeypad.querySelector('[data-keypad-display]').classList.toggle('invalid-number', !valid);
  }
  return valid;
}

function validateDynamicPositionInput(input) {
  if (!input?.matches('[data-dynamic-position]')) return true;
  const value = input.value;
  const bearing = Number(value.slice(0, 3));
  const distance = Number(value.slice(3, 6));
  const valid = /^\d{6}$/.test(value) && bearing <= 360 && distance <= 999;
  input.classList.toggle('invalid-number', !valid);
  input.setAttribute('aria-invalid', String(!valid));
  if (input === keypadTarget) {
    elements.numericKeypad.querySelector('[data-keypad-display]').classList.toggle('invalid-number', !valid);
  }
  return valid;
}

function validateNumericKeypadInput(input) {
  return input?.matches('[data-dynamic-position]') ? validateDynamicPositionInput(input) : validateBearingInput(input);
}

function openDynamicKeypad(input) {
  const row = input.closest('.dynamic-list-item');
  const bearing = row?.querySelector('[data-dynamic-bearing]');
  const distance = row?.querySelector('[data-dynamic-distance]');
  if (!bearing || !distance) return openNumericKeypad(input);
  if (keypadMode === 'dol' && dolKeypadSources?.bearing === bearing) return;
  dolKeypadSources = { bearing, distance };
  dolKeypadInitialValues = { bearing: bearing.value, distance: distance.value };
  [bearing, distance].forEach((target) => {
    target.placeholder = target.value;
    target.value = '';
  });
  keypadMode = 'dol';
  elements.numericKeypad.classList.add('dol-keypad-mode');
  keypadTarget = input.matches('[data-dynamic-distance]') ? elements.numericKeypad.querySelector('[data-dol-keypad-target="distance"]') : elements.numericKeypad.querySelector('[data-dol-keypad-target="bearing"]');
  const fields = elements.numericKeypad.querySelector('[data-dol-keypad-fields]');
  fields.classList.remove('hidden');
  [bearing, distance].forEach((source, index) => {
    const target = fields.querySelector(`[data-dol-keypad-target="${index ? 'distance' : 'bearing'}"]`);
    target.value = '';
    target.placeholder = source.placeholder;
  });
  elements.numericKeypad.classList.remove('hidden');
  updateNumericKeypadDisplay();
}

function openNumericKeypad(input) {
  if (keypadTarget === input) return;
  keypadTarget = input;
  keypadMode = 'standard';
  elements.numericKeypad.querySelector('[data-dol-keypad-fields]').classList.add('hidden');
  elements.latLonKeypadFields.classList.add('hidden');
  elements.numericKeypad.classList.remove('dol-keypad-mode');
  keypadInitialValue = input.value;
  keypadInitialPlaceholder = input.placeholder;
  keypadCleared = false;
  input.value = '';
  input.placeholder = keypadInitialValue || keypadInitialPlaceholder;
  elements.numericKeypad.classList.remove('hidden');
  updateNumericKeypadDisplay();
}

function updateNumericKeypadDisplay() {
  if (!keypadTarget) return;
  const display = elements.numericKeypad.querySelector('[data-keypad-display]');
  const placeholder = ['dol', 'latlon'].includes(keypadMode) ? keypadTarget.placeholder : keypadInitialValue;
  display.textContent = keypadTarget.value || placeholder || '--';
  display.classList.toggle('keypad-placeholder', !keypadTarget.value);
}

function appendNumericKey(key) {
  if (!keypadTarget) return;
  const value = keypadTarget.value || '';
  if (key === '-' && value) return;
  if (key === '.' && value.includes('.')) return;
  keypadTarget.value = value + key;
  validateNumericKeypadInput(keypadTarget);
  keypadTarget.dispatchEvent(new Event('input', { bubbles: true }));
  updateNumericKeypadDisplay();
}

function backspaceNumericKey() {
  if (!keypadTarget) return;
  keypadTarget.value = keypadTarget.value.slice(0, -1);
  validateNumericKeypadInput(keypadTarget);
  keypadTarget.dispatchEvent(new Event('input', { bubbles: true }));
  updateNumericKeypadDisplay();
}

function clearNumericKey() {
  if (!keypadTarget) return;
  keypadTarget.value = '';
  validateNumericKeypadInput(keypadTarget);
  keypadTarget.dispatchEvent(new Event('input', { bubbles: true }));
  keypadCleared = true;
  updateNumericKeypadDisplay();
}

function closeNumericKeypad(commit) {
  if (keypadMode === 'latlon') {
    closeLatLonKeypad(commit);
    return;
  }
  if (doBeKeypadActive) {
    closeDolKeypad(commit);
    elements.numericKeypad.classList.add('hidden');
    doBeKeypadActive = false;
    return;
  }
  if (keypadMode === 'dol') return closeDolKeypad(commit);
  if (!keypadTarget) return;
  const target = keypadTarget;
  const valid = validateNumericKeypadInput(target);
  const restoreInitialValue = !commit || !valid || (commit && !target.value);
  if (restoreInitialValue) target.value = keypadInitialValue;
  validateNumericKeypadInput(target);
  target.placeholder = keypadInitialPlaceholder;
  elements.numericKeypad.classList.add('hidden');
  keypadTarget = null;
  keypadInitialValue = '';
  keypadInitialPlaceholder = '';
  const wasCleared = keypadCleared;
  keypadCleared = false;
  if (commit && valid && target.value) target.dispatchEvent(new Event('change', { bubbles: true }));
  target.blur();
}

function closeLatLonKeypad(commit) {
  if (!latLonKeypadSources || !latLonKeypadInitialValues) return;
  const latTarget = elements.latLonKeypadFields.querySelector('[data-latlon-keypad-target="lat"]');
  const lonTarget = elements.latLonKeypadFields.querySelector('[data-latlon-keypad-target="lon"]');
  const hasValues = latTarget.value && lonTarget.value;
  completeLatLonKeypadTarget(latTarget);
  completeLatLonKeypadTarget(lonTarget);
  if (commit && hasValues) {
    latLonKeypadSources.lat.value = applyCoordinateHemisphere(latTarget.value, 'lat');
    latLonKeypadSources.lon.value = applyCoordinateHemisphere(lonTarget.value, 'lon');
    if (latLonKeypadSources.lat.matches('[data-coordinate-lat]')) submitCoordinateInput();
    else {
      latLonKeypadSources.lat.dispatchEvent(new Event('change', { bubbles: true }));
      latLonKeypadSources.lon.dispatchEvent(new Event('change', { bubbles: true }));
    }
  } else {
    latLonKeypadSources.lat.value = latLonKeypadInitialValues.lat;
    latLonKeypadSources.lon.value = latLonKeypadInitialValues.lon;
  }
  latTarget.value = '';
  lonTarget.value = '';
  latTarget.placeholder = '';
  lonTarget.placeholder = '';
  elements.latLonKeypadFields.classList.add('hidden');
  elements.numericKeypad.classList.remove('dol-keypad-mode');
  elements.numericKeypad.classList.add('hidden');
  keypadMode = 'standard';
  keypadTarget = null;
  latLonKeypadSources = null;
  latLonKeypadInitialValues = null;
  latLonKeypadMode = '';
}

function completeLatLonKeypadTarget(target) {
  if (!target || !target.value) return;
  const value = stripCoordinateSign(target.value);
  if (['DDMM.MMM', 'DDMMSS'].includes(latLonKeypadMode)) {
    const axis = target.dataset.latlonKeypadTarget;
    const degreeWidth = axis === 'lat' ? 2 : 3;
    if (latLonKeypadMode === 'DDMM.MMM') {
      const digits = value.replace(/\./g, '');
      const padded = digits.padEnd(degreeWidth + 5, '0');
      target.value = `${padded.slice(0, degreeWidth + 2)}.${padded.slice(degreeWidth + 2, degreeWidth + 5)}`;
    } else {
      target.value = value.replace(/\D/g, '').padEnd(degreeWidth + 4, '0');
    }
  }
}

function applyCoordinateHemisphere(value, axis) {
  const sign = (axis === 'lat' ? state.settings.mapCenter.lat : state.settings.mapCenter.lon) < 0 ? '-' : '';
  return `${sign}${stripCoordinateSign(value)}`;
}

function closeDolKeypad(commit) {
  if (!dolKeypadSources || !dolKeypadInitialValues) return;
  const bearing = elements.numericKeypad.querySelector('[data-dol-keypad-target="bearing"]');
  const distance = elements.numericKeypad.querySelector('[data-dol-keypad-target="distance"]');
  const bearingValid = validateBearingInput(bearing);
  const distanceValid = /^\d*(?:\.\d+)?$/.test(distance.value);
  const isDoBeInput = elements.coordinateInputPanel.dataset.mode === 'be';
  const missingDoValue = isDoBeInput && (!bearing.value || !distance.value);
  if (!commit || !bearingValid || !distanceValid || (!bearing.value && !distance.value) || missingDoValue) {
    bearing.value = dolKeypadInitialValues.bearing;
    distance.value = dolKeypadInitialValues.distance;
    dolKeypadSources.bearing.value = dolKeypadInitialValues.bearing;
    dolKeypadSources.distance.value = dolKeypadInitialValues.distance;
  } else {
    dolKeypadSources.bearing.value = bearing.value || dolKeypadInitialValues.bearing;
    dolKeypadSources.distance.value = distance.value || dolKeypadInitialValues.distance;
    if (isDoBeInput) {
      submitDoBeKeypadInput(bearing.value, distance.value);
    } else {
      dolKeypadSources.bearing.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }
  [bearing, distance].forEach((target) => { target.value = ''; target.placeholder = ''; });
  dolKeypadSources.bearing.placeholder = '';
  dolKeypadSources.distance.placeholder = '';
  elements.numericKeypad.querySelector('[data-dol-keypad-fields]').classList.add('hidden');
  elements.numericKeypad.classList.add('hidden');
  keypadMode = 'standard';
  keypadTarget = null;
  dolKeypadSources = null;
  dolKeypadInitialValues = null;
  doBeKeypadActive = false;
}

function loadState() {
  const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
  const fallbackSettings = { ...defaultSettings };
  const savedSettings = saved && saved.settings ? saved.settings : {};
  const symbolScaleBase = 0.5;
  const initialState = {
    ...sampleState,
    ...saved,
    basic: saved && saved.basic ? saved.basic : sampleState.basic,
    static: saved && saved.static ? saved.static : sampleState.static,
    dynamic: saved && saved.dynamic ? saved.dynamic : sampleState.dynamic,
    self: { ...sampleState.self, ...(saved && saved.self ? saved.self : {}) },
    markSettings: { ...sampleState.markSettings, ...(saved && saved.markSettings ? saved.markSettings : {}) },
    basicVisible: saved ? saved.basicVisible !== undefined ? saved.basicVisible : true : true,
    staticVisible: saved ? saved.staticVisible !== undefined ? saved.staticVisible : true : true,
    dynamicVisible: saved ? saved.dynamicVisible !== undefined ? saved.dynamicVisible : true : true,
    settings: {
      ...fallbackSettings,
      ...savedSettings,
      notifications: {
        ...fallbackSettings.notifications,
        ...(savedSettings.notifications || {}),
        items: Array.isArray(savedSettings.notifications?.items) ? savedSettings.notifications.items : [],
      },
      symbolScaleBase: 0.5,
      displayScale: 100,
      symbolScaleBase,
      mapCenter: {
        lat: Number.isFinite(saved && saved.settings && saved.settings.mapCenter && saved.settings.mapCenter.lat) ? saved.settings.mapCenter.lat : fallbackSettings.mapCenter.lat,
        lon: Number.isFinite(saved && saved.settings && saved.settings.mapCenter && saved.settings.mapCenter.lon) ? saved.settings.mapCenter.lon : fallbackSettings.mapCenter.lon,
      },
      bullseye: {
        lat: Number.isFinite(saved && saved.settings && saved.settings.bullseye && saved.settings.bullseye.lat) ? saved.settings.bullseye.lat : fallbackSettings.bullseye.lat,
        lon: Number.isFinite(saved && saved.settings && saved.settings.bullseye && saved.settings.bullseye.lon) ? saved.settings.bullseye.lon : fallbackSettings.bullseye.lon,
      },
    },
  };

  if (!Number.isFinite(initialState.self.x) || !Number.isFinite(initialState.self.y)) {
    initialState.self.x = 50;
    initialState.self.y = 50;
  }

  if (!Number.isFinite(initialState.self.heading)) {
    initialState.self.heading = 0;
  }

  if (!Number.isFinite(initialState.self.speed)) {
    initialState.self.speed = 0;
  }

  ['static', 'dynamic'].forEach((layerName) => {
    initialState[layerName] = initialState[layerName].map((item) => normalizeItemCoordinates(item, initialState.settings.mapCenter));
  });
  initialState.basic = initialState.basic.map((item) => normalizeBasicItemCoordinates(item, initialState.settings.mapCenter));

  if (initialState.self.gpsAvailable !== true) {
    initialState.self.gpsAvailable = false;
    initialState.self.lat = initialState.settings.mapCenter.lat;
    initialState.self.lon = initialState.settings.mapCenter.lon;
    initialState.self.x = 50;
    initialState.self.y = 50;
  }

  return initialState;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getPersistentState(state)));
}

function ensureInitialStateSnapshot() {
  if (localStorage.getItem(INITIAL_STATE_STORAGE_KEY)) return;
  localStorage.setItem(INITIAL_STATE_STORAGE_KEY, JSON.stringify({
    state: getPersistentState(state),
    windows: JSON.parse(localStorage.getItem(WINDOWS_STORAGE_KEY) || '{}'),
    view: loadSavedView(),
  }));
}

function loadSavedView() {
  const savedView = JSON.parse(localStorage.getItem(VIEW_STORAGE_KEY) || 'null');
  const initialSnapshot = JSON.parse(localStorage.getItem(INITIAL_STATE_STORAGE_KEY) || 'null');
  const saved = savedView || initialSnapshot?.view;
  return {
    scale: clampNumber(Number(saved?.scale), 0.25, MAP_MAX_SCALE, 1),
    panX: Number.isFinite(saved?.panX) ? saved.panX : 0,
    panY: Number.isFinite(saved?.panY) ? saved.panY : 0,
  };
}

function saveCurrentAsInitialState(showStatus = true) {
  saveState();
  const view = {
    scale: mapInteraction.scale,
    panX: mapInteraction.panX,
    panY: mapInteraction.panY,
  };
  localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(view));
  localStorage.setItem(INITIAL_STATE_STORAGE_KEY, JSON.stringify({
    state: getPersistentState(state),
    windows: JSON.parse(localStorage.getItem(WINDOWS_STORAGE_KEY) || '{}'),
    view,
  }));
  if (showStatus) setSettingsStatus('現在の状態を初期値として保存しました');
}

function exportCurrentPreset() {
  const initialSnapshot = JSON.parse(localStorage.getItem(INITIAL_STATE_STORAGE_KEY) || 'null');
  const preset = {
    version: 1,
    exportedAt: new Date().toISOString(),
    state: JSON.parse(localStorage.getItem(STORAGE_KEY) || JSON.stringify(state)),
    windows: JSON.parse(localStorage.getItem(WINDOWS_STORAGE_KEY) || '{}'),
    view: {
      scale: mapInteraction.scale,
      panX: mapInteraction.panX,
      panY: mapInteraction.panY,
    },
    initialState: initialSnapshot ? {
      ...initialSnapshot,
      state: getPersistentState(initialSnapshot.state),
    } : null,
  };
  const blob = new Blob([JSON.stringify(preset, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = 'TacView02-current-preset.json';
  link.click();
  URL.revokeObjectURL(link.href);
  setSettingsStatus('現在状態をプリセットJSONとして保存しました');
}

async function importPresetFile(event) {
  const [file] = event.target.files || [];
  event.target.value = '';
  if (!file) return;

  try {
    const preset = JSON.parse(await file.text());
    if (!preset || typeof preset !== 'object' || !preset.state || !preset.state.settings) {
      throw new Error('TacView02のプリセット形式ではありません');
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(preset.state));
    localStorage.setItem(WINDOWS_STORAGE_KEY, JSON.stringify(preset.windows || {}));
    if (preset.view) localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(preset.view));
    if (preset.initialState) localStorage.setItem(INITIAL_STATE_STORAGE_KEY, JSON.stringify(preset.initialState));
    window.location.reload();
  } catch (error) {
    setSettingsStatus(`プリセットを読み込めませんでした: ${error.message}`);
  }
}

function mapPositionToGeoForCenter(center, x, y) {
  const longitudeFactor = Math.max(0.1, Math.cos((center.lat * Math.PI) / 180));
  return {
    lat: center.lat + ((50 - y) / 100) * MAP_VIEW_SPAN.lat,
    lon: center.lon + ((x - 50) / (100 * longitudeFactor)) * MAP_VIEW_SPAN.lon,
  };
}

function normalizeItemCoordinates(item, center) {
  const next = { ...item };
  if (!(Number.isFinite(next.lat) && Number.isFinite(next.lon)) && Number.isFinite(next.x) && Number.isFinite(next.y)) {
    Object.assign(next, mapPositionToGeoForCenter(center, next.x, next.y));
  }
  ['start', 'end'].forEach((key) => {
    const point = next[key];
    if (!point || (Number.isFinite(point.lat) && Number.isFinite(point.lon))) return;
    if (Number.isFinite(point.x) && Number.isFinite(point.y)) {
      next[key] = mapPositionToGeoForCenter(center, point.x, point.y);
    }
  });
  return next;
}

function normalizeBasicItemCoordinates(item, center) {
  const next = normalizeItemCoordinates(item, center);
  if (!Array.isArray(next.geoPoints) && Array.isArray(next.points)) {
    next.geoPoints = next.points
      .filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]))
      .map(([x, y]) => {
        const position = mapPositionToGeoForCenter(center, x, y);
        return [position.lat, position.lon];
      });
  }
  return next;
}

function getPersistentState(sourceState) {
  const center = sourceState.settings.mapCenter;
  const withoutMapPosition = (item) => {
    const normalized = normalizeItemCoordinates(item, center);
    const { x, y, ...persistentItem } = normalized;
    ['start', 'end'].forEach((key) => {
      if (!persistentItem[key]) return;
      const { x: pointX, y: pointY, ...persistentPoint } = persistentItem[key];
      persistentItem[key] = persistentPoint;
    });
    return persistentItem;
  };
  const basic = sourceState.basic.map((item) => {
    const normalized = normalizeBasicItemCoordinates(item, center);
    const { x, y, points, ...persistentItem } = normalized;
    return persistentItem;
  });
  const self = { ...sourceState.self };
  delete self.x;
  delete self.y;
  return {
    ...sourceState,
    basic,
    static: sourceState.static.map(withoutMapPosition),
    dynamic: sourceState.dynamic.map((item) => {
      const persistentItem = withoutMapPosition(item);
      const circleConfig = getDynamicCircleConfig(persistentItem);
      return {
        ...persistentItem,
        circleConfig,
        circleRadius1: circleConfig[0]?.radius || 0,
        circleColor1: circleConfig[0]?.color || 'red',
        circleRadius2: circleConfig[1]?.radius || 0,
        circleColor2: circleConfig[1]?.color || 'red',
        circleRadius3: circleConfig[2]?.radius || 0,
        circleColor3: circleConfig[2]?.color || 'red',
        geometryType: circleConfig.length ? 'circle' : 'none',
        geometryRadius: circleConfig[0]?.radius || 0,
        geometryColor: circleConfig[0]?.color || 'red',
      };
    }),
    self,
  };
}

function syncSelfToMapCenterIfNoGps() {
  if (state.self.gpsAvailable === true) return;
  state.self.lat = state.settings.mapCenter.lat;
  state.self.lon = state.settings.mapCenter.lon;
  state.self.x = 50;
  state.self.y = 50;
}

function updateSelfSimulationSettings() {
  if (!validateBearingInput(elements.selfSimulationHeading)) return;
  state.self.heading = magneticToTrue(clampNumber(Number(elements.selfSimulationHeading.value), 0, 359.9, 0));
  state.self.speed = Math.max(0, Number(elements.selfSimulationSpeed.value) || 0);
  saveState();
  updateSettingsFields();
  updateSelfInfoDisplay();
  renderMap();
}

function toggleSelfSimulation() {
  if (selfSimulationTimer) {
    window.clearInterval(selfSimulationTimer);
    selfSimulationTimer = null;
    updateSettingsFields();
    setSettingsStatus('自機飛行模擬を停止しました');
    return;
  }

  stopGpsTracking(false);
  updateSelfSimulationSettings();
  state.self.gpsAvailable = true;
  if (!(Number.isFinite(state.self.lat) && Number.isFinite(state.self.lon))) {
    state.self.lat = state.settings.mapCenter.lat;
    state.self.lon = state.settings.mapCenter.lon;
  }
  selfSimulationTimer = window.setInterval(advanceSelfSimulation, 1000);
  saveState();
  updateSettingsFields();
  renderMap();
  setSettingsStatus('自機飛行模擬を開始しました');
}

function toggleGpsTracking() {
  if (gpsWatchId !== null) {
    stopGpsTracking();
    return;
  }
  if (!('geolocation' in navigator)) {
    setGpsStatus('この端末はGPS位置情報に対応していません', 'error');
    return;
  }
  if (!window.isSecureContext && location.hostname !== 'localhost') {
    setGpsStatus('GPS受信にはHTTPS接続が必要です', 'error');
    return;
  }

  if (selfSimulationTimer) {
    window.clearInterval(selfSimulationTimer);
    selfSimulationTimer = null;
  }
  setGpsStatus('GPS受信を開始しています...', 'pending');
  gpsWatchId = navigator.geolocation.watchPosition(handleGpsPosition, handleGpsError, {
    enableHighAccuracy: true,
    maximumAge: 1000,
    timeout: 15000,
  });
  gpsStatusTimer = window.setInterval(updateGpsStatus, 1000);
  updateSettingsFields();
  setSettingsStatus('GPS自機位置の受信を開始しました');
}

function stopGpsTracking(showStatus = true) {
  if (gpsWatchId !== null) navigator.geolocation.clearWatch(gpsWatchId);
  gpsWatchId = null;
  if (gpsStatusTimer !== null) window.clearInterval(gpsStatusTimer);
  gpsStatusTimer = null;
  setGpsStatus('GPS停止中');
  updateSettingsFields();
  if (showStatus) setSettingsStatus('GPS自機位置の受信を停止しました');
}

function handleGpsPosition(position) {
  const { coords, timestamp } = position;
  state.self.lat = coords.latitude;
  state.self.lon = coords.longitude;
  state.self.gpsAvailable = true;
  state.self.gpsAccuracy = coords.accuracy;
  state.self.gpsUpdatedAt = timestamp;
  if (Number.isFinite(coords.speed) && coords.speed >= 0) state.self.speed = coords.speed * 1.943844;
  if (Number.isFinite(coords.heading) && coords.heading >= 0 && (coords.speed === null || coords.speed > 0.5)) {
    state.self.heading = coords.heading;
  }
  const mapPosition = geoToMapPosition(state.self.lat, state.self.lon);
  state.self.x = mapPosition.x;
  state.self.y = mapPosition.y;
  if (centerOnNextGpsPosition) {
    centerOnNextGpsPosition = false;
    centerMapOnSelf();
  }
  saveState();
  updateSelfSimulationMap();
  updateSelfSimulationDisplays();
  updateGpsStatus();
}

function handleGpsError(error) {
  const messages = {
    1: 'GPS位置情報の利用が許可されていません',
    2: 'GPS位置情報を取得できません',
    3: 'GPS位置情報の取得がタイムアウトしました',
  };
  setGpsStatus(messages[error.code] || 'GPS受信でエラーが発生しました', 'error');
  setSettingsStatus(messages[error.code] || 'GPS受信でエラーが発生しました');
}

function updateGpsStatus() {
  if (gpsWatchId === null) return;
  const ageSeconds = state.self.gpsUpdatedAt ? Math.floor((Date.now() - state.self.gpsUpdatedAt) / 1000) : null;
  if (ageSeconds === null) {
    setGpsStatus('GPS受信を待機中...', 'pending');
    return;
  }
  if (ageSeconds > 10) {
    setGpsStatus(`GPS更新なし: ${ageSeconds}秒`, 'error');
    return;
  }
  const accuracy = Number.isFinite(state.self.gpsAccuracy) ? `精度 ${Math.round(state.self.gpsAccuracy)}m` : '精度不明';
  setGpsStatus(`GPS受信中: ${accuracy} / ${ageSeconds}秒前`, state.self.gpsAccuracy > 100 ? 'warning' : 'active');
}

function setGpsStatus(message, stateName = '') {
  elements.gpsStatus.textContent = message;
  elements.gpsStatus.dataset.state = stateName;
  elements.centerOnSelfButton.dataset.gpsState = stateName;
}

function advanceSelfSimulation() {
  const distanceNm = Math.max(0, Number(state.self.speed) || 0) / 3600;
  const position = getGeographicDestination(state.self, Number(state.self.heading) || 0, distanceNm);
  state.self.lat = position.lat;
  state.self.lon = position.lon;
  const mapPosition = geoToMapPosition(position.lat, position.lon);
  state.self.x = mapPosition.x;
  state.self.y = mapPosition.y;
  saveState();
  updateSelfSimulationMap();
  updateSelfSimulationDisplays();
}

function renderLayerToggles() {
  elements.toggleBasic.checked = state.basicVisible;
  elements.toggleStatic.checked = state.staticVisible;
  elements.toggleDynamic.checked = state.dynamicVisible;
  elements.basicLayerVisibleToggle.checked = state.basicVisible;
  elements.staticLayerVisibleToggle.checked = state.staticVisible;
}

function showBasicLayerPanel() {
  elements.basicLayerPanel.classList.remove('hidden');
  renderBasicLayerSettings();
  setSettingsStatus('基本レイヤー設定を表示中');
}

function showStaticLayerPanel() {
  managedLayer = 'static';
  document.getElementById('managedLayerTitle').textContent = '静的レイヤー管理';
  elements.staticLayerPanel.classList.remove('hidden');
  renderStaticLayerSettings();
  setSettingsStatus('静的レイヤー設定を表示中');
}

function showDynamicLayerPanel() {
  managedLayer = 'dynamic';
  document.getElementById('managedLayerTitle').textContent = '動的レイヤー管理';
  elements.staticLayerPanel.classList.remove('hidden');
  elements.staticLayerVisibleToggle.checked = state.dynamicVisible;
  updateStaticCoordinateFields();
  renderStaticLayerSettings();
  setSettingsStatus('動的レイヤー設定を表示中');
}

function hideStaticLayerEditor() {
  if (mapPickTarget === 'staticLinePoints') {
    mapPickTarget = null;
    mapPickFormValues = null;
  }
  elements.staticLayerForm.reset();
  elements.staticLayerId.value = '';
  elements.staticLayerForm.classList.add('hidden');
}

function renderStaticLayerSettings() {
  const filter = elements.staticLayerFilter.value;
  const items = state[managedLayer].filter((item) => filter === 'all' || item.type === filter);
  elements.staticLayerList.innerHTML = '';

  if (!items.length) {
    elements.staticLayerList.innerHTML = '<div class="layer-item"><span>静的オブジェクトがありません</span></div>';
    return;
  }

  items.forEach((item) => {
    const row = document.createElement('div');
    row.className = 'layer-item';
    row.innerHTML = `
      <div class="layer-item-main">
        <div><strong></strong><span>${getObjectTypeLabel(item.type)} / ${formatCoordinatePair(getStaticItemCoordinates(item).lat, getStaticItemCoordinates(item).lon, elements.coordinateSystem.value)}</span></div>
      </div>
      <input type="checkbox" data-static-visible-toggle="${item.id}" ${item.visible !== false ? 'checked' : ''} aria-label="${item.name}を表示" />
      <div class="layer-item-actions">
        <button type="button" data-static-edit="${item.id}" class="secondary-btn small-btn">編集</button>
        <button type="button" data-static-delete="${item.id}" class="danger-btn small-btn">削除</button>
      </div>`;
    row.querySelector('strong').textContent = item.name;
    elements.staticLayerList.appendChild(row);
  });

  elements.staticLayerList.querySelectorAll('[data-static-edit]').forEach((button) => {
    button.addEventListener('click', () => openStaticLayerEditor(state[managedLayer].find((item) => item.id === button.dataset.staticEdit)));
  });
  elements.staticLayerList.querySelectorAll('[data-static-visible-toggle]').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const item = state[managedLayer].find((entry) => entry.id === event.target.dataset.staticVisibleToggle);
      if (!item) return;
      item.visible = event.target.checked;
      saveState();
      renderMap();
    });
  });
  elements.staticLayerList.querySelectorAll('[data-static-delete]').forEach((button) => {
    button.addEventListener('click', () => {
      const index = state[managedLayer].findIndex((item) => item.id === button.dataset.staticDelete);
      if (index < 0) return;
      state[managedLayer].splice(index, 1);
      saveState();
      renderStaticLayerSettings();
      renderMap();
    });
  });
}

function openStaticLayerEditor(item) {
  elements.staticLayerForm.classList.remove('hidden');
  if (!item) {
    elements.staticLayerId.value = '';
    elements.staticLayerName.value = '';
    elements.staticLayerType.value = 'waypoint';
    elements.staticLayerCoordSystem.value = 'DDMM.MMM';
    elements.staticLayerCoordSystem.dataset.previousValue = 'DDMM.MMM';
    elements.staticLayerLat.value = formatDdmmm(state.settings.mapCenter.lat, 'lat');
    elements.staticLayerLon.value = formatDdmmm(state.settings.mapCenter.lon, 'lon');
    elements.staticLayerSymbol.value = 'diamond';
    elements.staticLayerGeometryType.value = 'none';
    elements.staticLayerGeometryRadius.value = '0';
    elements.staticLayerGeometryStartBearing.value = '0';
    elements.staticLayerGeometryEndBearing.value = '90';
    applyDynamicCircleFormValues({
      circleRadius1: 10,
      circleColor1: 'red',
      circleRadius2: 0,
      circleColor2: 'red',
      circleRadius3: 0,
      circleColor3: 'red',
    });
    elements.staticLayerBeBearing.value = '0';
    elements.staticLayerBeDistance.value = '0';
    elements.staticLayerLineStyle.value = 'solid';
    elements.staticLayerLineColor.value = '#60a5fa';
    elements.staticLayerLineWidth.value = '2';
    elements.staticLayerLineWidthValue.value = '2';
    setStaticLinePointsInForm([]);
    updateStaticCoordinateFields();
    return;
  }
  elements.staticLayerId.value = item.id;
  elements.staticLayerName.value = item.name || '';
  elements.staticLayerType.value = item.type || 'waypoint';
  const coordinates = getStaticItemCoordinates(item);
  elements.staticLayerCoordSystem.value = item.coordinateSystem || 'DDMM.MMM';
  elements.staticLayerCoordSystem.dataset.previousValue = elements.staticLayerCoordSystem.value;
  if (['MGRS', 'GARS'].includes(elements.staticLayerCoordSystem.value)) {
    elements.staticLayerLat.value = formatCoordinatePair(coordinates.lat, coordinates.lon, elements.staticLayerCoordSystem.value);
    elements.staticLayerLon.value = '';
  } else {
    elements.staticLayerLat.value = formatCoordinate(coordinates.lat, 'lat', elements.staticLayerCoordSystem.value);
    elements.staticLayerLon.value = formatCoordinate(coordinates.lon, 'lon', elements.staticLayerCoordSystem.value);
  }
  const relative = geoToBullseyeOffset(coordinates.lat, coordinates.lon);
  elements.staticLayerBeBearing.value = toMagneticBearing(relative.bearing).toFixed(1);
  elements.staticLayerBeDistance.value = relative.distance.toFixed(1);
  elements.staticLayerLineStyle.value = item.lineStyle || 'solid';
  elements.staticLayerLineColor.value = item.lineColor || '#60a5fa';
  elements.staticLayerLineWidth.value = clampNumber(Number(item.lineWidth), 1, 5, 2);
  elements.staticLayerLineWidthValue.value = elements.staticLayerLineWidth.value;
  setStaticLinePointsInForm(item.linePoints || (item.start && item.end ? [item.start, item.end] : []));
  elements.staticLayerSymbol.value = item.symbol || 'diamond';
  elements.staticLayerGeometryType.value = item.geometryType === 'ring' ? 'sector' : (item.geometryType || 'none');
  elements.staticLayerGeometryRadius.value = item.geometryRadius || 0;
  elements.staticLayerGeometryStartBearing.value = toMagneticBearing(item.geometryStartBearing ?? item.geometryBearing ?? 0).toFixed(1);
  elements.staticLayerGeometryEndBearing.value = toMagneticBearing(item.geometryEndBearing ?? ((item.geometryBearing ?? 0) + 90) % 360).toFixed(1);
  applyDynamicCircleFormValues(item);
  updateStaticCoordinateFields();
}

function handleStaticLayerSubmit(event) {
  event.preventDefault();
  const bearingInputs = [elements.staticLayerBeBearing, elements.staticLayerGeometryStartBearing, elements.staticLayerGeometryEndBearing];
  if (bearingInputs.some((input) => !validateBearingInput(input))) {
    setSettingsStatus('方位は0以上360未満で入力してください');
    return;
  }
  const id = elements.staticLayerId.value || `static-${Date.now()}`;
  const isBe = elements.staticLayerCoordSystem.value === 'BE';
  const isLine = elements.staticLayerType.value === 'line';
  const relative = {
    bearing: magneticToTrue(clampNumber(Number(elements.staticLayerBeBearing.value), 0, 359.9, 0)),
    distance: Math.max(0, Number(elements.staticLayerBeDistance.value) || 0),
  };
  const relativePosition = isBe ? bullseyeOffsetToGeo(relative.bearing, relative.distance) : null;
  const coordinateSystem = elements.staticLayerCoordSystem.value;
  const lat = isBe ? relativePosition.lat : parseCoordinate(elements.staticLayerLat.value, 'lat', coordinateSystem, state.settings.mapCenter.lat);
  const lon = isBe ? relativePosition.lon : ['MGRS', 'GARS'].includes(coordinateSystem)
    ? parseCoordinate(elements.staticLayerLat.value, 'lon', coordinateSystem, state.settings.mapCenter.lon)
    : parseCoordinate(elements.staticLayerLon.value, 'lon', coordinateSystem, state.settings.mapCenter.lon);
  const position = geoToMapPosition(lat, lon);
  const linePoints = isLine ? getStaticLinePointsFromForm() : [];
  if (isLine && linePoints.length < 3) {
    setSettingsStatus('線はMAPから3点以上指定してください');
    return;
  }
  const existingItem = state[managedLayer].find((entry) => entry.id === id) || {};
  const dynamicCircleConfig = [
    { radius: Number(elements.dynamicCircleRadius1.value || 0), color: elements.dynamicCircleColor1.value },
    { radius: Number(elements.dynamicCircleRadius2.value || 0), color: elements.dynamicCircleColor2.value },
    { radius: Number(elements.dynamicCircleRadius3.value || 0), color: elements.dynamicCircleColor3.value },
  ].filter((circle) => Number.isFinite(circle.radius) && circle.radius > 0);
  const item = {
    ...existingItem,
    id,
    type: elements.staticLayerType.value,
    name: elements.staticLayerName.value.trim() || '静的オブジェクト',
    x: position.x,
    y: position.y,
    lat,
    lon,
    coordinateSystem,
    layer: managedLayer,
    symbol: elements.staticLayerSymbol.value,
    geometryType: elements.staticLayerGeometryType.value,
    geometryRadius: Math.max(0, Number(elements.staticLayerGeometryRadius.value) || 0),
    geometryStartBearing: magneticToTrue(clampNumber(Number(elements.staticLayerGeometryStartBearing.value), 0, 359.9, 0)),
    geometryEndBearing: magneticToTrue(clampNumber(Number(elements.staticLayerGeometryEndBearing.value), 0, 359.9, 359.9)),
    circleConfig: dynamicCircleConfig,
      circleRadius1: Number(elements.dynamicCircleRadius1.value || 0),
      circleColor1: elements.dynamicCircleColor1.value,
      circleRadius2: Number(elements.dynamicCircleRadius2.value || 0),
      circleColor2: elements.dynamicCircleColor2.value,
      circleRadius3: Number(elements.dynamicCircleRadius3.value || 0),
      circleColor3: elements.dynamicCircleColor3.value,
      geometryType: 'circle',
      geometryRadius: dynamicCircleConfig[0]?.radius || 0,
    geometryColor: dynamicCircleConfig[0]?.color || 'red',
    linePoints,
    lineStyle: elements.staticLayerLineStyle.value,
    lineColor: elements.staticLayerLineColor.value,
    lineWidth: clampNumber(Number(elements.staticLayerLineWidth.value), 1, 5, 2),
  };
  const index = state[managedLayer].findIndex((entry) => entry.id === id);
  if (index >= 0) state[managedLayer][index] = item;
  else state[managedLayer].push(item);
  if (mapPickTarget === 'staticLinePoints') {
    mapPickTarget = null;
    mapPickFormValues = null;
  }
  saveState();
  hideStaticLayerEditor();
  renderStaticLayerSettings();
  renderMap();
  setSettingsStatus(`${item.name} を保存しました`);
}

function getObjectTypeLabel(type) {
  return OBJECT_TYPE_LABELS[type] || OBJECT_TYPE_LABELS.waypoint;
}

function getItemGeoCoordinates(item) {
  if (Number.isFinite(item.lat) && Number.isFinite(item.lon)) {
    return { lat: item.lat, lon: item.lon };
  }
  return getStaticItemCoordinates(item);
}

function hideBasicLayerEditor() {
  elements.basicLayerForm.reset();
  elements.basicLayerId.value = '';
  elements.basicLayerForm.classList.add('hidden');
}

function renderBasicLayerSettings() {
  const filter = elements.basicLayerFilter.value;
  const items = state.basic.filter((item) => item.type === 'airspace' && (filter === 'all' || item.kind === filter));
  elements.basicLayerList.innerHTML = '';

  if (items.length === 0) {
    elements.basicLayerList.innerHTML = '<div class="layer-item"><span>空域がありません</span></div>';
    return;
  }

  const visibleItems = items.filter((item) => item.visible !== false);
  const hiddenItems = items.filter((item) => item.visible === false);
  const createSection = (title, sectionItems) => {
    const section = document.createElement('section');
    section.className = 'basic-layer-visibility-section';
    section.innerHTML = `<h4>${title} (${sectionItems.length})</h4>`;
    sectionItems.forEach((item) => {
      const row = document.createElement('div');
      row.className = 'layer-item';
      row.innerHTML = `
        <div class="layer-item-main">
          <input type="checkbox" data-basic-visible-toggle="${item.id}" ${item.visible !== false ? 'checked' : ''} />
          <div>
            <strong></strong>
            <span></span>
          </div>
        </div>
        <div class="layer-item-actions">
          ${title === '表示中' ? `<button type="button" data-basic-edit="${item.id}" class="secondary-btn small-btn">編集</button>` : ''}
          <button type="button" data-basic-delete="${item.id}" class="danger-btn small-btn">削除</button>
        </div>
      `;
      row.querySelector('strong').textContent = item.displayName || item.name;
      row.querySelector('span').textContent = `${item.name} / ${item.label || item.name} / ${item.kind === 'controlled' ? 'CTR' : 'ATZ'}`;
      section.appendChild(row);
    });
    elements.basicLayerList.appendChild(section);
  };

  createSection('表示中', visibleItems);
  createSection('非表示', hiddenItems);

  elements.basicLayerList.querySelectorAll('[data-basic-visible-toggle]').forEach((checkbox) => {
    checkbox.addEventListener('change', (event) => {
      const targetId = event.target.dataset.basicVisibleToggle;
      const airspace = state.basic.find((item) => item.id === targetId && item.type === 'airspace');
      if (!airspace) return;
      airspace.visible = event.target.checked;
      saveState();
      renderBasicLayerSettings();
      renderMap();
    });
  });

  elements.basicLayerList.querySelectorAll('[data-basic-edit]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.basicEdit;
      const item = state.basic.find((entry) => entry.id === targetId && entry.type === 'airspace');
      if (!item) return;
      openBasicLayerEditor(item);
    });
  });

  elements.basicLayerList.querySelectorAll('[data-basic-delete]').forEach((button) => {
    button.addEventListener('click', () => {
      const targetId = button.dataset.basicDelete;
      const idx = state.basic.findIndex((entry) => entry.id === targetId && entry.type === 'airspace');
      if (idx >= 0) {
        state.basic.splice(idx, 1);
        saveState();
        renderBasicLayerSettings();
        renderMap();
      }
    });
  });
}

function openBasicLayerEditor(item) {
  elements.basicLayerForm.classList.remove('hidden');
  if (!item) {
    elements.basicLayerId.value = '';
    elements.basicLayerName.value = '';
    elements.basicLayerLabel.value = '';
    elements.basicLayerDisplayName.value = '';
    elements.basicLayerDisplayNameVisible.checked = true;
    elements.basicLayerKind.value = 'controlled';
    elements.basicLayerVisible.value = 'true';
    elements.basicLayerPoints.value = '20,18; 38,24; 53,17; 68,32;';
    return;
  }

  elements.basicLayerId.value = item.id;
  elements.basicLayerName.value = item.name || '';
  elements.basicLayerLabel.value = item.label || '';
  elements.basicLayerDisplayName.value = item.displayName || item.name || '';
  elements.basicLayerDisplayNameVisible.checked = item.displayNameVisible !== false;
  elements.basicLayerKind.value = item.kind || 'controlled';
  elements.basicLayerVisible.value = item.visible === false ? 'false' : 'true';
  const normalized = (item.points || []).map(([x, y]) => `${x},${y}`).join('; ');
  elements.basicLayerPoints.value = normalized;
}

function handleBasicLayerSubmit(event) {
  event.preventDefault();

  const id = elements.basicLayerId.value || `airspace-${Date.now()}`;
  const name = elements.basicLayerName.value.trim() || 'AIP空域';
  const label = elements.basicLayerLabel.value.trim() || (elements.basicLayerKind.value === 'controlled' ? 'CTR' : 'ATZ');
  const kind = elements.basicLayerKind.value;
  const visible = elements.basicLayerVisible.value === 'true';
  const pointsText = elements.basicLayerPoints.value.trim();
  const points = pointsText ? pointsText.split(';').map((segment) => {
    const [x, y] = segment.split(',').map((value) => Number(value.trim()));
    return [x, y];
  }).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y)) : [[20, 18], [40, 24], [60, 20], [70, 38], [52, 58], [28, 48]];

  const existingIndex = state.basic.findIndex((item) => item.id === id && item.type === 'airspace');
  const next = {
    id,
    type: 'airspace',
    name,
    displayName: elements.basicLayerDisplayName.value.trim() || name,
    displayNameVisible: elements.basicLayerDisplayNameVisible.checked,
    kind,
    label,
    visible,
    fill: kind === 'controlled' ? 'rgba(96, 165, 250, 0.08)' : 'rgba(52, 211, 153, 0.09)',
    points,
  };

  if (existingIndex >= 0) {
    state.basic[existingIndex] = next;
  } else {
    state.basic.push(next);
  }

  hideBasicLayerEditor();
  saveState();
  renderBasicLayerSettings();
  renderMap();
}

async function handleBasicGeoJsonImport(event) {
  const [file] = event.target.files || [];
  event.target.value = '';
  if (!file) return;

  try {
    const geoJson = JSON.parse(await file.text());
    const features = geoJson.type === 'FeatureCollection'
      ? geoJson.features
      : geoJson.type === 'Feature' ? [geoJson] : [];
    const imported = features.flatMap((feature, featureIndex) => geoJsonFeatureToBasicItems(feature, featureIndex));
    if (!imported.length) throw new Error('PolygonまたはMultiPolygonが見つかりません');

    state.basic = state.basic.filter((item) => item.source !== 'geojson');
    state.basic.push(...imported);
    saveState();
    renderBasicLayerSettings();
    renderMap();
    setSettingsStatus(`${file.name} から ${imported.length}件の空域を読み込みました`);
  } catch (error) {
    setSettingsStatus(`GeoJSONを読み込めませんでした: ${error.message}`);
  }
}

function clearBasicGeoJson() {
  const geoJsonCount = state.basic.filter((item) => item.source === 'geojson').length;
  if (!geoJsonCount) {
    setSettingsStatus('削除対象のGeoJSON空域はありません');
    return;
  }

  state.basic = state.basic.filter((item) => item.source !== 'geojson');
  saveState();
  renderBasicLayerSettings();
  renderMap();
  setSettingsStatus(`GeoJSON空域を${geoJsonCount}件削除しました`);
}

function geoJsonFeatureToBasicItems(feature, featureIndex) {
  const geometry = feature && feature.geometry;
  if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type)) return [];
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const properties = feature.properties || {};
  const name = String(properties.name || properties.title || `GeoJSON空域 ${featureIndex + 1}`);
  const label = name.length > 12 ? name.slice(0, 12) : name;
  const kind = properties.type === 1 || properties.kind === 'control-zone' ? 'control-zone' : 'controlled';

  return polygons.map((polygon, polygonIndex) => {
    const outerRing = Array.isArray(polygon) ? polygon[0] : [];
    const geoPoints = outerRing
      .filter((coordinate) => Array.isArray(coordinate) && Number.isFinite(coordinate[0]) && Number.isFinite(coordinate[1]))
      .map(([lon, lat]) => [lat, lon]);
    if (geoPoints.length < 3) return null;
    const points = geoPoints.map(([lat, lon]) => {
      const position = geoToMapPosition(lat, lon);
      return [position.x, position.y];
    });
    return {
      id: `geojson-${Date.now()}-${featureIndex}-${polygonIndex}`,
      type: 'airspace',
      name: polygons.length > 1 ? `${name}-${polygonIndex + 1}` : name,
      kind,
      label,
      visible: true,
      source: 'geojson',
      geoPoints,
      fill: kind === 'controlled' ? 'rgba(96, 165, 250, 0.08)' : 'rgba(52, 211, 153, 0.09)',
      points,
    };
  }).filter(Boolean);
}

function startBasicDisplayRangeSelection() {
  basicDisplayRangePoints = [];
  mapPickTarget = 'basicDisplayRange';
  mapPickReturnPanel = 'basic';
  toggleSettings(false);
  setSettingsStatus('MAP上で表示範囲の4点を順番にタップしてください（1/4）');
}

function applyBasicDisplayRange() {
  const range = basicDisplayRangePoints;
  state.basic.forEach((item) => {
    const points = getBasicGeometryPoints(item);
    item.visible = points.length > 0 && polygonsIntersect(range, points);
  });
  const visibleCount = state.basic.filter((item) => item.visible !== false).length;
  basicDisplayRangePoints = [];
  saveState();
  renderBasicLayerSettings();
  renderMap();
  setSettingsStatus(`表示範囲を適用しました（${visibleCount}件を表示）`);
}

function getBasicGeometryPoints(item) {
  if (item.type === 'airspace' || item.type === 'route') {
    return getBasicDisplayPoints(item);
  }
  if (Number.isFinite(item.lat) && Number.isFinite(item.lon)) {
    const position = geoToMapPosition(item.lat, item.lon);
    return [[position.x, position.y]];
  }
  return [];
}

function getBasicDisplayPoints(item) {
  if (Array.isArray(item.geoPoints) && item.geoPoints.length) {
    return item.geoPoints.map(([lat, lon]) => {
      const position = geoToMapPosition(lat, lon);
      return [position.x, position.y];
    }).filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1]));
  }
  return (item.points || []).filter((point) => Array.isArray(point) && Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function polygonsIntersect(firstPolygon, secondPolygon) {
  if (!firstPolygon.length || !secondPolygon.length) return false;
  if (firstPolygon.some((point) => pointInPolygon(point, secondPolygon))) return true;
  if (secondPolygon.some((point) => pointInPolygon(point, firstPolygon))) return true;

  const firstEdges = polygonEdges(firstPolygon);
  const secondEdges = polygonEdges(secondPolygon);
  return firstEdges.some(([firstStart, firstEnd]) => secondEdges.some(([secondStart, secondEnd]) => segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd)));
}

function polygonEdges(points) {
  if (points.length < 2) return [];
  return points.map((point, index) => [point, points[(index + 1) % points.length]]);
}

function pointInPolygon(point, polygon) {
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index++) {
    const [x, y] = polygon[index];
    const [previousX, previousY] = polygon[previous];
    const crosses = (y > point[1]) !== (previousY > point[1])
      && point[0] < ((previousX - x) * (point[1] - y)) / (previousY - y) + x;
    if (crosses) inside = !inside;
  }
  return inside || polygon.some((vertex, index) => pointOnSegment(point, vertex, polygon[(index + 1) % polygon.length]));
}

function pointOnSegment(point, start, end) {
  const cross = (point[1] - start[1]) * (end[0] - start[0]) - (point[0] - start[0]) * (end[1] - start[1]);
  if (Math.abs(cross) > 0.000001) return false;
  return point[0] >= Math.min(start[0], end[0]) - 0.000001
    && point[0] <= Math.max(start[0], end[0]) + 0.000001
    && point[1] >= Math.min(start[1], end[1]) - 0.000001
    && point[1] <= Math.max(start[1], end[1]) + 0.000001;
}

function segmentsIntersect(firstStart, firstEnd, secondStart, secondEnd) {
  const firstOrientation = orientation(firstStart, firstEnd, secondStart);
  const secondOrientation = orientation(firstStart, firstEnd, secondEnd);
  const thirdOrientation = orientation(secondStart, secondEnd, firstStart);
  const fourthOrientation = orientation(secondStart, secondEnd, firstEnd);
  if (firstOrientation !== secondOrientation && thirdOrientation !== fourthOrientation) return true;
  return (firstOrientation === 0 && pointOnSegment(secondStart, firstStart, firstEnd))
    || (secondOrientation === 0 && pointOnSegment(secondEnd, firstStart, firstEnd))
    || (thirdOrientation === 0 && pointOnSegment(firstStart, secondStart, secondEnd))
    || (fourthOrientation === 0 && pointOnSegment(firstEnd, secondStart, secondEnd));
}

function orientation(first, second, third) {
  const value = (second[1] - first[1]) * (third[0] - second[0]) - (second[0] - first[0]) * (third[1] - second[1]);
  if (Math.abs(value) < 0.000001) return 0;
  return value > 0 ? 1 : 2;
}

function updateSettingsFields() {
  elements.bullseyeLat.value = formatDdmmm(state.settings.bullseye.lat, 'lat');
  elements.bullseyeLon.value = formatDdmmm(state.settings.bullseye.lon, 'lon');
  elements.mapCenterLat.value = formatDdmmm(state.settings.mapCenter.lat, 'lat');
  elements.mapCenterLon.value = formatDdmmm(state.settings.mapCenter.lon, 'lon');
  elements.selfSimulationHeading.value = String(Math.round(toMagneticBearing(state.self.heading) * 10) / 10);
  elements.selfSimulationSpeed.value = String(Math.max(0, Number(state.self.speed) || 0));
  elements.toggleSelfSimulation.textContent = selfSimulationTimer ? '模擬停止' : '模擬開始';
  elements.toggleGpsTracking.textContent = gpsWatchId !== null ? 'GPS受信停止' : 'GPS受信開始';
  elements.coordinateSystem.value = state.settings.coordSystem || 'DDMM.MMM';
  const deviationMode = state.settings.deviationMode || 'auto';
  document.querySelector(`input[name="deviationMode"][value="${deviationMode}"]`).checked = true;
  elements.manualDeviation.value = String(state.settings.manualDeviation || 0);
  elements.manualDeviation.disabled = deviationMode !== 'manual';
  const displayScale = clampNumber(Number(state.settings.displayScale), 10, 200, 100);
  elements.displayScale.value = String(displayScale);
  elements.displayScaleValue.textContent = `${displayScale}%`;
  if (elements.seadHarmTof) elements.seadHarmTof.value = formatSeadCountdown(Number(state.settings.seadHarmTof) || 0);
  if (elements.seadHarmRemain) elements.seadHarmRemain.value = String(clampNumber(Number(state.settings.seadHarmRemain), 0, 99, 0));
  if (elements.seadArizona) elements.seadArizona.value = String(clampNumber(Number(state.settings.seadArizona), 0, 9, 0));
  const [totHour, totMinute, totSecond] = getTotTimeParts();
  if (elements.totTimeHour) elements.totTimeHour.value = String(totHour).padStart(2, '0');
  if (elements.totTimeMinute) elements.totTimeMinute.value = String(totMinute).padStart(2, '0');
  if (elements.totTimeSecond) elements.totTimeSecond.value = String(totSecond).padStart(2, '0');
  const totTof = Number(state.settings.totTof) || 0;
  if (elements.totTofMinute) elements.totTofMinute.value = String(Math.floor(totTof / 60)).padStart(2, '0');
  if (elements.totTofSecond) elements.totTofSecond.value = String(totTof % 60).padStart(2, '0');
  if (elements.totLaunchEnabled) elements.totLaunchEnabled.checked = state.settings.totLaunchEnabled === true;
  renderTimelineSettings();
}

function getTimelineEvents() {
  if (!Array.isArray(state.settings.timelineEvents)) state.settings.timelineEvents = [];
  return state.settings.timelineEvents;
}

function getTimelineAlerts(event) {
  if (Array.isArray(event.alerts)) return event.alerts;
  event.alerts = [{
    id: `${event.id || 'timeline'}-alert-1`,
    alertColor: event.alertColor || 'GREEN',
    alertOffset: Number(event.alertOffset || 0),
    alertEnabled: event.alertEnabled !== false,
  }];
  return event.alerts;
}

function getTimelineTimeParts(row) {
  return ['hour', 'minute', 'second'].map((part) => Number(row.querySelector(`[data-timeline-${part}]`)?.value));
}

function saveTimelineEventTime(row, event) {
  const parts = getTimelineTimeParts(row);
  if (parts.every(Number.isInteger) && parts[0] >= 0 && parts[0] <= 23 && parts[1] >= 0 && parts[1] <= 59 && parts[2] >= 0 && parts[2] <= 59) {
    event.time = parts.map((part) => String(part).padStart(2, '0')).join(':');
  }
}

function renderTimelineSettings() {
  if (!elements.timelineSettingsList) return;
  elements.timelineSettingsList.innerHTML = getTimelineEvents().map((event, index) => {
    const [hour, minute, second] = String(event.time || '00:00:00').split(':').map(Number);
    return `
      <div class="timeline-event-row" data-timeline-index="${index}">
        <div class="timeline-event-header">
          <label><span>EVENT名</span><input data-timeline-name type="text" maxlength="40" value="${escapeHtml(event.name || '')}" /></label>
          <div class="timeline-event-time"><span>時刻</span><div class="tot-time-inputs">
            <label>DD<input data-timeline-hour type="number" min="0" max="23" step="1" value="${String(Number.isInteger(hour) ? hour : 0).padStart(2, '0')}" /></label><span>:</span>
            <label>MM<input data-timeline-minute type="number" min="0" max="59" step="1" value="${String(Number.isInteger(minute) ? minute : 0).padStart(2, '0')}" /></label><span>:</span>
            <label>SS<input data-timeline-second type="number" min="0" max="59" step="1" value="${String(Number.isInteger(second) ? second : 0).padStart(2, '0')}" /></label>
          </div></div>
          <button type="button" class="secondary-btn small-btn" data-timeline-alert-button>ALERT</button>
          <button type="button" class="danger-btn small-btn" data-timeline-remove>削除</button>
        </div>
        <div class="timeline-alert-options hidden">
          <div class="timeline-alert-list">${renderTimelineAlertRows(event)}</div>
          <button type="button" class="secondary-btn small-btn" data-timeline-alert-add>ALERTを追加</button>
        </div>
      </div>`;
  }).join('');
}

function renderTimelineAlertRows(event) {
  return getTimelineAlerts(event).map((alert, index) => {
    const offset = Number(alert.alertOffset || 0);
    const absolute = Math.abs(offset);
    const color = ['GREEN', 'YELLOW', 'RED'].includes(alert.alertColor) ? alert.alertColor : 'GREEN';
    const alertIndex = index;
    return `<div class="timeline-alert-row" data-timeline-alert-index="${alertIndex}">
      <label class="mini-toggle"><input data-timeline-enabled type="checkbox"${alert.alertEnabled !== false ? ' checked' : ''} /> <span>有効</span></label>
      <label><span>色</span><select data-timeline-color><option value="GREEN"${color === 'GREEN' ? ' selected' : ''}>GREEN</option><option value="YELLOW"${color === 'YELLOW' ? ' selected' : ''}>YELLOW</option><option value="RED"${color === 'RED' ? ' selected' : ''}>RED</option></select></label>
              <label><span>差分 MM:SS</span><div class="timeline-offset-inputs"><input data-timeline-offset-minute type="number" min="-999" max="999" step="1" value="${offset < 0 ? '-' : ''}${Math.floor(absolute / 60)}" /><span>:</span><input data-timeline-offset-second type="number" min="0" max="59" step="1" value="${String(absolute % 60).padStart(2, '0')}" /></div></label>
      <button type="button" class="danger-btn small-btn" data-timeline-alert-remove>削除</button>
    </div>`;
  }).join('');
}

function saveTimelineEventRow(row, changedTarget = null) {
  const index = Number(row.dataset.timelineIndex);
  const event = getTimelineEvents()[index];
  if (!event) return;
  saveTimelineEventTime(row, event);
  event.name = row.querySelector('[data-timeline-name]')?.value || '';
  const alertRow = changedTarget?.closest('[data-timeline-alert-index]');
  if (alertRow) {
    const alert = getTimelineAlerts(event)[Number(alertRow.dataset.timelineAlertIndex)];
    const offsetMinuteInput = alertRow.querySelector('[data-timeline-offset-minute]');
    const offsetMinuteText = String(offsetMinuteInput?.value || '0').trim();
    const offsetMinute = Number(offsetMinuteText || 0);
    const offsetSecond = Number(alertRow.querySelector('[data-timeline-offset-second]')?.value || 0);
    alert.alertEnabled = alertRow.querySelector('[data-timeline-enabled]')?.checked === true;
    alert.alertColor = alertRow.querySelector('[data-timeline-color]')?.value || 'GREEN';
    if (Number.isInteger(offsetMinute) && Number.isInteger(offsetSecond) && offsetSecond >= 0 && offsetSecond <= 59) {
      const isNegative = offsetMinuteText.startsWith('-');
      alert.alertOffset = Math.abs(offsetMinute) * 60 * (isNegative ? -1 : 1) + (isNegative ? -offsetSecond : offsetSecond);
    }
  }
  saveState();
  updateTimelineAlerts();
}

function bindTimelineSettings() {
  elements.timelineSettingsList.addEventListener('input', (event) => {
    const row = event.target.closest('[data-timeline-index]');
    if (row) saveTimelineEventRow(row, event.target);
  });
  elements.timelineSettingsList.addEventListener('change', (event) => {
    const row = event.target.closest('[data-timeline-index]');
    if (row) saveTimelineEventRow(row, event.target);
  });
  elements.timelineSettingsList.addEventListener('click', (event) => {
    const row = event.target.closest('[data-timeline-index]');
    if (!row) return;
    if (event.target.closest('[data-timeline-alert-button]')) row.querySelector('.timeline-alert-options').classList.toggle('hidden');
    if (event.target.closest('[data-timeline-alert-add]')) {
      const timelineEvent = getTimelineEvents()[Number(row.dataset.timelineIndex)];
      saveTimelineEventTime(row, timelineEvent);
      timelineEvent.name = row.querySelector('[data-timeline-name]')?.value || '';
      getTimelineAlerts(timelineEvent).push({ id: `${timelineEvent.id}-alert-${Date.now()}`, alertColor: 'GREEN', alertOffset: 0, alertEnabled: true });
      saveState();
      renderTimelineSettings();
      document.querySelector(`[data-timeline-index="${row.dataset.timelineIndex}"] .timeline-alert-options`)?.classList.remove('hidden');
    }
    if (event.target.closest('[data-timeline-alert-remove]')) {
      const timelineEvent = getTimelineEvents()[Number(row.dataset.timelineIndex)];
      const alertIndex = Number(event.target.closest('[data-timeline-alert-index]').dataset.timelineAlertIndex);
      getTimelineAlerts(timelineEvent).splice(alertIndex, 1);
      if (!getTimelineAlerts(timelineEvent).length) getTimelineAlerts(timelineEvent).push({ id: `${timelineEvent.id}-alert-1`, alertColor: 'GREEN', alertOffset: 0, alertEnabled: false });
      saveState();
      renderTimelineSettings();
    }
    if (event.target.closest('[data-timeline-remove]')) {
      getTimelineEvents().splice(Number(row.dataset.timelineIndex), 1);
      saveState();
      renderTimelineSettings();
      updateTimelineAlerts();
    }
  });
  elements.timelineAlertWindow.addEventListener('dblclick', () => {
    document.querySelectorAll('[data-timeline-alert-key]').forEach((item) => dismissedTimelineAlerts.add(item.dataset.timelineAlertKey));
    elements.timelineAlertWindow.classList.add('hidden');
    elements.timelineAlertItems.replaceChildren();
  });
  elements.addTimelineEventButton.addEventListener('click', () => {
    const now = new Date();
    getTimelineEvents().push({ id: `timeline-${Date.now()}`, name: '', time: `${formatClockTime(now).slice(0, 5)}:00`, alertColor: 'GREEN', alertOffset: 0, alertEnabled: true });
    saveState();
    renderTimelineSettings();
  });
}

function updateTotSettings() {
  const timeParts = [elements.totTimeHour, elements.totTimeMinute, elements.totTimeSecond].map((input) => Number(input.value));
  if (timeParts.every(Number.isInteger) && timeParts[0] <= 23 && timeParts[1] <= 59 && timeParts[2] <= 59) {
    state.settings.totTime = timeParts.map((part) => String(part).padStart(2, '0')).join(':');
  }
  const tofMinute = Number(elements.totTofMinute.value);
  const tofSecond = Number(elements.totTofSecond.value);
  if (Number.isInteger(tofMinute) && Number.isInteger(tofSecond) && tofMinute >= 0 && tofSecond >= 0 && tofSecond <= 59) {
    state.settings.totTof = tofMinute * 60 + tofSecond;
  }
  updateSettingsFields();
  saveState();
  updateFeatureWindows();
}

function parseSeadTof(value) {
  const match = String(value).trim().match(/^(\d{1,3}):(\d{2})$/);
  if (!match) return null;
  const minutes = Number(match[1]);
  const seconds = Number(match[2]);
  return seconds < 60 ? minutes * 60 + seconds : null;
}

function getDisplayScale() {
  const base = clampNumber(Number(state.settings.symbolScaleBase), 0.1, 2, 0.5);
  const relative = clampNumber(Number(state.settings.displayScale), 10, 200, 100) / 100;
  return clampNumber(base * relative, 0.05, 1.0, 0.5);
}

function getAdaptiveStrokeWidth(width) {
  return String(Number(width) * getDisplayScale() * getAnnotationScale());
}

function getAnnotationScale() {
  const zoom = clampNumber(Number(mapInteraction.scale), 0.25, MAP_MAX_SCALE, 1);
  return clampNumber(Math.sqrt(zoom), 0.45, 2.5, 1);
}

function getSymbolDrawScale() {
  return getDisplayScale();
}

function updateStaticCoordinateFields() {
  const isBe = elements.staticLayerCoordSystem.value === 'BE';
  const isLine = elements.staticLayerType.value === 'line';
  const isCombined = ['MGRS', 'GARS'].includes(elements.staticLayerCoordSystem.value);
  elements.staticLayerGeoFields.forEach((field) => field.classList.toggle('hidden', isBe));
  elements.staticLayerGeoFields[1]?.classList.toggle('hidden', isBe || isCombined);
  if (isCombined) elements.staticLayerLat.previousElementSibling.textContent = '座標';
  else elements.staticLayerLat.previousElementSibling.textContent = '緯度';
  elements.staticLayerBeFields.classList.toggle('hidden', !isBe);
  elements.staticLayerLineFields.classList.toggle('hidden', !isLine);
  elements.legacyGeometryFields.forEach((field) => field.classList.add('hidden'));
  elements.dynamicCircleSettings?.classList.remove('hidden');
}

function getStaticLinePointsFromForm() {
  try {
    const points = JSON.parse(elements.staticLayerLinePoints.value || '[]');
    return Array.isArray(points) ? points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon)).slice(0, 50) : [];
  } catch {
    return [];
  }
}

function setStaticLinePointsInForm(points) {
  const safePoints = points.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lon)).slice(0, 50);
  elements.staticLayerLinePoints.value = JSON.stringify(safePoints);
  elements.staticLayerLinePointSummary.textContent = `地点: ${safePoints.length} / 50`;
}

function finishStaticLinePointPicking() {
  if (mapPickTarget !== 'staticLinePoints') return;
  mapPickTarget = null;
  toggleSettings(true);
  setActiveSettingsButton(document.querySelector('[data-layer-target="static"]'));
  hideSettingsPanels();
  showStaticLayerPanel();
  openStaticLayerEditor();
  if (mapPickFormValues) {
    Object.entries(mapPickFormValues).forEach(([id, value]) => {
      const field = document.getElementById(id);
      if (field) field.value = value;
    });
  }
  elements.staticLayerType.value = 'line';
  setStaticLinePointsInForm(getStaticLinePointsFromForm());
  updateStaticCoordinateFields();
  mapPickReturnPanel = null;
  mapPickFormValues = null;
  setSettingsStatus('線の地点指定を完了しました');
}

function getDynamicCircleConfig(item) {
  if (Array.isArray(item?.circleConfig) && item.circleConfig.length) {
    return item.circleConfig
      .slice(0, 3)
      .map((circle) => ({
        radius: Math.max(0, Number(circle.radius) || 0),
        color: ['red', 'yellow', 'blue', 'green'].includes(circle.color) ? circle.color : 'red',
      }))
      .filter((circle) => circle.radius > 0);
  }
  const circles = Array.from({ length: 3 }, (_, index) => {
    const radius = Number(item?.[`circleRadius${index + 1}`] ?? item?.[`geometryRadius${index + 1}`] ?? 0);
    const color = item?.[`circleColor${index + 1}`] ?? item?.[`geometryColor${index + 1}`] ?? 'red';
    return {
      radius: Number.isFinite(radius) ? Math.max(0, radius) : 0,
      color: ['red', 'yellow', 'blue', 'green'].includes(color) ? color : 'red',
    };
  });
  const configured = circles.filter((circle) => circle.radius > 0);
  if (configured.length) return configured;
  const legacyRadius = Number(item?.geometryRadius || 0);
  return legacyRadius > 0 ? [{ radius: legacyRadius, color: item?.geometryColor || 'red' }] : [];
}

function applyDynamicCircleFormValues(item) {
  const circles = getDynamicCircleConfig(item);
  elements.dynamicCircleRadius1.value = circles[0]?.radius ?? 0;
  elements.dynamicCircleColor1.value = circles[0]?.color ?? 'red';
  elements.dynamicCircleRadius2.value = circles[1]?.radius ?? 0;
  elements.dynamicCircleColor2.value = circles[1]?.color ?? 'red';
  elements.dynamicCircleRadius3.value = circles[2]?.radius ?? 0;
  elements.dynamicCircleColor3.value = circles[2]?.color ?? 'red';
}

function getDynamicCircleColor(colorName) {
  const colors = {
    red: '#ef4444',
    yellow: '#facc15',
    blue: '#60a5fa',
    green: '#22c55e',
  };
  return colors[colorName] || '#60a5fa';
}

function getGeographicCirclePath(center, radiusNm) {
  const points = [];

  for (let bearing = 0; bearing <= 360; bearing += 5) {
    const point = getGeographicDestination(center, bearing, radiusNm);
    points.push(geoToMapPosition(point.lat, point.lon));
  }

  return points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * 10} ${point.y * 7}`).join(' ') + ' Z';
}

function getGeographicDestination(origin, bearing, distanceNm) {
  const angularDistance = distanceNm / 3440.065;
  const bearingRadians = (bearing * Math.PI) / 180;
  const lat1 = (origin.lat * Math.PI) / 180;
  const lon1 = (origin.lon * Math.PI) / 180;
  const lat2 = Math.asin(
    Math.sin(lat1) * Math.cos(angularDistance)
    + Math.cos(lat1) * Math.sin(angularDistance) * Math.cos(bearingRadians),
  );
  const lon2 = lon1 + Math.atan2(
    Math.sin(bearingRadians) * Math.sin(angularDistance) * Math.cos(lat1),
    Math.cos(angularDistance) - Math.sin(lat1) * Math.sin(lat2),
  );
  return { lat: (lat2 * 180) / Math.PI, lon: (lon2 * 180) / Math.PI };
}

function getGeoDistance(from, to) {
  const lat1 = (from.lat * Math.PI) / 180;
  const lat2 = (to.lat * Math.PI) / 180;
  const deltaLat = lat2 - lat1;
  const deltaLon = ((to.lon - from.lon) * Math.PI) / 180;
  const a = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) ** 2;
  return 3440.065 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function getGeoBearing(from, to) {
  const fromLat = (from.lat * Math.PI) / 180;
  const toLat = (to.lat * Math.PI) / 180;
  const deltaLon = ((to.lon - from.lon) * Math.PI) / 180;
  return ((Math.atan2(
    Math.sin(deltaLon) * Math.cos(toLat),
    Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon),
  ) * 180) / Math.PI + 360) % 360;
}

function snapToDynamicRange(coordinates) {
  let closest = null;
  state.dynamic.forEach((item) => {
    if (item.visible === false || String(item.status || 'ACTIVE').toUpperCase() === 'DESTROYED') return;
    const center = getItemGeoCoordinates(item);
    const distance = getGeoDistance(center, coordinates);
    getDynamicCircleConfig(item).forEach((circle) => {
      const difference = Math.abs(distance - circle.radius);
      const threshold = Math.max(0.5, circle.radius * 0.015);
      if (difference > threshold || (closest && difference >= closest.difference)) return;
      closest = { center, radius: circle.radius, difference };
    });
  });
  return closest ? getGeographicDestination(closest.center, getGeoBearing(closest.center, coordinates), closest.radius) : coordinates;
}

function getDynamicRangeHookTarget(coordinates) {
  let closest = null;
  state.dynamic.forEach((item) => {
    if (item.visible === false || String(item.status || 'ACTIVE').toUpperCase() === 'DESTROYED') return;
    const center = getItemGeoCoordinates(item);
    const distance = getGeoDistance(center, coordinates);
    getDynamicCircleConfig(item).forEach((circle, circleIndex) => {
      const difference = Math.abs(distance - circle.radius);
      const threshold = Math.max(0.5, circle.radius * 0.015);
      if (difference > threshold || (closest && difference >= closest.difference)) return;
      closest = { item, circleIndex, difference };
    });
  });
  if (!closest) return null;
  return {
    id: `${closest.item.id}-circle-${closest.circleIndex + 1}`,
    kind: 'dynamicRange',
    layer: 'dynamic',
    objectId: closest.item.id,
    circleIndex: closest.circleIndex,
    name: `${closest.item.name} 円${closest.circleIndex + 1}`,
  };
}

function getHookTargetCoordinates(target) {
  if (target?.kind === 'self') return { lat: state.self.lat, lon: state.self.lon };
  if (target?.kind === 'bullseye') return { lat: state.settings.bullseye.lat, lon: state.settings.bullseye.lon };
  if (target?.kind === 'object') {
    const item = state[target.layer]?.find((entry) => entry.id === target.objectId);
    if (item) return getItemGeoCoordinates(item);
  }
  if (target?.kind === 'dynamicRange') {
    const item = state.dynamic.find((entry) => entry.id === target.objectId);
    const circle = item && getDynamicCircleConfig(item)[target.circleIndex];
    if (item && circle) {
      const center = getItemGeoCoordinates(item);
      return getGeographicDestination(center, getGeoBearing(center, state.self), circle.radius);
    }
  }
  if (Number.isFinite(target?.lat) && Number.isFinite(target?.lon)) return target;
  return mapPositionToGeo(target?.x ?? 50, target?.y ?? 50);
}

function selectHookTarget(target) {
  hookWindowTargets.set(activeHookWindowKey, target);
  if (activeHookWindowKey === 'hook') hookTarget = target;
  hookMode = false;
  elements.svg.removeAttribute('data-hook-selecting');
  elements.hookButton.style.background = '';
  updateHookDisplay();
  updateSelfInfoDisplay();
  renderMap();
  setSettingsStatus(`${activeHookWindowKey === 'hook' ? '自機Hook' : 'Hook'}対象を設定: ${target.name}`);
}

function createObjectHookTarget(item, layerName) {
  return {
    id: `${layerName}-${item.id}`,
    kind: 'object',
    layer: layerName,
    objectId: item.id,
    name: item.name,
  };
}

function updateDeviationControls() {
  const mode = state.settings.deviationMode || 'auto';
  elements.manualDeviation.disabled = mode !== 'manual';
}

function formatDdmmm(value, axis) {
  const number = Number(value);
  if (!Number.isFinite(number)) return axis === 'lat' ? '3541.234' : '13941.234';

  const sign = number < 0 ? -1 : 1;
  const abs = Math.abs(number);
  const degrees = Math.floor(abs);
  const minutes = (abs - degrees) * 60;
  const padded = `${String(degrees).padStart(axis === 'lat' ? 2 : 3, '0')}${minutes.toFixed(3).padStart(6, '0')}`;

  return sign < 0 ? `-${padded}` : padded;
}

function formatDdmmss(value, axis) {
  const number = Number(value);
  if (!Number.isFinite(number)) return axis === 'lat' ? '000000N' : '0000000E';

  const absolute = Math.abs(number);
  const degrees = Math.floor(absolute);
  const totalSeconds = Math.round((absolute - degrees) * 3600 * 10) / 10;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  const degreeWidth = axis === 'lat' ? 2 : 3;
  const secondText = seconds.toFixed(1).padStart(4, '0');
  const hemisphere = axis === 'lat'
    ? (number < 0 ? 'S' : 'N')
    : (number < 0 ? 'W' : 'E');
  return `${String(degrees).padStart(degreeWidth, '0')}${String(minutes).padStart(2, '0')}${secondText}${hemisphere}`;
}

const MGRS_COLUMN_SETS = ['ABCDEFGH', 'JKLMNPQR', 'STUVWXYZ'];
const MGRS_ROW_LETTERS = 'ABCDEFGHJKLMNPQRSTUV';
const MGRS_BANDS = 'CDEFGHJKLMNPQRSTUVWX';
const GARS_LAT_LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

function latLonToUtm(lat, lon) {
  const radians = Math.PI / 180;
  let zone = Math.floor((lon + 180) / 6) + 1;
  if (lat >= 56 && lat < 64 && lon >= 3 && lon < 12) zone = 32;
  if (lat >= 72 && lat < 84) {
    if (lon < 9) zone = 31;
    else if (lon < 21) zone = 33;
    else if (lon < 33) zone = 35;
    else if (lon < 42) zone = 37;
  }

  const a = 6378137;
  const eccentricitySquared = 0.00669438;
  const eccentricityPrimeSquared = eccentricitySquared / (1 - eccentricitySquared);
  const k0 = 0.9996;
  const latitude = lat * radians;
  const longitude = lon * radians;
  const centralMeridian = ((zone - 1) * 6 - 180 + 3) * radians;
  const sinLatitude = Math.sin(latitude);
  const cosLatitude = Math.cos(latitude);
  const tanLatitude = Math.tan(latitude);
  const n = a / Math.sqrt(1 - eccentricitySquared * sinLatitude ** 2);
  const t = tanLatitude ** 2;
  const c = eccentricityPrimeSquared * cosLatitude ** 2;
  const aa = cosLatitude * (longitude - centralMeridian);
  const m = a * ((1 - eccentricitySquared / 4 - 3 * eccentricitySquared ** 2 / 64 - 5 * eccentricitySquared ** 3 / 256) * latitude
    - (3 * eccentricitySquared / 8 + 3 * eccentricitySquared ** 2 / 32 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(2 * latitude)
    + (15 * eccentricitySquared ** 2 / 256 + 45 * eccentricitySquared ** 3 / 1024) * Math.sin(4 * latitude)
    - (35 * eccentricitySquared ** 3 / 3072) * Math.sin(6 * latitude));
  const easting = k0 * n * (aa + (1 - t + c) * aa ** 3 / 6 + (5 - 18 * t + t ** 2 + 72 * c - 58 * eccentricityPrimeSquared) * aa ** 5 / 120) + 500000;
  let northing = k0 * (m + n * tanLatitude * (aa ** 2 / 2 + (5 - t + 9 * c + 4 * c ** 2) * aa ** 4 / 24 + (61 - 58 * t + t ** 2 + 600 * c - 330 * eccentricityPrimeSquared) * aa ** 6 / 720));
  if (lat < 0) northing += 10000000;
  return { zone, easting, northing };
}

function formatMgrs(lat, lon) {
  const utm = latLonToUtm(Number(lat), Number(lon));
  const bandIndex = Math.min(19, Math.max(0, Math.floor((Number(lat) + 80) / 8)));
  const band = MGRS_BANDS[bandIndex];
  const columnSet = MGRS_COLUMN_SETS[(utm.zone - 1) % 3];
  const eastingColumn = Math.max(1, Math.min(8, Math.floor(utm.easting / 100000)));
  const eastingLetter = columnSet[eastingColumn - 1];
  const rowOffset = (utm.zone % 2 === 0 ? 5 : 0);
  const northingRow = Math.floor(utm.northing / 100000) % 20;
  const northingLetter = MGRS_ROW_LETTERS[(northingRow + rowOffset) % 20];
  const eastingRemainder = Math.floor(utm.easting % 100000).toString().padStart(5, '0');
  const northingRemainder = Math.floor(utm.northing % 100000).toString().padStart(5, '0');
  return `${String(utm.zone).padStart(2, '0')}${band}${eastingLetter}${northingLetter}${eastingRemainder}${northingRemainder}`;
}

function formatGars(lat, lon) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  const column = Math.min(720, Math.max(1, Math.floor((longitude + 180) / 0.5) + 1));
  const bandIndex = Math.min(359, Math.max(0, Math.floor((latitude + 90) / 0.5)));
  const bandPair = `${GARS_LAT_LETTERS[Math.floor(bandIndex / 24)]}${GARS_LAT_LETTERS[bandIndex % 24]}`;
  const latOffset = (latitude + 90) % 0.5;
  const lonOffset = (longitude + 180) % 0.5;
  const north = latOffset >= 0.25;
  const east = lonOffset >= 0.25;
  const quadrant = north ? (east ? '2' : '1') : (east ? '4' : '3');
  const keypadColumn = Math.min(2, Math.floor((lonOffset % 0.25) / (1 / 120)));
  const keypadRow = Math.min(2, Math.floor((latOffset % 0.25) / (1 / 120)));
  const keypad = String((keypadRow * 3) + keypadColumn + 1);
  return `${String(column).padStart(3, '0')}${bandPair}${quadrant}${keypad}`;
}

function formatCoordinatePair(lat, lon, system = state.settings.coordSystem) {
  if (system === 'MGRS') return formatMgrs(lat, lon);
  if (system === 'GARS') return formatGars(lat, lon);
  if (system === 'DDMMSS') return `${formatDdmmss(lat, 'lat')} ${formatDdmmss(lon, 'lon')}`;
  return `${formatDdmmm(lat, 'lat')} ${formatDdmmm(lon, 'lon')}`;
}

function formatCoordinate(value, axis, system) {
  if (system === 'DDMMSS') return formatDdmmss(value, axis);
  return formatDdmmm(value, axis);
}

function parseCoordinate(value, axis, system, fallback) {
  if (system === 'DDMMSS') return parseDdmmss(value, axis, fallback);
  if (system === 'MGRS') return parseMgrs(value, axis, fallback);
  if (system === 'GARS') return parseGars(value, axis, fallback);
  return parseDdmmm(value, axis, fallback);
}

function parseDdmmm(value, axis, fallback) {
  const raw = String(value || '').trim();
  if (!raw) return fallback;

  const sign = raw.startsWith('-') ? -1 : 1;
  const normalized = raw.replace(/[^0-9.]/g, '');
  if (!normalized) return fallback;

  const parts = normalized.split('.');

  const degreeSize = axis === 'lat' ? 2 : 3;
  const degreeText = parts[0].slice(0, degreeSize);
  const minuteWhole = parts[0].slice(degreeSize);
  const minuteText = parts.length < 2
    ? `${minuteWhole}.000`
    : `${minuteWhole}.${parts.slice(1).join('') || '0'}`;

  const degrees = Number(degreeText);
  const minutes = Number(minuteText);
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || minutes >= 60) return fallback;

  const decimal = (degrees + minutes / 60) * sign;
  return Math.min(axis === 'lat' ? 90 : 180, Math.max(axis === 'lat' ? -90 : -180, decimal));
}

function parseDdmmss(value, axis, fallback) {
  const raw = String(value || '').trim().toUpperCase();
  const match = raw.match(/^(-?)(\d{2,3})[\s°:](\d{2})[\s'′:]?(\d{2}(?:\.\d+)?)[\s"″]?([NSWE])?$/)
    || raw.match(/^(-?)(\d{2,3})(\d{2})(\d{2}(?:\.\d+)?)([NSWE])?$/);
  if (!match) return fallback;
  const sign = match[1] === '-' || match[5] === 'S' || match[4] === 'W' ? -1 : 1;
  const degreeText = match[2];
  const minutes = Number(match[3]);
  const seconds = Number(match[4]);
  const degrees = Number(degreeText);
  if (!Number.isFinite(degrees) || !Number.isFinite(minutes) || !Number.isFinite(seconds) || minutes >= 60 || seconds >= 60) return fallback;
  return Math.min(axis === 'lat' ? 90 : 180, Math.max(axis === 'lat' ? -90 : -180, sign * (degrees + (minutes + seconds / 60) / 60)));
}

function parseMgrs(value, axis, fallback) {
  const raw = String(value || '').replace(/\s+/g, '').toUpperCase();
  const match = raw.match(/^(\d{1,2})([C-HJ-NP-X])([A-HJ-NP-Z])([A-HJ-NP-V])(\d{10})$/);
  if (!match) return fallback;
  const zone = Number(match[1]);
  const bandIndex = MGRS_BANDS.indexOf(match[2]);
  const columnSet = MGRS_COLUMN_SETS[(zone - 1) % 3];
  const eastingColumn = columnSet.indexOf(match[3]);
  const rowIndex = MGRS_ROW_LETTERS.indexOf(match[4]);
  if (zone < 1 || zone > 60 || bandIndex < 0 || eastingColumn < 0 || rowIndex < 0) return fallback;
  const easting = (eastingColumn + 1) * 100000 + Number(match[5].slice(0, 5));
  const rowOffset = zone % 2 === 0 ? 5 : 0;
  let northing = ((rowIndex - rowOffset + 20) % 20) * 100000 + Number(match[5].slice(5));
  const bandMinimum = latLonToUtm(-80 + bandIndex * 8, ((zone - 1) * 6) - 180 + 3).northing;
  while (northing < bandMinimum) northing += 2000000;
  const geo = utmToLatLon(zone, easting, northing, bandIndex < 10);
  return axis === 'lat' ? geo.lat : geo.lon;
}

function utmToLatLon(zone, easting, northing, southernHemisphere) {
  const a = 6378137;
  const eccentricitySquared = 0.00669438;
  const eccentricityPrimeSquared = eccentricitySquared / (1 - eccentricitySquared);
  const k0 = 0.9996;
  const e1 = (1 - Math.sqrt(1 - eccentricitySquared)) / (1 + Math.sqrt(1 - eccentricitySquared));
  const adjustedNorthing = southernHemisphere ? northing - 10000000 : northing;
  const m = adjustedNorthing / k0;
  const mu = m / (a * (1 - eccentricitySquared / 4 - 3 * eccentricitySquared ** 2 / 64 - 5 * eccentricitySquared ** 3 / 256));
  const phi1 = mu + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);
  const sinPhi = Math.sin(phi1);
  const cosPhi = Math.cos(phi1);
  const tanPhi = Math.tan(phi1);
  const n1 = a / Math.sqrt(1 - eccentricitySquared * sinPhi ** 2);
  const r1 = a * (1 - eccentricitySquared) / (1 - eccentricitySquared * sinPhi ** 2) ** 1.5;
  const t1 = tanPhi ** 2;
  const c1 = eccentricityPrimeSquared * cosPhi ** 2;
  const d = (easting - 500000) / (n1 * k0);
  const latitude = phi1 - (n1 * tanPhi / r1) * (d ** 2 / 2 - (5 + 3 * t1 + 10 * c1 - 4 * c1 ** 2 - 9 * eccentricityPrimeSquared) * d ** 4 / 24);
  const longitude = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180 + (d - (1 + 2 * t1 + c1) * d ** 3 / 6) / cosPhi;
  return { lat: latitude * 180 / Math.PI, lon: longitude * 180 / Math.PI };
}

function parseGars(value, axis, fallback) {
  const raw = String(value || '').replace(/\s+/g, '').toUpperCase();
  const match = raw.match(/^(\d{3})([A-HJ-NP-Z]{2})([1-4])([1-9])$/);
  if (!match) return fallback;
  const column = Number(match[1]);
  const firstBand = GARS_LAT_LETTERS.indexOf(match[2][0]);
  const secondBand = GARS_LAT_LETTERS.indexOf(match[2][1]);
  const quadrant = Number(match[3]);
  const keypad = Number(match[4]);
  if (column < 1 || column > 720 || firstBand < 0 || secondBand < 0 || keypad > 9) return fallback;
  const bandIndex = firstBand * 24 + secondBand;
  const north = quadrant <= 2;
  const east = quadrant === 2 || quadrant === 4;
  const keypadRow = Math.floor((keypad - 1) / 3);
  const keypadColumn = (keypad - 1) % 3;
  const lat = -90 + bandIndex * 0.5 + (north ? 0.25 : 0) + (keypadRow + 0.5) / 12;
  const lon = -180 + (column - 1) * 0.5 + (east ? 0.25 : 0) + (keypadColumn + 0.5) / 12;
  return axis === 'lat' ? lat : lon;
}

function getLongitudeDisplayFactor(latitude = state.settings.mapCenter.lat) {
  return Math.max(0.1, Math.cos((latitude * Math.PI) / 180));
}

function geoToMapPosition(lat, lon) {
  const center = state.settings.mapCenter;
  const longitudeFactor = getLongitudeDisplayFactor(center.lat);
  const lonDelta = (lon - center.lon) / MAP_VIEW_SPAN.lon;
  const latDelta = (lat - center.lat) / MAP_VIEW_SPAN.lat;
  return {
    x: clampNumber(50 + lonDelta * 100 * longitudeFactor, 0, 100, 50),
    y: clampNumber(50 - latDelta * 100, 0, 100, 50),
  };
}

function getLambertConstants() {
  const semiMajorAxis = 6378137;
  const flattening = 1 / 298.257223563;
  const eccentricity = Math.sqrt(flattening * (2 - flattening));
  const radians = Math.PI / 180;
  const standardParallels = LCC_STANDARD_PARALLELS.map((value) => value * radians);
  const m = (latitude) => Math.cos(latitude) / Math.sqrt(1 - eccentricity ** 2 * Math.sin(latitude) ** 2);
  const t = (latitude) => Math.tan(Math.PI / 4 - latitude / 2)
    / ((1 - eccentricity * Math.sin(latitude)) / (1 + eccentricity * Math.sin(latitude))) ** (eccentricity / 2);
  const n = Math.log(m(standardParallels[0]) / m(standardParallels[1]))
    / Math.log(t(standardParallels[0]) / t(standardParallels[1]));
  const f = m(standardParallels[0]) / (n * t(standardParallels[0]) ** n);
  return { semiMajorAxis, eccentricity, n, f, t };
}

function projectLambert(latitude, longitude) {
  const center = state.settings.mapCenter;
  const constants = getLambertConstants();
  const radians = Math.PI / 180;
  const centralMeridian = center.lon * radians;
  const latitudeRadians = latitude * radians;
  const rho = constants.semiMajorAxis * constants.f * constants.t(latitudeRadians) ** constants.n;
  const originLatitude = center.lat * radians;
  const originRho = constants.semiMajorAxis * constants.f * constants.t(originLatitude) ** constants.n;
  const angle = constants.n * (longitude * radians - centralMeridian);
  return { x: rho * Math.sin(angle), y: originRho - rho * Math.cos(angle) };
}

function bullseyeOffsetToGeo(bearing, distance) {
  const origin = state.settings.bullseye;
  const radians = (bearing * Math.PI) / 180;
  const lat = origin.lat + (distance * Math.cos(radians)) / 60;
  const lon = origin.lon + (distance * Math.sin(radians)) / (60 * Math.cos((origin.lat * Math.PI) / 180));
  return { lat, lon };
}

function geoToBullseyeOffset(lat, lon) {
  const origin = state.settings.bullseye;
  const latDelta = (lat - origin.lat) * 60;
  const lonDelta = (lon - origin.lon) * 60 * Math.cos((origin.lat * Math.PI) / 180);
  const distance = Math.hypot(latDelta, lonDelta);
  const bearing = (Math.atan2(lonDelta, latDelta) * 180) / Math.PI + 360;
  return { bearing: bearing % 360, distance };
}

function getStaticItemCoordinates(item) {
  if (Number.isFinite(item.lat) && Number.isFinite(item.lon)) {
    return { lat: item.lat, lon: item.lon };
  }

  const center = state.settings.mapCenter;
  return {
    lat: center.lat + ((50 - (item.y ?? 50)) / 100) * MAP_VIEW_SPAN.lat,
    lon: center.lon + (((item.x ?? 50) - 50) / 100) * MAP_VIEW_SPAN.lon,
  };
}

function setSettingsStatus(message) {
  elements.settingsStatus.textContent = message;
}

function toggleSettings(open) {
  elements.settingsModal.classList.toggle('hidden', !open);
  elements.settingsModal.setAttribute('aria-hidden', String(!open));
}

function getGridIntervalMinutes(latitudeSpan, longitudeSpan) {
  const span = Math.max(latitudeSpan, longitudeSpan);
  if (span >= 12) return 60;
  if (span >= 6) return 30;
  if (span >= 2) return 15;
  if (span >= 0.75) return 5;
  return 1;
}

function formatGridCoordinate(value, axis) {
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = Math.round((absolute - degrees) * 60);
  const normalizedDegrees = minutes >= 60 ? degrees + 1 : degrees;
  const normalizedMinutes = minutes >= 60 ? 0 : minutes;
  const hemisphere = axis === 'lat'
    ? (value < 0 ? 'S' : 'N')
    : (value < 0 ? 'W' : 'E');
  return `${String(normalizedDegrees).padStart(axis === 'lat' ? 2 : 3, '0')}°${String(normalizedMinutes).padStart(2, '0')}′${hemisphere}`;
}

function drawGeographicGrid(width, height) {
  const grid = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const rect = elements.svg.getBoundingClientRect();
  const topLeft = screenPointToMapPosition(rect.left, rect.top);
  const bottomRight = screenPointToMapPosition(rect.right, rect.bottom);
  const topLeftGeo = mapPositionToGeo(topLeft.x, topLeft.y);
  const bottomRightGeo = mapPositionToGeo(bottomRight.x, bottomRight.y);
  const minLat = Math.min(topLeftGeo.lat, bottomRightGeo.lat);
  const maxLat = Math.max(topLeftGeo.lat, bottomRightGeo.lat);
  const minLon = Math.min(topLeftGeo.lon, bottomRightGeo.lon);
  const maxLon = Math.max(topLeftGeo.lon, bottomRightGeo.lon);
  const intervalMinutes = getGridIntervalMinutes(maxLat - minLat, maxLon - minLon);
  const interval = intervalMinutes / 60;
  const firstLat = Math.ceil(minLat / interval) * interval;
  const firstLon = Math.ceil(minLon / interval) * interval;

  for (let lat = firstLat; lat <= maxLat + interval / 2; lat += interval) {
    const position = geoToMapPosition(lat, state.settings.mapCenter.lon);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0');
    line.setAttribute('x2', String(width));
    line.setAttribute('y1', String(position.y * 7));
    line.setAttribute('y2', String(position.y * 7));
    line.setAttribute('class', 'grid-line');
    grid.appendChild(line);
  }

  for (let lon = firstLon; lon <= maxLon + interval / 2; lon += interval) {
    const position = geoToMapPosition(state.settings.mapCenter.lat, lon);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', String(position.x * 10));
    line.setAttribute('x2', String(position.x * 10));
    line.setAttribute('y1', '0');
    line.setAttribute('y2', String(height));
    line.setAttribute('class', 'grid-line');
    grid.appendChild(line);
  }
  return grid;
}

function updateGridEdgeLabels(width, height) {
  let labels = document.getElementById('gridEdgeLabels');
  if (!labels) {
    labels = document.createElement('div');
    labels.id = 'gridEdgeLabels';
    labels.className = 'grid-edge-overlay';
    document.body.appendChild(labels);
  }
  labels.innerHTML = '';

  const rect = elements.svg.getBoundingClientRect();
  const topLeft = screenPointToMapPosition(rect.left, rect.top);
  const bottomRight = screenPointToMapPosition(rect.right, rect.bottom);
  const topLeftGeo = mapPositionToGeo(topLeft.x, topLeft.y);
  const bottomRightGeo = mapPositionToGeo(bottomRight.x, bottomRight.y);
  const minLat = Math.min(topLeftGeo.lat, bottomRightGeo.lat);
  const maxLat = Math.max(topLeftGeo.lat, bottomRightGeo.lat);
  const minLon = Math.min(topLeftGeo.lon, bottomRightGeo.lon);
  const maxLon = Math.max(topLeftGeo.lon, bottomRightGeo.lon);
  const interval = getGridIntervalMinutes(maxLat - minLat, maxLon - minLon) / 60;
  const firstLat = Math.ceil(minLat / interval) * interval;
  const firstLon = Math.ceil(minLon / interval) * interval;
  for (let lat = firstLat; lat <= maxLat + interval / 2; lat += interval) {
    const position = geoToMapPosition(lat, state.settings.mapCenter.lon);
    const point = elements.svg.createSVGPoint();
    point.x = 0;
    point.y = position.y * 7;
    const screen = point.matrixTransform(mapInteraction.viewport.getScreenCTM());
    const label = document.createElement('span');
    label.style.left = `${rect.left + 4}px`;
    label.style.top = `${screen.y - 10}px`;
    label.setAttribute('class', 'grid-label');
    label.textContent = formatGridCoordinate(lat, 'lat');
    labels.appendChild(label);
  }

  for (let lon = firstLon; lon <= maxLon + interval / 2; lon += interval) {
    const position = geoToMapPosition(state.settings.mapCenter.lat, lon);
    const point = elements.svg.createSVGPoint();
    point.x = position.x * 10;
    point.y = height;
    const screen = point.matrixTransform(mapInteraction.viewport.getScreenCTM());
    const label = document.createElement('span');
    label.style.left = `${screen.x + 4}px`;
    label.style.top = `${rect.bottom - 22}px`;
    label.setAttribute('class', 'grid-label');
    label.textContent = formatGridCoordinate(lon, 'lon');
    labels.appendChild(label);
  }
}

function renderMap() {
  updateDynamicWarnings();
  elements.svg.innerHTML = '';
  elements.svg.style.setProperty('--display-scale', String(getDisplayScale()));

  const viewport = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  viewport.setAttribute('id', 'mapViewport');
  mapInteraction.viewport = viewport;
  elements.svg.appendChild(viewport);

  const dynamicRangeOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  dynamicRangeOverlay.setAttribute('id', 'dynamicRangeOverlay');
  dynamicRangeOverlay.setAttribute('pointer-events', 'visibleStroke');
  mapInteraction.dynamicRangeOverlay = dynamicRangeOverlay;

  const width = 1000;
  const height = 700;

  const grid = drawGeographicGrid(width, height);
  viewport.appendChild(grid);
  drawBullseyeMarker();

  if (state.basicVisible) {
    drawBasicLayer();
  }

  if (state.staticVisible) {
    drawLayer('static');
  }

  if (state.dynamicVisible) {
    drawLayer('dynamic');
  }

  drawStaticLinePreview();

  viewport.appendChild(dynamicRangeOverlay);

  drawSelfMarker();
  drawHookLocator();
  updateGridEdgeLabels(width, height);
  applyMapTransform();
  updateSelectedInfo();
  updateSelfInfoDisplay();
}

function setupMapInteraction() {
  const cancelLongPressTimer = () => {
    if (longPressTimer) {
      window.clearTimeout(longPressTimer);
      longPressTimer = null;
    }
  };

  elements.svg.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    showMapActionMenu(event.clientX, event.clientY);
  });
  elements.svg.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') {
      activeTouchPointers.add(event.pointerId);
      if (activeTouchPointers.size > 1) {
        cancelLongPressTimer();
        return;
      }
      longPressTimer = window.setTimeout(() => showMapActionMenu(event.clientX, event.clientY), 550);
    }
  }, true);
  elements.svg.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch' && activeTouchPointers.size > 1) {
      cancelLongPressTimer();
      return;
    }
    cancelLongPressTimer();
  }, true);
  elements.svg.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch') {
      activeTouchPointers.delete(event.pointerId);
    }
    cancelLongPressTimer();
  }, true);
  elements.svg.addEventListener('pointercancel', (event) => {
    if (event.pointerType === 'touch') {
      activeTouchPointers.delete(event.pointerId);
    }
    cancelLongPressTimer();
  }, true);
  elements.svg.addEventListener('click', (event) => {
    if (seadSelectionMode) {
      const marker = event.target.closest('.marker');
      const item = marker ? state.dynamic.find((entry) => entry.id === marker.dataset.id) : null;
      if (item) {
        event.preventDefault();
        event.stopImmediatePropagation();
        launchSeadHarm(item);
      }
      return;
    }
    if ((hookMode !== 'hook' && hookMode !== 'hook2') || mapPickTarget) return;
    let target = getHookScreenTarget(event.clientX, event.clientY);
    if (!target) {
      const position = screenPointToMapPosition(event.clientX, event.clientY);
      target = getDynamicRangeHookTarget(mapPositionToGeo(position.x, position.y));
    }
    if (!target && hookMode === 'hook2') {
      const position = screenPointToMapPosition(event.clientX, event.clientY);
      const coordinates = snapToDynamicRange(mapPositionToGeo(position.x, position.y));
      const snappedPosition = geoToMapPosition(coordinates.lat, coordinates.lon);
      addHook2Target({
        id: `hook2-point-${Date.now()}`,
        name: formatCoordinatePair(coordinates.lat, coordinates.lon),
        x: snappedPosition.x,
        y: snappedPosition.y,
        lat: coordinates.lat,
        lon: coordinates.lon,
      });
      return;
    }
    if (!target) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if (hookMode === 'hook2') {
      addHook2Target(target);
    } else {
      selectHookTarget(target);
    }
  }, true);
  elements.svg.addEventListener('click', handleMapCoordinatePick);

  elements.svg.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (event.pointerType === 'touch' && mapPickTarget === 'staticLinePoints') {
      staticLineTouchStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
      elements.svg.setPointerCapture(event.pointerId);
      return;
    }
    elements.svg.setPointerCapture(event.pointerId);
    mapInteraction.pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

    if (mapInteraction.pointers.size === 1) {
      mapInteraction.lastPoint = { x: event.clientX, y: event.clientY };
    } else if (mapInteraction.pointers.size >= 2) {
      const points = [...mapInteraction.pointers.values()];
      mapInteraction.pinchDistance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      mapInteraction.pinchScaleStart = mapInteraction.scale;
      const midpoint = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
      };
      const svgPoint = elements.svg.createSVGPoint();
      svgPoint.x = midpoint.x;
      svgPoint.y = midpoint.y;
      const localPoint = svgPoint.matrixTransform(elements.svg.getScreenCTM().inverse());
      mapInteraction.pinchMapAnchor = {
        x: (localPoint.x - mapInteraction.panX) / mapInteraction.scale,
        y: (localPoint.y - mapInteraction.panY) / mapInteraction.scale,
      };
    }
  });

  elements.svg.addEventListener('pointermove', (event) => {
    updateCursorCoordinates(event.clientX, event.clientY);
    if (!mapInteraction.pointers.has(event.pointerId)) return;

    const previous = mapInteraction.pointers.get(event.pointerId);
    const next = { x: event.clientX, y: event.clientY };
    mapInteraction.pointers.set(event.pointerId, next);

    if (mapInteraction.pointers.size === 1 && mapInteraction.lastPoint) {
      const dx = next.x - mapInteraction.lastPoint.x;
      const dy = next.y - mapInteraction.lastPoint.y;
      mapInteraction.panX += dx;
      mapInteraction.panY += dy;
      mapInteraction.lastPoint = next;
      applyMapTransform();
    }

    if (mapInteraction.pointers.size >= 2) {
      const points = [...mapInteraction.pointers.values()];
      const distance = Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y);
      if (mapInteraction.pinchDistance > 0) {
        const ratio = distance / mapInteraction.pinchDistance;
        mapInteraction.scale = clampNumber(mapInteraction.pinchScaleStart * ratio, 0.25, MAP_MAX_SCALE);
        const midpoint = {
          x: (points[0].x + points[1].x) / 2,
          y: (points[0].y + points[1].y) / 2,
        };
        const svgPoint = elements.svg.createSVGPoint();
        svgPoint.x = midpoint.x;
        svgPoint.y = midpoint.y;
        const localPoint = svgPoint.matrixTransform(elements.svg.getScreenCTM().inverse());
        if (mapInteraction.pinchMapAnchor) {
          mapInteraction.panX = localPoint.x - mapInteraction.pinchMapAnchor.x * mapInteraction.scale;
          mapInteraction.panY = localPoint.y - mapInteraction.pinchMapAnchor.y * mapInteraction.scale;
        }
        applyMapTransform();
      }
    }
  });

  elements.svg.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch' && mapPickTarget === 'staticLinePoints' && staticLineTouchStart?.pointerId === event.pointerId) {
      const distance = Math.hypot(event.clientX - staticLineTouchStart.x, event.clientY - staticLineTouchStart.y);
      staticLineTouchStart = null;
      if (distance <= 12) {
        suppressNextMapPickClick = true;
        handleMapCoordinatePick(event);
      }
      if (elements.svg.hasPointerCapture(event.pointerId)) elements.svg.releasePointerCapture(event.pointerId);
      return;
    }
    mapInteraction.pointers.delete(event.pointerId);
    if (mapInteraction.pointers.size < 2) {
      mapInteraction.pinchDistance = 0;
      mapInteraction.pinchScaleStart = mapInteraction.scale;
      mapInteraction.pinchMapAnchor = null;
    }
    if (mapInteraction.pointers.size === 1) {
      mapInteraction.lastPoint = [...mapInteraction.pointers.values()][0];
    }
  });

  elements.svg.addEventListener('pointercancel', (event) => {
    if (event.pointerType === 'touch' && staticLineTouchStart?.pointerId === event.pointerId) staticLineTouchStart = null;
    mapInteraction.pointers.delete(event.pointerId);
    mapInteraction.lastPoint = null;
  });

  elements.svg.addEventListener('wheel', (event) => {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1 / MAP_ZOOM_FACTOR : MAP_ZOOM_FACTOR;
    zoomMapAt(event.clientX, event.clientY, mapInteraction.scale * factor);
  }, { passive: false });
}

function drawStaticLinePreview() {
  if (mapPickTarget !== 'staticLinePoints') return;
  const points = getStaticLinePointsFromForm();
  if (points.length < 2) return;
  const preview = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const displayPoints = points.map((point) => geoToMapPosition(point.lat, point.lon));
  preview.setAttribute('d', displayPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * 10} ${point.y * 7}`).join(' '));
  preview.setAttribute('class', 'static-line-preview');
  preview.setAttribute('fill', 'none');
  preview.setAttribute('stroke', getReadableLineColor(elements.staticLayerLineColor.value || '#60a5fa'));
  preview.setAttribute('stroke-width', getAdaptiveStrokeWidth(clampNumber(Number(elements.staticLayerLineWidth.value), 1, 5, 2)));
  const dashPatterns = { solid: 'none', dashed: '14 8', dotted: '2 8' };
  preview.setAttribute('stroke-dasharray', dashPatterns[elements.staticLayerLineStyle.value] || dashPatterns.solid);
  preview.setAttribute('vector-effect', 'non-scaling-stroke');
  preview.setAttribute('pointer-events', 'none');
  mapInteraction.viewport.appendChild(preview);
}

function getHookScreenTarget(clientX, clientY) {
  const mapPoint = screenPointToMapPosition(clientX, clientY);
  const selfPosition = state.self.gpsAvailable === true && Number.isFinite(state.self.lat) && Number.isFinite(state.self.lon)
    ? geoToMapPosition(state.self.lat, state.self.lon)
    : { x: 50, y: 50 };
  const bullseyePosition = getBullseyeMapPosition();
  const mapToScreen = (position) => {
    const point = elements.svg.createSVGPoint();
    point.x = position.x * 10;
    point.y = position.y * 7;
    const screen = point.matrixTransform(mapInteraction.viewport.getScreenCTM());
    return { x: screen.x, y: screen.y };
  };
  const candidates = [
    { id: 'self', kind: 'self', name: '自機', position: selfPosition },
    { id: 'bullseye', kind: 'bullseye', name: 'B/E', position: bullseyePosition },
  ].map((candidate) => {
    const screen = mapToScreen(candidate.position);
    return { ...candidate, distance: Math.hypot(screen.x - clientX, screen.y - clientY) };
  }).filter((candidate) => candidate.distance <= 24)
    .sort((first, second) => first.distance - second.distance);
  if (candidates.length) {
    const target = candidates[0];
    return { id: target.id, kind: target.kind, name: target.name, x: target.position.x, y: target.position.y };
  }

  const elementsAtPoint = document.elementsFromPoint(clientX, clientY);
  const screenCandidates = elementsAtPoint
    .map((node) => ({ node, layer: node.dataset?.layer, id: node.dataset?.id }))
    .filter(({ layer, id }) => id && ['basic', 'static', 'dynamic'].includes(layer));
  const priority = { static: 0, basic: 1, dynamic: 2 };
  screenCandidates.sort((first, second) => priority[first.layer] - priority[second.layer]);
  const candidate = screenCandidates[0];
  if (!candidate) return null;
  const item = state[candidate.layer].find((entry) => entry.id === candidate.id);
  if (!item) return null;
  return createObjectHookTarget(item, candidate.layer);
}

function getItemMapPosition(item) {
  if (Number.isFinite(item.lat) && Number.isFinite(item.lon)) return geoToMapPosition(item.lat, item.lon);
  return { x: item.x ?? 50, y: item.y ?? 50 };
}

function updateCursorCoordinates(clientX, clientY) {
  const mapPoint = screenPointToMapPosition(clientX, clientY);
  const geo = mapPositionToGeo(mapPoint.x, mapPoint.y);
  const system = elements.coordinateSystem.value || state.settings.coordSystem || 'DDMM.MMM';
  if (system === 'MGRS' || system === 'GARS') {
    elements.cursorLatitude.textContent = formatCoordinatePair(geo.lat, geo.lon, system);
    elements.cursorLongitude.textContent = '';
  } else {
    elements.cursorLatitude.textContent = system === 'DDMMSS' ? formatDdmmss(geo.lat, 'lat') : formatDdmmm(geo.lat, 'lat');
    elements.cursorLongitude.textContent = system === 'DDMMSS' ? formatDdmmss(geo.lon, 'lon') : formatDdmmm(geo.lon, 'lon');
  }
}

function startMapPick(target) {
  mapPickTarget = target;
  mapPickReturnPanel = target === 'static' ? managedLayer : null;
  if (target === 'staticLinePoints') {
    mapPickReturnPanel = managedLayer;
    mapPickFormValues = {};
    document.querySelectorAll('#staticLayerForm input, #staticLayerForm select').forEach((field) => {
      mapPickFormValues[field.id] = field.value;
    });
    setSettingsStatus('MAPをクリックして線の地点を追加してください（Enterで完了、最大50点）');
  } else {
    setSettingsStatus('MAP上の位置をタップしてください');
  }
  toggleSettings(false);
}

function handleMapCoordinatePick(event) {
  if (suppressNextMapPickClick) {
    suppressNextMapPickClick = false;
    return;
  }
  if (hookMode === 'hook2' && !mapPickTarget) {
    const mapPoint = screenPointToMapPosition(event.clientX, event.clientY);
    const geo = mapPositionToGeo(mapPoint.x, mapPoint.y);
    addHook2Target({
      id: `hook2-point-${Date.now()}`,
      name: formatCoordinatePair(geo.lat, geo.lon),
      x: mapPoint.x,
      y: mapPoint.y,
    });
    return;
  }
  if (!mapPickTarget) return;
  if (mapPickTarget !== 'basicDisplayRange' && event.target.closest('.marker, .base-icon, .hook-locator, .bullseye-marker')) return;

  const mapPoint = screenPointToMapPosition(event.clientX, event.clientY);
  const geo = mapPositionToGeo(mapPoint.x, mapPoint.y);

  if (mapPickTarget === 'basicDisplayRange') {
    basicDisplayRangePoints.push([mapPoint.x, mapPoint.y]);
    if (basicDisplayRangePoints.length < 4) {
      setSettingsStatus(`表示範囲の${basicDisplayRangePoints.length}点目を取得しました（${basicDisplayRangePoints.length + 1}/4）`);
      return;
    }
    mapPickTarget = null;
    toggleSettings(true);
    showBasicLayerPanel();
    applyBasicDisplayRange();
    return;
  }

  if (mapPickTarget === 'bullseye' || mapPickTarget === 'mapCenter' || mapPickTarget === 'selfPosition') {
    if (mapPickTarget === 'selfPosition') {
      state.self.lat = geo.lat;
      state.self.lon = geo.lon;
      state.self.gpsAvailable = true;
      state.self.x = mapPoint.x;
      state.self.y = mapPoint.y;
      saveState();
      updateSettingsFields();
      renderMap();
      setSettingsStatus('自機模擬の開始位置をMAPから設定しました');
    } else {
      const target = mapPickTarget === 'bullseye' ? state.settings.bullseye : state.settings.mapCenter;
    target.lat = geo.lat;
    target.lon = geo.lon;
    if (mapPickTarget === 'mapCenter') syncSelfToMapCenterIfNoGps();
    saveState();
    updateSettingsFields();
    renderMap();
    setSettingsStatus(`${mapPickTarget === 'bullseye' ? 'B/E位置' : 'mapセンター'}をMAPから設定しました`);
    }
  }

  if (mapPickTarget === 'static' || mapPickTarget === 'staticLinePoints') {
    if (mapPickTarget === 'staticLinePoints') {
      const points = getStaticLinePointsFromForm();
      if (points.length >= 50) {
        setSettingsStatus('線の地点は最大50点です。Enterで完了してください');
        return;
      }
      points.push(geo);
      setStaticLinePointsInForm(points);
      if (mapPickFormValues) mapPickFormValues.staticLayerLinePoints = elements.staticLayerLinePoints.value;
      renderMap();
      setSettingsStatus(`線の地点を追加しました（${points.length} / 50）。続けてMAPをクリック、Enterで完了`);
      return;
    } else if (elements.staticLayerCoordSystem.value === 'BE') {
      const relative = geoToBullseyeOffset(geo.lat, geo.lon);
      elements.staticLayerBeBearing.value = toMagneticBearing(relative.bearing).toFixed(1);
      elements.staticLayerBeDistance.value = relative.distance.toFixed(1);
      setSettingsStatus('静的オブジェクト位置をMAPから入力しました');
    } else {
      elements.staticLayerLat.value = formatDdmmm(geo.lat, 'lat');
      elements.staticLayerLon.value = formatDdmmm(geo.lon, 'lon');
      setSettingsStatus('静的オブジェクト位置をMAPから入力しました');
    }
  }

  mapPickTarget = null;
  toggleSettings(true);
  if (mapPickReturnPanel === 'static' || mapPickReturnPanel === 'dynamic') {
    setActiveSettingsButton(document.querySelector(`[data-layer-target="${mapPickReturnPanel}"]`));
    hideSettingsPanels();
    if (mapPickReturnPanel === 'static') showStaticLayerPanel();
    else showDynamicLayerPanel();
    if (mapPickFormValues) {
      openStaticLayerEditor();
      Object.entries(mapPickFormValues).forEach(([id, value]) => {
        const field = document.getElementById(id);
        if (field) field.value = value;
      });
      elements.staticLayerType.value = mapPickFormValues.staticLayerType || 'line';
      updateStaticCoordinateFields();
    }
  }
  mapPickReturnPanel = null;
  mapPickFormValues = null;
}

function screenPointToMapPosition(clientX, clientY) {
  const point = elements.svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const svgPoint = point.matrixTransform(elements.svg.getScreenCTM().inverse());
  const viewportX = (svgPoint.x - mapInteraction.panX) / mapInteraction.scale;
  const viewportY = (svgPoint.y - mapInteraction.panY) / mapInteraction.scale;
  return {
    x: clampNumber(viewportX / 10, 0, 100, 50),
    y: clampNumber(viewportY / 7, 0, 100, 50),
  };
}

function applyMapTransform() {
  if (!mapInteraction.viewport) return;
  const transform = `translate(${mapInteraction.panX} ${mapInteraction.panY}) scale(${mapInteraction.scale})`;
  mapInteraction.viewport.setAttribute('transform', transform);
  updateAnnotationTransforms();
  updateGridEdgeLabels(1000, 700);
  updateScaleBar();
}

function centerMapOnSelf() {
  if (gpsWatchId !== null) {
    stopGpsTracking();
    return;
  }
  const position = state.self.gpsAvailable === true && Number.isFinite(state.self.lat) && Number.isFinite(state.self.lon)
    ? geoToMapPosition(state.self.lat, state.self.lon)
    : { x: 50, y: 50 };
  mapInteraction.panX = 500 - position.x * 10 * mapInteraction.scale;
  mapInteraction.panY = 350 - position.y * 7 * mapInteraction.scale;
  applyMapTransform();
  if (gpsWatchId === null) {
    centerOnNextGpsPosition = true;
    toggleGpsTracking();
  }
  setSettingsStatus('自機位置を画面中央に表示しました');
}

function zoomMapAt(clientX, clientY, requestedScale) {
  const nextScale = clampNumber(requestedScale, 0.25, MAP_MAX_SCALE, mapInteraction.scale);
  if (nextScale === mapInteraction.scale) return;

  const point = elements.svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const svgPoint = point.matrixTransform(elements.svg.getScreenCTM().inverse());
  const mapX = (svgPoint.x - mapInteraction.panX) / mapInteraction.scale;
  const mapY = (svgPoint.y - mapInteraction.panY) / mapInteraction.scale;
  mapInteraction.scale = nextScale;
  mapInteraction.panX = svgPoint.x - mapX * nextScale;
  mapInteraction.panY = svgPoint.y - mapY * nextScale;
  applyMapTransform();
}

function updateAnnotationTransforms() {
  const mapScale = clampNumber(Number(mapInteraction.scale), 0.25, MAP_MAX_SCALE, 1);
  const scale = getAnnotationScale() / mapScale;
  const inverseMapScale = 1 / mapScale;
  document.querySelectorAll('#mapViewport .marker-group, #mapViewport .self-marker, #mapViewport .bullseye-marker').forEach((node) => {
    const x = Number(node.dataset.anchorX);
    const y = Number(node.dataset.anchorY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    const annotationScale = node.classList.contains('bullseye-marker') ? inverseMapScale : scale;
    node.setAttribute('transform', `translate(${x} ${y}) scale(${annotationScale}) translate(${-x} ${-y})`);
  });
}

function updateScaleBar() {
  if (!elements.scaleBarFill || !elements.scaleBarLabel || !elements.svg) return;
  const rect = elements.svg.getBoundingClientRect();
  if (!rect.width) return;

  const latitude = state.settings.mapCenter.lat;
  const nauticalMilesPerMapUnit = (MAP_VIEW_SPAN.lon * 60) / 1000;
  const pixelsPerNm = mapInteraction.scale * (rect.width / 1000) / nauticalMilesPerMapUnit;
  const candidates = [0.5, 1, 2, 5, 10, 20, 50, 100, 200, 500];
  const distance = candidates.reduce((best, candidate) => {
    const bestWidth = best * pixelsPerNm;
    const candidateWidth = candidate * pixelsPerNm;
    if (candidateWidth <= 180 && candidateWidth > bestWidth) return candidate;
    return best;
  }, candidates[0]);
  const width = Math.max(24, distance * pixelsPerNm);

  elements.scaleBarFill.style.width = `${width}px`;
  elements.scaleBarLabel.textContent = `${distance} nm`;
}

function mapPositionToGeo(x, y) {
  return mapPositionToGeoForCenter(state.settings.mapCenter, x, y);
}

function inverseLambert(projectedX, projectedY) {
  const center = state.settings.mapCenter;
  const constants = getLambertConstants();
  const radians = Math.PI / 180;
  const originLatitude = center.lat * radians;
  const originRho = constants.semiMajorAxis * constants.f * constants.t(originLatitude) ** constants.n;
  const rho = Math.sign(constants.n) * Math.hypot(projectedX, originRho - projectedY);
  const angle = Math.atan2(projectedX, originRho - projectedY);
  const tValue = (rho / (constants.semiMajorAxis * constants.f)) ** (1 / constants.n);
  let latitude = Math.PI / 2 - 2 * Math.atan(tValue);
  for (let iteration = 0; iteration < 8; iteration += 1) {
    latitude = Math.PI / 2 - 2 * Math.atan(tValue * ((1 - constants.eccentricity * Math.sin(latitude)) / (1 + constants.eccentricity * Math.sin(latitude))) ** (constants.eccentricity / 2));
  }
  return {
    lat: latitude / radians,
    lon: center.lon + (angle / constants.n) / radians,
  };
}

function drawBasicLayer() {
  const layer = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  layer.setAttribute('data-layer', 'basic');

  state.basic.forEach((item) => {
    if (item.visible === false) return;

    if (item.type === 'airspace') {
      const displayPoints = getBasicDisplayPoints(item);
      const safePoints = displayPoints.length
        ? displayPoints
        : [[20, 18], [40, 24], [60, 20], [70, 38], [52, 58], [28, 48]];

      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const points = safePoints.map(([px, py]) => `${px * 10},${py * 7}`).join(' ');
      polygon.setAttribute('points', points);
      polygon.setAttribute('fill', item.fill || 'rgba(0,0,0,0.03)');
      polygon.setAttribute('stroke', '#000000');
      polygon.setAttribute('stroke-width', getAdaptiveStrokeWidth(2));
      addBasicObjectInteraction(polygon, item, getBasicTargetPosition(item, safePoints));
      layer.appendChild(polygon);

      if (item.displayNameVisible !== false) {
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        const labelText = item.displayName || item.name;
        const labelLayout = getBasicLabelLayout(safePoints, labelText);
        label.setAttribute('x', String(labelLayout.x));
        label.setAttribute('y', String(labelLayout.y));
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('dominant-baseline', 'middle');
        label.setAttribute('fill', '#000000');
        label.style.fontSize = `${labelLayout.fontSize}px`;
        label.textContent = labelText;
        addBasicObjectInteraction(label, item, getBasicTargetPosition(item, safePoints));
        layer.appendChild(label);
      }
    }

    if (item.type === 'base') {
      const position = getBasicGeometryPoints(item)[0];
      if (!position) return;
      const [x, y] = position;
      const wrapper = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      wrapper.setAttribute('class', 'base-icon');
      const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      const baseScale = getSymbolDrawScale();
      circle.setAttribute('cx', x * 10);
      circle.setAttribute('cy', y * 7);
      circle.setAttribute('r', String(24 * baseScale));
      circle.setAttribute('fill', 'rgba(0,0,0,0.03)');
      circle.setAttribute('stroke', '#000000');
      wrapper.appendChild(circle);
      const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      polygon.setAttribute('points', `${x * 10},${y * 7 - 16 * baseScale} ${x * 10 + 18 * baseScale},${y * 7 + 12 * baseScale} ${x * 10 - 18 * baseScale},${y * 7 + 12 * baseScale}`);
      polygon.setAttribute('fill', 'rgba(0,0,0,0.03)');
      polygon.setAttribute('stroke', '#000000');
      wrapper.appendChild(polygon);
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', x * 10 - 22 * baseScale);
      text.setAttribute('y', y * 7 + 42 * baseScale);
      text.setAttribute('fill', '#000000');
      text.textContent = item.name;
      wrapper.appendChild(text);
      addBasicObjectInteraction(wrapper, item, { x, y });
      layer.appendChild(wrapper);
    }

    if (item.type === 'route') {
      const displayPoints = getBasicDisplayPoints(item);
      if (!displayPoints.length) return;
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const d = displayPoints.map(([px, py], idx) => `${idx === 0 ? 'M' : 'L'} ${px * 10} ${py * 7}`).join(' ');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', '#000000');
      path.setAttribute('stroke-width', getAdaptiveStrokeWidth(2));
      path.setAttribute('stroke-dasharray', '12 10');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      addBasicObjectInteraction(path, item, getBasicTargetPosition(item, displayPoints));
      layer.appendChild(path);
    }
  });

  mapInteraction.viewport.appendChild(layer);
}

function getBasicLabelLayout(points, text) {
  const xs = points.map(([x]) => x * 10);
  const ys = points.map(([, y]) => y * 7);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const displayScale = getSymbolDrawScale();
  const maxFontSize = 12 * displayScale;
  const widthFit = width * 0.82 / Math.max(1, String(text).length * 0.62);
  const heightFit = height * 0.24;
  return {
    x: centerX,
    y: centerY,
    fontSize: clampNumber(Math.min(maxFontSize, widthFit, heightFit), 6, maxFontSize),
  };
}

function getBasicTargetPosition(item, points = []) {
  if (Number.isFinite(item.x) && Number.isFinite(item.y)) return { x: item.x, y: item.y };
  const safePoints = points.filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (!safePoints.length) return { x: 50, y: 50 };
  const sum = safePoints.reduce((result, [x, y]) => ({ x: result.x + x, y: result.y + y }), { x: 0, y: 0 });
  return { x: sum.x / safePoints.length, y: sum.y / safePoints.length };
}

function addBasicObjectInteraction(node, item, position) {
  node.addEventListener('click', (event) => {
    event.stopPropagation();
    if (mapPickTarget === 'basicDisplayRange') {
      handleMapCoordinatePick(event);
      return;
    }
    handleMapObjectClick(item, 'basic', position);
  });
}

function addHook2Target(target) {
  const targets = hook2WindowTargets.get(activeHookWindowKey) || [];
  if (hookMode !== 'hook2' || targets.length >= 2) return;
  targets.push(target);
  hook2WindowTargets.set(activeHookWindowKey, targets);
  if (targets.length >= 2) hookMode = false;
  if (hookMode !== 'hook2') elements.svg.removeAttribute('data-hook-selecting');
  updateFeatureWindows();
  renderMap();
  setSettingsStatus(`2点HOOK: ${targets.length}/2 個を選択`);
}

function drawLayer(layerName) {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('data-layer', layerName);

  state[layerName].forEach((item) => {
    if (item.visible === false) return;
    if (item.type === 'line') {
      const line = createLineNode(item, layerName);
      if (line) group.appendChild(line);
      return;
    }
    const node = createMarkerNode(item, layerName);
    if (node) {
      group.appendChild(node);
    }
  });

  mapInteraction.viewport.appendChild(group);
}

function createLineNode(item, layerName) {
  const linePoints = Array.isArray(item.linePoints) && item.linePoints.length
    ? item.linePoints
    : item.start && item.end ? [item.start, item.end] : [];
  if (linePoints.length < 2) return null;
  const displayPoints = linePoints.map((point) => geoToMapPosition(point.lat, point.lon));
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  line.setAttribute('d', displayPoints.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x * 10} ${point.y * 7}`).join(' '));
  line.setAttribute('class', `static-line ${item.type}`);
  line.setAttribute('data-layer', layerName);
  line.setAttribute('data-id', item.id);
  line.setAttribute('fill', 'none');
  line.setAttribute('stroke', getReadableLineColor(item.lineColor || getSymbolColor(item.type)));
  line.setAttribute('stroke-width', getAdaptiveStrokeWidth(clampNumber(Number(item.lineWidth), 1, 5, 2)));
  const dashPatterns = { solid: 'none', dashed: '14 8', dotted: '2 8' };
  line.setAttribute('stroke-dasharray', dashPatterns[item.lineStyle] || dashPatterns.solid);
  line.setAttribute('vector-effect', 'non-scaling-stroke');
  line.setAttribute('stroke-linecap', item.lineStyle === 'dotted' ? 'round' : 'butt');
  addBasicObjectInteraction(line, item, displayPoints[0]);
  return line;
}

function getReadableLineColor(color) {
  const colors = {
    '#60a5fa': '#2563eb',
    '#22c55e': '#15803d',
    '#f97316': '#c2410c',
    '#ef4444': '#b91c1c',
    '#f8fafc': '#cbd5e1',
    '#facc15': '#a16207',
  };
  return colors[String(color).toLowerCase()] || color;
}

function createMarkerNode(item, layerName) {
  const status = String(item.status || 'ACTIVE').toUpperCase();
  const isDestroyed = status === 'DESTROYED';
  const isDown = status === 'DOWN';

  const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const absolutePosition = Number.isFinite(item.lat) && Number.isFinite(item.lon)
    ? geoToMapPosition(item.lat, item.lon)
    : { x: item.x, y: item.y };
  const x = Number.isFinite(absolutePosition.x) ? absolutePosition.x : 50;
  const y = Number.isFinite(absolutePosition.y) ? absolutePosition.y : 50;
  g.dataset.layer = layerName;
  g.dataset.id = item.id;
  g.setAttribute('class', 'marker-group');
  g.dataset.anchorX = String(x * 10);
  g.dataset.anchorY = String(y * 7);

  if (isDestroyed) return g;

  const geometryType = item.geometryType || 'none';
  const dynamicCircles = getDynamicCircleConfig(item);
  const geometryRadius = Number(item.geometryRadius || 0);
  const displayScale = getSymbolDrawScale();
  const geometryRadiusMapUnits = geometryRadius * 100 / (MAP_VIEW_SPAN.lat * 60);
  const dashedRing = isDown ? '6 6' : null;

  if (dynamicCircles.length) {
    const center = getItemGeoCoordinates(item);
    dynamicCircles.forEach((circle) => {
      if (!(circle.radius > 0)) return;
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      ring.setAttribute('d', getGeographicCirclePath(center, circle.radius));
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', getDynamicCircleColor(circle.color));
      ring.setAttribute('stroke-width', getAdaptiveStrokeWidth(1.5));
      ring.setAttribute('class', `dynamic-range-circle ${getSeadCircleClass(item.id)}`.trim());
      const warningKey = `${item.id}-circle-${dynamicCircles.indexOf(circle)}`;
      if (activeDynamicWarnings.has(warningKey)) ring.classList.add('dynamic-range-circle-warning');
      ring.setAttribute('vector-effect', 'non-scaling-stroke');
      ring.dataset.objectId = item.id;
      ring.dataset.circleIndex = String(dynamicCircles.indexOf(circle));
      ring.dataset.centerLat = String(center.lat);
      ring.dataset.centerLon = String(center.lon);
      ring.dataset.radiusNm = String(circle.radius);
      if (dashedRing) ring.setAttribute('stroke-dasharray', dashedRing);
      mapInteraction.dynamicRangeOverlay?.appendChild(ring);
      ring.addEventListener('click', (event) => {
        if (hookMode !== 'hook') return;
        event.preventDefault();
        event.stopPropagation();
        selectHookTarget({
          id: `${item.id}-circle-${Number(ring.dataset.circleIndex) + 1}`,
          kind: 'dynamicRange',
          layer: 'dynamic',
          objectId: item.id,
          circleIndex: Number(ring.dataset.circleIndex),
          name: `${item.name} 円${Number(ring.dataset.circleIndex) + 1}`,
        });
      });
    });
  }

  if (!dynamicCircles.length && geometryType === 'circle' && geometryRadius > 0) {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', x * 10);
    circle.setAttribute('cy', y * 7);
    circle.setAttribute('r', String(geometryRadiusMapUnits * 10));
    circle.setAttribute('fill', 'rgba(148, 163, 184, 0.08)');
    circle.setAttribute('stroke', 'rgba(148, 163, 184, 0.6)');
    circle.setAttribute('stroke-width', getAdaptiveStrokeWidth(1.5));
    if (dashedRing) circle.setAttribute('stroke-dasharray', dashedRing);
    g.appendChild(circle);
  }
  if (layerName !== 'dynamic' && geometryType === 'ring' && geometryRadius > 0) {
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('cx', x * 10);
    ring.setAttribute('cy', y * 7);
    ring.setAttribute('r', String(geometryRadiusMapUnits * 10));
    ring.setAttribute('class', 'threat-ring');
    if (dashedRing) ring.setAttribute('stroke-dasharray', dashedRing);
    g.appendChild(ring);
  }
  if (layerName !== 'dynamic' && geometryType === 'sector' && geometryRadius > 0) {
    const sector = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const startBearing = item.geometryStartBearing ?? item.geometryBearing ?? 0;
    const endBearing = item.geometryEndBearing ?? ((startBearing + 90) % 360);
    sector.setAttribute('d', getSectorPath(x * 10, y * 7, geometryRadiusMapUnits * 10, startBearing, endBearing));
    sector.setAttribute('fill', 'rgba(96, 165, 250, 0.12)');
    sector.setAttribute('stroke', 'rgba(96, 165, 250, 0.75)');
    sector.setAttribute('stroke-width', getAdaptiveStrokeWidth(1.5));
    if (dashedRing) sector.setAttribute('stroke-dasharray', dashedRing);
    g.appendChild(sector);
  }

  if (item.threat && layerName !== 'dynamic') {
    const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    ring.setAttribute('cx', x * 10);
    ring.setAttribute('cy', y * 7);
    ring.setAttribute('r', String(Math.max(18, geometryRadiusMapUnits * 10)));
    ring.setAttribute('class', 'threat-ring');
    if (dashedRing) ring.setAttribute('stroke-dasharray', dashedRing);
    g.appendChild(ring);
  }

  const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const shape = item.symbol || 'circle';
  const symbolSize = (item.type === 'waypoint' ? 12 : 15) * displayScale;
  symbol.setAttribute('d', getSymbolPath(shape, x * 10, y * 7, symbolSize));
  symbol.setAttribute('fill', getSymbolColor(item.type));
  symbol.style.fill = getSymbolColor(item.type);
  symbol.setAttribute('stroke', '#f8fafc');
  symbol.setAttribute('stroke-width', getAdaptiveStrokeWidth(1.8));
  symbol.setAttribute('class', `marker ${item.type} ${selectedId === item.id ? 'selected' : ''}`);
  symbol.setAttribute('data-layer', layerName);
  symbol.setAttribute('data-id', item.id);
  symbol.addEventListener('pointerdown', (event) => {
    event.stopPropagation();
  });
  symbol.addEventListener('pointerup', (event) => {
    event.stopPropagation();
  });
  symbol.addEventListener('click', (event) => {
    event.stopPropagation();
    handleMapObjectClick(item, layerName, { x, y });
  });
  g.appendChild(symbol);

  const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
  label.setAttribute('x', x * 10 + 20 * displayScale);
  label.setAttribute('y', y * 7 - 18 * displayScale);
  label.style.fontSize = `${24 * displayScale}px`;
  label.textContent = item.name;
  g.appendChild(label);

  return g;
}

function handleMapObjectClick(item, layerName, position) {
  if (hookMode === 'hook') {
    const target = createObjectHookTarget(item, layerName);
    selectHookTarget(target);
    return;
  } else if (hookMode === 'hook2') {
    const target = createObjectHookTarget(item, layerName);
    const targets = hook2WindowTargets.get(activeHookWindowKey) || [];
    if (!targets.some((entry) => entry.id === target.id)) {
      addHook2Target(target);
    }
  } else {
    selectedId = item.id;
    selectedLayer = layerName;
    updateSelectedInfo();
  }
  renderMap();
}

function drawSelfMarker() {
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  const selfPosition = state.self.gpsAvailable === true && Number.isFinite(state.self.lat) && Number.isFinite(state.self.lon)
    ? geoToMapPosition(state.self.lat, state.self.lon)
    : { x: 50, y: 50 };
  const { x, y } = selfPosition;
  const displayScale = getSymbolDrawScale();
  const heading = Number(state.self.heading) || 0;
  group.setAttribute('class', 'self-marker');
  group.dataset.anchorX = String(x * 10);
  group.dataset.anchorY = String(y * 7);
  const aircraft = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  const aircraftSize = 1.05 * displayScale;
  aircraft.setAttribute('d', [
    `M 0 ${-25 * aircraftSize}`,
    `L ${10 * aircraftSize} ${11 * aircraftSize}`,
    `L 0 ${7 * aircraftSize}`,
    `L ${-10 * aircraftSize} ${11 * aircraftSize} Z`,
  ].join(' '));
  aircraft.setAttribute('transform', `translate(${x * 10} ${y * 7}) rotate(${heading})`);
  aircraft.setAttribute('class', 'self aircraft-symbol');
  aircraft.setAttribute('fill', '#0b2a5b');
  aircraft.setAttribute('stroke', '#f8fafc');
  aircraft.setAttribute('stroke-width', getAdaptiveStrokeWidth(1.8));
  aircraft.setAttribute('stroke-linejoin', 'round');
  group.appendChild(aircraft);

  const positionPoint = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  positionPoint.setAttribute('cx', x * 10);
  positionPoint.setAttribute('cy', y * 7);
  positionPoint.setAttribute('r', String(3.5 * displayScale));
  positionPoint.setAttribute('fill', '#ffffff');
  positionPoint.setAttribute('stroke', '#0b2a5b');
  positionPoint.setAttribute('stroke-width', getAdaptiveStrokeWidth(1));
  positionPoint.setAttribute('class', 'self-position-point');
  group.appendChild(positionPoint);

  mapInteraction.viewport.appendChild(group);
}

function updateSelfSimulationMap() {
  updateDynamicWarnings();
  document.querySelectorAll('#mapViewport .self-marker, #mapViewport .hook-locator, #mapViewport .hook2-locator').forEach((node) => node.remove());
  drawSelfMarker();
  drawHookLocator();
  updateAnnotationTransforms();
}

function updateDynamicWarnings() {
  const previousWarnings = new Set(activeDynamicWarnings.keys());
  const nextWarnings = new Map();
  const selfCoordinates = state.self.gpsAvailable === true && Number.isFinite(state.self.lat) && Number.isFinite(state.self.lon)
    ? { lat: state.self.lat, lon: state.self.lon }
    : null;

  if (selfCoordinates && state.self.enabled !== false) {
    state.dynamic.forEach((item) => {
      if (item.visible === false || String(item.status || 'ACTIVE').toUpperCase() !== 'ACTIVE') return;
      const center = getItemGeoCoordinates(item);
      const distance = getGeoDistance(center, selfCoordinates);
      getDynamicCircleConfig(item).forEach((circle, circleIndex) => {
        if (circle.color !== 'red' || distance > circle.radius) return;
        const key = `${item.id}-circle-${circleIndex}`;
        nextWarnings.set(key, {
          name: item.name || item.id,
          objectId: item.id,
          colorClass: getSeadCircleClass(item.id) || 'dynamic-warning-normal',
          enteredAt: activeDynamicWarnings.get(key)?.enteredAt || Date.now(),
        });
      });
    });
  }

  activeDynamicWarnings.clear();
  nextWarnings.forEach((warning, key) => activeDynamicWarnings.set(key, warning));
  if (notificationStateReady && isNotificationEnabled('mez')) {
    nextWarnings.forEach((warning, key) => {
      if (!previousWarnings.has(key)) notifyOnce(`mez:${key}`, `MEZ ${warning.name}`);
    });
  }
  notificationStateReady = true;
  updateDynamicRangeCircleAppearance();
  renderDynamicWarningPanel();
}

function updateDynamicRangeCircleAppearance() {
  document.querySelectorAll('.dynamic-range-circle').forEach((circle) => {
    const key = `${circle.dataset.objectId}-circle-${circle.dataset.circleIndex}`;
    circle.classList.remove('sead-range-active', 'sead-range-warning');
    const seadClass = getSeadCircleClass(circle.dataset.objectId);
    if (seadClass) circle.classList.add(seadClass);
    circle.classList.toggle('dynamic-range-circle-warning', activeDynamicWarnings.has(key));
  });
}

function renderDynamicWarningPanel() {
  const warnings = [...activeDynamicWarnings.values()];
  elements.dynamicWarning.classList.toggle('hidden', warnings.length === 0);
  document.body.classList.toggle('dynamic-warning-active', warnings.length > 0);
  if (!warnings.length) {
    elements.dynamicWarningItems.innerHTML = '';
    return;
  }
  elements.dynamicWarningItems.innerHTML = warnings.map((warning) => {
    const elapsed = Math.max(0, Math.floor((Date.now() - warning.enteredAt) / 1000));
    const harmRemaining = getSeadLaunchRemaining(warning.objectId);
    const timeText = harmRemaining !== null && harmRemaining >= 0
      ? formatSeadCountdown(harmRemaining)
      : `${elapsed}秒`;
    return `<div class="dynamic-warning-item ${warning.colorClass}"><strong>${escapeHtml(warning.name)}</strong><span>${timeText}</span></div>`;
  }).join('');
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function startDynamicWarningClock() {
  window.setInterval(() => {
    const now = new Date();
    checkSeadNotifications();
    checkTotNotifications(now);
    lastNotificationCheck = now.getTime();
    if (activeDynamicWarnings.size) renderDynamicWarningPanel();
    updateTimelineAlerts(now);
    updateFeatureWindows(false);
  }, 1000);
}

function getTimelineEventDate(event, now) {
  const parts = String(event.time || '').split(':').map(Number);
  if (parts.length !== 3 || !parts.every(Number.isInteger) || parts[0] > 23 || parts[1] > 59 || parts[2] > 59) return null;
  const date = new Date(now);
  date.setHours(parts[0], parts[1], parts[2], 0);
  return date;
}

function formatTimelineDifference(seconds) {
  const sign = seconds < 0 ? '-' : '';
  const absolute = Math.abs(Math.round(seconds));
  return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
}

function updateTimelineAlerts(now = new Date()) {
  const activeEvents = getTimelineEvents().flatMap((event) => getTimelineAlerts(event).map((alert, alertIndex) => {
    const eventTime = getTimelineEventDate(event, now);
    const offset = Number(alert.alertOffset || 0);
    if (alert.alertEnabled === false || !eventTime || !Number.isFinite(offset)) return null;
    const alertTime = new Date(eventTime.getTime() + offset * 1000);
    const alertKey = `${event.id || event.name}:${alert.id || alertIndex}:${alertTime.getTime()}`;
    const alertColor = String(alert.alertColor || 'GREEN').toUpperCase();
    if (dismissedTimelineAlerts.has(alertKey)) return null;
    const difference = (now.getTime() - eventTime.getTime()) / 1000;
    return now.getTime() >= alertTime.getTime()
      ? { ...event, ...alert, difference, alertKey, alertTime: alertTime.getTime(), timelineEventKey: event.id || `${event.name}:${event.time}`, timelineAlertColor: alertColor }
      : null;
  })).filter(Boolean).reduce((latestByEvent, alert) => {
    const eventKey = alert.timelineEventKey;
    const previous = latestByEvent.get(eventKey);
    if (!previous || alert.alertTime > previous.alertTime) latestByEvent.set(eventKey, alert);
    return latestByEvent;
  }, new Map());
  const visibleEvents = [...activeEvents.values()];
  elements.timelineAlertWindow.classList.toggle('hidden', visibleEvents.length === 0);
  elements.timelineAlertItems.innerHTML = visibleEvents.map((event) => {
    const color = ['GREEN', 'YELLOW', 'RED'].includes(event.timelineAlertColor) ? event.timelineAlertColor : 'GREEN';
    return `<div class="timeline-alert-item timeline-alert-${color}" data-timeline-alert-key="${escapeHtml(event.alertKey)}"><strong>${escapeHtml(event.name || 'EVENT')}</strong><span>${formatTimelineDifference(event.difference)}</span></div>`;
  }).join('');
}

function drawBullseyeMarker() {
  const position = getBullseyeMapPosition();
  const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  group.setAttribute('class', 'bullseye-marker');
  group.setAttribute('pointer-events', 'none');
  group.setAttribute('aria-label', 'B/E位置');
  group.dataset.anchorX = String(position.x * 10);
  group.dataset.anchorY = String(position.y * 7);

  [16, 11, 6].forEach((radius, index) => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', position.x * 10);
    circle.setAttribute('cy', position.y * 7);
    circle.setAttribute('r', radius);
    circle.setAttribute('fill', 'none');
    circle.setAttribute('stroke', '#f97316');
    circle.setAttribute('stroke-width', String(index === 2 ? 2.5 : 2));
    circle.setAttribute('opacity', index === 2 ? '1' : '0.9');
    group.appendChild(circle);
  });

  mapInteraction.viewport.appendChild(group);
}

function drawHookLocator() {
  const targets = [...hookWindowTargets.entries()]
    .map(([key, target]) => ({ key, target }))
    .filter(({ target }) => target);

  let hookColorIndex = 0;

  const selfPosition = state.self.gpsAvailable === true && Number.isFinite(state.self.lat) && Number.isFinite(state.self.lon)
    ? geoToMapPosition(state.self.lat, state.self.lon)
    : { x: 50, y: 50 };

  targets.forEach(({ key, target }) => {
    const targetPosition = getHookTargetPosition(target);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const color = getHookLineColor(key, key === 'hook' ? 0 : hookColorIndex++);
    line.setAttribute('x1', selfPosition.x * 10);
    line.setAttribute('y1', selfPosition.y * 7);
    line.setAttribute('x2', targetPosition.x * 10);
    line.setAttribute('y2', targetPosition.y * 7);
    line.setAttribute('class', 'hook-locator');
    line.setAttribute('stroke', color);
    line.setAttribute('stroke-width', String(3 * getDisplayScale()));
    line.setAttribute('stroke-dasharray', '10 8');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    line.setAttribute('stroke-linecap', 'butt');
    line.setAttribute('opacity', '0.9');
    line.setAttribute('pointer-events', 'none');
    line.setAttribute('aria-label', `自機から${target.name}へのロケーターライン (${key})`);
    mapInteraction.viewport.appendChild(line);
  });

  [...hook2WindowTargets.entries()].forEach(([key, targets]) => {
    if (targets.length < 2) return;
    const [startTarget, endTarget] = targets;
    const start = getHookTargetPosition(startTarget);
    const end = getHookTargetPosition(endTarget);
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const color = getHookLineColor(key, key === 'hook' ? 0 : hookColorIndex++);
    line.setAttribute('x1', start.x * 10);
    line.setAttribute('y1', start.y * 7);
    line.setAttribute('x2', end.x * 10);
    line.setAttribute('y2', end.y * 7);
    line.setAttribute('class', 'hook2-locator');
    line.setAttribute('stroke', color);
    line.style.stroke = color;
    line.setAttribute('stroke-width', String(3 * getDisplayScale()));
    line.setAttribute('stroke-dasharray', '10 8');
    line.setAttribute('vector-effect', 'non-scaling-stroke');
    line.setAttribute('stroke-linecap', 'butt');
    line.setAttribute('opacity', '0.95');
    line.setAttribute('pointer-events', 'none');
    line.setAttribute('aria-label', `2点HOOKの始点から終点へのロケーターライン (${key})`);
    mapInteraction.viewport.appendChild(line);
  });
}

function getHookTargetPosition(target) {
  if (target.kind === 'self') {
    return state.self.gpsAvailable === true && Number.isFinite(state.self.lat) && Number.isFinite(state.self.lon)
      ? geoToMapPosition(state.self.lat, state.self.lon)
      : { x: 50, y: 50 };
  }
  if (target.kind === 'bullseye') return getBullseyeMapPosition();
  const coordinates = getHookTargetCoordinates(target);
  return geoToMapPosition(coordinates.lat, coordinates.lon);
}

function handleAddMarker(event) {
  event.preventDefault();

  const layer = elements.targetLayer.value;
  const type = elements.markerType.value;
  const symbol = elements.markerSymbol.value;
  const geometryType = elements.geometryType.value;
  const geometryRadius = Math.max(0, Number(elements.geometryRadius?.value || 0) || 0);
  const name = (elements.markerName.value || `${type === 'ally' ? '味方' : type === 'enemy' ? '敵' : '地点'}${Date.now().toString().slice(-3)}`).trim();
  const x = clampNumber(Number(elements.coordX.value), 0, 100, 50);
  const y = clampNumber(Number(elements.coordY.value), 0, 100, 50);

  const item = {
    id: `marker-${crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
    type,
    name,
    x,
    y,
    layer,
    symbol,
    geometryType,
    geometryRadius,
  };

  state[layer].push(item);
  selectedId = item.id;
  selectedLayer = layer;
  saveState();
  renderMap();
  elements.addMarkerForm.reset();
}

function deleteSelectedMarker() {
  if (!selectedId) return;

  for (const layerName of ['basic', 'static', 'dynamic']) {
    const index = state[layerName].findIndex((item) => item.id === selectedId);
    if (index >= 0) {
      state[layerName].splice(index, 1);
      selectedId = null;
      selectedLayer = null;
      saveState();
      renderMap();
      return;
    }
  }
}

function resetSampleData() {
  const fresh = JSON.parse(JSON.stringify(sampleState));
  state.basic = fresh.basic;
  state.static = fresh.static;
  state.dynamic = fresh.dynamic;
  state.self = { ...fresh.self };
  state.basicVisible = true;
  state.staticVisible = true;
  state.dynamicVisible = true;
  selectedId = null;
  selectedLayer = null;
  renderLayerToggles();
  saveState();
  renderMap();
}

function resetAppState() {
  const confirmed = window.confirm('現在登録した初期状態へ戻しますか？');
  if (!confirmed) return;
  const snapshot = JSON.parse(localStorage.getItem(INITIAL_STATE_STORAGE_KEY) || 'null');
  if (snapshot?.state) localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot.state));
  if (snapshot?.windows) localStorage.setItem(WINDOWS_STORAGE_KEY, JSON.stringify(snapshot.windows));
  if (snapshot?.view) localStorage.setItem(VIEW_STORAGE_KEY, JSON.stringify(snapshot.view));
  window.location.reload();
}

function calculateBearing(from, to, deviation) {
  const fromGeo = Number.isFinite(from.lat) && Number.isFinite(from.lon) ? from : mapPositionToGeo(from.x, from.y);
  const toGeo = Number.isFinite(to.lat) && Number.isFinite(to.lon) ? to : mapPositionToGeo(to.x, to.y);
  const fromLat = (fromGeo.lat * Math.PI) / 180;
  const deltaLon = ((toGeo.lon - fromGeo.lon) * Math.PI) / 180;
  const toLat = (toGeo.lat * Math.PI) / 180;
  let bearing = (Math.atan2(
    Math.sin(deltaLon) * Math.cos(toLat),
    Math.cos(fromLat) * Math.sin(toLat) - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(deltaLon),
  ) * 180) / Math.PI;
  if (bearing < 0) bearing += 360;
  
  const magBearing = (bearing - (deviation || 0) + 360) % 360;
  return Math.round(magBearing);
}

function formatBearing(value) {
  return Math.round((value + 360) % 360).toString().padStart(3, '0');
}

function toMagneticBearing(trueBearing) {
  return (Number(trueBearing || 0) - (state.settings.manualDeviation || 0) + 360) % 360;
}

function magneticToTrue(magneticBearing) {
  return (Number(magneticBearing || 0) + (state.settings.manualDeviation || 0) + 360) % 360;
}

function calculateDistance(from, to) {
  const fromGeo = Number.isFinite(from.lat) && Number.isFinite(from.lon) ? from : mapPositionToGeo(from.x, from.y);
  const toGeo = Number.isFinite(to.lat) && Number.isFinite(to.lon) ? to : mapPositionToGeo(to.x, to.y);
  return Math.round(getGeoDistance(fromGeo, toGeo) * 10) / 10;
}

function updateSelfInfoDisplay() {
  const deviation = state.settings.manualDeviation || 0;
  const bullseye = getBullseyeMapPosition();
  const self = state.self;
  
  const bearing = calculateBearing(bullseye, self, deviation);
  const distance = calculateDistance(bullseye, self);
  
  elements.selfBearing.textContent = `${formatBearing(bearing)}°`;
  elements.selfDistance.textContent = `${distance.toFixed(1)}nm`;
  
  const heading = Math.round(state.self.heading || 0);
  const speed = Math.round(state.self.speed || 0);
  
  if (elements.selfHeading) elements.selfHeading.textContent = `${formatBearing(toMagneticBearing(heading))}°M`;
  if (elements.selfSpeed) elements.selfSpeed.textContent = `${speed}kt`;
  
  updateHookDisplay();
  updateFeatureWindows();
}

function updateSelfSimulationDisplays() {
  const deviation = state.settings.manualDeviation || 0;
  const bullseye = getBullseyeMapPosition();
  elements.selfBearing.textContent = `${formatBearing(calculateBearing(bullseye, state.self, deviation))}°`;
  elements.selfDistance.textContent = `${calculateDistance(bullseye, state.self).toFixed(1)}nm`;
  if (elements.selfHeading) elements.selfHeading.textContent = `${formatBearing(toMagneticBearing(state.self.heading || 0))}°M`;
  if (elements.selfSpeed) elements.selfSpeed.textContent = `${Math.round(state.self.speed || 0)}kt`;
  updateHookDisplay(false);
  updateFeatureWindows(false);
}

function getBullseyeMapPosition() {
  return geoToMapPosition(state.settings.bullseye.lat, state.settings.bullseye.lon);
}

function updateHookDisplay(includeDynamicList = true) {
  if (!hookTarget) {
    elements.hookInfo.classList.remove('hidden');
    elements.hookName.textContent = '--';
    elements.hookBearing.textContent = '---°';
    elements.hookDistance.textContent = '--nm';
    updateFeatureWindows(includeDynamicList);
    return;
  }
  
  elements.hookInfo.classList.remove('hidden');
  elements.hookName.textContent = hookTarget.name;
  
  const deviation = state.settings.manualDeviation || 0;
  const targetCoordinates = getHookTargetCoordinates(hookTarget);
  const bearing = calculateBearing(state.self, targetCoordinates, deviation);
  const distance = calculateDistance(state.self, targetCoordinates);
  
  elements.hookBearing.textContent = `${formatBearing(bearing)}°`;
  elements.hookDistance.textContent = `${distance.toFixed(1)}nm`;
  updateFeatureWindows(includeDynamicList);
}

function requestGps() {
  // GPS 取得機能は削除（フック機能に置き換え）
}

function updateSelectedInfo() {
  if (!selectedId) {
    elements.selectedInfo.textContent = '未選択';
    return;
  }

  for (const layerName of ['basic', 'static', 'dynamic']) {
    const item = state[layerName].find((entry) => entry.id === selectedId);
    if (item) {
      elements.selectedInfo.textContent = `${LAYER_LABELS[layerName]} / ${item.name}`;
      return;
    }
  }

  elements.selectedInfo.textContent = '未選択';
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function getSymbolColor(type) {
  if (type === 'enemy') return '#ef4444';
  if (type === 'neutral') return '#f8fafc';
  if (type === 'ally') return '#3b82f6';
  if (type === 'waypoint') return '#22c55e';
  if (type === 'base') return '#60a5fa';
  return '#fbbf24';
}

function getSymbolPath(shape, cx, cy, radius) {
  const s = radius;
  switch (shape) {
    case 'diamond':
      return `M ${cx} ${cy - s} L ${cx + s} ${cy} L ${cx} ${cy + s} L ${cx - s} ${cy} Z`;
    case 'triangle':
      return `M ${cx} ${cy - s} L ${cx + s} ${cy + s} L ${cx - s} ${cy + s} Z`;
    case 'square':
      return `M ${cx - s} ${cy - s} L ${cx + s} ${cy - s} L ${cx + s} ${cy + s} L ${cx - s} ${cy + s} Z`;
    case 'cross':
      return `M ${cx - s} ${cy - s / 2} L ${cx + s} ${cy - s / 2} L ${cx + s} ${cy + s / 2} L ${cx - s} ${cy + s / 2} Z M ${cx - s / 2} ${cy - s} L ${cx + s / 2} ${cy - s} L ${cx + s / 2} ${cy + s} L ${cx - s / 2} ${cy + s} Z`;
    case 'missile':
      return `M ${cx} ${cy - s} L ${cx + s * 0.9} ${cy} L ${cx} ${cy + s} L ${cx - s * 0.9} ${cy} Z`;
    case 'ddg':
      return `M ${cx - s * 0.45} ${cy - s} L ${cx + s * 0.45} ${cy - s} L ${cx + s} ${cy + s * 0.55} L ${cx + s * 0.55} ${cy + s} L ${cx - s * 0.55} ${cy + s} L ${cx - s} ${cy + s * 0.55} Z`;
    case 'cv':
      return `M ${cx - s * 0.3} ${cy - s} L ${cx + s * 0.3} ${cy - s} L ${cx + s} ${cy + s} L ${cx - s} ${cy + s} Z`;
    case 'circle':
    default:
      return `M ${cx} ${cy - s} A ${s} ${s} 0 1 1 ${cx - 0.01} ${cy - s} Z`;
  }
}

function getSectorPath(cx, cy, radius, startBearing, endBearing) {
  const sweep = (endBearing - startBearing + 360) % 360;
  if (sweep === 0) return `M ${cx} ${cy} Z`;
  const toPoint = (angle) => {
    const radians = (angle * Math.PI) / 180;
    return { x: cx + Math.sin(radians) * radius, y: cy - Math.cos(radians) * radius };
  };
  const first = toPoint(startBearing);
  const second = toPoint(endBearing);
  const largeArc = sweep > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${first.x} ${first.y} A ${radius} ${radius} 0 ${largeArc} 1 ${second.x} ${second.y} Z`;
}

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    return Promise.all(registrations.map((registration) => registration.unregister()));
  }).catch((err) => {
    console.warn('Service worker cleanup failed', err);
  });
}

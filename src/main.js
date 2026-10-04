import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { createOpenSCAD } from 'openscad-wasm'

const app = document.querySelector('#app')

const AVAILABLE_COLORS = [
  { name: 'Niebieski', value: '#030303' },
  { name: 'Czerwony', value: '#fbf8f8' },
  { name: 'Zielony', value: '#f60404' },
  { name: 'Szary', value: '#047bfa' },
  { name: 'Czarny', value: '#808181' },
  { name: 'Beżowy', value: '#d0af8b' },
  { name: 'Beżowy', value: '#2b5719' },
  { name: 'Beżowy', value: '#e4722a' },
]

const state = {
  selectedColor: AVAILABLE_COLORS[0].value,
}

app.innerHTML = `
  <div class="layout">
    <aside class="panel">
      <form id="config-form" class="form">
        <label>
          <span>Długość (mm)</span>
          <input id="length" name="length" type="number" min="20" max="210" step="1" value="200" />
        </label>

        <label>
          <span>Szerokość (mm)</span>
          <input id="width" name="width" type="number" min="20" max="210" step="1" value="120" />
        </label>

        <label>
          <span>Głębokość (mm)</span>
          <input id="depth" name="depth" type="number" min="10" max="100" step="1" value="100" />
        </label>

        <label>
          <span>Średnica zaokrąglenia rogów (mm)</span>
          <input id="corner-diameter" name="corner-diameter" type="number" min="2" max="20" step="1" value="2" />
        </label>

        <label>
          <span>Przegródki wzdłuż długości</span>
          <input id="partitions-length" name="partitions-length" type="number" min="0" step="1" value="1" />
        </label>

        <label>
          <span>Przegródki wzdłuż szerokości</span>
          <input id="partitions-width" name="partitions-width" type="number" min="0" step="1" value="1" />
        </label>

        <label>
          <span>Wysokość ścian przegród (mm)</span>
          <input id="partition-wall-height" name="partition-wall-height" type="number" min="5" max="100" step="1" value="100" />
        </label>

        <div id="partition-info" class="partition-info">Wymiary przegródki: 0 × 0 mm</div>

        <div class="config-section lid-section">
          <label class="checkbox-row">
            <input id="include-lid" type="checkbox" />
            <span>Dodaj pokrywkę</span>
          </label>

          <div id="lid-wall-height-wrapper" class="lid-wall-height-wrapper" hidden>
            <label>
              <span>Wysokość ścian pokrywy (mm)</span>
              <input id="lid-wall-height" name="lid-wall-height" type="number" min="5" max="100" step="1" value="12" />
            </label>
          </div>
        </div>

        <div class="color-field">
          <span>Kolor pudełka</span>
          <div id="color-picker" class="color-picker" aria-label="Wybór koloru pudełka"></div>
        </div>
      </form>
    </aside>

    <main class="viewer">
      <button id="generate-box" class="generate-button" type="button">Generuj pudełko</button>
      <button id="order-box" class="order-button" type="button">Zamów pudełko</button>
      <div id="model-container"></div>
      <div class="viewer-status">
        <span id="status">Generowanie modelu...</span>
      </div>

      <div id="order-modal" class="order-modal" hidden>
        <div class="order-modal__backdrop" data-close="true"></div>
        <div class="order-modal__dialog" role="dialog" aria-modal="true" aria-labelledby="order-title">
          <button type="button" class="order-modal__close" aria-label="Zamknij okno" data-close="true">×</button>
          <h2 id="order-title">Kod zamówienia</h2>
          <p class="order-modal__message">
            Podaj ten kod w polu "Uwagi do zakupu" podczas składania zamówienia na Allegro
          </p>
          <div id="order-code" class="order-code" aria-live="polite"></div>
          <button id="allegro-order-button" type="button" class="order-modal__action">Zamów na Allegro</button>
        </div>
      </div>
    </main>
  </div>
`

const lengthInput = document.querySelector('#length')
const widthInput = document.querySelector('#width')
const depthInput = document.querySelector('#depth')
const cornerDiameterInput = document.querySelector('#corner-diameter')
const partitionsLengthInput = document.querySelector('#partitions-length')
const partitionsWidthInput = document.querySelector('#partitions-width')
const partitionWallHeightInput = document.querySelector('#partition-wall-height')
const partitionInfoEl = document.querySelector('#partition-info')
const generateButton = document.querySelector('#generate-box')
const orderButton = document.querySelector('#order-box')
const orderModal = document.querySelector('#order-modal')
const orderCodeEl = document.querySelector('#order-code')
const allegroOrderButton = document.querySelector('#allegro-order-button')
const statusEl = document.querySelector('#status')
const colorPicker = document.querySelector('#color-picker')
const lidWallHeightWrapper = document.querySelector('#lid-wall-height-wrapper')
const lidWallHeightInput = document.querySelector('#lid-wall-height')
const includeLidInput = document.querySelector('#include-lid')
const container = document.querySelector('#model-container')
const viewer = document.querySelector('.viewer')

viewer.style.setProperty('position', 'relative', 'important')

orderButton.style.setProperty('position', 'absolute', 'important')
orderButton.style.setProperty('top', '15px', 'important')
orderButton.style.setProperty('right', '15px', 'important')
orderButton.style.setProperty('left', 'auto', 'important')
orderButton.style.setProperty('bottom', 'auto', 'important')
orderButton.style.setProperty('margin', '0', 'important')
orderButton.style.setProperty('transform', 'none', 'important')
orderButton.style.setProperty('z-index', '10000', 'important')

const WALL_THICKNESS = 2
const ALLEGRO_OFFER_URLS = {
  small: 'https://allegro.pl/oferta/18982875137',
  medium: '',
  large: '',
}

function renderColorOptions() {
  colorPicker.innerHTML = ''

  AVAILABLE_COLORS.forEach(({ name, value }) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `color-option ${state.selectedColor === value ? 'selected' : ''}`
    button.title = `${name} (${value})`
    button.style.setProperty('--swatch-color', value)
    button.setAttribute('aria-label', `Wybierz kolor ${name}`)
    button.addEventListener('click', () => {
      state.selectedColor = value
      renderColorOptions()
    })

    colorPicker.appendChild(button)
  })
}

function syncLidControls() {
  const isChecked = includeLidInput.checked
  lidWallHeightWrapper.hidden = isChecked
}

function syncDepthDependentRanges() {
  const depth = Number(depthInput.value)
  const maxHeight = Math.max(5, Number.isFinite(depth) && depth > 0 ? depth : 10)
  partitionWallHeightInput.max = String(maxHeight)
  lidWallHeightInput.max = String(maxHeight)
}

function clampInputToRange(input) {
  const minimum = Number(input.min)
  const maximum = input.max === '' ? Infinity : Number(input.max)
  const value = Number(input.value)
  const safeValue = Number.isFinite(value) ? value : minimum

  input.value = String(Math.min(maximum, Math.max(minimum, safeValue)))
}

function normalizeConfigurationInputs() {
  const independentInputs = [
    lengthInput,
    widthInput,
    depthInput,
    cornerDiameterInput,
    partitionsLengthInput,
    partitionsWidthInput,
  ]
  independentInputs.forEach(clampInputToRange)

  syncDepthDependentRanges()

  const dependentInputs = [partitionWallHeightInput, lidWallHeightInput]
  dependentInputs.forEach(clampInputToRange)
}

function getSelectedColorName() {
  const selected = AVAILABLE_COLORS.find(({ value }) => value === state.selectedColor)
  return selected ? selected.name : 'Niebieski'
}

function buildOrderCode() {
  normalizeConfigurationInputs()

  const length = Number(lengthInput.value) || 0
  const width = Number(widthInput.value) || 0
  const depth = Number(depthInput.value) || 0
  const cornerDiameter = Number(cornerDiameterInput.value) || 0
  const partitionsLength = Number(partitionsLengthInput.value) || 0
  const partitionsWidth = Number(partitionsWidthInput.value) || 0
  const partitionWallHeight = Number(partitionWallHeightInput.value) || 0
  const lidEnabled = includeLidInput.checked ? 'y' : 'n'
  const lidWallHeight = Number(lidWallHeightInput.value) || 0
  const colorName = getSelectedColorName()

  return [
    length,
    width,
    depth,
    cornerDiameter,
    partitionsLength,
    partitionsWidth,
    partitionWallHeight,
    lidEnabled,
    lidWallHeight,
    colorName,
  ].join('-')
}

function openOrderModal() {
  orderCodeEl.textContent = buildOrderCode()
  orderModal.hidden = false
}

function closeOrderModal() {
  orderModal.hidden = true
}

function getAllegroOfferSize(length, width, depth) {
  const fitsSmallFootprint = length < 100 && width < 100

  if (fitsSmallFootprint && depth < 50) {
    return 'small'
  }

  if (fitsSmallFootprint && depth > 50) {
    return 'medium'
  }

  return 'large'
}

function handleAllegroOrder() {
  normalizeConfigurationInputs()

  const offerSize = getAllegroOfferSize(
    Number(lengthInput.value),
    Number(widthInput.value),
    Number(depthInput.value)
  )
  const offerUrl = ALLEGRO_OFFER_URLS[offerSize]

  if (!offerUrl) {
    window.alert('Brak linku do wybranej oferty Allegro.')
    return
  }

  window.location.href = offerUrl
}

function getPartitionCellSize() {
  const length = Math.max(20, Number(lengthInput.value) || 20)
  const width = Math.max(20, Number(widthInput.value) || 20)
  const partitionsLength = Math.max(0, Math.floor(Number(partitionsLengthInput.value) || 0))
  const partitionsWidth = Math.max(0, Math.floor(Number(partitionsWidthInput.value) || 0))

  const usableLength = Math.max(0, length - 2 * WALL_THICKNESS)
  const usableWidth = Math.max(0, width - 2 * WALL_THICKNESS)

  const cellsAlongLength = partitionsLength > 0 ? partitionsLength + 1 : 1
  const cellsAlongWidth = partitionsWidth > 0 ? partitionsWidth + 1 : 1

  const cellLength = usableLength / cellsAlongLength
  const cellWidth = usableWidth / cellsAlongWidth

  if (partitionsLength === 0 && partitionsWidth === 0) {
    return 'Brak przegródek — całość jest jednym obszarem.'
  }

  return `Wymiary przegródki: ${cellLength.toFixed(1)} × ${cellWidth.toFixed(1)} mm`
}

function roundedRect2D(width, height, radius) {
  const safeRadius = Math.min(Math.max(0, Number(radius) || 0), width / 2, height / 2)

  if (safeRadius <= 0) {
    return `square([${width}, ${height}]);`
  }

  return `
    hull() {
      translate([${safeRadius}, ${safeRadius}]) circle(r = ${safeRadius});
      translate([${(width - safeRadius).toFixed(2)}, ${safeRadius}]) circle(r = ${safeRadius});
      translate([${safeRadius}, ${(height - safeRadius).toFixed(2)}]) circle(r = ${safeRadius});
      translate([${(width - safeRadius).toFixed(2)}, ${(height - safeRadius).toFixed(2)}]) circle(r = ${safeRadius});
    }
  `
}

function buildBoxScad({
  length,
  width,
  depth,
  wallThickness = WALL_THICKNESS,
  partitionsLength = 0,
  partitionsWidth = 0,
  partitionWallHeight = 0,
  lidWallHeight = 12,
  includeLid = false,
  cornerDiameter = 0,
}) {
  const safeLength = Math.min(210, Math.max(20, Number(length) || 20))
  const safeWidth = Math.min(210, Math.max(20, Number(width) || 20))
  const safeDepth = Math.min(100, Math.max(10, Number(depth) || 10))
  const safePartitionsLength = Math.max(0, Math.floor(Number(partitionsLength) || 0))
  const safePartitionsWidth = Math.max(0, Math.floor(Number(partitionsWidth) || 0))
  const safePartitionWallHeight = Math.max(5, Math.min(safeDepth, Number(partitionWallHeight) || 5))
  const safeLidWallHeight = Math.max(5, Math.min(safeDepth, Number(lidWallHeight) || 12))
  const lidEnabled = Boolean(includeLid)
  const safeCornerDiameter = Math.min(20, Math.max(2, Number(cornerDiameter) || 2))

  const innerLength = Math.max(0, safeLength - 2 * wallThickness)
  const innerWidth = Math.max(0, safeWidth - 2 * wallThickness)
  const partitionDepth = Math.max(0, safePartitionWallHeight)

  const maxOuterCornerDiameter = Math.min(safeLength, safeWidth)
  const maxInnerCornerDiameter = Math.min(innerLength, innerWidth)
  const outerCornerDiameter = Math.min(safeCornerDiameter, maxOuterCornerDiameter)
  const innerCornerDiameter = Math.max(0, outerCornerDiameter - wallThickness)
  const outerCornerRadius = Math.min(outerCornerDiameter / 2, maxOuterCornerDiameter / 2)
  const innerCornerRadius = Math.min(innerCornerDiameter / 2, maxInnerCornerDiameter / 2)

  const wallSegmentsLength = safePartitionsLength + 1
  const wallSegmentsWidth = safePartitionsWidth + 1
  const partitionCellLength = Math.max(
    0,
    (innerLength - safePartitionsLength * wallThickness) / wallSegmentsLength
  )
  const partitionCellWidth = Math.max(
    0,
    (innerWidth - safePartitionsWidth * wallThickness) / wallSegmentsWidth
  )

  const outerBoxLength = safeLength
  const outerBoxWidth = safeWidth
  const innerBoxLength = safeLength - 2 * wallThickness
  const innerBoxWidth = safeWidth - 2 * wallThickness
  const lidClearance = 0.5
  const lidThickness = 2
  const lidOuterLength = safeLength + 2 * (wallThickness + lidClearance)
  const lidOuterWidth = safeWidth + 2 * (wallThickness + lidClearance)
  const lidInnerCutLength = safeLength + 2 * lidClearance
  const lidInnerCutWidth = safeWidth + 2 * lidClearance
  const lidOuterCornerRadius = outerCornerRadius + 2.5
  const lidInnerCornerRadius = innerCornerRadius + 2.5

  let partitionCode = ''

  for (let index = 1; index <= safePartitionsLength; index += 1) {
    const x = wallThickness + partitionCellLength * index + wallThickness * (index - 1)
    partitionCode += `translate([${x.toFixed(2)}, ${wallThickness}, 0]) cube([${wallThickness}, ${innerWidth.toFixed(2)}, ${partitionDepth.toFixed(2)}]);\n`
  }

  for (let index = 1; index <= safePartitionsWidth; index += 1) {
    const y = wallThickness + partitionCellWidth * index + wallThickness * (index - 1)
    partitionCode += `translate([${wallThickness}, ${y.toFixed(2)}, 0]) cube([${innerLength.toFixed(2)}, ${wallThickness}, ${partitionDepth.toFixed(2)}]);\n`
  }

  const lidCode = lidEnabled ? `
    module lid() {
      lid_clearance = ${lidClearance.toFixed(2)};
      lid_thickness = ${lidThickness};
      lid_wall_height = ${safeLidWallHeight};
      lid_outer_length = ${lidOuterLength.toFixed(2)};
      lid_outer_width = ${lidOuterWidth.toFixed(2)};
      lid_corner_radius = ${lidOuterCornerRadius.toFixed(2)};
      lid_inner_corner_radius = ${lidInnerCornerRadius.toFixed(2)};

      translate([-${(wallThickness + lidClearance).toFixed(2)}, -${(wallThickness + lidClearance).toFixed(2)}, ${safeDepth + lidClearance + lidThickness}])
        rotate([0, 0, 0])
          mirror([0, 0, 1])
            union() {
              linear_extrude(height = lid_thickness)
                ${roundedRect2D(lidOuterLength, lidOuterWidth, lidOuterCornerRadius)}

              translate([0, 0, lid_thickness])
                difference() {
                  linear_extrude(height = lid_wall_height)
                    ${roundedRect2D(lidOuterLength, lidOuterWidth, lidOuterCornerRadius)}

                  translate([${wallThickness.toFixed(2)}, ${wallThickness.toFixed(2)}, -0.1])
                    linear_extrude(height = lid_wall_height + 0.2)
                      ${roundedRect2D(lidInnerCutLength, lidInnerCutWidth, lidInnerCornerRadius)}
                }
            }
    }
  ` : ''

  const lidUnion = lidEnabled ? 'lid();' : ''

  return `
$fn = 48;
wall = ${wallThickness};
outer_length = ${safeLength};
outer_width = ${safeWidth};
outer_depth = ${safeDepth};
box_corner_radius = ${outerCornerRadius.toFixed(2)};
inner_corner_radius = ${innerCornerRadius.toFixed(2)};

module box_shell() {
  difference() {
    linear_extrude(height = outer_depth)
      ${roundedRect2D(outerBoxLength, outerBoxWidth, outerCornerRadius)}

    translate([wall, wall, wall])
      linear_extrude(height = outer_depth + 0.1)
        ${roundedRect2D(innerBoxLength, innerBoxWidth, innerCornerRadius)}
  }
}

module partitions() {
  union() {
    ${partitionCode || '/* no partitions */'}
  }
}

${lidCode}

union() {
  box_shell();
  partitions();
  ${lidUnion}
}
  `.trim()
}

const scene = new THREE.Scene()
scene.background = new THREE.Color(0xf5f7fb)

const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 2000)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
container.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.enablePan = true
controls.minDistance = 120
controls.maxDistance = 800
controls.target.set(0, 100, 0)

const ambientLight = new THREE.AmbientLight(0xffffff, 1.2)
scene.add(ambientLight)

const keyLight = new THREE.DirectionalLight(0xffffff, 1.5)
keyLight.position.set(200, 250, 180)
scene.add(keyLight)

const rimLight = new THREE.DirectionalLight(0x9bb4ff, 0.9)
rimLight.position.set(-180, 120, -140)
scene.add(rimLight)

let currentMesh = null

function fitModelToView(mesh) {
  const box = new THREE.Box3().setFromObject(mesh)

  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())

  const maxDimension = Math.max(size.x, size.y, size.z, 1)

  const distance = maxDimension * 2.2

  // Środek obrotu = dokładny środek modelu
  controls.target.copy(center)

  // Kamera patrzy na dokładnie ten sam punkt
  camera.position.set(
    center.x + distance,
    center.y + distance,
    center.z + distance
  )

  camera.lookAt(center)

  // Ważne: aktualizacja OrbitControls dopiero po ustawieniu
  // targetu i pozycji kamery
  controls.update()
}

function resizeRenderer() {
  const rect = viewer.getBoundingClientRect()

  const width = Math.max(1, Math.round(rect.width))
  const height = Math.max(1, Math.round(rect.height))

  /*
   * Wymuszamy, żeby kontener 3D dokładnie pokrywał
   * widoczny obszar .viewer.
   *
   * Używamy position: fixed, dzięki czemu pozycja jest
   * liczona bezpośrednio względem okna przeglądarki.
   */
  container.style.setProperty('position', 'fixed', 'important')
  container.style.setProperty('z-index', '1', 'important')
  container.style.setProperty(
    'left',
    `${Math.round(rect.left)}px`,
    'important'
  )
  container.style.setProperty(
    'top',
    `${Math.round(rect.top)}px`,
    'important'
  )
  container.style.setProperty(
    'width',
    `${width}px`,
    'important'
  )
  container.style.setProperty(
    'height',
    `${height}px`,
    'important'
  )

  container.style.setProperty('margin', '0', 'important')
  container.style.setProperty('padding', '0', 'important')
  container.style.setProperty('transform', 'none', 'important')
  container.style.setProperty('box-sizing', 'border-box', 'important')
  container.style.setProperty('overflow', 'hidden', 'important')

  /*
   * Canvas również dostaje dokładnie 100% kontenera.
   */
  renderer.domElement.style.setProperty(
    'position',
    'absolute',
    'important'
  )
  renderer.domElement.style.setProperty(
    'left',
    '0',
    'important'
  )
  renderer.domElement.style.setProperty(
    'top',
    '0',
    'important'
  )
  renderer.domElement.style.setProperty(
    'width',
    '100%',
    'important'
  )
  renderer.domElement.style.setProperty(
    'height',
    '100%',
    'important'
  )
  renderer.domElement.style.setProperty(
    'display',
    'block',
    'important'
  )

  renderer.setSize(width, height, false)

  camera.aspect = width / height
  camera.updateProjectionMatrix()
}

const resizeObserver = new ResizeObserver(() => {
  resizeRenderer()
})

resizeObserver.observe(viewer)

window.addEventListener('resize', resizeRenderer)
window.addEventListener('scroll', resizeRenderer, {
  passive: true,
})

resizeRenderer()

function createDimensionLabelSprite(text, options = {}) {
  const {
    background = 'rgba(255, 255, 255, 0.9)',
    color = '#0f172a',
    fontSize = 26,
  } = options

  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')
  const paddingX = 30
  const paddingY = 16

  context.font = `700 ${fontSize}px Inter, Segoe UI, sans-serif`
  const textWidth = context.measureText(text).width
  const width = textWidth + paddingX * 2
  const height = fontSize + paddingY * 2

  canvas.width = width
  canvas.height = height

  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = background
  context.strokeStyle = 'rgba(15, 23, 42, 0.12)'
  context.lineWidth = 2

  const radius = 18
  context.beginPath()
  context.moveTo(radius, 0)
  context.lineTo(canvas.width - radius, 0)
  context.quadraticCurveTo(canvas.width, 0, canvas.width, radius)
  context.lineTo(canvas.width, canvas.height - radius)
  context.quadraticCurveTo(canvas.width, canvas.height, canvas.width - radius, canvas.height)
  context.lineTo(radius, canvas.height)
  context.quadraticCurveTo(0, canvas.height, 0, canvas.height - radius)
  context.lineTo(0, radius)
  context.quadraticCurveTo(0, 0, radius, 0)
  context.closePath()
  context.fill()
  context.stroke()

  context.fillStyle = color
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.font = `700 ${fontSize}px Inter, Segoe UI, sans-serif`
  context.fillText(text, canvas.width / 2, canvas.height / 2)

  const texture = new THREE.CanvasTexture(canvas)
  texture.needsUpdate = true

  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })

  const sprite = new THREE.Sprite(material)
  sprite.scale.set(width * 0.08, height * 0.08, 1)
  return sprite
}

function addDimensionLabels(modelRoot, dimensions) {
  const lengthLabel = createDimensionLabelSprite('Długość')
  lengthLabel.position.set(0, dimensions.y * 0.52, dimensions.z * 0.64)
  lengthLabel.rotation.x = -Math.PI / 2
  modelRoot.add(lengthLabel)

  const widthLabel = createDimensionLabelSprite('Szerokość')
  widthLabel.position.set(dimensions.x * 0.52, 0, dimensions.z * 0.52)
  widthLabel.rotation.y = Math.PI / 2
  modelRoot.add(widthLabel)
}

function disposeCurrentMesh() {
  if (!currentMesh) {
    return
  }

  scene.remove(currentMesh)
  currentMesh.traverse((object) => {
    if (object.geometry) {
      object.geometry.dispose()
    }

    if (object.material) {
      if (Array.isArray(object.material)) {
        object.material.forEach((material) => material.dispose())
      } else {
        object.material.dispose()
      }
    }
  })
  currentMesh = null
}

async function renderModel() {
  normalizeConfigurationInputs()

  const values = {
    length: Number(lengthInput.value),
    width: Number(widthInput.value),
    depth: Number(depthInput.value),
    cornerDiameter: Number(cornerDiameterInput.value),
    partitionsLength: Number(partitionsLengthInput.value),
    partitionsWidth: Number(partitionsWidthInput.value),
    partitionWallHeight: Number(partitionWallHeightInput.value),
    lidWallHeight: Number(lidWallHeightInput.value),
    includeLid: includeLidInput.checked,
  }

  partitionInfoEl.textContent = getPartitionCellSize()
  statusEl.textContent = 'Generowanie modelu...'

  try {
    const openscad = await createOpenSCAD({
      print: () => {},
      printErr: () => {},
    })

    const scad = buildBoxScad({
      length: values.length,
      width: values.width,
      depth: values.depth,
      wallThickness: WALL_THICKNESS,
      partitionsLength: values.partitionsLength,
      partitionsWidth: values.partitionsWidth,
      partitionWallHeight: values.partitionWallHeight,
      lidWallHeight: values.lidWallHeight,
      includeLid: values.includeLid,
      cornerDiameter: values.cornerDiameter,
    })

    const stl = await openscad.renderToStl(scad)
    const loader = new STLLoader()
    const geometry = loader.parse(stl)
    geometry.center()
    geometry.computeVertexNormals()

    disposeCurrentMesh()

    const material = new THREE.MeshStandardMaterial({
      color: state.selectedColor,
      metalness: 0.2,
      roughness: 0.42,
    })

    const mesh = new THREE.Mesh(geometry, material)
    const modelRoot = new THREE.Group()
    modelRoot.add(mesh)

    const bounds = new THREE.Box3().setFromObject(mesh)
    const size = bounds.getSize(new THREE.Vector3())
    addDimensionLabels(modelRoot, size)

    modelRoot.rotation.x = -Math.PI / 2

    currentMesh = modelRoot
    scene.add(currentMesh)
    fitModelToView(currentMesh)

    statusEl.textContent = 'Model gotowy'
  } catch (error) {
    console.error(error)
    statusEl.textContent = 'Błąd renderowania'
  }
}

lengthInput.addEventListener('input', () => {
  partitionInfoEl.textContent = getPartitionCellSize()
})
widthInput.addEventListener('input', () => {
  partitionInfoEl.textContent = getPartitionCellSize()
})
partitionsLengthInput.addEventListener('input', () => {
  partitionInfoEl.textContent = getPartitionCellSize()
})
partitionsWidthInput.addEventListener('input', () => {
  partitionInfoEl.textContent = getPartitionCellSize()
})
depthInput.addEventListener('input', syncDepthDependentRanges)
;[
  lengthInput,
  widthInput,
  depthInput,
  cornerDiameterInput,
  partitionsLengthInput,
  partitionsWidthInput,
  partitionWallHeightInput,
  lidWallHeightInput,
].forEach((input) => input.addEventListener('change', normalizeConfigurationInputs))
partitionWallHeightInput.addEventListener('input', () => {
  partitionInfoEl.textContent = getPartitionCellSize()
})

generateButton.addEventListener('click', renderModel)
orderButton.addEventListener('click', openOrderModal)
if (allegroOrderButton) {
  allegroOrderButton.addEventListener('click', handleAllegroOrder)
}
includeLidInput.addEventListener('change', syncLidControls)
orderModal.addEventListener('click', (event) => {
  if (event.target.dataset.close === 'true') {
    closeOrderModal()
  }
})
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !orderModal.hidden) {
    closeOrderModal()
  }
})

syncLidControls()
normalizeConfigurationInputs()
partitionInfoEl.textContent = getPartitionCellSize()
renderColorOptions()
renderModel()

function animate() {
  requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
}

animate()

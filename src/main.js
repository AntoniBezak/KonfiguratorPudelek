import './style.css'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { createOpenSCAD } from 'openscad-wasm'

const app = document.querySelector('#app')

const AVAILABLE_COLORS = [
  { name: 'Niebieski', value: '#3e80eb' },
  { name: 'Czerwony', value: '#cb3030' },
  { name: 'Zielony', value: '#22c55e' },
  { name: 'Szary', value: '#64748b' },
  { name: 'Czarny', value: '#111827' },
  { name: 'Beżowy', value: '#d6a26a' },
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
          <input id="length" name="length" type="number" min="20" step="1" value="200" />
        </label>

        <label>
          <span>Szerokość (mm)</span>
          <input id="width" name="width" type="number" min="20" step="1" value="120" />
        </label>

        <label>
          <span>Głębokość (mm)</span>
          <input id="depth" name="depth" type="number" min="20" step="1" value="100" />
        </label>

        <label>
          <span>Średnica zaokrąglenia rogów (mm)</span>
          <input id="corner-diameter" name="corner-diameter" type="number" min="0" step="1" value="0" />
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
          <input id="partition-wall-height" name="partition-wall-height" type="number" min="10" step="1" value="100" />
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
              <input id="lid-wall-height" name="lid-wall-height" type="number" min="2" step="1" value="12" />
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

const WALL_THICKNESS = 2

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

function getSelectedColorName() {
  const selected = AVAILABLE_COLORS.find(({ value }) => value === state.selectedColor)
  return selected ? selected.name : 'Niebieski'
}

function buildOrderCode() {
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

const ALLEGRO_ORDER_TEXT = 'Ten przycisk będzie przenosił kupującego do odpowiedniego wariantu mojej oferty na Allegro. Oferta jeszcze nie istnieje, dlatego ten przycisk na razie nic nie robi.'

function handleAllegroOrder() {
  window.alert(ALLEGRO_ORDER_TEXT)
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
  const safeLength = Math.max(20, Number(length) || 20)
  const safeWidth = Math.max(20, Number(width) || 20)
  const safeDepth = Math.max(20, Number(depth) || 20)
  const safePartitionsLength = Math.max(0, Math.floor(Number(partitionsLength) || 0))
  const safePartitionsWidth = Math.max(0, Math.floor(Number(partitionsWidth) || 0))
  const safePartitionWallHeight = Math.max(0, Math.min(safeDepth, Number(partitionWallHeight) || safeDepth))
  const safeLidWallHeight = Math.max(2, Number(lidWallHeight) || 12)
  const lidEnabled = Boolean(includeLid)
  const safeCornerDiameter = Math.max(0, Number(cornerDiameter) || 0)

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
    const x = wallThickness + ((innerLength * index) / wallSegmentsLength)
    partitionCode += `translate([${x.toFixed(2)}, ${wallThickness}, 0]) cube([${wallThickness}, ${innerWidth.toFixed(2)}, ${partitionDepth.toFixed(2)}]);\n`
  }

  for (let index = 1; index <= safePartitionsWidth; index += 1) {
    const y = wallThickness + ((innerWidth * index) / wallSegmentsWidth)
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
camera.position.set(230, 180, 260)

const renderer = new THREE.WebGLRenderer({ antialias: true })
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
renderer.outputColorSpace = THREE.SRGBColorSpace
container.appendChild(renderer.domElement)

const controls = new OrbitControls(camera, renderer.domElement)
controls.enableDamping = true
controls.enablePan = true
controls.minDistance = 120
controls.maxDistance = 800
controls.target.set(0, 0, 0)

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
  const distance = maxDimension * 1.8

  controls.target.copy(center)

  const cameraOffset = new THREE.Vector3(
    distance,
    distance * 0.7,
    distance * 1.1,
  )

  camera.position.copy(center).add(cameraOffset)
  camera.lookAt(center)
  controls.update()
}

function resizeRenderer() {
  const { clientWidth, clientHeight } = container
  renderer.setSize(clientWidth, clientHeight, false)
  camera.aspect = clientWidth / clientHeight
  camera.updateProjectionMatrix()
  renderer.render(scene, camera)
}

window.addEventListener('resize', resizeRenderer)
resizeRenderer()

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
    mesh.rotation.x = -Math.PI / 2

    const modelRoot = new THREE.Group()
    modelRoot.add(mesh)

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
partitionInfoEl.textContent = getPartitionCellSize()
renderColorOptions()
renderModel()

function animate() {
  requestAnimationFrame(animate)
  controls.update()
  renderer.render(scene, camera)
}

animate()

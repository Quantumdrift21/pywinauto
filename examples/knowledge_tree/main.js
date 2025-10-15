import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.161/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.161/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'https://cdn.jsdelivr.net/npm/three@0.161/examples/jsm/renderers/CSS2DRenderer.js';

const LOCAL_STORAGE_KEY = 'knowledge-constellation-v1';

const clone = (data) => {
  if (typeof structuredClone === 'function') {
    return structuredClone(data);
  }
  return JSON.parse(JSON.stringify(data));
};

const defaultData = {
  id: 'root',
  title: 'Knowledge Atlas',
  description: 'An evolving constellation of things you are learning, exploring, and crafting.',
  tags: ['Vision', 'Meta'],
  notes: 'Use the create panel to seed your personal knowledge worlds. Notes are stored locally.',
  children: [
    {
      id: 'design',
      title: 'Design Languages',
      description: 'Frameworks, heuristics, and patterns guiding creative problem solving.',
      tags: ['Design Systems', 'UX'],
      notes: '',
      children: [
        {
          id: 'interaction',
          title: 'Interaction Patterns',
          description: 'Micro-interactions, motion languages, and state choreography.',
          tags: ['Motion', 'Feedback'],
          notes: '',
          children: []
        },
        {
          id: 'visual',
          title: 'Visual Semantics',
          description: 'Color narratives, typographic voices, and spatial rhythm.',
          tags: ['Color', 'Type', 'Composition'],
          notes: '',
          children: []
        }
      ]
    },
    {
      id: 'research',
      title: 'Research Lab',
      description: 'Insights, experiments, and protocols feeding future decisions.',
      tags: ['Interviews', 'Metrics'],
      notes: '',
      children: [
        {
          id: 'field',
          title: 'Field Studies',
          description: 'Ethnography, contextual inquiry, and observation notes.',
          tags: ['Context', 'Stories'],
          notes: '',
          children: []
        },
        {
          id: 'analytics',
          title: 'Product Analytics',
          description: 'Quantitative telemetry, dashboards, and anomaly detection.',
          tags: ['Data', 'KPIs'],
          notes: '',
          children: []
        }
      ]
    }
  ]
};

function uuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

class KnowledgeStore {
  constructor() {
    this.data = this.load();
  }

  load() {
    try {
      const stored = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (error) {
      console.warn('Failed to load stored knowledge tree:', error);
    }
    return clone(defaultData);
  }

  persist() {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(this.data));
    } catch (error) {
      console.warn('Failed to persist knowledge tree:', error);
    }
  }

  traverse(callback, node = this.data, depth = 0) {
    callback(node, depth);
    node.children?.forEach((child) => this.traverse(callback, child, depth + 1));
  }

  findById(id, node = this.data) {
    if (node.id === id) return node;
    for (const child of node.children || []) {
      const found = this.findById(id, child);
      if (found) return found;
    }
    return null;
  }

  collectFlat() {
    const nodes = [];
    this.traverse((node, depth) => nodes.push({ ...node, depth }));
    return nodes;
  }

  addEntry(parentId, entry) {
    const parent = this.findById(parentId);
    if (!parent) throw new Error('Parent node not found');

    const node = {
      id: uuid(),
      title: entry.title,
      description: entry.description,
      tags: entry.tags,
      notes: entry.notes ?? '',
      children: []
    };

    parent.children.push(node);
    this.persist();
    return node;
  }

  updateNotes(nodeId, notes) {
    const node = this.findById(nodeId);
    if (node) {
      node.notes = notes;
      this.persist();
    }
  }
}

class TreeRenderer {
  constructor(container) {
    this.container = container;
    this.scene = new THREE.Scene();
    this.scene.background = null;

    this.camera = new THREE.PerspectiveCamera(
      50,
      container.clientWidth / container.clientHeight,
      0.1,
      2000
    );
    this.camera.position.set(0, 40, 120);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(container.clientWidth, container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(container.clientWidth, container.clientHeight);
    this.labelRenderer.domElement.className = 'label-renderer';
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    container.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.labelRenderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.rotateSpeed = 0.6;
    this.controls.zoomSpeed = 0.8;
    this.controls.enablePan = true;
    this.controls.screenSpacePanning = true;

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.selectedId = null;

    const ambient = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(ambient);

    const keyLight = new THREE.DirectionalLight(0x8f9dff, 0.9);
    keyLight.position.set(60, 80, 40);
    this.scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x7f5af0, 1.1, 400);
    rimLight.position.set(-80, 30, -60);
    this.scene.add(rimLight);

    this.nodeGroup = new THREE.Group();
    this.linkGroup = new THREE.Group();
    this.scene.add(this.nodeGroup);
    this.scene.add(this.linkGroup);

    this.nodeObjects = new Map();

    window.addEventListener('resize', () => this.onResize());
    container.addEventListener('pointerdown', (event) => this.onPointerDown(event));

    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  setData(rootNode) {
    this.rootNode = rootNode;
    this.refresh();
  }

  refresh() {
    this.nodeGroup.children.slice().forEach((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose?.());
      } else {
        child.material?.dispose?.();
      }
      child.removeFromParent();
    });
    this.linkGroup.children.slice().forEach((child) => {
      if (child.geometry) {
        child.geometry.dispose();
      }
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose?.());
      } else {
        child.material?.dispose?.();
      }
      child.removeFromParent();
    });
    this.nodeGroup.clear();
    this.linkGroup.clear();
    this.nodeObjects.clear();

    if (!this.rootNode) return;

    const weights = new Map();
    const computeWeight = (node) => {
      let total = 1;
      node.children?.forEach((child) => {
        total += computeWeight(child);
      });
      weights.set(node.id, total);
      return total;
    };
    computeWeight(this.rootNode);

    const positionNode = (node, depth, angleStart, angleEnd) => {
      const angle = (angleStart + angleEnd) / 2;
      const radius = depth === 0 ? 0 : depth * 18 + 10;
      const yOffset = Math.sin(depth * 0.7) * 6;
      const jitter = depth === 0 ? 0 : (Math.random() - 0.5) * 4;
      const position = new THREE.Vector3(
        Math.cos(angle) * radius + jitter,
        yOffset,
        Math.sin(angle) * radius + jitter
      );

      this.createNode(node, position, depth);

      const childTotalWeight = node.children?.reduce((acc, child) => acc + weights.get(child.id), 0) ?? 0;
      let currentStart = angleStart;
      node.children?.forEach((child) => {
        const span = ((angleEnd - angleStart) * weights.get(child.id)) / childTotalWeight;
        positionNode(child, depth + 1, currentStart, currentStart + span);
        this.connectNodes(node.id, child.id);
        currentStart += span;
      });
    };

    positionNode(this.rootNode, 0, 0, Math.PI * 2);
  }

  createNode(node, position, depth) {
    const size = Math.max(6 - depth * 0.6, 2.4);
    const color = new THREE.Color().setHSL((depth * 0.1) % 1, 0.65, 0.6);
    const geometry = new THREE.SphereGeometry(size, 36, 36);
    const material = new THREE.MeshStandardMaterial({
      color,
      emissive: color.clone().multiplyScalar(0.2),
      roughness: 0.35,
      metalness: 0.4
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.copy(position);
    mesh.castShadow = true;
    mesh.userData = { id: node.id, depth };
    this.nodeGroup.add(mesh);

    const labelElement = document.createElement('div');
    labelElement.className = 'node-label';
    labelElement.textContent = node.title;
    const label = new CSS2DObject(labelElement);
    label.position.set(0, size + 2.2, 0);
    mesh.add(label);

    this.nodeObjects.set(node.id, { mesh, label });
  }

  connectNodes(parentId, childId) {
    const parentObject = this.nodeObjects.get(parentId);
    const childObject = this.nodeObjects.get(childId);
    if (!parentObject || !childObject) return;

    const points = [parentObject.mesh.position, childObject.mesh.position];
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    const material = new THREE.LineBasicMaterial({
      color: 0x404b7c,
      transparent: true,
      opacity: 0.75
    });
    const line = new THREE.Line(geometry, material);
    this.linkGroup.add(line);
  }

  onPointerDown(event) {
    const bounds = this.container.getBoundingClientRect();
    this.pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
    this.pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;

    this.raycaster.setFromCamera(this.pointer, this.camera);
    const intersects = this.raycaster.intersectObjects(this.nodeGroup.children, false);
    if (intersects.length > 0) {
      const id = intersects[0].object.userData.id;
      this.selectNode(id);
      document.dispatchEvent(new CustomEvent('node:selected', { detail: { id } }));
    }
  }

  selectNode(id) {
    if (this.selectedId && this.nodeObjects.has(this.selectedId)) {
      const previous = this.nodeObjects.get(this.selectedId);
      previous.mesh.scale.setScalar(1);
      previous.mesh.material.emissiveIntensity = 1;
    }

    if (id && this.nodeObjects.has(id)) {
      const current = this.nodeObjects.get(id);
      current.mesh.scale.setScalar(1.2);
      current.mesh.material.emissiveIntensity = 1.8;
      this.selectedId = id;
    }
  }

  focusAll() {
    this.controls.reset();
    this.camera.position.set(0, 40, 120);
  }

  onResize() {
    const { clientWidth, clientHeight } = this.container;
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(clientWidth, clientHeight);
    this.labelRenderer.setSize(clientWidth, clientHeight);
  }

  animate() {
    requestAnimationFrame(this.animate);
    this.controls.update();
    const rotationSpeed = 0.0006;
    this.nodeGroup.rotation.y += rotationSpeed;
    this.linkGroup.rotation.y += rotationSpeed;
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}

function initialiseUI(store, renderer) {
  const parentSelect = document.querySelector('#parentSelect');
  const createForm = document.querySelector('#createForm');
  const selectionTitle = document.querySelector('#selectedTitle');
  const selectionDescription = document.querySelector('#selectedDescription');
  const selectionMeta = document.querySelector('#selectedMeta');
  const notesInput = document.querySelector('#notesInput');
  const saveNotesButton = document.querySelector('#saveNotes');
  const expandAllButton = document.querySelector('#expandAll');

  const renderParentOptions = () => {
    parentSelect.innerHTML = '';
    store.traverse((node, depth) => {
      const option = document.createElement('option');
      option.value = node.id;
      option.textContent = `${'• '.repeat(depth)}${node.title}`;
      parentSelect.appendChild(option);
    });
  };

  const renderSelection = (node) => {
    if (!node) {
      selectionTitle.textContent = 'Select a node';
      selectionDescription.textContent = 'Click a node to explore its knowledge capsule.';
      selectionMeta.innerHTML = '';
      notesInput.value = '';
      return;
    }

    selectionTitle.textContent = node.title;
    selectionDescription.textContent = node.description || 'No description yet.';
    selectionMeta.innerHTML = '';
    (node.tags || []).forEach((tag) => {
      const item = document.createElement('li');
      item.textContent = tag;
      selectionMeta.appendChild(item);
    });
    notesInput.value = node.notes || '';
  };

  renderParentOptions();

  createForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const title = document.querySelector('#titleInput').value.trim();
    if (!title) return;

    const newEntry = {
      title,
      description: document.querySelector('#descriptionInput').value.trim(),
      tags: document
        .querySelector('#tagsInput')
        .value.split(',')
        .map((tag) => tag.trim())
        .filter(Boolean)
    };

    const parentId = parentSelect.value;
    const node = store.addEntry(parentId, newEntry);
    renderer.setData(store.data);
    renderParentOptions();
    parentSelect.value = parentId;
    createForm.reset();
    renderer.selectNode(node.id);
    renderSelection(store.findById(node.id));
  });

  saveNotesButton.addEventListener('click', () => {
    if (!renderer.selectedId) return;
    store.updateNotes(renderer.selectedId, notesInput.value);
  });

  expandAllButton.addEventListener('click', () => {
    renderer.focusAll();
  });

  document.addEventListener('node:selected', (event) => {
    const node = store.findById(event.detail.id);
    renderer.selectNode(node.id);
    renderSelection(node);
  });

  renderSelection(store.data);
}

function bootstrap() {
  const container = document.querySelector('#scene');
  const store = new KnowledgeStore();
  const renderer = new TreeRenderer(container);
  renderer.setData(store.data);
  initialiseUI(store, renderer);
}

document.addEventListener('DOMContentLoaded', bootstrap);

const style = document.createElement('style');
style.textContent = `
  .label-renderer {
    pointer-events: none;
  }
  .node-label {
    padding: 0.35rem 0.65rem;
    background: rgba(8, 12, 21, 0.65);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 999px;
    font-size: 0.65rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    color: rgba(230, 235, 255, 0.9);
    white-space: nowrap;
    backdrop-filter: blur(6px);
  }
`;
document.head.appendChild(style);

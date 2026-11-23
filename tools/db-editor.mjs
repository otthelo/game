import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { exec } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GAMEPLAY_TS = path.join(ROOT, "server", "src", "config", "gameplay.ts");
const ITEMS_TS = path.join(ROOT, "server", "src", "config", "items.ts");
const GAMEPLAY_JS = path.join(ROOT, "server", "dist", "config", "gameplay.js");
const ITEMS_JS = path.join(ROOT, "server", "dist", "config", "items.js");
const MAP_JS = path.join(ROOT, "server", "dist", "config", "map.js");
const PORT = Number(process.env.DB_EDITOR_PORT || 4545);

const ITEM_KIND_NAMES = {
  0: "ItemKind.Material",
  1: "ItemKind.Consumable",
  2: "ItemKind.Weapon",
  3: "ItemKind.Armor",
  4: "ItemKind.Wing",
  5: "ItemKind.Garment",
};

async function readDatabase() {
  const bust = `?t=${Date.now()}`;
  const gameplayMod = await import(pathToFileURL(GAMEPLAY_JS).href + bust);
  const itemsMod = await import(pathToFileURL(ITEMS_JS).href + bust);
  const mapMod = await import(pathToFileURL(MAP_JS).href + bust);
  return {
    monsters: gameplayMod.MONSTER_TYPES,
    items: itemsMod.ITEMS,
    maps: Object.fromEntries(
      Object.values(mapMod.MAPS).map((map) => [
        map.id,
        {
          id: map.id,
          name: map.name,
          width: map.width,
          height: map.height,
          tileSize: map.tileSize,
          monsterSpawns: map.monsterSpawns,
        },
      ]),
    ),
  };
}

function serializeMonsters(monsters) {
  const ids = Object.keys(monsters)
    .map(Number)
    .sort((a, b) => a - b);

  const entries = ids.map((id) => {
    const m = monsters[id];
    const lootLines = (m.loot || [])
      .map(
        (l) =>
          `            { itemId: ${JSON.stringify(String(l.itemId))}, chance: ${Number(l.chance)}, min: ${Number(l.min)}, max: ${Number(l.max)} },`,
      )
      .join("\n");

    return `    ${id}: {
        name: ${JSON.stringify(String(m.name))},
        level: ${Number(m.level) || 1},
        element: ${JSON.stringify(String(m.element || "neutral"))},
        aggressive: ${Boolean(m.aggressive)},
        maxHp: ${Number(m.maxHp) || 10},
        speed: ${Number(m.speed) || 40},
        damage: ${Number(m.damage) || 1},
        def: ${Number(m.def) || 0},
        mdef: ${Number(m.mdef) || 0},
        flee: ${Number(m.flee) || 0},
        hit: ${Number(m.hit) || 100},
        attackRange: ${Number(m.attackRange) || 30},
        aggroRange: ${Number(m.aggroRange) || 140},
        attackCooldownMs: ${Number(m.attackCooldownMs) || 1200},
        xp: ${Number(m.xp) || 10},
        jobXp: ${Number(m.jobXp) || 5},
        respawnMs: ${Number(m.respawnMs) ?? 10000},
        radius: ${Number(m.radius) || 8},
        goldMin: ${Number(m.goldMin) || 0},
        goldMax: ${Number(m.goldMax) || 0},
        loot: [
${lootLines}
        ],
    },`;
  });

  return `export const MONSTER_TYPES: Record<number, MonsterDefinition> = {\n${entries.join("\n")}\n};\n`;
}

function serializeItems(items) {
  const entries = Object.values(items).map((it) => {
    const kindExpr = ITEM_KIND_NAMES[Number(it.kind)] ?? "ItemKind.Material";
    const lines = [
      `        id: ${JSON.stringify(String(it.id))},`,
      `        name: ${JSON.stringify(String(it.name))},`,
      `        kind: ${kindExpr},`,
      `        icon: ${JSON.stringify(String(it.icon || "unknown"))},`,
      `        color: ${JSON.stringify(String(it.color || "#ffffff"))},`,
      `        description: ${JSON.stringify(String(it.description || ""))},`,
      `        stackLimit: ${Number(it.stackLimit) || 1},`,
      `        sellPrice: ${Number(it.sellPrice) || 0},`,
    ];
    if (it.heal !== undefined && it.heal !== "" && Number(it.heal) > 0) {
      lines.push(`        heal: ${Number(it.heal)},`);
    }
    if (it.attack !== undefined && it.attack !== "" && Number(it.attack) !== 0) {
      lines.push(`        attack: ${Number(it.attack)},`);
    }
    if (it.maxHp !== undefined && it.maxHp !== "" && Number(it.maxHp) !== 0) {
      lines.push(`        maxHp: ${Number(it.maxHp)},`);
    }
    if (it.maxSp !== undefined && it.maxSp !== "" && Number(it.maxSp) !== 0) {
      lines.push(`        maxSp: ${Number(it.maxSp)},`);
    }
    return `    ${JSON.stringify(String(it.id))}: {\n${lines.join("\n")}\n    },`;
  });

  return `export const ITEMS = {\n${entries.join("\n")}\n};`;
}

function writeMonstersTs(monsters) {
  const src = fs.readFileSync(GAMEPLAY_TS, "utf8");
  const marker = "export const MONSTER_TYPES: Record<number, MonsterDefinition> = {";
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error("MONSTER_TYPES marker not found in gameplay.ts");
  const next = src.slice(0, idx) + serializeMonsters(monsters);
  fs.writeFileSync(GAMEPLAY_TS, next, "utf8");
}

function writeItemsTs(items) {
  const src = fs.readFileSync(ITEMS_TS, "utf8");
  const startMarker = "export const ITEMS = {";
  const endMarker = "export const STARTER_INVENTORY = [";
  const startIdx = src.indexOf(startMarker);
  const endIdx = src.indexOf(endMarker);
  if (startIdx === -1 || endIdx === -1) throw new Error("ITEMS markers not found in items.ts");
  const next = src.slice(0, startIdx) + serializeItems(items) + "\n" + src.slice(endIdx);
  fs.writeFileSync(ITEMS_TS, next, "utf8");
}

function writeSpawnOverridesTs(overrides) {
  const mapTs = path.join(ROOT, "server", "src", "config", "map.ts");
  const src = fs.readFileSync(mapTs, "utf8");
  const marker = "export const MONSTER_SPAWN_OVERRIDES:";
  const idx = src.indexOf(marker);
  if (idx === -1) throw new Error("MONSTER_SPAWN_OVERRIDES marker not found in map.ts");
  const entries = Object.entries(overrides)
    .filter(([, spawns]) => Array.isArray(spawns))
    .map(([mapId, spawns]) => {
      const rows = spawns
        .map((spawn) => `        { kind: ${Number(spawn.kind)}, tx: ${Number(spawn.tx)}, ty: ${Number(spawn.ty)} },`)
        .join("\n");
      return `    ${JSON.stringify(mapId)}: [\n${rows}\n    ],`;
    })
    .join("\n");
  const serialized = `export const MONSTER_SPAWN_OVERRIDES: Record<string, Array<{ kind: number; tx: number; ty: number }>> = {\n${entries}\n};\n`;
  const nextMarker = src.indexOf("export const NPC_DIALOGS", idx);
  if (nextMarker === -1) throw new Error("NPC_DIALOGS marker not found in map.ts");
  fs.writeFileSync(mapTs, src.slice(0, idx) + serialized + src.slice(nextMarker), "utf8");
}

function buildServer() {
  return new Promise((resolve, reject) => {
    exec("npm --prefix server run build", { cwd: ROOT }, (err, stdout, stderr) => {
      if (err) reject(new Error(stderr || stdout || err.message));
      else resolve(stdout);
    });
  });
}

const HTML = `<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pixel Realms — Monster & Item Database Editor</title>
<style>
  :root { color-scheme: dark; --bg:#0c1414; --panel:#13201c; --border:#2b473a; --gold:#f4c95d; --green:#7fdb72; --red:#e06a5a; --text:#e8f1d8; --muted:#86a58a; }
  * { box-sizing: border-box; font-family: system-ui, -apple-system, Segoe UI, sans-serif; }
  body { margin:0; background:var(--bg); color:var(--text); }
  header { display:flex; align-items:center; justify-content:space-between; padding:14px 22px; background:#09100f; border-bottom:1px solid var(--border); }
  h1 { margin:0; font-size:18px; color:var(--gold); }
  .tabs { display:flex; gap:8px; }
  .tab { padding:8px 16px; border:1px solid var(--border); background:var(--panel); color:var(--text); border-radius:6px; cursor:pointer; font-weight:600; }
  .tab.active { border-color:var(--gold); color:var(--gold); background:#1b2f27; }
  .layout { display:grid; grid-template-columns:300px 1fr; height:calc(100vh - 58px); }
  .sidebar { border-right:1px solid var(--border); padding:12px; overflow:auto; background:#0f1916; }
  .main { padding:20px; overflow:auto; }
  .list-item { padding:9px 11px; border:1px solid transparent; border-radius:6px; cursor:pointer; display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
  .list-item:hover { background:#182923; }
  .list-item.active { background:#1c332a; border-color:var(--gold); }
  .badge { font-size:12px; color:var(--muted); }
  .btn { padding:8px 14px; border:1px solid var(--border); background:#193026; color:var(--text); border-radius:6px; cursor:pointer; font-weight:600; }
  .btn:hover { border-color:var(--gold); }
  .btn-primary { background:#27523a; border-color:var(--green); color:#fff; }
  .btn-danger { background:#4a1d1d; border-color:var(--red); color:#ffd5cf; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(180px, 1fr)); gap:12px; margin-bottom:16px; }
  label { display:flex; flex-direction:column; gap:4px; font-size:12px; color:var(--muted); }
  input, select, textarea { padding:7px 9px; border:1px solid var(--border); background:#09100f; color:var(--text); border-radius:5px; font-size:14px; }
  .loot-row { display:grid; grid-template-columns:2fr 1fr 1fr 1fr auto; gap:8px; margin-bottom:8px; align-items:center; }
  .toast { position:fixed; bottom:18px; right:18px; padding:10px 16px; border-radius:6px; background:#193026; border:1px solid var(--green); color:#fff; display:none; font-weight:600; }
  .toast.err { background:#4a1d1d; border-color:var(--red); }
  .preview-box { border:1px solid var(--border); border-radius:8px; background:#09100f; min-height:220px; display:flex; align-items:center; justify-content:center; margin-bottom:12px; overflow:hidden; }
  .preview-box img { max-width:220px; max-height:220px; image-rendering:pixelated; }
  .preview-controls { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:12px; }
  .spawn-row { display:grid; grid-template-columns:2fr 1fr 1fr auto; gap:8px; margin-bottom:8px; }
  .data-box { max-width:720px; border:1px solid var(--border); border-radius:8px; padding:16px; background:#101917; }
</style>
</head>
<body>
<header>
  <h1>Pixel Realms — Monster & Item Database Tool</h1>
  <div class="tabs">
    <button class="tab active" onclick="switchTab('monsters')">Monsters</button>
    <button class="tab" onclick="switchTab('items')">Items</button>
    <button class="tab" onclick="switchTab('spawns')">Spawns</button>
    <button class="tab" onclick="switchTab('data')">Data</button>
  </div>
</header>
<div class="layout">
  <div class="sidebar">
    <button class="btn btn-primary" style="width:100%;margin-bottom:10px" onclick="createNew()">+ Tambah Baru</button>
    <div id="list"></div>
  </div>
  <div class="main" id="editor"></div>
</div>
<div id="toast" class="toast"></div>

<script>
let db = { monsters: {}, items: {}, maps: {} };
let tab = 'monsters';
let selectedKey = null;
let selectedMap = null;

function showToast(msg, isErr = false) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast' + (isErr ? ' err' : '');
  el.style.display = 'block';
  clearTimeout(window._t);
  window._t = setTimeout(() => el.style.display = 'none', 3200);
}

async function loadDb() {
  const res = await fetch('/api/db');
  db = await res.json();
  if (tab === 'monsters') {
    const keys = Object.keys(db.monsters);
    if (!selectedKey || !db.monsters[selectedKey]) selectedKey = keys[0] ?? null;
  } else if (tab === 'items') {
    const keys = Object.keys(db.items);
    if (!selectedKey || !db.items[selectedKey]) selectedKey = keys[0] ?? null;
  } else if (tab === 'spawns') {
    const keys = Object.keys(db.maps);
    if (!selectedMap || !db.maps[selectedMap]) selectedMap = keys[0] ?? null;
  }
  render();
}

function switchTab(next) {
  tab = next;
  selectedKey = null;
  document.querySelectorAll('.tab').forEach((b, i) => b.classList.toggle('active',
    (i === 0 && tab === 'monsters') ||
    (i === 1 && tab === 'items') ||
    (i === 2 && tab === 'spawns') ||
    (i === 3 && tab === 'data')));
  loadDb();
}

function createNew() {
  if (tab === 'monsters') {
    const ids = Object.keys(db.monsters).map(Number);
    const nextId = ids.length ? Math.max(...ids) + 1 : 0;
    selectedKey = String(nextId);
    db.monsters[selectedKey] = {
      name: 'New Monster', level: 1, element: 'neutral', aggressive: false,
      maxHp: 50, speed: 50, damage: 8, def: 2, mdef: 2, flee: 10, hit: 100,
      attackRange: 30, aggroRange: 140, attackCooldownMs: 1200,
      xp: 25, jobXp: 18, respawnMs: 10000, radius: 8, goldMin: 2, goldMax: 8, loot: []
    };
  } else {
    const id = 'new-item-' + Date.now().toString().slice(-4);
    selectedKey = id;
    db.items[id] = {
      id, name: 'New Item', kind: 0, icon: 'unknown', color: '#cfe8c8',
      description: 'Deskripsi item baru.', stackLimit: 99, sellPrice: 5
    };
  }
  render();
}

function render() {
  const listEl = document.getElementById('list');
  listEl.innerHTML = '';
  const addButton = document.querySelector('.sidebar .btn-primary');
  if (addButton) addButton.style.display = (tab === 'monsters' || tab === 'items') ? '' : 'none';
  if (tab === 'monsters') {
    Object.keys(db.monsters).sort((a,b) => Number(a)-Number(b)).forEach(id => {
      const m = db.monsters[id];
      const div = document.createElement('div');
      div.className = 'list-item' + (selectedKey === id ? ' active' : '');
      div.innerHTML = \`<span><b>#\${id}</b> \${m.name}</span><span class="badge">Lv.\${m.level}</span>\`;
      div.onclick = () => { selectedKey = id; render(); };
      listEl.appendChild(div);
    });
    renderMonsterForm();
  } else if (tab === 'items') {
    Object.keys(db.items).forEach(id => {
      const it = db.items[id];
      const div = document.createElement('div');
      div.className = 'list-item' + (selectedKey === id ? ' active' : '');
      div.innerHTML = \`<span>\${it.name}</span><span class="badge">\${id}</span>\`;
      div.onclick = () => { selectedKey = id; render(); };
      listEl.appendChild(div);
    });
    renderItemForm();
  } else if (tab === 'spawns') {
    Object.values(db.maps).forEach(map => {
      const div = document.createElement('div');
      div.className = 'list-item' + (selectedMap === map.id ? ' active' : '');
      div.innerHTML = \`<span>\${map.name}</span><span class="badge">\${map.id}</span>\`;
      div.onclick = () => { selectedMap = map.id; render(); };
      listEl.appendChild(div);
    });
    renderSpawnEditor();
  } else {
    renderDataEditor();
  }
}

function renderMonsterForm() {
  const ed = document.getElementById('editor');
  const m = db.monsters[selectedKey];
  if (!m) { ed.innerHTML = '<p>Pilih atau tambah monster.</p>'; return; }
  const itemOpts = Object.keys(db.items).map(id => \`<option value="\${id}">\${db.items[id].name} (\${id})</option>\`).join('');
  const lootHtml = (m.loot || []).map((l, idx) => \`
    <div class="loot-row">
      <select onchange="db.monsters[selectedKey].loot[\${idx}].itemId=this.value">
        \${Object.keys(db.items).map(id => \`<option value="\${id}" \${id===l.itemId?'selected':''}>\${db.items[id].name} (\${id})</option>\`).join('')}
      </select>
      <input type="number" step="0.001" value="\${l.chance}" placeholder="Chance (0-1)" onchange="db.monsters[selectedKey].loot[\${idx}].chance=Number(this.value)" />
      <input type="number" value="\${l.min}" placeholder="Min" onchange="db.monsters[selectedKey].loot[\${idx}].min=Number(this.value)" />
      <input type="number" value="\${l.max}" placeholder="Max" onchange="db.monsters[selectedKey].loot[\${idx}].max=Number(this.value)" />
      <button class="btn btn-danger" onclick="db.monsters[selectedKey].loot.splice(\${idx},1);renderMonsterForm()">X</button>
    </div>
  \`).join('');

  ed.innerHTML = \`
    <h2 style="margin-top:0;color:var(--gold)">Monster #\${selectedKey} — \${m.name}</h2>
    <div class="preview-controls">
      <label>Aksi<select id="preview_action" onchange="updateMonsterPreview()">
        <option value="Idle">Idle</option><option value="Walk">Walk</option>
        <option value="Attack">Attack</option><option value="Hurt">Hurt</option><option value="Death">Death</option>
      </select></label>
      <label>Direction<select id="preview_dir" onchange="updateMonsterPreview()">
        <option value="front">Front</option><option value="left">Left</option>
        <option value="right">Right</option><option value="back">Back</option>
      </select></label>
    </div>
    <div class="preview-box" id="monster_preview"></div>
    <div class="grid">
      <label>ID (Angka)<input id="m_id" type="number" value="\${selectedKey}" /></label>
      <label>Nama<input id="m_name" value="\${m.name}" /></label>
      <label>Level<input id="m_level" type="number" value="\${m.level}" /></label>
      <label>Elemen<select id="m_element">
        \${['neutral','water','fire','poison','earth','dark'].map(e=>\`<option value="\${e}" \${m.element===e?'selected':''}>\${e}</option>\`).join('')}
      </select></label>
      <label>Agresif<select id="m_aggressive">
        <option value="true" \${m.aggressive?'selected':''}>Ya (Agresif)</option>
        <option value="false" \${!m.aggressive?'selected':''}>Tidak (Pasif)</option>
      </select></label>
      <label>Max HP<input id="m_maxHp" type="number" value="\${m.maxHp}" /></label>
      <label>Damage<input id="m_damage" type="number" value="\${m.damage}" /></label>
      <label>Move Speed<input id="m_speed" type="number" value="\${m.speed}" /></label>
      <label>DEF<input id="m_def" type="number" value="\${m.def}" /></label>
      <label>MDEF<input id="m_mdef" type="number" value="\${m.mdef}" /></label>
      <label>HIT<input id="m_hit" type="number" value="\${m.hit}" /></label>
      <label>FLEE<input id="m_flee" type="number" value="\${m.flee}" /></label>
      <label>Base EXP<input id="m_xp" type="number" value="\${m.xp}" /></label>
      <label>Job EXP<input id="m_jobXp" type="number" value="\${m.jobXp}" /></label>
      <label>Aggro Range<input id="m_aggroRange" type="number" value="\${m.aggroRange}" /></label>
      <label>Attack Range<input id="m_attackRange" type="number" value="\${m.attackRange}" /></label>
      <label>Cooldown (ms)<input id="m_attackCooldownMs" type="number" value="\${m.attackCooldownMs}" /></label>
      <label>Respawn (ms)<input id="m_respawnMs" type="number" value="\${m.respawnMs}" /></label>
      <label>Gold Min<input id="m_goldMin" type="number" value="\${m.goldMin}" /></label>
      <label>Gold Max<input id="m_goldMax" type="number" value="\${m.goldMax}" /></label>
      <label>Radius<input id="m_radius" type="number" value="\${m.radius}" /></label>
    </div>
    <h3>Drop Loot</h3>
    <div>\${lootHtml}</div>
    <button class="btn" onclick="db.monsters[selectedKey].loot.push({itemId:Object.keys(db.items)[0]||'moss-jelly',chance:0.5,min:1,max:1});renderMonsterForm()">+ Tambah Drop</button>
    <div style="margin-top:20px;display:flex;gap:10px">
      <button class="btn btn-primary" onclick="saveMonster()">Simpan & Build Server</button>
      <button class="btn btn-danger" onclick="deleteMonster()">Hapus Monster</button>
    </div>
  \`;
  updateMonsterPreview();
}

function monsterSpritePath(action, dir) {
  const name = (db.monsters[selectedKey]?.name || '').toLowerCase();
  if (name.includes('marin')) return '/assets/sprites/monster/Marin_' + action + '_' + dir + '.png';
  if (name.includes('magmaring')) return '/assets/sprites/monster/Magmaring_' + action + '_' + dir + '.png';
  if (name.includes('poporing') || name.includes('venom poring')) return '/assets/sprites/monster/Poporing_' + action + '_' + dir + '.png';
  if (name === 'huskar') return '/assets/sprites/monster/Huskar/Huskar_' + dir + '_' + action.toLowerCase() + '.png';
  if (name === 'high orc') return '/assets/sprites/monster/High_Orc/High_Orc_' + dir + '_' + action.toLowerCase() + '.png';
  if (name === 'orc hero') return '/assets/sprites/monster/Orc Hero/Orc hero_' + dir + '_' + action.toLowerCase() + '.png';
  if (name === 'orc lord') return '/assets/sprites/monster/Orc Lord/Orc Lord_' + dir + '_' + action.toLowerCase() + '.png';
  if (name === 'orc') return '/assets/sprites/monster/Orc/orc_' + dir + '_' + action.toLowerCase() + '.png';
  if (name === 'pochi') {
    if (action === 'Idle') return '/assets/sprites/monster/Pochi/Pochi_iddle_' + dir + '.png';
    if (action === 'Walk') return '/assets/sprites/monster/Pochi/pochi_walk_' + dir + '.png';
    if (action === 'Attack') {
      if (dir === 'left') return '/assets/sprites/monster/Pochi/Pochi_attack_left.png';
      if (dir === 'right') return '/assets/sprites/monster/Pochi/Pochi_attack_right.png';
      return '/assets/sprites/monster/Pochi/pochi_attack_back.png';
    }
    if (action === 'Hurt') return '/assets/sprites/monster/Pochi/Pochi_hurt_' + (dir === 'back' ? 'back' : 'front') + '.png';
    return '/assets/sprites/monster/Pochi/Pochi_death_' + (dir === 'back' ? 'back' : 'front') + '.png';
  }
  if (name === 'plant 1') return '/assets/sprites/monster/Plant/Plant1_' + action + '_' + dir + '.png';
  if (name === 'plant 2') return '/assets/sprites/monster/Plant/Plant2_' + action + '_' + dir + '.png';
  return null;
}

function updateMonsterPreview() {
  const box = document.getElementById('monster_preview');
  if (!box) return;
  const action = document.getElementById('preview_action')?.value || 'Idle';
  const dir = document.getElementById('preview_dir')?.value || 'front';
  const src = monsterSpritePath(action, dir);
  box.innerHTML = src
    ? '<img src="' + src + '" alt="Preview ' + (db.monsters[selectedKey]?.name || '') + '" onerror="this.replaceWith(Object.assign(document.createElement(\\'p\\'),{textContent:\\'Sprite tidak tersedia\\'}))" />'
    : '<p style="color:var(--muted)">Sprite preview belum tersedia untuk monster ini.</p>';
}

function renderSpawnEditor() {
  const ed = document.getElementById('editor');
  const map = db.maps[selectedMap];
  if (!map) { ed.innerHTML = '<p>Pilih map.</p>'; return; }
  const rows = (map.monsterSpawns || []).map((spawn, idx) => {
    const options = Object.keys(db.monsters).sort((a,b)=>Number(a)-Number(b)).map(id =>
      '<option value="' + id + '" ' + (Number(id)===Number(spawn.kind)?'selected':'') + '>#' + id + ' ' + db.monsters[id].name + '</option>'
    ).join('');
    return '<div class="spawn-row">' +
      '<select onchange="db.maps[selectedMap].monsterSpawns[' + idx + '].kind=Number(this.value)">' + options + '</select>' +
      '<input type="number" min="0" value="' + spawn.tx + '" placeholder="Tile X" onchange="db.maps[selectedMap].monsterSpawns[' + idx + '].tx=Number(this.value)" />' +
      '<input type="number" min="0" value="' + spawn.ty + '" placeholder="Tile Y" onchange="db.maps[selectedMap].monsterSpawns[' + idx + '].ty=Number(this.value)" />' +
      '<button class="btn btn-danger" onclick="db.maps[selectedMap].monsterSpawns.splice(' + idx + ',1);renderSpawnEditor()">X</button>' +
      '</div>';
  }).join('');
  ed.innerHTML = \`
    <h2 style="margin-top:0;color:var(--gold)">Spawn — \${map.name}</h2>
    <p class="badge">ID: \${map.id} | Tile: \${map.tileSize}px | Ukuran: \${map.width}×\${map.height}px</p>
    <div>\${rows}</div>
    <div style="display:flex;gap:10px;margin-top:12px">
      <button class="btn" onclick="db.maps[selectedMap].monsterSpawns.push({kind:Number(Object.keys(db.monsters)[0]||0),tx:0,ty:0});renderSpawnEditor()">+ Tambah Spawn</button>
      <button class="btn btn-primary" onclick="saveSpawns()">Simpan Semua Spawn</button>
    </div>
  \`;
}

async function saveSpawns() {
  const overrides = {};
  Object.values(db.maps).forEach(map => { overrides[map.id] = map.monsterSpawns || []; });
  showToast('Menyimpan spawn & build server...');
  const res = await fetch('/api/spawns', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(overrides)});
  const data = await res.json();
  if (!res.ok) { showToast(data.error || 'Gagal menyimpan spawn', true); return; }
  showToast('Spawn berhasil disimpan!');
  await loadDb();
}

function renderDataEditor() {
  const ed = document.getElementById('editor');
  ed.innerHTML = \`
    <h2 style="margin-top:0;color:var(--gold)">Database Import / Export</h2>
    <div class="data-box">
      <p>Ekspor monster, item, dan spawn saat ini ke satu file JSON.</p>
      <button class="btn btn-primary" onclick="exportDatabase()">Export JSON</button>
      <hr style="border:0;border-top:1px solid var(--border);margin:18px 0" />
      <p>Import akan mengganti monster, item, dan spawn berdasarkan isi file.</p>
      <input id="import_file" type="file" accept=".json,application/json" />
      <div style="margin-top:12px">
        <button class="btn" onclick="importDatabase()">Import & Build Server</button>
      </div>
    </div>
  \`;
}

function exportDatabase() {
  const payload = { monsters: db.monsters, items: db.items, spawns: Object.fromEntries(Object.values(db.maps).map(map => [map.id, map.monsterSpawns || []])) };
  const blob = new Blob([JSON.stringify(payload, null, 2)], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'pixel-realms-db-' + new Date().toISOString().slice(0,10) + '.json';
  link.click();
  URL.revokeObjectURL(url);
  showToast('Database diekspor');
}

async function importDatabase() {
  const input = document.getElementById('import_file');
  const file = input?.files?.[0];
  if (!file) { showToast('Pilih file JSON terlebih dahulu', true); return; }
  try {
    const payload = JSON.parse(await file.text());
    if (!payload || typeof payload.monsters !== 'object' || typeof payload.items !== 'object') {
      throw new Error('Format JSON harus memiliki monsters dan items');
    }
    showToast('Mengimpor & build server...');
    const res = await fetch('/api/import', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data = await res.json();
    if (!res.ok) { showToast(data.error || 'Import gagal', true); return; }
    showToast('Database berhasil diimpor!');
    await loadDb();
  } catch (err) {
    showToast(err.message || 'File JSON tidak valid', true);
  }
}

function renderItemForm() {
  const ed = document.getElementById('editor');
  const it = db.items[selectedKey];
  if (!it) { ed.innerHTML = '<p>Pilih atau tambah item.</p>'; return; }
  const icons = ['jelly','wing','potion-red','potion-blue','sword-rusty','sword-bronze','sword-hunter','vest-cloth','vest-leather','vest-iron','wing-monarch','cloak','unknown'];
  const kinds = [[0,'Material'],[1,'Consumable'],[2,'Weapon'],[3,'Armor'],[4,'Wing'],[5,'Garment']];
  ed.innerHTML = \`
    <h2 style="margin-top:0;color:var(--gold)">Item — \${it.name}</h2>
    <div class="grid">
      <label>Item ID (slug)<input id="i_id" value="\${it.id}" /></label>
      <label>Nama<input id="i_name" value="\${it.name}" /></label>
      <label>Kategori<select id="i_kind">
        \${kinds.map(([k,n])=>\`<option value="\${k}" \${Number(it.kind)===k?'selected':''}>\${n}</option>\`).join('')}
      </select></label>
      <label>Icon<select id="i_icon">
        \${icons.map(ic=>\`<option value="\${ic}" \${it.icon===ic?'selected':''}>\${ic}</option>\`).join('')}
      </select></label>
      <label>Warna Hex<input id="i_color" value="\${it.color}" /></label>
      <label>Stack Limit<input id="i_stackLimit" type="number" value="\${it.stackLimit}" /></label>
      <label>Harga Jual (GP)<input id="i_sellPrice" type="number" value="\${it.sellPrice}" /></label>
      <label>Heal HP<input id="i_heal" type="number" value="\${it.heal ?? 0}" /></label>
      <label>+ ATK<input id="i_attack" type="number" value="\${it.attack ?? 0}" /></label>
      <label>+ Max HP<input id="i_maxHp" type="number" value="\${it.maxHp ?? 0}" /></label>
      <label>+ Max SP<input id="i_maxSp" type="number" value="\${it.maxSp ?? 0}" /></label>
    </div>
    <label style="margin-bottom:16px">Deskripsi<textarea id="i_description" rows="2">\${it.description ?? ''}</textarea></label>
    <div style="display:flex;gap:10px">
      <button class="btn btn-primary" onclick="saveItem()">Simpan & Build Server</button>
      <button class="btn btn-danger" onclick="deleteItem()">Hapus Item</button>
    </div>
  \`;
}

async function saveMonster() {
  const newId = String(Number(document.getElementById('m_id').value));
  const m = {
    name: document.getElementById('m_name').value.trim(),
    level: Number(document.getElementById('m_level').value),
    element: document.getElementById('m_element').value,
    aggressive: document.getElementById('m_aggressive').value === 'true',
    maxHp: Number(document.getElementById('m_maxHp').value),
    damage: Number(document.getElementById('m_damage').value),
    speed: Number(document.getElementById('m_speed').value),
    def: Number(document.getElementById('m_def').value),
    mdef: Number(document.getElementById('m_mdef').value),
    hit: Number(document.getElementById('m_hit').value),
    flee: Number(document.getElementById('m_flee').value),
    xp: Number(document.getElementById('m_xp').value),
    jobXp: Number(document.getElementById('m_jobXp').value),
    aggroRange: Number(document.getElementById('m_aggroRange').value),
    attackRange: Number(document.getElementById('m_attackRange').value),
    attackCooldownMs: Number(document.getElementById('m_attackCooldownMs').value),
    respawnMs: Number(document.getElementById('m_respawnMs').value),
    goldMin: Number(document.getElementById('m_goldMin').value),
    goldMax: Number(document.getElementById('m_goldMax').value),
    radius: Number(document.getElementById('m_radius').value),
    loot: db.monsters[selectedKey].loot || []
  };
  if (newId !== selectedKey) delete db.monsters[selectedKey];
  db.monsters[newId] = m;
  selectedKey = newId;
  await persist('/api/monsters', db.monsters);
}

async function deleteMonster() {
  if (!confirm('Hapus monster #' + selectedKey + '?')) return;
  delete db.monsters[selectedKey];
  selectedKey = null;
  await persist('/api/monsters', db.monsters);
}

async function saveItem() {
  const newId = document.getElementById('i_id').value.trim();
  const it = {
    id: newId,
    name: document.getElementById('i_name').value.trim(),
    kind: Number(document.getElementById('i_kind').value),
    icon: document.getElementById('i_icon').value,
    color: document.getElementById('i_color').value.trim(),
    stackLimit: Number(document.getElementById('i_stackLimit').value),
    sellPrice: Number(document.getElementById('i_sellPrice').value),
    heal: Number(document.getElementById('i_heal').value) || undefined,
    attack: Number(document.getElementById('i_attack').value) || undefined,
    maxHp: Number(document.getElementById('i_maxHp').value) || undefined,
    maxSp: Number(document.getElementById('i_maxSp').value) || undefined,
    description: document.getElementById('i_description').value.trim(),
  };
  if (newId !== selectedKey) delete db.items[selectedKey];
  db.items[newId] = it;
  selectedKey = newId;
  await persist('/api/items', db.items);
}

async function deleteItem() {
  if (!confirm('Hapus item ' + selectedKey + '?')) return;
  delete db.items[selectedKey];
  selectedKey = null;
  await persist('/api/items', db.items);
}

async function persist(url, payload) {
  showToast('Menyimpan & build server...');
  const res = await fetch(url, { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  const data = await res.json();
  if (!res.ok) { showToast(data.error || 'Gagal menyimpan', true); return; }
  showToast('Tersimpan & server berhasil di-build!');
  await loadDb();
}

loadDb();
</script>
</body>
</html>`;

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end(HTML);
      return;
    }
    if (req.method === "GET" && req.url?.startsWith("/assets/sprites/monster/")) {
      const relativeUrl = decodeURIComponent(req.url.split("?")[0]).replace(/^\/assets\/sprites\/monster\//, "");
      const assetPath = path.resolve(path.join(ROOT, "client", "public", "assets", "sprites", "monster"), relativeUrl);
      const monsterRoot = path.resolve(path.join(ROOT, "client", "public", "assets", "sprites", "monster"));
      if (!assetPath.startsWith(monsterRoot + path.sep) || !fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(assetPath).toLowerCase();
      res.writeHead(200, {
        "Content-Type": ext === ".png" ? "image/png" : ext === ".json" ? "application/json" : "application/octet-stream",
        "Cache-Control": "no-cache",
      });
      res.end(fs.readFileSync(assetPath));
      return;
    }
    if (req.method === "GET" && req.url === "/api/db") {
      const db = await readDatabase();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(db));
      return;
    }
    if (req.method === "POST" && (req.url === "/api/monsters" || req.url === "/api/items")) {
      let body = "";
      for await (const chunk of req) body += chunk;
      const parsed = JSON.parse(body);
      if (req.url === "/api/monsters") writeMonstersTs(parsed);
      else writeItemsTs(parsed);
      await buildServer();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/spawns") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const overrides = JSON.parse(body);
      writeSpawnOverridesTs(overrides);
      await buildServer();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    if (req.method === "POST" && req.url === "/api/import") {
      let body = "";
      for await (const chunk of req) body += chunk;
      const payload = JSON.parse(body);
      if (!payload || typeof payload.monsters !== "object" || typeof payload.items !== "object") {
        throw new Error("Format import tidak valid");
      }
      writeMonstersTs(payload.monsters);
      writeItemsTs(payload.items);
      if (payload.spawns && typeof payload.spawns === "object") writeSpawnOverridesTs(payload.spawns);
      await buildServer();
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }
    res.writeHead(404);
    res.end("Not found");
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: err?.message || String(err) }));
  }
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Monster & Item Database Editor running at http://localhost:${PORT}`);
});

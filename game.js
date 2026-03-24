const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const statsEl = document.getElementById("stats");
const shopEl = document.getElementById("shop");
const logEl = document.getElementById("log");

const keys = new Set();
const WORLD_WIDTH = 4200;
const GROUND_Y = 440;
const GRAVITY = 0.72;
const PIXEL = 4;
const ATTACK_WINDOW = 12;
const DASH_WINDOW = 14;

const state = {
  mode: "playing",
  level: 1,
  coins: 0,
  totalCoins: 0,
  lastTime: 0,
  cameraX: 0,
  selection: 0,
  logs: [],
  player: createPlayer(),
  monsters: [],
  coinsOnMap: [],
  particles: [],
  platforms: [],
  goal: { x: WORLD_WIDTH - 140, y: GROUND_Y - 70, width: 56, height: 80 },
  storeItems: [],
};

function createPlayer() {
  return {
    x: 120,
    y: GROUND_Y - 68,
    width: 34,
    height: 52,
    vx: 0,
    vy: 0,
    speed: 4.4,
    jump: 13.5,
    hp: 100,
    maxHp: 100,
    damage: 16,
    defense: 0,
    coinsMagnet: 0,
    attackRange: 62,
    canDoubleJump: false,
    jumpsRemaining: 1,
    attackTimer: 0,
    dashTimer: 0,
    invuln: 0,
    facing: 1,
    combo: 0,
    regen: 0,
    critRate: 0.08,
    critDamage: 1.6,
  };
}

function resetWorld() {
  const difficulty = 1 + (state.level - 1) * 0.55;
  const player = state.player;
  player.x = 120;
  player.y = GROUND_Y - 68;
  player.vx = 0;
  player.vy = 0;
  player.jumpsRemaining = player.canDoubleJump ? 2 : 1;
  player.attackTimer = 0;
  player.dashTimer = 0;
  player.invuln = 0;
  player.hp = Math.min(player.maxHp, player.hp + 18 + player.regen);

  state.mode = "playing";
  state.cameraX = 0;
  state.goal = {
    x: WORLD_WIDTH - 180,
    y: GROUND_Y - 96,
    width: 72,
    height: 100,
  };

  state.platforms = [
    { x: 320, y: 370, width: 130, height: 18 },
    { x: 620, y: 320, width: 120, height: 18 },
    { x: 900, y: 385, width: 160, height: 18 },
    { x: 1290, y: 345, width: 140, height: 18 },
    { x: 1580, y: 285, width: 120, height: 18 },
    { x: 1910, y: 375, width: 130, height: 18 },
    { x: 2250, y: 325, width: 120, height: 18 },
    { x: 2550, y: 270, width: 130, height: 18 },
    { x: 2930, y: 355, width: 160, height: 18 },
    { x: 3360, y: 305, width: 120, height: 18 },
  ];

  state.coinsOnMap = [];
  for (let i = 0; i < 22 + state.level * 4; i += 1) {
    const spread = 160 + i * (WORLD_WIDTH - 320) / (24 + state.level * 4);
    const onPlatform = i % 3 === 0 ? state.platforms[i % state.platforms.length] : null;
    state.coinsOnMap.push({
      x: onPlatform ? onPlatform.x + 24 + (i * 17) % (onPlatform.width - 48) : spread,
      y: onPlatform ? onPlatform.y - 26 : GROUND_Y - 26 - ((i % 4) * 18),
      size: 15,
      taken: false,
      bob: Math.random() * Math.PI * 2,
    });
  }

  state.monsters = [];
  const monsterCount = 6 + state.level * 3;
  for (let i = 0; i < monsterCount; i += 1) {
    const elite = state.level >= 3 && i % 4 === 0;
    const flyer = state.level >= 2 && i % 5 === 2;
    const baseX = 540 + i * ((WORLD_WIDTH - 800) / monsterCount) + Math.random() * 110;
    state.monsters.push({
      x: baseX,
      y: flyer ? 220 + (i % 4) * 35 : GROUND_Y - (elite ? 78 : 56),
      homeX: baseX,
      width: elite ? 46 : 36,
      height: elite ? 62 : 46,
      vx: 0,
      vy: 0,
      speed: (elite ? 2.2 : 1.6) * difficulty + (flyer ? 0.6 : 0),
      hp: Math.round((elite ? 48 : 26) * difficulty),
      maxHp: Math.round((elite ? 48 : 26) * difficulty),
      damage: Math.round((elite ? 16 : 10) * difficulty),
      direction: Math.random() > 0.5 ? 1 : -1,
      elite,
      flyer,
      hitFlash: 0,
      attackCd: 0,
      patrol: 90 + Math.random() * 80,
      coinDrop: elite ? 14 : 8,
    });
  }

  addLog(`第 ${state.level} 关开始：怪物数量 ${monsterCount}，强度倍率 ${difficulty.toFixed(2)}。`, true);
  buildStoreItems();
}

function buildStoreItems() {
  const markup = [
    {
      name: "继续闯关",
      cost: 0,
      desc: "放弃本次购买，直接进入下一关",
      apply() {},
    },
    {
      name: "锋利短剑",
      cost: 18 + state.level * 4,
      desc: "+8 攻击力，略微增加攻击范围",
      apply() {
        state.player.damage += 8;
        state.player.attackRange += 8;
      },
    },
    {
      name: "轻羽长靴",
      cost: 16 + state.level * 5,
      desc: "+0.7 移速，+1 跳跃强度",
      apply() {
        state.player.speed += 0.7;
        state.player.jump += 1;
      },
    },
    {
      name: "应急护甲",
      cost: 20 + state.level * 6,
      desc: "+18 最大生命，+2 防御",
      apply() {
        state.player.maxHp += 18;
        state.player.hp += 18;
        state.player.defense += 2;
      },
    },
    {
      name: "金币磁石",
      cost: 14 + state.level * 5,
      desc: "自动吸附附近金币，提高刷钱效率",
      apply() {
        state.player.coinsMagnet += 70;
      },
    },
    {
      name: "双跃符文",
      cost: 28 + state.level * 7,
      desc: "获得二段跳能力，极大提升容错",
      apply() {
        state.player.canDoubleJump = true;
      },
    },
    {
      name: "暴击之眼",
      cost: 22 + state.level * 6,
      desc: "+8% 暴击率，暴击伤害略升",
      apply() {
        state.player.critRate += 0.08;
        state.player.critDamage += 0.15;
      },
    },
  ];

  state.storeItems = markup;
  renderShop();
}

function addLog(message, highlight = false) {
  state.logs.unshift({ message, highlight, id: crypto.randomUUID() });
  state.logs = state.logs.slice(0, 12);
  logEl.innerHTML = state.logs
    .map(
      (entry) =>
        `<div class="log-entry ${entry.highlight ? "highlight" : ""}">${entry.message}</div>`,
    )
    .join("");
}

function renderStats() {
  const player = state.player;
  const stats = [
    ["关卡", `${state.level}`],
    ["生命", `${Math.max(0, Math.round(player.hp))} / ${player.maxHp}`],
    ["攻击", `${player.damage}`],
    ["金币", `${state.coins}`],
    ["总金币", `${state.totalCoins}`],
    ["护甲", `${player.defense}`],
    ["冲刺状态", player.dashTimer > 0 ? "无敌中" : "可用"],
    ["模式", state.mode === "store" ? "商店结算" : state.mode === "dead" ? "失败" : "战斗"],
  ];

  statsEl.innerHTML = stats
    .map(([label, value]) => `<div class="stats-item"><strong>${label}</strong>${value}</div>`)
    .join("");
}

function renderShop() {
  if (state.mode !== "store") {
    shopEl.innerHTML = "<p>通关后将进入商店，在这里升级装备与被动。</p>";
    return;
  }

  shopEl.innerHTML = state.storeItems
    .map(
      (item, index) => `
        <div class="shop-item ${index === state.selection ? "active" : ""}">
          <strong>${index + 1}. ${item.name} - ${item.cost} 金币</strong>
          <div>${item.desc}</div>
        </div>
      `,
    )
    .join("");
}

function isRectOverlap(a, b) {
  return (
    a.x < b.x + b.width &&
    a.x + a.width > b.x &&
    a.y < b.y + b.height &&
    a.y + a.height > b.y
  );
}

function handleInput() {
  if (state.mode === "dead") {
    return;
  }

  if (state.mode === "store") {
    return;
  }

  const player = state.player;
  const movingLeft = keys.has("a") || keys.has("arrowleft");
  const movingRight = keys.has("d") || keys.has("arrowright");
  if (movingLeft === movingRight) {
    player.vx *= 0.72;
  } else if (movingLeft) {
    player.vx = -player.speed;
    player.facing = -1;
  } else if (movingRight) {
    player.vx = player.speed;
    player.facing = 1;
  }
}

function jump() {
  const player = state.player;
  if (state.mode !== "playing") {
    return;
  }

  const grounded = isGrounded(player);
  if (grounded) {
    player.vy = -player.jump;
    player.jumpsRemaining = player.canDoubleJump ? 1 : 0;
    addLog("跃起躲避，准备穿越前方障碍。", false);
  } else if (player.jumpsRemaining > 0) {
    player.vy = -player.jump * 0.92;
    player.jumpsRemaining -= 1;
    addLog("发动二段跳，争取更高的平台。", true);
  }
}

function attack() {
  const player = state.player;
  if (state.mode !== "playing" || player.attackTimer > 0) {
    return;
  }

  player.attackTimer = ATTACK_WINDOW;
  player.combo = (player.combo + 1) % 3;
  const hitbox = {
    x: player.facing > 0 ? player.x + player.width - 6 : player.x - player.attackRange,
    y: player.y + 4,
    width: player.attackRange,
    height: player.height - 8,
  };

  let hitCount = 0;
  state.monsters.forEach((monster) => {
    if (monster.hp <= 0 || !isRectOverlap(hitbox, monster)) {
      return;
    }
    hitCount += 1;
    const crit = Math.random() < state.player.critRate;
    const damage = Math.round(state.player.damage * (crit ? state.player.critDamage : 1));
    monster.hp -= damage;
    monster.hitFlash = 8;
    monster.vx = player.facing * 4;
    if (monster.flyer) {
      monster.vy = -2.5;
    }
    spawnParticles(monster.x + monster.width / 2, monster.y + 12, crit ? "#fff0a8" : "#ff8fab", 6);
    addLog(crit ? `暴击命中！造成 ${damage} 伤害。` : `斩击命中，造成 ${damage} 伤害。`, crit);
    if (monster.hp <= 0) {
      state.coins += monster.coinDrop;
      state.totalCoins += monster.coinDrop;
      addLog(`击败怪物，掉落 ${monster.coinDrop} 金币。`, true);
      spawnParticles(monster.x + 8, monster.y + 8, "#ffd166", 10);
    }
  });

  if (hitCount === 0) {
    addLog("挥空了，小心怪物反扑。", false);
  }
}

function dash() {
  const player = state.player;
  if (state.mode !== "playing" || player.dashTimer > 0) {
    return;
  }
  player.dashTimer = DASH_WINDOW;
  player.invuln = DASH_WINDOW;
  player.vx = player.facing * 11;
  spawnParticles(player.x + player.width / 2, player.y + player.height / 2, "#67e8f9", 12);
  addLog("冲刺闪避发动：短暂无敌并高速位移。", true);
}

function isGrounded(entity) {
  if (entity.y + entity.height >= GROUND_Y - 1) {
    return true;
  }
  return state.platforms.some(
    (platform) =>
      entity.x + entity.width > platform.x &&
      entity.x < platform.x + platform.width &&
      Math.abs(entity.y + entity.height - platform.y) <= 5,
  );
}

function resolvePlatforms(entity) {
  let grounded = false;
  if (entity.y + entity.height >= GROUND_Y) {
    entity.y = GROUND_Y - entity.height;
    entity.vy = 0;
    grounded = true;
  }

  state.platforms.forEach((platform) => {
    const wasAbove = entity.y + entity.height - entity.vy <= platform.y;
    const withinX = entity.x + entity.width > platform.x && entity.x < platform.x + platform.width;
    const hitTop = entity.y + entity.height >= platform.y && entity.y + entity.height <= platform.y + 16;
    if (wasAbove && withinX && hitTop && entity.vy >= 0) {
      entity.y = platform.y - entity.height;
      entity.vy = 0;
      grounded = true;
    }
  });

  return grounded;
}

function updatePlayer() {
  const player = state.player;
  player.attackTimer = Math.max(0, player.attackTimer - 1);
  player.dashTimer = Math.max(0, player.dashTimer - 1);
  player.invuln = Math.max(0, player.invuln - 1);

  player.vy += GRAVITY;
  player.x += player.vx;
  player.y += player.vy;

  player.x = Math.max(0, Math.min(WORLD_WIDTH - player.width, player.x));
  const grounded = resolvePlatforms(player);
  if (grounded) {
    player.jumpsRemaining = player.canDoubleJump ? 1 : 0;
  }

  state.cameraX += ((player.x - canvas.width * 0.35) - state.cameraX) * 0.12;
  state.cameraX = Math.max(0, Math.min(WORLD_WIDTH - canvas.width, state.cameraX));

  state.coinsOnMap.forEach((coin) => {
    if (coin.taken) {
      return;
    }
    coin.bob += 0.08;
    if (player.coinsMagnet > 0) {
      const dx = player.x + player.width / 2 - coin.x;
      const dy = player.y + player.height / 2 - coin.y;
      const dist = Math.hypot(dx, dy);
      if (dist < player.coinsMagnet) {
        coin.x += dx * 0.05;
        coin.y += dy * 0.05;
      }
    }
    if (
      Math.abs(player.x + player.width / 2 - coin.x) < 28 &&
      Math.abs(player.y + player.height / 2 - coin.y) < 34
    ) {
      coin.taken = true;
      state.coins += 1;
      state.totalCoins += 1;
      spawnParticles(coin.x, coin.y, "#ffd166", 5);
    }
  });

  if (isRectOverlap(player, state.goal)) {
    state.mode = "store";
    state.selection = 0;
    renderShop();
    addLog(`通关成功！进入商店，本关累计金币 ${state.coins}。`, true);
  }
}

function updateMonsters() {
  const player = state.player;
  state.monsters.forEach((monster) => {
    if (monster.hp <= 0) {
      return;
    }

    monster.hitFlash = Math.max(0, monster.hitFlash - 1);
    monster.attackCd = Math.max(0, monster.attackCd - 1);

    const dx = player.x - monster.x;
    const nearPlayer = Math.abs(dx) < 240 + state.level * 28;
    monster.direction = nearPlayer ? Math.sign(dx) || monster.direction : monster.direction;

    if (monster.flyer) {
      monster.x += monster.direction * monster.speed;
      monster.y += Math.sin((performance.now() / 240) + monster.x * 0.01) * 1.4;
    } else {
      if (!nearPlayer && Math.abs(monster.x - monster.homeX) > monster.patrol) {
        monster.direction *= -1;
      }
      monster.vx = monster.direction * monster.speed;
      monster.vy += GRAVITY;
      monster.x += monster.vx;
      monster.y += monster.vy;
      resolvePlatforms(monster);
    }

    if (Math.abs(dx) < monster.width + 12 && Math.abs(player.y - monster.y) < 44 && monster.attackCd === 0) {
      monster.attackCd = 28;
      if (player.invuln === 0) {
        const damage = Math.max(1, monster.damage - player.defense);
        player.hp -= damage;
        player.invuln = 24;
        player.vx = dx > 0 ? -5 : 5;
        player.vy = -4;
        addLog(`遭到怪物攻击，损失 ${damage} 点生命。`, false);
        spawnParticles(player.x + 12, player.y + 12, "#ff5d73", 8);
      } else {
        addLog("你用冲刺无敌躲开了怪物攻击！", true);
      }
    }
  });

  state.monsters = state.monsters.filter((monster) => monster.hp > 0 || monster.hitFlash > 0);

  if (player.hp <= 0) {
    state.mode = "dead";
    addLog("你倒下了！按 R 从第一关重新挑战。", true);
  }
}

function spawnParticles(x, y, color, count) {
  for (let i = 0; i < count; i += 1) {
    state.particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 4,
      vy: (Math.random() - 1.2) * 3,
      life: 22 + Math.random() * 14,
      color,
    });
  }
}

function updateParticles() {
  state.particles.forEach((particle) => {
    particle.x += particle.vx;
    particle.y += particle.vy;
    particle.vy += 0.08;
    particle.life -= 1;
  });
  state.particles = state.particles.filter((particle) => particle.life > 0);
}

function drawPixelRect(x, y, width, height, color) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), width, height);
}

function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSky();

  const cam = state.cameraX;
  ctx.save();
  ctx.translate(-cam, 0);

  state.platforms.forEach((platform) => {
    drawPixelRect(platform.x, platform.y, platform.width, platform.height, "#5a6478");
    drawPixelRect(platform.x, platform.y + 14, platform.width, 4, "#30384b");
  });

  drawPixelRect(0, GROUND_Y, WORLD_WIDTH, canvas.height - GROUND_Y, "#3e7a39");
  for (let i = 0; i < WORLD_WIDTH; i += 48) {
    drawPixelRect(i, GROUND_Y + 18, 24, 16, i % 96 === 0 ? "#5dbb63" : "#4da652");
  }

  drawGoal();
  state.coinsOnMap.forEach(drawCoin);
  state.monsters.forEach(drawMonster);
  drawPlayer();
  state.particles.forEach(drawParticle);

  ctx.restore();

  if (state.mode === "store") {
    drawOverlay("商店时间", "方向键切换，Enter 购买并进入下一关");
  } else if (state.mode === "dead") {
    drawOverlay("挑战失败", "按 R 重开，重新积累金币与成长");
  }
}

function drawSky() {
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, "#8ed6ff");
  gradient.addColorStop(0.55, "#7a9cff");
  gradient.addColorStop(1, "#d9f0ff");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let i = 0; i < 5; i += 1) {
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    const x = ((i * 220) - state.cameraX * (0.15 + i * 0.03)) % (canvas.width + 120) - 120;
    const y = 55 + i * 42;
    ctx.fillRect(x, y, 68, 18);
    ctx.fillRect(x + 14, y - 12, 42, 18);
    ctx.fillRect(x + 26, y + 8, 34, 16);
  }
}

function drawGoal() {
  drawPixelRect(state.goal.x, state.goal.y, state.goal.width, state.goal.height, "#6f4ef2");
  drawPixelRect(state.goal.x + 8, state.goal.y + 8, state.goal.width - 16, state.goal.height - 16, "#b6a3ff");
}

function drawCoin(coin) {
  if (coin.taken) {
    return;
  }
  const bobY = coin.y + Math.sin(coin.bob) * 4;
  drawPixelRect(coin.x, bobY, coin.size, coin.size, "#ffd166");
  drawPixelRect(coin.x + 4, bobY + 4, coin.size - 8, coin.size - 8, "#fff1b0");
}

function drawMonster(monster) {
  const color = monster.hitFlash > 0 ? "#ffffff" : monster.elite ? "#9b2226" : monster.flyer ? "#6a4c93" : "#c44536";
  drawPixelRect(monster.x, monster.y, monster.width, monster.height, color);
  drawPixelRect(monster.x + 6, monster.y + 10, 8, 8, "#1a1a1a");
  drawPixelRect(monster.x + monster.width - 14, monster.y + 10, 8, 8, "#1a1a1a");
  const hpWidth = monster.width;
  drawPixelRect(monster.x, monster.y - 12, hpWidth, 6, "rgba(0,0,0,0.35)");
  drawPixelRect(monster.x, monster.y - 12, hpWidth * Math.max(0, monster.hp) / monster.maxHp, 6, "#7bf1a8");
}

function drawPlayer() {
  const player = state.player;
  const flash = player.invuln > 0 && player.invuln % 4 < 2;
  drawPixelRect(player.x, player.y, player.width, player.height, flash ? "#d0f4ff" : "#1f6feb");
  drawPixelRect(player.x + 8, player.y + 10, 7, 7, "#f8f8ff");
  drawPixelRect(player.x + 19, player.y + 10, 7, 7, "#f8f8ff");
  drawPixelRect(player.x + 10, player.y + 30, 14, 8, "#ffd166");

  if (player.attackTimer > 0) {
    const slashX = player.facing > 0 ? player.x + player.width + 4 : player.x - player.attackRange + 10;
    drawPixelRect(slashX, player.y + 8, player.attackRange - 16, 12, "rgba(255,255,255,0.78)");
  }
}

function drawParticle(particle) {
  ctx.fillStyle = particle.color;
  ctx.globalAlpha = Math.max(0, particle.life / 32);
  ctx.fillRect(particle.x - state.cameraX, particle.y, PIXEL, PIXEL);
  ctx.globalAlpha = 1;
}

function drawOverlay(title, subtitle) {
  ctx.fillStyle = "rgba(5, 7, 14, 0.58)";
  ctx.fillRect(160, 170, canvas.width - 320, 140);
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.strokeRect(160, 170, canvas.width - 320, 140);
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 34px sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(title, canvas.width / 2, 225);
  ctx.font = "18px sans-serif";
  ctx.fillText(subtitle, canvas.width / 2, 265);
  ctx.textAlign = "start";
}

function buySelectedItem() {
  if (state.mode !== "store") {
    return;
  }
  const item = state.storeItems[state.selection];
  if (!item) {
    return;
  }
  if (state.coins < item.cost) {
    addLog(`金币不足，${item.name} 需要 ${item.cost} 金币。`, false);
    return;
  }
  state.coins -= item.cost;
  item.apply();
  addLog(`购买成功：${item.name}。准备迎接更难的一关！`, true);
  state.level += 1;
  resetWorld();
}

function restartGame() {
  state.level = 1;
  state.coins = 0;
  state.totalCoins = 0;
  state.player = createPlayer();
  state.logs = [];
  addLog("新的冒险开始了，努力活到更高关卡！", true);
  resetWorld();
}

function loop(timestamp) {
  const delta = timestamp - state.lastTime;
  state.lastTime = timestamp;

  handleInput();
  if (state.mode === "playing") {
    updatePlayer(delta);
    updateMonsters(delta);
    updateParticles(delta);
  } else {
    updateParticles(delta);
  }
  drawScene();
  renderStats();
  renderShop();
  requestAnimationFrame(loop);
}

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  keys.add(key);

  if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(event.key)) {
    event.preventDefault();
  }

  if (key === "w" || event.key === " ") {
    jump();
  }
  if (key === "j") {
    attack();
  }
  if (key === "k") {
    dash();
  }
  if (key === "r") {
    restartGame();
  }

  if (state.mode === "store") {
    if (key === "arrowup" || key === "w") {
      state.selection = (state.selection - 1 + state.storeItems.length) % state.storeItems.length;
    }
    if (key === "arrowdown" || key === "s") {
      state.selection = (state.selection + 1) % state.storeItems.length;
    }
    if (key === "enter") {
      buySelectedItem();
    }
  }
});

window.addEventListener("keyup", (event) => {
  keys.delete(event.key.toLowerCase());
});

addLog("新的冒险开始了，努力活到更高关卡！", true);
resetWorld();
renderStats();
requestAnimationFrame(loop);

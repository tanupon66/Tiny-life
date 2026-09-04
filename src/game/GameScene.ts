import Phaser from 'phaser';
import { loadSave, writeSave, type FarmPlotState, type TinyLifeSave, type ToolId } from './state';

const WORLD_W = 1600;
const WORLD_H = 960;
const FARM_X = 560;
const FARM_Y = 420;
const COLS = 6;
const ROWS = 4;
const PLOT_GAP_X = 58;
const PLOT_GAP_Y = 48;
const PLAYER_SPEED = 150;

const TOOLS: { id: ToolId; label: string; key: string }[] = [
  { id: 'hoe', label: 'HOE', key: '1' },
  { id: 'seeds', label: 'SEEDS', key: '2' },
  { id: 'water', label: 'WATER', key: '3' },
  { id: 'hand', label: 'HARVEST', key: '4' }
];

type Facing = 'up' | 'down' | 'left' | 'right';

type PlotVisual = {
  state: FarmPlotState;
  x: number;
  y: number;
  graphics: Phaser.GameObjects.Graphics;
};

export class GameScene extends Phaser.Scene {
  private save: TinyLifeSave = loadSave();
  private player!: Phaser.Physics.Arcade.Sprite;
  private mali!: Phaser.GameObjects.Sprite | Phaser.GameObjects.Rectangle;
  private plotVisuals: PlotVisual[] = [];
  private facing: Facing = 'down';
  private minuteAccumulator = 0;
  private saveAccumulator = 0;
  private npcTarget = new Phaser.Math.Vector2(395, 260);

  private cursor!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private touch = { left: false, right: false, up: false, down: false };

  private hudLeft!: Phaser.GameObjects.Text;
  private hudRight!: Phaser.GameObjects.Text;
  private prompt!: Phaser.GameObjects.Text;
  private toastText!: Phaser.GameObjects.Text;
  private night!: Phaser.GameObjects.Rectangle;
  private hotbar: { id: ToolId; panel: Phaser.GameObjects.Rectangle; text: Phaser.GameObjects.Text }[] = [];

  private readonly shopPoint = new Phaser.Math.Vector2(300, 290);
  private readonly sellPoint = new Phaser.Math.Vector2(1110, 525);

  constructor() {
    super('GameScene');
  }

  preload(): void {
    // Environment reference: Kenney Tiny Farm, CC0.
    // Player reference: Belohlavek / OpenGameArt, CC0.
    // Both are remote only for the first vertical slice; local vendoring comes next.
    this.load.setCORS('anonymous');
    this.load.image(
      'kenney-farm-sample',
      'https://raw.githubusercontent.com/Tiddybub/2d-assets/main/fantasy/tiny-farm/Sample.png'
    );
    this.load.spritesheet(
      'hero',
      'https://opengameart.org/sites/default/files/ch003.png',
      { frameWidth: 32, frameHeight: 32 }
    );
  }

  create(): void {
    this.cameras.main.setBackgroundColor('#6f9e55');
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);

    this.createWorld();
    this.createFarm();
    this.createPlayer();
    this.createNPC();
    this.createKeyboard();
    this.createHud();
    this.createTouchControls();

    this.cameras.main.startFollow(this.player, true, 0.09, 0.09);
    this.cameras.main.setZoom(1.15);

    this.refreshAllPlots();
    this.refreshHud();
    this.updateNpcSchedule();
    this.updateNightOverlay();

    this.time.delayedCall(300, () => this.toast('Day 1 · Build your life one choice at a time'));

    window.addEventListener('beforeunload', () => this.persist());
  }

  update(_time: number, delta: number): void {
    this.updateMovement();
    this.updateClock(delta);
    this.updateNpc(delta);
    this.updateContextPrompt();
    this.handleKeyboardActions();

    this.saveAccumulator += delta;
    if (this.saveAccumulator >= 10000) {
      this.saveAccumulator = 0;
      this.persist();
    }
  }

  private createWorld(): void {
    const g = this.add.graphics();
    g.fillStyle(0x80a95f, 1);
    g.fillRect(0, 0, WORLD_W, WORLD_H);

    // If the remote CC0 sample loads, it becomes a subtle environmental art layer.
    if (this.textures.exists('kenney-farm-sample')) {
      const art = this.add.image(WORLD_W / 2, WORLD_H / 2, 'kenney-farm-sample');
      art.setDisplaySize(WORLD_W, WORLD_H).setAlpha(0.22).setDepth(0);
    }

    // Roads and readable gameplay zones stay independent from art assets.
    g.fillStyle(0xd5bd8b, 1);
    g.fillRect(0, 335, WORLD_W, 92);
    g.fillRect(475, 0, 96, WORLD_H);

    g.fillStyle(0x5e8a4c, 1);
    for (let i = 0; i < 36; i++) {
      const x = 45 + (i * 137) % 1500;
      const y = 58 + (i * 211) % 820;
      if (x > 505 && x < 940 && y > 390 && y < 680) continue;
      g.fillRect(x - 14, y + 6, 28, 7);
      g.fillStyle(0x356344, 1);
      g.fillRect(x - 10, y - 18, 20, 25);
      g.fillStyle(0x5e8a4c, 1);
    }

    // Shop / community building.
    g.fillStyle(0x27394a, 1);
    g.fillRect(205, 165, 190, 145);
    g.fillStyle(0xc46f4b, 1);
    g.fillTriangle(190, 170, 410, 170, 300, 95);
    g.fillStyle(0xf0c77c, 1);
    g.fillRect(272, 230, 56, 80);
    g.fillStyle(0x111b25, 1);
    g.fillRect(285, 250, 30, 60);

    // Farmhouse.
    g.fillStyle(0xeee2c2, 1);
    g.fillRect(980, 160, 215, 155);
    g.fillStyle(0x56708a, 1);
    g.fillTriangle(960, 165, 1215, 165, 1087, 80);
    g.fillStyle(0x8b5b3e, 1);
    g.fillRect(1060, 235, 58, 80);

    // Shipping / sell bin.
    g.fillStyle(0x8b5b3e, 1);
    g.fillRect(this.sellPoint.x - 34, this.sellPoint.y - 24, 68, 48);
    g.lineStyle(4, 0x563925, 1);
    g.strokeRect(this.sellPoint.x - 34, this.sellPoint.y - 24, 68, 48);

    this.add.text(220, 322, 'SEED SHOP', {
      fontFamily: 'Nunito, sans-serif', fontSize: '18px', fontStyle: '800', color: '#27394a'
    }).setDepth(2);
    this.add.text(1034, 560, 'SELL BIN', {
      fontFamily: 'Nunito, sans-serif', fontSize: '16px', fontStyle: '800', color: '#27394a'
    }).setDepth(2);
  }

  private createFarm(): void {
    for (let row = 0; row < ROWS; row++) {
      for (let col = 0; col < COLS; col++) {
        const id = row * COLS + col;
        const x = FARM_X + col * PLOT_GAP_X;
        const y = FARM_Y + row * PLOT_GAP_Y;
        const graphics = this.add.graphics().setDepth(4);
        this.plotVisuals.push({ state: this.save.plots[id], x, y, graphics });
      }
    }

    this.add.text(FARM_X - 28, FARM_Y - 70, 'YOUR STARTER FIELD', {
      fontFamily: 'Nunito, sans-serif', fontSize: '18px', fontStyle: '800', color: '#173525',
      backgroundColor: 'rgba(238,241,211,.72)', padding: { x: 10, y: 5 }
    }).setDepth(3);
  }

  private createPlayer(): void {
    if (this.textures.exists('hero')) {
      this.player = this.physics.add.sprite(this.save.player.x, this.save.player.y, 'hero', 0).setDepth(20);
      this.player.setScale(1.45);
      this.anims.create({ key: 'walk-down', frames: this.anims.generateFrameNumbers('hero', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'walk-up', frames: this.anims.generateFrameNumbers('hero', { start: 4, end: 7 }), frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'walk-left', frames: this.anims.generateFrameNumbers('hero', { start: 8, end: 11 }), frameRate: 8, repeat: -1 });
      this.anims.create({ key: 'walk-right', frames: this.anims.generateFrameNumbers('hero', { start: 12, end: 15 }), frameRate: 8, repeat: -1 });
    } else {
      // Offline fallback only; the production art path is asset-driven.
      const fallback = this.make.graphics({ x: 0, y: 0, add: false });
      fallback.fillStyle(0x26384a, 1).fillRect(8, 14, 16, 16);
      fallback.fillStyle(0xe2b58d, 1).fillRect(9, 4, 14, 12);
      fallback.fillStyle(0x5b3427, 1).fillRect(8, 3, 16, 5);
      fallback.generateTexture('hero-fallback', 32, 32);
      fallback.destroy();
      this.player = this.physics.add.sprite(this.save.player.x, this.save.player.y, 'hero-fallback').setDepth(20);
    }

    this.player.setCollideWorldBounds(true);
    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setSize(16, 14).setOffset(8, 16);
  }

  private createNPC(): void {
    if (this.textures.exists('hero')) {
      const npc = this.add.sprite(395, 260, 'hero', 1).setDepth(19).setTint(0xffd4ad).setScale(1.35);
      this.mali = npc;
    } else {
      this.mali = this.add.rectangle(395, 260, 24, 34, 0xd56a72).setDepth(19);
    }

    this.add.text(395, 225, 'Mali', {
      fontFamily: 'Nunito, sans-serif', fontSize: '13px', fontStyle: '800', color: '#ffffff',
      backgroundColor: 'rgba(20,28,37,.72)', padding: { x: 6, y: 3 }
    }).setOrigin(0.5).setDepth(18).setName('mali-label');
  }

  private createKeyboard(): void {
    this.cursor = this.input.keyboard!.createCursorKeys();
    this.keys = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      E: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.E),
      SPACE: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      ONE: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.ONE),
      TWO: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.TWO),
      THREE: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.THREE),
      FOUR: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.FOUR)
    };
  }

  private createHud(): void {
    const hudStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: 'Nunito, sans-serif', fontSize: '16px', fontStyle: '800', color: '#f7f4e8',
      backgroundColor: 'rgba(20,28,37,.82)', padding: { x: 12, y: 8 }
    };

    this.hudLeft = this.add.text(18, 18, '', hudStyle).setScrollFactor(0).setDepth(1002);
    this.hudRight = this.add.text(942, 18, '', hudStyle).setOrigin(1, 0).setScrollFactor(0).setDepth(1002);
    this.prompt = this.add.text(480, 452, '', {
      ...hudStyle, fontSize: '14px', backgroundColor: 'rgba(14,21,29,.88)'
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1002);

    this.toastText = this.add.text(480, 78, '', {
      fontFamily: 'Nunito, sans-serif', fontSize: '15px', fontStyle: '800', color: '#26352d',
      backgroundColor: '#f3e9bd', padding: { x: 14, y: 9 }
    }).setOrigin(0.5).setScrollFactor(0).setDepth(1004).setAlpha(0);

    this.night = this.add.rectangle(0, 0, 960, 540, 0x07111f, 0)
      .setOrigin(0).setScrollFactor(0).setDepth(900);

    TOOLS.forEach((tool, index) => {
      const x = 310 + index * 115;
      const panel = this.add.rectangle(x, 505, 106, 46, 0x1c2b38, 0.9)
        .setStrokeStyle(2, 0xffffff, 0.12)
        .setScrollFactor(0).setDepth(1002).setInteractive({ useHandCursor: true });
      const text = this.add.text(x, 505, `${tool.key}  ${tool.label}`, {
        fontFamily: 'Nunito, sans-serif', fontSize: '13px', fontStyle: '800', color: '#dce5dc'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(1003);
      panel.on('pointerdown', () => this.selectTool(tool.id));
      this.hotbar.push({ id: tool.id, panel, text });
    });
  }

  private createTouchControls(): void {
    const makeButton = (x: number, y: number, label: string, onDown: () => void, onUp: () => void) => {
      const circle = this.add.circle(x, y, 31, 0x12202d, 0.68)
        .setStrokeStyle(2, 0xffffff, 0.16)
        .setScrollFactor(0).setDepth(1001).setInteractive();
      this.add.text(x, y, label, {
        fontFamily: 'Nunito, sans-serif', fontSize: '20px', fontStyle: '800', color: '#f6f2df'
      }).setOrigin(0.5).setScrollFactor(0).setDepth(1002);
      circle.on('pointerdown', onDown);
      circle.on('pointerup', onUp);
      circle.on('pointerout', onUp);
      return circle;
    };

    makeButton(73, 450, '←', () => this.touch.left = true, () => this.touch.left = false);
    makeButton(137, 450, '→', () => this.touch.right = true, () => this.touch.right = false);
    makeButton(105, 414, '↑', () => this.touch.up = true, () => this.touch.up = false);
    makeButton(105, 486, '↓', () => this.touch.down = true, () => this.touch.down = false);
    makeButton(860, 455, 'USE', () => this.tryAction(), () => undefined);
  }

  private updateMovement(): void {
    let x = 0;
    let y = 0;

    if (this.cursor.left.isDown || this.keys.A.isDown || this.touch.left) x -= 1;
    if (this.cursor.right.isDown || this.keys.D.isDown || this.touch.right) x += 1;
    if (this.cursor.up.isDown || this.keys.W.isDown || this.touch.up) y -= 1;
    if (this.cursor.down.isDown || this.keys.S.isDown || this.touch.down) y += 1;

    const body = this.player.body as Phaser.Physics.Arcade.Body;
    body.setVelocity(0);

    if (x || y) {
      const vec = new Phaser.Math.Vector2(x, y).normalize().scale(PLAYER_SPEED);
      body.setVelocity(vec.x, vec.y);
      if (Math.abs(x) > Math.abs(y)) this.facing = x < 0 ? 'left' : 'right';
      else this.facing = y < 0 ? 'up' : 'down';

      if (this.textures.exists('hero')) this.player.anims.play(`walk-${this.facing}`, true);
    } else if (this.player.anims) {
      this.player.anims.stop();
    }
  }

  private handleKeyboardActions(): void {
    if (Phaser.Input.Keyboard.JustDown(this.keys.ONE)) this.selectTool('hoe');
    if (Phaser.Input.Keyboard.JustDown(this.keys.TWO)) this.selectTool('seeds');
    if (Phaser.Input.Keyboard.JustDown(this.keys.THREE)) this.selectTool('water');
    if (Phaser.Input.Keyboard.JustDown(this.keys.FOUR)) this.selectTool('hand');
    if (Phaser.Input.Keyboard.JustDown(this.keys.E) || Phaser.Input.Keyboard.JustDown(this.keys.SPACE)) this.tryAction();
  }

  private selectTool(id: ToolId): void {
    this.save.selectedTool = id;
    this.refreshHud();
  }

  private tryAction(): void {
    const p = new Phaser.Math.Vector2(this.player.x, this.player.y);

    if (Phaser.Math.Distance.Between(p.x, p.y, this.mali.x, this.mali.y) < 72) {
      this.talkToMali();
      return;
    }
    if (Phaser.Math.Distance.Between(p.x, p.y, this.shopPoint.x, this.shopPoint.y) < 90) {
      this.buySeeds();
      return;
    }
    if (Phaser.Math.Distance.Between(p.x, p.y, this.sellPoint.x, this.sellPoint.y) < 88) {
      this.sellCrops();
      return;
    }

    const plot = this.findNearbyPlot(72);
    if (!plot) {
      this.toast('Nothing to use that on');
      return;
    }

    const s = plot.state;
    switch (this.save.selectedTool) {
      case 'hoe':
        if (!s.tilled) {
          s.tilled = true;
          this.toast('Soil tilled');
        } else this.toast('This soil is already tilled');
        break;
      case 'seeds':
        if (!s.tilled) this.toast('Till the soil first');
        else if (s.planted) this.toast('Something is already growing here');
        else if (this.save.inventory.seeds <= 0) this.toast('Out of seeds — visit the shop');
        else {
          s.planted = true;
          s.watered = false;
          s.stage = 0;
          s.growth = 0;
          this.save.inventory.seeds -= 1;
          this.toast('Turnip planted');
        }
        break;
      case 'water':
        if (!s.planted) this.toast('Plant something first');
        else {
          s.watered = true;
          this.toast('Watered — it will start growing');
        }
        break;
      case 'hand':
        if (s.planted && s.stage === 3) {
          this.save.inventory.turnips += 1;
          s.planted = false;
          s.watered = false;
          s.stage = 0;
          s.growth = 0;
          this.toast('+1 turnip · sell it at the wooden bin');
        } else this.toast('Nothing ready to harvest');
        break;
    }

    this.renderPlot(plot);
    this.refreshHud();
  }

  private findNearbyPlot(maxDistance: number): PlotVisual | undefined {
    let best: PlotVisual | undefined;
    let bestDistance = maxDistance;
    for (const plot of this.plotVisuals) {
      const d = Phaser.Math.Distance.Between(this.player.x, this.player.y, plot.x, plot.y);
      if (d < bestDistance) {
        best = plot;
        bestDistance = d;
      }
    }
    return best;
  }

  private buySeeds(): void {
    const cost = 15;
    if (this.save.money < cost) {
      this.toast(`Mali: A seed bundle costs ${cost}g.`);
      return;
    }
    this.save.money -= cost;
    this.save.inventory.seeds += 5;
    this.toast('Bought 5 turnip seeds for 15g');
    this.refreshHud();
  }

  private sellCrops(): void {
    const count = this.save.inventory.turnips;
    if (count <= 0) {
      this.toast('The sell bin is empty');
      return;
    }
    const income = count * 10;
    this.save.inventory.turnips = 0;
    this.save.money += income;
    this.toast(`Sold ${count} turnip${count === 1 ? '' : 's'} · +${income}g`);
    this.refreshHud();
  }

  private talkToMali(): void {
    const lastTalk = this.save.talkedToday.Mali;
    if (lastTalk === this.save.day) {
      this.toast('Mali: Fresh soil and a little patience — that is the trick.');
      return;
    }
    this.save.talkedToday.Mali = this.save.day;
    this.save.relationships.Mali = (this.save.relationships.Mali ?? 0) + 1;
    this.toast(`Mali: Morning! Good luck with the new field.  ♥ ${this.save.relationships.Mali}`);
    this.refreshHud();
  }

  private updateClock(delta: number): void {
    this.minuteAccumulator += delta;
    if (this.minuteAccumulator < 1000) return;
    this.minuteAccumulator -= 1000;

    this.save.minuteOfDay += 10;
    let changed = false;

    for (const plot of this.plotVisuals) {
      const s = plot.state;
      if (!s.planted || !s.watered || s.stage === 3) continue;
      s.growth += 10;
      const oldStage = s.stage;
      if (s.growth >= 180) s.stage = 3;
      else if (s.growth >= 90) s.stage = 2;
      else if (s.growth >= 30) s.stage = 1;
      if (oldStage !== s.stage) {
        this.renderPlot(plot);
        changed = true;
      }
    }

    if (this.save.minuteOfDay >= 24 * 60) {
      this.save.day += 1;
      this.save.minuteOfDay = 6 * 60;
      for (const plot of this.plotVisuals) {
        plot.state.watered = false;
        this.renderPlot(plot);
      }
      this.toast(`Day ${this.save.day} · a new morning`);
      changed = true;
    }

    this.updateNpcSchedule();
    this.updateNightOverlay();
    this.refreshHud();
    if (changed) this.persist();
  }

  private updateNpcSchedule(): void {
    const hour = this.save.minuteOfDay / 60;
    if (hour >= 7 && hour < 18) this.npcTarget.set(395, 260);
    else if (hour >= 18 && hour < 21) this.npcTarget.set(710, 350);
    else this.npcTarget.set(255, 215);
  }

  private updateNpc(delta: number): void {
    const t = Math.min(1, delta / 650);
    this.mali.x = Phaser.Math.Linear(this.mali.x, this.npcTarget.x, t);
    this.mali.y = Phaser.Math.Linear(this.mali.y, this.npcTarget.y, t);
    const label = this.children.getByName('mali-label') as Phaser.GameObjects.Text | null;
    if (label) label.setPosition(this.mali.x, this.mali.y - 35);
  }

  private updateNightOverlay(): void {
    const hour = this.save.minuteOfDay / 60;
    let alpha = 0;
    if (hour < 6) alpha = 0.42;
    else if (hour < 8) alpha = Phaser.Math.Linear(0.36, 0, (hour - 6) / 2);
    else if (hour >= 18 && hour < 21) alpha = Phaser.Math.Linear(0, 0.38, (hour - 18) / 3);
    else if (hour >= 21) alpha = 0.42;
    this.night.setAlpha(alpha);
  }

  private updateContextPrompt(): void {
    const p = new Phaser.Math.Vector2(this.player.x, this.player.y);
    let text = `USE · ${TOOLS.find(t => t.id === this.save.selectedTool)?.label}`;

    if (Phaser.Math.Distance.Between(p.x, p.y, this.mali.x, this.mali.y) < 78) text = 'USE · Talk to Mali';
    else if (Phaser.Math.Distance.Between(p.x, p.y, this.shopPoint.x, this.shopPoint.y) < 100) text = 'USE · Buy 5 seeds · 15g';
    else if (Phaser.Math.Distance.Between(p.x, p.y, this.sellPoint.x, this.sellPoint.y) < 95) text = 'USE · Sell harvested turnips · 10g each';
    else if (!this.findNearbyPlot(78)) text = 'Walk near a field plot, person, shop or sell bin';

    this.prompt.setText(text);
  }

  private refreshAllPlots(): void {
    this.plotVisuals.forEach(plot => this.renderPlot(plot));
  }

  private renderPlot(plot: PlotVisual): void {
    const { graphics: g, state: s, x, y } = plot;
    g.clear();

    if (!s.tilled) {
      g.fillStyle(0x739d55, 1).fillRect(x - 23, y - 16, 46, 32);
      g.lineStyle(1, 0x587e46, 0.65).strokeRect(x - 23, y - 16, 46, 32);
      return;
    }

    g.fillStyle(s.watered ? 0x644735 : 0x8a6041, 1).fillRect(x - 23, y - 16, 46, 32);
    g.lineStyle(2, 0x4f3829, 0.7);
    for (let i = -14; i <= 14; i += 14) g.lineBetween(x - 18, y + i / 2, x + 18, y + i / 2);

    if (!s.planted) return;

    const stems = Math.max(1, s.stage + 1);
    for (let i = 0; i < stems; i++) {
      const ox = (i - (stems - 1) / 2) * 9;
      const h = 5 + s.stage * 4;
      g.fillStyle(0x315c3e, 1).fillRect(x + ox - 1, y - h + 6, 3, h);
      g.fillStyle(s.stage === 3 ? 0x7db652 : 0x4f8f4d, 1);
      g.fillRect(x + ox - 6, y - h + 3, 6, 5);
      g.fillRect(x + ox + 1, y - h + 1, 6, 5);
      if (s.stage === 3) {
        g.fillStyle(0xe7d9c7, 1).fillRect(x + ox - 4, y + 5, 8, 7);
        g.fillStyle(0xb9858c, 1).fillRect(x + ox - 3, y + 8, 6, 4);
      }
    }
  }

  private refreshHud(): void {
    const hour = Math.floor(this.save.minuteOfDay / 60) % 24;
    const minute = this.save.minuteOfDay % 60;
    const hh = hour.toString().padStart(2, '0');
    const mm = minute.toString().padStart(2, '0');
    this.hudLeft.setText(`DAY ${this.save.day}   ${hh}:${mm}\n${this.save.money}g`);
    this.hudRight.setText(`Seeds ${this.save.inventory.seeds}   Turnips ${this.save.inventory.turnips}\nMali ♥ ${this.save.relationships.Mali ?? 0}`);

    for (const item of this.hotbar) {
      const selected = item.id === this.save.selectedTool;
      item.panel.setFillStyle(selected ? 0xe2c46d : 0x1c2b38, selected ? 0.98 : 0.9);
      item.panel.setStrokeStyle(selected ? 3 : 2, selected ? 0xfff1b5 : 0xffffff, selected ? 0.95 : 0.12);
      item.text.setColor(selected ? '#26352d' : '#dce5dc');
    }
  }

  private toast(message: string): void {
    this.tweens.killTweensOf(this.toastText);
    this.toastText.setText(message).setAlpha(1).setY(78);
    this.tweens.add({
      targets: this.toastText,
      alpha: 0,
      y: 68,
      delay: 1900,
      duration: 450,
      ease: 'Sine.easeIn'
    });
  }

  private persist(): void {
    this.save.player.x = Math.round(this.player.x);
    this.save.player.y = Math.round(this.player.y);
    writeSave(this.save);
  }
}

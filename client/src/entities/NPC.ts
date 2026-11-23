import Phaser from "phaser";
import type { NpcState } from "../types";
import { Entity } from "./Entity";

const NPC_TEXTURES = ["npc-0", "npc-1", "npc-2"];

export class NPC extends Entity {
  readonly npcId: string;
  /** Live view of the synchronized schema; the server owns every value. */
  readonly snapshot: NpcState;
  private readonly marker: Phaser.GameObjects.Image;

  constructor(scene: Phaser.Scene, npcId: string, snapshot: NpcState) {
    super(scene, snapshot.x, snapshot.y, {
      texture: NPC_TEXTURES[snapshot.kind] ?? "npc-0",
      name: snapshot.name,
      nameColor: "#f4c95d",
      shadowWidth: 20,
      shadowHeight: 7,
      showHealth: false,
      nameY: -36,
    });

    this.npcId = npcId;
    this.snapshot = snapshot;

    this.marker = scene.add.image(0, -58, "npc-bang").setOrigin(0.5, 1);
    this.add(this.marker);

    this.sprite.setInteractive({ useHandCursor: true });

    scene.tweens.add({
      targets: this.marker,
      y: -62,
      duration: 900,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    this.setDepth(snapshot.y);
  }

  update(_dt: number, time: number): void {
    this.sprite.y = Math.sin(time * 0.003 + this.snapshot.x) * 0.8;
    this.updateDepth();
  }
}

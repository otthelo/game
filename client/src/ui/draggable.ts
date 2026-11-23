import Phaser from "phaser";

export interface DraggableOptions {
  panelWidth: number;
  panelHeight: number;
  handleHeight?: number;
  onFocus?: () => void;
  onDragEnd?: (x: number, y: number) => void;
}

/**
 * Attaches header drag behavior to a Phaser Container.
 * Enables the player to reposition panels anywhere within screen boundaries.
 */
export function attachDraggable(
  scene: Phaser.Scene,
  container: Phaser.GameObjects.Container,
  options: DraggableOptions,
): Phaser.GameObjects.Rectangle {
  const handleH = options.handleHeight ?? 48;

  // Invisible drag zone covering the top header of the panel
  const handle = scene.add
    .rectangle(0, 0, options.panelWidth, handleH, 0x000000, 0)
    .setOrigin(0, 0)
    .setInteractive({ useHandCursor: true });

  container.add(handle);
  // Send to back so that text/buttons inside the container remain on top and clickable
  container.sendToBack(handle);

  let isDragging = false;
  let startPointerX = 0;
  let startPointerY = 0;
  let startContainerX = 0;
  let startContainerY = 0;

  handle.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
    if (!pointer.leftButtonDown()) return;
    isDragging = true;
    startPointerX = pointer.x;
    startPointerY = pointer.y;
    startContainerX = container.x;
    startContainerY = container.y;
    options.onFocus?.();
  });

  const onPointerMove = (pointer: Phaser.Input.Pointer) => {
    if (!isDragging) return;
    const dx = pointer.x - startPointerX;
    const dy = pointer.y - startPointerY;

    const maxX = Math.max(0, scene.scale.width - options.panelWidth);
    const maxY = Math.max(0, scene.scale.height - options.panelHeight);

    const nextX = Phaser.Math.Clamp(startContainerX + dx, 0, maxX);
    const nextY = Phaser.Math.Clamp(startContainerY + dy, 0, maxY);

    container.setPosition(nextX, nextY);
  };

  const onPointerUp = () => {
    if (!isDragging) return;
    isDragging = false;
    options.onDragEnd?.(container.x, container.y);
  };

  scene.input.on("pointermove", onPointerMove);
  scene.input.on("pointerup", onPointerUp);

  container.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.input.off("pointermove", onPointerMove);
    scene.input.off("pointerup", onPointerUp);
  });

  return handle;
}

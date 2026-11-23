import Phaser from "phaser";
import {
  COLORS,
  NAME_MAX_LENGTH,
  SCENE_KEYS,
  SERVER_URL,
  TITLE_FONT,
  UI_FONT,
} from "../config/gameConfig";
import {
  AuthError,
  clearSession,
  devLogin,
  login,
  register,
  type AuthSession,
} from "../network/authApi";

let devAutoLoggedIn = false;

function isDevModeEnabled(): boolean {
  const params = new URLSearchParams(window.location.search);
  return import.meta.env.VITE_DEV_MODE === "true" || params.get("dev") === "1";
}

/**
 * Fantasy RPG Account & Login Screen.
 *
 * Implements the ornate stone and carved wood login frame UI with the
 * Izud Realm fantasy sunset castle landscape.
 */

const USERNAME_STORAGE_KEY = "pixel-realms:username";

const USERNAME_MIN_LENGTH = 3;
const USERNAME_MAX_LENGTH = NAME_MAX_LENGTH;
const PASSWORD_MIN_LENGTH = 6;
const PASSWORD_MAX_LENGTH = 64;

export const FANTASY_FONT = '"Cinzel", "MedievalSharp", Georgia, serif';

type FieldKey = "username" | "password";
type Mode = "login" | "register";

interface FieldView {
  key: FieldKey;
  masked: boolean;
  box: Phaser.GameObjects.Graphics;
  value: Phaser.GameObjects.Text;
  placeholder: Phaser.GameObjects.Text;
}

export class MainMenuScene extends Phaser.Scene {
  private mode: Mode = "login";
  private session: AuthSession | null = null;
  private connecting = false;
  private leaving = false;

  private readonly values: Record<FieldKey, string> = {
    username: "",
    password: "",
  };

  private focusKey: FieldKey | null = null;
  private fieldViews: FieldView[] = [];
  private content: Phaser.GameObjects.GameObject[] = [];
  private backdropImage?: Phaser.GameObjects.Image;
  private statusText!: Phaser.GameObjects.Text;
  private buttonOverlayImage?: Phaser.GameObjects.Image;
  private buttonText?: Phaser.GameObjects.Text;
  private buttonGlow?: Phaser.GameObjects.Graphics;
  private switchLink?: Phaser.GameObjects.Text;

  private keyHandler?: (event: KeyboardEvent) => void;
  private caretTimer?: Phaser.Time.TimerEvent;
  private caretVisible = true;

  constructor() {
    super(SCENE_KEYS.MainMenu);
  }

  create(): void {
    this.leaving = false;
    this.connecting = false;
    this.mode = "login";
    this.session = null;
    clearSession();

    this.cameras.main.setBackgroundColor("#140d10");
    this.cameras.main.fadeIn(280, 12, 8, 10);

    this.drawBackdrop();

    this.statusText = this.add
      .text(this.scale.width / 2, this.scale.height - 40, "", {
        fontFamily: FANTASY_FONT,
        fontSize: "17px",
        color: "#d4a359",
        align: "center",
        stroke: "#0a0808",
        strokeThickness: 3,
        wordWrap: { width: 600 },
      })
      .setOrigin(0.5, 0.5)
      .setDepth(15);

    this.session = null;
    this.values.username = this.loadRememberedUsername();
    this.values.password = "";
    this.focusKey = this.values.username ? "password" : "username";

    this.render();

    this.caretTimer = this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => {
        this.caretVisible = !this.caretVisible;
        if (!this.session && !this.connecting) this.refreshFields();
      },
    });

    this.keyHandler = (event) => this.onKeyDown(event);
    this.input.keyboard?.on("keydown", this.keyHandler);
    this.input.keyboard?.addCapture(["ENTER", "BACKSPACE", "TAB"]);
    this.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.cleanup());

    if (isDevModeEnabled() && !devAutoLoggedIn) {
      devAutoLoggedIn = true;
      void this.runDevLogin();
    }
  }

  private getUiScale(): number {
    const width = this.scale.width;
    const height = this.scale.height;
    // Base reference is 1920x1024 artwork.
    const maxScaleByWidth = (width * 0.94) / 640;
    const idealScale = height / 1024;
    return Phaser.Math.Clamp(Math.min(idealScale, maxScaleByWidth), 0.55, 1.25);
  }

  private onResize(): void {
    this.drawBackdrop();
    this.render();
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  private drawBackdrop(): void {
    if (this.backdropImage) {
      this.backdropImage.destroy();
      this.backdropImage = undefined;
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const cx = width / 2;
    const cy = height / 2;
    const scale = this.getUiScale();

    if (this.textures.exists("login-bg")) {
      this.backdropImage = this.add
        .image(cx, cy, "login-bg")
        .setOrigin(0.5)
        .setScale(scale)
        .setDepth(-10)
        .setScrollFactor(0);
    }
  }

  /** Rebuilds interactive elements inside the login panel. */
  private render(): void {
    for (const object of this.content) object.destroy();
    this.content = [];
    this.fieldViews = [];
    this.buttonOverlayImage = undefined;
    this.buttonText = undefined;
    this.buttonGlow = undefined;
    this.switchLink = undefined;

    const width = this.scale.width;
    const height = this.scale.height;
    const cx = width / 2;
    const cy = height / 2;
    const scale = this.getUiScale();

    // Reposition status message
    this.statusText.setPosition(cx, cy + 242 * scale);
    this.statusText.setFontSize(Math.max(14, Math.round(17 * scale)) + "px");

    if (this.session) {
      this.renderResume(this.session, cx, cy, scale);
    } else {
      this.renderAuthForm(cx, cy, scale);
    }

    this.refreshFields();
  }

  private renderAuthForm(cx: number, cy: number, scale: number): void {
    // Relative coordinate offsets from the center of the 1920x1024 art:
    // Username slot: y = 434 (offset: -78)
    // Password slot: y = 560 (offset: +48)
    // Login button:  y = 685 (offset: +173)
    const slotW = 440 * scale;
    const slotH = 60 * scale;
    const usernameY = cy - 78 * scale;
    const passwordY = cy + 48 * scale;
    const buttonY = cy + 173 * scale;
    const buttonW = 280 * scale;
    const buttonH = 75 * scale;

    // Fields
    this.addField("username", "Username", usernameY, slotW, slotH, scale, false);
    this.addField("password", "Password", passwordY, slotW, slotH, scale, true);

    // Button Glow & Dynamic Overlay
    this.buttonGlow = this.track(this.add.graphics().setDepth(11));

    const needsCustomButton = this.mode === "register" || this.connecting;
    if (needsCustomButton && this.textures.exists("login-button-blank")) {
      this.buttonOverlayImage = this.track(
        this.add
          .image(cx, buttonY, "login-button-blank")
          .setOrigin(0.5)
          .setScale(scale)
          .setDepth(12),
      );

      const btnLabel = this.connecting
        ? (this.mode === "login" ? "Signing In..." : "Creating...")
        : "Register";

      this.buttonText = this.track(
        this.add
          .text(cx, buttonY + 2 * scale, btnLabel, {
            fontFamily: FANTASY_FONT,
            fontSize: Math.max(16, Math.round(24 * scale)) + "px",
            color: "#ffffff",
            stroke: "#0a2e16",
            strokeThickness: 5,
          })
          .setOrigin(0.5)
          .setDepth(13),
      );
    }

    // Button interactive hit area
    const btnHit = this.track(
      this.add
        .rectangle(cx, buttonY, buttonW, buttonH, 0x000000, 0)
        .setDepth(14)
        .setInteractive({ useHandCursor: true }),
    );

    btnHit.on("pointerover", () => {
      if (this.connecting) return;
      this.buttonGlow?.clear();
      this.buttonGlow?.fillStyle(0xffffff, 0.15);
      this.buttonGlow?.fillRoundedRect(
        cx - (buttonW * 0.9) / 2,
        buttonY - (buttonH * 0.8) / 2,
        buttonW * 0.9,
        buttonH * 0.8,
        10,
      );
      this.buttonGlow?.lineStyle(2, 0xf4c95d, 0.7);
      this.buttonGlow?.strokeRoundedRect(
        cx - (buttonW * 0.9) / 2,
        buttonY - (buttonH * 0.8) / 2,
        buttonW * 0.9,
        buttonH * 0.8,
        10,
      );
    });

    btnHit.on("pointerout", () => {
      this.buttonGlow?.clear();
    });

    btnHit.on("pointerdown", () => {
      void this.submit();
    });

    // Register / Login toggle link below the bottom crest
    const togglePrompt =
      this.mode === "login"
        ? "Belum punya akun? [ Register ]"
        : "Sudah punya akun? [ Login ]";

    this.switchLink = this.track(
      this.add
        .text(cx, cy + 365 * scale, togglePrompt, {
          fontFamily: FANTASY_FONT,
          fontSize: Math.max(13, Math.round(17 * scale)) + "px",
          color: "#cbb493",
          stroke: "#080606",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(15)
        .setInteractive({ useHandCursor: true }),
    );

    this.switchLink.on("pointerover", () => this.switchLink?.setColor("#f4c95d"));
    this.switchLink.on("pointerout", () => this.switchLink?.setColor("#cbb493"));
    this.switchLink.on("pointerdown", () => {
      if (!this.connecting) {
        this.setMode(this.mode === "login" ? "register" : "login");
      }
    });

    if (isDevModeEnabled()) {
      const devBtn = this.track(
        this.add
          .text(cx, cy + 402 * scale, "[ DEV LOGIN: Admin ]", {
            fontFamily: FANTASY_FONT,
            fontSize: Math.max(13, Math.round(16 * scale)) + "px",
            color: "#78e8ff",
            stroke: "#080606",
            strokeThickness: 4,
          })
          .setOrigin(0.5)
          .setDepth(15)
          .setInteractive({ useHandCursor: true }),
      );
      devBtn.on("pointerover", () => devBtn.setColor("#ffffff"));
      devBtn.on("pointerout", () => devBtn.setColor("#78e8ff"));
      devBtn.on("pointerdown", () => void this.runDevLogin());
    }

    // Server info at bottom
    this.track(
      this.add
        .text(cx, this.scale.height - 18, `Server: ${SERVER_URL}  •  Tab pindah field  •  Enter login`, {
          fontFamily: UI_FONT,
          fontSize: "15px",
          color: "#6b625b",
        })
        .setOrigin(0.5)
        .setDepth(5),
    );
  }

  private renderResume(session: AuthSession, cx: number, cy: number, scale: number): void {
    const buttonY = cy + 173 * scale;
    const buttonW = 280 * scale;
    const buttonH = 75 * scale;

    // Inside the stone area, display Welcome Back card
    this.track(
      this.add
        .text(cx, cy - 80 * scale, "WELCOME BACK", {
          fontFamily: FANTASY_FONT,
          fontSize: Math.max(16, Math.round(22 * scale)) + "px",
          color: "#d4a359",
          stroke: "#0b0808",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(10),
    );

    this.track(
      this.add
        .text(cx, cy - 25 * scale, session.account.username, {
          fontFamily: FANTASY_FONT,
          fontSize: Math.max(22, Math.round(36 * scale)) + "px",
          color: "#f4c95d",
          stroke: "#080606",
          strokeThickness: 6,
        })
        .setOrigin(0.5)
        .setDepth(10),
    );

    this.track(
      this.add
        .text(cx, cy + 30 * scale, "Tersimpan di perangkat ini", {
          fontFamily: FANTASY_FONT,
          fontSize: Math.max(12, Math.round(15 * scale)) + "px",
          color: "#a49484",
          stroke: "#0a0808",
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(10),
    );

    // Green button with "ENTER REALM"
    if (this.textures.exists("login-button-blank")) {
      this.buttonOverlayImage = this.track(
        this.add
          .image(cx, buttonY, "login-button-blank")
          .setOrigin(0.5)
          .setScale(scale)
          .setDepth(12),
      );
    }

    this.buttonText = this.track(
      this.add
        .text(cx, buttonY + 2 * scale, "Enter Realm", {
          fontFamily: FANTASY_FONT,
          fontSize: Math.max(16, Math.round(24 * scale)) + "px",
          color: "#ffffff",
          stroke: "#0a2e16",
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(13),
    );

    const btnHit = this.track(
      this.add
        .rectangle(cx, buttonY, buttonW, buttonH, 0x000000, 0)
        .setDepth(14)
        .setInteractive({ useHandCursor: true }),
    );

    btnHit.on("pointerover", () => {
      this.buttonText?.setColor("#f4c95d");
    });
    btnHit.on("pointerout", () => {
      this.buttonText?.setColor("#ffffff");
    });
    btnHit.on("pointerdown", () => void this.submit());

    // Switch Account link
    const switchLink = this.track(
      this.add
        .text(cx, cy + 365 * scale, "[ Ganti Akun / Logout ]", {
          fontFamily: FANTASY_FONT,
          fontSize: Math.max(13, Math.round(17 * scale)) + "px",
          color: "#cbb493",
          stroke: "#080606",
          strokeThickness: 4,
        })
        .setOrigin(0.5)
        .setDepth(15)
        .setInteractive({ useHandCursor: true }),
    );

    switchLink.on("pointerover", () => switchLink.setColor("#f4c95d"));
    switchLink.on("pointerout", () => switchLink.setColor("#cbb493"));
    switchLink.on("pointerdown", () => this.switchAccount());
  }

  private addField(
    key: FieldKey,
    placeholder: string,
    y: number,
    slotW: number,
    slotH: number,
    scale: number,
    masked: boolean,
  ): void {
    const cx = this.scale.width / 2;
    const fontSize = Math.max(16, Math.round(22 * scale));

    const box = this.track(this.add.graphics().setDepth(8));

    const textPaddingLeft = 24 * scale;
    const left = cx - slotW / 2 + textPaddingLeft;

    const value = this.track(
      this.add
        .text(left, y, "", {
          fontFamily: FANTASY_FONT,
          fontSize: `${fontSize}px`,
          color: "#f1ecd8",
          stroke: "#140e0c",
          strokeThickness: 3,
        })
        .setOrigin(0, 0.5)
        .setDepth(10),
    );

    const placeholderText = this.track(
      this.add
        .text(left, y, placeholder, {
          fontFamily: FANTASY_FONT,
          fontSize: `${fontSize}px`,
          color: "#8f817a",
          stroke: "#140e0c",
          strokeThickness: 2,
        })
        .setOrigin(0, 0.5)
        .setDepth(9),
    );

    const hit = this.track(
      this.add
        .rectangle(cx, y, slotW, slotH, 0x000000, 0)
        .setDepth(11)
        .setInteractive({ useHandCursor: true }),
    );

    hit.on("pointerdown", () => {
      if (this.connecting) return;
      this.focusKey = key;
      this.caretVisible = true;
      this.refreshFields();
    });

    this.fieldViews.push({ key, masked, box, value, placeholder: placeholderText });
  }

  private refreshFields(): void {
    const cx = this.scale.width / 2;
    const cy = this.scale.height / 2;
    const scale = this.getUiScale();
    const slotW = 440 * scale;
    const slotH = 60 * scale;

    const slotY: Record<FieldKey, number> = {
      username: cy - 78 * scale,
      password: cy + 48 * scale,
    };

    for (const view of this.fieldViews) {
      const focused = this.focusKey === view.key;
      const raw = this.values[view.key];
      const display = view.masked ? "•".repeat(raw.length) : raw;
      const y = slotY[view.key];

      view.box.clear();
      if (focused) {
        // Soft golden glow inside slot bevel
        view.box.lineStyle(2, 0xd4a359, 0.65);
        view.box.strokeRoundedRect(
          cx - slotW / 2,
          y - slotH / 2,
          slotW,
          slotH,
          8,
        );
      }

      view.placeholder.setVisible(raw.length === 0 && !focused);

      if (raw.length > 0) {
        view.value.setText(`${display}${focused && this.caretVisible ? "|" : ""}`);
        view.value.setColor("#f1ecd8");
      } else if (focused) {
        view.value.setText(this.caretVisible ? "|" : "");
        view.value.setColor("#f4c95d");
      } else {
        view.value.setText("");
      }
    }
  }

  private setMode(mode: Mode): void {
    if (this.mode === mode) return;

    this.mode = mode;
    this.values.password = "";
    this.focusKey = this.values.username ? "password" : "username";
    this.caretVisible = true;
    this.render();
    this.setStatus(
      this.mode === "login" ? "Masukkan Username dan Password." : "Daftarkan Username dan Password baru.",
      "#d4a359",
    );
  }

  private track<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.content.push(object);
    return object;
  }

  // -------------------------------------------------------------------------
  // Input Handling
  // -------------------------------------------------------------------------

  private visibleFields(): FieldKey[] {
    return ["username", "password"];
  }

  private onKeyDown(event: KeyboardEvent): void {
    if (this.connecting || this.leaving) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;

    if (event.key === "Enter") {
      event.preventDefault();
      void this.submit();
      return;
    }

    if (this.session) return;

    if (event.key === "Tab") {
      event.preventDefault();
      this.cycleFocus(event.shiftKey ? -1 : 1);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      this.focusKey = null;
      this.refreshFields();
      return;
    }

    if (event.key === "Backspace") {
      event.preventDefault();
      if (!this.focusKey) return;

      this.values[this.focusKey] = this.values[this.focusKey].slice(0, -1);
      this.caretVisible = true;
      this.refreshFields();
      return;
    }

    if (event.key.length !== 1 || this.focusKey === null) return;

    const key = this.focusKey;
    const isUsername = key === "username";

    if (isUsername) {
      if (!/^[A-Za-z0-9_]$/.test(event.key)) return;
      if (this.values.username.length >= USERNAME_MAX_LENGTH) return;
    } else {
      if (!/^[\x20-\x7E]$/.test(event.key)) return;
      if (this.values[key].length >= PASSWORD_MAX_LENGTH) return;
    }

    event.preventDefault();
    this.values[key] += event.key;
    this.caretVisible = true;
    this.refreshFields();
  }

  private cycleFocus(step: number): void {
    const fields = this.visibleFields();
    if (fields.length === 0) return;

    const current = this.focusKey ? fields.indexOf(this.focusKey) : -1;
    const next = (current + step + fields.length) % fields.length;

    this.focusKey = fields[next] ?? fields[0] ?? null;
    this.caretVisible = true;
    this.refreshFields();
  }

  // -------------------------------------------------------------------------
  // Auth Flow
  // -------------------------------------------------------------------------

  private async runDevLogin(): Promise<void> {
    if (this.connecting || this.leaving) return;
    this.connecting = true;
    this.render();
    this.setStatus("Developer Mode: Masuk sebagai Admin...", "#78e8ff");
    try {
      const session = await devLogin();
      this.session = session;
      this.rememberUsername(session.account.username);
      await this.enterWorld(session);
    } catch (error) {
      this.connecting = false;
      this.render();
      this.showAuthError(error);
    }
  }

  private async submit(): Promise<void> {
    if (this.connecting || this.leaving) return;

    if (this.session) {
      await this.enterWorld(this.session);
      return;
    }

    const username = this.values.username.trim();
    const password = this.values.password;

    const problem = this.validate(username, password);
    if (problem) {
      this.setStatus(problem, "#ff6b6b");
      return;
    }

    this.connecting = true;
    this.render();
    this.setStatus(
      this.mode === "login" ? "Sedang masuk ke akun..." : "Sedang membuat akun baru...",
      "#f4c95d",
    );

    try {
      const session =
        this.mode === "register"
          ? await register(username, password)
          : await login(username, password);

      this.session = session;
      this.rememberUsername(username);

      await this.enterWorld(session);
    } catch (error) {
      this.connecting = false;
      this.render();
      this.showAuthError(error);
    }
  }

  private validate(username: string, password: string): string | null {
    if (username.length === 0) return "Masukkan Username Anda.";
    if (username.length < USERNAME_MIN_LENGTH) return "Username minimal 3 karakter.";
    if (!/^[A-Za-z0-9_]+$/.test(username)) {
      return "Gunakan huruf, angka, atau underscore saja.";
    }

    if (password.length === 0) return "Masukkan Password Anda.";
    if (password.length < PASSWORD_MIN_LENGTH) return "Password minimal 6 karakter.";

    return null;
  }

  private enterWorld(session: AuthSession): void {
    this.leaving = true;
    this.setStatus(`Selamat Datang, ${session.account.username}!`, "#9fe08a");
    this.cameras.main.fadeOut(220, 12, 8, 10);
    this.time.delayedCall(240, () => {
      this.scene.start(SCENE_KEYS.CharacterSelect, { session });
    });
  }

  private showAuthError(error: unknown): void {
    if (error instanceof AuthError) {
      if (error.code === "network") {
        this.setStatus("Tidak dapat terhubung ke server. Pastikan server aktif.", "#ff6b6b");
        return;
      }

      this.setStatus(error.message.slice(0, 120), "#ff6b6b");
      return;
    }

    const message = error instanceof Error ? error.message : String(error);
    this.setStatus(`Gagal masuk - ${message}`.slice(0, 120), "#ff6b6b");
  }

  private switchAccount(): void {
    if (this.connecting) return;

    clearSession();
    this.session = null;
    this.mode = "login";
    this.values.password = "";
    this.focusKey = "username";
    this.leaving = false;

    this.render();
    this.setStatus("Silakan login dengan akun lain.", "#d4a359");
  }

  private setStatus(text: string, color: string): void {
    this.statusText.setText(text);
    this.statusText.setColor(color);
  }

  // -------------------------------------------------------------------------
  // Local storage
  // -------------------------------------------------------------------------

  private loadRememberedUsername(): string {
    try {
      const stored = window.localStorage.getItem(USERNAME_STORAGE_KEY);
      if (stored && stored.trim().length > 0) return stored.slice(0, USERNAME_MAX_LENGTH);
    } catch {
      // Private mode / disabled storage
    }

    return "";
  }

  private rememberUsername(username: string): void {
    try {
      window.localStorage.setItem(USERNAME_STORAGE_KEY, username);
    } catch {
      // Ignore storage failures
    }
  }

  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    if (this.keyHandler) this.input.keyboard?.off("keydown", this.keyHandler);
    this.caretTimer?.remove(false);
    this.content = [];
  }
}

import { Injectable, NgZone } from "@angular/core";
import bundledVersion from "../assets/version.json";

export const WEB_BASE = "https://Freddy-hubgit.github.io/stundenplan-11bguti";
export const REPO = "Freddy-hubgit/stundenplan-11bguti";

@Injectable({ providedIn: "root" })
export class UpdateService {
  availableCommit: string | null = null;
  statusMessage = "";
  checking = false;
  // Compile the build identity into the JavaScript, including offline/file builds.
  // A later fetch could describe a newer deployment than the running code.
  private loadedCommit = this.getBundledCommit();

  constructor(private zone: NgZone) {}

  private async readCommit(url: string): Promise<string | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    try {
      const res = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!res.ok) return null;
      const data = await res.json();
      return data && typeof data.commit === "string" && /^[a-f0-9]{7,40}$/i.test(data.commit)
        ? data.commit : null;
    } catch { return null; }
    finally { clearTimeout(timer); }
  }

  getBundledCommit(): Promise<string | null> {
    return Promise.resolve(/^[a-f0-9]{7,40}$/i.test(bundledVersion.commit) ? bundledVersion.commit : null);
  }

  getRemoteCommit(): Promise<string | null> {
    // Only deployed builds are installable; a source commit may not be live yet.
    return this.readCommit(WEB_BASE + "/assets/version.json?t=" + Date.now());
  }

  isOnLiveSite(): boolean {
    return window.location.origin === new URL(WEB_BASE).origin &&
      window.location.pathname.startsWith(new URL(WEB_BASE).pathname + "/");
  }

  async check(): Promise<boolean> {
    if (this.checking) return false;
    this.checking = true;
    this.availableCommit = null;
    this.statusMessage = "Prüfe auf Updates …";
    try {
      const desktop = (window as any).stundenplanDesktop;
      if (desktop) {
        const result = await desktop.checkUpdate({ checkOnly: true });
        if (!result || result.error) throw new Error("Updateprüfung fehlgeschlagen");
        this.zone.run(() => {
          this.availableCommit = result.available ? result.commit : null;
          this.statusMessage = result.updated ? "Update geladen." :
            result.available ? "Neue App-Version verfügbar." : "Du bist auf dem neuesten Stand.";
        });
        return !!(result.available || result.updated);
      }
      const remote = await this.getRemoteCommit();
      if (!remote) throw new Error("Version nicht erreichbar");
      const current = await this.loadedCommit;
      const needs = !current || !(current === remote || current.startsWith(remote) || remote.startsWith(current));
      this.zone.run(() => {
        this.availableCommit = needs ? remote : null;
        this.statusMessage = needs ? "Neue App-Version verfügbar." : "Du bist auf dem neuesten Stand.";
      });
      return needs;
    } catch {
      this.zone.run(() => { this.statusMessage = "Updates konnten nicht geprüft werden. Prüfe deine Internetverbindung und versuche es erneut."; });
      return false;
    } finally {
      this.zone.run(() => { this.checking = false; });
    }
  }

  async apply(): Promise<void> {
    if (!this.availableCommit || this.checking) return;
    const desktop = (window as any).stundenplanDesktop;
    if (desktop) {
      this.checking = true;
      try {
        const result = await desktop.checkUpdate();
        if (!result || result.error) throw new Error("Laden fehlgeschlagen");
        this.availableCommit = null;
        this.statusMessage = "Update geladen.";
      } catch { this.statusMessage = "Update konnte nicht geladen werden. Bitte erneut versuchen."; }
      finally { this.zone.run(() => { this.checking = false; }); }
      return;
    }
    window.location.replace(WEB_BASE + "/?v=" + encodeURIComponent(this.availableCommit));
  }
}

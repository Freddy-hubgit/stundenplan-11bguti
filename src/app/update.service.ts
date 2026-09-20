import { Injectable, NgZone } from "@angular/core";

export const WEB_BASE = "https://Freddy-hubgit.github.io/stundenplan-11bguti";
export const REPO = "Freddy-hubgit/stundenplan-11bguti";

@Injectable({ providedIn: "root" })
export class UpdateService {
  availableCommit: string | null = null;
  statusMessage = "";
  checking = false;

  constructor(private zone: NgZone) {}

  async getBundledCommit(): Promise<string | null> {
    try {
      const res = await fetch("assets/version.json", { cache: "no-store" });
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.commit ? String(data.commit) : null;
    } catch {
      return null;
    }
  }

  async getRemoteCommit(): Promise<string | null> {
    try {
      const res = await fetch(WEB_BASE + "/version.json?t=" + Date.now(), { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        if (data && data.commit) return String(data.commit);
      }
    } catch {
      /* weiter zum GitHub-API-Fallback */
    }

    try {
      const res = await fetch("https://api.github.com/repos/" + REPO + "/commits/main", {
        cache: "no-store",
        headers: { Accept: "application/vnd.github+json" },
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.sha ? String(data.sha) : null;
    } catch {
      return null;
    }
  }

  currentLiveCommit(): string | null {
    try {
      const v = new URLSearchParams(window.location.search).get("v");
      return v || null;
    } catch {
      return null;
    }
  }

  isOnLiveSite(): boolean {
    return window.location.href.indexOf("github.io/stundenplan-11bguti") !== -1;
  }

  async check(): Promise<boolean> {
    this.checking = true;
    this.statusMessage = "";
    try {
      if ((window as any).stundenplanDesktop) {
        const result = await (window as any).stundenplanDesktop.checkUpdate();
        this.zone.run(() => {
          this.checking = false;
          this.availableCommit = result && result.commit ? result.commit : null;
          this.statusMessage = result && result.updated
            ? "Update geladen."
            : "Du bist auf dem neuesten Stand.";
        });
        return !!(result && result.updated);
      }

      const remote = await this.getRemoteCommit();
      if (!remote) {
        this.zone.run(() => {
          this.checking = false;
          this.statusMessage = "Update-Check gerade nicht möglich (offline?).";
        });
        return false;
      }

      const current = this.currentLiveCommit() || (await this.getBundledCommit());
      const needs = !this.sameCommit(current, remote);

      this.zone.run(() => {
        this.checking = false;
        this.availableCommit = needs ? remote : null;
        this.statusMessage = needs ? "Neue Webversion gefunden." : "Du bist auf dem neuesten Stand.";
      });
      return needs;
    } catch {
      this.zone.run(() => {
        this.checking = false;
        this.statusMessage = "Update-Check fehlgeschlagen.";
      });
      return false;
    }
  }

  private sameCommit(a: string | null, b: string | null): boolean {
    if (!a || !b) return false;
    return a === b || a.indexOf(b) === 0 || b.indexOf(a) === 0;
  }

  apply(): void {
    const commit = this.availableCommit;
    const url = WEB_BASE + "/?v=" + encodeURIComponent(commit || String(Date.now()));
    window.location.replace(url);
  }
}

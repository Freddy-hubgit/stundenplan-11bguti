import {appVersion,newerAppVersion,nativeRelease,NativeRelease} from './native-updates';
import { Injectable, NgZone } from "@angular/core";
import bundledVersion from "../assets/version.json";

export const WEB_BASE = "https://Freddy-hubgit.github.io/stundenplan-11bguti";
export const REPO = "Freddy-hubgit/stundenplan-11bguti";

@Injectable({ providedIn: "root" })
export class UpdateService {
  availableCommit: string | null = null;
  statusMessage = "";
  checking = false;
  nativeCurrentVersion:string|null=null;
  nativeLatest:NativeRelease|null=null;
  nativeAvailable=false;
  nativeStatus='';
  get isDesktop():boolean{return !!(window as any).stundenplanDesktop||/Electron\//i.test(navigator.userAgent||'');}

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

  private async installedWindowsVersion():Promise<string|null>{
    const desktop=(window as any).stundenplanDesktop;const legacy=/(?:^|\s)stundenplan-app\/(\d+\.\d+\.\d+)(?:\s|$)/i.exec(navigator.userAgent||'');if(typeof desktop?.getAppVersion!=='function')return appVersion(legacy?.[1]);
    let timer:ReturnType<typeof setTimeout>|undefined;
    try{return appVersion(await Promise.race([Promise.resolve(desktop.getAppVersion()),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),2000);})]));}catch{return null;}finally{clearTimeout(timer);}
  }

  private async checkWindows():Promise<boolean>{
    this.nativeCurrentVersion=null;this.nativeLatest=null;this.nativeAvailable=false;this.nativeStatus='Prüfe Windows-Programm …';
    const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
    try{
      this.nativeCurrentVersion=await this.installedWindowsVersion();
      const response=await fetch('https://api.github.com/repos/Freddy-hubgit/stundenplan-app/releases/latest',{cache:'no-store',signal:controller.signal,headers:{Accept:'application/vnd.github+json'}});
      if(!response.ok)throw new Error('Release nicht erreichbar');
      const release=nativeRelease(await response.json());if(!release)throw new Error('Kein vollständiger Windows-Installer verfügbar');
      this.nativeLatest=release;
      this.nativeAvailable=!this.nativeCurrentVersion||newerAppVersion(release.version,this.nativeCurrentVersion);
      this.nativeStatus=!this.nativeCurrentVersion?`Windows-Version ${release.version} ist verfügbar. Diese ältere App meldet ihre installierte Programmversion noch nicht. Bitte den Installer bei Bedarf manuell installieren.`:this.nativeAvailable?`Neue Windows-Version ${release.version} verfügbar.`:`Windows-Programm ${this.nativeCurrentVersion} ist aktuell.`;
      return this.nativeAvailable;
    }catch{this.nativeStatus='Die Windows-Programmversion konnte nicht geprüft werden. Bitte Verbindung prüfen und später erneut versuchen.';return false;}
    finally{clearTimeout(timer);}
  }

  private async checkWeb():Promise<boolean>{
    try{
      const desktop=(window as any).stundenplanDesktop;
      if(desktop){
        const result=await desktop.checkUpdate({checkOnly:true});
        if(!result||result.error||result.available&&!/^[a-f0-9]{7,40}$/i.test(result.commit||''))throw new Error('Updateprüfung fehlgeschlagen');
        this.availableCommit=result.available?result.commit:null;
        this.statusMessage=result.updated?'Weboberfläche geladen.':result.available?'Neue Weboberfläche verfügbar.':'Weboberfläche ist auf dem neuesten Stand.';
        return !!(result.available||result.updated);
      }
      const remote=await this.getRemoteCommit();if(!remote)throw new Error('Version nicht erreichbar');
      const current=await this.loadedCommit,needs=!current||!(current===remote||current.startsWith(remote)||remote.startsWith(current));
      this.availableCommit=needs?remote:null;this.statusMessage=needs?'Neue Weboberfläche verfügbar.':'Weboberfläche ist auf dem neuesten Stand.';return needs;
    }catch{this.statusMessage='Webupdates konnten nicht geprüft werden. Prüfe deine Internetverbindung und versuche es erneut.';return false;}
  }

  async check():Promise<boolean>{
    if(this.checking)return false;this.checking=true;this.availableCommit=null;this.statusMessage='Prüfe auf Webupdates …';
    try{const result=await Promise.all([this.checkWeb(),this.isDesktop?this.checkWindows():Promise.resolve(false)]);return result.some(Boolean);}
    finally{this.zone.run(()=>{this.checking=false;});}
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
        this.statusMessage = "Weboberfläche geladen.";
      } catch { this.statusMessage = "Update konnte nicht geladen werden. Bitte erneut versuchen."; }
      finally { this.zone.run(() => { this.checking = false; }); }
      return;
    }
    window.location.replace(WEB_BASE + "/?v=" + encodeURIComponent(this.availableCommit));
  }
}

import {YearResetComponent} from '../year-reset/year-reset.component';
import {ChangeHistoryComponent} from '../change-history/change-history.component';
import {TrashComponent} from '../trash/trash.component';
import {SchoolComponent} from '../school/school.component';
import {RoomBookingComponent} from '../room-booking/room-booking.component';
import {ActivatedRoute} from '@angular/router';
import {PortalTilesService,PORTAL_TILE_OPTIONS} from '../portal-tiles.service';
import {AbsenceService,TeacherIdentity} from '../absence.service';
import {DEFAULT_LESSONS} from '../timetable-data';
import { AccountRole, rolesOf, hasRole, roleNames } from '../supabase.service';
import { Router } from '@angular/router';
import { Component, OnInit, ViewChild } from '@angular/core';
import { Profile, SupabaseService } from '../supabase.service';
import { SettingsService } from '../settings.service';

@Component({
  selector: 'app-admin',
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css'],
})
export class AdminComponent implements OnInit {
  tileOptions=PORTAL_TILE_OPTIONS.filter(t=>!['/schuljahr','/aenderungsverlauf'].includes(t.route));tileEnabled:Record<string,boolean>={};tileError='';tileSuccess='';tileBusy=false;
  async loadTiles():Promise<void>{if(!this.isAdmin)return;this.tileError='';try{await this.tileSettings.load();this.tileOptions.forEach(t=>this.tileEnabled[t.route]=this.tileSettings.allowed(t.route));}catch(e:any){this.tileError='Kachelsteuerung konnte nicht geladen werden. Bitte Migration 029 einrichten. '+(e?.message||'');}}
  async toggleTile(route:string,enabled:boolean):Promise<void>{if(!this.isAdmin||this.tileBusy)return;const previous=this.tileEnabled[route];this.tileEnabled[route]=enabled;this.tileBusy=true;this.tileError='';this.tileSuccess='';try{await this.tileSettings.save(route,enabled);this.tileSuccess='Kachel '+(enabled?'aktiviert.':'für alle Nutzer deaktiviert.');}catch(e:any){this.tileEnabled[route]=previous;this.tileError=e?.message||'Kachelstatus konnte nicht gespeichert werden.';}finally{this.tileBusy=false;}}
  @ViewChild(SchoolComponent) classAdmin?:SchoolComponent;
  @ViewChild(RoomBookingComponent) roomAdmin?:RoomBookingComponent;
  @ViewChild(YearResetComponent) yearAdmin?:YearResetComponent;
  @ViewChild(ChangeHistoryComponent) historyAdmin?:ChangeHistoryComponent;
  @ViewChild(TrashComponent) trashAdmin?:TrashComponent;
  private allowedSection(section:string):string{if(section==='system')section='year';return ['accounts','classes','trash'].includes(section)?section:this.isAdmin&&['rooms','teachers','portal','year','history'].includes(section)?section:'accounts';}
  section='accounts';sectionNotice='';
  selectSection(section:string):void{if(this.yearAdmin?.busy||this.historyAdmin?.busy||this.trashAdmin?.busy||this.classAdmin?.busy||this.roomAdmin?.busy||this.classSaving||this.creating||this.editSaving||this.roleSaving||this.deleting){this.sectionNotice='Bitte warten, bis der laufende Vorgang abgeschlossen ist.';return;}this.sectionNotice='';this.section=this.allowedSection(section);void this.router.navigate([],{relativeTo:this.route,queryParams:{bereich:this.section},queryParamsHandling:'merge',replaceUrl:true});if(this.section==='accounts')void this.reload();}
  classes:{id:string;name:string}[]=[];classMemberships:{person_id:string;class_id:string;class_name:string}[]=[];classesReady=false;classesLoading=false;classLoadError='';newClassId='';editClassId='';classBaseline:string[]=[];classSaving=false;classEditError='';classEditSuccess='';
  classIds(person:string):string[]{return this.classMemberships.filter(m=>m.person_id===person).map(m=>m.class_id).sort();}
  classNames(person:string):string{return this.classMemberships.filter(m=>m.person_id===person).map(m=>m.class_name).join(', ')||'Keine Klasse';}
  hasStudentRole(p:Profile):boolean{return rolesOf(p).includes('user');}
  get classChanged():boolean{return this.editClassId!=='__multiple__'&&JSON.stringify(this.classBaseline)!==JSON.stringify(this.editClassId?[this.editClassId]:[]);}
  async loadClasses():Promise<void>{this.classesLoading=true;this.classesReady=false;this.classLoadError='';try{const [classes,memberships]=await Promise.all([this.supabase.supportRpc<{id:string;name:string}[]>('account_class_options'),this.supabase.supportRpc<{person_id:string;class_id:string;class_name:string}[]>('account_class_memberships')]);this.classes=classes;this.classMemberships=memberships;this.classesReady=true;}catch{this.classLoadError='Klassenzuordnungen konnten nicht geladen werden. Bitte die Supabase-Einrichtung für die Kontenverwaltung (037) prüfen und erneut laden.';}finally{this.classesLoading=false;}}
  async saveClass(p:Profile):Promise<void>{if(!this.classesReady||!this.classChanged||this.classSaving||this.editSaving||this.roleSaving||this.deleting)return;this.classSaving=true;this.classEditError='';this.classEditSuccess='';try{const selected=this.editClassId;const baseline=await this.supabase.supportRpc<string[]>('account_class_set',{person:p.id,target:selected||null,expected_classes:this.classBaseline});this.classBaseline=[...baseline].sort();await this.loadClasses();this.classEditSuccess=selected?'Klasse gespeichert.':'Klassenzuordnung entfernt.';}catch(e:any){this.classEditError=e?.message||'Klasse konnte nicht gespeichert werden. Die Auswahl bleibt erhalten.';}finally{this.classSaving=false;}}
  profiles: Profile[] = [];
  teacherIdentities:TeacherIdentity[]=[];
  teacherPerson='';timetableName='';identityError='';identitySuccess='';identitySaving=false;identityLoading=false;
  teacherNames=Array.from(new Set(DEFAULT_LESSONS.reduce<string[]>((names,l)=>names.concat(l.teacher.split(',').map(n=>n.trim())),[]))).sort();
  get isAdmin():boolean{return hasRole(this.myProfile,'admin');}
  async loadTeacherIdentities():Promise<void>{if(!this.isAdmin)return;this.identityLoading=true;this.identityError='';try{this.teacherIdentities=await this.absences.identities();}catch(e:any){this.identityError=e?.message||'Lehrerzuordnungen konnten nicht geladen werden.';}finally{this.identityLoading=false;}}
  selectTeacher():void{this.timetableName=this.teacherIdentities.find(i=>i.user_id===this.teacherPerson)?.timetable_name||'';this.identityError='';this.identitySuccess='';}
  async saveTeacherIdentity():Promise<void>{if(!this.isAdmin||this.identitySaving||!this.teacherPerson||!this.timetableName.trim())return;this.identitySaving=true;this.identityError='';this.identitySuccess='';try{await this.absences.assign(this.teacherPerson,this.timetableName.trim());await this.loadTeacherIdentities();if(!this.identityError)this.identitySuccess='Lehrerkonto dem Stundenplannamen zugeordnet.';}catch(e:any){this.identityError=e?.message||'Zuordnung konnte nicht gespeichert werden.';}finally{this.identitySaving=false;}}

  loading = true;
  loadError = '';
  myId: string | null = null;
  myRole: Profile['role'] | null = null;
  editRoles: AccountRole[] = ['user'];
  myProfile: Profile | null = null;
  readonly roleOptions: AccountRole[] = ['user','teacher','support','admin'];
  roleNames = roleNames;
  roleLabel(role: AccountRole): string { return ({user:'Nutzer',teacher:'Lehrer',support:'Support',admin:'Admin'})[role]; }
  toggleEditRole(role: AccountRole): void { this.editRoles = this.editRoles.includes(role) ? this.editRoles.filter(r=>r!==role) : [...this.editRoles,role]; }
  rolesChanged(p: Profile): boolean { return [...this.editRoles].sort().join() !== [...rolesOf(p)].sort().join(); }
  roleSaving = false;

  // Neues Konto
  newName = '';
  newEmail = '';
  newPassword = '';
  newRole: 'user' | 'teacher' | 'support' | 'admin' = 'user';
  creating = false;
  createError = '';
  createSuccess = '';

  // Konto bearbeiten
  editTargetId: string | null = null;
  editName = '';
  editEmail = '';
  editPassword = '';
  editSaving = false;
  editError = '';
  editSuccess = '';
  confirmingDelete = false;
  deleting = false;

  settingsOpen = false;

  constructor(private supabase: SupabaseService, public settings: SettingsService, private router: Router,private absences:AbsenceService,public tileSettings:PortalTilesService,private route:ActivatedRoute) {}

  openSettings(): void {
    this.settingsOpen = true;
  }

  closeSettings(): void {
    this.settingsOpen = false;
  }

  async ngOnInit(): Promise<void> {
    const me = await this.supabase.getMyProfile();
    this.myId = me?.id ?? null;
    this.myRole = me?.role ?? null;
    this.myProfile = me;
    const requested=this.route.snapshot.queryParamMap.get('bereich')||'accounts';this.section=this.allowedSection(requested);
    await this.reload();await this.loadTiles();
  }

  async reload(): Promise<void> {
    this.loading = true;
    this.loadError = '';
    try {
      this.profiles = await this.supabase.listProfiles();
      await Promise.all([this.loadTeacherIdentities(),this.loadClasses()]);
    } catch (e: any) {
      this.loadError = e?.message ?? 'Konnte Konten nicht laden.';
    }
    this.loading = false;
  }

  displayName(p: Profile): string {
    return p.full_name?.trim() || p.email;
  }

  async createAccount(): Promise<void> {
    this.createError = '';
    this.createSuccess = '';

    if (!this.newEmail || !this.newPassword) {
      this.createError = 'E-Mail und Passwort erforderlich.';
      return;
    }

    if(this.creating)return;
    const chosenClass=this.newRole==='user'?this.newClassId:'';
    if(chosenClass&&!this.classesReady){this.createError='Bitte zuerst die Klassen neu laden.';return;}
    const email=this.newEmail.trim(),name=this.newName;
    this.creating=true;
    try{
      const result=await this.supabase.createUserAccount(email,this.newPassword,this.newRole,name);
      if(!result.ok){this.createError=result.error||'Erstellung fehlgeschlagen.';return;}
      this.createSuccess=`Konto für ${name||email} wurde angelegt.`;
      this.newName='';this.newEmail='';this.newPassword='';this.newRole='user';this.newClassId='';
      await this.reload();
      if(chosenClass){
        const created=this.profiles.find(p=>p.email.toLocaleLowerCase()===email.toLocaleLowerCase());
        try{
          if(!created||!this.classesReady)throw new Error('Bitte die Kontenliste neu laden und das Konto bearbeiten.');
          await this.supabase.supportRpc('account_class_set',{person:created.id,target:chosenClass,expected_classes:this.classIds(created.id)});
          await this.loadClasses();this.createSuccess+=' Klasse zugeordnet.';
        }catch(e:any){
          this.createError='Das Konto wurde bereits angelegt, aber die Klasse konnte nicht zugeordnet werden. Nicht erneut anlegen. '+(e?.message||'Bitte die Zuordnung beim bestehenden Konto speichern.');
          if(created){this.startEdit(created);this.editClassId=chosenClass;this.classEditError='Bitte die Klassenzuordnung hier erneut speichern.';}
        }
      }
    }catch{this.createError='Die Anfrage konnte nicht bestätigt werden. Bitte zuerst die Kontenliste neu laden und prüfen, ob das Konto angelegt wurde.';}
    finally{this.creating=false;}
  }

  startEdit(p: Profile): void {
    if (this.editSaving || this.roleSaving || this.classSaving) return;
    this.classBaseline=this.classIds(p.id);this.editClassId=this.classBaseline.length>1?'__multiple__':this.classBaseline[0]||'';this.classEditError='';this.classEditSuccess='';
    this.editRoles = [...rolesOf(p)];
    this.editTargetId = p.id;
    this.editName = p.full_name ?? '';
    this.editEmail = p.email;
    this.editPassword = '';
    this.editError = '';
    this.editSuccess = '';
    this.confirmingDelete = false;
  }

  cancelEdit(): void {
    if (this.editSaving || this.roleSaving || this.classSaving) return;
    this.editTargetId = null;
    this.editPassword = '';
    this.editError = '';
    this.editSuccess = '';
    this.confirmingDelete = false;
  }

  get canEditRoles(): boolean { return hasRole(this.myProfile, 'admin', 'support'); }

  async saveRole(p: Profile): Promise<void> {
    if (!this.canEditRoles || this.roleSaving || this.editSaving || this.classSaving || !this.rolesChanged(p)) return;
    if (!this.editRoles.length) { this.editError = 'Mindestens eine Rolle auswählen.'; return; }
    this.roleSaving = true; this.editError = ''; this.editSuccess = '';
    const result = await this.supabase.changeUserRoles(p.id, this.editRoles);
    if (!result.ok) {
      this.editError = result.error ?? 'Rolle konnte nicht geändert werden.';
      this.roleSaving = false; return;
    }
    this.editSuccess = 'Rolle gespeichert.';
    try {
      if (p.id === this.myId) {
        const me = await this.supabase.getMyProfile();
        this.myRole = me?.role ?? null;
        this.myProfile = me;
        if (!hasRole(me, 'admin', 'support')) {
          await this.router.navigateByUrl('/'); return;
        }
      }
      await this.reload();
    } finally { this.roleSaving = false; }
  }

  async saveEdit(p: Profile): Promise<void> {
    if (this.roleSaving || this.editSaving || this.classSaving) return;
    this.editError = '';
    this.editSuccess = '';

    const newEmail = this.editEmail.trim();
    const newName = this.editName.trim();

    if (!newEmail) {
      this.editError = 'E-Mail darf nicht leer sein.';
      return;
    }

    // Nur tatsächlich geänderte Felder an den Server schicken
    const changes: { email?: string; name?: string; password?: string } = {};
    if (newEmail !== p.email) changes.email = newEmail;
    if (newName !== (p.full_name ?? '')) changes.name = newName;
    if (this.editPassword) {
      if (this.editPassword.length < 6) {
        this.editError = 'Passwort muss mindestens 6 Zeichen haben.';
        return;
      }
      changes.password = this.editPassword;
    }

    if (Object.keys(changes).length === 0) {
      if(this.classChanged){await this.saveClass(p);return;}
      this.editError = 'Keine Änderungen vorgenommen.';
      return;
    }

    this.editSaving = true;
    const result = await this.supabase.updateUserAccount(p.id, changes);
    this.editSaving = false;

    if (!result.ok) {
      this.editError = result.error ?? 'Speichern fehlgeschlagen.';
      return;
    }

    this.editSuccess = 'Änderungen gespeichert.';
    this.editPassword = '';
    if(this.classChanged){await this.saveClass(p);if(this.classEditError||this.classChanged)return;}
    await this.reload();
    setTimeout(() => {
      if (this.editTargetId === p.id&&!this.classChanged&&!this.classSaving) this.cancelEdit();
    }, 1500);
  }

  requestDelete(): void {
    if (this.roleSaving || this.editSaving || this.classSaving) return;
    this.confirmingDelete = true;
  }

  cancelDelete(): void {
    this.confirmingDelete = false;
  }

  async confirmDelete(p: Profile): Promise<void> {
    if (this.roleSaving || this.editSaving || this.classSaving) return;
    this.editError = '';
    this.deleting = true;
    const result = await this.supabase.deleteUserAccount(p.id);
    this.deleting = false;

    if (!result.ok) {
      this.editError = result.error ?? 'Löschen fehlgeschlagen.';
      this.confirmingDelete = false;
      return;
    }

    this.cancelEdit();
    await this.reload();
  }
}
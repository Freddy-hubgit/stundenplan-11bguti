import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { AppComponent } from './app.component';
import { PortalSectionComponent } from './portal-section/portal-section.component';
import { PortalHomeComponent } from './portal-home/portal-home.component';
import { StundenplanPageComponent } from './stundenplan/stundenplan-page.component';
import { LoginComponent } from './login/login.component';
import { AdminComponent } from './admin/admin.component';
import { ProfileMenuComponent } from './profile-menu/profile-menu.component';
import { AuthGuard } from './auth.guard';
import { FeatureAccessGuard } from './feature-access.guard';
import { AdminGuard } from './admin.guard';
import { SettingsModalComponent } from './settings-modal/settings-modal.component';
import { AccountSettingsComponent } from './account-settings/account-settings.component';
import { SubstitutionComponent } from './substitution/substitution.component';
import { SupportComponent } from './support/support.component';

const routes: Routes = [
  { path: 'kalender', component: PortalSectionComponent, canActivate: [AuthGuard, FeatureAccessGuard], data: { allowedRoles: ['teacher', 'support', 'admin'], title: 'Kalender', description: 'Hier ist Platz für Termine und Veranstaltungen.' } },
  { path: 'videokonferenz', component: PortalSectionComponent, canActivate: [AuthGuard], data: { title: 'Videokonferenz', description: 'Hier ist Platz für Videokonferenzen und Besprechungslinks.' } },
  { path: 'login', component: LoginComponent },
  { path: 'vertretungsplan', component: SubstitutionComponent, canActivate: [AuthGuard, AdminGuard] },
  { path: 'support', component: SupportComponent, canActivate: [AuthGuard, FeatureAccessGuard], data: { allowedRoles: ['user', 'support', 'admin'] } },
  { path: '', component: PortalHomeComponent, canActivate: [AuthGuard] },
  { path: 'stundenplan', component: StundenplanPageComponent, canActivate: [AuthGuard] },
  { path: 'admin', component: AdminComponent, canActivate: [AuthGuard, AdminGuard] },
];

@NgModule({
  declarations: [
    AppComponent,
    PortalHomeComponent,
    PortalSectionComponent,
    StundenplanPageComponent,
    LoginComponent,
    AdminComponent,
    ProfileMenuComponent,
    SettingsModalComponent,
    SupportComponent,
    SubstitutionComponent,
    AccountSettingsComponent,
  ],
  imports: [
    BrowserModule,
    FormsModule,
    RouterModule.forRoot(routes),
  ],
  providers: [],
  bootstrap: [AppComponent],
})
export class AppModule { }

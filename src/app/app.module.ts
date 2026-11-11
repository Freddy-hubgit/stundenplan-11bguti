import {LearningGradesComponent} from './learning-grades/learning-grades.component';
import {ExaminationCalendarComponent} from './examination-calendar/examination-calendar.component';
import {ConsultationsComponent} from './consultations/consultations.component';
import {PortalSearchComponent} from './portal-search/portal-search.component';
import {TrashComponent} from './trash/trash.component';
import {MyTeachingComponent} from './my-teaching/my-teaching.component';
import {AvatarComponent} from './avatar/avatar.component';
import {NotebooksComponent,NotebookLeaveGuard} from './notebooks/notebooks.component';
import {PeriodPickerComponent} from './period-picker/period-picker.component';
import {GroupChatsComponent} from './group-chats/group-chats.component';
import {SubmissionReviewComponent} from './submission-review/submission-review.component';
import {RoomBookingComponent} from './room-booking/room-booking.component';
import {ChangeHistoryComponent} from './change-history/change-history.component';
import {SchoolComponent} from './school/school.component';
import {MaterialsComponent} from './materials/materials.component';
import {ExamPlanComponent} from './exam-plan/exam-plan.component';
import {DashboardComponent} from './dashboard/dashboard.component';
import {YearResetComponent} from './year-reset/year-reset.component';
import { AbsenceComponent } from './absence/absence.component';
import { NotificationsComponent } from './notifications/notifications.component';
import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { BackgroundSettingsComponent } from './background-settings/background-settings.component';
import { HomeworkComponent } from './homework/homework.component';
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
import { MessagesComponent } from './messages/messages.component';
import { SupportComponent } from './support/support.component';

const routes: Routes = [
 {path:'noten',component:LearningGradesComponent,canActivate:[AuthGuard,FeatureAccessGuard],data:{allowedRoles:['user','teacher','admin']}},
 {path:'pruefungen',component:ExaminationCalendarComponent,canActivate:[AuthGuard]},
 {path:'sprechstunden',component:ConsultationsComponent,canActivate:[AuthGuard,FeatureAccessGuard],data:{allowedRoles:['user','teacher','admin']}},
 {path:'suche',component:PortalSearchComponent,canActivate:[AuthGuard]},
 {path:'papierkorb',component:TrashComponent,canActivate:[AuthGuard]},
 {path:'lehrerstundenplan',component:MyTeachingComponent,canActivate:[AuthGuard,FeatureAccessGuard],data:{allowedRoles:['teacher']}},
  {path:'hefte',component:NotebooksComponent,canActivate:[AuthGuard],canDeactivate:[NotebookLeaveGuard]},
  {path:'abgaben',component:SubmissionReviewComponent,canActivate:[AuthGuard,FeatureAccessGuard],data:{allowedRoles:['teacher','admin']}},
  {path:'raumbuchung',component:RoomBookingComponent,canActivate:[AuthGuard]},
  {path:'aenderungsverlauf',component:ChangeHistoryComponent,canActivate:[AuthGuard,FeatureAccessGuard],data:{allowedRoles:['admin']}},
  {path:'klassen',component:SchoolComponent,canActivate:[AuthGuard]},
  {path:'materialien',component:MaterialsComponent,canActivate:[AuthGuard]},
  {path:'schuljahr',component:YearResetComponent,canActivate:[AuthGuard,FeatureAccessGuard],data:{allowedRoles:['admin']}},
  { path: 'krankmeldung', component: AbsenceComponent, canActivate: [AuthGuard, FeatureAccessGuard], data: {allowedRoles:['teacher','admin','support']} },
  { path: 'meldungen', component: NotificationsComponent, canActivate: [AuthGuard] },
  { path: 'hausaufgaben', component: HomeworkComponent, canActivate: [AuthGuard] },
  { path: 'nachrichten', component: MessagesComponent, canActivate: [AuthGuard] },
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
    LearningGradesComponent,ExaminationCalendarComponent,ConsultationsComponent,PortalSearchComponent,TrashComponent,MyTeachingComponent,AvatarComponent,AppComponent,PeriodPickerComponent,NotebooksComponent,GroupChatsComponent,SubmissionReviewComponent,RoomBookingComponent,ChangeHistoryComponent,
    SchoolComponent,MaterialsComponent,ExamPlanComponent,DashboardComponent,YearResetComponent,
    AbsenceComponent,
    NotificationsComponent,
    HomeworkComponent,
    BackgroundSettingsComponent,
    PortalHomeComponent,
    PortalSectionComponent,
    StundenplanPageComponent,
    LoginComponent,
    AdminComponent,
    ProfileMenuComponent,
    SettingsModalComponent,
    SupportComponent,
    MessagesComponent,
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

import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { AppComponent } from './app.component';
import { PortalHomeComponent } from './portal-home/portal-home.component';
import { StundenplanPageComponent } from './stundenplan/stundenplan-page.component';
import { LoginComponent } from './login/login.component';
import { AuthGuard } from './auth.guard';

const routes: Routes = [
  { path: 'login', component: LoginComponent },
  { path: '', component: PortalHomeComponent, canActivate: [AuthGuard] },
  { path: 'stundenplan', component: StundenplanPageComponent, canActivate: [AuthGuard] },
];

@NgModule({
  declarations: [
    AppComponent,
    PortalHomeComponent,
    StundenplanPageComponent,
    LoginComponent,
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
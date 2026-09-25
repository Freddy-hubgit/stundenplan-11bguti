import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';
import { FormsModule } from '@angular/forms';
import { RouterModule, Routes } from '@angular/router';

import { AppComponent } from './app.component';
import { PortalHomeComponent } from './portal-home/portal-home.component';
import { StundenplanPageComponent } from './stundenplan/stundenplan-page.component';

const routes: Routes = [
  { path: '', component: PortalHomeComponent },
  { path: 'stundenplan', component: StundenplanPageComponent },
];

@NgModule({
  declarations: [
    AppComponent,
    PortalHomeComponent,
    StundenplanPageComponent,
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
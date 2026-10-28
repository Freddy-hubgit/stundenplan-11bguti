import { Component } from '@angular/core';
import { BackgroundImageService } from '../background-image.service';
@Component({selector:'app-background-settings',templateUrl:'./background-settings.component.html',styleUrls:['./background-settings.component.css']})
export class BackgroundSettingsComponent {
 constructor(public background:BackgroundImageService){}
 async select(event:Event):Promise<void>{const input=event.target as HTMLInputElement;const file=input.files?.[0];if(file)await this.background.upload(file);input.value='';}
}

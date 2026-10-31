import {Component,Input,Output,EventEmitter} from '@angular/core';import {SCHOOL_PERIODS,periodRangeLabel} from '../school-periods';
@Component({selector:'app-period-picker',templateUrl:'./period-picker.component.html',styleUrls:['./period-picker.component.css']})
export class PeriodPickerComponent{
 @Input() start='07:30';@Output() startChange=new EventEmitter<string>();
 @Input() end='08:15';@Output() endChange=new EventEmitter<string>();
 @Input() disabled=false;@Input() label='Unterrichtszeit';
 readonly periods=SCHOOL_PERIODS;private forceCustom=false;
 get first():number{return this.periods.findIndex(p=>p.start===this.start.slice(0,5));}
 get last():number{return this.periods.findIndex(p=>p.end===this.end.slice(0,5));}
 get custom():boolean{return this.forceCustom||this.first<0||this.last<this.first;}
 get summary():string{return periodRangeLabel(this.start,this.end);}
 mode(value:string):void{this.forceCustom=value==='custom';if(!this.forceCustom){const first=Math.max(this.first,0);this.range(first,Math.max(first,this.last));}}
 private range(first:number,last:number):void{this.startChange.emit(this.periods[first].start);this.endChange.emit(this.periods[last].end);}
 firstChanged(value:string):void{const first=Number(value);if(Number.isInteger(first)&&first>=0&&first<this.periods.length)this.range(first,Math.max(first,this.last));}
 lastChanged(value:string):void{const last=Number(value);if(Number.isInteger(last)&&last>=0&&last<this.periods.length)this.range(Math.min(Math.max(this.first,0),last),last);}
}

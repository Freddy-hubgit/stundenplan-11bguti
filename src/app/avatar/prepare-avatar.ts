export async function prepareAvatar(file:File):Promise<Blob>{
 if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>5*1024*1024)throw new Error('Bitte ein JPG-, PNG- oder WebP-Bild mit höchstens 5 MB auswählen.');
 const url=URL.createObjectURL(file);
 try{
  const image=new Image();await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(new Error('Das Bild konnte nicht gelesen werden.'));image.src=url;});
  const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx)throw new Error('Bildverarbeitung ist auf diesem Gerät nicht verfügbar.');
  const side=Math.min(image.naturalWidth,image.naturalHeight);if(!side)throw new Error('Das Bild ist leer.');
  ctx.drawImage(image,(image.naturalWidth-side)/2,(image.naturalHeight-side)/2,side,side,0,0,256,256);
  return await new Promise<Blob>((resolve,reject)=>canvas.toBlob(blob=>blob&&blob.type==='image/webp'?resolve(blob):reject(new Error('Bild konnte nicht gespeichert werden.')),'image/webp',0.85));
 }finally{URL.revokeObjectURL(url);}
}

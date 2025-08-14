export function clamp(v,a,b){return Math.max(a,Math.min(b,v));}
export function bearingToText(deg){ const dirs=['N','NE','E','SE','S','SO','O','NO']; let d=(deg%360+360)%360; return `${Math.round(d)}° ${dirs[Math.round(d/45)%8]}`; }
export function nms(boxes, iouThresh=0.45){ const out=[]; boxes.sort((a,b)=>b.score-a.score); const used=new Array(boxes.length).fill(false);
  const IoU=(a,b)=>{ const x1=Math.max(a.x,b.x), y1=Math.max(a.y,b.y), x2=Math.min(a.x+a.w,b.x+b.w), y2=Math.min(a.y+a.h,b.y+b.h); const inter=Math.max(0,x2-x1)*Math.max(0,y2-y1); const ua=a.w*a.h+b.w*b.h-inter; return ua>0?inter/ua:0; };
  for(let i=0;i<boxes.length;i++){ if(used[i]) continue; out.push(boxes[i]); for(let j=i+1;j<boxes.length;j++){ if(IoU(boxes[i],boxes[j])>iouThresh) used[j]=true; } } return out; }
export function center(bb){ return {cx: bb.x+bb.w/2, cy: bb.y+bb.h/2}; }

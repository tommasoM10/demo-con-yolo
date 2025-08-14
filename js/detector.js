import {nms} from './utils.js';
export class YOLODetector{
  constructor(){ this.session=null; this.inputSize=640; }
  async load(modelUrl, statusEl){
    try{ statusEl.textContent='carico modello…'; this.session = await ort.InferenceSession.create(modelUrl, {executionProviders:['wasm']}); statusEl.textContent='modello ONNX pronto'; }
    catch(e){ statusEl.textContent='errore modello'; console.error(e); throw e; }
  }
  preprocess(video){
    const s=this.inputSize; const cnv=document.createElement('canvas'); cnv.width=s; cnv.height=s; const ctx=cnv.getContext('2d');
    const vw=video.videoWidth||1280, vh=video.videoHeight||720; const scale=Math.min(s/vw, s/vh); const nw=vw*scale, nh=vh*scale; const dx=(s-nw)/2, dy=(s-nh)/2;
    ctx.fillStyle='#000'; ctx.fillRect(0,0,s,s); ctx.drawImage(video,0,0,vw,vh,dx,dy,nw,nh);
    const img=ctx.getImageData(0,0,s,s).data; const data=new Float32Array(s*s*3);
    for(let i=0,j=0;i<img.length;i+=4){ data[j++]=img[i]/255; data[j++]=img[i+1]/255; data[j++]=img[i+2]/255; }
    return {tensor:new ort.Tensor('float32',data,[1,3,s,s]), scale, dx, dy, vw, vh};
  }
  postprocess(out, meta, conf){
    // Supports common YOLOv8 ONNX export where output key is 'output0' with shape [1,84,8400] (or similar).
    const arr=out.data, dims=out.dims; const no=dims[1], nPred=dims[2]; const nc=no-5; const res=[];
    for(let i=0;i<nPred;i++){ const off=i*no; let best=0, cls=0;
      for(let c=0;c<nc;c++){ const s=arr[off+5+c]; if(s>best){best=s; cls=c;} }
      const obj=arr[off+4]; const score=obj*best; if(score<conf) continue; if(cls!==0) continue; // keep only 'person'
      const cx=arr[off+0], cy=arr[off+1], w=arr[off+2], h=arr[off+3];
      const x=(cx-w/2 - meta.dx)/meta.scale, y=(cy-h/2 - meta.dy)/meta.scale; const bw=w/meta.scale, bh=h/meta.scale;
      res.push({x, y, w:bw, h:bh, score});
    }
    return nms(res, 0.45);
  }
  async detect(video, conf){ const meta=this.preprocess(video); const out=await this.session.run({'images':meta.tensor}); const key=Object.keys(out)[0]; const boxes=this.postprocess(out[key], meta, conf); return {boxes, vw:meta.vw, vh:meta.vh}; }
}

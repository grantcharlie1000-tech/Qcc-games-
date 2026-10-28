const selector='img.ui-card-img,img.ui-hero-backdrop';
const setState=(img:Element,on:string,off:string)=>{img.classList.add(on);img.classList.remove(off);};

// Adds the ui-images hook to root and classifies card and hero images from their load and error events.
export const watchImages=(root:HTMLElement):()=>void=>{
  const onLoad=(e:Event)=>{const img=e.target as Element|null;if(img?.matches(selector))setState(img,'is-loaded','is-failed');};
  const onError=(e:Event)=>{const img=e.target as Element|null;if(img?.matches(selector))setState(img,'is-failed','is-loaded');};
  root.classList.add('ui-images');
  root.addEventListener('load',onLoad,true);
  root.addEventListener('error',onError,true);
  return()=>{
    root.removeEventListener('load',onLoad,true);
    root.removeEventListener('error',onError,true);
    root.classList.remove('ui-images');
  };
};

// Classifies images that finished before watchImages attached: complete with a width is loaded, otherwise failed.
export const markImages=(root:ParentNode):void=>{
  for(const img of root.querySelectorAll<HTMLImageElement>(selector)){
    if(!img.complete)continue;
    if(img.naturalWidth>0)setState(img,'is-loaded','is-failed');
    else setState(img,'is-failed','is-loaded');
  }
};

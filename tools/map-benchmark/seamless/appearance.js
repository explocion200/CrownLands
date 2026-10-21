/* Private preview: reuse the game's flag normalizer and renderer. */
(function(){
  "use strict";
  const renderer=globalThis.CrownlandsFlagRenderer.create({config:globalThis.CrownlandsPlayerFlags,
    renderIcon:(name,className)=>`<svg class="${className}" aria-hidden="true"><use href="#cl-icon-${name}"></use></svg>`});
  const rendered=new WeakMap();
  window.SeamlessAppearance={render(node,item,{visible=true,inspector=false}={}){
    let flag=node.querySelector('.preview-owner-flag');
    if(!item.ownerFlag||!visible){flag?.remove();return;}
    if(!flag){flag=document.createElement('span');flag.className='kingdom-flag preview-owner-flag'+(inspector?' inspector-owner-flag':'');flag.setAttribute('aria-hidden','true');const symbol=document.createElement('span');symbol.className='flag-symbol';flag.append(symbol);if(inspector)node.prepend(flag);else node.append(flag);}
    if(rendered.get(flag)!==item.ownerFlag){renderer.render(flag,item.ownerFlag,{stableKey:item.key,context:'private-map',size:'small'});rendered.set(flag,item.ownerFlag);}
  }};
})();

"use strict";
const fs=require("node:fs"),path=require("node:path");
const Flags=require("../../../functions/playerFlagConfig");
// Reuse existing game patterns and symbols; no new heraldry or outside images.
function appearanceAssets(root){
  const styles=fs.readFileSync(path.join(root,"styles.css"),"utf8");
  const start=styles.indexOf(".kingdom-flag {"),end=styles.indexOf(".kingdom-flag-small {",start);
  if(start<0||end<0)throw Error("Shared flag style contract changed");
  const sources=[fs.readFileSync(path.join(root,"assets/flag-symbols/runtime.svg"),"utf8"),fs.readFileSync(path.join(root,"index.html"),"utf8")];
  const symbols=Flags.SYMBOLS.filter(s=>!s.premium).map(s=>{
    const pattern=new RegExp(`<symbol id="cl-icon-${s.icon||s.key}"[\\s\\S]*?<\\/symbol>`);
    const found=sources.map(source=>source.match(pattern)?.[0]).find(Boolean);
    if(!found)throw Error("Missing approved flag symbol");return found;
  });
  return{css:styles.slice(start,end)+`
.preview-owner-flag{position:absolute;left:50%;bottom:94%;transform:translateX(-50%);width:20px;height:15px;border-width:1px;box-shadow:0 1px 2px #0005;pointer-events:none}
.preview-owner-flag .flag-symbol{display:block;width:12px;height:12px}
.preview-owner-flag .flag-symbol-icon{display:block;width:100%;height:100%;fill:currentColor;stroke:var(--flag-symbol-outline);stroke-width:.65px;paint-order:stroke fill}
.inspector-owner-flag{position:relative;display:inline-grid;left:auto;bottom:auto;transform:none;width:32px;height:24px;vertical-align:middle;margin-right:7px}
.inspector-owner-flag .flag-symbol{width:20px;height:20px}
#world.overview .preview-owner-flag{display:none}
`,svg:`<svg xmlns="http://www.w3.org/2000/svg">${symbols.join("")}</svg>`};
}
module.exports={appearanceAssets};

/* Extract the selected in-map painting's pixels; this mask does not paint art. */
const fs = require('node:fs');
const path = require('node:path');
const sharp = require('sharp');
const directory = path.resolve(__dirname, '../docs/art-sources/inner-city-estate');
const context = {x:574,y:538,width:300,height:225};
// Reviewed silhouette in the original 1448 x 1086 contextual painting. The
// inside of the arch is removed so the terrain's actual road shows through.
const outline = `M413 651 L424 624 L438 598 L473 586 L478 540 L484 540 L485 548
 L506 554 L539 566 L519 572 L485 564 L484 587 L520 597 L525 621
 L534 621 L534 614 L551 614 L551 623 L565 623 L565 614 L583 614 L583 624
 L599 624 L599 615 L617 615 L617 624 L631 624 L631 615 L650 615 L650 624
 L667 624 L667 616 L684 616 L684 624 L700 624 L700 616 L718 616 L718 624
 L735 624 L735 616 L751 616 L751 624 L768 624 L768 616 L786 616 L786 624
 L804 624 L804 616 L820 616 L820 624 L838 624 L838 616 L855 616 L855 624
 L873 624 L873 616 L890 616 L890 624 L908 624 L908 616 L925 616 L925 624
 L943 624 L943 616 L960 616 L960 624 L975 624 L981 600 L1017 587
 L1020 540 L1026 540 L1027 549 L1047 553 L1078 565 L1057 573 L1027 565
 L1026 587 L1054 596 L1075 632 L1079 651 L1090 650 L1090 793
 L1075 803 L1066 817 L1037 811 L1020 819 L992 814 L975 805 L968 766
 L951 761 L934 769 L915 760 L900 766 L881 766 L862 755 L845 768
 L826 766 L806 765 L795 769 L795 733 Q793 707 770 695 Q746 681 723 693
 Q698 704 695 731 L695 768 L679 766 L650 763 L626 769 L608 762
 L589 765 L573 771 L550 766 L530 787 L508 808 L492 819 L461 809
 L444 813 L422 803 L416 792 Z`;
async function main() {
  const input=path.join(directory,'gate-context-painted-v4.png');
  const m=await sharp(input).metadata();
  if(m.width!==1448||m.height!==1086)throw new Error('Gate mask requires the reviewed contextual canvas.');
  const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="1448" height="1086"><path d="${outline}" fill="white"/></svg>\n`;
  fs.writeFileSync(path.join(directory,'gate-extraction-mask-v4.svg'),svg);
  const full=await sharp(input).ensureAlpha().composite([{input:Buffer.from(svg),blend:'dest-in'}]).png().toBuffer();
  const {data,info}=await sharp(full).trim({threshold:4}).png().toBuffer({resolveWithObject:true});
  await sharp(data).toFile(path.join(directory,'gatehouse-extracted-v4.png'));
  const left=-info.trimOffsetLeft,top=-info.trimOffsetTop,scale=context.width/m.width;
  const geometry={context,canvas:{width:m.width,height:m.height},extraction:{left,top,width:info.width,height:info.height},artSize:{width:info.width*scale,height:info.height*scale},artOffset:{x:context.x+(left+info.width/2)*scale-1448*.50,y:context.y+(top+info.height/2)*scale-1086*.60}};
  fs.writeFileSync(path.join(directory,'gate-placement-v4.json'),JSON.stringify(geometry,null,2)+'\n');
  console.log(JSON.stringify(geometry));
}
main().catch(error=>{console.error(error);process.exitCode=1;});

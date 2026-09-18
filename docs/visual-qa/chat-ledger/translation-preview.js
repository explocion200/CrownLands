"use strict";
// Prepared multilingual examples for design review, NOT a live translation service.
// No messages leave this page. Arbitrary user text always retains its original wording.
window.ChatTranslationPreview = (() => {
  const phrases = [
    {en:"The scouts have returned. The northern pass is clear.",es:"Los exploradores han regresado. El paso del norte está despejado.",fr:"Les éclaireurs sont de retour. Le passage du nord est dégagé.",de:"Die Späher sind zurück. Der nördliche Pass ist frei.",pt:"Os batedores voltaram. A passagem do norte está livre.",ar:"عاد الكشافة. الممر الشمالي آمن."},
    {en:"Our reinforcements are on their way home.",es:"Nuestros refuerzos están de camino a casa.",fr:"Nos renforts sont en route pour rentrer.",de:"Unsere Verstärkung ist auf dem Heimweg.",pt:"Nossos reforços estão voltando para casa.",ar:"تعزيزاتنا في طريقها إلى الوطن."},
    {en:"We stand together. For the clan!",es:"Permanecemos unidos. ¡Por el clan!",fr:"Nous restons unis. Pour le clan !",de:"Wir stehen zusammen. Für den Clan!",pt:"Estamos unidos. Pelo clã!",ar:"نقف معًا. من أجل العشيرة!"},
    {en:"Keep a reserve at home before sending more troops.",es:"Mantén una reserva en casa antes de enviar más tropas.",fr:"Gardez une réserve chez vous avant d'envoyer davantage de troupes.",de:"Lasst eine Reserve zu Hause, bevor ihr weitere Truppen entsendet.",pt:"Mantenha uma reserva em casa antes de enviar mais tropas.",ar:"احتفظ بقوة احتياطية في الوطن قبل إرسال المزيد من القوات."},
    {en:"I will wait for your scout report before marching.",es:"Esperaré tu informe de exploración antes de marchar.",fr:"J'attendrai votre rapport d'éclaireur avant de partir.",de:"Ich warte auf euren Spähbericht, bevor ich aufbreche.",pt:"Vou esperar seu relatório de reconhecimento antes de marchar.",ar:"سأنتظر تقرير استطلاعك قبل المسير."},
    {en:"The western road is quiet. Safe travels to every banner.",es:"El camino del oeste está tranquilo. Buen viaje a todos los estandartes.",fr:"La route de l'ouest est calme. Bonne route à toutes les bannières.",de:"Auf der westlichen Straße ist es ruhig. Gute Reise allen Bannern.",pt:"A estrada do oeste está tranquila. Boa viagem a todos os estandartes.",ar:"الطريق الغربي هادئ. رحلة آمنة لكل الرايات."}
  ];
  function language(preferences = navigator.languages, fallback = navigator.language) {
    for (const value of [...(preferences || []), fallback, "en"]) {
      try { return new Intl.Locale(value).language; } catch (_) { /* Try the next reported preference. */ }
    }
    return "en";
  }
  function lookup(original, target) {
    const phrase = phrases.find(p => Object.values(p).includes(original));
    const text = phrase?.[target];
    return {text:text || original, translated:Boolean(text && text !== original), available:Boolean(text)};
  }
  function create({button, list, quick, onChange}) {
    let enabled = false, override = "device", target = language();
    function label() { try { return new Intl.DisplayNames(["en"], {type:"language"}).of(target); } catch (_) { return target.toUpperCase(); } }
    function updateButton() {
      button.setAttribute("aria-pressed", String(enabled));
      button.setAttribute("aria-label", enabled ? `Show original messages. Translation language: ${label()}` : `Translate messages to ${label()}`);
      button.title = `${override === "device" ? "Device language" : "Preview language"}: ${label()}. ${enabled ? "Show original messages" : "Translate chat messages"}`;
      button.querySelector(".translate-label").textContent = enabled ? "Show originals" : "Translate";
      button.querySelector(".translate-language").textContent = label();
      button.dataset.language = target;
    }
    function apply(messages, mode, unavailable = false) {
      updateButton(); button.disabled = unavailable;
      const byId = new Map(messages.map(m => [m.id, m]));
      const top = list.getBoundingClientRect().top;
      const atBottom = window.CrownlandsChat.isMessageListNearBottom(list);
      const anchor = [...list.children].find(row => row.getBoundingClientRect().bottom > top);
      const offset = anchor?.getBoundingClientRect().top || 0;
      let changed = false, translated = 0;
      for (const row of list.children) {
        const m = byId.get(row.dataset.messageId), body = row.querySelector(".chat-message-text");
        if (!m || !body) continue;
        const result = enabled ? lookup(m.text, target) : {text:m.text,translated:false};
        if (body.textContent !== result.text) {body.textContent=result.text;changed=true;}
        body.dir="auto";
        body.title=result.translated?`Original: ${m.text}`:"";
        body.dataset.translated=String(result.translated);
        body.removeAttribute("aria-label");
        body.setAttribute("aria-description", result.translated ? `Translated to ${label()}` : "");
        row.classList.toggle("is-translated",result.translated);
        if(result.translated) translated++;
      }
      if (changed && mode === "full") {
        if(atBottom) list.scrollTop=list.scrollHeight;
        else if(anchor?.isConnected) list.scrollTop+=anchor.getBoundingClientRect().top-offset;
      }
      if(mode === "quick") {
        const rows=[...quick.querySelectorAll(".quick-chat-messages p")], recent=messages.slice(-rows.length);
        rows.forEach((row,i)=>{const body=row.querySelector("span"),m=recent[i];if(body&&m){const text=enabled?lookup(m.text,target).text:m.text;if(body.textContent!==text)body.textContent=text;body.dir="auto";}});
      }
      return {enabled,target,name:label(),translated};
    }
    function setLanguage(value) { override=value||"device";target=override==="device"?language():language([override]);updateButton();onChange(); }
    button.addEventListener("click",()=>{enabled=!enabled;updateButton();onChange();});
    window.addEventListener("languagechange",()=>{if(override==="device")setLanguage("device");});
    updateButton();
    return Object.freeze({apply,setLanguage,reset(){enabled=false;updateButton();}});
  }
  return Object.freeze({create,language,lookup,phrases});
})();

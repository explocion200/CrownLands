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
  return Object.freeze({language,lookup,phrases});
})();

/* Eight category emblems drawn in the approved ink, brass and parchment palette. */
(function(){
  const emblems={
    conquest:'<path fill="#a57558" d="M24 20h23l-5 8 5 8H24Z"/><path d="M23 17v32m-4 1h8"/><path fill="#dfc98d" d="m33 23 2 4 4 .5-3 3 .5 4-3.5-2-3.5 2 .5-4-3-3 4-.5Z"/>',
    combat:'<path fill="#ddd8c3" d="m22 19 5 3 17 24-4 3-18-25Zm22 0-5 3-17 24 4 3 18-25Z"/><path stroke="#a88b4f" stroke-width="3" d="m18 38 10 8m8 0 10-8"/><path d="m20 48-3 4m28-4 3 4"/>',
    camps:'<path fill="#d5bd83" d="M16 45 32 21l16 24Z"/><path fill="#a08758" d="m32 21 7 24h-7Z"/><path fill="#655e42" d="m26 45 6-12 5 12Z"/><path d="M32 17v5m-18 24h36"/><path fill="#915448" d="M33 13h11l-4 4h-7Z"/>',
    growth:'<path fill="#b9a174" d="m24 24 18 21-3 4-20-22Z"/><path fill="#c7b998" d="m22 20 6-5 14 12-6 6Z"/><path fill="#877959" d="m36 23 6 4-6 6-5-5Z"/><path d="m17 44 4-9m-2 8-5-3m5 4 6-3"/>',
    strongholds:'<path fill="#cabb93" d="M18 45V24h5v-5h5v5h8v-5h5v5h5v21Z"/><path fill="#958568" d="M40 25h6v20h-6Z"/><path fill="#625a43" d="M28 45V34q4-7 8 0v11Z"/><path d="M19 30h8m10 0h8m-24 8h5m13 0h5M24 25v19m16-19v19"/>',
    crown:'<path fill="#d4bd7b" d="m18 26 9 6 5-14 6 14 9-6-4 19H22Z"/><path fill="#ac8c4c" d="m23 39 20-1-1 7H23Z"/><path d="m25 41 14-.5"/><path fill="#8b4d43" d="m32 33 3 4-3 3-3-3Z"/><circle cx="18" cy="24" r="2" fill="#d8c58c"/><circle cx="32" cy="17" r="2" fill="#d8c58c"/><circle cx="47" cy="24" r="2" fill="#d8c58c"/>',
    clan:'<path fill="#879064" d="M18 21h12v20l-6-4-6 4Z"/><path fill="#a37258" d="M34 24h12v20l-6-4-6 4Z"/><path d="M16 18v31m16-28v28m16-27v26"/><path stroke="#dac995" d="m22 25 4 9m-4 0 4-9m12 2 4 8m-4 0 4-8"/>',
    daily:'<path fill="#e9d7a4" d="M20 21q-4-7 3-7h22q-5 0-5 7v21H22q-5 0-5-5h19q0 5 4 5"/><path d="M24 23h11m-11 5h8m-9 5h7"/><path fill="#956052" d="m34 38-1 13 5-3 3 3-1-13Z"/><circle cx="37" cy="38" r="5" fill="#a16b51"/><path stroke="#e0c791" d="m34 38 2 2 4-4"/>'
  };
  window.achievementBadge=(category)=>`<svg class="category-badge" viewBox="0 0 64 64" fill="none" stroke="#61543c" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path stroke="#828453" d="M23 55C10 49 8 35 12 24m29 31c13-6 15-20 11-31"/><g fill="#969966" stroke-width=".8"><path d="M12 35q-9-4-6-11 8 3 6 11Zm3 11q-10-1-10-8 9-1 10 8Zm7 8q-10 3-12-3 7-4 12 3Z"/><path d="M52 35q9-4 6-11-8 3-6 11Zm-3 11q10-1 10-8-9-1-10 8Zm-7 8q10 3 12-3-7-4-12 3Z"/></g><path fill="#d4c28d" d="m15 15 17-5 17 5-2 24q-2 11-15 19-13-8-15-19Z"/><path fill="#e1d3aa" d="m19 18 13-4 13 4-2 20q-2 9-11 16-9-7-11-16Z"/><path stroke="#baa16d" d="m21 19 10-3m-11 6 1 8m20 11-2 4"/>${emblems[category]||emblems.crown}</svg>`;
})();

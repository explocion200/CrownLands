"use strict";
document.getElementById("reader-login").addEventListener("submit",async event=>{
  event.preventDefault();const button=event.target.querySelector("button");button.disabled=true;
  try{const key=document.getElementById("key").value;document.getElementById("key").value="";
    const response=await fetch("./login",{method:"POST",credentials:"same-origin",headers:{"content-type":"application/json"},body:JSON.stringify({key})});
    if(!response.ok)throw Error("The temporary preview key was not accepted.");location.replace("./?catalog=full");
  }catch(error){document.getElementById("login-status").textContent=error.message;button.disabled=false;}
});

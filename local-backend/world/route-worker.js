"use strict";
const {parentPort,workerData}=require("node:worker_threads");
const {createRouter}=require("./pathfinder");
const router=createRouter(workerData);
parentPort.on("message",({id,from,to})=>{try{parentPort.postMessage({id,result:router.route(from,to)});}catch{parentPort.postMessage({id,result:{status:"unavailable"}});}});

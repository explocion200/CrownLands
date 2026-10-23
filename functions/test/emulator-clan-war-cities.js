"use strict";
const { initializeApp } = require("firebase-admin/app"), { getFirestore } = require("firebase-admin/firestore");
if (!process.env.FIRESTORE_EMULATOR_HOST) throw Error("Emulator only");
initializeApp({ projectId: process.env.GCLOUD_PROJECT || "crown-land-b15e0" });
require("./clan-war-cities-cases")({ db: getFirestore() }).catch(error => { console.error(error); process.exitCode = 1; });
